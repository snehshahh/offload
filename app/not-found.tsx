import Link from "next/link";
import { Header, Footer } from "@/components/Chrome";

export default function NotFound() {
  return (
    <div className="site">
      <div className="wrap">
        <Header />
        <main className="prose">
          <h1>Page not found</h1>
          <p>That page doesn&rsquo;t exist. Head back to the start to see how Offload frees up your Google storage.</p>
          <p>
            <Link className="btn btn-main" href="/">
              Go to the home page
            </Link>
          </p>
        </main>
        <Footer />
      </div>
    </div>
  );
}
