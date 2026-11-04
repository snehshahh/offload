import { createHash } from "node:crypto";
import type { Account } from "./google";

/**
 * The connector is its own OAuth 2.1 authorization server, as the MCP spec asks: Claude registers
 * (dynamic client registration), sends the person here to sign in, and gets tokens back. Signing in means
 * linking 2 to 5 Google accounts, one after the other; the first is the person's main account. Nothing is stored: every value below is sealed (see seal.ts).
 */

/** Most Google accounts one connection can link (the first is the main account). */
export const MAX_ACCOUNTS = 5;
export const ACCESS_TTL = 60 * 60; // 1 hour
export const CODE_TTL = 5 * 60;
export const FLOW_TTL = 30 * 60;

/** Sealed as "client": what a registered client may use. */
export type Client = { r: string[]; n?: string };
/** The client request being served while the person signs in. */
export type Pending = { cid: string; r: string; s?: string; cc: string };
/** Sealed as "flow": Google's state parameter. Holds the accounts linked so far, main first. */
export type Flow = { p: Pending; accts: Account[] };
/**
 * Sealed as "code", "access" and "refresh". `accts` are the linked accounts, main first.
 * Connections made before more than two accounts were supported carry `a` and `b` instead.
 */
export type Grant = { cid: string; accts?: Account[]; a?: Account; b?: Account };
export type CodeGrant = Grant & { r: string; cc: string };

export function linkedAccounts(g: Grant): Account[] {
  if (g.accts?.length) return g.accts;
  return [g.a, g.b].filter((x): x is Account => !!x);
}

export function origin(req: Request): string {
  const env = process.env.MCP_PUBLIC_URL;
  if (env) return env.replace(/\/$/, "");
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function googleRedirect(req: Request): string {
  return `${origin(req)}/oauth/callback`;
}

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra },
  });
}

export function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** Registered redirect URIs must be https, or http on this machine for local clients. */
export function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Sends the person back to the client with these query parameters. */
export function backToClient(p: Pending, params: Record<string, string>, iss?: string) {
  const url = new URL(p.r);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (p.s) url.searchParams.set("state", p.s);
  if (iss) url.searchParams.set("iss", iss);
  return Response.redirect(url.toString(), 302);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A small page for the sign-in steps. `body` is trusted HTML; use esc() for anything else. */
type Button = { href: string; label: string; alt?: boolean };

export function page(o: { step?: string; title: string; body: string; button?: Button; buttons?: Button[] }) {
  const buttons = o.buttons || (o.button ? [o.button] : []);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(o.title)} · Offload</title>
<style>
  :root { --bg:#EEF1F4; --card:#FFFFFF; --text:#1D2A33; --muted:#6B7A86; --line:#DCE2E7; --accent:#2F6F62; --accent-text:#FFFFFF; --ok:#2F6F62; --bad:#B4413A; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111A1F; --card:#18242B; --text:#E8EEF1; --muted:#9AA9B3; --line:#2A3943; --accent:#8FC4B6; --accent-text:#0F2722; --ok:#8FC4B6; --bad:#F0A29C; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px 16px; background:var(--bg); color:var(--text);
         font:16px/1.55 "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { width:100%; max-width:440px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:650; margin-bottom:20px; }
  .brand img { width:28px; height:28px; border-radius:7px; }
  .step { color:var(--muted); font-size:13px; font-weight:600; letter-spacing:.02em; text-transform:uppercase; margin:0 0 6px; }
  h1 { font-size:22px; line-height:1.25; margin:0 0 12px; }
  p { margin:0 0 12px; color:var(--muted); }
  p strong { color:var(--text); }
  .ok { color:var(--ok); } .bad { color:var(--bad); }
  a.btn { display:block; text-align:center; margin-top:20px; padding:12px 16px; border-radius:10px; background:var(--accent); color:var(--accent-text);
          text-decoration:none; font-weight:600; }
  a.btn:focus-visible { outline:3px solid var(--text); outline-offset:2px; }
  a.btn.alt { background:transparent; color:var(--accent); border:1.5px solid var(--accent); margin-top:10px; }
  a.btn + a.btn { margin-top:10px; }
  ul.accts { list-style:none; margin:4px 0 12px; padding:0; border:1px solid var(--line); border-radius:12px; }
  ul.accts li { padding:10px 14px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  ul.accts li + li { border-top:1px solid var(--line); }
  ul.accts .tag { color:var(--muted); font-size:13px; }
  .fine { font-size:13px; margin-top:16px; }
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/icon.svg" alt="">Offload for Claude</div>
  ${o.step ? `<p class="step">${esc(o.step)}</p>` : ""}
  <h1>${esc(o.title)}</h1>
  ${o.body}
  ${buttons.map((b) => `<a class="btn${b.alt ? " alt" : ""}" href="${esc(b.href)}">${esc(b.label)}</a>`).join("\n  ")}
</main>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" },
  });
}

export { esc };
