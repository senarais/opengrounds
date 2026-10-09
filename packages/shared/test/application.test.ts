import { describe, expect, it } from "vitest";
import { ApplicationInput, MAX_SHARE_BPS, OWNED_LEASE_MONTHS, buildDisclosure, eligibleOf, insuranceMonthsLeft, monthsSince, slugFor, tokenSymbolFor } from "../src";
import { testApplication } from "./fixtures";

const valid = testApplication();

describe("ApplicationInput", () => {
  it("menerima pengajuan yang valid", () => expect(ApplicationInput.safeParse(valid).success).toBe(true));
  const bad = (patch: (v: any) => void) => { const v = structuredClone(valid); patch(v); return ApplicationInput.safeParse(v); };
  it("menolak minRaise > target", () => expect(bad((v) => (v.offering.minRaise = 200_000_000)).success).toBe(false));
  it("menolak persen di atas batas kontrak", () => {
    const r = bad((v) => (v.offering.shareBps = MAX_SHARE_BPS + 1));
    expect(r.success).toBe(false);
  });
  it("menolak minRaise yang tidak bisa dicapai (suplai dibulatkan ke bawah)", () => {
    // cap = floor(100/30) = 3 token => maksimum terkumpul 90 < minRaise 95
    expect(bad((v) => Object.assign(v.offering, { target: 100, minRaise: 95, unitPrice: 30 })).success).toBe(false);
  });
  it("menolak omzet kurang dari 6 bulan atau nol semua", () => {
    expect(bad((v) => { v.revenue.months = [1, 2, 3]; v.revenue.breakdown = v.revenue.breakdown.slice(0, 3); }).success).toBe(false);
    expect(bad((v) => { v.revenue.breakdown = v.revenue.breakdown.map(() => ({ gross: 0, refund: 0, tax: 0, fee: 0 })); v.revenue.months = [0, 0, 0, 0, 0, 0]; }).success).toBe(false);
  });
  it("menolak tenor di luar 3–36 bulan dan jenis olahraga kosong", () => {
    expect(bad((v) => (v.offering.tenorMonths = 2)).success).toBe(false);
    expect(bad((v) => (v.offering.tenorMonths = 60)).success).toBe(false);
    expect(bad((v) => (v.company.sports = [])).success).toBe(false);
  });
});

