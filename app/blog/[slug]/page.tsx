import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/Chrome";
import { PostBody } from "@/components/RichText";
import { POSTS, formatDate, getPost, readingMinutes } from "@/lib/posts";
import { APP_URL, SITE_NAME, SITE_URL } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: post.title, description: post.description, publishedTime: post.date },
    twitter: { title: post.title, description: post.description },
  };
}

export default async function PostPage({ params }: Props) {
  const post = getPost((await params).slug);
  if (!post) notFound();

  const url = `${SITE_URL}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#post`,
        headline: post.title,
        description: post.description,
        url,
        mainEntityOfPage: url,
        datePublished: post.date,
        dateModified: post.date,
        keywords: post.keywords.join(", "),
        image: `${SITE_URL}/og-image.png`,
        author: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
        publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/`, logo: `${SITE_URL}/icon-512.png` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
    ],
  };

  // Same topic first, then the rest, in the order they're listed.
  const related = [...POSTS.filter((p) => p.topic === post.topic), ...POSTS.filter((p) => p.topic !== post.topic)]
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);

  return (
    <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="wrap">
        <Header />
        <main>
          <article className="prose post">
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/blog">Blog</Link> <span aria-hidden="true">/</span> {post.topic}
            </nav>
            <h1>{post.title}</h1>
            <p className="post-meta">
              {formatDate(post.date)} · {readingMinutes(post)} min read
            </p>
            <p className="post-lede">{post.description}</p>
            <PostBody blocks={post.body} />
          </article>

          <section className="band" aria-labelledby="band-title">
            <div>
              <h2 id="band-title">Free up your Google storage today</h2>
              <p>Move Drive files and photos to your other account, and clean up Gmail in bulk. Free, nothing to install.</p>
            </div>
            <a className="btn btn-light btn-lg" href={APP_URL}>
              Open Offload
            </a>
          </section>

          <section className="block" aria-labelledby="more-title">
            <h2 id="more-title">Keep reading</h2>
            <div className="post-grid">
              {related.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="post-card">
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
