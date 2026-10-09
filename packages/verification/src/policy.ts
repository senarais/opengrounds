import type { DocCheck } from "./consistency";
import { maxAllowedPrice, priceBand, referencePrice, supplyFor, type OwnerDossier, type PriceBand } from "@venue-rwa/shared";

export interface PolicyInput {
  dossier: OwnerDossier;
  tenorMonths: number;
  monthlyEligible: number[]; // omzet eligible per bulan, urut waktu
  occupancy: number; // 0..1
  openExceptions: number;
  minGatewayMonths?: number;
  proposed: { target: number; unitPrice: number; shareBps: number };
  minInvestorMargin?: number;
  /** 'pos' = diverifikasi dari ledger/gateway; 'self_reported' = angka dilaporkan owner (belum diverifikasi). */
  dataSource?: "pos" | "connector" | "self_reported";
  /** Hasil konsistensi dokumen (AI hanya mengekstrak; aturan deterministik yang membandingkan). undefined = analisis belum tersedia. */
  docChecks?: DocCheck[];
  /** Rasio cakupan pembayaran terverifikasi (0..1) dari rekonsiliasi data PoS. undefined = tidak berlaku (data dilaporkan owner). */
  coverage?: number;
  minCoverage?: number;
  /** Dilaporkan owner (data tak terverifikasi): porsi pembayaran lewat gateway (persen) dan persetujuan pemilik lahan. */
  reportedGatewayPct?: number;
  landlordConsentsToSale?: boolean;
  /** Sisa bulan polis asuransi dan jenis pertanggungan (dari isian owner). undefined = tidak diasuransikan/tidak diisi. */
  insurance?: { monthsLeft: number; coverage: string[] } | null;
}

