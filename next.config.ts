import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * The site moved from offload-five-mu.vercel.app to www.offloadapp.space. Pages on the old address redirect
   * permanently, so search engines move their index (and links) to the new one instead of seeing two copies.
   * The connector (/mcp, /oauth, /.well-known), the web app (/app) and its API stay reachable on the old address,
   * so existing connections and sign-ins keep working.
   */
  async redirects() {
    return [
      {
        source: "/:path((?!mcp(?:/|$)|oauth(?:/|$)|\\.well-known(?:/|$)|api(?:/|$)|app(?:/|$)).*)",
        has: [{ type: "host", value: "offload-five-mu.vercel.app" }],
        destination: "https://www.offloadapp.space/:path",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Google sign-in popups need to talk back to this page.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
