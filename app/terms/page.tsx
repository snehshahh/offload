import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Chrome";
import { formatDate } from "@/lib/posts";
import { PAGE_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Offload, the free tool that moves Google Drive files and photos between your own Google accounts and clears out Gmail.",
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms", title: "Terms of Service | Offload" },
};

export default function Terms() {
  return (
    <div className="site">
      <div className="wrap">
        <Header />
        <main className="prose">
          <h1>Terms of Service</h1>
          <p className="fine">Last updated {formatDate(PAGE_UPDATED.terms)}</p>

          <p>
            These terms cover your use of Offload: this website, the web app at <Link href="/app">/app</Link>, and the Offload
            connector for AI apps such as Claude and ChatGPT. By using Offload you agree to them. If you don&rsquo;t agree, please
            don&rsquo;t use it.
          </p>

          <h2>What Offload does</h2>
          <p>
            Offload helps you manage storage across Google accounts you own. It moves Google Drive files and folders from one of
            your accounts to another by transferring ownership, copies Google Photos to another of your accounts, and moves Gmail
            messages you choose to Trash. It works only through Google&rsquo;s own APIs, with the permissions you grant when you
            sign in. <Link href="/privacy">Our privacy policy</Link> explains what it can access and what it keeps.
          </p>

          <h2>It&rsquo;s free</h2>
          <p>
            Offload is free to use. We may change, limit or stop any part of it at any time, for example to keep it within
            Google&rsquo;s usage limits.
          </p>

          <h2>Your accounts, your responsibility</h2>
          <ul>
            <li>Only sign in with Google accounts that you own or are allowed to manage.</li>
            <li>
              You decide what moves, copies or goes to Trash. Offload shows you what it is about to do and asks you to confirm, and
              in AI apps the assistant asks before anything changes. Please check before you confirm.
            </li>
            <li>
              Work and school accounts are managed by their organisation, which may block transfers or have rules about where files
              can go. Follow them.
            </li>
            <li>Keep your Google accounts secure, with up-to-date recovery details, so you don&rsquo;t lose access to files you move.</li>
          </ul>

          <h2>Acceptable use</h2>
          <p>Don&rsquo;t use Offload to:</p>
          <ul>
            <li>access, move or change files or email in accounts that aren&rsquo;t yours;</li>
            <li>break the law, or Google&rsquo;s terms of service and policies;</li>
            <li>overload, probe or disrupt Offload or Google&rsquo;s services, or get around their limits;</li>
            <li>store or move content you have no right to.</li>
          </ul>

          <h2>Google and AI apps</h2>
          <p>
            Your use of Google Drive, Gmail and Google Photos is also covered by Google&rsquo;s own terms, and your storage figures
            and quotas are Google&rsquo;s. If you use Offload through an AI app, that app&rsquo;s terms and privacy policy cover your
            conversations with it. Offload isn&rsquo;t affiliated with, endorsed by or sponsored by Google, Anthropic or OpenAI.
          </p>

          <h2>Things can go wrong</h2>
          <p>
            Offload is provided &ldquo;as is&rdquo;, without warranties of any kind. We work to make it reliable, but we can&rsquo;t
            promise it will always be available, error-free, or that every transfer, copy or cleanup will complete. Google can take
            hours to update storage figures, and its services have their own limits and outages.
          </p>
          <p>
            Offload doesn&rsquo;t delete Drive files or photos: moved files can be moved back, copied photos stay in the original
            account until you delete them, and Gmail messages go to Trash, where Google keeps them for 30 days. Still, keep your own
            backup of anything irreplaceable.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent the law allows, Offload and its developer aren&rsquo;t liable for any indirect, incidental or
            consequential loss, or for lost data, storage, profits or goodwill, arising from your use of Offload or your inability to
            use it. Nothing in these terms limits liability that can&rsquo;t be limited by law.
          </p>

          <h2>Stopping</h2>
          <p>
            You can stop using Offload at any time. To remove its access, go to your Google Account, then Security, then Third-party
            apps with account access, and remove Offload from each account you signed in with. Removing the connector in your AI
            app ends that app&rsquo;s access. We may suspend access for anyone who breaks these terms.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these terms. When we do, we&rsquo;ll change the date at the top of this page. Using Offload after a change
            means you accept the updated terms.
          </p>
        </main>
        <Footer />
      </div>
    </div>
  );
}
