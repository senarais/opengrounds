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

// ---------- Rekonsiliasi ----------
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

// ---------- Seri (PRD v4.1 §5.1; urutan = enum State di VenueSeries.sol) ----------
export const SERIES_STATES = ["Draft", "Verified", "Active", "Disputed", "Overdue", "Defaulted", "Liquidating", "Closed"] as const;
export const SeriesStatus = z.enum(SERIES_STATES);
export type SeriesStatus = z.infer<typeof SeriesStatus>;

export const KycStatus = z.object({
  wallet: EvmAddress,
  status: z.enum(["pending", "verified", "rejected"]),
  tier: z.number().int().min(0),
  verifiedAt: z.string().datetime().nullable(),
  simulated: z.boolean(),
});
export type KycStatus = z.infer<typeof KycStatus>;
