import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { reviewApprovalData, reviewQuorum, verifyReviewApproval, type ReviewApproval, type ReviewVote } from "../src";

const signer = privateKeyToAccount(`0x${"01".repeat(32)}`);
const other = privateKeyToAccount(`0x${"02".repeat(32)}`);
const registry = "0x0000000000000000000000000000000000000001";
const approval: ReviewApproval = { caseId: "case-1", reviewerId: "reviewer-1", reviewerWallet: signer.address, venue: "Arena Demo", assetValueIdr: 3_000_000_000n, note: "Evidence reviewed", evidenceHash: `0x${"aa".repeat(32)}`, deadline: 1600n };
const vote = (role: ReviewVote["role"], reviewerId: string, address: string): ReviewVote => ({ role, reviewerId, signer: address, evidenceHash: approval.evidenceHash, assetValueIdr: String(approval.assetValueIdr) });

describe("signed review approval", () => {
  it("accepts the registered signer for the exact approval", async () => {
    const signature = await signer.signTypedData(reviewApprovalData(approval, 11155111, registry));
    await expect(verifyReviewApproval(approval, signature, signer.address, 11155111, registry, 1000)).resolves.toBeUndefined();
    await expect(verifyReviewApproval(approval, signature, other.address, 11155111, registry, 1000)).rejects.toThrow();
  });
  it("rejects altered valuation, note, case, reviewer, evidence, domain, or chain", async () => {
    const signature = await signer.signTypedData(reviewApprovalData(approval, 11155111, registry));
    for (const changed of [{ assetValueIdr: 1n }, { note: "Changed" }, { caseId: "case-2" }, { reviewerId: "someone-else" }, { reviewerWallet: other.address }, { evidenceHash: `0x${"bb".repeat(32)}` as const }]) {
      await expect(verifyReviewApproval({ ...approval, ...changed }, signature, signer.address, 11155111, registry, 1000)).rejects.toThrow();
    }
    await expect(verifyReviewApproval(approval, signature, signer.address, 31337, registry, 1000)).rejects.toThrow();
    await expect(verifyReviewApproval(approval, signature, signer.address, 11155111, other.address, 1000)).rejects.toThrow();
  });
  it("rejects expired statements", async () => {
    const signature = await signer.signTypedData(reviewApprovalData(approval, 11155111, registry));
    await expect(verifyReviewApproval(approval, signature, signer.address, 11155111, registry, 1600)).rejects.toThrow("kedaluwarsa");
  });
});

describe("operator and independent reviewer quorum", () => {
  const op = vote("operator", "op-1", signer.address);
  const reviewer = vote("reviewer", "reviewer-1", other.address);
  it("requires both roles; repeated votes from one role do not suffice", () => {
    expect(reviewQuorum([op, op], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(false);
    expect(reviewQuorum([reviewer], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(false);
    expect(reviewQuorum([op, reviewer], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(true);
  });
  it("requires different people and wallets", () => {
    expect(reviewQuorum([op, { ...reviewer, reviewerId: op.reviewerId }], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(false);
    expect(reviewQuorum([op, { ...reviewer, signer: op.signer }], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(false);
  });
  it("does not combine votes for different evidence or valuations", () => {
    expect(reviewQuorum([op, { ...reviewer, evidenceHash: "stale" }], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(false);
    expect(reviewQuorum([op, { ...reviewer, assetValueIdr: "1" }], approval.evidenceHash, String(approval.assetValueIdr)).ready).toBe(false);
  });
});
