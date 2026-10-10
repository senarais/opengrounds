/**
 * Ekonomi Open Grounds (PRD v4.1 §4). Semua rupiah bilangan bulat; pembagian selalu dibulatkan ke bawah.
 * Rumus di sini harus sama persis dengan VenueSeries.sol: angka yang di-attest dihitung ulang oleh kontrak.
 */

/** Parameter seri dan kebijakan. Semua bertanda [Asumsi] di PRD dan wajib dilabeli di UI. */
export const DEMO_PARAMS = {
  requiredYieldBps: 900, // r = 9%
  tokenPrice: 10_000, // p nominal
  spvFeeBps: 200, // m = 2% dari P_SPV
  splitBps: 1200, // s = 12% omzet ke kantong SPV
  sellbackDiscountBps: 0, // d
  maxHoldingBps: 10_000, // batas kepemilikan per investor (demo: tanpa batas)
  maxOpexBps: 8000, // plafon biaya operasional dari omzet kotor
  platformFeeBps: 300, // F_platform = 3% omzet kotor (PRD: besaran [Terbuka])
  expenseReviewThreshold: 10_000_000, // biaya satu bukti di atas ini ditinjau reviewer dulu
  yieldMinBps: 500, // Ymin 5%
  yieldMaxBps: 2000, // Ymax 20%
  lockSeconds: 600, // demo mode: 10 menit (production: 6 bulan)
  payoutWindowSeconds: 7 * 86_400, // tenggat Overdue
  defaultGraceSeconds: 14 * 86_400, // Overdue → Defaulted
  ownerSignWindowSeconds: 3 * 86_400, // owner diam lewat ini → verifier boleh menggantikan
  minDigitalShareBps: 9000, // ambang 90% pembayaran digital (§2.3)
  bankCoolingHours: 48, // ganti rekening investor
} as const;
/** Hanya CONTOH untuk tes dan skrip uji (PRD §4.6). X sebenarnya dipilih owner per venue (MIN_STAKE_BPS–MAX_STAKE_BPS), bukan parameter platform. */
export const EXAMPLE_STAKE_BPS = 5000;
export type SeriesParams = typeof DEMO_PARAMS;

export const bps = (amount: number, b: number) => Math.floor((amount * b) / 10_000);

// ---------------------------------------------------------------- valuasi (§4.1–4.3)

export interface ValuationInput {
  assetValue: number; // V_aset
  d12: number; // D 12 bulan terverifikasi
  requiredYieldBps: number;
  stakeBps: number;
  tokenPrice: number;
  yieldMinBps: number;
  yieldMaxBps: number;
}
export interface Valuation {
  vIncome: number;
  v: number; // dibulatkan ke bawah agar S habis dibagi p
  basis: "asset" | "income";
  yieldBps: number; // y = D12 / V
  inBand: boolean;
  stakeValue: number; // S = V × X
  supply: number; // N
  refPrice: number; // p_ref = V × X ÷ N
}

export function valuation(i: ValuationInput): Valuation {
  if (i.d12 <= 0) throw new Error("D12 must be positive; a venue cannot be valued without verified distributable profit.");
  if (i.assetValue <= 0) throw new Error("Asset value must be positive.");
  const vIncome = Math.floor((i.d12 * 10_000) / i.requiredYieldBps);
  const raw = Math.min(i.assetValue, vIncome);
  // S = V × X harus habis dibagi p, dan kontrak memeriksa refPrice × N × 10000 == V × X: pilih V kelipatan unit itu
  const step = (i.tokenPrice * 10_000) / gcd(i.stakeBps, i.tokenPrice * 10_000);
  const v = Math.floor(raw / step) * step;
  if (v <= 0) throw new Error("Valuation is too small for this token price.");
  const stakeValue = (v * i.stakeBps) / 10_000;
  const supply = stakeValue / i.tokenPrice;
  const yieldBps = Math.floor((i.d12 * 10_000) / v);
  return {
    vIncome, v, basis: i.assetValue <= vIncome ? "asset" : "income", yieldBps,
    inBand: yieldBps >= i.yieldMinBps && yieldBps <= i.yieldMaxBps, stakeValue, supply, refPrice: i.tokenPrice,
  };
}

