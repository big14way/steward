import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser code calls the API through this origin (/api/*), so there is exactly one public host, no CORS, and no API URL
  // baked into the client bundle. API_INTERNAL is read when the server starts (e.g. http://127.0.0.1:8001 or the VPS URL).
  async rewrites() {
    const api = (process.env.API_INTERNAL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
  /* config options here */
};

export default nextConfig;
