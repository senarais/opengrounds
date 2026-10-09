import { keccak256, stringToBytes, toHex, type Hex } from "viem";
import type { ApplicationInput, Facility } from "./application";

/**
 * Halaman penawaran (disclosure pack). Pengelompokan keterbukaan:
 *  - public     : profil venue, kinerja (berlabel sumber data), syarat penawaran, risiko & kewajiban  → semua orang
 *  - sensitive  : alamat persis dan salinan dokumen                                                    → hanya investor yang sudah KYC
 *  - TIDAK PERNAH dibuka: KTP/data pribadi owner, nomor rekening, data pelanggan (tidak ada di pack ini).
 * Hash pack masuk ke evidenceRoot attestation: investor dapat memastikan isi yang ia lihat tidak berubah setelah diverifikasi.
 */
export interface DisclosurePublic {
  profile: { name: string; city: string; area: string; province: string; sports: string[]; courts: number; courtSpecs: string; facilities: Facility[]; openHour: number; closeHour: number; tariffNote: string; operatingSince: string; builtYear: number; capexPlan: string; insured: boolean; insurance: { insurer: string; coverage: string[]; sumInsured: number; validUntil: string } | null };
  performance: { months: number[]; occupancyPct: number; dataSource: "pos" | "connector" | "self_reported"; paymentMix: { gatewayPct: number; cashPct: number; transferPct: number } };
  terms: { target: number; minRaise: number; unitPrice: number; shareBps: number; tenorMonths: number };
  risk: {
    land: "milik" | "sewa"; building: "milik" | "sewa" | "tidak_ada"; ownedAssetPledged: boolean;
    /** null bila tanah dan bangunan milik sendiri. */
    leaseMonthsRemaining: number | null; hasBankDebt: boolean; installmentToRevenuePct: number; revenueSaleForbiddenByCredit: boolean; bankConsentLetter: boolean;
    activeDispute: boolean; hasNpwp: boolean; hasBusinessLicense: boolean; relatedParty: boolean; relatedPartyNote: string; useOfFunds: string;
    collateral: string; otherPledgedPct: number; otherPledgeNote: string; landlordConsentsToSale: boolean | null; leaseRenewalOption: boolean | null;
  };
}
export interface DocRef { kind: string; sha256: string }
export interface Disclosure { public: DisclosurePublic; sensitive: { address: string; kelurahan: string; postalCode: string; landmark: string }; documents: DocRef[] }

/** JSON kanonik: kunci objek diurutkan, sehingga hash stabil terhadap urutan penulisan. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function buildDisclosure(input: ApplicationInput, docs: DocRef[], dataSource: "pos" | "connector" | "self_reported" = "self_reported"): Disclosure {
  const months = input.revenue.months;
  const avg = months.reduce((a, b) => a + b, 0) / Math.max(1, months.length);
  return {
    public: {
      profile: {
        name: input.company.name, city: input.company.city, area: input.company.area, province: input.company.province, sports: [...input.company.sports].sort(), courts: input.company.courts,
        courtSpecs: input.company.courtSpecs, facilities: input.company.facilities, openHour: input.company.openHour, closeHour: input.company.closeHour, tariffNote: input.company.tariffNote,
        operatingSince: input.business.operatingSince, builtYear: input.assets.builtYear, capexPlan: input.assets.capexPlan, insured: input.assets.insured, insurance: input.assets.insurance ? { ...input.assets.insurance, coverage: [...input.assets.insurance.coverage].sort() } : null,
      },
      performance: { months, occupancyPct: input.revenue.occupancyPct, dataSource, paymentMix: input.revenue.paymentMix },
      terms: { target: input.offering.target, minRaise: input.offering.minRaise, unitPrice: input.offering.unitPrice, shareBps: input.offering.shareBps, tenorMonths: input.offering.tenorMonths },
      risk: {
        land: input.property.land, building: input.property.building, ownedAssetPledged: input.property.ownedAssetPledged,
        leaseMonthsRemaining: input.lease ? input.dossier.leaseMonthsRemaining : null,
        hasBankDebt: input.dossier.monthlyBankInstallment > 0,
        installmentToRevenuePct: avg > 0 ? Math.round((input.dossier.monthlyBankInstallment / avg) * 1000) / 10 : 0,
        revenueSaleForbiddenByCredit: input.dossier.bankCovenantForbidsRevenueSale,
        bankConsentLetter: input.dossier.bankConsentLetter,
        activeDispute: input.dossier.activeLandDispute,
        hasNpwp: input.dossier.hasNpwp,
        hasBusinessLicense: input.dossier.hasBusinessLicense,
        relatedParty: input.dossier.relatedParty,
        relatedPartyNote: input.dossier.relatedPartyNote,
        useOfFunds: input.offering.useOfFunds,
        collateral: input.dossier.collateral,
        otherPledgedPct: input.dossier.otherPledgedBps / 100,
        otherPledgeNote: input.dossier.otherPledgeNote,
        landlordConsentsToSale: input.lease ? input.lease.landlordConsentsToSale : null,
        leaseRenewalOption: input.lease ? input.lease.renewalOption : null,
      },
    },
    sensitive: { address: input.company.address, kelurahan: input.company.kelurahan, postalCode: input.company.postalCode, landmark: input.company.landmark },
    documents: [...docs].sort((a, b) => (a.kind + a.sha256).localeCompare(b.kind + b.sha256)),
  };
}

/** Hash pack: bagian publik + hash alamat persis + hash dokumen (isi sensitif tidak ikut terbuka, tetapi terikat). */
export function disclosureHash(d: Disclosure): Hex {
  const addressHash = keccak256(toHex(stringToBytes(canonicalJson(d.sensitive))));
  return keccak256(toHex(stringToBytes(canonicalJson({ public: d.public, addressHash, documents: d.documents }))));
}
