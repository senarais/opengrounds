import { DEMO_PARAMS, financialSummary, valuation, type OnboardingInput, type Valuation } from "@venue-rwa/shared";
import { sameName } from "./crosscheck";
import { finding, type Finding } from "./findings";

/** Required KYB evidence documents (§8.3). */
export const REQUIRED_DOCS = ["deed", "nib", "npwp", "land_certificate", "bank_statement"] as const;

export interface GateResult {
  findings: Finding[];
  /** true = ada penghalang (critical). Keputusan tetap di tangan reviewer manusia. */
  blocked: boolean;
  financial: ReturnType<typeof financialSummary>;
  valuation: (Valuation & { assetValue: number; d12: number; requiredYieldBps: number }) | null;
}

/**
 * Required-data and owner hard-stop gate (PRD v4.1 §2.3, §3.2, §4.3, §8.3). Deterministic for identical input.
 * `assetValue` is reviewer-entered asset value, defaulting to the owner's claim.
 */
export function kybGate(input: OnboardingInput, docKinds: string[], opts: { assetValue?: number; params?: typeof DEMO_PARAMS } = {}): GateResult {
  const p = opts.params ?? DEMO_PARAMS;
  const out: Finding[] = [];
  const G = "cross_check";

  for (const k of REQUIRED_DOCS) if (!docKinds.includes(k))
    out.push(finding({ agent: G, checkType: "required_docs", code: "MISSING_DOCUMENT", severity: "critical", verified: false, text: `Required document not uploaded: ${k}.` }));

  if (!input.land.owned)
    out.push(finding({ agent: G, checkType: "land_ownership", code: "LAND_NOT_OWNED", severity: "critical", text: "Venue land is not self-owned and does not meet the venue requirements (§2.3).", fieldPaths: ["land.owned"] }));
  const ownerNames = [input.company.legalName, ...input.company.directors.map((d) => d.name), ...input.beneficialOwners.map((b) => b.fullName)];
  if (input.land.owned && !ownerNames.some((n) => sameName(input.land.holderName, n)))
    out.push(finding({ agent: G, checkType: "land_ownership", code: "LAND_HOLDER_NOT_OWN", severity: "critical", text: `Certificate holder "${input.land.holderName}" does not match the company, a director, or a beneficial owner.`, fieldPaths: ["land.holderName"] }));
  if (input.land.encumbered && !input.land.encumbranceConsent)
    out.push(finding({ agent: G, checkType: "land_encumbrance", code: "ENCUMBERED_NO_CONSENT", severity: "critical", text: "Pledged land requires written lender consent, which was not provided.", fieldPaths: ["land.encumbered", "land.encumbranceConsent"] }));
  else if (input.land.encumbered)
    out.push(finding({ agent: G, checkType: "land_encumbrance", code: "ENCUMBERED_WITH_CONSENT", severity: "medium", text: "Land is pledged; verify the lender consent letter.", fieldPaths: ["land.encumbered"] }));
  if (input.debt.covenantRestricts)
    out.push(finding({ agent: G, checkType: "debt", code: "DEBT_COVENANT", severity: "high", text: "Loan terms restrict revenue transfers or pledges; lender consent may be required.", fieldPaths: ["debt.covenantRestricts"] }));

  const fin = financialSummary(input.financials, { stakeBps: input.offering.stakeBps, spvFeeBps: p.spvFeeBps });
  if (fin.digitalShareBps < p.minDigitalShareBps)
    out.push(finding({ agent: "reconciliation", checkType: "digital_share", code: "DIGITAL_BELOW_THRESHOLD", severity: "high", text: `Digitally recorded payments (${fin.digitalShareBps / 100}%) are below the ${p.minDigitalShareBps / 100}% threshold.`, fieldPaths: ["financials"] }));
  if (input.financials.length < 12)
    out.push(finding({ agent: "reconciliation", checkType: "history", code: "SHORT_HISTORY", severity: "low", text: `${input.financials.length} months of history supplied. D12 is annualized from the available months.`, fieldPaths: ["financials"] }));
  const overCap = input.financials.filter((m) => m.gross > 0 && m.opex * 10_000 > m.gross * p.maxOpexBps);
  if (overCap.length)
    out.push(finding({ agent: "reconciliation", checkType: "opex_cap", code: "OPEX_ABOVE_CAP", severity: "medium", text: `Operating expenses exceed the ${p.maxOpexBps / 100}% gross cap in ${overCap.map((m) => m.month).join(", ")}. The contract will reject such a period.`, fieldPaths: ["financials"] }));
  for (const m of input.financials) if (m.bankCredits !== null && m.gross > m.bankCredits * 1.1)
    out.push(finding({ agent: "reconciliation", checkType: "bank_vs_reported", code: "MONTH_ABOVE_BANK", severity: "medium", text: `${m.month}: reported gross revenue exceeds bank credits by more than 10%.`, fieldPaths: ["financials"] }));

  let val: GateResult["valuation"] = null;
  const assetValue = opts.assetValue ?? input.land.assetValue;
  if (fin.d12 <= 0) {
    out.push(finding({ agent: "reconciliation", checkType: "valuation", code: "NO_DISTRIBUTABLE", severity: "critical", text: "D12 is not positive. The venue has no distributable profit in the submitted period.", fieldPaths: ["financials"] }));
  } else {
    const v = valuation({ assetValue, d12: fin.d12, requiredYieldBps: p.requiredYieldBps, stakeBps: input.offering.stakeBps, tokenPrice: input.offering.tokenPrice ?? p.tokenPrice, yieldMinBps: p.yieldMinBps, yieldMaxBps: p.yieldMaxBps });
    val = { ...v, assetValue, d12: fin.d12, requiredYieldBps: p.requiredYieldBps };
    if (!v.inBand)
      out.push(finding({ agent: "risk", checkType: "sanity_gate", code: "YIELD_OUT_OF_BAND", severity: "medium",
        text: v.yieldBps > p.yieldMaxBps ? `Implied yield ${v.yieldBps / 100}% exceeds ${p.yieldMaxBps / 100}%. Valuation may be low or reported income high.` : `Implied yield ${v.yieldBps / 100}% is below ${p.yieldMinBps / 100}%. Valuation may be high.`,
        fieldPaths: ["land.assetValue", "financials"] }));
  }
  return { findings: out, blocked: out.some((f) => f.severity === "critical"), financial: fin, valuation: val };
}
