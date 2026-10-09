import { describe, expect, it } from "vitest";
import { ApplicationInput, buildDisclosure, canonicalJson, disclosureHash } from "../src";
import { testApplication } from "./fixtures";

const input: ApplicationInput = ApplicationInput.parse(testApplication({ dossier: { ...testApplication().dossier, monthlyBankInstallment: 6_000_000 } }));
const docs = [{ kind: "lease", sha256: "aa" }, { kind: "bank_statement", sha256: "bb" }];

describe("disclosure pack", () => {
  it("hash deterministik dan tidak bergantung urutan dokumen/olahraga", () => {
    const two = { ...input, company: { ...input.company, sports: ["padel", "futsal"] } };
    const a = disclosureHash(buildDisclosure(two, docs));
    const b = disclosureHash(buildDisclosure({ ...input, company: { ...input.company, sports: ["futsal", "padel"] } }, [...docs].reverse()));
    expect(a).toBe(b);
  });
  it("hash berubah bila data publik berubah (harga, tarif, kinerja, risiko)", () => {
    const base = disclosureHash(buildDisclosure(input, docs));
    expect(disclosureHash(buildDisclosure({ ...input, offering: { ...input.offering, unitPrice: 16_000 } }, docs))).not.toBe(base);
    expect(disclosureHash(buildDisclosure({ ...input, company: { ...input.company, tariffNote: "naik" } }, docs))).not.toBe(base);
    expect(disclosureHash(buildDisclosure({ ...input, dossier: { ...input.dossier, activeLandDispute: true } }, docs))).not.toBe(base);
  });
  it("hash berubah bila alamat persis atau dokumen berubah (terikat walau tidak terbuka)", () => {
    const base = disclosureHash(buildDisclosure(input, docs));
    expect(disclosureHash(buildDisclosure({ ...input, company: { ...input.company, address: "Jl. Lain No. 1" } }, docs))).not.toBe(base);
    expect(disclosureHash(buildDisclosure(input, [{ kind: "lease", sha256: "cc" }, docs[1]!]))).not.toBe(base);
  });
  it("pack publik tidak memuat alamat persis, KTP, rekening, atau data pelanggan", () => {
    const d = buildDisclosure(input, docs);
    const json = JSON.stringify(d.public);
    expect(json).not.toContain("Jl. Contoh");
    for (const banned of ["ktp", "nik", "rekening", "customer", "pelanggan", "1234567890", "budi", "accountnumber", "kelurahan", "40135", "contactphone", "contactemail"]) expect(json.toLowerCase()).not.toContain(banned.toLowerCase());
    expect(json).toContain("Coblong"); // kecamatan publik
    expect(JSON.stringify(d.sensitive)).toContain("40135");
  });
  it("rasio cicilan terhadap omzet dihitung dari rata-rata omzet", () => {
    expect(buildDisclosure(input, docs).public.risk.installmentToRevenuePct).toBeCloseTo((6_000_000 / 114_166_666.67) * 100, 0);
  });
  it("pernyataan pihak terkait wajib dijelaskan", () => {
    expect(ApplicationInput.safeParse({ ...input, dossier: { ...input.dossier, relatedParty: true, relatedPartyNote: "" } }).success).toBe(false);
  });
  it("canonicalJson mengurutkan kunci", () => expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}'));
});
