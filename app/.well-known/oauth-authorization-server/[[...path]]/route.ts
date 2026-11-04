import { json, origin, preflight } from "@/lib/mcp/oauth";

/** RFC 8414 metadata for Offload's authorization server. */
export function GET(req: Request) {
  const base = origin(req);
  return json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["drive"],
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${base}/`,
    },
    200,
    { "cache-control": "public, max-age=3600" }
  );
}

export const OPTIONS = preflight;
