import { llmsTxt } from "@/lib/llms";

/** Served at /llms.txt for AI assistants and AI search. Rebuilt on every deploy. */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
