import type { NextConfig } from "next";

// The browser only ever talks to this origin. /api/* is proxied to the NestJS API,
// so the session cookie stays first-party and no CORS setup is needed.
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
