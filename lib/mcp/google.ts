/** Google sign-in for the Claude connector (server side): OAuth code exchange and refresh-token access. */
import { setTokenSource, type Account } from "@/lib/drive/api";

export type { Account };

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";


/** Thrown when Google no longer accepts an account's refresh token: the connector has to be reconnected. */
export class ReconnectError extends Error {
  constructor(email: string) {
    super(
      `Google signed ${email} out of Offload (access was revoked or expired). ` +
        "Reconnect the Offload connector in Claude's settings (Settings → Connectors) and sign in with your accounts again."
    );
  }
}

function client() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.");
  return { id, secret };
}

export function googleAuthUrl(redirectUri: string, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: client().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    // consent: always hand back a refresh token. select_account: let the person pick which account.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH_URL}?${p}`;
}

/** Exchanges the code Google sent back for a refresh token and the account's email. */
export async function googleExchange(code: string, redirectUri: string): Promise<Account> {
  const { id, secret } = client();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.error || `Google sign-in failed (${res.status}).`);
  if (!body.refresh_token) throw new Error("Google didn't return offline access. Try connecting again.");
  const granted = String(body.scope || "").split(" ");
  if (!granted.includes("https://www.googleapis.com/auth/drive")) {
    throw new Error("Offload needs access to Google Drive. Connect again and tick the Google Drive box on Google's screen.");
  }
  const email = emailFromIdToken(body.id_token);
  if (!email) throw new Error("Google didn't share the account's email address.");
  remember(body.refresh_token, body.access_token, body.expires_in);
  return { e: email, r: body.refresh_token };
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Short-lived Google access tokens, kept per warm server instance so each tool call doesn't refresh again.
const accessCache = new Map<string, { token: string; until: number }>();

function remember(refresh: string, access: string, expiresIn: number) {
  if (!access) return;
  accessCache.set(refresh, { token: access, until: Date.now() + (Number(expiresIn) - 120) * 1000 });
  if (accessCache.size > 500) accessCache.delete(accessCache.keys().next().value as string);
}

export async function accessToken(acct: Account, force = false): Promise<string> {
  const hit = accessCache.get(acct.r);
  if (hit && hit.until > Date.now() && !force) return hit.token;
  const { id, secret } = client();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: acct.r, grant_type: "refresh_token" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new ReconnectError(acct.e);
    throw new Error(`Couldn't refresh Google access for ${acct.e}: ${body.error_description || body.error || res.status}`);
  }
  remember(acct.r, body.access_token, body.expires_in);
  return body.access_token;
}

// On the server, Drive calls get their tokens by refreshing the account's refresh token.
setTokenSource(accessToken);
