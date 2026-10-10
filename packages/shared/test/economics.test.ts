import { describe, expect, it } from "vitest";
import { DEMO_PARAMS, E18, OnboardingInput, accrue, checkWaterfall, financialSummary, holderShare, periodObligation, revaluedRefPrice, sellbackAmount, splitOf, trueUp, valuation, waterfall } from "../src";
import { testOnboarding } from "./fixtures";

const month = { gross: 52_000_000, refunds: 1_000_000, opex: 27_000_000, tax: 1_500_000, operatorFee: 4_000_000, reserve: 2_000_000, platformFee: 1_500_000 };

describe("contoh hitung PRD §4.6", () => {
  it("valuasi: V = min(V_aset, D12/r) = Rp2 miliar, y = 9%, N = 100.000", () => {
    const v = valuation({ assetValue: 2_400_000_000, d12: 180_000_000, requiredYieldBps: 900, stakeBps: 5000, tokenPrice: 10_000, yieldMinBps: 500, yieldMaxBps: 2000 });
    expect(v).toMatchObject({ vIncome: 2_000_000_000, v: 2_000_000_000, basis: "income", yieldBps: 900, inBand: true, stakeValue: 1_000_000_000, supply: 100_000, refPrice: 10_000 });
    // kontrak: refPrice × supply × 10000 == V × X
    expect(v.refPrice * v.supply * 10_000).toBe(v.v * 5000);
  });
  it("valuasi dibulatkan ke bawah supaya pas dengan harga token; y di luar band ditandai", () => {
    const v = valuation({ assetValue: 1_234_567_891, d12: 400_000_000, requiredYieldBps: 900, stakeBps: 3333, tokenPrice: 10_000, yieldMinBps: 500, yieldMaxBps: 2000 });
    expect(v.basis).toBe("asset");
    expect((v.v * 3333) % (10_000 * 10_000)).toBe(0);
    expect(v.inBand).toBe(false); // y ≈ 32%
  });
  it("tanpa D positif tidak bisa divaluasi", () => expect(() => valuation({ assetValue: 1e9, d12: 0, requiredYieldBps: 900, stakeBps: 5000, tokenPrice: 10_000, yieldMinBps: 500, yieldMaxBps: 2000 })).toThrow());
  it("waterfall satu bulan: D 15jt, P_SPV 7,5jt, F_spv 150rb, P_inv 7,35jt, P_owner 11,5jt", () => {
    expect(waterfall(month, 5000, 200)).toEqual({ deductions: 37_000_000, distributable: 15_000_000, pSpv: 7_500_000, fSpv: 150_000, pInv: 7_350_000, pOwner: 11_500_000 });
  });
  it("jatah per token 73,5 (akumulator 1e18); pemegang 10.000 token menerima Rp735.000", () => {
    const { deltaE18, dustE18 } = accrue(7_350_000n, 0n, 100_000n);
    expect(deltaE18).toBe(735n * E18 / 10n);
    expect(dustE18).toBe(0n);
    expect(holderShare(10_000n, deltaE18)).toBe(735_000n);
    expect(periodObligation(10_000n, deltaE18)).toBe(735_000n);
  });
  it("dust dibawa: total yang dibagi tidak pernah melebihi pool", () => {
    let dust = 0n, paid = 0n;
    for (let i = 0; i < 5; i++) { const a = accrue(1_000_000n, dust, 7n); dust = a.dustE18; paid += (7n * a.deltaE18) / E18; }
    expect(paid).toBeLessThanOrEqual(5_000_000n);
    expect(5_000_000n - paid).toBeLessThanOrEqual(5n); // pembulatan per pemegang: paling banyak 1 rupiah per periode di sini
  });
});

describe("pemeriksaan yang juga dilakukan kontrak", () => {
  it("D tidak pernah negatif", () => expect(waterfall({ ...month, opex: 50_000_000, refunds: 0, tax: 0, operatorFee: 0, reserve: 0, platformFee: 0 }, 5000, 200).distributable).toBe(2_000_000));
  it("potongan > gross dan opex > plafon ditolak", () => {
    expect(() => checkWaterfall({ ...month, opex: 50_000_000 }, 8000)).toThrow(/deductions exceed gross/);
    expect(() => checkWaterfall({ ...month, gross: 30_000_000, opex: 25_000_000, refunds: 0, tax: 0, operatorFee: 0, reserve: 0, platformFee: 0 }, 8000)).toThrow(/Operating expenses exceed/);
    expect(() => checkWaterfall(month, 8000)).not.toThrow();
  });
});

describe("split, koreksi, jual balik, revaluasi", () => {
  it("contoh §3.6.2: bulan sepi kelebihan 2,85jt; bulan ramai kurang 5,75jt", () => {
    const sepi = waterfall({ gross: 30_000_000, refunds: 500_000, opex: 22_000_000, tax: 500_000, operatorFee: 4_000_000, reserve: 1_000_000, platformFee: 500_000 }, 5000, 0);
    const ramai = waterfall({ gross: 70_000_000, refunds: 1_000_000, opex: 30_000_000, tax: 2_500_000, operatorFee: 4_000_000, reserve: 2_000_000, platformFee: 2_200_000 }, 5000, 0);
    expect(trueUp(splitOf(30_000_000, 1200).spv, sepi.pSpv)).toBe(2_850_000);
    expect(trueUp(splitOf(70_000_000, 1200).spv, ramai.pSpv)).toBe(-5_750_000);
  });
  it("split: bagian SPV + owner = gross", () => { const s = splitOf(150_001, 1200); expect(s.spv + s.owner).toBe(150_001); });
  it("jual balik p_ref × (1 − d), pecahan rupiah ditolak", () => {
    expect(sellbackAmount(10, 10_000, 0)).toBe(100_000);
    expect(sellbackAmount(10, 10_000, 500)).toBe(95_000);
    expect(() => sellbackAmount(1, 10_001, 3)).toThrow();
  });
  it("revaluasi hanya mengubah harga referensi", () => expect(revaluedRefPrice(2_200_000_000, 5000, 100_000)).toBe(11_000));
});

describe("formulir owner", () => {
  it("fixture valid; ringkasan D12 = 180jt dan digital 95%", () => {
    const v = OnboardingInput.parse(testOnboarding());
    const f = financialSummary(v.financials);
    expect(f.d12).toBe(180_000_000);
    expect(f.digitalShareBps).toBe(9500);
    expect(f.annualized).toBe(false);
  });
  it("6 bulan disetahunkan", () => {
    const v = OnboardingInput.parse(testOnboarding({ financials: testOnboarding().financials.slice(6) }));
    expect(financialSummary(v.financials).d12).toBe(180_000_000);
    expect(financialSummary(v.financials).annualized).toBe(true);
  });
  it("NIB/NPWP wajib, X maksimal 50%, potongan > gross ditolak, bulan harus urut", () => {
    const bad = (o: any) => OnboardingInput.safeParse(testOnboarding(o)).success;
    expect(bad({ company: { ...testOnboarding().company, nib: "" } })).toBe(false);
    expect(bad({ offering: { stakeBps: 6000, useOfFunds: "Renovasi lapangan" } })).toBe(false);
    const f = testOnboarding().financials; f[0]!.opex = 60_000_000;
    expect(bad({ financials: f })).toBe(false);
    expect(bad({ financials: [...testOnboarding().financials].reverse() })).toBe(false);
  });
  it("gateway wajib disetujui", () => expect(OnboardingInput.safeParse(testOnboarding({ integrations: { gatewayOnly: false, bankDataAccess: true } })).success).toBe(false));
});
