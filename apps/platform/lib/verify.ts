import { keccak256, stringToBytes, toHex } from "viem";
import type { Ctx } from "./flow";
import type { PolicyResult } from "@venue-rwa/verification";

export const RULESET = "ruleset-v1|lease>=tenor|covenant-or-consent|no-dispute|gateway>=6m|recon-clean|score>=6000|band 10/25/30|haircut 10%/20%/35%(self-reported)";
export const rulesetHash = () => keccak256(toHex(stringToBytes(RULESET)));

/** Simpan hasil policy engine sebagai dasar attestation (dibaca reviewer). */
export async function saveRun(ctx: Ctx, input: { policy: PolicyResult; asOf: string; exceptions: unknown[]; monthly: number[]; dataSource: "pos" | "connector" | "self_reported"; disclosureHash?: string | null }) {
  const { policy } = input;
  const evidenceRoot = keccak256(toHex(stringToBytes(JSON.stringify({ asOf: input.asOf, dataSource: input.dataSource, gates: policy.gates, score: policy.score, exceptions: input.exceptions, monthly: input.monthly, disclosureHash: input.disclosureHash ?? null }))));
  const { data, error } = await ctx.pf.from("verification_runs").insert({
    series_id: ctx.series.id,
    score: policy.score,
    recommendation: policy.recommendation,
    gates: { gates: policy.gates, components: policy.components, reasons: policy.reasons, warnings: policy.warnings, asOf: input.asOf, exceptions: input.exceptions.length },
    evidence_root: evidenceRoot,
    ruleset_hash: rulesetHash(),
    reference_price: policy.price.reference,
    max_price: policy.price.maxPrice,
    data_source: input.dataSource,
    disclosure_hash: input.disclosureHash ?? null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}
