import { describe, expect, it } from "vitest";
import {
  ZERO_HASH,
  applyRedeem,
  eligibleRevenue,
  ledgerEntryHash,
  maxAllowedPrice,
  merkleProof,
  merkleRoot,
  priceBand,
  redeemPayout,
  referencePrice,
  verifyHashChain,
  verifyMerkleProof,
  OfferingTerms,
} from "../src";
import type { Hex } from "viem";

function chain(n: number) {
  const out: any[] = [];
  let prev: Hex = ZERO_HASH;
  for (let i = 0; i < n; i++) {
    const e = { id: `e${i}`, companyId: "v1", type: i % 3 === 2 ? "refund" : "sale", amount: i % 3 === 2 ? -50000 : 100000, bookingId: `b${i}`, createdAt: `2026-01-01T0${i}:00:00.000Z` };
    const hash = ledgerEntryHash(prev, e);
    out.push({ ...e, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

describe("eligible revenue", () => {
  it("omzet settle dikurangi refund, chargeback, pajak, fee", () => {
    expect(eligibleRevenue({ settledGross: 1_000_000, refunds: 100_000, chargebacks: 0, taxes: 110_000, gatewayFees: 7_000 })).toBe(783_000);
  });
});

describe("hash chain", () => {
  it("utuh", () => expect(verifyHashChain(chain(5))).toBe(-1));
  it("deteksi entri lama yang diubah", () => {
    const c = chain(5);
    c[2].amount = 999;
    expect(verifyHashChain(c)).toBe(2);
  });
});

describe("merkle", () => {
  const leaves = chain(7).map((e) => e.hash as Hex);
  it("proof valid untuk semua leaf", () => {
    const root = merkleRoot(leaves);
    leaves.forEach((l, i) => expect(verifyMerkleProof(merkleProof(leaves, i), root, l)).toBe(true));
  });
  it("proof gagal untuk leaf lain", () => {
    const root = merkleRoot(leaves);
    expect(verifyMerkleProof(merkleProof(leaves, 0), root, leaves[1]!)).toBe(false);
  });
  it("kosong = zero hash", () => expect(merkleRoot([])).toBe(ZERO_HASH));
});

describe("redeem math", () => {
  it("membulatkan ke bawah dan menjaga R <= P", () => {
    const p = { P: 1_000n, R: 0n, S: 3n };
    expect(redeemPayout(p, 1n)).toBe(333n);
    const { next } = applyRedeem(p, 1n);
    expect(next).toEqual({ P: 1000n, R: 333n, S: 2n });
    expect(next.R <= next.P).toBe(true);
  });
  it("tebus semua = ambil seluruh sisa kantong", () => {
    expect(redeemPayout({ P: 1000n, R: 0n, S: 3n }, 3n)).toBe(1000n);
  });
});

describe("harga referensi (contoh PRD)", () => {
  it("omzet 100jt, haircut 10%, 10% x 24 bln, 10.000 token, margin 30%", () => {
    const ref = referencePrice({ monthlyMedianRevenue12m: 100_000_000, haircut: 0.1, shareBps: 1000, tenorMonths: 24, tokenSupply: 10_000, minInvestorMargin: 0.3 });
    expect(ref).toBe(16_615); // ≈ Rp16.600
  });
  it("pita harga 10/25", () => {
    expect(priceBand(10_000, 10_000)).toBe("ok");
    expect(priceBand(11_000, 10_000)).toBe("ok");
    expect(priceBand(11_500, 10_000)).toBe("needs_reviewer");
    expect(priceBand(12_600, 10_000)).toBe("rejected");
    expect(priceBand(9_000, 10_000)).toBe("ok_below_reference_warning");
    expect(maxAllowedPrice(10_000)).toBe(12_500);
  });
});

describe("offering terms", () => {
  it("minRaise tidak boleh > target", () => {
    expect(OfferingTerms.safeParse({ target: 100, minRaise: 200, unitPrice: 10, shareBps: 1000, tenorDays: 365 }).success).toBe(false);
  });
});
