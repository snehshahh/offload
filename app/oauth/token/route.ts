import { ACCESS_TTL, json, linkedAccounts, oauthError, pkceMatches, preflight } from "@/lib/mcp/oauth";
import type { CodeGrant, Grant } from "@/lib/mcp/oauth";
import { open, seal } from "@/lib/mcp/seal";

/** Token endpoint: swaps an authorization code or a refresh token for an access token. */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") || "";
  let params: URLSearchParams;
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  } else {
    params = new URLSearchParams(await req.text());
  }
  const clientId = params.get("client_id");

  if (params.get("grant_type") === "authorization_code") {
    const code = open<CodeGrant>("code", params.get("code"));
    if (!code) return oauthError("invalid_grant", "The authorization code is invalid or expired.");
    if (clientId && clientId !== code.cid) return oauthError("invalid_grant", "The code was issued to another client.");
    if (params.has("redirect_uri") && params.get("redirect_uri") !== code.r) {
      return oauthError("invalid_grant", "redirect_uri doesn't match.");
    }
    if (!pkceMatches(params.get("code_verifier") || "", code.cc)) return oauthError("invalid_grant", "PKCE verification failed.");
    return tokens(code);
  }

  if (params.get("grant_type") === "refresh_token") {
    const grant = open<Grant>("refresh", params.get("refresh_token"));
    if (!grant) return oauthError("invalid_grant", "The refresh token is invalid.");
    if (clientId && clientId !== grant.cid) return oauthError("invalid_grant", "The refresh token was issued to another client.");
    return tokens(grant);
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

function tokens(g: Grant) {
  const grant: Grant = { cid: g.cid, accts: linkedAccounts(g) };
  return json({
    access_token: seal("access", grant, ACCESS_TTL),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: seal("refresh", grant),
    scope: "drive",
  });
}

export const OPTIONS = preflight;
