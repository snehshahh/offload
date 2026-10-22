import type { Metadata } from "next";
import { Header, Footer } from "@/components/Chrome";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Offload handles your Google Drive data: it runs inside your own Google account, stores nothing, and your files never leave Google.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy", title: "Privacy | Offload" },
};

export default function Privacy() {
  return (
    <div className="site">
      <div className="wrap">
        <Header />
        <main className="prose">
          <h1>Privacy</h1>
          <p className="fine">Last updated 22 October 2026</p>

          <h2>What Offload is</h2>
          <p>
            Offload is a Google Apps Script web app. When you open it, it runs under your own Google account with the permissions
            you grant on Google&rsquo;s consent screen. This website only explains the app and links to it; it doesn&rsquo;t ask for
            any Google access itself.
          </p>

          <h2>What it accesses</h2>
          <p>
            Offload asks for access to your Google Drive so it can list your folders and files, show their sizes and your storage
            use, and create or accept the ownership transfers you choose. It also reads your email address to show which account
            you&rsquo;re signed in with.
          </p>

          <h2>What it stores</h2>
          <p>
            Nothing. Offload has no database and no server of its own. File names, sizes and contents stay inside Google. The
            developer can&rsquo;t see your files or your account.
          </p>

          <h2>What it changes</h2>
          <p>
            Only what you ask for. In the sending account, it adds the receiving account as an editor with a pending ownership
            request on the files you pick. In the receiving account, it accepts those requests and files loose items into a folder
            named after the sender. It emails the receiving account only if you tick that option.
          </p>

          <h2>Removing access</h2>
          <p>
            You can remove Offload&rsquo;s access at any time from your Google Account, under Security, then Third-party apps with
            account access.
          </p>

          <h2>Use of Google user data</h2>
          <p>
            Offload&rsquo;s use of information received from Google APIs follows the Google API Services User Data Policy,
            including the Limited Use requirements.
          </p>
        </main>
        <Footer />
      </div>
    </div>
  );
}
