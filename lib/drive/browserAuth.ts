/**
 * Google sign-in for the Offload web app, entirely in the browser (Google Identity Services token flow).
 * Access tokens stay in this browser: in memory, plus localStorage, so reloads, new tabs and later visits keep the
 * accounts signed in (tabs share fresh tokens with each other). They are never sent anywhere except Google. Each lasts
 * about an hour; once one runs out, calls for that account wait until the person clicks Continue (Google's window may
 * only open on a click), then carry on. Sign out removes an account from this browser.
 */
import { DRIVE_SCOPE, GMAIL_SCOPE, LIBRARY_SCOPE, PICKER_SCOPE, ScopeNeededError, scopeName, setTokenSource, type Account } from "./api";

const KNOWN_SCOPES = [DRIVE_SCOPE, GMAIL_SCOPE, PICKER_SCOPE, LIBRARY_SCOPE];

const GIS_SRC = "https://accounts.google.com/gsi/client";
const KEY = "offload.tokens.v2";
const OLD_KEY = "offload.tokens.v1"; // per-tab sessionStorage, before sign-ins lasted across tabs

/** s: the permissions (scopes) this token covers, space-separated. */
type Tok = { e: string; token: string; until: number; s?: string };
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
    localStorage.setItem(KEY, JSON.stringify([...tokens.values()]));
  } catch {
    /* storage blocked: sign-ins just won't survive a reload */
  }
}

function read(): Tok[] {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      raw = sessionStorage.getItem(OLD_KEY); // carry over sign-ins from before
      if (raw) {
        localStorage.setItem(KEY, raw);
        sessionStorage.removeItem(OLD_KEY);
      }
    }
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter((t: Tok) => t && t.e && t.token) : [];
  } catch {
    return [];
  }
}

/** Another tab signed in, refreshed access or signed out: use its fresher tokens here too. */
function syncFromOtherTab() {
  const saved = new Map(read().map((t) => [t.e, t]));
  for (const [e, t] of saved) {
    const mine = tokens.get(e);
    if (!mine || t.until > mine.until) {
      tokens.set(e, t);
      if (t.until > Date.now()) {
        const d = waiting.get(e);
        waiting.delete(e);
        d?.resolve(t.token);
      }
    }
  }
  for (const e of [...tokens.keys()]) if (!saved.has(e)) tokens.delete(e);
  onWaiting?.([...waiting.keys()]);
}

/** Sets up the client ID and makes Google calls use this browser's tokens. Returns the accounts signed in earlier. */
export function initBrowserAuth(id: string): Account[] {
  clientId = id;
  setTokenSource(source);
  tokens.clear();
  for (const t of read()) tokens.set(t.e, t);
  window.addEventListener("storage", (ev) => {
    if (ev.key === KEY) syncFromOtherTab();
  });
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

/** Opens Google's window and resolves with an access token covering `scopes`. Must start from a click. */
async function ask(hint: string | undefined, prompt: "" | "select_account" | "consent", scopes: string[] = [DRIVE_SCOPE]): Promise<{ token: string; expiresIn: number; scope: string }> {
  if (!clientId) throw new Error("Offload isn't set up yet: GOOGLE_CLIENT_ID is missing.");
  await loadGis();
  return new Promise((resolve, reject) => {
    const oauth2 = window.google.accounts.oauth2;
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(" "),
      include_granted_scopes: true,
      prompt,
      ...(hint ? { login_hint: hint } : {}),
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        const missing = scopes.filter((sc) => !oauth2.hasGrantedAllScopes(resp, sc));
        if (missing.length) {
          const what = scopeName(missing.includes(DRIVE_SCOPE) ? DRIVE_SCOPE : missing[0]);
          return reject(new Error(`Offload needs access to ${what}. Try again and tick the ${what} box on Google's screen.`));
        }
        resolve({ token: resp.access_token, expiresIn: Number(resp.expires_in) || 3600, scope: String(resp.scope || scopes.join(" ")) });
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

function keep(e: string, token: string, expiresIn: number, scope: string) {
  tokens.set(e, { e, token, until: Date.now() + Math.max(60, expiresIn - 60) * 1000, s: scope });
  save();
}

function scopesOf(e: string): string[] {
  const granted = (tokens.get(e)?.s || DRIVE_SCOPE).split(" ");
  return [DRIVE_SCOPE, ...KNOWN_SCOPES.filter((sc) => sc !== DRIVE_SCOPE && granted.includes(sc))];
}

/** Whether this account has given Offload this permission (in this browser). */
export function hasScope(e: string, scope: string): boolean {
  return scopesOf(e).includes(scope);
}

/** Asks Google for one more permission for this account, keeping the ones it has. Call from a click. */
export async function allowScope(e: string, scope: string) {
  const { token, expiresIn, scope: got } = await ask(e, "", [...new Set([...scopesOf(e), scope])]);
  keep(e, token, expiresIn, got);
}

export const hasGmail = (e: string) => hasScope(e, GMAIL_SCOPE);
export const allowGmail = (e: string) => allowScope(e, GMAIL_SCOPE);

/** An access token for `acct` covering `scope` (waits for Continue if it has run out). `force` = the last one was rejected. */
export function tokenFor(acct: Account, scope: string, force = false): Promise<string> {
  return source(acct, force, scope);
}

/** Signs in one more Google account (Google shows its account chooser). Call from a click. */
export async function signIn(): Promise<Account> {
  const { token, expiresIn, scope } = await ask(undefined, "select_account");
  const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  const e = String(body?.user?.emailAddress || "").toLowerCase();
  if (!res.ok || !e) throw new Error(body?.error?.message || "Google didn't say which account that was. Try again.");
  keep(e, token, expiresIn, scope);
  return { e, r: "" };
}

/** Gets a fresh token for an account whose calls are waiting, then lets them carry on. Call from a click. */
export async function reauth(e: string) {
  const { token, expiresIn, scope } = await ask(e, "", scopesOf(e));
  keep(e, token, expiresIn, scope);
  const d = waiting.get(e);
  waiting.delete(e);
  d?.resolve(token);
  onWaiting?.([...waiting.keys()]);
}

/** Forgets an account in this browser and asks Google to drop its token. */
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

async function source(acct: Account, force: boolean, scope: string): Promise<string> {
  if (!scopesOf(acct.e).includes(scope)) throw new ScopeNeededError(acct.e, scope);
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
