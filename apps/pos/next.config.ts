import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@venue-rwa/shared", "@venue-rwa/connectors", "@venue-rwa/verification", "@venue-rwa/ui"],
};
export default config;
