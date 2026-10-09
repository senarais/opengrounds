import { createHash } from "node:crypto";
import { maskNumber, type FinancialMonth, type OnboardingInput } from "@venue-rwa/shared";
import { platformDb } from "../db";
import { audit } from "../flow";
import { uploadDocument } from "../storage";

export const DOC_KINDS = ["deed", "nib", "npwp", "land_certificate", "permit", "bank_statement", "financial_report", "sales_data", "tax", "debt", "insurance", "photo", "other"] as const;
export type DocKindAll = (typeof DOC_KINDS)[number];
export const DOC_LABEL: Record<DocKindAll, string> = {
  deed: "Akta pendirian/perubahan", nib: "NIB", npwp: "NPWP badan usaha", land_certificate: "Sertifikat tanah", permit: "Izin bangunan (PBG/SLF)",
  bank_statement: "Rekening koran", financial_report: "Laporan keuangan", sales_data: "Data penjualan (CSV/XLSX)", tax: "Bukti pajak", debt: "Perjanjian utang",
  insurance: "Polis asuransi", photo: "Foto venue", other: "Lainnya",
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Simpan pengajuan owner: badan usaha, pemilik manfaat (NIK disamarkan), venue, lahan, keuangan, rekening (disamarkan + hash),
 * dokumen; lalu buka kasus KYB berstatus SUBMITTED. Data privat hanya di tabel staf; tidak ada yang dibuka publik di tahap ini.
 */
export async function submitOnboarding(userId: string, input: OnboardingInput, files: { kind: DocKindAll; file: File }[], submittedBy?: string) {
  const pf = platformDb();
  const c = input.company;
  const { data: org, error: oe } = await pf.from("organizations").insert({
    owner_user_id: userId, legal_name: c.legalName, nib: c.nib, npwp: c.npwp, deed_number: c.deedNumber, deed_date: c.deedDate, registered_address: c.registeredAddress,
    kbli: c.kbli, directors: c.directors, commissioners: c.commissioners, signatory_name: c.signatoryName, signatory_title: c.signatoryTitle,
    contact_email: c.contactEmail, contact_phone: c.contactPhone, debt: input.debt,
  }).select("id").single();
  if (oe) throw new Error(oe.message);
  const orgId = org!.id as string;
  const cleanup = async () => { await pf.from("organizations").delete().eq("id", orgId); };
  try {
    await must(pf.from("beneficial_owners").insert(input.beneficialOwners.map((b) => ({ organization_id: orgId, full_name: b.fullName, ownership_pct: b.ownershipPct, id_number_masked: maskNumber(b.idNumber) }))));
    await must(pf.from("owner_bank_accounts").insert({
      organization_id: orgId, bank: input.payout.bank, account_masked: maskNumber(input.payout.accountNumber), account_hash: sha(input.payout.accountNumber),
      holder_name: input.payout.accountName, name_matches: input.payout.accountName.trim().toLowerCase() === c.legalName.trim().toLowerCase(),
    }));
    const v = input.venue;
    const gross = input.financials.reduce((a, m) => a + m.gross, 0);
    const digital = input.financials.reduce((a, m) => a + m.digitalGross, 0);
    const { data: venue, error: ve } = await pf.from("venues").insert({
      organization_id: orgId, name: v.name, sports: v.sports, address: v.address, city: v.city, province: v.province, lat: v.lat, lng: v.lng,
      courts: v.facilities.length, open_hour: v.openHour, close_hour: v.closeHour, facilities: v.facilities, operating_since: `${v.operatingSince}-01`,
      digital_share_pct: gross > 0 ? Math.round((digital / gross) * 10_000) / 100 : 0, offered_stake_bps: input.offering.stakeBps, use_of_funds: input.offering.useOfFunds,
      integrations: input.integrations, submitted_by: submittedBy ?? null,
    }).select("id").single();
    if (ve) throw new Error(ve.message);
    const venueId = venue!.id as string;
    const l = input.land;
    await must(pf.from("venue_land").insert({
      venue_id: venueId, owned: l.owned, right_type: l.rightType, certificate_number: l.certificateNumber, holder_name: l.holderName, encumbered: l.encumbered,
      encumbrance_consent: l.encumbranceConsent, permits: l.permits, appraised_value_idr: l.assetValue,
    }));
    await must(pf.from("venue_financials").insert(input.financials.map((m) => ({
      venue_id: venueId, month: `${m.month}-01`, gross: m.gross, refunds: m.refunds, opex: m.opex, tax: m.tax, operator_fee: m.operatorFee, reserve: m.reserve,
      platform_fee: m.platformFee, digital_gross: m.digitalGross, bank_credits: m.bankCredits, source: "upload",
    }))));
    for (const f of files) {
      const up = await uploadDocument(venueId, f.kind, f.file);
      await must(pf.from("documents").insert({ venue_id: venueId, kind: f.kind, storage_path: up.path, sha256: up.sha256, original_name: f.file.name, size_bytes: up.size }));
    }
    const { data: kc, error: ke } = await pf.from("kyb_cases").insert({ venue_id: venueId, status: "SUBMITTED" }).select("id").single();
    if (ke) throw new Error(ke.message);
    await audit(submittedBy ?? userId, "onboarding.submit", { entity: "venues", entityId: venueId, after: { name: v.name, stakeBps: input.offering.stakeBps, documents: files.map((f) => f.kind) } });
    return { venueId, caseId: kc!.id as string };
  } catch (e) {
    await cleanup().catch(() => null);
    throw e;
  }
}

async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

/**
 * Susun ulang pengajuan dari tabel (untuk gerbang KYB dan halaman produk). NIK dan nomor rekening tidak tersedia lagi
 * (hanya versi tersamarkan), sehingga hasilnya hanya dipakai untuk perhitungan, bukan divalidasi ulang.
 */
export async function loadOnboarding(venueId: string): Promise<{ input: OnboardingInput; venue: any; org: any; land: any; docs: any[] }> {
  const pf = platformDb();
  const { data: venue } = await pf.from("venues").select("*").eq("id", venueId).single();
  if (!venue) throw new Error("Venue tidak ditemukan");
  const [{ data: org }, { data: bos }, { data: land }, { data: fin }, { data: bank }, { data: docs }] = await Promise.all([
    pf.from("organizations").select("*").eq("id", venue.organization_id).single(),
    pf.from("beneficial_owners").select("*").eq("organization_id", venue.organization_id),
    pf.from("venue_land").select("*").eq("venue_id", venueId).single(),
    pf.from("venue_financials").select("*").eq("venue_id", venueId).order("month"),
    pf.from("owner_bank_accounts").select("*").eq("organization_id", venue.organization_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    pf.from("documents").select("*").eq("venue_id", venueId).order("uploaded_at"),
  ]);
  const months: FinancialMonth[] = (fin ?? []).map((m) => ({
    month: String(m.month).slice(0, 7), gross: Number(m.gross), refunds: Number(m.refunds), opex: Number(m.opex), tax: Number(m.tax), operatorFee: Number(m.operator_fee),
    reserve: Number(m.reserve), platformFee: Number(m.platform_fee), digitalGross: Number(m.digital_gross), bankCredits: m.bank_credits === null ? null : Number(m.bank_credits),
  }));
  const input: OnboardingInput = {
    company: {
      legalName: org.legal_name, nib: org.nib, npwp: org.npwp, deedNumber: org.deed_number, deedDate: org.deed_date, registeredAddress: org.registered_address, kbli: org.kbli,
      directors: org.directors, commissioners: org.commissioners, signatoryName: org.signatory_name, signatoryTitle: org.signatory_title, contactEmail: org.contact_email, contactPhone: org.contact_phone,
    },
    beneficialOwners: (bos ?? []).map((b) => ({ fullName: b.full_name, ownershipPct: Number(b.ownership_pct), idNumber: b.id_number_masked ?? "" })),
    venue: {
      name: venue.name, address: venue.address, city: venue.city, province: venue.province, lat: venue.lat === null ? null : Number(venue.lat), lng: venue.lng === null ? null : Number(venue.lng),
      sports: venue.sports, openHour: venue.open_hour, closeHour: venue.close_hour, operatingSince: String(venue.operating_since ?? "").slice(0, 7), facilities: venue.facilities,
    },
    land: {
      owned: land.owned, rightType: land.right_type, certificateNumber: land.certificate_number, holderName: land.holder_name, encumbered: land.encumbered,
      encumbranceConsent: land.encumbrance_consent, permits: land.permits ?? [], assetValue: Number(land.appraised_value_idr ?? 0),
    },
    financials: months,
    debt: { outstanding: 0, monthlyInstallment: 0, lender: "", covenantRestricts: false, ...(org.debt ?? {}) },
    offering: { stakeBps: venue.offered_stake_bps, useOfFunds: venue.use_of_funds ?? "" },
    payout: { bank: bank?.bank ?? "", accountName: bank?.holder_name ?? "", accountNumber: bank?.account_masked ?? "" },
    integrations: { gatewayOnly: true, bankDataAccess: !!venue.integrations?.bankDataAccess },
    consent: { dataProcessing: true, truthful: true },
  };
  return { input, venue, org, land, docs: docs ?? [] };
}

/** Venue milik owner yang login (bisa lebih dari satu). */
export async function venuesOfOwner(userId: string) {
  const pf = platformDb();
  const { data: orgs } = await pf.from("organizations").select("id, legal_name").eq("owner_user_id", userId);
  if (!orgs?.length) return [];
  const { data: venues } = await pf.from("venues").select("*").in("organization_id", orgs.map((o) => o.id)).order("created_at", { ascending: false });
  return venues ?? [];
}

export async function ownerOfVenue(venueId: string): Promise<string> {
  const pf = platformDb();
  const { data: v } = await pf.from("venues").select("organization_id").eq("id", venueId).single();
  const { data: o } = await pf.from("organizations").select("owner_user_id").eq("id", v!.organization_id).single();
  return o!.owner_user_id as string;
}
