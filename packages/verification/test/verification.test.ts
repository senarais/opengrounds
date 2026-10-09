import { describe, expect, it } from "vitest";
import { ZERO_HASH, ledgerEntryHash, OnboardingInput, type LedgerEntry } from "@venue-rwa/shared";
import type { Hex } from "viem";
import { kybGate, reconcile, redact } from "../src";
import { testOnboarding } from "../../shared/test/fixtures";

function mkEntries(rows: Array<{ id: string; booking: string; amount: number; date: string }>): LedgerEntry[] {
  let prev: Hex = ZERO_HASH;
  return rows.map((r) => {
    const base = { id: r.id, companyId: "v1", type: "sale" as const, amount: r.amount, bookingId: r.booking, createdAt: `${r.date}T10:00:00.000Z` };
    const hash = ledgerEntryHash(prev, base);
    const e = { ...base, prevHash: prev, hash };
    prev = hash;
    return e;
  });
}

describe("reconcile", () => {
  const entries = mkEntries([
    { id: "e1", booking: "b1", amount: 200_000, date: "2026-10-01" },
    { id: "e2", booking: "b2", amount: 200_000, date: "2026-10-01" },
    { id: "e3", booking: "f1", amount: 300_000, date: "2026-10-02" },
    { id: "e4", booking: "f2", amount: 300_000, date: "2026-10-02" },
    { id: "e5", booking: "f3", amount: 300_000, date: "2026-10-02" },
    { id: "e6", booking: "c1", amount: 150_000, date: "2026-10-02" },
  ]);
  const settled = [
    { bookingId: "b1", gross: 200_000, fee: 1400, settledAt: "2026-10-02T00:00:00Z" },
    { bookingId: "b2", gross: 200_000, fee: 1400, settledAt: "2026-10-02T00:00:00Z" },
  ];
  const refs = new Map([["f1", "0xa"], ["f2", "0xa"], ["f3", "0xa"], ["c1", "0xb"]]);

  it("hari bersih tidak menghasilkan exception", () => {
    const r = reconcile({ companyId: "v1", entries: entries.slice(0, 2), settled });
    expect(r.clean).toBe(true);
    expect(r.unmatchedTotal).toBe(0);
  });

  it("booking tanpa settlement => fiktif (pola berulang) dan tunai (sekali)", () => {
    const r = reconcile({ companyId: "v1", entries, settled, customerRefs: refs });
    expect(r.clean).toBe(false);
    const kinds = r.exceptions.map((e) => `${e.date}:${e.kind}:${e.amount}`);
    expect(kinds).toContain("2026-10-02:fictitious_booking:900000");
    expect(kinds).toContain("2026-10-02:cash_outside_system:150000");
    expect(r.unmatchedTotal).toBe(1_050_000);
  });

  it("rantai hash putus terdeteksi", () => {
    const tampered = entries.map((e) => ({ ...e }));
    tampered[1]!.amount = 1;
    const r = reconcile({ companyId: "v1", entries: tampered, settled });
    expect(r.chainBrokenAt).toBe(1);
    expect(r.exceptions.some((e) => e.kind === "hash_chain_broken")).toBe(true);
  });
});

describe("tunai / QRIS sendiri (di luar jalur)", () => {
  const entries = mkEntries([
    { id: "e1", booking: "g1", amount: 200_000, date: "2026-10-01" },
    { id: "e2", booking: "c1", amount: 100_000, date: "2026-10-01" },
    { id: "e3", booking: "x1", amount: 100_000, date: "2026-10-01" },
  ]);
  const settled = [{ bookingId: "g1", gross: 200_000, fee: 1400, settledAt: "2026-10-02T00:00:00Z" }];
  it("tunai tercatat bukan exception; tanpa settlement tetap exception; cakupan dihitung", () => {
    const r = reconcile({ companyId: "v1", entries, settled, offRail: new Set(["c1"]) } as any);
    expect(r.offRailTotal).toBe(100_000);
    expect(r.unmatchedTotal).toBe(100_000);
    expect(r.exceptions.length).toBe(1);
    expect(r.coverage).toBeCloseTo(200_000 / 400_000);
  });
  it("tanpa penjualan, cakupan = 1", () => expect(reconcile({ companyId: "v1", entries: [], settled: [] } as any).coverage).toBe(1));
});

describe("redact", () => {
  it("menghapus NIK, telepon, rekening, email", () => {
    const t = "NIK 3174011234567890, HP 081234567890, rek 1234567890123, a.b@mail.com";
    const r = redact(t);
    expect(r).toBe("NIK [NIK], HP [TELEPON], rek [REKENING], [EMAIL]");
  });
});

