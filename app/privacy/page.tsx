import type { Metadata } from "next";
import { Header, Footer } from "@/components/Chrome";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Offload handles your Google Drive, Gmail and Google Photos data: it runs in your browser, keeps no database, and only photo copies pass through its server, unstored.",
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
          <p className="fine">Last updated 4 November 2026</p>

          <h2>What Offload is</h2>
          <p>
            Offload is a web app at /app on this website. It runs in your browser: when you sign in, Google gives your browser tab
            short-lived access to the accounts you sign in with (up to five), with the permissions you approve on Google&rsquo;s
            screens, and the page talks to Google directly. Offload also works as a connector in Claude: see Offload for Claude
            below.
          </p>

          <h2>What it accesses</h2>
          <p>
            <b>Google Drive</b>, so it can list your folders and files, show their sizes and your storage use, and transfer the
            ones you choose from one of your accounts to another. It also reads each account&rsquo;s email address, to show which
            account is which.
          </p>
          <p>
            <b>Gmail</b>, only if you open Gmail cleanup, and only for the accounts you choose. It uses Google&rsquo;s gmail.modify
            permission, which lets it search your mail and move conversations to Trash but not delete anything for good. To show
            what a search found, it reads only the subject, sender and date of the newest 20 matches. It never reads, keeps or
            sends what your emails say.
          </p>
          <p>
            <b>Google Photos</b>, only if you copy photos: in the account you copy from, Google&rsquo;s picker shows Offload just
            the photos and videos you select there; in the account you copy to, it can add photos, and can&rsquo;t see or change
            anything already in that account.
          </p>

          <h2>What it stores</h2>
          <p>
            Offload has no database. Your files, their names and your storage figures aren&rsquo;t kept anywhere, and the developer
            can&rsquo;t see your files, your photos, your mail or your accounts.
          </p>
          <p>
            In your browser, the tab keeps its Google sign-ins in memory and in the tab&rsquo;s session storage, so a reload
            doesn&rsquo;t sign you out; they&rsquo;re only ever sent to Google, and closing the tab, choosing Sign out, or waiting
            about an hour ends them. It also remembers, in your browser, which Google Photos album it made for you, so later copies
            go into the same one.
          </p>
          <p>
            On your files, it labels each item it moves with the account it came from and the date: a private note on the file that
            only Offload can see, so it can tell you later what moved where.
          </p>

          <h2>What passes through this website&rsquo;s server</h2>
          <p>
            For Drive and Gmail, nothing: those happen between your browser and Google. Copying Google Photos is the one exception.
            Browsers can&rsquo;t download photos from Google Photos piece by piece, so each piece passes through this
            website&rsquo;s server on its way from one of your accounts to the other, together with the two short-lived access
            tokens needed for that piece. Nothing is stored, logged or looked at, and the server only ever talks to Google
            Photos&rsquo; own addresses.
          </p>

          <h2>What it changes</h2>
          <p>
            Only what you ask for. When you move files, the sending account asks for the receiving account to become the owner and
            the receiving account accepts straight away; loose items are filed into a folder named after the sender, and the
            sender keeps edit access. Nothing is deleted, and you can move things back.
          </p>
          <p>
            In Gmail cleanup, it moves the conversations you confirm to Trash, leaving starred and important ones alone unless you
            say otherwise. It never deletes email for good: Gmail does that after 30 days, or you do it by emptying the Trash.
          </p>
          <p>
            When you copy Google Photos, it adds copies of the photos and videos you pick to your other account, in an album called
            &ldquo;Copied from&rdquo; plus your email. It never changes or deletes your originals; you delete them yourself once
            you&rsquo;ve checked the copies.
          </p>

          <h2>Offload for Claude</h2>
          <p>
            Offload also works as a connector in Claude, so you can ask Claude to move Drive files for you. When you add it, this
            website asks you to sign in with the Google accounts you want to link (two to five) and for access to their Google
            Drive. Claude can then
            show each account&rsquo;s storage use, list the files and folders it owns, and move the ones you agree to from one
            account to the other: the sending account requests the transfer and the receiving account accepts it straight away,
            filing loose items into a folder named after the sender. It labels each item it moves with the account it came from
            and the date, a private note on the file that only Offload can see, so Claude can later tell you what moved where.
            It doesn&rsquo;t send emails and doesn&rsquo;t delete anything.
          </p>
          <p>
            The connector has no database either. The sign-ins for your linked accounts are encrypted and handed to Claude as part of
            its connection. This website opens them only while it carries out a request, and keeps nothing afterwards. File names,
            sizes and links pass through it on their way to Claude, which shows them to you in the chat; Anthropic&rsquo;s privacy
            policy covers what Claude does with your conversation. File contents are never read.
          </p>

          <h2>Removing access</h2>
          <p>
            You can remove Offload&rsquo;s access at any time from your Google Account, under Security, then Third-party apps with
            account access. Do the same in each account you signed in with, in the web app or in Claude. Removing the Offload connector in Claude&rsquo;s settings also ends Claude&rsquo;s access.
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
