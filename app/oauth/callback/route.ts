import { googleAuthUrl, googleExchange } from "@/lib/mcp/google";
import { backToClient, CODE_TTL, esc, FLOW_TTL, googleRedirect, origin, page } from "@/lib/mcp/oauth";
import type { CodeGrant, Flow } from "@/lib/mcp/oauth";
import { open, seal } from "@/lib/mcp/seal";

/** Google sends the person back here after each of the two sign-ins. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const flow = open<Flow>("flow", q.get("state"));
  if (!flow) {
    return page({ title: "This sign-in expired", body: "<p>Go back to Claude and connect Offload again.</p>" });
  }
  const step = flow.a ? 2 : 1;

  if (q.get("error")) {
    if (q.get("error") === "access_denied") {
      return backToClient(flow.p, { error: "access_denied", error_description: "Google sign-in was cancelled." }, origin(req));
    }
    return page({ title: "Google sign-in didn't work", body: `<p>${esc(q.get("error") || "")}</p>`, button: retry(req, flow) });
  }

  let acct;
  try {
    acct = await googleExchange(q.get("code") || "", googleRedirect(req));
  } catch (e) {
    return page({
      step: `Step ${step} of 2`,
      title: "Google sign-in didn't work",
      body: `<p class="bad">${esc(e instanceof Error ? e.message : String(e))}</p>`,
      button: retry(req, flow),
    });
  }

  if (!flow.a) {
    const next = seal("flow", { p: flow.p, a: acct } satisfies Flow, FLOW_TTL);
    return page({
      step: "Step 2 of 2",
      title: "Now the account that receives the files",
      body:
        `<p class="ok">✓ <strong>${esc(acct.e)}</strong> is linked.</p>` +
        "<p>Choose your <strong>other</strong> Google account: the one files will move to. It accepts each transfer automatically, so you won't have to open it.</p>",
      button: { href: googleAuthUrl(googleRedirect(req), next), label: "Choose the receiving account" },
    });
  }

  if (acct.e === flow.a.e) {
    return page({
      step: "Step 2 of 2",
      title: "That's the same account",
      body: `<p>You picked <strong>${esc(acct.e)}</strong> again. Choose your other Google account, the one that receives the files.</p>`,
      button: retry(req, flow),
    });
  }

  const code = seal("code", { cid: flow.p.cid, r: flow.p.r, cc: flow.p.cc, a: flow.a, b: acct } satisfies CodeGrant, CODE_TTL);
  return backToClient(flow.p, { code }, origin(req));
}

function retry(req: Request, flow: Flow) {
  const again = seal("flow", flow, FLOW_TTL);
  return { href: googleAuthUrl(googleRedirect(req), again), label: flow.a ? "Choose the receiving account" : "Try again" };
}
