import type { Extraction } from "./extract";

export interface FormFacts {
  companyName: string;
  leaseMonthsRemaining: number;
  monthlyBankInstallment: number;
  bankCovenantForbidsRevenueSale: boolean;
  /** Omzet bulanan yang dilaporkan owner (bersih), rupiah. */
  reportedMonthlyRevenue: number[];
}

export interface DocCheck { id: string; label: string; status: "pass" | "warn" | "fail" | "na"; detail: string; docs: string[] }

const monthsBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / (30.44 * 86_400_000);
const val = (e: Extraction | undefined, k: string) => (e?.fields[k]?.verified ? e.fields[k]!.value : null);
const words = (s: string) => new Set(s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["pt", "cv", "ud", "the"].includes(w)));
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

/** Cocokkan hasil ekstraksi dokumen dengan isian owner. Deterministik: AI hanya menyediakan angka bersitasi; keputusan dari aturan ini. */
export function compareWithForm(form: FormFacts, ex: Partial<Record<Extraction["kind"], Extraction>>, now = new Date()): DocCheck[] {
  const checks: DocCheck[] = [];
  const unread = (k: string, label: string) => ex[k as keyof typeof ex]?.status === "unreadable" ? `${label}: dokumen tidak terbaca otomatis (perlu cek manual)` : null;

  // 1) sewa vs formulir
  const end = val(ex.lease, "lease_end_date");
  if (typeof end === "string") {
    const docMonths = Math.max(0, monthsBetween(now, new Date(end)));
    const diff = Math.abs(docMonths - form.leaseMonthsRemaining);
    const tol = Math.max(2, form.leaseMonthsRemaining * 0.15);
    checks.push({ id: "lease", label: "Sisa sewa: dokumen vs formulir", status: diff <= tol ? "pass" : "fail", docs: ["lease"],
      detail: `Dokumen: berakhir ${end} (≈ ${docMonths.toFixed(0)} bulan lagi); formulir: ${form.leaseMonthsRemaining} bulan` });
  } else checks.push({ id: "lease", label: "Sisa sewa: dokumen vs formulir", status: "na", docs: ["lease"], detail: unread("lease", "Sewa") ?? "Tanggal berakhir sewa tidak terbaca dari dokumen" });

  // 2) angsuran kredit
  const inst = val(ex.loan, "monthly_installment");
  if (typeof inst === "number") {
    const tol = Math.max(form.monthlyBankInstallment * 0.1, 100_000);
    checks.push({ id: "installment", label: "Angsuran bank: dokumen vs formulir", status: Math.abs(inst - form.monthlyBankInstallment) <= tol ? "pass" : "fail", docs: ["loan"],
      detail: `Dokumen: ${rp(inst)}/bln; formulir: ${rp(form.monthlyBankInstallment)}/bln` });
  } else if (form.monthlyBankInstallment > 0 && !ex.loan) {
    checks.push({ id: "installment", label: "Angsuran bank: dokumen vs formulir", status: "warn", docs: ["loan"], detail: "Formulir menyebut cicilan bank, tetapi dokumen kredit tidak diunggah" });
  } else checks.push({ id: "installment", label: "Angsuran bank: dokumen vs formulir", status: "na", docs: ["loan"], detail: unread("loan", "Kredit") ?? "Tidak ada data angsuran untuk dibandingkan" });

  // 3) covenant: dokumen melarang tetapi formulir bilang tidak
  const forb = val(ex.loan, "forbids_sale_of_revenue");
  if (typeof forb === "boolean") {
    checks.push({ id: "covenant", label: "Covenant kredit: dokumen vs formulir", status: forb && !form.bankCovenantForbidsRevenueSale ? "fail" : "pass", docs: ["loan"],
      detail: forb ? "Dokumen kredit memuat larangan menjual/menjaminkan pendapatan" : "Dokumen tidak memuat larangan itu" + (form.bankCovenantForbidsRevenueSale ? " (formulir menyebut ada larangan)" : "") });
  }

  // 4) omzet dilaporkan vs total kredit rekening
  const credit = val(ex.bank_statement, "total_credit_amount");
  const pm = val(ex.bank_statement, "period_months");
  if (typeof credit === "number" && typeof pm === "number" && pm > 0 && form.reportedMonthlyRevenue.length) {
    const avgCredit = credit / pm;
    const avgRep = form.reportedMonthlyRevenue.reduce((a, b) => a + b, 0) / form.reportedMonthlyRevenue.length;
    const ratio = avgCredit / avgRep;
    // dana masuk kotor ≥ omzet bersih (setelah pajak/refund/fee), jadi rasio wajar ≈ 1,0–1,6
    checks.push({ id: "bank", label: "Omzet dilaporkan vs dana masuk rekening", status: ratio >= 0.85 ? "pass" : "fail", docs: ["bank_statement"],
      detail: `Rata-rata dana masuk ${rp(avgCredit)}/bln vs omzet dilaporkan ${rp(avgRep)}/bln (rasio ${ratio.toFixed(2)}; wajar ≥ 0,85)` });
  } else checks.push({ id: "bank", label: "Omzet dilaporkan vs dana masuk rekening", status: "na", docs: ["bank_statement"], detail: unread("bank_statement", "Mutasi") ?? "Total dana masuk atau periode tidak terbaca dari mutasi" });

  // 5) nama
  const a = words(form.companyName);
  for (const [kind, key] of [["lease", "lessee_name"], ["tax", "taxpayer_name"], ["license", "business_name"]] as const) {
    const n = val(ex[kind], key);
    if (typeof n === "string") {
      const b = words(n);
      const overlap = [...a].filter((w) => b.has(w)).length / Math.max(1, Math.min(a.size, b.size));
      checks.push({ id: `name_${kind}`, label: `Nama perusahaan di ${kind === "lease" ? "perjanjian sewa" : kind === "tax" ? "dokumen pajak" : "izin usaha"}`, status: overlap >= 0.5 ? "pass" : "warn", docs: [kind], detail: `Dokumen: “${n}”; formulir: “${form.companyName}”` });
    }
  }
  return checks;
}

export const docChecksOk = (checks: DocCheck[]) => !checks.some((c) => c.status === "fail");
