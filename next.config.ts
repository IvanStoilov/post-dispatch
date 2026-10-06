import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the local HTTPS proxy to load dev assets and establish HMR.
  allowedDevOrigins: [
    new URL(process.env.APP_URL || "http://localhost:8200").hostname,
  ],
  experimental: { proxyClientMaxBodySize: "12mb" },
};

export default nextConfig;
