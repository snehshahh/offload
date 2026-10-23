import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Chrome";
import { POSTS, TOPICS, formatDate, readingMinutes } from "@/lib/posts";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog: Google storage, Drive, Gmail and Photos guides",
  description:
    "Free guides to fixing a full Google account: moving Drive files between accounts, finding large files, cleaning up Gmail in bulk, Gmail labels and copying Google Photos.",
  alternates: { canonical: "/blog" },
  openGraph: { url: "/blog", title: `Blog | ${SITE_NAME}` },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${SITE_URL}/blog#blog`,
  url: `${SITE_URL}/blog`,
  name: `${SITE_NAME} blog`,
  blogPost: POSTS.map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    url: `${SITE_URL}/blog/${p.slug}`,
    datePublished: p.date,
  })),
};

export default function Blog() {
  return (
    <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="wrap">
        <Header />
        <main className="blog">
          <header className="blog-head">
            <p className="kicker">Blog</p>
            <h1>Guides to a less full Google account</h1>
            <p className="lede">
              How to free up Google storage, move Drive files and photos between accounts, and clean up Gmail in bulk.
            </p>
          </header>
          {TOPICS.map((topic) => {
            const posts = POSTS.filter((p) => p.topic === topic);
            if (!posts.length) return null;
            return (
              <section key={topic} className="block" aria-labelledby={`topic-${topic}`}>
                <h2 id={`topic-${topic}`}>{topic === "Storage" ? "Google storage" : topic === "Photos" ? "Google Photos" : topic}</h2>
                <div className="post-grid">
                  {posts.map((p) => (
                    <Link key={p.slug} href={`/blog/${p.slug}`} className="post-card">
                      <h3>{p.title}</h3>
                      <p>{p.description}</p>
                      <span className="post-meta">
                        {formatDate(p.date)} · {readingMinutes(p)} min read
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </main>
        <Footer />
      </div>
    </div>
  );
}
