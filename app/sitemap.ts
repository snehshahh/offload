import type { MetadataRoute } from "next";
import { PAGE_UPDATED, SITE_URL } from "@/lib/site";
import { POSTS, lastChanged } from "@/lib/posts";

/**
 * /sitemap.xml, linked from /robots.txt. Every public page is listed here, and each blog post is
 * picked up from POSTS automatically, so a new post is in the sitemap as soon as it's deployed.
 * After each production build, scripts/indexnow.mjs sends these URLs to IndexNow (Bing and others).
 * Pages kept out of search (/app, /mcp, /oauth) are left out on purpose.
 *
 * lastmod is the date a page's content really changed (PAGE_UPDATED, and each post's updated or
 * published date), never the build time: Google stops trusting lastmod on sites where it always moves.
 * Google ignores changefreq and priority, so they're left out.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = [...POSTS].sort((a, b) => lastChanged(b).localeCompare(lastChanged(a)));
  const newestPost = posts[0] ? lastChanged(posts[0]) : PAGE_UPDATED.home;
  return [
    { url: `${SITE_URL}/`, lastModified: day(PAGE_UPDATED.home), images: [`${SITE_URL}/og-image.png`] },
    { url: `${SITE_URL}/blog`, lastModified: day(newestPost) },
    ...posts.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: day(lastChanged(p)) })),
    { url: `${SITE_URL}/privacy`, lastModified: day(PAGE_UPDATED.privacy) },
    { url: `${SITE_URL}/terms`, lastModified: day(PAGE_UPDATED.terms) },
  ];
}