export interface Gate {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface ScoreComponent {
  id: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface PolicyResult {
  gates: Gate[];
  components: ScoreComponent[];
  score: number; // 0..10000
  recommendation: "pass" | "fail";
  reasons: string[];
  /** Catatan yang tidak menggagalkan, tetapi wajib dilihat reviewer. */
  warnings: string[];
  dataSource: "pos" | "connector" | "self_reported";
  price: { reference: number; maxPrice: number; proposed: number; band: PriceBand; haircut: number; supply: number };
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** Policy engine deterministik: gerbang pass/fail + skor. AI tidak memutuskan apa pun di sini. */
export function evaluatePolicy(i: PolicyInput): PolicyResult {
  const minMonths = i.minGatewayMonths ?? 6;
  const d = i.dossier;
  const months = i.monthlyEligible.length;

  const gates: Gate[] = [
    { id: "lease", label: "Sisa sewa ≥ tenor", pass: d.leaseMonthsRemaining.value >= i.tenorMonths, detail: `sewa ${d.leaseMonthsRemaining.value} bln vs tenor ${i.tenorMonths} bln` },
    {
      id: "covenant",
      label: "Tidak bentrok covenant bank",
      pass: !d.bankCovenantForbidsRevenueSale || d.bankConsentLetter,
      detail: d.bankCovenantForbidsRevenueSale ? (d.bankConsentLetter ? "ada larangan, tetapi ada surat persetujuan bank" : "ada larangan jual pendapatan tanpa surat persetujuan") : "tidak ada larangan",
    },
    { id: "dispute", label: "Tidak ada sengketa aktif atas aset", pass: !d.activeLandDispute, detail: d.activeLandDispute ? "ada sengketa lahan aktif" : "bersih" },
    { id: "history", label: `Riwayat gateway ≥ ${minMonths} bulan`, pass: Math.min(d.gatewayMonthsOfHistory, months) >= minMonths, detail: `${Math.min(d.gatewayMonthsOfHistory, months)} bln data gateway` },
    ...(i.docChecks ? [{
      id: "docs", label: "Dokumen konsisten dengan isian",
      pass: !i.docChecks.some((c) => c.status === "fail"),
      detail: i.docChecks.some((c) => c.status === "fail") ? i.docChecks.filter((c) => c.status === "fail").map((c) => c.label).join("; ") : `${i.docChecks.filter((c) => c.status === "pass").length} cocok, ${i.docChecks.filter((c) => c.status === "na" || c.status === "warn").length} perlu cek manual`,
    }] : []),
    ...(i.coverage !== undefined ? [{
      id: "coverage", label: `Cakupan pembayaran terverifikasi ≥ ${Math.round((i.minCoverage ?? 0.8) * 100)}%`,
      pass: i.coverage >= (i.minCoverage ?? 0.8),
      detail: `${(i.coverage * 100).toFixed(0)}% dari penjualan settle di gateway (sisanya tunai/QRIS sendiri/tanpa settlement)`,
    }] : []),
    { id: "recon", label: "Tidak ada exception rekonsiliasi terbuka", pass: i.openExceptions === 0, detail: `${i.openExceptions} exception terbuka` },
  ];

  const avg = mean(i.monthlyEligible);
  const installmentRatio = avg > 0 ? d.monthlyBankInstallment.value / avg : 1;
  const cv = avg > 0 ? stdev(i.monthlyEligible) / avg : 1;

  const components: ScoreComponent[] = [
    { id: "installment", label: "Cicilan bank vs omzet", max: 2500, points: Math.round(2500 * clamp((0.4 - installmentRatio) / 0.3)), detail: `${(installmentRatio * 100).toFixed(1)}% dari omzet eligible` },
    { id: "occupancy", label: "Okupansi", max: 2500, points: Math.round(2500 * clamp((i.occupancy - 0.4) / 0.4)), detail: `${(i.occupancy * 100).toFixed(0)}%` },
    { id: "seasonality", label: "Kestabilan musiman", max: 2000, points: Math.round(2000 * clamp((0.4 - cv) / 0.3)), detail: `koefisien variasi ${(cv * 100).toFixed(0)}%` },
    { id: "history", label: "Panjang riwayat data", max: 1500, points: Math.round(1500 * clamp(months / 12)), detail: `${months} dari 12 bulan` },
    { id: "recon", label: "Kebersihan rekonsiliasi", max: 1500, points: i.openExceptions === 0 ? 1500 : 0, detail: i.openExceptions === 0 ? "bersih" : `${i.openExceptions} exception` },
  ];
  const score = components.reduce((a, c) => a + c.points, 0);

  const reasons = gates.filter((g) => !g.pass).map((g) => `Gerbang gagal: ${g.label} (${g.detail})`);
  if (score < 6000) reasons.push(`Skor ${score} di bawah ambang 6000`);
  const recommendation = reasons.length === 0 ? "pass" : "fail";

  const dataSource = i.dataSource ?? "pos";
  const warnings: string[] = [];
  if (!i.docChecks) warnings.push("Analisis dokumen (AI) belum tersedia: isian owner belum dicocokkan dengan isi dokumen.");
  else if (i.docChecks.some((c) => c.status === "na" || c.status === "warn")) warnings.push(`Sebagian dokumen tidak bisa dicocokkan otomatis (${i.docChecks.filter((c) => c.status === "na" || c.status === "warn").map((c) => c.label).join("; ")}): reviewer perlu memeriksa manual.`);
  if (i.reportedGatewayPct !== undefined && i.reportedGatewayPct < 60) warnings.push(`Hanya ${i.reportedGatewayPct}% pembayaran lewat gateway (menurut owner): porsi tunai/transfer langsung tidak bisa diverifikasi, jadi cakupan verifikasi akan rendah.`);
  if (i.insurance === null) warnings.push("Aset tidak diasuransikan: kebakaran atau bencana dapat menghentikan omzet selama tenor.");
  else if (i.insurance) {
    if (i.insurance.monthsLeft < i.tenorMonths) warnings.push(`Polis asuransi berakhir ${i.insurance.monthsLeft} bulan lagi, lebih pendek dari tenor ${i.tenorMonths} bulan: perlu perpanjangan.`);
    if (!i.insurance.coverage.includes("gangguan_usaha")) warnings.push("Polis tidak mencakup gangguan usaha: bila venue tutup karena kerusakan, omzet (dasar pembayaran investor) tidak tergantikan.");
  }
  if (i.landlordConsentsToSale === false) warnings.push("Pemilik lahan belum menyetujui penjualan sebagian omzet: reviewer perlu memeriksa perjanjian sewa.");
  if (dataSource === "self_reported") warnings.push("Omzet dilaporkan owner dan BELUM diverifikasi dengan settlement gateway: haircut lebih besar; rilis dana tahap 2 menunggu rekonsiliasi data PoS/gateway.");
  // Harga referensi: median bulanan; haircut lebih besar bila data < 12 bulan, dan terbesar bila data hanya dilaporkan owner
  if (dataSource === "connector") warnings.push("Sebagian besar transaksi berasal dari sistem eksternal owner (impor CSV/API), bukan dari PoS + gateway kita: haircut lebih besar sampai settlement gateway dapat dicocokkan langsung.");
  const haircut = dataSource === "self_reported" ? 0.35 : dataSource === "connector" ? 0.2 : months >= 12 ? 0.1 : 0.2;
  const supply = supplyFor(i.proposed.target, i.proposed.unitPrice);
  const reference = referencePrice({
    monthlyMedianRevenue12m: median(i.monthlyEligible),
    haircut,
    shareBps: i.proposed.shareBps,
    tenorMonths: i.tenorMonths,
    tokenSupply: supply,
    minInvestorMargin: i.minInvestorMargin ?? 0.3,
  });
  const band = priceBand(i.proposed.unitPrice, reference);
  if (band === "rejected") reasons.push(`Harga ${rp(i.proposed.unitPrice)} > +25% dari referensi ${rp(reference)}`);

  return {
    gates,
    components,
    score,
    recommendation: reasons.length === 0 ? "pass" : "fail",
    reasons,
    warnings,
    dataSource,
    price: { reference, maxPrice: maxAllowedPrice(reference), proposed: i.proposed.unitPrice, band, haircut, supply },
  };
}

/** Tingkat kepercayaan sumber data: "connector" bila lebih dari separuh transaksi berasal dari impor/API eksternal. */
export function sourceTier(counts: { pos: number; external: number }): "pos" | "connector" {
  const total = counts.pos + counts.external;
  return total > 0 && counts.external / total > 0.5 ? "connector" : "pos";
}

/** Aturan murni perubahan harga (diuji terpisah). */
export function repriceVerdict(a: { oldPrice: number; newPrice: number; oldReference: number; newReference: number; band: string }): string | null {
  if (a.band === "rejected") return "Harga baru melebihi batas atas yang diizinkan (> +25% dari harga referensi).";
  if (a.newPrice > a.oldPrice && a.newReference < a.oldReference) return "Harga referensi turun sejak verifikasi sebelumnya, sehingga harga tidak boleh dinaikkan.";
  return null;
}
