import { z } from "zod";

/** Transaksi dari sistem eksternal (ERP/POS milik owner) yang diimpor ke PoS lewat CSV atau API. */
export const ImportRow = z.object({
  externalRef: z.string().min(1).max(80),
  occurredAt: z.string().datetime(),
  kind: z.enum(["sale", "refund"]),
  amount: z.number().int().positive().safe(),
  method: z.enum(["gateway", "cash", "qris_sendiri"]),
  pspRef: z.string().min(1).max(80).optional(),
  fee: z.number().int().nonnegative().safe().optional(),
  tax: z.number().int().nonnegative().safe().optional(),
  /** Hanya untuk refund: externalRef penjualan asal. */
  originalRef: z.string().min(1).max(80).optional(),
  label: z.string().max(40).optional(),
}).superRefine((r, ctx) => {
  if (r.kind === "refund" && !r.originalRef) ctx.addIssue({ code: "custom", message: "refund wajib punya ref_asal", path: ["originalRef"] });
  if (r.kind === "sale" && r.method === "gateway" && !r.pspRef) ctx.addIssue({ code: "custom", message: "penjualan via gateway wajib punya psp_ref (dicocokkan dengan laporan settlement)", path: ["pspRef"] });
});
export type ImportRow = z.infer<typeof ImportRow>;

export const CSV_HEADERS = ["ref", "tanggal", "jumlah", "tipe", "metode", "psp_ref", "biaya", "pajak", "ref_asal", "label"] as const;
export const CSV_TEMPLATE = `${CSV_HEADERS.join(",")}\nINV-001,2026-09-01T10:00:00+07:00,150000,penjualan,gateway,PSP-123,1050,13636,,Budi\nINV-002,2026-09-01T11:00:00+07:00,150000,penjualan,tunai,,,,,Sari\nRF-001,2026-09-02T09:00:00+07:00,150000,refund,gateway,PSP-123,,,INV-001,\n`;
export const MAX_IMPORT_ROWS = 2000;

/** CSV sederhana yang benar: kutip ganda, koma/titik-koma sebagai pemisah, kutip di dalam kutip, CRLF. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const TIPE: Record<string, "sale" | "refund"> = { penjualan: "sale", sale: "sale", jual: "sale", refund: "refund", pengembalian: "refund" };
const METODE: Record<string, "gateway" | "cash" | "qris_sendiri"> = { gateway: "gateway", pg: "gateway", tunai: "cash", cash: "cash", qris_sendiri: "qris_sendiri", "qris sendiri": "qris_sendiri", qris_statis: "qris_sendiri" };

/** Angka rupiah: "150000", "150.000", "Rp 150.000" (titik ribuan Indonesia). Desimal ditolak (uang = integer rupiah). */
export function parseRupiah(s: string): number | null {
  const t = s.replace(/rp/gi, "").replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(t)) return null;
  return Number(t.replace(/\./g, ""));
}

function parseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // tanpa zona waktu dianggap WIB (+07:00), supaya hari bisnis tidak bergeser
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00+07:00` : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t) ? `${t.replace(" ", "T")}${t.length === 16 ? ":00" : ""}+07:00` : t;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface CsvResult { rows: ImportRow[]; errors: { line: number; message: string }[] }

export function rowsFromCsv(text: string): CsvResult {
  return rowsFromTable(parseCsv(text));
}

/** Sama seperti rowsFromCsv, tetapi dari tabel sel (mis. hasil membaca XLSX). Baris pertama = header. */
export function rowsFromTable(table: string[][]): CsvResult {
  const errors: CsvResult["errors"] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "File kosong" }] };
  const head = table[0]!.map((h) => h.trim().toLowerCase());
  const miss = ["ref", "tanggal", "jumlah", "tipe", "metode"].filter((h) => !head.includes(h));
  if (miss.length) return { rows: [], errors: [{ line: 1, message: `Kolom wajib tidak ada: ${miss.join(", ")}` }] };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: [{ line: 1, message: `Maksimal ${MAX_IMPORT_ROWS} baris per impor` }] };
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const g = (k: string) => (cells[head.indexOf(k)] ?? "").trim();
    const amount = parseRupiah(g("jumlah"));
    const occurredAt = parseDate(g("tanggal"));
    const kind = TIPE[g("tipe").toLowerCase()];
    const method = METODE[g("metode").toLowerCase()];
    const opt = (k: string) => (head.includes(k) && g(k) !== "" ? g(k) : undefined);
    const money = (k: string) => { const v = opt(k); if (v === undefined) return undefined; return parseRupiah(v) ?? NaN; };
    if (amount === null) return void errors.push({ line, message: `jumlah tidak valid: "${g("jumlah")}"` });
    if (!occurredAt) return void errors.push({ line, message: `tanggal tidak valid: "${g("tanggal")}"` });
    if (!kind) return void errors.push({ line, message: `tipe tidak dikenal: "${g("tipe")}" (penjualan/refund)` });
    if (!method) return void errors.push({ line, message: `metode tidak dikenal: "${g("metode")}" (gateway/tunai/qris_sendiri)` });
    const fee = money("biaya"), tax = money("pajak");
    if ((fee !== undefined && Number.isNaN(fee)) || (tax !== undefined && Number.isNaN(tax))) return void errors.push({ line, message: "biaya/pajak harus angka rupiah bulat" });
    const parsed = ImportRow.safeParse({ externalRef: g("ref"), occurredAt, kind, amount, method, pspRef: opt("psp_ref"), fee, tax, originalRef: opt("ref_asal"), label: opt("label") });
    if (!parsed.success) return void errors.push({ line, message: parsed.error.issues.map((i) => i.message).join("; ") });
    if (seen.has(parsed.data.externalRef)) return void errors.push({ line, message: `ref ganda dalam file: ${parsed.data.externalRef}` });
    seen.add(parsed.data.externalRef);
    rows.push(parsed.data);
  });
  return { rows, errors };
}
