import { parseRupiah, rowsFromTable, type ImportRow } from "./connector";
import { MAX_FINANCIAL_MONTHS, MIN_FINANCIAL_MONTHS, type FinancialMonth } from "./onboarding";

/** Hasil membaca file data penjualan yang diunggah owner (template bulanan atau ekspor transaksi). */
export interface SalesResult {
  mode: "monthly" | "transactions";
  /** Label bulan "YYYY-MM", urut lama → baru, berurutan tanpa celah. */
  labels: string[];
  months: FinancialMonth[];
  notes: string[];
  errors: string[];
}

/** Kolom template bulanan = komponen waterfall §4.4 + omzet digital. Contoh baris = contoh PRD §4.6. */
export const SALES_COLUMNS = ["bulan", "bruto", "refund", "biaya_operasional", "pajak", "fee_operator", "cadangan", "fee_platform", "omzet_digital"] as const;
export const SALES_TEMPLATE_MONTHLY = `${SALES_COLUMNS.join(",")}\n2026-01,52000000,1000000,27000000,1500000,4000000,2000000,1500000,49400000\n2026-02,50000000,800000,26500000,1400000,4000000,2000000,1500000,47600000\n`;
const MIN_SALES_MONTHS = MIN_FINANCIAL_MONTHS;
const MAX_SALES_MONTHS = MAX_FINANCIAL_MONTHS;

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

const empty = (month: string): FinancialMonth => ({ month, gross: 0, refunds: 0, opex: 0, tax: 0, operatorFee: 0, reserve: 0, platformFee: 0, digitalGross: 0, bankCredits: null });

function finish(mode: SalesResult["mode"], by: Map<string, FinancialMonth>, notes: string[], errors: string[], nowKey: string): SalesResult {
  const keys = [...by.keys()];
  const partial = keys.filter((k) => k >= nowKey);
  if (partial.length) notes.push(`Current month (${partial.join(", ")}) excluded because it is incomplete.`);
  const { run, gaps } = contiguousTail(keys.filter((k) => k < nowKey));
  if (gaps.length) notes.push(`Missing months (${gaps.slice(0, 4).join(", ")}${gaps.length > 4 ? ", …" : ""}); only the latest consecutive range is used.`);
  const months = run.map((k) => by.get(k)!);
  if (run.length < MIN_SALES_MONTHS) errors.push(`Only ${run.length} complete consecutive months; at least ${MIN_SALES_MONTHS} are required (12 recommended).`);
  for (const m of months) {
    if (m.refunds + m.opex + m.tax + m.operatorFee + m.reserve + m.platformFee > m.gross) errors.push(`${m.month}: total deductions exceed gross revenue.`);
    if (m.digitalGross > m.gross) errors.push(`${m.month}: digital revenue exceeds gross revenue.`);
  }
  return { mode, labels: run, months, notes, errors };
}

/** Template bulanan: satu baris per bulan dengan komponen waterfall (bulan = YYYY-MM). */
function fromMonthly(table: string[][], nowKey: string): SalesResult {
  const head = table[0]!.map((h) => h.trim().toLowerCase());
  const errors: string[] = [], notes: string[] = [];
  const need = SALES_COLUMNS.filter((h) => !head.includes(h));
  if (need.length) return { mode: "monthly", labels: [], months: [], notes, errors: [`Required columns missing: ${need.join(", ")}`] };
  const by = new Map<string, FinancialMonth>();
  table.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const g = (k: string) => (cells[head.indexOf(k)] ?? "").trim();
    const m = /^(\d{4}-\d{2})/.exec(g("bulan"));
    const vals = SALES_COLUMNS.slice(1).map((k) => (g(k) === "" ? 0 : parseRupiah(g(k))));
    if (!m) return void errors.push(`Row ${i + 2}: invalid month "${g("bulan")}" (use YYYY-MM format).`);
    if (vals.some((v) => v === null)) return void errors.push(`Row ${i + 2}: amounts must be whole rupiah (no decimals).`);
    if (by.has(m[1]!)) return void errors.push(`Row ${i + 2}: month ${m[1]} appears more than once.`);
    const [gross, refunds, opex, tax, operatorFee, reserve, platformFee, digitalGross] = vals as number[];
    by.set(m[1]!, { month: m[1]!, gross: gross!, refunds: refunds!, opex: opex!, tax: tax!, operatorFee: operatorFee!, reserve: reserve!, platformFee: platformFee!, digitalGross: digitalGross!, bankCredits: null });
  });
  return finish("monthly", by, notes, errors, nowKey);
}

