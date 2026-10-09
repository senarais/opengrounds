"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeDailyRoot } from "@venue-rwa/connectors";
import { admin } from "@/lib/supabase";
import { canManage, requireSession } from "@/lib/session";
import { cancelBooking, createBooking, createOffRailBooking, refundBooking, syncPendingPayments } from "@/lib/pos";

/** Jalankan aksi, lalu kembali ke halaman asal dengan pesan hasil (?ok= / ?err=). */
async function run(back: string, fn: () => Promise<string | void>, extra?: () => Record<string, string>): Promise<never> {
  const [path, query = ""] = back.split("?");
  const qs = new URLSearchParams(query);
  qs.delete("ok"); qs.delete("err"); qs.delete("pay");
  let ok: string | undefined, err: string | undefined;
  try {
    ok = (await fn()) || undefined;
    if (extra) for (const [k, v] of Object.entries(extra())) qs.set(k, v);
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    err = e?.message ?? String(e);
  }
  if (err) qs.set("err", err); else if (ok) qs.set("ok", ok);
  revalidatePath("/", "layout");
  const q = qs.toString();
  redirect(q ? `${path}?${q}` : path!);
}

const backTo = (fd: FormData, d = "/schedule") => String(fd.get("back") || d);
const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");

async function guard() {
  const s = await requireSession();
  if (!canManage(s)) throw new Error("Peran Anda tidak boleh melakukan ini");
  return s;
}

// ---------------------------------------------------------------- booking
export async function newBooking(fd: FormData) {
  let token = "";
  return run(backTo(fd), async () => {
    const s = await guard();
    const base = { productId: String(fd.get("product")), date: String(fd.get("date")), sessionIndex: Number(fd.get("session")), customerLabel: String(fd.get("customer") || ""), createdBy: s.userId };
    const method = String(fd.get("method") || "gateway");
    if (method === "cash" || method === "qris_sendiri") {
      const r = await createOffRailBooking(admin(), s.company.id, { ...base, method });
      return `Booking ${r.bookingId} dicatat lunas di luar sistem (${method === "cash" ? "tunai" : "QRIS sendiri"}) · Sesi ${r.sessionIndex} · ${rp(r.amount)}. Tidak dihitung sebagai omzet terverifikasi gateway.`;
    }
    const r = await createBooking(admin(), s.company.id, base);
    token = r.payToken;
    return `Booking ${r.bookingId} dibuat · Sesi ${r.sessionIndex} · ${rp(r.amount)}. Tagihan otomatis terbit; kirim tautan bayar ke pelanggan (hold 10 menit).`;
  }, () => ({ pay: token }));
}
export async function syncPayments(fd: FormData) {
  return run(backTo(fd), async () => {
    const s = await guard();
    const r = await syncPendingPayments(admin(), s.company.id);
    return r.checked === 0 ? "Tidak ada tagihan Xendit yang menunggu." : `${r.checked} tagihan dicek: ${r.paid} sudah dibayar dan tercatat di ledger.`;
  });
}
export async function cancel(fd: FormData) {
  return run(backTo(fd), async () => {
    const s = await guard();
    await cancelBooking(admin(), s.company.id, String(fd.get("id")));
    return "Booking dibatalkan.";
  });
}
export async function refund(fd: FormData) {
  return run(backTo(fd), async () => {
    const s = await guard();
    await refundBooking(admin(), s.company.id, String(fd.get("id")));
    return "Refund dicatat sebagai entri NEGATIF baru di ledger (entri lama tidak diubah).";
  });
}

