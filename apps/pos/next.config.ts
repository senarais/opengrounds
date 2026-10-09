import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Satu .env di root monorepo dipakai semua app (tanpa symlink per app). process.loadEnvFile tidak menimpa variabel yang sudah ada.
// (Bukan @next/env loadEnvConfig: ia meng-cache pemanggilan pertama Next untuk folder app dan mengabaikan folder lain.)
const rootEnv = join(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Middleware jalan di runtime Edge, yang tidak mewarisi env yang dimuat di atas: teruskan yang dibutuhkannya secara eksplisit.
  // Keduanya memang boleh publik (anon key dibatasi RLS); kunci rahasia (service role, dll.) TIDAK boleh ditaruh di sini.
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    // variabel NEXT_PUBLIC_* dari .env root, supaya pasti ter-inline ke kode browser
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("NEXT_PUBLIC_")).map(([k, v]) => [k, v ?? ""])),
  },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@venue-rwa/shared", "@venue-rwa/connectors", "@venue-rwa/verification", "@venue-rwa/ui"],
};
export default config;
