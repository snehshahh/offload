import { relayChunk, type RelayRequest } from "@/lib/photos/relay";

/** Copies one piece of one picked photo from one Google account's Photos to another's. See lib/photos/relay.ts. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  // Only this site's own pages may use the relay.
  if (origin && host && new URL(origin).host !== host) return Response.json({ ok: false, status: 403, side: "request", error: "Not allowed." }, { status: 403 });
  let body: RelayRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, status: 400, side: "request", error: "Send the request as JSON." }, { status: 400 });
  }
  try {
    const res = await relayChunk(body);
    return Response.json(res, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, status: 502, side: "request", error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
