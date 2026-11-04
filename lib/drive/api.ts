/**
 * The Drive API caller shared by the Offload web app (in the browser) and the Claude connector (on the server).
 * It only needs a way to get an access token for an account: the server refreshes one with Google, the browser
 * gets one from Google Identity Services. Whichever side runs registers its source with setTokenSource().
 */

const DRIVE = "https://www.googleapis.com/drive/v3";

/** A linked Google account: its email, plus a server-side refresh token (empty in the browser). */
export type Account = { e: string; r: string };

/** Returns an access token for `acct`. `force` means the last one was rejected: get a fresh one. */
export type TokenSource = (acct: Account, force: boolean) => Promise<string>;

let source: TokenSource | null = null;

export function setTokenSource(fn: TokenSource) {
  source = fn;
}

export class DriveError extends Error {
  constructor(message: string, readonly status: number, readonly reason: string) {
    super(message);
  }
}

const RETRY_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError", "internalError"]);

/**
 * Calls the Drive API as `acct`. Retries rate limits and Google-side errors with backoff.
 * `path` is relative to drive/v3, e.g. "files/ID/permissions".
 */
export async function drive<T = any>(
  acct: Account,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
  body?: object
): Promise<T> {
  if (!source) throw new Error("No Google token source is set up.");
  const url = new URL(`${DRIVE}/${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  let force = false;
  for (let attempt = 0; ; attempt++) {
    const token = await source(acct, force);
    force = false;
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
    const err = await res.json().catch(() => ({}));
    const reason: string = err?.error?.errors?.[0]?.reason || err?.error?.status || "";
    const message: string = err?.error?.message || `Drive API error ${res.status}`;
    if (res.status === 401 && attempt === 0) {
      force = true;
      continue;
    }
    const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && RETRY_REASONS.has(reason));
    if (retryable && attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300));
      continue;
    }
    throw new DriveError(message, res.status, reason);
  }
}
