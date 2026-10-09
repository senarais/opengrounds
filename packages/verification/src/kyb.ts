import { DEMO_PARAMS, financialSummary, valuation, type OnboardingInput, type Valuation } from "@venue-rwa/shared";
import { sameName } from "./crosscheck";
import { finding, type Finding } from "./findings";

/** Dokumen wajib gerbang data (§8.3). */
export const REQUIRED_DOCS = ["deed", "nib", "npwp", "land_certificate", "bank_statement"] as const;

export interface GateResult {
  findings: Finding[];
  /** true = ada penghalang (critical). Keputusan tetap di tangan reviewer manusia. */
  blocked: boolean;
  financial: ReturnType<typeof financialSummary>;
  valuation: (Valuation & { assetValue: number; d12: number; requiredYieldBps: number }) | null;
}

/**
 * Gerbang data wajib dan hard-stop owner (PRD v4.1 §2.3, §3.2, §4.3, §8.3). Deterministik: input sama = hasil sama.
 * `assetValue` = V_aset yang dipakai (input reviewer dari dokumen; default klaim owner).
 */
export function kybGate(input: OnboardingInput, docKinds: string[], opts: { assetValue?: number; params?: typeof DEMO_PARAMS } = {}): GateResult {
  const p = opts.params ?? DEMO_PARAMS;
  const out: Finding[] = [];
  const G = "cross_check";

  for (const k of REQUIRED_DOCS) if (!docKinds.includes(k))
    out.push(finding({ agent: G, checkType: "required_docs", code: "MISSING_DOCUMENT", severity: "critical", verified: false, text: `Dokumen wajib belum diunggah: ${k}` }));

  if (!input.land.owned)
    out.push(finding({ agent: G, checkType: "land_ownership", code: "LAND_NOT_OWNED", severity: "critical", text: "Tanah bukan milik sendiri: tidak memenuhi kriteria venue (§2.3)", fieldPaths: ["land.owned"] }));
  const ownerNames = [input.company.legalName, ...input.company.directors.map((d) => d.name), ...input.beneficialOwners.map((b) => b.fullName)];
  if (input.land.owned && !ownerNames.some((n) => sameName(input.land.holderName, n)))
    out.push(finding({ agent: G, checkType: "land_ownership", code: "LAND_HOLDER_NOT_OWN", severity: "critical", text: `Sertifikat atas nama "${input.land.holderName}", bukan badan usaha, direksi, atau pemilik manfaat`, fieldPaths: ["land.holderName"] }));
  if (input.land.encumbered && !input.land.encumbranceConsent)
    out.push(finding({ agent: G, checkType: "land_encumbrance", code: "ENCUMBERED_NO_CONSENT", severity: "critical", text: "Lahan dijaminkan tanpa persetujuan tertulis pemegang hak tanggungan", fieldPaths: ["land.encumbered", "land.encumbranceConsent"] }));
  else if (input.land.encumbered)
    out.push(finding({ agent: G, checkType: "land_encumbrance", code: "ENCUMBERED_WITH_CONSENT", severity: "medium", text: "Lahan dijaminkan; ada persetujuan kreditur (verifikasi suratnya)", fieldPaths: ["land.encumbered"] }));
  if (input.debt.covenantRestricts)
    out.push(finding({ agent: G, checkType: "debt", code: "DEBT_COVENANT", severity: "high", text: "Perjanjian kredit membatasi penjualan/penjaminan pendapatan: perlu persetujuan kreditur", fieldPaths: ["debt.covenantRestricts"] }));

  const fin = financialSummary(input.financials, { stakeBps: input.offering.stakeBps, spvFeeBps: p.spvFeeBps });
  if (fin.digitalShareBps < p.minDigitalShareBps)
    out.push(finding({ agent: "reconciliation", checkType: "digital_share", code: "DIGITAL_BELOW_THRESHOLD", severity: "high", text: `Porsi pembayaran digital ${fin.digitalShareBps / 100}% di bawah ambang ${p.minDigitalShareBps / 100}%`, fieldPaths: ["financials"] }));
  if (input.financials.length < 12)
    out.push(finding({ agent: "reconciliation", checkType: "history", code: "SHORT_HISTORY", severity: "low", text: `Riwayat ${input.financials.length} bulan: D12 disetahunkan dari data yang ada`, fieldPaths: ["financials"] }));
  const overCap = input.financials.filter((m) => m.gross > 0 && m.opex * 10_000 > m.gross * p.maxOpexBps);
  if (overCap.length)
    out.push(finding({ agent: "reconciliation", checkType: "opex_cap", code: "OPEX_ABOVE_CAP", severity: "medium", text: `Biaya operasional melebihi plafon ${p.maxOpexBps / 100}% omzet pada ${overCap.map((m) => m.month).join(", ")}: periode seperti ini akan ditolak kontrak`, fieldPaths: ["financials"] }));
  for (const m of input.financials) if (m.bankCredits !== null && m.gross > m.bankCredits * 1.1)
    out.push(finding({ agent: "reconciliation", checkType: "bank_vs_reported", code: "MONTH_ABOVE_BANK", severity: "medium", text: `${m.month}: omzet dilaporkan melebihi dana masuk rekening lebih dari 10%`, fieldPaths: ["financials"] }));

  let val: GateResult["valuation"] = null;
  const assetValue = opts.assetValue ?? input.land.assetValue;
  if (fin.d12 <= 0) {
    out.push(finding({ agent: "reconciliation", checkType: "valuation", code: "NO_DISTRIBUTABLE", severity: "critical", text: "D12 tidak positif: venue tidak menghasilkan laba yang bisa dibagikan", fieldPaths: ["financials"] }));
  } else {
    const v = valuation({ assetValue, d12: fin.d12, requiredYieldBps: p.requiredYieldBps, stakeBps: input.offering.stakeBps, tokenPrice: input.offering.tokenPrice ?? p.tokenPrice, yieldMinBps: p.yieldMinBps, yieldMaxBps: p.yieldMaxBps });
    val = { ...v, assetValue, d12: fin.d12, requiredYieldBps: p.requiredYieldBps };
    if (!v.inBand)
      out.push(finding({ agent: "risk", checkType: "sanity_gate", code: "YIELD_OUT_OF_BAND", severity: "medium",
        text: v.yieldBps > p.yieldMaxBps ? `Imbal hasil tersirat ${v.yieldBps / 100}% di atas ${p.yieldMaxBps / 100}%: valuasi mungkin terlalu rendah atau pendapatan terlalu tinggi` : `Imbal hasil tersirat ${v.yieldBps / 100}% di bawah ${p.yieldMinBps / 100}%: valuasi mungkin terlalu tinggi`,
        fieldPaths: ["land.assetValue", "financials"] }));
  }
  return { findings: out, blocked: out.some((f) => f.severity === "critical"), financial: fin, valuation: val };
}
