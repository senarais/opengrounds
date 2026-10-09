import { z } from "zod";
import { PositiveRupiah } from "./schemas";

/** Batas total beban atas omzet (bps) yang berlaku di kontrak attestation: persen seri tidak boleh melebihinya. */
export const MAX_SHARE_BPS = 5000;

const yesNo = z.boolean();

export const SPORT_OPTIONS = ["futsal", "basket", "badminton", "padel", "tenis", "voli", "mini soccer", "lainnya"] as const;
export const SURFACE_OPTIONS = ["rumput sintetis", "vinyl", "parket kayu", "semen/beton", "karpet", "tanah liat", "lainnya"] as const;
/** Bila tidak ada sewa, hak atas lahan tidak kedaluwarsa dalam tenor: dipakai nilai besar agar gerbang "sewa ≥ tenor" lolos. */
export const OWNED_LEASE_MONTHS = 600;
export const INSURANCE_COVERAGE = [
  { id: "kebakaran", label: "Kebakaran" },
  { id: "gempa", label: "Gempa bumi" },
  { id: "banjir", label: "Banjir" },
  { id: "tanggung_gugat", label: "Tanggung gugat pihak ketiga (cedera pengunjung)" },
  { id: "gangguan_usaha", label: "Gangguan usaha (kehilangan pendapatan saat tutup)" },
] as const;
export const COLLATERAL_OPTIONS = ["tidak ada", "tanah/bangunan", "peralatan/aset usaha", "piutang/pendapatan", "lainnya"] as const;

/** Satu lapangan/fasilitas yang disewakan. Menjadi produk awal di PoS saat pengajuan disetujui. */
export const Facility = z.object({
  name: z.string().trim().min(2, "Nama lapangan minimal 2 karakter").max(40),
  sport: z.enum(SPORT_OPTIONS),
  lengthM: z.number().min(3, "Panjang minimal 3 m").max(200),
  widthM: z.number().min(3, "Lebar minimal 3 m").max(200),
  surface: z.enum(SURFACE_OPTIONS),
  indoor: z.boolean(),
  pricePerHour: z.number().int().min(10_000, "Tarif per jam minimal Rp10.000").max(50_000_000),
});
export type Facility = z.infer<typeof Facility>;

/** Omzet satu bulan: rincian dari bruto ke Eligible Revenue (chargeback dihitung bersama refund). */
export const MonthRevenue = z.object({
  gross: z.number().int().min(0),
  refund: z.number().int().min(0),
  tax: z.number().int().min(0),
  fee: z.number().int().min(0),
});
export type MonthRevenue = z.infer<typeof MonthRevenue>;
export const eligibleOf = (m: MonthRevenue) => m.gross - m.refund - m.tax - m.fee;

/** Sisa bulan polis (0 bila berakhir bulan ini; negatif bila sudah lewat). */
export const insuranceMonthsLeft = (validUntil: string, now = new Date()) => -monthsSince(validUntil, now);

/** Jumlah bulan penuh antara "YYYY-MM" dan sekarang. */
export function monthsSince(yyyymm: string, now = new Date()): number {
  const [y, m] = yyyymm.split("-").map(Number);
  return (now.getUTCFullYear() - y!) * 12 + (now.getUTCMonth() + 1 - m!);
}

