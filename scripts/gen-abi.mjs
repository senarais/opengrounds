// Tulis ABI (+ bytecode VenueSeries untuk deploy per venue) dari artefak forge ke apps/platform/lib/abi.ts.
// Jalankan setelah `forge build`: node scripts/gen-abi.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const art = (n) => JSON.parse(readFileSync(join(root, "packages/contracts/out", `${n}.sol`, `${n}.json`), "utf8"));
const out = ["// DIHASILKAN OLEH scripts/gen-abi.mjs dari artefak forge. Jangan diedit manual.", ""];
for (const n of ["AttestationRegistry", "VenueSeries", "SeriesToken"]) {
  const a = art(n);
  out.push(`export const ${n[0].toLowerCase() + n.slice(1)}Abi = ${JSON.stringify(a.abi)} as const;`, "");
}
out.push(`export const attestationRegistryBytecode = ${JSON.stringify(art("AttestationRegistry").bytecode.object)} as const;`, "");
out.push(`export const venueSeriesBytecode = ${JSON.stringify(art("VenueSeries").bytecode.object)} as const;`, "");
writeFileSync(join(root, "apps/platform/lib/abi.ts"), out.join("\n"));
console.log("abi.ts ditulis");
