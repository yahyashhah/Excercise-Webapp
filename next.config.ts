import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Allow any HTTPS image source (user-provided exercise images, external CDNs, etc.)
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: [],
  turbopack: {
    // Pin the workspace root so a stray lockfile in the home directory
    // doesn't get picked as the project root.
    root: __dirname,
  },
};

export default nextConfig;
