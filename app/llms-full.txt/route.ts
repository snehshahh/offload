import { llmsFullTxt } from "@/lib/llms";

/** Served at /llms-full.txt for AI assistants and AI search. Rebuilt on every deploy. */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
