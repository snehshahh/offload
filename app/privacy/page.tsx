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

          <h2>Offload for Claude</h2>
          <p>
            Offload also works as a connector in Claude, so you can ask Claude to move Drive files for you. When you add it, this
            website asks you to sign in with both of your Google accounts and for access to their Google Drive. Claude can then
            show each account&rsquo;s storage use, list the files and folders it owns, and move the ones you agree to from one
            account to the other: the sending account requests the transfer and the receiving account accepts it straight away,
            filing loose items into a folder named after the sender. It doesn&rsquo;t send emails and doesn&rsquo;t delete
            anything.
          </p>
          <p>
            The connector has no database either. The sign-ins for your two accounts are encrypted and handed to Claude as part of
            its connection. This website opens them only while it carries out a request, and keeps nothing afterwards. File names,
            sizes and links pass through it on their way to Claude, which shows them to you in the chat; Anthropic&rsquo;s privacy
            policy covers what Claude does with your conversation. File contents are never read.
          </p>

          <h2>Removing access</h2>
          <p>
            You can remove Offload&rsquo;s access at any time from your Google Account, under Security, then Third-party apps with
            account access. If you connected a second account for Google Photos, or both accounts to Claude, do the same in each
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
