import { z } from "zod";

/** Semua uang = integer rupiah (tanpa float). Entri refund bernilai negatif. */
export const Rupiah = z.number().int().safe();
export const PositiveRupiah = Rupiah.positive();
export const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const EvmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- POS ----------
export const BookingStatus = z.enum(["held", "paid", "cancelled", "completed", "refunded"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const LedgerEntryType = z.enum(["sale", "refund", "fee", "tax", "chargeback"]);
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;

export const PaymentStatus = z.enum(["pending", "settled", "failed", "expired", "refunded"]);

export const Company = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["pending", "active", "suspended"]),
  synthetic: z.boolean(),
});
export type Company = z.infer<typeof Company>;

/** Produk yang dijual: mis. Lapangan Basket A, dengan sesi berdurasi tetap antara jam buka dan tutup. */
export const Product = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string().min(1),
    category: z.string(),
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
    sessionMinutes: z.number().int().min(15).max(480),
    price: PositiveRupiah,
    peakPrice: PositiveRupiah.nullable(),
    active: z.boolean(),
  })
  .refine((p) => p.closeHour > p.openHour, "jam tutup harus setelah jam buka");
export type Product = z.infer<typeof Product>;

export const Booking = z.object({
  id: z.string(),
  companyId: z.string().uuid(),
  productId: z.string().uuid(),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  status: BookingStatus,
  customerRef: Hex32, // hash, bukan data pribadi
  amount: PositiveRupiah,
});
export type Booking = z.infer<typeof Booking>;

export const LedgerEntry = z.object({
  id: z.string(),
  companyId: z.string().uuid(),
  type: LedgerEntryType,
  amount: Rupiah, // bisa negatif
  bookingId: z.string().nullable(),
  createdAt: z.string().datetime(),
  prevHash: Hex32,
  hash: Hex32,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const DailyRoot = z.object({
  companyId: z.string(),
  date: IsoDate,
  merkleRoot: Hex32,
  count: z.number().int().nonnegative(),
  anchoredTx: Hex32.nullable(),
  cosignerSig: z.string().nullable(),
});
export type DailyRoot = z.infer<typeof DailyRoot>;

/** Webhook settlement PSP (adapter menormalkan Xendit/simulasi ke bentuk ini). */
export const SettlementEvent = z.object({
  pspRef: z.string(),
  bookingId: z.string(),
  gross: PositiveRupiah,
  fee: Rupiah.nonnegative(),
  settledAt: z.string().datetime(),
  simulated: z.boolean(),
});
export type SettlementEvent = z.infer<typeof SettlementEvent>;

// ---------- Verifikasi / attestation ----------
export const Verdict = z.enum(["pass", "fail"]);
export type Verdict = z.infer<typeof Verdict>;
/** Angka on-chain: 1 = pass, 2 = fail (0 = tidak ada). */
export const VERDICT_CODE = { pass: 1, fail: 2 } as const;

export const AttestationInput = z.object({
  series: EvmAddress,
  assetId: Hex32,
  verdict: Verdict,
  aiRecommendation: Verdict,
  score: z.number().int().min(0).max(10000),
  evidenceRoot: Hex32,
  rulesetHash: Hex32,
  maxPrice: PositiveRupiah,
  maxShareBps: z.number().int().min(1).max(10000),
  maxTotalShareBps: z.number().int().min(1).max(10000),
  expiry: z.number().int().positive(),
  overrideReasonHash: Hex32,
  nonce: z.number().int().nonnegative(),
});
export type AttestationInput = z.infer<typeof AttestationInput>;

/** Output ekstraksi dokumen (divalidasi skema; tiap angka menunjuk sumber). */
export const SourcedNumber = z.object({
  value: z.number(),
  source: z.object({ documentId: z.string(), page: z.number().int().positive(), quote: z.string().max(300) }),
});
export const OwnerDossier = z.object({
  leaseMonthsRemaining: SourcedNumber,
  monthlyBankInstallment: SourcedNumber,
  bankCovenantForbidsRevenueSale: z.boolean(),
  bankConsentLetter: z.boolean(),
  activeLandDispute: z.boolean(),
  gatewayMonthsOfHistory: z.number().int().nonnegative(),
});
export type OwnerDossier = z.infer<typeof OwnerDossier>;

export const ExceptionKind = z.enum(["unexplained_gap", "cash_outside_system", "fictitious_booking", "hash_chain_broken"]);
export const ReconException = z.object({
  id: z.string(),
  companyId: z.string(),
  date: IsoDate,
  kind: ExceptionKind,
  amount: Rupiah,
  explained: z.boolean(),
});
export type ReconException = z.infer<typeof ReconException>;

// ---------- Penawaran ----------
export const SeriesStatus = z.enum(["Draft", "Verifying", "Attested", "Offering", "Funded", "Failed", "Active", "Closed", "Superseded"]);
export type SeriesStatus = z.infer<typeof SeriesStatus>;

export const OfferingTerms = z
  .object({
    target: PositiveRupiah,
    minRaise: PositiveRupiah,
    unitPrice: PositiveRupiah,
    shareBps: z.number().int().min(1).max(10000), // 1000 = 10%
    tenorDays: z.number().int().min(30).max(36 * 31),
  })
  .refine((t) => t.minRaise <= t.target, "minRaise harus <= target")
  .refine((t) => t.unitPrice <= t.target, "unitPrice harus <= target");
export type OfferingTerms = z.infer<typeof OfferingTerms>;

export const KycStatus = z.object({
  wallet: EvmAddress,
  status: z.enum(["pending", "verified", "rejected"]),
  tier: z.number().int().min(0),
  verifiedAt: z.string().datetime().nullable(),
  simulated: z.boolean(),
});
export type KycStatus = z.infer<typeof KycStatus>;
