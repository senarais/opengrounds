import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { SALES_COLUMNS } from "@venue-rwa/shared";
import { readSales } from "../lib/sales";

async function main() {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 7; i >= 2; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15)); keys.push(d.toISOString().slice(0, 7)); }
  const header = SALES_COLUMNS.map((v) => ({ value: v, fontWeight: "bold" as const }));
  const num = (n: number) => ({ value: n, type: Number });
  const rows = keys.map((k, i) => [{ value: k }, num(52_000_000 + i * 1_000_000), num(1_000_000), num(27_000_000), num(1_500_000), num(4_000_000), num(2_000_000), num(1_500_000), num(49_000_000)]);
  const buf = await writeXlsxFile([header, ...rows] as any, { buffer: true });
  const r = await readSales(new File([buf as any], "penjualan.xlsx"));
  assert.deepEqual(r.errors, []);
  assert.equal(r.labels.length, 6);
  assert.equal(r.months[0]!.gross, 52_000_000);
  assert.equal(r.months[5]!.opex, 27_000_000);

  const csv = new File([[SALES_COLUMNS.join(","), ...keys.map((k) => `${k},52000000,0,0,0,0,0,0,52000000`)].join("\n")], "penjualan.csv", { type: "" });
  assert.deepEqual((await readSales(csv)).errors, []);
  await assert.rejects(readSales(new File(["x"], "penjualan.pdf")), /CSV atau XLSX/);
  await assert.rejects(readSales(new File([], "kosong.csv")), /kosong/);
  console.log("pembacaan XLSX dan CSV OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
