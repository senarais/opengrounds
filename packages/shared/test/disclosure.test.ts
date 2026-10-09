import { describe, expect, it } from "vitest";
import { OnboardingInput, buildDisclosure, canonicalJson, disclosureHash, valuation } from "../src";
import { testOnboarding } from "./fixtures";

const input: OnboardingInput = OnboardingInput.parse(testOnboarding());
const val = { ...valuation({ assetValue: 2_400_000_000, d12: 180_000_000, requiredYieldBps: 900, stakeBps: 5000, tokenPrice: 10_000, yieldMinBps: 500, yieldMaxBps: 2000 }), assetValue: 2_400_000_000, d12: 180_000_000, requiredYieldBps: 900 };
const docs = [{ kind: "land_certificate", sha256: "aa" }, { kind: "bank_statement", sha256: "bb" }];

describe("disclosure pack", () => {
  it("hash deterministik dan tidak bergantung urutan dokumen/olahraga", () => {
    const a = disclosureHash(buildDisclosure({ ...input, venue: { ...input.venue, sports: ["padel", "futsal"] } }, val, docs));
    const b = disclosureHash(buildDisclosure({ ...input, venue: { ...input.venue, sports: ["futsal", "padel"] } }, val, [...docs].reverse()));
    expect(a).toBe(b);
  });
  it("hash berubah bila data publik, alamat persis, atau dokumen berubah", () => {
    const base = disclosureHash(buildDisclosure(input, val, docs));
    expect(disclosureHash(buildDisclosure(input, { ...val, refPrice: 11_000 }, docs))).not.toBe(base);
    expect(disclosureHash(buildDisclosure({ ...input, land: { ...input.land, encumbered: true } }, val, docs))).not.toBe(base);
    expect(disclosureHash(buildDisclosure({ ...input, venue: { ...input.venue, address: "Jl. Lain No. 1, Bandung" } }, val, docs))).not.toBe(base);
    expect(disclosureHash(buildDisclosure(input, val, [{ kind: "land_certificate", sha256: "cc" }, docs[1]!]))).not.toBe(base);
  });
  it("pack publik memuat rumus valuasi, tetapi tidak memuat NIB, NPWP, sertifikat, identitas, rekening, alamat persis", () => {
    const d = buildDisclosure(input, val, docs);
    const json = JSON.stringify(d.public).toLowerCase();
    for (const banned of ["1234567890123", "123456789012345", "10.20.30.40", "3273010101900001", "budi", "1234567890", "jl. contoh", "pt lapangan"]) expect(json).not.toContain(banned);
    expect(d.public.valuation).toMatchObject({ d12: 180_000_000, v: 2_000_000_000, yieldPct: 9, supply: 100_000, refPrice: 10_000 });
    expect(d.public.financials.distributable.every((x) => x === 15_000_000)).toBe(true);
    expect(JSON.stringify(d.sensitive)).toContain("Jl. Contoh");
  });
  it("canonicalJson mengurutkan kunci", () => expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}'));
});