// ---------------------------------------------------------------- ledger
export async function makeRoot(fd: FormData) {
  return run(backTo(fd, "/ledger"), async () => {
    const s = await guard();
    const date = String(fd.get("date"));
    const r = await computeDailyRoot(admin(), s.company.id, date);
    return `Root ${date} dihitung: ${r.count} entri.`;
  });
}
// ---------------------------------------------------------------- produk
function parseProduct(fd: FormData) {
  const num = (k: string) => Number(String(fd.get(k) ?? "").replace(/\D/g, ""));
  const opt = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : num(k));
  const open = num("open_hour"), close = num("close_hour"), mins = num("session_minutes");
  const price = num("price"), peak = opt("peak_price");
  const ps = opt("peak_start_hour"), pe = opt("peak_end_hour");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("Nama produk wajib diisi");
  if (!(close > open)) throw new Error("Jam tutup harus setelah jam buka");
  if (mins < 15 || mins > 480) throw new Error("Durasi sesi 15–480 menit");
  if (!(price > 0)) throw new Error("Harga per sesi wajib diisi");
  if ((peak == null) !== (ps == null) || (peak == null) !== (pe == null)) throw new Error("Harga peak dan jamnya harus diisi bersamaan");
  if (ps != null && pe != null && !(pe > ps)) throw new Error("Jam akhir peak harus setelah jam awal");
  if (Math.floor(((close - open) * 60) / mins) < 1) throw new Error("Rentang jam buka tidak muat satu sesi pun");
  return { name, category: String(fd.get("category") || "lainnya"), open_hour: open, close_hour: close, session_minutes: mins, price, peak_price: peak, peak_start_hour: ps, peak_end_hour: pe };
}
export async function createProduct(fd: FormData) {
  return run("/products", async () => {
    const s = await guard();
    const { error } = await admin().from("products").insert({ company_id: s.company.id, ...parseProduct(fd) });
    if (error) throw new Error(error.message);
    return "Produk ditambahkan.";
  });
}
export async function updateProduct(fd: FormData) {
  return run("/products", async () => {
    const s = await guard();
    const { error } = await admin().from("products").update({ ...parseProduct(fd), active: fd.get("active") === "on" }).eq("id", String(fd.get("id"))).eq("company_id", s.company.id);
    if (error) throw new Error(error.message);
    return "Produk diperbarui. Booking yang sudah ada tidak berubah.";
  });
}

// ---------------------------------------------------------------- anggota
export async function addMember(fd: FormData) {
  return run("/settings", async () => {
    const s = await requireSession();
    if (s.role !== "owner") throw new Error("Hanya owner yang boleh menambah admin");
    const email = String(fd.get("email")).trim().toLowerCase();
    const password = String(fd.get("password"));
    if (password.length < 8) throw new Error("Kata sandi minimal 8 karakter");
    const sb = admin();
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    const { error: me } = await sb.from("members").insert({ company_id: s.company.id, user_id: data.user.id, role: String(fd.get("role")) === "cashier" ? "cashier" : "admin", display_name: String(fd.get("name") || email) });
    if (me) throw new Error(me.message);
    return `Anggota ${email} ditambahkan.`;
  });
}

// ---------------------------------------------------------------- connector sistem eksternal
export async function importCsv(fd: FormData) {
  return run("/import", async () => {
    const s = await guard();
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new Error("Pilih file CSV");
    if (f.size > 5 * 1024 * 1024) throw new Error("File maksimal 5 MB");
    const { rowsFromCsv } = await import("@venue-rwa/shared");
    const { ingestTransactions } = await import("@/lib/connector");
    const parsed = rowsFromCsv(await f.text());
    if (parsed.errors.length) throw new Error(`${parsed.errors.length} baris bermasalah. ${parsed.errors.slice(0, 5).map((e) => `baris ${e.line}: ${e.message}`).join(" | ")}`);
    const r = await ingestTransactions(admin(), s.company.id, parsed.rows, "import");
    const bad = r.errors.length ? ` ${r.errors.length} gagal: ${r.errors.slice(0, 3).map((e) => `${e.ref} (${e.message})`).join("; ")}` : "";
    return `${r.imported} transaksi diimpor, ${r.duplicates} sudah ada (dilewati).${bad}`;
  });
}

export async function makeApiKey(fd: FormData) {
  let key = "";
  return run("/import", async () => {
    const s = await guard();
    const { createApiKey } = await import("@/lib/connector");
    key = await createApiKey(admin(), s.company.id, String(fd.get("label") ?? ""), s.userId);
    return "Kunci API dibuat. Salin sekarang; tidak akan ditampilkan lagi.";
  }, () => ({ key }));
}

export async function dropApiKey(fd: FormData) {
  return run("/import", async () => {
    const s = await guard();
    const { revokeApiKey } = await import("@/lib/connector");
    await revokeApiKey(admin(), s.company.id, String(fd.get("id")));
    return "Kunci dicabut.";
  });
}
