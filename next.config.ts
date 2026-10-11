import { config } from "./src/lib/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the local HTTPS proxy to load dev assets and establish HMR.
  allowedDevOrigins: [new URL(config.APP_URL).hostname],
  experimental: { proxyClientMaxBodySize: "12mb" },
};

export default nextConfig;
