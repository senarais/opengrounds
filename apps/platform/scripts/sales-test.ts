import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { readSales } from "../lib/sales";

async function main() {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 7; i >= 2; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15)); keys.push(d.toISOString().slice(0, 7)); }
  const header = ["bulan", "bruto", "refund", "pajak", "fee"].map((v) => ({ value: v, fontWeight: "bold" as const }));
  const rows = keys.map((k, i) => [{ value: k }, { value: 100_000_000 + i * 1_000_000, type: Number }, { value: 1_000_000, type: Number }, { value: 9_000_000, type: Number }, { value: 700_000, type: Number }]);
  const buf = await writeXlsxFile([header, ...rows] as any, { buffer: true });
  const xlsx = new File([buf as any], "penjualan.xlsx");
  const r = await readSales(xlsx);
  assert.deepEqual(r.errors, []);
  assert.equal(r.labels.length, 6);
  assert.equal(r.breakdown[0]!.gross, 100_000_000);
  assert.equal(r.months[5], 105_000_000 - 1_000_000 - 9_000_000 - 700_000);

  const csv = new File([["bulan,bruto,refund,pajak,fee", ...keys.map((k) => `${k},100000000,0,0,0`)].join("\n")], "penjualan.csv", { type: "" });
  assert.deepEqual((await readSales(csv)).errors, []);
  await assert.rejects(readSales(new File(["x"], "penjualan.pdf")), /CSV atau XLSX/);
  await assert.rejects(readSales(new File([], "kosong.csv")), /kosong/);
  console.log("pembacaan XLSX dan CSV OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
