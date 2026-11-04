import { googleAuthUrl, googleExchange } from "@/lib/mcp/google";
import { backToClient, esc, FLOW_TTL, googleRedirect, origin, page, MAX_ACCOUNTS } from "@/lib/mcp/oauth";
import type { Flow } from "@/lib/mcp/oauth";
import { open, seal } from "@/lib/mcp/seal";

/** Google sends the person back here after each sign-in. Accounts are added one by one, 2 to 5 in all. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const flow = open<Flow>("flow", q.get("state"));
  if (!flow || !Array.isArray(flow.accts)) {
    return page({ title: "This sign-in expired", body: "<p>Go back to your AI app and connect Offload again.</p>" });
  }

  if (q.get("error")) {
    if (q.get("error") === "access_denied" && !flow.accts.length) {
      return backToClient(flow.p, { error: "access_denied", error_description: "Google sign-in was cancelled." }, origin(req));
    }
    // Cancelled an extra account: carry on with the ones already linked.
    return linkedPage(req, flow, flow.accts.length ? "<p>No account was added.</p>" : `<p>${esc(q.get("error") || "")}</p>`);
  }

  let acct;
  try {
    acct = await googleExchange(q.get("code") || "", googleRedirect(req));
  } catch (e) {
    return page({
      title: "Google sign-in didn't work",
      body: `<p class="bad">${esc(e instanceof Error ? e.message : String(e))}</p>`,
      button: { href: googleAuthUrl(googleRedirect(req), seal("flow", flow, FLOW_TTL)), label: "Try again" },
    });
  }

  if (flow.accts.some((x) => x.e === acct.e)) {
    return linkedPage(req, flow, `<p class="bad"><strong>${esc(acct.e)}</strong> is already linked. Choose a different account.</p>`);
  }
  const next: Flow = { p: flow.p, accts: [...flow.accts, acct].slice(0, MAX_ACCOUNTS) };
  return linkedPage(req, next, `<p class="ok">✓ <strong>${esc(acct.e)}</strong> is linked.</p>`);
}

/** Shows the accounts linked so far, with Add another account and, from two accounts on, Finish. */
function linkedPage(req: Request, flow: Flow, message: string) {
  const sealed = seal("flow", flow, FLOW_TTL);
  const add = { href: googleAuthUrl(googleRedirect(req), sealed), label: "Add another account" };
  const n = flow.accts.length;
  const rows = flow.accts
    .map((x, i) => `<li><strong>${esc(x.e)}</strong><span class="tag">${i === 0 ? "main account" : `account ${i + 1}`}</span></li>`)
    .join("");
  const list = n ? `<ul class="accts">${rows}</ul>` : "";

  if (n < 2) {
    return page({
      step: "Step 2",
      title: "Now your other account",
      body:
        message +
        list +
        "<p>Choose your <strong>other</strong> Google account: one that files can move to. It accepts each transfer automatically, " +
        "so you won't have to open it. You can add more after this, up to " + MAX_ACCOUNTS + " in all.</p>",
      button: { ...add, label: "Choose your other account" },
    });
  }

  const finish = { href: `${origin(req)}/oauth/finish?state=${encodeURIComponent(sealed)}`, label: `Finish with ${n} accounts` };
  return page({
    step: n < MAX_ACCOUNTS ? "Almost done" : "All set",
    title: `${n} accounts linked`,
    body:
      message +
      list +
      (n < MAX_ACCOUNTS
        ? `<p>Have another Google account with free space? Add it now (up to ${MAX_ACCOUNTS}), or finish.</p>`
        : `<p>That's the most Offload can link (${MAX_ACCOUNTS}).</p>`),
    buttons: n < MAX_ACCOUNTS ? [finish, { ...add, alt: true }] : [finish],
  });
}
