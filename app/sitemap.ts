import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { POSTS } from "@/lib/posts";

/**
 * /sitemap.xml, linked from /robots.txt. Every public page is listed here, and each blog post is
 * picked up from POSTS automatically, so a new post is in the sitemap as soon as it's deployed.
 * After each production build, scripts/indexnow.mjs sends these URLs to IndexNow (Bing and others).
 * Pages kept out of search (/app, /mcp, /oauth) are left out on purpose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const image = `${SITE_URL}/og-image.png`;
  const newestPost = POSTS.reduce((latest, p) => Math.max(latest, new Date(p.date).getTime()), 0);
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1, images: [image] },
    {
      url: `${SITE_URL}/blog`,
      lastModified: newestPost ? new Date(newestPost) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...[...POSTS]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        url: `${SITE_URL}/blog/${p.slug}`,
        lastModified: new Date(p.date),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
