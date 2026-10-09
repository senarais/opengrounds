import { kycStateOf, type KycState } from "@venue-rwa/shared";
import { platformDb } from "../db";
import { audit } from "../flow";
import { createSession, diditConfig, getDecision } from "../didit";

/** Mulai sesi verifikasi Didit untuk akun (wallet harus sudah terhubung: status KYC terikat wallet). */
export async function startKyc(user: { userId: string; wallet: string | null }, origin: string) {
  if (!user.wallet) throw new Error("Hubungkan wallet dulu");
  const base = process.env.PLATFORM_URL || origin;
  const s = await createSession({ vendorData: user.userId, callback: `${base}/portfolio?kyc=return` });
  const { error } = await platformDb().from("kyc_sessions").insert({ user_id: user.userId, wallet: user.wallet, session_id: s.session_id, url: s.url, status: s.status, state: kycStateOf(s.status) });
  if (error) throw new Error(error.message);
  return s.url;
}

/** Terapkan status ke sesi dan, bila Approved, ke kyc_status wallet. Idempoten; tidak pernah menurunkan status verified. */
export async function applyStatus(sessionId: string, status: string, eventId?: string): Promise<KycState | null> {
  const db = platformDb();
  const { data: row } = await db.from("kyc_sessions").select("id, user_id, wallet, state, event_id").eq("session_id", sessionId).maybeSingle();
  if (!row) return null;
  if (eventId && row.event_id === eventId) return row.state as KycState; // webhook duplikat
  const state = kycStateOf(status);
  if (row.state === "verified" && state !== "verified") return "verified";
  await db.from("kyc_sessions").update({ status, state, event_id: eventId ?? row.event_id, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (state === "verified" && row.wallet) {
    const { error } = await db.from("kyc_status").upsert({ wallet: row.wallet, status: "verified", tier: 2, verified_at: new Date().toISOString(), simulated: false, vendor_ref: sessionId });
    if (error) throw new Error(error.message);
    await audit("platform", "kyc_verified", { user: row.user_id, session: sessionId });
  } else if (state === "rejected" && row.wallet) {
    await db.from("kyc_status").upsert({ wallet: row.wallet, status: "rejected", tier: 0, simulated: false, vendor_ref: sessionId }, { ignoreDuplicates: true });
  }
  return state;
}

/** Tarik keputusan terbaru dari Didit (dipakai saat pengguna kembali dari Didit, tanpa webhook publik). */
export async function syncKyc(userId: string) {
  if (!diditConfig().configured) return null;
  const { data: row } = await platformDb().from("kyc_sessions").select("session_id, state").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || row.state === "verified") return row?.state ?? null;
  const d = await getDecision(row.session_id);
  return applyStatus(row.session_id, d.status);
}

export async function latestKyc(userId: string) {
  const { data } = await platformDb().from("kyc_sessions").select("state, status, url, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}
