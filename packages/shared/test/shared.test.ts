import { describe, expect, it } from "vitest";
import {
  ZERO_HASH,
  eligibleRevenue,
  ledgerEntryHash,
  merkleProof,
  merkleRoot,
  verifyHashChain,
  verifyMerkleProof,
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
