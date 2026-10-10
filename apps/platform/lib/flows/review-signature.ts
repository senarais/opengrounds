import { canonicalJson } from "@venue-rwa/shared";
import { REVIEW_SIGNATURE_TTL, reviewApprovalData, reviewQuorum, verifyReviewApproval, type ReviewVote } from "@venue-rwa/verification";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import type { Me } from "../auth";
import { chain, REGISTRY, registrySigners } from "../chain";
import { platformDb } from "../db";
import { evidenceHashOf, walletTypedData } from "../eip712";
import { loadOnboarding } from "./onboarding";

async function approvalSnapshot(caseId: string, me: Me, assetValue: number, note: string, deadline: bigint, wallet?: Address) {
  if (!Number.isSafeInteger(assetValue) || assetValue <= 0) throw new Error("Enter a positive whole-rupiah asset value.");
  if (me.role !== "reviewer" && me.role !== "operator") throw new Error("You are not authorized to approve this review.");
  const pf = platformDb();
  const { data: kc, error } = await pf.from("kyb_cases").select("*").eq("id", caseId).single();
  if (error || !kc) throw new Error("Review case not found.");
  if (kc.status !== "IN_REVIEW") throw new Error("This application is not ready for review or has already been decided.");
  const { data: findings, error: findingError } = await pf.from("kyb_findings").select("*").eq("case_id", caseId).order("id");
  if (findingError) throw new Error("Could not load review findings.");
  if ((findings ?? []).some((f) => ["critical", "high"].includes(f.severity) && !f.disposition)) throw new Error("Review all critical and high findings before approval.");
  if ((findings ?? []).some((f) => f.disposition === "rejected")) throw new Error("A finding is marked as a reason to decline.");
  if (!kc.gate_result?.valuation) throw new Error("Valuation is not available yet.");
  const { input, docs, venue } = await loadOnboarding(kc.venue_id);
  const signer = me.role === "reviewer" ? (await registrySigners()).verifier : null;
  if (signer && wallet && wallet.toLowerCase() !== signer.toLowerCase()) throw new Error("Select the registered verifier wallet to sign as reviewer.");
  if (signer && me.wallet && me.wallet.toLowerCase() !== signer.toLowerCase()) throw new Error("Reviewer account wallet does not match the registered verifier.");
  const approval = {
    caseId, reviewerId: me.userId, reviewerWallet: wallet ?? signer ?? zeroAddress, venue: venue.name, assetValueIdr: BigInt(assetValue), note,
    evidenceHash: evidenceHashOf(canonicalJson({ case: kc, input, docs: [...docs].sort((a, b) => a.id.localeCompare(b.id)), findings })), deadline,
  };
  return { approval, signer, version: kc.updated_at, registry: REGISTRY.address };
}

export async function prepareReviewApproval(caseId: string, me: Me, assetValue: number, note: string, wallet: string) {
  if (!isAddress(wallet)) throw new Error("Connect a MetaMask wallet to review.");
  const snapshot = await approvalSnapshot(caseId, me, assetValue, note, BigInt(Math.floor(Date.now() / 1000) + REVIEW_SIGNATURE_TTL), wallet);
  const td = reviewApprovalData(snapshot.approval, chain.id, snapshot.registry);
  return { typed: walletTypedData(td.primaryType, td.types, td.domain, td.message), signer: snapshot.signer, chainId: chain.id, deadline: String(snapshot.approval.deadline) };
}

export interface ReviewProof { signature: Hex; deadline: string; wallet: string }
export async function validateReviewApproval(caseId: string, me: Me, assetValue: number, note: string, proof?: ReviewProof) {
  if (!proof || !isAddress(proof.wallet) || !/^0x[0-9a-fA-F]{130}$/.test(proof.signature) || !/^\d{1,12}$/.test(proof.deadline)) throw new Error("Sign the approval in MetaMask using Approve & sign.");
  const snapshot = await approvalSnapshot(caseId, me, assetValue, note, BigInt(proof.deadline), proof.wallet);
  const signer = snapshot.signer ?? proof.wallet;
  await verifyReviewApproval(snapshot.approval, proof.signature, signer, chain.id, snapshot.registry);
  const td = reviewApprovalData(snapshot.approval, chain.id, snapshot.registry);
  return { version: snapshot.version, signedReview: { role: me.role, reviewerId: me.userId, signer, signature: proof.signature, typed: JSON.parse(walletTypedData(td.primaryType, td.types, td.domain, td.message)) } };
}

export async function savedReviewQuorum(caseId: string, evidenceHash: Hex, assetValue: number) {
  const { data, error } = await platformDb().from("audit_log").select("detail, created_at").eq("action", "kyb.review.signed").eq("entity_id", caseId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not read review approvals.");
  const reg = await registrySigners();
  const votes: ReviewVote[] = [];
  for (const row of data ?? []) {
    const d = row.detail;
    const m = d?.typed?.message;
    if (!m || !["operator", "reviewer"].includes(d.role) || m.caseId !== caseId || m.reviewerId !== d.reviewerId || m.decision !== "APPROVED" || m.evidenceHash !== evidenceHash || String(m.assetValueIdr) !== String(assetValue)) continue;
    if (!isAddress(d.signer)) continue;
    const signer = d.role === "operator" ? d.signer : reg.verifier;
    if (d.signer?.toLowerCase() !== signer.toLowerCase()) continue;
    try {
      // A signature must have been submitted within its window. An already recorded vote remains valid
      // while its evidence and valuation are unchanged, even if the second reviewer comes later.
      await verifyReviewApproval({ caseId, reviewerId: m.reviewerId, reviewerWallet: m.reviewerWallet, venue: m.venue, assetValueIdr: BigInt(m.assetValueIdr), note: m.note, evidenceHash, deadline: BigInt(m.deadline) }, d.signature, signer, chain.id, REGISTRY.address, Math.floor(Date.parse(row.created_at) / 1000));
      votes.push({ role: d.role, reviewerId: d.reviewerId, signer, evidenceHash, assetValueIdr: String(assetValue) });
    } catch { /* Stale or invalid evidence cannot contribute to approval. */ }
  }
  return reviewQuorum(votes, evidenceHash, String(assetValue));
}

export async function reviewApprovalProgress(caseId: string, me: Me, assetValue: number) {
  const { approval } = await approvalSnapshot(caseId, me, assetValue, "", BigInt(Math.floor(Date.now() / 1000) + REVIEW_SIGNATURE_TTL));
  const { data, error } = await platformDb().from("audit_log").select("detail").eq("action", "kyb.review.signed").eq("entity_id", caseId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not read review approvals.");
  const latest = (data ?? []).find((r) => r.detail?.typed?.message?.evidenceHash === approval.evidenceHash);
  const lastValue = Number(latest?.detail?.typed?.message?.assetValueIdr);
  const proposedValue = Number.isSafeInteger(lastValue) && lastValue > 0 ? lastValue : assetValue;
  return { ...await savedReviewQuorum(caseId, approval.evidenceHash, proposedValue), assetValue: proposedValue };
}
