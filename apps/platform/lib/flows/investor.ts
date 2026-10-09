import { createHash } from "node:crypto";
import type { Address } from "viem";
import { DEMO_PARAMS, kycStateOf, maskNumber, type KycState } from "@venue-rwa/shared";
import { publicClient, seriesTokenAbi, venueSeriesAbi } from "../chain";
import { platformDb } from "../db";
import { createSession, diditConfig, getDecision } from "../didit";
import { audit } from "../flow";
import { operatorSend } from "../operator";

/**
 * Investor: KYC (Didit, atau mock berlabel bila DIDIT_* kosong), rekening bank atas nama sendiri (nama = nama KYC),
 * allowlist on-chain per seri. Platform tidak menyimpan KTP/selfie; nama KYC disimpan untuk pencocokan rekening (staf saja).
 */

export async function kycOf(userId: string) {
  const { data } = await platformDb().from("kyc_records").select("*").eq("user_id", userId).maybeSingle();
  return data;
}
export const isVerified = (k: { status: string } | null | undefined) => k?.status === "verified";

/** Mock KYC (sandbox): hanya bila Didit tidak dikonfigurasi. Dilabeli di UI. */
export async function mockKyc(userId: string, wallet: string | null, fullName: string) {
  if (diditConfig().configured) throw new Error("KYC memakai Didit; mock tidak tersedia");
  const name = fullName.trim().replace(/\s+/g, " ");
  if (name.length < 3) throw new Error("Nama lengkap minimal 3 karakter");
  await platformDb().from("kyc_records").upsert({ user_id: userId, wallet, status: "verified", full_name: name, provider: "mock", verified_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await audit(userId, "kyc.mock_verified", { entity: "kyc_records", entityId: userId });
}

export async function startDiditKyc(userId: string, wallet: string | null, origin: string) {
  const base = process.env.PLATFORM_URL || origin;
  const db = platformDb();
  const { data: record, error: recordError } = await db.from("kyc_records").select("status").eq("user_id", userId).maybeSingle();
  if (recordError) throw new Error(recordError.message);
  if (isVerified(record)) return `${base}/portfolio`;
  const { data: current, error: currentError } = await db.from("kyc_sessions").select("session_id, url, state").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (current?.state === "verified" || current?.state === "review") {
    await syncDiditKyc(userId);
    return `${base}/portfolio`;
  }
  if (current?.state === "pending" && current.url) return current.url;
  const s = await createSession({ vendorData: userId, callback: `${base}/portfolio?kyc=return` });
  const { error } = await db.from("kyc_sessions").insert({ user_id: userId, wallet, session_id: s.session_id, url: s.url, status: s.status, state: kycStateOf(s.status) });
  if (error) {
    if (error.code !== "23505") throw new Error(error.message);
    // A repeated provider response or concurrent request must not reassign a session.
    const { data: existing, error: existingError } = await db.from("kyc_sessions").select("user_id, url, state").eq("session_id", s.session_id).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing || existing.user_id !== userId) throw new Error("Sesi verifikasi tidak cocok dengan akun Anda. Hubungi tim Open Grounds.");
    if (existing.state === "verified" || existing.state === "review") return `${base}/portfolio`;
    if (existing.state !== "pending") throw new Error("Sesi verifikasi sebelumnya sudah berakhir. Hubungi tim untuk memulai sesi baru.");
    return existing.url || s.url;
  }
  return s.url;
}

/** Terapkan status sesi Didit. Idempoten; tidak pernah menurunkan status verified. */
export async function applyDiditStatus(sessionId: string, status: string, eventId?: string, fullName?: string | null): Promise<KycState | null> {
  const db = platformDb();
  const { data: row } = await db.from("kyc_sessions").select("*").eq("session_id", sessionId).maybeSingle();
  if (!row) return null;
  if (eventId && row.event_id === eventId) return row.state as KycState;
  const state = kycStateOf(status);
  if (row.state === "verified" && state !== "verified") return "verified";
  await db.from("kyc_sessions").update({ status, state, event_id: eventId ?? row.event_id, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (state === "verified" || state === "rejected") {
    await db.from("kyc_records").upsert({
      user_id: row.user_id, wallet: row.wallet, status: state, full_name: fullName ?? null, provider: "didit", vendor_ref: sessionId,
      verified_at: state === "verified" ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    });
    await audit("platform", `kyc.${state}`, { entity: "kyc_records", entityId: row.user_id });
  }
  return state;
}

export async function syncDiditKyc(userId: string) {
  if (!diditConfig().configured) return null;
  const { data: row } = await platformDb().from("kyc_sessions").select("session_id, state").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || row.state === "verified") return row?.state ?? null;
  const d: any = await getDecision(row.session_id);
  const idv = d.id_verification ?? d.id_verifications?.[0] ?? {};
  const name = idv.full_name ?? ([idv.first_name, idv.last_name].filter(Boolean).join(" ") || null);
  return applyDiditStatus(row.session_id, d.status, undefined, name);
}

// ---------------------------------------------------------------- rekening bank (§3.6.3)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/** Pencocokan nama pemilik rekening dengan nama KYC (mock: perbandingan teks; layanan cek nama bank belum terverifikasi). */
export const namesMatch = (a: string, b: string) => norm(a) === norm(b);

export async function activeBankAccount(userId: string) {
  const { data } = await platformDb().from("investor_bank_accounts").select("*").eq("user_id", userId).in("status", ["verified", "cooling_off"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.status === "cooling_off" && data.cooling_until && Date.parse(data.cooling_until) <= Date.now()) {
    await platformDb().from("investor_bank_accounts").update({ status: "verified" }).eq("id", data.id);
    data.status = "verified";
  }
  return data;
}

/** Daftarkan/ganti rekening. Nama harus sama dengan nama KYC. Ganti rekening = cooling-off 48 jam (penarikan ditahan). */
export async function registerBankAccount(userId: string, a: { bank: string; accountNumber: string; holderName: string }) {
  const kyc = await kycOf(userId);
  if (!isVerified(kyc)) throw new Error("Selesaikan KYC dulu");
  if (!/^\d{6,20}$/.test(a.accountNumber)) throw new Error("Nomor rekening 6–20 digit");
  if (a.bank.trim().length < 2) throw new Error("Nama bank wajib diisi");
  const match = kyc!.full_name ? namesMatch(a.holderName, kyc!.full_name) : false;
  const pf = platformDb();
  const prev = await activeBankAccount(userId);
  if (!match) {
    await pf.from("investor_bank_accounts").insert({ user_id: userId, bank: a.bank.trim(), account_masked: maskNumber(a.accountNumber), account_hash: sha(a.accountNumber), holder_name: a.holderName.trim(), name_matches: false, status: "rejected" });
    throw new Error(kyc!.full_name ? "Nama pemilik rekening tidak sama dengan nama KYC. Rekening harus atas nama Anda sendiri." : "Nama KYC tidak tersedia dari penyedia; hubungi tim.");
  }
  const cooling = !!prev;
  if (prev) await pf.from("investor_bank_accounts").update({ status: "replaced" }).eq("id", prev.id);
  await pf.from("investor_bank_accounts").insert({
    user_id: userId, bank: a.bank.trim(), account_masked: maskNumber(a.accountNumber), account_hash: sha(a.accountNumber), holder_name: a.holderName.trim(), name_matches: true,
    status: cooling ? "cooling_off" : "verified", cooling_until: cooling ? new Date(Date.now() + DEMO_PARAMS.bankCoolingHours * 3_600_000).toISOString() : null,
  });
  await audit(userId, cooling ? "bank.replace" : "bank.register", { entity: "investor_bank_accounts", entityId: userId, after: { bank: a.bank, masked: maskNumber(a.accountNumber) } });
  return cooling ? `Rekening diganti. Penarikan ditahan ${DEMO_PARAMS.bankCoolingHours} jam (masa tunggu keamanan).` : "Rekening terverifikasi (nama cocok dengan KYC).";
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Syarat sebelum membeli: wallet, KYC, rekening terverifikasi. Lempar Error dengan langkah yang kurang. */
export async function assertCanBuy(me: { userId: string; wallet: string | null }) {
  if (!me.wallet) throw new Error("Wallet Anda belum siap. Tunggu sebentar di halaman Portofolio.");
  if (!isVerified(await kycOf(me.userId))) throw new Error("Selesaikan KYC di halaman Portofolio dulu.");
  if (!(await activeBankAccount(me.userId))) throw new Error("Daftarkan rekening bank atas nama Anda di halaman Portofolio dulu.");
}

/** Allowlist on-chain (isVerified) untuk wallet investor di satu seri. Idempoten. */
export async function allowOnchain(series: Address, token: Address, wallet: Address) {
  const ok = await publicClient.readContract({ address: token, abi: seriesTokenAbi, functionName: "isVerified", args: [wallet] });
  if (ok) return null;
  return operatorSend(series, venueSeriesAbi as any, "setVerified", [wallet, true]);
}
