import Link from "next/link";
import { Logo } from "./Logo";
import { APP_URL } from "@/lib/site";

export function Header() {
  return (
    <header className="top">
      <Link href="/" className="brand" aria-label="Offload home">
        <Logo />
      </Link>
      <nav className="top-nav" aria-label="Main">
        <a href="/#how">How it works</a>
        <a href="/#gmail">Gmail cleanup</a>
        <a href="/#faq">Questions</a>
        <a className="btn btn-main" href={APP_URL}>
          Open Offload
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-row">
        <Logo />
        <nav aria-label="Footer">
          <Link href="/">Home</Link>
          <a href="/#how">How it works</a>
          <a href="/#gmail">Gmail cleanup</a>
          <a href="/#faq">Questions</a>
          <Link href="/privacy">Privacy</Link>
          <a href={APP_URL}>Open Offload</a>
        </nav>
      </div>
      <p>
        Offload is free and independent. It isn&rsquo;t affiliated with, endorsed by or sponsored by Google. Google Drive, Gmail
        and Google Photos are trademarks of Google LLC.
      </p>
    </footer>
  );
}
