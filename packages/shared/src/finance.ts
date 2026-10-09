/** Matematika inti. Semua integer rupiah; pembulatan selalu ke bawah untuk investor. */

export interface RevenueComponents {
  settledGross: number;
  refunds: number; // nilai positif
  chargebacks: number;
  taxes: number;
  gatewayFees: number;
}

/** Eligible Revenue = omzet settle − refund − chargeback − pajak − biaya gateway. BUKAN laba. */
export function eligibleRevenue(c: RevenueComponents): number {
  return c.settledGross - c.refunds - c.chargebacks - c.taxes - c.gatewayFees;
}

/** Bagian investor dari satu transaksi (basis points), dibulatkan ke bawah. */
export function investorSplit(eligibleAmount: number, shareBps: number): number {
  return Math.floor((eligibleAmount * shareBps) / 10_000);
}

export interface PoolState {
  P: bigint; // total masuk kantong (final)
  R: bigint; // total sudah dibayar
  S: bigint; // suplai
}

/** Nilai tebus per token (belum dibulatkan): (P − R) / S. Return rupiah per token, dibulatkan ke bawah. */
export function redeemValuePerToken(p: PoolState): bigint {
  if (p.S === 0n) return 0n;
  return (p.P - p.R) / p.S;
}

/** Redeem k token membayar floor(k × (P − R) / S). */
export function redeemPayout(p: PoolState, k: bigint): bigint {
  if (k <= 0n || k > p.S) throw new Error("jumlah token tidak valid");
  return (k * (p.P - p.R)) / p.S;
}

export function applyRedeem(p: PoolState, k: bigint): { next: PoolState; payout: bigint } {
  const payout = redeemPayout(p, k);
  return { next: { P: p.P, R: p.R + payout, S: p.S - k }, payout };
}

export function supplyFor(target: number, unitPrice: number): number {
  return Math.floor(target / unitPrice);
}

// ---------- Harga referensi & pita ----------
export interface ReferencePriceInput {
  monthlyMedianRevenue12m: number; // median omzet bulanan 12 bln
  haircut: number; // 0..1, mis. 0.10
  shareBps: number;
  tenorMonths: number;
  tokenSupply: number;
  minInvestorMargin: number; // mis. 0.30
}

/** Proyeksi bayaran per token selama tenor ÷ (1 + margin minimum investor). */
export function referencePrice(i: ReferencePriceInput): number {
  const monthly = i.monthlyMedianRevenue12m * (1 - i.haircut);
  const totalPayout = (monthly * i.shareBps * i.tenorMonths) / 10_000;
  const perToken = totalPayout / i.tokenSupply;
  return Math.floor(perToken / (1 + i.minInvestorMargin));
}

export type PriceBand = "ok" | "ok_below_reference_warning" | "needs_reviewer" | "rejected";

/** ≤ +10% otomatis; +10–25% butuh reviewer + bukti baru; > +25% ditolak; di bawah referensi boleh dengan peringatan. */
export function priceBand(price: number, reference: number, autoPct = 0.1, rejectPct = 0.25): PriceBand {
  if (price < reference) return "ok_below_reference_warning";
  const over = (price - reference) / reference;
  if (over <= autoPct) return "ok";
  if (over <= rejectPct) return "needs_reviewer";
  return "rejected";
}

/** Harga maksimal yang boleh masuk attestation = referensi × (1 + rejectPct). */
export function maxAllowedPrice(reference: number, rejectPct = 0.25): number {
  return Math.floor(reference * (1 + rejectPct));
}

export const SIMULATED_LABEL = "SIMULASI — bukan uang riil, bukan produk disetujui OJK";
export const SYNTHETIC_LABEL = "DATA SINTETIS";

/** Biaya gateway QRIS (simulasi) 0,7% dalam basis points. */
export const FEE_BPS = 70;
/** Salt hash referensi pelanggan (demo). */
export const DEMO_SALT = "venue-rwa-demo-salt";
