import type { Metadata } from "next";
import OffloadApp from "@/components/app/OffloadApp";
import "./app.css";

export const metadata: Metadata = {
  title: "Offload app",
  description: "Move Google Drive folders, large files and photos between your Google accounts, right in your browser.",
  alternates: { canonical: "/app" },
  robots: { index: false, follow: true },
};

// Read the client ID at request time, so adding it in Vercel only needs a redeploy, not a code change.
export const dynamic = "force-dynamic";

export default function AppPage() {
  return <OffloadApp clientId={process.env.GOOGLE_CLIENT_ID || ""} />;
}
