import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CORS, json, origin, preflight } from "@/lib/mcp/oauth";
import type { Grant } from "@/lib/mcp/oauth";
import { open } from "@/lib/mcp/seal";
import { buildServer } from "@/lib/mcp/server";

/** Offload's MCP endpoint (Streamable HTTP, stateless). Add https://<site>/mcp as a custom connector in Claude. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const grant = open<Grant>("access", auth.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (!grant) {
    const metadata = `${origin(req)}/.well-known/oauth-protected-resource/mcp`;
    return json({ error: "invalid_token", error_description: "Connect Offload to get a token." }, 401, {
      "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${metadata}"`,
    });
  }

  const server = buildServer({ a: grant.a, b: grant.b });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
