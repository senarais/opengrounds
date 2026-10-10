import type { Extraction, DocKind, FieldResult } from "./extract";
import { finding, type Finding } from "./findings";

/** Fakta dari formulir owner yang dibandingkan dengan dokumen. */
export interface FormFacts {
  legalName: string;
  deedNumber: string;
  deedDate: string;
  kbli: string;
  /** Nama yang sah sebagai "milik sendiri": badan usaha, direksi, pemilik manfaat. */
  ownerNames: string[];
  landHolderName: string;
  landRightType: "SHM" | "HGB" | "HGU" | "HP";
  landEncumbered: boolean;
  /** Omzet kotor bulanan yang dilaporkan (urut lama → baru). */
  monthlyGross: number[];
}

const STOP = new Set(["pt", "cv", "ud", "tbk", "persero", "the", "dan", "and"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
/** Dua nama dianggap sama bila semua kata bermakna nama yang lebih pendek ada di nama yang lain. */
export function sameName(a: string, b: string): boolean {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  return [...small].every((w) => big.has(w));
}
const RIGHT_WORDS: Record<FormFacts["landRightType"], RegExp> = { SHM: /milik/i, HGB: /guna\s+bangunan|hgb/i, HGU: /guna\s+usaha|hgu/i, HP: /hak\s+pakai/i };
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

type Ex = Partial<Record<DocKind, Extraction>>;
const field = (ex: Ex, k: DocKind, f: string): FieldResult | undefined => (ex[k]?.fields[f]?.verified ? ex[k]!.fields[f] : undefined);
const ref = (doc: DocKind, f: FieldResult) => ({ doc, page: f.page, quote: f.quote });

/** Agen silang-cek: dokumen vs dokumen vs formulir. Deterministik; AI hanya menyediakan nilai bersitasi. */
export function crossCheck(form: FormFacts, ex: Ex): Finding[] {
  const out: Finding[] = [];
  const C = "cross_check";

  // 1) nama badan usaha konsisten di akta, NIB, NPWP, laporan keuangan
  for (const [doc, f] of [["deed", "company_name"], ["nib", "business_name"], ["npwp", "taxpayer_name"], ["financial_report", "company_name"]] as const) {
    const v = field(ex, doc, f);
    if (!v) continue;
    const ok = sameName(String(v.value), form.legalName);
    out.push(finding({ agent: C, checkType: "name_consistency", code: ok ? "NAME_MATCH" : "NAME_MISMATCH", severity: ok ? "info" : "high",
      text: ok ? `Name in ${doc} matches the legal company name.` : `Name in ${doc} ("${v.value}") differs from the legal name in the application ("${form.legalName}").`,
      fieldPaths: ["company.legalName"], sourceRefs: [ref(doc, v)] }));
  }

  // 2) akta: nomor dan tanggal
  const dn = field(ex, "deed", "deed_number"), dd = field(ex, "deed", "deed_date");
  if (dn && String(dn.value).replace(/\D/g, "") !== form.deedNumber.replace(/\D/g, ""))
    out.push(finding({ agent: C, checkType: "deed", code: "DEED_NUMBER_MISMATCH", severity: "medium", text: `Deed number in the document (${dn.value}) differs from the application (${form.deedNumber}).`, fieldPaths: ["company.deedNumber"], sourceRefs: [ref("deed", dn)] }));
  if (dd && dd.value !== form.deedDate)
    out.push(finding({ agent: C, checkType: "deed", code: "DEED_DATE_MISMATCH", severity: "medium", text: `Deed date in the document (${dd.value}) differs from the application (${form.deedDate}).`, fieldPaths: ["company.deedDate"], sourceRefs: [ref("deed", dd)] }));

  // 3) KBLI
  const kbli = field(ex, "nib", "kbli");
  if (kbli && String(kbli.value).replace(/\D/g, "") !== form.kbli)
    out.push(finding({ agent: C, checkType: "kbli", code: "KBLI_MISMATCH", severity: "low", text: `KBLI in the NIB (${kbli.value}) differs from the application (${form.kbli}).`, fieldPaths: ["company.kbli"], sourceRefs: [ref("nib", kbli)] }));

  // 4) lahan: pemegang hak harus pihak sendiri; jenis hak dan status jaminan cocok
  const holder = field(ex, "land_certificate", "holder_name");
  if (holder) {
    const own = form.ownerNames.some((n) => sameName(String(holder.value), n));
    out.push(finding({ agent: C, checkType: "land_ownership", code: own ? "LAND_HOLDER_OWN" : "LAND_HOLDER_NOT_OWN", severity: own ? "info" : "critical",
      text: own ? "The certificate holder matches the company, a director, or a beneficial owner." : `The certificate holder ("${holder.value}") does not match the company, directors, or beneficial owners. The self-owned-land requirement is not met.`,
      fieldPaths: ["land.holderName", "land.owned"], sourceRefs: [ref("land_certificate", holder)] }));
  }
  const right = field(ex, "land_certificate", "right_type");
  if (right && !RIGHT_WORDS[form.landRightType].test(String(right.value)))
    out.push(finding({ agent: C, checkType: "land_right", code: "LAND_RIGHT_MISMATCH", severity: "medium", text: `Land title type in the certificate ("${right.value}") differs from the application (${form.landRightType}).`, fieldPaths: ["land.rightType"], sourceRefs: [ref("land_certificate", right)] }));
  const enc = field(ex, "land_certificate", "encumbered");
  if (enc?.value === true && !form.landEncumbered)
    out.push(finding({ agent: C, checkType: "land_encumbrance", code: "UNDISCLOSED_ENCUMBRANCE", severity: "critical", text: "The certificate records a mortgage or lien, but the application states that the land is unpledged.", fieldPaths: ["land.encumbered"], sourceRefs: [ref("land_certificate", enc)] }));

  // 5) rekening koran: pemilik rekening dan dana masuk vs omzet dilaporkan
  const holderAcc = field(ex, "bank_statement", "account_holder");
  if (holderAcc && !sameName(String(holderAcc.value), form.legalName))
    out.push(finding({ agent: C, checkType: "bank_account", code: "BANK_HOLDER_MISMATCH", severity: "high", text: `Bank statement holder ("${holderAcc.value}") does not match the company.`, fieldPaths: ["payout.accountName"], sourceRefs: [ref("bank_statement", holderAcc)] }));
  const months = field(ex, "bank_statement", "period_months"), credits = field(ex, "bank_statement", "total_credit_amount");
  if (months && credits && Number(months.value) > 0) {
    const n = Math.min(Number(months.value), form.monthlyGross.length);
    const reported = form.monthlyGross.slice(-n).reduce((a, b) => a + b, 0);
    const bank = Number(credits.value);
    // dana masuk boleh lebih besar (setoran lain); omzet jauh di atas dana masuk = omzet tidak terbukti
    const bad = reported > bank * 1.15;
    out.push(finding({ agent: "reconciliation", checkType: "bank_vs_reported", code: bad ? "REVENUE_ABOVE_BANK" : "REVENUE_WITHIN_BANK", severity: bad ? "high" : "info",
      text: bad ? `Reported revenue over ${n} months (${rp(reported)}) is materially above bank credits (${rp(bank)}).` : `Reported revenue over ${n} months (${rp(reported)}) does not exceed bank credits (${rp(bank)}).`,
      fieldPaths: ["financials"], sourceRefs: [ref("bank_statement", credits)] }));
  }

  // 6) laporan keuangan tahunan vs omzet 12 bulan
  const rev = field(ex, "financial_report", "total_revenue");
  if (rev && form.monthlyGross.length >= 12) {
    const year = form.monthlyGross.slice(-12).reduce((a, b) => a + b, 0);
    const diff = Math.abs(Number(rev.value) - year) / Math.max(1, year);
    if (diff > 0.15) out.push(finding({ agent: C, checkType: "financial_report", code: "REPORT_REVENUE_DIFF", severity: "medium", text: `Financial report revenue (${rp(Number(rev.value))}) differs by ${Math.round(diff * 100)}% from the 12-month application total (${rp(year)}).`, fieldPaths: ["financials"], sourceRefs: [ref("financial_report", rev)] }));
  }

  // 7) dokumen yang tidak terbaca: UNVERIFIED, bukan ditebak
  for (const [k, e] of Object.entries(ex) as [DocKind, Extraction][]) {
    if (e.status === "unreadable" || e.status === "failed")
      out.push(finding({ agent: "extraction", checkType: "readability", code: "UNVERIFIED_DOCUMENT", severity: "low", verified: false, text: `Document ${k} could not be read automatically (${e.note ?? e.status}); review it manually.`, sourceRefs: [{ doc: k }] }));
  }
  return out;
}
