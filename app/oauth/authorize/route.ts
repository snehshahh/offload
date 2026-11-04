import { googleAuthUrl } from "@/lib/mcp/google";
import { backToClient, esc, FLOW_TTL, googleRedirect, page, MAX_ACCOUNTS } from "@/lib/mcp/oauth";
import type { Client, Flow, Pending } from "@/lib/mcp/oauth";
import { open, seal } from "@/lib/mcp/seal";

/** Start of the connect flow: check the client's request, then explain the two sign-ins. */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") || "";
  const client = open<Client>("client", clientId);
  if (!client) {
    return page({ title: "This link isn't valid", body: "<p>Start again from Claude: remove the Offload connector and add it again.</p>" });
  }
  const redirect = q.get("redirect_uri") || (client.r.length === 1 ? client.r[0] : "");
  if (!client.r.includes(redirect)) {
    return page({ title: "This link isn't valid", body: "<p>The app that sent you here didn't register this return address.</p>" });
  }
  const pending: Pending = { cid: clientId, r: redirect, s: q.get("state") || undefined, cc: q.get("code_challenge") || "" };
  if (q.get("response_type") !== "code") {
    return backToClient(pending, { error: "unsupported_response_type", error_description: "Only response_type=code is supported." });
  }
  if (!pending.cc || q.get("code_challenge_method") !== "S256") {
    return backToClient(pending, { error: "invalid_request", error_description: "PKCE with S256 is required." });
  }

  const state = seal("flow", { p: pending, accts: [] } satisfies Flow, FLOW_TTL);
  const app = client.n ? esc(client.n) : "Claude";
  return page({
    step: "Step 1",
    title: "Sign in with the account that's running out of space",
    body:
      `<p>${app} will be able to move Google Drive files between your Google accounts, by handing over ownership.</p>` +
      "<p>First, choose the account you want to <strong>free up</strong>: your main account. Next you'll add the accounts that " +
      `<strong>receive</strong> files, from one up to ${MAX_ACCOUNTS - 1} more.</p>` +
      '<p class="fine">Google may say the app isn\'t verified. Choose Advanced, then Go to Offload. Nothing is stored on Offload\'s servers: ' +
      "your sign-in is sealed into the connection Claude keeps, and you can remove it any time at myaccount.google.com/permissions.</p>",
    button: { href: googleAuthUrl(googleRedirect(req), state), label: "Choose the account to free up" },
  });
}
