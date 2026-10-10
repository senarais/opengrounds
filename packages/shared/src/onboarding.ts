import { z } from "zod";
import { DEMO_PARAMS, EXAMPLE_STAKE_BPS, waterfall, type Waterfall } from "./economics";

/**
 * Formulir owner (PRD v4.1 §3.2, §8.3): gerbang data wajib. Venue tanpa NIB/NPWP atau tanpa sertifikat lahan
 * atas nama sendiri tidak lolos. Identitas badan usaha, lahan, rekening, dan rincian keuangan TIDAK pernah dibuka publik.
 */

/** Porsi hak ekonomi yang boleh ditawarkan owner (parameter kebijakan, bukan batas kontrak). */
export const MIN_STAKE_BPS = 1000;
export const MAX_STAKE_BPS = 5000;
export const MIN_FINANCIAL_MONTHS = 6;
export const MAX_FINANCIAL_MONTHS = 12;

export const SPORT_OPTIONS = ["futsal", "basket", "badminton", "padel", "tenis", "voli", "mini soccer", "lainnya"] as const;
export const SURFACE_OPTIONS = ["rumput sintetis", "vinyl", "parket kayu", "semen/beton", "karpet", "tanah liat", "lainnya"] as const;
export const LAND_RIGHTS = ["SHM", "HGB", "HGU", "HP"] as const;
export const LAND_RIGHT_LABEL: Record<(typeof LAND_RIGHTS)[number], string> = {
  SHM: "Freehold title · SHM", HGB: "Building-use title · HGB", HGU: "Cultivation title · HGU", HP: "Right-to-use title · HP",
};

const yyyymm = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM month format.");
const rupiah = z.number().int().min(0);
const person = z.object({ name: z.string().trim().min(3, "Name must be at least 3 characters.").max(100), title: z.string().trim().min(2).max(60) });

/** Satu lapangan/fasilitas yang disewakan. Menjadi produk awal di PoS setelah KYB disetujui. */
export const Facility = z.object({
  name: z.string().trim().min(2, "Facility name must be at least 2 characters.").max(40),
  sport: z.enum(SPORT_OPTIONS),
  lengthM: z.number().min(3, "Length must be at least 3 m.").max(200),
  widthM: z.number().min(3, "Width must be at least 3 m.").max(200),
  surface: z.enum(SURFACE_OPTIONS),
  indoor: z.boolean(),
  pricePerHour: z.number().int().min(10_000, "Hourly rate must be at least Rp10,000.").max(50_000_000),
});
export type Facility = z.infer<typeof Facility>;

/** Satu bulan riwayat keuangan: komponen waterfall §4.4 plus porsi pembayaran digital. */
export const FinancialMonth = z.object({
  month: yyyymm,
  gross: rupiah,
  refunds: rupiah,
  opex: rupiah,
  tax: rupiah,
  operatorFee: rupiah,
  reserve: rupiah,
  platformFee: rupiah,
  /** Omzet yang dibayar lewat gateway/QRIS (bukan tunai). Dasar ambang 90% digital. */
  digitalGross: rupiah,
  /** Total kredit rekening koran bulan itu (opsional, untuk rekonsiliasi). */
  bankCredits: rupiah.nullable().default(null),
});
export type FinancialMonth = z.infer<typeof FinancialMonth>;

export const toWaterfall = (m: FinancialMonth): Waterfall => ({
  gross: m.gross, refunds: m.refunds, opex: m.opex, tax: m.tax, operatorFee: m.operatorFee, reserve: m.reserve, platformFee: m.platformFee,
});

