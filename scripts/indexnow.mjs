// Runs after `next build` (npm "postbuild"). On a Vercel production build it sends every URL in the
// built sitemap to IndexNow, which shares them with Bing, Yandex, Seznam, Naver and others, so new
// and changed pages are indexed without anyone submitting them by hand. Google reads the sitemap
// itself, through /robots.txt and Search Console.
//
// It never fails the build: any problem is logged and skipped.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function main() {
  if (process.env.VERCEL_ENV !== "production" && process.env.INDEXNOW !== "1") {
    console.log("[indexnow] skipped: not a production build");
    return;
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const site = explicit || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (!site) {
    console.log("[indexnow] skipped: no site address (set NEXT_PUBLIC_SITE_URL)");
    return;
  }
  const host = new URL(site).host;

  // The key is the name of the 32-character hex .txt file in public/, which also holds the key.
  const keyFile = (await readdir(path.join(root, "public"))).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
  if (!keyFile) {
    console.log("[indexnow] skipped: no key file in public/");
    return;
  }
  const key = keyFile.replace(/\.txt$/, "");

  const xml = await readFile(path.join(root, ".next/server/app/sitemap.xml.body"), "utf8");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => {
      try {
        return new URL(u).host === host;
      } catch {
        return false;
      }
    });
  if (urls.length === 0) {
    console.log(`[indexnow] skipped: no ${host} URLs in the sitemap`);
    return;
  }

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${site}/${keyFile}`, urlList: urls }),
    signal: AbortSignal.timeout(15000),
  });
  console.log(`[indexnow] sent ${urls.length} URLs for ${host}: HTTP ${res.status}`);
}

main().catch((err) => console.log(`[indexnow] skipped: ${err?.message || err}`));
