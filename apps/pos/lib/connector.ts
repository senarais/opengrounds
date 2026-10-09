import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DEMO_SALT as SALT, FEE_BPS, customerRef, type AppClient, type ImportRow } from "@venue-rwa/shared";
import { appendEntries, type NewEntry } from "./pos";

export const IMPORT_PRODUCT = "Impor sistem eksternal";

/** Produk penampung untuk transaksi impor (satu per perusahaan). Booking impor tidak punya slot jadwal nyata. */
async function importProduct(db: AppClient, companyId: string): Promise<string> {
  const { data } = await db.from("products").select("id").eq("company_id", companyId).eq("name", IMPORT_PRODUCT).maybeSingle();
  if (data) return data.id as string;
  const { data: p, error } = await db.from("products").insert({ company_id: companyId, name: IMPORT_PRODUCT, category: "impor", open_hour: 0, close_hour: 24, session_minutes: 15, price: 1, active: false }).select("id").single();
  if (error) throw new Error(error.message);
  return p.id as string;
}

export interface IngestResult { imported: number; duplicates: number; errors: { ref: string; message: string }[] }

/**
 * Masukkan transaksi dari sistem eksternal. Idempoten per (perusahaan, ref): mengirim ulang file/batch yang sama tidak menggandakan omzet.
 * Penjualan gateway dicatat sebagai pembayaran settled DENGAN psp_ref dari sistem asal (dicocokkan saat rekonsiliasi);
 * tunai/QRIS sendiri dicatat sebagai di luar jalur. Sumber ditandai agar platform menurunkan tingkat kepercayaan data.
 */
export async function ingestTransactions(db: AppClient, companyId: string, rows: ImportRow[], source: "import" | "api"): Promise<IngestResult> {
  const out: IngestResult = { imported: 0, duplicates: 0, errors: [] };
  const productId = await importProduct(db, companyId);
  const ordered = [...rows].sort((a, b) => (a.kind === b.kind ? a.occurredAt.localeCompare(b.occurredAt) : a.kind === "sale" ? -1 : 1));
  for (const r of ordered) {
    try {
      const { data: exists } = await db.from("bookings").select("id").eq("company_id", companyId).eq("external_ref", r.externalRef).maybeSingle();
      if (exists) { out.duplicates++; continue; }
      if (r.kind === "sale") await ingestSale(db, companyId, productId, r, source);
      else await ingestRefund(db, companyId, productId, r, source);
      out.imported++;
    } catch (e: any) {
      out.errors.push({ ref: r.externalRef, message: e?.message ?? String(e) });
    }
  }
  return out;
}

async function ingestSale(db: AppClient, companyId: string, productId: string, r: ImportRow, source: "import" | "api") {
  const id = `bk_${randomBytes(4).toString("hex")}`;
  const start = new Date(r.occurredAt);
  const label = (r.label ?? "Pelanggan").slice(0, 40);
  const { error } = await db.from("bookings").insert({
    id, company_id: companyId, product_id: productId, slot_start: start.toISOString(), slot_end: new Date(start.getTime() + 60_000).toISOString(), status: "paid",
    payment_method: r.method, source, external_ref: r.externalRef, customer_ref: customerRef(`${label}:${r.externalRef}`, SALT), customer_label: label, amount: r.amount,
  });
  if (error) throw new Error(error.message);
  try {
    // PB1 10% termasuk dalam harga bila sistem asal tidak melaporkan pajak (asumsi yang sama dengan PoS)
    const tax = r.tax ?? Math.round(r.amount / 11);
    const entries: NewEntry[] = [{ type: "sale" as const, amount: r.amount, bookingId: id, createdAt: r.occurredAt }, { type: "tax" as const, amount: tax, bookingId: id, createdAt: r.occurredAt }];
    if (r.method === "gateway") {
      const fee = r.fee ?? Math.round((r.amount * FEE_BPS) / 10_000);
      const { error: pe } = await db.from("payments").insert({ id: `pay_${randomUUID()}`, company_id: companyId, booking_id: id, psp_ref: r.pspRef!, pay_token: randomBytes(16).toString("hex"), status: "settled", gross: r.amount, fee, settled_at: r.occurredAt, simulated: false });
      if (pe) throw new Error(/unique|duplicate/i.test(pe.message) ? `psp_ref sudah dipakai: ${r.pspRef}` : pe.message);
      entries.push({ type: "fee" as const, amount: fee, bookingId: id, createdAt: r.occurredAt });
    }
    await appendEntries(db, companyId, entries);
  } catch (e) {
    await db.from("payments").delete().eq("booking_id", id);
    await db.from("bookings").delete().eq("id", id);
    throw e;
  }
}

async function ingestRefund(db: AppClient, companyId: string, productId: string, r: ImportRow, source: "import" | "api") {
  const { data: orig } = await db.from("bookings").select("id, status, amount").eq("company_id", companyId).eq("external_ref", r.originalRef!).maybeSingle();
  if (!orig) throw new Error(`penjualan asal tidak ditemukan: ${r.originalRef}`);
  if (orig.status !== "paid") throw new Error(`penjualan asal berstatus ${orig.status}`);
  if (r.amount > Number(orig.amount)) throw new Error("refund melebihi nilai penjualan asal");
  if (r.amount !== Number(orig.amount)) throw new Error("hanya refund penuh yang didukung; kirim refund parsial sebagai koreksi di sistem asal");
  // refund dicatat pada booking asal; ref refund disimpan lewat booking penanda agar impor ulang idempoten
  const id = `bk_${randomBytes(4).toString("hex")}`;
  const t = new Date(r.occurredAt);
  const { error } = await db.from("bookings").insert({
    id, company_id: companyId, product_id: productId, slot_start: t.toISOString(), slot_end: new Date(t.getTime() + 60_000).toISOString(), status: "cancelled", payment_method: "cash",
    source, external_ref: r.externalRef, customer_ref: customerRef(`refund:${r.externalRef}`, SALT), customer_label: "Refund", amount: r.amount,
  });
  if (error) throw new Error(error.message);
  await db.from("payments").update({ status: "refunded" }).eq("booking_id", orig.id);
  await db.from("bookings").update({ status: "refunded" }).eq("id", orig.id);
  await appendEntries(db, companyId, [{ type: "refund", amount: -r.amount, bookingId: orig.id, createdAt: r.occurredAt }]);
}

// ---------------------------------------------------------------- kunci API
const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

/** Kunci utuh hanya dikembalikan sekali; yang disimpan hanya hash dan 8 karakter awal. */
export async function createApiKey(db: AppClient, companyId: string, label: string, userId: string) {
  const key = `vrk_${randomBytes(24).toString("hex")}`;
  const { error } = await db.from("api_keys").insert({ company_id: companyId, label: label.slice(0, 60) || "Integrasi", prefix: key.slice(0, 8), key_hash: hashKey(key), created_by: userId });
  if (error) throw new Error(error.message);
  return key;
}

export async function revokeApiKey(db: AppClient, companyId: string, id: string) {
  await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId);
}

/** company_id diturunkan dari kunci, tidak pernah dari isi permintaan. */
export async function companyForKey(db: AppClient, key: string): Promise<string | null> {
  if (!/^vrk_[0-9a-f]{48}$/.test(key)) return null;
  const { data } = await db.from("api_keys").select("id, company_id").eq("key_hash", hashKey(key)).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.company_id as string;
}
