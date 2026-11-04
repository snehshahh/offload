import { allowedRedirect, json, oauthError, preflight } from "@/lib/mcp/oauth";
import { seal } from "@/lib/mcp/seal";
import type { Client } from "@/lib/mcp/oauth";

/** RFC 7591 dynamic client registration. The client_id is the sealed registration itself, so nothing is stored. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Send the registration as JSON.");
  const uris: unknown = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string" && allowedRedirect(u))) {
    return oauthError("invalid_redirect_uri", "redirect_uris must be 1 to 10 https URLs (or http on localhost).");
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  const client: Client = { r: uris as string[], ...(name ? { n: name } : {}) };
  return json(
    {
      client_id: seal("client", client),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201
  );
}

export const OPTIONS = preflight;
