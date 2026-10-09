import { keccak256, stringToBytes, toHex, type Hex } from "viem";
import type { OnboardingInput } from "./onboarding";
import { financialSummary } from "./onboarding";
import type { Valuation } from "./economics";

/**
 * Halaman produk (disclosure pack, PRD v4.1 §4.1 "rumus, input, dan hasilnya ditampilkan transparan"):
 *  - public     : profil venue, ringkasan keuangan bulanan (omzet dan D), valuasi beserta inputnya, status lahan (tanpa nomor), risiko
 *  - sensitive  : alamat persis → hanya investor yang sudah KYC
 *  - TIDAK PERNAH dibuka: NIB/NPWP, identitas direksi dan pemilik manfaat, nomor sertifikat, rekening, rincian utang, data pelanggan.
 * Hash pack masuk ke evidence ACQUISITION_CLOSED: investor dapat memastikan isi yang ia lihat tidak berubah setelah diverifikasi.
 */
export interface DisclosurePublic {
  profile: {
    name: string; city: string; province: string; sports: string[]; courts: number;
    facilities: OnboardingInput["venue"]["facilities"]; openHour: number; closeHour: number; operatingSince: string; useOfFunds: string;
  };
  financials: { months: string[]; gross: number[]; distributable: number[]; digitalSharePct: number; annualized: boolean };
  valuation: { assetValue: number; d12: number; requiredYieldPct: number; vIncome: number; v: number; basis: "asset" | "income"; yieldPct: number; inBand: boolean; stakePct: number; supply: number; refPrice: number };
  risk: { landOwned: boolean; landRight: string; landEncumbered: boolean; encumbranceConsent: boolean; hasDebt: boolean; debtCovenantRestricts: boolean };
}
export interface DocRef { kind: string; sha256: string }
export interface Disclosure { public: DisclosurePublic; sensitive: { address: string }; documents: DocRef[] }

/** JSON kanonik: kunci objek diurutkan, sehingga hash stabil terhadap urutan penulisan. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function buildDisclosure(input: OnboardingInput, val: Valuation & { assetValue: number; d12: number; requiredYieldBps: number }, docs: DocRef[]): Disclosure {
  const f = financialSummary(input.financials, { stakeBps: input.offering.stakeBps, spvFeeBps: 0 });
  return {
    public: {
      profile: {
        name: input.venue.name, city: input.venue.city, province: input.venue.province, sports: [...input.venue.sports].sort(), courts: input.venue.facilities.length,
        facilities: input.venue.facilities, openHour: input.venue.openHour, closeHour: input.venue.closeHour, operatingSince: input.venue.operatingSince, useOfFunds: input.offering.useOfFunds,
      },
      financials: { months: input.financials.map((m) => m.month), gross: input.financials.map((m) => m.gross), distributable: f.monthlyD, digitalSharePct: f.digitalShareBps / 100, annualized: f.annualized },
      valuation: {
        assetValue: val.assetValue, d12: val.d12, requiredYieldPct: val.requiredYieldBps / 100, vIncome: val.vIncome, v: val.v, basis: val.basis,
        yieldPct: val.yieldBps / 100, inBand: val.inBand, stakePct: input.offering.stakeBps / 100, supply: val.supply, refPrice: val.refPrice,
      },
      risk: {
        landOwned: input.land.owned, landRight: input.land.rightType, landEncumbered: input.land.encumbered, encumbranceConsent: input.land.encumbranceConsent,
        hasDebt: input.debt.outstanding > 0, debtCovenantRestricts: input.debt.covenantRestricts,
      },
    },
    sensitive: { address: input.venue.address },
    documents: [...docs].sort((a, b) => (a.kind + a.sha256).localeCompare(b.kind + b.sha256)),
  };
}

/** Hash pack: bagian publik + hash alamat persis + hash dokumen (isi sensitif tidak ikut terbuka, tetapi terikat). */
export function disclosureHash(d: Disclosure): Hex {
  const addressHash = keccak256(toHex(stringToBytes(canonicalJson(d.sensitive))));
  return keccak256(toHex(stringToBytes(canonicalJson({ public: d.public, addressHash, documents: d.documents }))));
}
