import type { Metadata, Viewport } from "next";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "free Google Drive storage manager",
    "Google storage manager",
    "manage Google Drive storage",
    "free up Google storage",
    "free storage tool",
    "free tool",
    "bulk transfer Google Drive files",
    "bulk move Google Drive files",
    "bulk file manager Google Drive",
    "transfer Google Drive files to another account",
    "move Google Drive files between accounts",
    "transfer ownership Google Drive in bulk",
    "Google Drive storage full",
    "Gmail storage full",
    "clean up Gmail",
    "bulk delete Gmail emails",
    "delete Gmail promotions in bulk",
    "Gmail cleanup tool",
    "move Google Photos to another account",
    "Google Drive cleanup",
    "Google Drive large files",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Offload: free Google Drive storage manager and bulk transfer tool" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-image.png", alt: "Offload: free Google Drive storage manager and bulk transfer tool" }],
  },
  category: "utilities",
  formatDetection: { email: false, telephone: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#2F6F62",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