/** Harga referensi baru setelah revaluasi (§4.9): sama dengan kontrak updateValuation. */
export const revaluedRefPrice = (newValuation: number, stakeBps: number, supply: number) => Math.floor((newValuation * stakeBps) / 10_000 / supply);

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

// ---------------------------------------------------------------- waterfall (§4.4)

export interface Waterfall {
  gross: number;
  refunds: number;
  opex: number;
  tax: number;
  operatorFee: number;
  reserve: number;
  platformFee: number;
}
export interface WaterfallResult {
  deductions: number;
  distributable: number; // D
  pSpv: number; // D × X
  fSpv: number; // P_SPV × m
  pInv: number; // pool investor
  pOwner: number; // D × (1 − X) + fee operator
}

/** Sama dengan pemeriksaan kontrak: potongan ≤ omzet kotor dan opex ≤ plafon. Lempar Error bila dilanggar. */
export function checkWaterfall(w: Waterfall, maxOpexBps: number) {
  for (const [k, v] of Object.entries(w)) if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a whole number ≥ 0.`);
  const d = w.refunds + w.opex + w.tax + w.operatorFee + w.reserve + w.platformFee;
  if (d > w.gross) throw new Error("Total deductions exceed gross revenue (the contract will reject this).");
  if (w.opex * 10_000 > w.gross * maxOpexBps) throw new Error(`Operating expenses exceed the ${maxOpexBps / 100}% gross-revenue cap (the contract will reject this).`);
}

export function waterfall(w: Waterfall, stakeBps: number, spvFeeBps: number): WaterfallResult {
  const deductions = w.refunds + w.opex + w.tax + w.operatorFee + w.reserve + w.platformFee;
  const distributable = Math.max(0, w.gross - deductions);
  const pSpv = bps(distributable, stakeBps);
  const fSpv = bps(pSpv, spvFeeBps);
  const pInv = pSpv - fSpv;
  return { deductions, distributable, pSpv, fSpv, pInv, pOwner: distributable - pSpv + w.operatorFee };
}

// ---------------------------------------------------------------- jatah per token (§4.5)

export const E18 = 10n ** 18n;

/** Sama dengan kontrak: total = P_inv × 1e18 + dustE18; Δacc = total ÷ N; sisa (dalam satuan 1e18) dibawa ke periode berikutnya. */
export function accrue(pInv: bigint, dustE18: bigint, supply: bigint): { deltaE18: bigint; dustE18: bigint } {
  const total = pInv * E18 + dustE18;
  return { deltaE18: total / supply, dustE18: total % supply };
}

/** Jatah satu pemegang untuk satu periode: floor(saldo saat posting × Δacc ÷ 1e18). Jumlah semua pemegang ≤ kewajiban periode. */
export const holderShare = (tokens: bigint, deltaE18: bigint) => (tokens * deltaE18) / E18;

/** Kewajiban periode ke investor: (N − saldo treasury) × Δacc ÷ 1e18. */
export const periodObligation = (circulating: bigint, deltaE18: bigint) => (circulating * deltaE18) / E18;

// ---------------------------------------------------------------- split dan koreksi (§3.6.1–3.6.2)

/** Bagian kantong SPV dari satu pembayaran booking. */
export const splitOf = (gross: number, splitBps: number) => ({ spv: bps(gross, splitBps), owner: gross - bps(gross, splitBps) });

/** + = kelebihan dikembalikan ke owner; − = kekurangan dilengkapi owner. */
export const trueUp = (pocketCollected: number, pSpv: number) => pocketCollected - pSpv;

// ---------------------------------------------------------------- jual balik (§4.8)

export const sellbackPrice = (refPrice: number, discountBps: number) => refPrice - bps(refPrice, discountBps);
/** Sama dengan kontrak: paid × 10000 == tokens × ref × (10000 − d). */
export function sellbackAmount(tokens: number, refPrice: number, discountBps: number): number {
  const scaled = tokens * refPrice * (10_000 - discountBps);
  if (scaled % 10_000 !== 0) throw new Error("This token quantity produces a fractional rupiah amount. Change the quantity.");
  return scaled / 10_000;
}