describe("validasi data tambahan", () => {
  const bad = (patch: (v: any) => void) => { const v = testApplication(); patch(v); return ApplicationInput.safeParse(v); };
  const msg = (r: any) => JSON.stringify(r.error?.issues.map((i: any) => i.message));
  it("omzet bersih harus = bruto − refund − pajak − fee", () => {
    const r = bad((v) => (v.revenue.months[0] += 1));
    expect(r.success).toBe(false); expect(msg(r)).toContain("bruto");
    expect(eligibleOf({ gross: 100, refund: 10, tax: 9, fee: 1 })).toBe(80);
  });
  it("refund + pajak + fee tidak boleh melebihi bruto", () => {
    expect(bad((v) => { v.revenue.breakdown[0] = { gross: 100, refund: 90, tax: 20, fee: 0 }; v.revenue.months[0] = -10; }).success).toBe(false);
  });
  it("porsi pembayaran harus 100%", () => expect(bad((v) => (v.revenue.paymentMix.cashPct = 30)).success).toBe(false));
  it("omzet yang dilaporkan tidak boleh lebih panjang dari usia usaha", () => {
    const now = new Date();
    const r = bad((v) => (v.business.operatingSince = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`));
    expect(r.success).toBe(false); expect(msg(r)).toContain("baru beroperasi");
    expect(monthsSince("2026-01", new Date("2026-10-08T00:00:00Z"))).toBe(9);
  });
  it("total beban atas omzet (bagian ini + sudah dijanjikan) ≤ batas kontrak", () => {
    const r = bad((v) => { v.dossier.otherPledgedBps = 4500; v.dossier.otherPledgeNote = "bagi hasil investor lain 45%"; });
    expect(r.success).toBe(false); expect(msg(r)).toContain("Total beban");
    expect(bad((v) => (v.dossier.otherPledgedBps = 500)).success).toBe(false); // wajib dijelaskan
  });
  it("identitas: NIB 13 digit, NPWP 15/16 digit, HP Indonesia, rekening angka", () => {
    expect(bad((v) => (v.business.nib = "123")).success).toBe(false);
    expect(bad((v) => (v.business.npwp = "12.345.678.9-012.345")).success).toBe(false);
    expect(bad((v) => (v.business.contactPhone = "12345")).success).toBe(false);
    expect(bad((v) => (v.payout.accountNumber = "12-34")).success).toBe(false);
  });
  it("lokasi: kode pos 5 digit; lapangan minimal satu dan harus cocok jumlahnya", () => {
    expect(bad((v) => (v.company.postalCode = "401")).success).toBe(false);
    expect(bad((v) => { v.company.facilities = []; }).success).toBe(false);
    expect(bad((v) => (v.company.courts = 5)).success).toBe(false);
    expect(bad((v) => (v.company.facilities[0].lengthM = 1)).success).toBe(false);
  });
  it("persetujuan pemrosesan data wajib", () => {
    expect(bad((v) => (v.consent.dataProcessing = false)).success).toBe(false);
    expect(bad((v) => (v.consent.truthful = false)).success).toBe(false);
  });
});

describe("penamaan", () => {
  it("simbol token ≤ 5 karakter dan unik", () => {
    expect(tokenSymbolFor("Ayo Sport")).toBe("AYOS");
    expect(tokenSymbolFor("Ayo Sport", ["AYOS"])).toBe("AYOS2");
    expect(tokenSymbolFor("Ayo Sport", ["AYOS", "AYOS2"])).toBe("AYOS3");
    for (const n of ["Ab", "123", "Padel Arena Kemang Raya"]) expect(tokenSymbolFor(n).length).toBeLessThanOrEqual(5);
  });
  it("slug aman untuk URL", () => expect(slugFor("Ayo Sport & Café!", "a1b2")).toMatch(/^[a-z0-9-]+-a1b2$/));
});

describe("batas bagian omzet", () => {
  it("bagian omzet sampai 50% diterima, di atasnya ditolak", () => {
    const v: any = testApplication(); v.offering.shareBps = 5000;
    expect(ApplicationInput.safeParse(v).success).toBe(true);
    v.offering.shareBps = 5001;
    expect(ApplicationInput.safeParse(v).success).toBe(false);
    expect(MAX_SHARE_BPS).toBe(5000);
  });
});

describe("kepemilikan lahan", () => {
  const bad = (patch: (v: any) => void) => { const v: any = testApplication(); patch(v); return ApplicationInput.safeParse(v); };
  it("tanah/bangunan disewa wajib punya detail sewa; milik sendiri tidak boleh punya", () => {
    expect(bad((v) => (v.lease = null)).success).toBe(false);
    expect(bad((v) => { v.property = { land: "milik", building: "milik", ownedAssetPledged: false }; }).success).toBe(false); // lease masih terisi
    expect(bad((v) => { v.property = { land: "milik", building: "milik", ownedAssetPledged: false }; v.lease = null; v.dossier.leaseMonthsRemaining = OWNED_LEASE_MONTHS; }).success).toBe(true);
  });
  it("tanah milik tetapi bangunan disewa tetap butuh detail sewa", () => {
    expect(bad((v) => { v.property = { land: "milik", building: "sewa", ownedAssetPledged: false }; }).success).toBe(true);
    expect(bad((v) => { v.property = { land: "milik", building: "sewa", ownedAssetPledged: false }; v.lease = null; }).success).toBe(false);
  });
  it("pack publik tidak memuat sisa sewa bila milik sendiri", () => {
    const v: any = testApplication(); v.property = { land: "milik", building: "tidak_ada", ownedAssetPledged: true, ownedAssetPledgedNote: "Bank X, kredit modal kerja" }; v.lease = null; v.dossier.leaseMonthsRemaining = OWNED_LEASE_MONTHS;
    const d = buildDisclosure(ApplicationInput.parse(v), []);
    expect(d.public.risk.leaseMonthsRemaining).toBeNull();
    expect(d.public.risk.ownedAssetPledged).toBe(true);
  });
});

describe("asuransi", () => {
  const bad = (patch: (v: any) => void) => { const v: any = testApplication(); patch(v); return ApplicationInput.safeParse(v); };
  it("diasuransikan wajib punya rincian; tidak diasuransikan tidak boleh punya", () => {
    expect(bad((v) => (v.assets.insurance = null)).success).toBe(false);
    expect(bad((v) => (v.assets.insured = false)).success).toBe(false);
    expect(bad((v) => { v.assets.insured = false; v.assets.insurance = null; }).success).toBe(true);
  });
  it("polis kedaluwarsa, tanpa jenis pertanggungan, atau nilai nol ditolak", () => {
    expect(bad((v) => (v.assets.insurance.validUntil = "2020-01")).success).toBe(false);
    expect(bad((v) => (v.assets.insurance.coverage = [])).success).toBe(false);
    expect(bad((v) => (v.assets.insurance.sumInsured = 0)).success).toBe(false);
  });
  it("sisa bulan polis dihitung", () => expect(insuranceMonthsLeft("2027-04", new Date("2026-10-08T00:00:00Z"))).toBe(6));
});

describe("pertanyaan lanjutan wajib", () => {
  const bad = (patch: (v: any) => void) => { const v: any = testApplication(); patch(v); return ApplicationInput.safeParse(v); };
  it("sengketa dan aset dijaminkan wajib dijelaskan", () => {
    expect(bad((v) => (v.dossier.activeLandDispute = true)).success).toBe(false);
    expect(bad((v) => { v.dossier.activeLandDispute = true; v.dossier.disputeNote = "gugatan batas tanah, tahap mediasi"; }).success).toBe(true);
    expect(bad((v) => (v.property.ownedAssetPledged = true)).success).toBe(false);
    expect(bad((v) => { v.property.ownedAssetPledged = true; v.property.ownedAssetPledgedNote = "Bank X, kredit modal kerja"; }).success).toBe(true);
  });
});
