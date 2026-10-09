/** Konstanta PoS. Matematika ekonomi seri ada di economics.ts. Semua integer rupiah. */

/** Omzet bersih transaksi di PoS = settle − refund − chargeback − pajak − biaya gateway (bahan baris "gross" dan "refunds" waterfall). */
export interface RevenueComponents {
  settledGross: number;
  refunds: number;
  chargebacks: number;
  taxes: number;
  gatewayFees: number;
}
export function eligibleRevenue(c: RevenueComponents): number {
  return c.settledGross - c.refunds - c.chargebacks - c.taxes - c.gatewayFees;
}

export const SIMULATED_LABEL = "SIMULASI: bukan uang riil";

/** Biaya gateway QRIS (estimasi bila PSP tidak mengembalikan fee) 0,7% dalam basis points. */
export const FEE_BPS = 70;
/** Salt hash referensi pelanggan (demo). */
export const DEMO_SALT = "venue-rwa-demo-salt";