/** Input form pengajuan owner. Semua angka rupiah = integer. */
export const ApplicationInput = z
  .object({
    company: z.object({
      name: z.string().trim().min(3, "Nama perusahaan minimal 3 karakter").max(60),
      city: z.string().trim().min(2, "Kota wajib diisi").max(60),
      /** Kecamatan/kawasan, kota, provinsi: publik. Jalan, kelurahan, kode pos, patokan: SENSITIF (hanya investor KYC). */
      area: z.string().trim().min(2, "Kecamatan/kawasan wajib diisi").max(80),
      province: z.string().trim().min(2, "Provinsi wajib diisi").max(60),
      address: z.string().trim().min(5, "Jalan dan nomor wajib diisi").max(200),
      kelurahan: z.string().trim().min(2, "Kelurahan wajib diisi").max(80),
      postalCode: z.string().trim().regex(/^\d{5}$/, "Kode pos harus 5 digit"),
      landmark: z.string().trim().max(120).default(""),
      sports: z.array(z.string()).min(1, "Pilih minimal satu jenis olahraga"),
      courts: z.number().int().min(1).max(200),
      /** Ukuran dan jenis lantai/rumput per jenis lapangan (publik): menentukan kapasitas dan kewajaran proyeksi. */
      courtSpecs: z.string().trim().min(5, "Isi ukuran dan jenis lantai lapangan").max(400),
      openHour: z.number().int().min(0).max(23),
      closeHour: z.number().int().min(1).max(24),
      tariffNote: z.string().trim().min(3, "Isi ringkasan tarif").max(300),
      facilities: z.array(Facility).min(1, "Isi minimal satu lapangan").max(40),
    }),
    offering: z.object({
      target: PositiveRupiah,
      minRaise: PositiveRupiah,
      unitPrice: PositiveRupiah,
      shareBps: z.number().int().min(1).max(MAX_SHARE_BPS, `Bagian omzet maksimal ${MAX_SHARE_BPS / 100}%`),
      tenorMonths: z.number().int().min(3, "Tenor minimal 3 bulan").max(36, "Tenor maksimal 36 bulan"),
      useOfFunds: z.string().trim().max(300).default(""),
    }),
    dossier: z.object({
      leaseMonthsRemaining: z.number().int().min(0).max(600),
      monthlyBankInstallment: z.number().int().min(0),
      bankCovenantForbidsRevenueSale: yesNo,
      bankConsentLetter: yesNo,
      activeLandDispute: yesNo,
      /** Wajib bila ada sengketa: jenis dan status singkat, TANPA nama individu atau nomor identitas. Hanya staf yang melihat. */
      disputeNote: z.string().trim().max(300).default(""),
      hasNpwp: yesNo,
      hasBusinessLicense: yesNo,
      /** Ada transaksi/hubungan dengan pihak terkait owner? Wajib diungkapkan. */
      relatedParty: yesNo,
      relatedPartyNote: z.string().trim().max(300).default(""),
      /** Utang dalam angka. */
      debtOutstanding: z.number().int().min(0),
      debtRemainingMonths: z.number().int().min(0).max(600),
      collateral: z.enum(COLLATERAL_OPTIONS),
      /** Persen omzet yang SUDAH dijanjikan ke pihak lain (bagi hasil/tokenisasi lain), dalam basis points. 0 = tidak ada. */
      otherPledgedBps: z.number().int().min(0).max(10_000),
      otherPledgeNote: z.string().trim().max(300).default(""),
      monthlyOpex: z.number().int().min(0),
    }),
    /** Status kepemilikan tanah dan bangunan. Milik sendiri butuh bukti kepemilikan (diunggah di langkah dokumen). */
    property: z.object({
      land: z.enum(["milik", "sewa"]),
      building: z.enum(["milik", "sewa", "tidak_ada"]),
      /** Hanya bila ada aset milik sendiri: sertifikat/aset sedang dijaminkan (mis. ke bank)? */
      ownedAssetPledged: yesNo,
      /** Wajib bila dijaminkan: kepada siapa dan untuk apa, tanpa nomor sertifikat. Hanya staf yang melihat. */
      ownedAssetPledgedNote: z.string().trim().max(300).default(""),
    }),
    /** Wajib bila tanah atau bangunan disewa. */
    lease: z
      .object({
        landlord: z.string().trim().min(2, "Nama pemilik lahan wajib diisi").max(100),
        monthlyRent: z.number().int().min(0),
        remainingMonths: z.number().int().min(0).max(600),
        renewalOption: yesNo,
        landlordConsentsToSale: yesNo,
      })
      .nullable(),
    assets: z.object({
      builtYear: z.number().int().min(1950).max(new Date().getFullYear()),
      capexPlan: z.string().trim().max(300).default(""),
      insured: yesNo,
      /** Wajib bila insured = true. Nomor polis tidak diminta; salinan polis diunggah sebagai dokumen. */
      insurance: z
        .object({
          insurer: z.string().trim().min(2, "Nama perusahaan asuransi wajib diisi").max(80),
          coverage: z.array(z.enum(["kebakaran", "gempa", "banjir", "tanggung_gugat", "gangguan_usaha"])).min(1, "Pilih minimal satu jenis pertanggungan"),
          sumInsured: z.number().int().positive("Nilai pertanggungan wajib diisi"),
          validUntil: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format berlaku sampai: YYYY-MM"),
        })
        .nullable(),
    }),
    /** Identitas badan usaha dan pemilik manfaat. TIDAK pernah masuk halaman penawaran; hanya reviewer/staf. */
    business: z.object({
      operatingSince: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format bulan mulai operasi: YYYY-MM"),
      nib: z.string().trim().regex(/^\d{13}$/, "NIB harus 13 digit"),
      npwp: z.string().trim().regex(/^(\d{15}|\d{16})$/, "NPWP harus 15 atau 16 digit (tanpa titik/strip)"),
      signatoryName: z.string().trim().min(3, "Nama penandatangan wajib diisi").max(100),
      signatoryTitle: z.string().trim().min(2, "Jabatan penandatangan wajib diisi").max(60),
      owners: z.array(z.object({ name: z.string().trim().min(3).max(100), pct: z.number().min(1).max(100) })).min(1, "Isi minimal satu pemilik manfaat").max(5),
      contactEmail: z.string().trim().email("Email kontak tidak valid"),
      contactPhone: z.string().trim().regex(/^(\+62|62|0)8\d{7,11}$/, "Nomor HP tidak valid (mis. 08123456789)"),
    }),
    /** Rekening tujuan pembayaran owner. Nama pemilik rekening harus sama dengan badan usaha (diperiksa reviewer). TIDAK pernah dibuka. */
    payout: z.object({
      bank: z.string().trim().min(2, "Nama bank wajib diisi").max(40),
      accountName: z.string().trim().min(3, "Nama pemilik rekening wajib diisi").max(100),
      accountNumber: z.string().trim().regex(/^\d{6,20}$/, "Nomor rekening 6–20 digit"),
    }),
    consent: z.object({
      dataProcessing: z.literal(true, { errorMap: () => ({ message: "Persetujuan pemrosesan data (termasuk analisis AI) wajib dicentang" }) }),
      truthful: z.literal(true, { errorMap: () => ({ message: "Pernyataan data benar wajib dicentang" }) }),
    }),
    revenue: z.object({
      /** Eligible Revenue bulanan yang DILAPORKAN owner (bruto − refund/chargeback − pajak − fee gateway), urut lama → baru. Diturunkan dari `breakdown`. */
      months: z.array(z.number().int().min(0)).min(6, "Isi omzet minimal 6 bulan (disarankan 12)").max(12),
      breakdown: z.array(MonthRevenue).min(6).max(12),
      occupancyPct: z.number().min(0).max(100),
      /** Porsi pembayaran (persen): gateway + tunai + transfer/QRIS sendiri = 100. Hanya yang lewat gateway bisa diverifikasi. */
      paymentMix: z.object({ gatewayPct: z.number().min(0).max(100), cashPct: z.number().min(0).max(100), transferPct: z.number().min(0).max(100) }),
    }),
  })
  .superRefine((v, ctx) => {
    const o = v.offering;
    if (o.minRaise > o.target) ctx.addIssue({ code: "custom", path: ["offering", "minRaise"], message: "Minimum raise tidak boleh melebihi target" });
    if (o.unitPrice > o.target) ctx.addIssue({ code: "custom", path: ["offering", "unitPrice"], message: "Harga per token tidak boleh melebihi target" });
    const cap = Math.floor(o.target / o.unitPrice);
    if (cap < 1) ctx.addIssue({ code: "custom", path: ["offering", "unitPrice"], message: "Harga per token terlalu besar" });
    else if (cap * o.unitPrice < o.minRaise) ctx.addIssue({ code: "custom", path: ["offering", "minRaise"], message: "Minimum raise tidak bisa dicapai dengan suplai dan harga ini" });
    if (v.company.closeHour <= v.company.openHour) ctx.addIssue({ code: "custom", path: ["company", "closeHour"], message: "Jam tutup harus setelah jam buka" });
    if (v.dossier.relatedParty && v.dossier.relatedPartyNote.length < 5) ctx.addIssue({ code: "custom", path: ["dossier", "relatedPartyNote"], message: "Jelaskan transaksi pihak terkait" });
    const leased = v.property.land === "sewa" || v.property.building === "sewa";
    if (leased && !v.lease) ctx.addIssue({ code: "custom", path: ["lease"], message: "Isi detail sewa (tanah atau bangunan disewa)" });
    if (!leased && v.lease) ctx.addIssue({ code: "custom", path: ["lease"], message: "Detail sewa diisi padahal tanah dan bangunan milik sendiri" });
    if (v.lease && v.dossier.leaseMonthsRemaining !== v.lease.remainingMonths) ctx.addIssue({ code: "custom", path: ["dossier", "leaseMonthsRemaining"], message: "Sisa sewa tidak konsisten" });
    if (v.dossier.activeLandDispute && v.dossier.disputeNote.length < 10) ctx.addIssue({ code: "custom", path: ["dossier", "disputeNote"], message: "Jelaskan jenis dan status sengketa (minimal 10 karakter, tanpa nama individu)" });
    if (v.property.ownedAssetPledged && v.property.ownedAssetPledgedNote.length < 5) ctx.addIssue({ code: "custom", path: ["property", "ownedAssetPledgedNote"], message: "Jelaskan kepada siapa aset dijaminkan dan untuk apa" });
    if (v.assets.insured && !v.assets.insurance) ctx.addIssue({ code: "custom", path: ["assets", "insurance"], message: "Isi rincian asuransi" });
    if (!v.assets.insured && v.assets.insurance) ctx.addIssue({ code: "custom", path: ["assets", "insurance"], message: "Rincian asuransi diisi padahal aset tidak diasuransikan" });
    if (v.assets.insurance && monthsSince(v.assets.insurance.validUntil) > 0) ctx.addIssue({ code: "custom", path: ["assets", "insurance", "validUntil"], message: "Polis asuransi sudah kedaluwarsa" });
    if (v.company.facilities.length !== v.company.courts) ctx.addIssue({ code: "custom", path: ["company", "courts"], message: "Jumlah lapangan harus sama dengan daftar lapangan" });
    const r = v.revenue;
    if (r.breakdown.length !== r.months.length || r.breakdown.some((b, i) => eligibleOf(b) !== r.months[i])) ctx.addIssue({ code: "custom", path: ["revenue", "months"], message: "Omzet bersih tidak sama dengan bruto − refund − pajak − fee" });
    if (r.breakdown.some((b) => eligibleOf(b) < 0)) ctx.addIssue({ code: "custom", path: ["revenue", "breakdown"], message: "Refund + pajak + fee tidak boleh melebihi omzet bruto pada bulan mana pun" });
    const mix = r.paymentMix;
    if (Math.round(mix.gatewayPct + mix.cashPct + mix.transferPct) !== 100) ctx.addIssue({ code: "custom", path: ["revenue", "paymentMix"], message: "Porsi pembayaran (gateway + tunai + transfer/QRIS sendiri) harus berjumlah 100%" });
    const opMonths = monthsSince(v.business.operatingSince);
    if (opMonths < 0) ctx.addIssue({ code: "custom", path: ["business", "operatingSince"], message: "Bulan mulai operasi tidak boleh di masa depan" });
    else if (r.months.length > opMonths) ctx.addIssue({ code: "custom", path: ["revenue", "months"], message: `Anda baru beroperasi ${opMonths} bulan, tetapi mengisi omzet ${r.months.length} bulan` });
    if (v.business.owners.reduce((a, o) => a + o.pct, 0) > 100) ctx.addIssue({ code: "custom", path: ["business", "owners"], message: "Total kepemilikan pemilik manfaat melebihi 100%" });
    if (v.dossier.otherPledgedBps > 0 && v.dossier.otherPledgeNote.length < 5) ctx.addIssue({ code: "custom", path: ["dossier", "otherPledgeNote"], message: "Jelaskan kontrak bagi hasil/tokenisasi lain yang sudah ada" });
    if (o.shareBps + v.dossier.otherPledgedBps > MAX_SHARE_BPS) ctx.addIssue({ code: "custom", path: ["offering", "shareBps"], message: `Total beban atas omzet (bagian ini + yang sudah dijanjikan) maksimal ${MAX_SHARE_BPS / 100}%` });
    if (v.dossier.debtOutstanding > 0 && v.dossier.debtRemainingMonths === 0) ctx.addIssue({ code: "custom", path: ["dossier", "debtRemainingMonths"], message: "Isi sisa tenor utang" });
    if (v.revenue.months.every((m) => m === 0)) ctx.addIssue({ code: "custom", path: ["revenue", "months"], message: "Omzet tidak boleh nol semua" });
  });
export type ApplicationInput = z.infer<typeof ApplicationInput>;

/** Simbol token ≤ 5 karakter (batas wallet_watchAsset), unik di antara `taken`. */
export function tokenSymbolFor(name: string, taken: string[] = []): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const base = (letters.slice(0, 4) || "SERI").padEnd(3, "X");
  const set = new Set(taken.map((t) => t.toUpperCase()));
  if (!set.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base.slice(0, 5 - String(i).length)}${i}`;
    if (!set.has(cand)) return cand;
  }
  throw new Error("simbol token habis");
}

export function slugFor(name: string, suffix: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "perusahaan";
  return `${s}-${suffix}`;
}
