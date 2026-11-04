/**
 * The Google API caller (Drive and Gmail) shared by the Offload web app (in the browser) and the Claude connector
 * (on the server).
 * It only needs a way to get an access token for an account: the server refreshes one with Google, the browser
 * gets one from Google Identity Services. Whichever side runs registers its source with setTokenSource().
 */

const DRIVE = "https://www.googleapis.com/drive/v3";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
/** See only the photos the person picks in Google's picker (source account). */
export const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
/** Add photos to Google Photos, and nothing else (receiving account). */
export const LIBRARY_SCOPE = "https://www.googleapis.com/auth/photoslibrary.appendonly";

const SCOPE_NAMES: Record<string, string> = {
  [DRIVE_SCOPE]: "Google Drive",
  [GMAIL_SCOPE]: "Gmail",
  [PICKER_SCOPE]: "the Google Photos picker",
  [LIBRARY_SCOPE]: "Google Photos",
};
export const scopeName = (s: string) => SCOPE_NAMES[s] || s;

/** A linked Google account: its email, plus a server-side refresh token (empty in the browser). */
export type Account = { e: string; r: string };

/**
 * Returns an access token for `acct` that covers `scope`. `force` means the last one was rejected: get a fresh one.
 * The browser throws ScopeNeededError when the account hasn't granted `scope` yet.
 */
export type TokenSource = (acct: Account, force: boolean, scope: string) => Promise<string>;

/** The account hasn't given Offload this permission yet; the person has to allow it (from a click). */
export class ScopeNeededError extends Error {
  constructor(readonly email: string, readonly scope: string) {
    super(`${email} hasn't allowed Offload to use ${scopeName(scope)} yet.`);
  }
}

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

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Query = Record<string, string | number | boolean | string[] | undefined>;

/**
 * Calls the Drive API as `acct`. Retries rate limits and Google-side errors with backoff.
 * `path` is relative to drive/v3, e.g. "files/ID/permissions".
 */
export function drive<T = any>(acct: Account, method: Method, path: string, query?: Query, body?: object): Promise<T> {
  return call<T>(DRIVE, DRIVE_SCOPE, acct, method, path, query, body);
}

/** Calls the Gmail API as `acct`; `path` is relative to gmail/v1/users/me, e.g. "threads". */
export function gmail<T = any>(acct: Account, method: Method, path: string, query?: Query, body?: object): Promise<T> {
  return call<T>(GMAIL, GMAIL_SCOPE, acct, method, path, query, body);
}

/** Calls any Google JSON API at `base` (e.g. the Photos Picker) as `acct`, with a token that covers `scope`. */
export function callGoogle<T = any>(base: string, scope: string, acct: Account, method: Method, path: string, query?: Query, body?: object): Promise<T> {
  return call<T>(base, scope, acct, method, path, query, body);
}

async function call<T>(base: string, scope: string, acct: Account, method: Method, path: string, query?: Query, body?: object): Promise<T> {
  if (!source) throw new Error("No Google token source is set up.");
  const url = new URL(`${base}/${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  let force = false;
  for (let attempt = 0; ; attempt++) {
    const token = await source(acct, force, scope);
    force = false;
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
    const err = await res.json().catch(() => ({}));
    const reason: string = err?.error?.errors?.[0]?.reason || err?.error?.status || "";
    const message: string = err?.error?.message || `Google API error ${res.status}`;
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
