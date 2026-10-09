import readXlsxFile from "read-excel-file/node";
import { parseCsv, parseSalesTable, type SalesResult } from "@venue-rwa/shared";
import { sheetType } from "./storage";

export const MAX_SALES_FILE_BYTES = 5 * 1024 * 1024;

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v); // desimal ditolak oleh parser rupiah
  return String(v);
};

/** Baca file CSV atau XLSX menjadi tabel sel. */
export async function tableFromFile(file: File): Promise<string[][]> {
  if (file.size === 0) throw new Error("File data penjualan kosong");
  if (file.size > MAX_SALES_FILE_BYTES) throw new Error("File data penjualan maksimal 5 MB");
  const type = sheetType(file);
  if (!type) throw new Error("Format harus CSV atau XLSX");
  if (type === "text/csv") return parseCsv(await file.text());
  const rows = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
  return rows.map((r) => r.map(cell));
}

export async function readSales(file: File): Promise<SalesResult> {
  return parseSalesTable(await tableFromFile(file));
}
