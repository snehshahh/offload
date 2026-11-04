import { backToClient, CODE_TTL, origin, page } from "@/lib/mcp/oauth";
import type { CodeGrant, Flow } from "@/lib/mcp/oauth";
import { open, seal } from "@/lib/mcp/seal";

/** The person chose Finish: hand the AI app an authorization code for the linked accounts. */
export function GET(req: Request) {
  const flow = open<Flow>("flow", new URL(req.url).searchParams.get("state"));
  if (!flow || !Array.isArray(flow.accts)) {
    return page({ title: "This sign-in expired", body: "<p>Go back to your AI app and connect Offload again.</p>" });
  }
  if (flow.accts.length < 2) {
    return page({ title: "Link one more account", body: "<p>Offload needs at least two accounts. Go back and add your other account.</p>" });
  }
  const code = seal("code", { cid: flow.p.cid, r: flow.p.r, cc: flow.p.cc, accts: flow.accts } satisfies CodeGrant, CODE_TTL);
  return backToClient(flow.p, { code }, origin(req));
}
