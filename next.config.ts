import type { NextConfig } from "next";

/**
 * Server Actions origin allowlist.
 *
 * Next aborts a Server Action when the request `Origin` header does not match the
 * (forwarded) `Host` — e.g. when the app is opened via a LAN IP, a reverse proxy,
 * or a preview tunnel instead of the exact host Next sees. That made the
 * "Run simulation" form buttons silently fail in the browser.
 *
 * localhost is allowed by default; add any other host you open the app from via
 * the ALLOWED_ORIGINS env var (comma-separated, host[:port], wildcards allowed),
 * e.g. ALLOWED_ORIGINS="192.168.0.163:3000,*.vercel.app".
 */
const allowedOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  ...(process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
