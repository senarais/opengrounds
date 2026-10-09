import type { Address } from "viem";
import { MAX_SHARE_BPS } from "@venue-rwa/shared";
import { ADDR, attestationAbi } from "../chain";
import { chainAttState, currentDraft, requiredSignatures } from "../attest";
import { attMessage, assetIdFor, type AttPayload } from "../eip712";
import { audit, chainRef, type Ctx } from "../flow";
import { operatorSend } from "../operator";
import { onchainSigners } from "../signers";
import { provisionPos } from "./provision";

export async function createDraft(ctx: Ctx, predictedSeries?: Address) {
  const ref = predictedSeries ? { series: predictedSeries } : chainRef(ctx);
  const { data: run } = await ctx.pf.from("verification_runs").select("*").eq("series_id", ctx.series.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) throw new Error("Belum ada hasil verifikasi tersimpan untuk seri ini.");
  const { nonce } = await chainAttState(ref.series);
  const verdict = run.recommendation === "pass" ? 1 : 2;
  const payload: AttPayload = {
    series: ref.series,
    assetId: assetIdFor(ctx.venue.id),
    verdict,
    aiRecommendation: verdict,
    score: run.score,
    evidenceRoot: run.evidence_root,
    rulesetHash: run.ruleset_hash,
    maxPrice: String(run.max_price),
    maxShareBps: ctx.series.share_bps,
    maxTotalShareBps: MAX_SHARE_BPS, // batas total beban atas omzet lintas seri (parameter kebijakan)
    expiry: String(Math.floor(Date.now() / 1000) + 30 * 86_400),
    overrideReasonHash: `0x${"00".repeat(32)}`,
    nonce: nonce.toString(),
  };
  await ctx.pf.from("attestations").delete().eq("series_id", ctx.series.id).is("submitted_tx", null);
  const { error } = await ctx.pf.from("attestations").insert({
    series_id: ctx.series.id, run_id: run.id, verdict: verdict === 1 ? "pass" : "fail", nonce: Number(nonce),
    expiry: new Date(Number(payload.expiry) * 1000).toISOString(), payload, signatures: [],
  });
  if (error) throw new Error(error.message);
  await audit("platform", "attestation.draft", { series: ctx.series.id, nonce: payload.nonce, verdict });
  return "Draft attestation dibuat. Penandatangan sekarang bisa menandatangani payload yang sama.";
}

/** Kirim attestation yang sudah kuorum ke kontrak. Bila verdict pass, workspace PoS perusahaan dibuat (akun PoS = hasil persetujuan). */
export async function submitAttestation(ctx: Ctx) {
  const d = await currentDraft(ctx.series.id);
  if (!d) throw new Error("Belum ada draft");
  const need = requiredSignatures(d.payload);
  if (d.signatures.length < need) throw new Error(`Butuh ${need} tanda tangan, baru ${d.signatures.length}`);
  // persetujuan wajib memuat pihak independen (signers[2] di kontrak); periksa dulu supaya pesannya jelas dan tidak membuang gas
  if (need >= 2) {
    const independent = (await onchainSigners())[2]!.toLowerCase();
    if (!d.signatures.some((s) => s.signer.toLowerCase() === independent)) throw new Error("Persetujuan wajib ditandatangani pihak independen (Signer 3 / auditor luar). Dua anggota tim saja tidak cukup.");
  }
  // kontrak mewajibkan alamat penandatangan terurut NAIK
  const sorted = [...d.signatures].sort((a, b) => (BigInt(a.signer) < BigInt(b.signer) ? -1 : 1));
  const hash = await operatorSend(ADDR.attestation, attestationAbi as any, "submit", [attMessage(d.payload), sorted.map((s) => s.sig)]);
  await ctx.pf.from("attestations").update({ submitted_tx: hash }).eq("id", d.id);
  const pass = d.payload.verdict === 1;
  await ctx.pf.from("series").update({ status: pass ? "Attested" : "Failed" }).eq("id", ctx.series.id);
  if (!pass) await ctx.pf.from("venues").update({ status: "rejected" }).eq("id", ctx.venue.id);
  await audit("platform", "attestation.submit", { tx: hash, signers: sorted.map((s) => s.signer), verdict: pass ? "pass" : "fail" });
  let extra = "";
  if (pass) {
    const p = await provisionPos(ctx);
    extra = p.created ? " Workspace PoS perusahaan dibuat; owner bisa login dengan akun yang sama." : "";
  }
  return `Attestation tercatat on-chain (${hash.slice(0, 12)}…).${extra}`;
}
