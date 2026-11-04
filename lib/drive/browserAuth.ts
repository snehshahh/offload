/**
 * Google sign-in for the Offload web app, entirely in the browser (Google Identity Services token flow).
 * Access tokens stay in this tab: in memory, plus sessionStorage so a reload doesn't sign you out. They are never
 * sent anywhere except Google. They last about an hour; when one runs out mid-job, Drive calls for that account wait
 * until the person clicks Continue (Google's window may only open on a click), then carry on.
 */
import { setTokenSource, type Account } from "./api";

const SCOPE = "https://www.googleapis.com/auth/drive";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const KEY = "offload.tokens.v1";

type Tok = { e: string; token: string; until: number };
type Deferred = { promise: Promise<string>; resolve: (t: string) => void; reject: (e: Error) => void };

declare global {
  interface Window {
    google?: any;
  }
}

let clientId = "";
let gis: Promise<void> | null = null;
const tokens = new Map<string, Tok>();
const waiting = new Map<string, Deferred>();
let onWaiting: ((emails: string[]) => void) | null = null;

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...tokens.values()]));
  } catch {
    /* private mode: tokens just won't survive a reload */
  }
}

/** Sets up the client ID and makes Drive calls use this tab's tokens. Returns accounts signed in earlier in this tab. */
export function initBrowserAuth(id: string): Account[] {
  clientId = id;
  setTokenSource(source);
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "[]") as Tok[];
    for (const t of saved) if (t && t.e && t.token) tokens.set(t.e, t);
  } catch {
    /* nothing saved */
  }
  return [...tokens.keys()].map((e) => ({ e, r: "" }));
}

/** Called with the accounts that need a click on Continue before their Drive calls can go on. */
export function onReauthNeeded(fn: (emails: string[]) => void) {
  onWaiting = fn;
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gis) {
    gis = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gis = null;
        reject(new Error("Couldn't load Google sign-in. Check your connection, or allow accounts.google.com if an ad blocker is on."));
      };
      document.head.appendChild(s);
    });
  }
  return gis;
}

/** Opens Google's window and resolves with a Drive access token. Must start from a click. */
async function ask(hint: string | undefined, prompt: "" | "select_account" | "consent"): Promise<{ token: string; expiresIn: number }> {
  if (!clientId) throw new Error("Offload isn't set up yet: GOOGLE_CLIENT_ID is missing.");
  await loadGis();
  return new Promise((resolve, reject) => {
    const oauth2 = window.google.accounts.oauth2;
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt,
      ...(hint ? { login_hint: hint } : {}),
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        if (!oauth2.hasGrantedAllScopes(resp, SCOPE)) {
          return reject(new Error("Offload needs access to Google Drive. Try again and tick the Google Drive box on Google's screen."));
        }
        resolve({ token: resp.access_token, expiresIn: Number(resp.expires_in) || 3600 });
      },
      error_callback: (err: any) => {
        const type = err?.type || "";
        reject(
          new Error(
            type === "popup_closed"
              ? "The Google window was closed before you finished."
              : type === "popup_failed_to_open"
                ? "Your browser blocked Google's sign-in window. Allow pop-ups for this site, then try again."
                : err?.message || "Google sign-in didn't work."
          )
        );
      },
    });
    client.requestAccessToken();
  });
}

function keep(e: string, token: string, expiresIn: number) {
  tokens.set(e, { e, token, until: Date.now() + Math.max(60, expiresIn - 60) * 1000 });
  save();
}

/** Signs in one more Google account (Google shows its account chooser). Call from a click. */
export async function signIn(): Promise<Account> {
  const { token, expiresIn } = await ask(undefined, "select_account");
  const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  const e = String(body?.user?.emailAddress || "").toLowerCase();
  if (!res.ok || !e) throw new Error(body?.error?.message || "Google didn't say which account that was. Try again.");
  keep(e, token, expiresIn);
  return { e, r: "" };
}

/** Gets a fresh token for an account whose calls are waiting, then lets them carry on. Call from a click. */
export async function reauth(e: string) {
  const { token, expiresIn } = await ask(e, "");
  keep(e, token, expiresIn);
  const d = waiting.get(e);
  waiting.delete(e);
  d?.resolve(token);
  onWaiting?.([...waiting.keys()]);
}

/** Forgets an account in this tab and asks Google to drop its token. */
export function signOut(e: string) {
  const t = tokens.get(e);
  tokens.delete(e);
  save();
  const d = waiting.get(e);
  waiting.delete(e);
  d?.reject(new Error(`${e} was signed out.`));
  onWaiting?.([...waiting.keys()]);
  try {
    if (t) window.google?.accounts?.oauth2?.revoke(t.token, () => {});
  } catch {
    /* the token expires within the hour anyway */
  }
}

async function source(acct: Account, force: boolean): Promise<string> {
  const t = tokens.get(acct.e);
  if (t && !force && t.until > Date.now()) return t.token;
  let d = waiting.get(acct.e);
  if (!d) {
    let resolve!: (t: string) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    d = { promise, resolve, reject };
    waiting.set(acct.e, d);
    onWaiting?.([...waiting.keys()]);
  }
  return d.promise;
}
