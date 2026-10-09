/** Logika murni integrasi KYC (Didit). Memakai WebCrypto sehingga jalan di Node dan browser. */

/** Bentuk kanonik JSON untuk tanda tangan webhook: kunci diurutkan rekursif, pemisah ringkas, Unicode dipertahankan. */
export function canonicalize(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/**
 * Verifikasi webhook Didit: X-Signature-V2 = HMAC-SHA256(secret, JSON kanonik dari body) heksadesimal; X-Timestamp maksimal 300 detik dari sekarang.
 * Tanpa secret yang dikonfigurasi, webhook DITOLAK (tidak pernah dipercaya begitu saja).
 */
export async function verifyDiditWebhook(args: { rawBody: string; signature: string | null; timestamp: string | null; secret: string | undefined; nowMs?: number }): Promise<boolean> {
  const { rawBody, signature, timestamp, secret } = args;
  if (!secret || !signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs((args.nowMs ?? Date.now()) / 1000 - ts) > 300) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return false; }
  return safeEqual(await hmacSha256Hex(secret, canonicalize(parsed)), signature.trim().toLowerCase());
}

export type KycState = "verified" | "rejected" | "review" | "expired" | "pending";
/** Status sesi Didit (peka huruf besar-kecil) → status internal. Hanya "Approved" yang memberi akses. */
export function kycStateOf(status: string): KycState {
  switch (status) {
    case "Approved": return "verified";
    case "Declined": return "rejected";
    case "In Review": return "review";
    case "Abandoned": case "Expired": case "Kyc Expired": return "expired";
    default: return "pending"; // Not Started, In Progress, Resubmitted, Awaiting User, dll.
  }
}
