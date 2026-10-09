"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ApplicationInput, OWNED_LEASE_MONTHS, type SalesResult } from "@venue-rwa/shared";
import { requireOwner } from "@/lib/auth";
import { DOC_KINDS, submitApplication, type UploadedDoc } from "@/lib/flows/apply";
import { analyzeVenueDocuments } from "@/lib/flows/documents";
import { friendlyError } from "@/lib/operator";
import { readSales } from "@/lib/sales";

export interface ApplyState { error?: string; fieldErrors?: string[] }
export interface SalesPreview { ok: boolean; message?: string; result?: SalesResult }

const digits = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\D/g, "") || 0);
const yes = (v: FormDataEntryValue | null) => String(v) === "ya";

/** Pratinjau file data penjualan di langkah form (tidak menyimpan apa pun). Hasil akhir tetap dihitung ulang saat pengajuan dikirim. */
export async function previewSales(fd: FormData): Promise<SalesPreview> {
  await requireOwner("/owner/apply");
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, message: "Pilih file CSV atau XLSX" };
  try {
    const result = await readSales(f);
    return { ok: result.errors.length === 0, result };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

/** Menerima form pengajuan. Gagal validasi → kembalikan pesan (form tetap terisi); sukses → redirect ke halaman pengajuan. */
export async function apply(_prev: ApplyState, fd: FormData): Promise<ApplyState> {
  const me = await requireOwner("/owner/apply");
  const str = (k: string) => String(fd.get(k) ?? "");
  const dec = (k: string) => Number(str(k).replace(",", ".")) || 0; // "60,5" → 60.5
  const num = (k: string) => digits(fd.get(k));
  const fail = (...m: string[]): ApplyState => ({ error: "Periksa kembali isian Anda.", fieldErrors: m });
  const rows = (n: string, max: number) => [...new Set([...fd.keys()].filter((k) => k.startsWith(`${n}_`)).map((k) => Number(k.slice(n.length + 1))))].filter(Number.isInteger).sort((a, b) => a - b).slice(0, max);
  const facilities = rows("fac_name", 40).map((i) => ({
    name: str(`fac_name_${i}`), sport: str(`fac_sport_${i}`), lengthM: Number(str(`fac_len_${i}`).replace(",", ".")) || 0, widthM: Number(str(`fac_wid_${i}`).replace(",", ".")) || 0,
    surface: str(`fac_surface_${i}`), indoor: str(`fac_indoor_${i}`) === "ya", pricePerHour: num(`fac_price_${i}`),
  }));
  const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");
  const prices = facilities.map((f) => f.pricePerHour).filter((x) => x > 0);

  // penawaran: owner mengisi persen omzet, jumlah token, dan harga satu token; target dana = token × harga. Minimum raise dari jumlah token minimum (kosong = semua token)
  const tokenCount = num("tokenCount"), unitPrice = num("unitPrice");
  const target = tokenCount * unitPrice; // target dana = jumlah token × harga satu token
  const minTokens = str("minTokens").trim() === "" ? tokenCount : num("minTokens");
  if (tokenCount > 0 && (minTokens < 1 || minTokens > tokenCount)) return fail(`Minimum token harus antara 1 dan ${tokenCount}`);

  // properti dan sewa
  const land = str("land") === "milik" ? "milik" : "sewa";
  const building = ["milik", "sewa", "tidak_ada"].includes(str("building")) ? str("building") : "sewa";
  const leased = land === "sewa" || building === "sewa";
  const owned = land === "milik" || building === "milik";
  const lease = leased ? { landlord: str("landlord"), monthlyRent: num("monthlyRent"), remainingMonths: num("leaseMonths"), renewalOption: yes(fd.get("renewal")), landlordConsentsToSale: yes(fd.get("landlordConsent")) } : null;

  // utang dan beban: bagian yang dijawab "tidak" tidak dikirim
  const hasDebt = yes(fd.get("hasDebt"));
  const hasPledge = yes(fd.get("hasPledge"));
  if (hasDebt && !str("collateral")) return fail("Pilih jenis jaminan utang");

  const insured = yes(fd.get("insured"));

  // data penjualan dari file
  const salesFile = fd.get("doc_sales_data");
  if (!(salesFile instanceof File) || salesFile.size === 0) return fail("Unggah file data penjualan (CSV atau XLSX)");
  let sales: SalesResult;
  try { sales = await readSales(salesFile); } catch (e: any) { return fail(e?.message ?? String(e)); }
  if (sales.errors.length) return fail(...sales.errors);
  const mix = sales.paymentMix ?? { gatewayPct: dec("gatewayPct"), cashPct: dec("cashPct"), transferPct: dec("transferPct") };

  const raw = {
    company: {
      name: str("name"), city: str("city"), area: str("area"), province: str("province"), address: str("address"), kelurahan: str("kelurahan"), postalCode: str("postalCode"), landmark: str("landmark"),
      sports: [...new Set(facilities.map((f) => f.sport))], courts: facilities.length,
      courtSpecs: facilities.map((f) => `${f.name}: ${f.lengthM}×${f.widthM} m ${f.surface}${f.indoor ? " (indoor)" : ""}`).join("; "),
      openHour: num("openHour"), closeHour: num("closeHour"),
      tariffNote: prices.length ? (Math.min(...prices) === Math.max(...prices) ? `${rp(prices[0]!)}/jam` : `${rp(Math.min(...prices))}–${rp(Math.max(...prices))}/jam`) : "",
      facilities,
    },
    offering: { target, minRaise: minTokens * unitPrice, unitPrice, shareBps: Math.round(Number(str("sharePct").replace(",", ".")) * 100), tenorMonths: num("tenorMonths"), useOfFunds: str("useOfFunds") },
    dossier: {
      leaseMonthsRemaining: lease ? lease.remainingMonths : OWNED_LEASE_MONTHS,
      monthlyBankInstallment: hasDebt ? num("installment") : 0,
      bankCovenantForbidsRevenueSale: hasDebt && yes(fd.get("covenant")), bankConsentLetter: hasDebt && yes(fd.get("consent")), activeLandDispute: yes(fd.get("dispute")), disputeNote: yes(fd.get("dispute")) ? str("disputeNote") : "",
      hasNpwp: /^(\d{15}|\d{16})$/.test(str("npwp").replace(/\D/g, "")), hasBusinessLicense: /^\d{13}$/.test(str("nib").replace(/\D/g, "")),
      relatedParty: yes(fd.get("relatedParty")), relatedPartyNote: yes(fd.get("relatedParty")) ? str("relatedPartyNote") : "",
      debtOutstanding: hasDebt ? num("debtOutstanding") : 0, debtRemainingMonths: hasDebt ? num("debtRemaining") : 0, collateral: hasDebt ? str("collateral") : "tidak ada",
      otherPledgedBps: hasPledge ? Math.round(Number(str("otherPledgedPct").replace(",", ".") || 0) * 100) : 0, otherPledgeNote: hasPledge ? str("otherPledgeNote") : "", monthlyOpex: num("monthlyOpex"),
    },
    property: { land, building, ownedAssetPledged: owned && yes(fd.get("ownedPledged")), ownedAssetPledgedNote: owned && yes(fd.get("ownedPledged")) ? str("ownedPledgedNote") : "" },
    lease,
    assets: {
      builtYear: num("builtYear"), capexPlan: str("capexPlan"), insured: insured,
      insurance: insured ? { insurer: str("insurer"), coverage: fd.getAll("coverage").map(String), sumInsured: num("sumInsured"), validUntil: str("insuranceUntil") } : null,
    },
    business: {
      operatingSince: str("operatingSince"), nib: str("nib").replace(/\D/g, ""), npwp: str("npwp").replace(/\D/g, ""), signatoryName: str("signatoryName"), signatoryTitle: str("signatoryTitle"),
      owners: rows("owner_name", 5).map((i) => ({ name: str(`owner_name_${i}`), pct: Number(str(`owner_pct_${i}`).replace(",", ".")) || 0 })),
      contactEmail: str("contactEmail"), contactPhone: str("contactPhone").replace(/[\s-]/g, ""),
    },
    payout: { bank: str("bank"), accountName: str("accountName"), accountNumber: str("accountNumber").replace(/\D/g, "") },
    consent: { dataProcessing: fd.get("consentData") === "on", truthful: fd.get("consentTrue") === "on" },
    revenue: { months: sales.months, breakdown: sales.breakdown, occupancyPct: dec("occupancy"), paymentMix: mix },
  };
  const parsed = ApplicationInput.safeParse(raw);
  if (!parsed.success) return { error: "Periksa kembali isian Anda.", fieldErrors: parsed.error.issues.map((i) => i.message) };

  // dokumen wajib bergantung pada jawaban: sewa → perjanjian sewa; milik sendiri → bukti kepemilikan
  const required = new Set(["bank_statement", ...(leased ? ["lease"] : []), ...(owned ? ["ownership"] : []), ...(hasDebt ? ["loan"] : []), ...(insured ? ["insurance"] : []), ...(hasDebt && yes(fd.get("consent")) ? ["consent_letter"] : [])]);
  const docs: UploadedDoc[] = [{ kind: "sales_data", file: salesFile }];
  for (const d of DOC_KINDS) {
    if (d.kind === "sales_data") continue;
    const files = fd.getAll(`doc_${d.kind}`).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
    for (const f of files) docs.push({ kind: d.kind, file: f });
    if (required.has(d.kind) && files.length === 0) return { error: `Dokumen wajib belum diunggah: ${d.label}` };
  }

  let id: string;
  try {
    id = (await submitApplication(me, parsed.data, docs)).venueId;
  } catch (e) {
    return { error: friendlyError(e) };
  }
  // analisis AI dokumen berjalan di latar belakang setelah owner diarahkan (bisa memakan beberapa menit)
  after(async () => { await analyzeVenueDocuments(id).catch((e) => console.error("analisis dokumen:", e)); });
  redirect(`/owner/${id}?ok=${encodeURIComponent("Pengajuan terkirim dan diverifikasi otomatis. Dokumen Anda sedang dianalisis AI di latar belakang; hasilnya muncul di halaman ini.")}`);
}
