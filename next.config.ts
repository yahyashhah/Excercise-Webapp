import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Allow any HTTPS image source (user-provided exercise images, external CDNs, etc.)
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: [],
};

export default nextConfig;
