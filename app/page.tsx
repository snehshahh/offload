import { Header, Footer } from "@/components/Chrome";
import { HeroDemo } from "@/components/HeroDemo";
import { GmailDemo } from "@/components/GmailDemo";
import { APP_URL, FAQS, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      alternateName: ["Offload Google Drive storage manager", "Offload bulk transfer tool"],
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web browser",
      browserRequirements: "Requires a Google account",
      image: `${SITE_URL}/og-image.png`,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Free Google Drive storage manager",
        "Bulk transfer of Google Drive files to another Google account",
        "Transfer ownership of whole Google Drive folders, including subfolders",
        "Find and move files larger than 100 MB",
        "Move photos and videos stored in Google Drive",
        "Copy Google Photos to another Google account",
        "Bulk delete Gmail emails by category, size, age, sender or subject",
        "Accept all incoming transfers at once",
        "See folder sizes and storage use",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQS.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

const STEPS = [
  {
    title: "Pick what to move",
    body: "Open Offload with the account that’s full. Choose whole folders, your biggest files, or photos and videos. Every folder shows its size, so you know exactly how much you’ll free.",
  },
  {
    title: "Send it to your other account",
    body: "Type the Gmail address you’re moving to and send. Offload asks Google to transfer ownership of every file, subfolders included. No emails flood the other inbox unless you want them.",
  },
  {
    title: "Accept, and the space is yours",
    body: "Open Offload as the receiving account and accept everything in one go. The files now count against that account, and the first one has room to breathe.",
  },
];

const FEATURES = [
  {
    title: "Whole folders",
    body: "Every subfolder and file comes along, with the structure kept exactly as it was.",
    icon: "M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.24 1.65.66L12.2 6H18.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z",
  },
  {
    title: "The space hogs",
    body: "See everything over 100 MB, biggest first, and move the files that take up the most room in one go.",
    icon: "M4 20h16M7 16V9M12 16V4M17 16v-5",
  },
  {
    title: "Photos and videos",
    body: "Browse thumbnails of the images and videos in your Drive, select a whole screen at once, and send.",
    icon: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4.5 6a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM21 15l-5-5L5 19",
  },
  {
    title: "One inbox to accept",
    body: "The receiving account sees everything waiting for it and takes it all with a single click.",
    icon: "M4 13h4l2 3h4l2-3h4M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5l2.5-8Z",
  },
  {
    title: "Gmail cleanup",
    body: "Find old promotions, social updates and emails with big attachments, and move thousands to Trash at once.",
    icon: "M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13",
  },
  {
    title: "Google Photos too",
    body: "Copy the photos you pick into your other account's Google Photos, then delete the originals to free the space.",
    icon: "M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM4 16V5a1 1 0 0 1 1-1h11",
  },
];

export default function Home() {
  return (
    <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="wrap">
        <Header />

        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="kicker">Free Google Drive storage manager</p>
              <h1 id="hero-title">Move Google Drive files to your other account</h1>
              <p className="lede">
                Google storage full? Offload bulk moves your folders, large files and photos to another Google account you
                own, and clears out Gmail in bulk, so you can manage your free storage across both. The space frees up as soon
                as the other account accepts.
              </p>
              <div className="cta">
                <a className="btn btn-main btn-lg" href={APP_URL}>
                  Open Offload
                </a>
                <a className="btn btn-quiet btn-lg" href="#how">
                  See how it works
                </a>
              </div>
              <ul className="assure" aria-label="At a glance">
                <li>Free tool</li>
                <li>Bulk transfer</li>
                <li>Nothing to install</li>
                <li>Files never leave Google</li>
              </ul>
            </div>
            <HeroDemo />
          </section>

          <section id="how" className="block" aria-labelledby="how-title">
            <h2 id="how-title">How it works</h2>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="block" aria-labelledby="what-title">
            <h2 id="what-title">One free tool to manage your Google storage</h2>
            <div className="features">
              {FEATURES.map((f) => (
                <div className="feat" key={f.title}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={f.icon} />
                  </svg>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="gmail" className="block gmail-block" aria-labelledby="gmail-title">
            <div>
              <h2 id="gmail-title">Clean up Gmail in bulk</h2>
              <p className="lede">
                Old promotions, newsletters and emails with big attachments fill the same storage as your Drive. Pick a filter,
                see how many emails match, and move them all to Trash at once instead of a page at a time.
              </p>
              <ul className="trust">
                <li>
                  <h3>Quick filters</h3>
                  <p>Promotions, Social, Updates, bigger than 10 MB, older than a year, or your own words, subject and sender.</p>
                </li>
                <li>
                  <h3>See before you trash</h3>
                  <p>The count and the newest matches update as you type, with a link to the same search in Gmail.</p>
                </li>
                <li>
                  <h3>Safe by default</h3>
                  <p>Starred and important emails are left alone, and everything goes to Trash, where you can restore it for 30 days.</p>
                </li>
              </ul>
            </div>
            <GmailDemo />
          </section>

          <section className="block privacy-block" aria-labelledby="privacy-title">
            <div>
              <h2 id="privacy-title">Your files never leave Google</h2>
              <p className="lede">
                Offload has no server and stores none of your files. For Drive it asks Google to change who owns your files, the
                same thing you could do one file at a time in Drive&rsquo;s share settings, just thousands at once. Gmail cleanup
                and Google Photos copies happen inside Google too.
              </p>
            </div>
            <ul className="trust">
              <li>
                <h3>Runs in your own account</h3>
                <p>Offload is a Google Apps Script app that runs under the Google account you sign in with.</p>
              </li>
              <li>
                <h3>No server, no database</h3>
                <p>There&rsquo;s nowhere for your files to go. The developer can&rsquo;t see your files or your account.</p>
              </li>
              <li>
                <h3>Revoke access any time</h3>
                <p>Remove Offload from your Google Account&rsquo;s third-party access settings whenever you like.</p>
              </li>
            </ul>
          </section>

          <section id="faq" className="block faq-block" aria-labelledby="faq-title">
            <div className="faq-side">
              <h2 id="faq-title">Questions</h2>
              <p>Everything people ask before moving their files. Still unsure? Try it on one small folder first.</p>
              <a className="btn btn-main" href={APP_URL}>
                Open Offload
              </a>
            </div>
            <div className="faq">
              {FAQS.map(({ q, a }) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="band" aria-labelledby="band-title">
            <div>
              <h2 id="band-title">Free up your Google storage today</h2>
              <p>A free bulk storage manager for your Google accounts. A few clicks, and the &ldquo;storage full&rdquo; warning is gone.</p>
            </div>
            <a className="btn btn-light btn-lg" href={APP_URL}>
              Open Offload
            </a>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
