import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@venue-rwa/shared", "@venue-rwa/connectors", "@venue-rwa/verification", "@venue-rwa/ui"],
  // pdf.js dimuat langsung oleh Node (bukan di-bundle webpack)
  serverExternalPackages: ["unpdf", "tesseract.js", "@napi-rs/canvas", "read-excel-file", "unzipper"],
  // pengajuan mengunggah dokumen (maks. 10 MB per file)
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};
export default config;
