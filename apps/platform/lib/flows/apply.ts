import { ApplicationInput, buildDisclosure, disclosureHash, insuranceMonthsLeft, tokenSymbolFor, type OwnerDossier } from "@venue-rwa/shared";
import { evaluatePolicy } from "@venue-rwa/verification";
import type { Me } from "../auth";
import { platformDb } from "../db";
import { audit, getCtx } from "../flow";
import { uploadDocument } from "../storage";
import { saveRun } from "../verify";

export const DOC_KINDS = [
  { kind: "photo", label: "Foto venue (publik)", required: false, multiple: true },
  { kind: "lease", label: "Perjanjian sewa (tanah/bangunan yang disewa)", required: false },
  { kind: "insurance", label: "Polis asuransi", required: false },
  { kind: "consent_letter", label: "Surat persetujuan bank", required: false },
  { kind: "ownership", label: "Bukti kepemilikan (sertifikat SHM/HGB, AJB, atau PBB)", required: false },
  { kind: "sales_data", label: "Data penjualan (CSV/XLSX)", required: false },
  { kind: "bank_statement", label: "Mutasi rekening 6 bulan terakhir", required: true },
  { kind: "loan", label: "Perjanjian kredit & jaminan (jika ada)", required: false },
  { kind: "tax", label: "NPWP / bukti pajak daerah", required: false },
  { kind: "license", label: "Izin usaha", required: false },
] as const;

const FORM_SOURCE = { documentId: "form-pengajuan", page: 1, quote: "Diisi owner pada formulir pengajuan (belum diverifikasi dengan dokumen)" };

/** Bentuk dosier untuk policy engine dari isian form (sumber: formulir, bukan dokumen yang sudah diekstrak). */
export function dossierFrom(input: ApplicationInput): OwnerDossier {
  return {
    leaseMonthsRemaining: { value: input.dossier.leaseMonthsRemaining, source: FORM_SOURCE },
    monthlyBankInstallment: { value: input.dossier.monthlyBankInstallment, source: FORM_SOURCE },
    bankCovenantForbidsRevenueSale: input.dossier.bankCovenantForbidsRevenueSale,
    bankConsentLetter: input.dossier.bankConsentLetter,
    activeLandDispute: input.dossier.activeLandDispute,
    gatewayMonthsOfHistory: input.revenue.months.length,
  };
}

/** Verifikasi berdasarkan data yang DILAPORKAN owner. Deterministik; hasil akan diperiksa reviewer manusia. */
export function verifyReported(input: ApplicationInput) {
  return evaluatePolicy({
    dossier: dossierFrom(input),
    tenorMonths: input.offering.tenorMonths,
    monthlyEligible: input.revenue.months,
    occupancy: input.revenue.occupancyPct / 100,
    openExceptions: 0,
    proposed: { target: input.offering.target, unitPrice: input.offering.unitPrice, shareBps: input.offering.shareBps },
    dataSource: "self_reported",
    reportedGatewayPct: input.revenue.paymentMix.gatewayPct,
    landlordConsentsToSale: input.lease?.landlordConsentsToSale,
    insurance: input.assets.insurance ? { monthsLeft: insuranceMonthsLeft(input.assets.insurance.validUntil), coverage: input.assets.insurance.coverage } : null,
  });
}

/** Data yang TIDAK pernah dibuka ke investor: identitas, rekening, kontak, rincian utang dan sewa. */
export function privateDataOf(input: ApplicationInput) {
  const c = input.company;
  return {
    business: input.business,
    payout: input.payout,
    property: input.property,
    disputeNote: input.dossier.disputeNote,
    lease: input.lease,
    debt: { outstanding: input.dossier.debtOutstanding, remainingMonths: input.dossier.debtRemainingMonths, collateral: input.dossier.collateral },
    monthlyOpex: input.dossier.monthlyOpex,
    revenueBreakdown: input.revenue.breakdown,
    address: { street: c.address, kelurahan: c.kelurahan, postalCode: c.postalCode, landmark: c.landmark },
  };
}

export interface UploadedDoc { kind: string; file: File }

/** Simpan pengajuan: venue + seri (Draft) + dokumen, lalu jalankan verifikasi otomatis. */
export async function submitApplication(me: Me, input: ApplicationInput, docs: UploadedDoc[]) {
  const pf = platformDb();
  const { data: existing } = await pf.from("series").select("token_symbol");
  const symbol = tokenSymbolFor(input.company.name, (existing ?? []).map((s) => s.token_symbol).filter(Boolean) as string[]);

  const { data: venue, error: ve } = await pf.from("venues").insert({
    owner_id: me.userId, pos_company_id: null, name: input.company.name, sport: input.company.sports.join(", "), synthetic: false,
    dossier: dossierFrom(input), company_info: { name: input.company.name, city: input.company.city, area: input.company.area, province: input.company.province, sports: input.company.sports, courts: input.company.courts }, reported_revenue: input.revenue, data_source: "self_reported", status: "applied",
  }).select("*").single();
  if (ve) throw new Error(`Pengajuan: ${ve.message}`);

  const { data: series, error: se } = await pf.from("series").insert({
    venue_id: venue!.id, status: "Verifying", target: input.offering.target, min_raise: input.offering.minRaise, unit_price: input.offering.unitPrice,
    share_bps: input.offering.shareBps, tenor_days: input.offering.tenorMonths * 30, use_of_funds: input.offering.useOfFunds || null,
    token_symbol: symbol, name: `${input.company.name} · bagi hasil omzet`,
  }).select("*").single();
  if (se) {
    await pf.from("venues").delete().eq("id", venue!.id);
    throw new Error(`Seri: ${se.message}`);
  }

  const { error: pe } = await pf.from("venue_private").insert({ venue_id: venue!.id, data: privateDataOf(input) });
  if (pe) {
    await pf.from("series").delete().eq("id", series!.id);
    await pf.from("venues").delete().eq("id", venue!.id);
    throw new Error(`Pengajuan: ${pe.message}`);
  }
  const refs: { kind: string; sha256: string }[] = [];
  try {
    for (const d of docs) {
      const up = await uploadDocument(venue!.id, d.kind, d.file);
      await pf.from("documents").insert({ venue_id: venue!.id, kind: d.kind, storage_path: up.path, sha256: up.sha256, synthetic: false, original_name: d.file.name, size_bytes: up.size });
      refs.push({ kind: d.kind, sha256: up.sha256 });
    }
  } catch (e) {
    // dokumen gagal: batalkan pengajuan agar tidak ada pengajuan setengah jadi
    await pf.from("documents").delete().eq("venue_id", venue!.id);
    await pf.from("series").delete().eq("id", series!.id);
    await pf.from("venues").delete().eq("id", venue!.id);
    throw e;
  }

  // halaman penawaran: isi dibekukan, hash-nya masuk evidenceRoot (perubahan data penting = verifikasi & attestation baru)
  const pack = buildDisclosure(input, refs, "self_reported");
  const dHash = disclosureHash(pack);
  await pf.from("venues").update({ disclosure: pack, disclosure_hash: dHash }).eq("id", venue!.id);

  const policy = verifyReported(input);
  const ctx = await getCtx(series!.id);
  await saveRun(ctx, { policy, asOf: new Date().toISOString(), exceptions: [], monthly: input.revenue.months, dataSource: "self_reported", disclosureHash: dHash });
  await pf.from("venues").update({ status: "verifying" }).eq("id", venue!.id);
  await audit(me.email, "application.submit", { venue: venue!.name, seriesId: series!.id, recommendation: policy.recommendation, score: policy.score });
  return { venueId: venue!.id as string, seriesId: series!.id as string, policy };
}
