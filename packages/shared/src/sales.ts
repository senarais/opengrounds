import { eligibleOf, type MonthRevenue } from "./application";
import { FEE_BPS } from "./finance";
import { parseRupiah, rowsFromTable, type ImportRow } from "./connector";

/** Hasil membaca file data penjualan yang diunggah owner (template bulanan atau ekspor transaksi). */
export interface SalesResult {
  mode: "monthly" | "transactions";
  /** Label bulan "YYYY-MM", urut lama → baru, berurutan tanpa celah. */
  labels: string[];
  breakdown: MonthRevenue[];
  months: number[];
  /** Hanya tersedia dari ekspor transaksi (dihitung dari metode bayar); template bulanan tidak punya info ini. */
  paymentMix: { gatewayPct: number; cashPct: number; transferPct: number } | null;
  notes: string[];
  errors: string[];
}

export const SALES_TEMPLATE_MONTHLY = "bulan,bruto,refund,pajak,fee\n2026-01,150000000,2000000,13636000,1000000\n2026-02,160000000,1500000,14545000,1100000\n";
export const MIN_SALES_MONTHS = 6;
export const MAX_SALES_MONTHS = 12;

const WIB = 7 * 3_600_000;
const monthKey = (iso: string) => new Date(Date.parse(iso) + WIB).toISOString().slice(0, 7);
const nextKey = (k: string) => { const [y, m] = k.split("-").map(Number); return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`; };

/** Ambil rangkaian bulan berurutan terpanjang yang berakhir di bulan terbaru; kembalikan juga celah yang ditemukan. */
function contiguousTail(keys: string[]): { run: string[]; gaps: string[] } {
  const sorted = [...new Set(keys)].sort();
  if (sorted.length === 0) return { run: [], gaps: [] };
  const run = [sorted[sorted.length - 1]!];
  const gaps: string[] = [];
  for (let i = sorted.length - 2; i >= 0 && run.length < MAX_SALES_MONTHS; i--) {
    if (nextKey(sorted[i]!) === run[0]) run.unshift(sorted[i]!);
    else { for (let k = nextKey(sorted[i]!); k < run[0]!; k = nextKey(k)) gaps.push(k); break; }
  }
  return { run, gaps };
}

const pct1 = (x: number) => Math.round(x * 10) / 10;

function finish(mode: SalesResult["mode"], by: Map<string, MonthRevenue>, paymentMix: SalesResult["paymentMix"], notes: string[], errors: string[], nowKey: string): SalesResult {
  const keys = [...by.keys()];
  const partial = keys.filter((k) => k >= nowKey);
  if (partial.length) notes.push(`Bulan berjalan (${partial.join(", ")}) tidak dihitung karena belum penuh.`);
  const { run, gaps } = contiguousTail(keys.filter((k) => k < nowKey));
  if (gaps.length) notes.push(`Ada bulan kosong (${gaps.slice(0, 4).join(", ")}${gaps.length > 4 ? ", …" : ""}); hanya rangkaian bulan berurutan terbaru yang dipakai.`);
  const breakdown = run.map((k) => by.get(k)!);
  const months = breakdown.map(eligibleOf);
  if (run.length < MIN_SALES_MONTHS) errors.push(`Data berurutan hanya ${run.length} bulan penuh; minimal ${MIN_SALES_MONTHS} bulan (disarankan 12).`);
  if (months.some((m) => m < 0)) errors.push("Refund + pajak + fee melebihi omzet bruto pada sedikitnya satu bulan.");
  return { mode, labels: run, breakdown, months, paymentMix, notes, errors };
}

/** Template bulanan: kolom bulan, bruto, refund, pajak, fee (bulan = YYYY-MM). */
function fromMonthly(table: string[][], nowKey: string): SalesResult {
  const head = table[0]!.map((h) => h.trim().toLowerCase());
  const errors: string[] = [], notes: string[] = [];
  const need = ["bulan", "bruto", "refund", "pajak", "fee"].filter((h) => !head.includes(h));
  if (need.length) return { mode: "monthly", labels: [], breakdown: [], months: [], paymentMix: null, notes, errors: [`Kolom wajib tidak ada: ${need.join(", ")}`] };
  const by = new Map<string, MonthRevenue>();
  table.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const g = (k: string) => (cells[head.indexOf(k)] ?? "").trim();
    const m = /^(\d{4}-\d{2})/.exec(g("bulan"));
    const vals = (["bruto", "refund", "pajak", "fee"] as const).map((k) => (g(k) === "" ? 0 : parseRupiah(g(k))));
    if (!m) return void errors.push(`Baris ${i + 2}: bulan tidak valid "${g("bulan")}" (format YYYY-MM)`);
    if (vals.some((v) => v === null)) return void errors.push(`Baris ${i + 2}: angka harus rupiah bulat (tanpa desimal)`);
    if (by.has(m[1]!)) return void errors.push(`Baris ${i + 2}: bulan ${m[1]} muncul dua kali`);
    by.set(m[1]!, { gross: vals[0]!, refund: vals[1]!, tax: vals[2]!, fee: vals[3]! });
  });
  return finish("monthly", by, null, notes, errors, nowKey);
}

/** Ekspor transaksi (kolom sama dengan impor PoS): dijumlahkan per bulan WIB; porsi pembayaran dihitung dari metode bayar. */
function fromTransactions(table: string[][], nowKey: string): SalesResult {
  const parsed = rowsFromTable(table);
  const errors = parsed.errors.slice(0, 8).map((e) => `Baris ${e.line}: ${e.message}`);
  if (parsed.errors.length > 8) errors.push(`… dan ${parsed.errors.length - 8} baris bermasalah lainnya`);
  const notes: string[] = [];
  const rows: ImportRow[] = parsed.rows;
  const by = new Map<string, MonthRevenue>();
  const get = (k: string) => by.get(k) ?? (by.set(k, { gross: 0, refund: 0, tax: 0, fee: 0 }), by.get(k)!);
  const method = { gateway: 0, cash: 0, qris_sendiri: 0 };
  let taxGuess = 0, feeGuess = 0;
  for (const r of rows) {
    const m = get(monthKey(r.occurredAt));
    if (r.kind === "refund") { m.refund += r.amount; continue; }
    m.gross += r.amount;
    method[r.method] += r.amount;
    if (r.tax === undefined) { m.tax += Math.round(r.amount / 11); taxGuess++; } else m.tax += r.tax;
    if (r.fee === undefined) { const f = r.method === "gateway" ? Math.round((r.amount * FEE_BPS) / 10_000) : 0; m.fee += f; if (r.method === "gateway") feeGuess++; } else m.fee += r.fee;
  }
  if (taxGuess) notes.push(`Pajak diperkirakan 1/11 dari nilai transaksi pada ${taxGuess} baris tanpa kolom pajak (asumsi harga sudah termasuk PB1 10%).`);
  if (feeGuess) notes.push(`Fee gateway diperkirakan ${FEE_BPS / 100}% pada ${feeGuess} transaksi gateway tanpa kolom fee.`);
  const total = method.gateway + method.cash + method.qris_sendiri;
  const paymentMix = total > 0 ? (() => {
    const g = pct1((method.gateway / total) * 100), c = pct1((method.cash / total) * 100);
    return { gatewayPct: g, cashPct: c, transferPct: pct1(100 - g - c) };
  })() : null;
  return finish("transactions", by, paymentMix, notes, errors, nowKey);
}

/** Deteksi format dari header: ada kolom "bulan" = template bulanan; selain itu dianggap ekspor transaksi. */
export function parseSalesTable(table: string[][], now = new Date()): SalesResult {
  const nowKey = monthKey(now.toISOString());
  if (table.length === 0 || table[0]!.every((c) => c.trim() === "")) return { mode: "monthly", labels: [], breakdown: [], months: [], paymentMix: null, notes: [], errors: ["File kosong"] };
  const head = table[0]!.map((h) => h.trim().toLowerCase());
  return head.includes("bulan") ? fromMonthly(table, nowKey) : fromTransactions(table, nowKey);
}