export const OnboardingInput = z
  .object({
    company: z.object({
      legalName: z.string().trim().min(3, "Legal name must be at least 3 characters.").max(100),
      nib: z.string().trim().regex(/^\d{13}$/, "NIB must contain 13 digits."),
      npwp: z.string().trim().regex(/^(\d{15}|\d{16})$/, "NPWP must contain 15 or 16 digits, without punctuation."),
      deedNumber: z.string().trim().min(1, "Enter the deed number.").max(40),
      deedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD deed date format."),
      registeredAddress: z.string().trim().min(10, "Registered address must be at least 10 characters.").max(250),
      kbli: z.string().trim().regex(/^\d{5}$/, "KBLI must contain 5 digits (e.g. 93112)."),
      directors: z.array(person).min(1, "Add at least one director.").max(10),
      commissioners: z.array(person).max(10).default([]),
      signatoryName: z.string().trim().min(3, "Enter the signatory’s name.").max(100),
      signatoryTitle: z.string().trim().min(2, "Enter the signatory’s title.").max(60),
      contactEmail: z.string().trim().email("Enter a valid contact email address."),
      contactPhone: z.string().trim().regex(/^(\+62|62|0)8\d{7,11}$/, "Enter a valid Indonesian mobile number (e.g. 08123456789)."),
    }),
    /** Pemilik manfaat dengan kepemilikan ≥25%. */
    beneficialOwners: z
      .array(z.object({
        fullName: z.string().trim().min(3).max(100),
        ownershipPct: z.number().min(25, "Only beneficial owners with at least 25% ownership are required.").max(100),
        idNumber: z.string().trim().regex(/^\d{16}$/, "National ID must contain 16 digits."),
      }))
      .min(1, "Add at least one beneficial owner with 25% or more ownership.")
      .max(4),
    venue: z.object({
      name: z.string().trim().min(3, "Venue name must be at least 3 characters.").max(60),
      address: z.string().trim().min(10).max(250),
      city: z.string().trim().min(2).max(60),
      province: z.string().trim().min(2).max(60),
      lat: z.number().min(-11).max(6).nullable().default(null),
      lng: z.number().min(95).max(141).nullable().default(null),
      sports: z.array(z.enum(SPORT_OPTIONS)).min(1, "Choose at least one sport."),
      openHour: z.number().int().min(0).max(23),
      closeHour: z.number().int().min(1).max(24),
      operatingSince: yyyymm,
      facilities: z.array(Facility).min(1, "Add at least one facility.").max(40),
    }),
    land: z.object({
      /** Gerbang: tanah harus milik badan usaha/pemilik sendiri (§2.3). */
      owned: z.boolean(),
      rightType: z.enum(LAND_RIGHTS),
      certificateNumber: z.string().trim().min(3).max(60),
      holderName: z.string().trim().min(3).max(100),
      encumbered: z.boolean(),
      /** Bila dijaminkan: ada persetujuan tertulis pemegang hak tanggungan untuk penjualan hak ekonomi. */
      encumbranceConsent: z.boolean().default(false),
      permits: z.array(z.string().trim().min(2).max(60)).max(10).default([]),
      /** V_aset klaim owner (tanah + bangunan + peralatan). Reviewer menetapkan nilai final dari dokumen. */
      assetValue: z.number().int().positive("Enter the estimated asset value."),
    }),
    financials: z.array(FinancialMonth).min(MIN_FINANCIAL_MONTHS, `Provide at least ${MIN_FINANCIAL_MONTHS} months of financial data (12 recommended).`).max(MAX_FINANCIAL_MONTHS),
    debt: z.object({
      outstanding: rupiah,
      monthlyInstallment: rupiah,
      lender: z.string().trim().max(80).default(""),
      /** Perjanjian kredit melarang menjual/menjaminkan pendapatan tanpa persetujuan kreditur. */
      covenantRestricts: z.boolean(),
    }),
    offering: z.object({
      tokenPrice: z.number().int().min(1000).max(100_000_000).optional(),
      stakeBps: z.number().int().min(MIN_STAKE_BPS, `Minimum ${MIN_STAKE_BPS / 100}%.`).max(MAX_STAKE_BPS, `Maximum ${MAX_STAKE_BPS / 100}%.`),
      useOfFunds: z.string().trim().min(10, "Describe how you plan to use the funds (at least 10 characters).").max(400),
    }),
    /** Rekening tujuan owner: atas nama badan usaha. Tidak pernah dibuka. */
    payout: z.object({
      bank: z.string().trim().min(2).max(40),
      accountName: z.string().trim().min(3).max(100),
      accountNumber: z.string().trim().regex(/^\d{6,20}$/, "Account number must contain 6–20 digits."),
    }),
    integrations: z.object({
      /** Owner setuju semua pembayaran digital venue lewat gateway yang ditetapkan platform (split-at-source). */
      gatewayOnly: z.literal(true, { errorMap: () => ({ message: "You must agree to route all digital venue payments through the platform gateway." }) }),
      bankDataAccess: z.boolean(),
    }),
    consent: z.object({
      dataProcessing: z.literal(true, { errorMap: () => ({ message: "Consent to data processing, including AI analysis, is required." }) }),
      truthful: z.literal(true, { errorMap: () => ({ message: "You must confirm that the submitted information is accurate." }) }),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.venue.closeHour <= v.venue.openHour) ctx.addIssue({ code: "custom", path: ["venue", "closeHour"], message: "Closing time must be later than opening time." });
    if (v.land.encumbered === false && v.land.encumbranceConsent) ctx.addIssue({ code: "custom", path: ["land", "encumbranceConsent"], message: "Lender consent only applies when the land is pledged." });
    const months = v.financials.map((m) => m.month);
    if (new Set(months).size !== months.length) ctx.addIssue({ code: "custom", path: ["financials"], message: "A month appears more than once." });
    const sorted = [...months].sort();
    if (sorted.join() !== months.join()) ctx.addIssue({ code: "custom", path: ["financials"], message: "Sort months from oldest to newest." });
    v.financials.forEach((m, i) => {
      const d = m.refunds + m.opex + m.tax + m.operatorFee + m.reserve + m.platformFee;
      if (d > m.gross) ctx.addIssue({ code: "custom", path: ["financials", i], message: `${m.month}: total deductions exceed gross revenue.` });
      if (m.digitalGross > m.gross) ctx.addIssue({ code: "custom", path: ["financials", i, "digitalGross"], message: `${m.month}: digital revenue exceeds gross revenue.` });
    });
    if (v.beneficialOwners.reduce((a, o) => a + o.ownershipPct, 0) > 100) ctx.addIssue({ code: "custom", path: ["beneficialOwners"], message: "Total ownership exceeds 100%." });
    if (v.debt.outstanding > 0 && v.debt.lender.length < 2) ctx.addIssue({ code: "custom", path: ["debt", "lender"], message: "Enter the lender’s name." });
  });
export type OnboardingInput = z.infer<typeof OnboardingInput>;

/** Ringkasan keuangan dari riwayat: D per bulan, D12 (disetahunkan bila < 12 bulan), porsi digital. */
export function financialSummary(months: FinancialMonth[], p: { stakeBps: number; spvFeeBps: number } = { stakeBps: EXAMPLE_STAKE_BPS, spvFeeBps: DEMO_PARAMS.spvFeeBps }) {
  const ds = months.map((m) => waterfall(toWaterfall(m), p.stakeBps, p.spvFeeBps).distributable);
  const sumD = ds.reduce((a, b) => a + b, 0);
  const gross = months.reduce((a, m) => a + m.gross, 0);
  const digital = months.reduce((a, m) => a + m.digitalGross, 0);
  return {
    monthlyD: ds,
    d12: months.length >= 12 ? sumD : Math.floor((sumD * 12) / Math.max(1, months.length)),
    annualized: months.length < 12,
    gross,
    digitalShareBps: gross > 0 ? Math.floor((digital * 10_000) / gross) : 0,
    avgOpexBps: gross > 0 ? Math.floor((months.reduce((a, m) => a + m.opex, 0) * 10_000) / gross) : 0,
  };
}

/** Simbol token ≤ 6 karakter, unik di antara `taken`. */
export function tokenSymbolFor(name: string, taken: string[] = []): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const base = ("G" + (letters.slice(0, 3) || "VEN")).padEnd(3, "X");
  const set = new Set(taken.map((t) => t.toUpperCase()));
  if (!set.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base.slice(0, 6 - String(i).length)}${i}`;
    if (!set.has(cand)) return cand;
  }
  throw new Error("simbol token habis");
}

export function slugFor(name: string, suffix: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "venue";
  return `${s}-${suffix}`;
}

/** Samarkan nomor (NIK, rekening): hanya 4 digit terakhir. */
export const maskNumber = (s: string) => (s.length <= 4 ? "****" : "•".repeat(Math.min(8, s.length - 4)) + s.slice(-4));
