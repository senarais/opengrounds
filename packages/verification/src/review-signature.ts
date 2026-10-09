import { verifyTypedData, type Address, type Hex } from "viem";

/** Off-chain KYB approval. This domain cannot authorize acquisition or token allocation. */
export const REVIEW_SIGNATURE_TTL = 600;
export const reviewApprovalTypes = {
  ReviewApproval: [
    { name: "caseId", type: "string" },
    { name: "reviewerId", type: "string" },
    { name: "reviewerWallet", type: "address" },
    { name: "venue", type: "string" },
    { name: "decision", type: "string" },
    { name: "assetValueIdr", type: "uint256" },
    { name: "note", type: "string" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export interface ReviewApproval {
  caseId: string; reviewerId: string; reviewerWallet: Address; venue: string; assetValueIdr: bigint;
  note: string; evidenceHash: Hex; deadline: bigint;
}
export function reviewApprovalData(approval: ReviewApproval, chainId: number, registry: Address) {
  return {
    domain: { name: "OpenGroundsReview", version: "1", chainId, verifyingContract: registry },
    types: reviewApprovalTypes,
    primaryType: "ReviewApproval" as const,
    message: { ...approval, decision: "APPROVED" },
  };
}

export async function verifyReviewApproval(approval: ReviewApproval, signature: Hex, signer: Address, chainId: number, registry: Address, now = Math.floor(Date.now() / 1000)) {
  if (approval.deadline <= BigInt(now) || approval.deadline > BigInt(now + REVIEW_SIGNATURE_TTL)) throw new Error("Tanda tangan review kedaluwarsa. Klik Setujui & tanda tangani lagi.");
  if (approval.assetValueIdr <= 0n) throw new Error("Nilai aset final harus positif");
  if (approval.reviewerWallet.toLowerCase() !== signer.toLowerCase()) throw new Error("Wallet penanda tangan tidak cocok dengan wallet dalam pesan review");
  if (!await verifyTypedData({ ...reviewApprovalData(approval, chainId, registry), address: signer, signature })) throw new Error("Tanda tangan tidak cocok dengan wallet reviewer atau data pengajuan sudah berubah. Tinjau ulang lalu tanda tangani lagi.");
}

export interface ReviewVote {
  role: "operator" | "reviewer"; reviewerId: string; signer: string;
  evidenceHash: string; assetValueIdr: string;
}
/** Only distinct people and wallets approving the same evidence and valuation can form a quorum. */
export function reviewQuorum(votes: ReviewVote[], evidenceHash: string, assetValueIdr: string) {
  const matching = votes.filter((v) => v.evidenceHash === evidenceHash && v.assetValueIdr === assetValueIdr);
  const operator = matching.find((v) => v.role === "operator");
  const reviewer = matching.find((v) => v.role === "reviewer");
  const ready = !!operator && !!reviewer && operator.reviewerId !== reviewer.reviewerId && operator.signer.toLowerCase() !== reviewer.signer.toLowerCase();
  return { operator: operator ?? null, reviewer: reviewer ?? null, ready };
}