const ALL_DOCS = ["deed", "nib", "npwp", "land_certificate", "bank_statement"];
const input = (over: Record<string, any> = {}) => OnboardingInput.parse(testOnboarding(over));
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("gerbang KYB (deterministik)", () => {
  it("venue contoh PRD: tidak terhalang, valuasi Rp2 miliar, N = 100.000", () => {
    const r = kybGate(input(), ALL_DOCS);
    expect(r.blocked).toBe(false);
    expect(r.valuation).toMatchObject({ v: 2_000_000_000, supply: 100_000, refPrice: 10_000, yieldBps: 900, inBand: true });
    expect(r.findings.every((f) => f.severity !== "critical")).toBe(true);
  });
  it("dokumen wajib hilang → critical", () => {
    const r = kybGate(input(), ["deed", "nib"]);
    expect(r.blocked).toBe(true);
    expect(r.findings.filter((f) => f.code === "MISSING_DOCUMENT")).toHaveLength(3);
  });
  it("tanah bukan milik sendiri / sertifikat atas nama orang lain / dijaminkan tanpa izin → critical", () => {
    const land = testOnboarding().land;
    expect(codes(kybGate(input({ land: { ...land, owned: false } }), ALL_DOCS))).toContain("LAND_NOT_OWNED");
    expect(codes(kybGate(input({ land: { ...land, holderName: "Tuan Lain" } }), ALL_DOCS))).toContain("LAND_HOLDER_NOT_OWN");
    expect(codes(kybGate(input({ land: { ...land, holderName: "Budi Santoso" } }), ALL_DOCS))).not.toContain("LAND_HOLDER_NOT_OWN");
    expect(kybGate(input({ land: { ...land, encumbered: true } }), ALL_DOCS).blocked).toBe(true);
    expect(kybGate(input({ land: { ...land, encumbered: true, encumbranceConsent: true } }), ALL_DOCS).blocked).toBe(false);
  });
  it("porsi digital < 90% → high; opex di atas plafon → medium; y di luar band → medium", () => {
    const fin = testOnboarding().financials.map((m: any) => ({ ...m, digitalGross: 40_000_000 }));
    expect(kybGate(input({ financials: fin }), ALL_DOCS).findings.find((f) => f.code === "DIGITAL_BELOW_THRESHOLD")!.severity).toBe("high");
    const hiOpex = testOnboarding().financials.map((m: any, i: number) => (i === 0 ? { ...m, gross: 30_000_000, opex: 25_000_000, refunds: 0, tax: 0, operatorFee: 0, reserve: 0, platformFee: 0, digitalGross: 30_000_000 } : m));
    expect(codes(kybGate(input({ financials: hiOpex }), ALL_DOCS))).toContain("OPEX_ABOVE_CAP");
    expect(codes(kybGate(input(), ALL_DOCS, { assetValue: 500_000_000 }))).toContain("YIELD_OUT_OF_BAND");
  });
  it("D12 nol → critical, tanpa valuasi", () => {
    const zero = testOnboarding().financials.map((m: any) => ({ ...m, opex: 42_000_000 }));
    const r = kybGate(input({ financials: zero }), ALL_DOCS);
    expect(codes(r)).toContain("NO_DISTRIBUTABLE");
    expect(r.valuation).toBeNull();
  });
  it("setiap temuan wajib ditinjau manusia: tidak ada keputusan otomatis selain penanda", () => {
    const r = kybGate(input(), ALL_DOCS);
    expect(Object.keys(r)).not.toContain("approved");
  });
  it("deterministik", () => expect(kybGate(input(), ALL_DOCS)).toEqual(kybGate(input(), ALL_DOCS)));
});


describe("per-venue initial token pricing", () => {
  it.each([5000, 10000, 25000])("binds supply and reference price to Rp%s", (price) => {
    const example = input();
    example.offering.tokenPrice = price;
    const result = kybGate(example, ["deed", "nib", "npwp", "land_certificate", "bank_statement"]);
    expect(result.valuation?.refPrice).toBe(price);
    expect(result.valuation!.supply * price * 10000).toBe(result.valuation!.v * example.offering.stakeBps);
  });
  it("rejects a nonpositive or fractional nominal price", () => {
    for (const price of [0, -1, 5000.5]) {
      const example = input();
      example.offering.tokenPrice = price;
      expect(OnboardingInput.safeParse(example).success).toBe(false);
    }
  });
});
