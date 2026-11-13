import nodemailer from "nodemailer";

/**
 * Access requests. While the Google consent screen is in Testing, only accounts added as test users can sign in,
 * so the site asks visitors which Gmail addresses they want to use and emails the owner, who adds them by hand.
 *
 * Email is sent through Gmail's SMTP server, from a Gmail account with an App Password: set GMAIL_USER and
 * GMAIL_APP_PASSWORD in Vercel. Requests go to ACCESS_REQUEST_TO, or to GMAIL_USER itself if that isn't set.
 * Every request is also written to the Vercel runtime logs, so none is lost if email isn't set up yet.
 */

const GMAIL_USER = process.env.GMAIL_USER || "";
// Google shows App Passwords in groups of four ("abcd efgh ijkl mnop"); the spaces don't belong to it.
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const TO = process.env.ACCESS_REQUEST_TO || GMAIL_USER;
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;
const MAX_EMAILS = 5;

// A light per-instance limit, so one visitor can't flood the inbox.
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > 5;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });

  let body: { emails?: unknown; website?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "That didn’t look right. Try again." }, { status: 400 });
  }
  // A hidden field people never see; bots fill it in. Pretend it worked.
  if (typeof body.website === "string" && body.website) return Response.json({ ok: true });

  const raw = Array.isArray(body.emails) ? body.emails : [];
  const emails = [...new Set(raw.filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return Response.json({ ok: false, error: "Add the Gmail address you want to sign in with." }, { status: 400 });
  if (emails.length > MAX_EMAILS) return Response.json({ ok: false, error: `Up to ${MAX_EMAILS} addresses at a time.` }, { status: 400 });
  const bad = emails.find((e) => e.length > 254 || !EMAIL.test(e));
  if (bad) return Response.json({ ok: false, error: `“${bad.slice(0, 80)}” isn’t an email address.` }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return Response.json({ ok: false, error: "That’s a lot of requests. Try again in an hour." }, { status: 429 });

  const page = typeof body.page === "string" ? body.page.slice(0, 200) : "";
  const when = new Date().toISOString();
  console.log("[access-request]", JSON.stringify({ emails, page, when }));

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("[access-request] GMAIL_USER or GMAIL_APP_PASSWORD isn’t set, so no email was sent. The request is in this log line.");
    return Response.json({ ok: true });
  }

  const text = [
    `${emails.length === 1 ? "This person has" : "These accounts have"} asked for access to Offload:`,
    "",
    ...emails.map((e) => `  • ${e}`),
    "",
    "Add them as test users in Google Cloud: Google Auth Platform → Audience → Test users → Add users",
    "https://console.cloud.google.com/auth/audience",
    "",
    `Requested: ${when}`,
    page ? `From page: ${page}` : "",
    "",
    "Reply to this email to write back to them.",
  ].join("\n");

  try {
    const mail = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    await mail.sendMail({
      from: { name: "Offload", address: GMAIL_USER },
      to: TO,
      replyTo: emails[0],
      subject: `Offload access request: ${emails.join(", ")}`,
      text,
    });
  } catch (e) {
    console.error("[access-request] Gmail wouldn’t send it:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "Couldn’t send your request just now. Try again in a minute." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
