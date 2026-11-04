import type { Metadata } from "next";
import { Header, Footer } from "@/components/Chrome";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Offload handles your Google Drive, Gmail and Google Photos data: it runs inside your own Google account, has no server of its own, and your files never leave Google.",
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
            Offload is a Google Apps Script web app. When you open it, it runs under your own Google account with the permissions
            you grant on Google&rsquo;s consent screen. This website explains the app and links to it. It asks for Google access
            only if you add Offload to Claude: see Offload for Claude below.
          </p>

          <h2>What it accesses</h2>
          <p>
            Offload asks for access to your Google Drive so it can list your folders and files, show their sizes and your storage
            use, and create or accept the ownership transfers you choose. It also reads your email address to show which account
            you&rsquo;re signed in with.
          </p>
          <p>
            It asks for access to your Gmail so the Gmail tab can search your mail, show the count and the subject, sender and
            date of the newest matches, and move the emails you confirm to Trash. It doesn&rsquo;t read, keep or send the content
            of your emails.
          </p>
          <p>
            If you use the Google Photos tab, it also opens Google&rsquo;s photo picker, which lets it read only the photos and
            videos you select there. In your other account it asks for permission to add photos. That permission can&rsquo;t see
            or change anything already in that account.
          </p>

          <h2>What it stores</h2>
          <p>
            Offload has no database and no server of its own. File names, sizes and contents stay inside Google, and photos you
            copy go from one Google account to the other through Google&rsquo;s own servers. The developer can&rsquo;t see your
            files, your photos or your account.
          </p>
          <p>
            The one thing it keeps is the sign-in for your other account, once you connect it on the Google Photos tab, so you
            don&rsquo;t have to sign in again each time. It&rsquo;s saved in your own account&rsquo;s Apps Script storage, which
            only you can reach. Selecting Change on that tab removes it.
          </p>

          <h2>What it changes</h2>
          <p>
            Only what you ask for. In the sending account, it adds the receiving account as an editor with a pending ownership
            request on the files you pick. In the receiving account, it accepts those requests and files loose items into a folder
            named after the sender. It emails the receiving account only if you tick that option.
          </p>
          <p>
            On the Google Photos tab, it copies the photos and videos you pick into your other account and puts them in an album
            called &ldquo;Copied from&rdquo; plus your email. It never deletes photos; you do that yourself once you&rsquo;ve
            checked the copies.
          </p>
          <p>
            On the Gmail tab, it moves the conversations you confirm to Gmail&rsquo;s Trash, leaving starred and important ones
            alone unless you say otherwise. It never deletes email for good: Gmail does that after 30 days, or you do it by
            emptying the Trash.
          </p>

          <h2>The Offload web app (beta)</h2>
          <p>
            The web app at /app does the Drive part of Offload straight from your browser. When you sign in, Google gives your
            browser tab a short-lived access token for your Google Drive. That token stays in the tab (in memory, and in the
            tab&rsquo;s session storage so a reload doesn&rsquo;t sign you out) and is only ever sent to Google. This
            website&rsquo;s server never receives it, and never sees your files, their names or your storage figures. Closing the
            tab, choosing Sign out, or waiting about an hour ends it.
          </p>
          <p>
            It changes only what you ask for: it moves the files and folders you pick from one of your accounts to another by
            transferring ownership, accepts the transfer with the receiving account, files loose items into a folder named after
            the sender, and labels each moved item with the account it came from and the date (a private note only Offload can
            see). It doesn&rsquo;t delete anything and doesn&rsquo;t send emails.
          </p>
          <p>
            Its Gmail cleanup asks for Gmail permission separately, only when you open it, and only for the accounts you choose.
            It uses Google&rsquo;s gmail.modify permission, which lets it search your mail and move conversations to Trash but
            not delete anything for good. To show what a search found, it reads only the subject, sender and date of the newest
            20 matches; it never reads what your emails say. It moves to Trash only the conversations you confirm, leaving starred
            and important ones alone unless you say otherwise. As with Drive, all of this happens between your browser and
            Google.
          </p>
          <p>
            Its Google Photos copy asks for two more permissions, only when you use it: in the account you copy from, to see the
            photos and videos you pick in Google&rsquo;s own picker (nothing else); and in the account you copy to, to add photos
            (it can&rsquo;t see or change anything already there). Picking, the album and adding the copies happen between your
            browser and Google. The photos themselves are the one exception: browsers can&rsquo;t download them from Google Photos
            piece by piece, so each piece passes through this website&rsquo;s server on its way from one of your accounts to the
            other, together with the two short-lived access tokens needed for that piece. Nothing is stored, logged or looked at,
            and the server only ever talks to Google Photos&rsquo; own addresses. Your originals are never changed or deleted.
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
            account access. If you connected a second account for Google Photos, or several accounts to Claude, do the same in each
            account. Removing the Offload connector in Claude&rsquo;s settings also ends Claude&rsquo;s access.
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