/** Ekspor transaksi (kolom sama dengan impor PoS): omzet, refund, pajak, dan porsi digital per bulan WIB. Biaya diisi owner di formulir. */
function fromTransactions(table: string[][], nowKey: string): SalesResult {
  const parsed = rowsFromTable(table);
  const translateImportError = (message: string) => message
    .replace(/^Kolom wajib tidak ada:/, "Required columns missing:")
    .replace(/^Maksimal (\d+) baris per impor$/, "Maximum $1 rows per import.")
    .replace(/^jumlah tidak valid:/, "Invalid amount:")
    .replace(/^tanggal tidak valid:/, "Invalid date:")
    .replace(/^tipe tidak dikenal:/, "Unknown transaction type:")
    .replace("(penjualan/refund)", "(sale/refund)")
    .replace(/^metode tidak dikenal:/, "Unknown payment method:")
    .replace("(gateway/tunai/qris_sendiri)", "(gateway/cash/static QRIS)")
    .replace("biaya/pajak harus angka rupiah bulat", "Fee and tax must be whole-rupiah amounts.")
    .replace("refund wajib punya ref_asal", "A refund must reference its original sale.")
    .replace("penjualan via gateway wajib punya psp_ref (dicocokkan dengan laporan settlement)", "Gateway sales must include a PSP reference for settlement reconciliation.")
    .replace(/^ref ganda dalam file:/, "Duplicate reference in file:")
    .replace(/^File kosong$/, "File is empty.");
  const errors = parsed.errors.slice(0, 8).map((e) => `Row ${e.line}: ${translateImportError(e.message)}`);
  if (parsed.errors.length > 8) errors.push(`… and ${parsed.errors.length - 8} more rows contain errors.`);
  const notes: string[] = ["Transaction exports include revenue, refunds, and tax only. Enter monthly operating expenses, fees, and reserves in the form."];
  const rows: ImportRow[] = parsed.rows;
  const by = new Map<string, FinancialMonth>();
  const get = (k: string) => by.get(k) ?? (by.set(k, empty(k)), by.get(k)!);
  let taxGuess = 0;
  for (const r of rows) {
    const m = get(monthKey(r.occurredAt));
    if (r.kind === "refund") { m.refunds += r.amount; continue; }
    m.gross += r.amount;
    if (r.method !== "cash") m.digitalGross += r.amount;
    if (r.tax === undefined) { m.tax += Math.round(r.amount / 11); taxGuess++; } else m.tax += r.tax;
  }
  if (taxGuess) notes.push(`Tax was estimated at 1/11 of the transaction amount for ${taxGuess} rows without a tax column (assumes prices include 10% PB1).`);
  return finish("transactions", by, notes, errors, nowKey);
}

/** Deteksi format dari header: ada kolom "bulan" = template bulanan; selain itu dianggap ekspor transaksi. */
export function parseSalesTable(table: string[][], now = new Date()): SalesResult {
  const nowKey = monthKey(now.toISOString());
  if (table.length === 0 || table[0]!.every((c) => c.trim() === "")) return { mode: "monthly", labels: [], months: [], notes: [], errors: ["File is empty."] };
  const head = table[0]!.map((h) => h.trim().toLowerCase());
  return head.includes("bulan") ? fromMonthly(table, nowKey) : fromTransactions(table, nowKey);
}
