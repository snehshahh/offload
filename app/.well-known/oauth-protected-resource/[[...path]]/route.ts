import { json, origin, preflight } from "@/lib/mcp/oauth";

/** RFC 9728: tells MCP clients that /mcp is protected and where to sign in. Served at the root and at /mcp. */
export function GET(req: Request) {
  const base = origin(req);
  return json(
    {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
      scopes_supported: ["drive"],
      resource_name: "Offload",
      resource_documentation: `${base}/`,
    },
    200,
    { "cache-control": "public, max-age=3600" }
  );
}

export const OPTIONS = preflight;
