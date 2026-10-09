import { describe, expect, it } from "vitest";
import { ZERO_HASH, ledgerEntryHash, type LedgerEntry, type OwnerDossier } from "@venue-rwa/shared";
import type { Hex } from "viem";
import { evaluatePolicy, reconcile, redact, repriceVerdict, sourceTier } from "../src";

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

describe("policy engine", () => {
  const src = (n: number) => ({ value: n, source: { documentId: "doc1", page: 1, quote: "..." } });
  const dossier: OwnerDossier = {
    leaseMonthsRemaining: src(36),
    monthlyBankInstallment: src(12_000_000),
    bankCovenantForbidsRevenueSale: false,
    bankConsentLetter: false,
    activeLandDispute: false,
    gatewayMonthsOfHistory: 6,
  };
  const base = {
    dossier,
    tenorMonths: 12,
    monthlyEligible: [200, 210, 190, 205, 215, 200].map((x) => x * 1_000_000),
    occupancy: 0.65,
    openExceptions: 0,
    proposed: { target: 150_000_000, unitPrice: 15_000, shareBps: 1000 },
  };

  it("lolos bila semua gerbang lolos dan skor cukup", () => {
    const r = evaluatePolicy(base);
    expect(r.gates.every((g) => g.pass)).toBe(true);
    expect(r.recommendation).toBe("pass");
    expect(r.score).toBeGreaterThanOrEqual(6000);
  });

  it("exception terbuka menggagalkan gerbang dan menurunkan skor", () => {
    const r = evaluatePolicy({ ...base, openExceptions: 3 });
    expect(r.gates.find((g) => g.id === "recon")!.pass).toBe(false);
    expect(r.recommendation).toBe("fail");
    expect(r.score).toBeLessThan(evaluatePolicy(base).score);
  });

  it("sewa lebih pendek dari tenor => gagal", () => {
    const r = evaluatePolicy({ ...base, dossier: { ...dossier, leaseMonthsRemaining: src(6) } });
    expect(r.recommendation).toBe("fail");
  });

  it("covenant bank melarang tanpa surat persetujuan => gagal; dengan surat => lolos", () => {
    const bad = evaluatePolicy({ ...base, dossier: { ...dossier, bankCovenantForbidsRevenueSale: true } });
    const ok = evaluatePolicy({ ...base, dossier: { ...dossier, bankCovenantForbidsRevenueSale: true, bankConsentLetter: true } });
    expect(bad.gates.find((g) => g.id === "covenant")!.pass).toBe(false);
    expect(ok.gates.find((g) => g.id === "covenant")!.pass).toBe(true);
  });

  it("data dilaporkan owner: haircut lebih besar, ada peringatan, harga referensi lebih rendah", () => {
    const pos = evaluatePolicy(base);
    const rep = evaluatePolicy({ ...base, dataSource: "self_reported" });
    expect(rep.price.haircut).toBe(0.35);
    expect(rep.price.reference).toBeLessThan(pos.price.reference);
    expect(rep.warnings.some((w) => w.includes("dilaporkan owner"))).toBe(true);
    expect(pos.warnings.some((w) => w.includes("dilaporkan owner"))).toBe(false);
    expect(rep.dataSource).toBe("self_reported");
  });

  it("konsistensi dokumen: gagal → gerbang gagal; na/warn → hanya peringatan; belum ada → peringatan", () => {
    const fail = evaluatePolicy({ ...base, docChecks: [{ id: "lease", label: "Sisa sewa", status: "fail", detail: "x", docs: ["lease"] }] });
    expect(fail.gates.find((g) => g.id === "docs")!.pass).toBe(false);
    expect(fail.recommendation).toBe("fail");
    const na = evaluatePolicy({ ...base, docChecks: [{ id: "bank", label: "Rekening", status: "na", detail: "x", docs: [] }] });
    expect(na.gates.find((g) => g.id === "docs")!.pass).toBe(true);
    expect(na.warnings.some((w) => w.includes("tidak bisa dicocokkan"))).toBe(true);
    const none = evaluatePolicy(base);
    expect(none.gates.some((g) => g.id === "docs")).toBe(false);
    expect(none.warnings.some((w) => w.includes("Analisis dokumen"))).toBe(true);
  });

  it("cakupan di bawah ambang → gerbang gagal; di atas → lolos; tanpa nilai → tidak ada gerbang", () => {
    expect(evaluatePolicy({ ...base, coverage: 0.6 }).gates.find((g) => g.id === "coverage")!.pass).toBe(false);
    expect(evaluatePolicy({ ...base, coverage: 0.6 }).recommendation).toBe("fail");
    expect(evaluatePolicy({ ...base, coverage: 0.95 }).gates.find((g) => g.id === "coverage")!.pass).toBe(true);
    expect(evaluatePolicy(base).gates.some((g) => g.id === "coverage")).toBe(false);
  });

  it("deterministik: input sama => hasil sama", () => {
    expect(evaluatePolicy(base)).toEqual(evaluatePolicy(base));
  });
});

describe("redact", () => {
  it("menghapus NIK, telepon, rekening, email", () => {
    const t = "NIK 3174011234567890, HP 081234567890, rek 1234567890123, a.b@mail.com";
    const r = redact(t);
    expect(r).toBe("NIK [NIK], HP [TELEPON], rek [REKENING], [EMAIL]");
  });
});

describe("peringatan dari data owner", () => {
  const base: any = {
    dossier: { leaseMonthsRemaining: 36, monthlyBankInstallment: 0, bankCovenantForbidsRevenueSale: false, bankConsentLetter: false, activeLandDispute: false, gatewayMonthsOfHistory: 12 },
    tenorMonths: 12, monthlyEligible: Array(12).fill(100_000_000), occupancy: 0.6, openExceptions: 0, proposed: { target: 150_000_000, unitPrice: 15_000, shareBps: 1000 }, dataSource: "self_reported",
  };
  it("porsi gateway rendah dan pemilik lahan belum setuju memunculkan peringatan, bukan kegagalan otomatis", () => {
    const w = evaluatePolicy({ ...base, reportedGatewayPct: 40, landlordConsentsToSale: false }).warnings.join(" | ");
    expect(w).toContain("40% pembayaran lewat gateway");
    expect(w).toContain("Pemilik lahan belum menyetujui");
    const ok = evaluatePolicy({ ...base, reportedGatewayPct: 90, landlordConsentsToSale: true }).warnings.join(" | ");
    expect(ok).not.toContain("lewat gateway"); expect(ok).not.toContain("Pemilik lahan");
  });
});

describe("peringatan asuransi", () => {
  const base: any = {
    dossier: { leaseMonthsRemaining: 36, monthlyBankInstallment: 0, bankCovenantForbidsRevenueSale: false, bankConsentLetter: false, activeLandDispute: false, gatewayMonthsOfHistory: 12 },
    tenorMonths: 12, monthlyEligible: Array(12).fill(100_000_000), occupancy: 0.6, openExceptions: 0, proposed: { target: 150_000_000, unitPrice: 15_000, shareBps: 1000 }, dataSource: "self_reported",
  };
  const w = (insurance: any) => evaluatePolicy({ ...base, insurance }).warnings.join(" | ");
  it("tanpa asuransi, polis lebih pendek dari tenor, atau tanpa gangguan usaha → peringatan", () => {
    expect(w(null)).toContain("tidak diasuransikan");
    expect(w({ monthsLeft: 6, coverage: ["kebakaran", "gangguan_usaha"] })).toContain("lebih pendek dari tenor");
    expect(w({ monthsLeft: 24, coverage: ["kebakaran"] })).toContain("gangguan usaha");
  });
  it("polis lengkap dan cukup panjang → tanpa peringatan asuransi; tidak diisi (undefined) → diam", () => {
    const ok = w({ monthsLeft: 24, coverage: ["kebakaran", "gangguan_usaha"] });
    expect(ok).not.toContain("asuransi"); expect(ok).not.toContain("gangguan usaha");
    expect(w(undefined)).not.toContain("asuransi");
  });
});

describe("tingkat sumber data", () => {
  it("connector bila > 50% transaksi eksternal; haircut connector minimal 20%", () => {
    expect(sourceTier({ pos: 10, external: 0 })).toBe("pos");
    expect(sourceTier({ pos: 5, external: 5 })).toBe("pos");
    expect(sourceTier({ pos: 4, external: 6 })).toBe("connector");
    expect(sourceTier({ pos: 0, external: 0 })).toBe("pos");
  });
});

describe("aturan perubahan harga", () => {
  const base = { oldPrice: 10_000, oldReference: 10_000, band: "ok" };
  it("turun selalu boleh; naik hanya bila referensi tidak turun; > +25% ditolak", () => {
    expect(repriceVerdict({ ...base, newPrice: 9_000, newReference: 8_000 })).toBeNull();
    expect(repriceVerdict({ ...base, newPrice: 11_000, newReference: 10_000 })).toBeNull();
    expect(repriceVerdict({ ...base, newPrice: 11_000, newReference: 9_000 })).toMatch(/referensi turun/);
    expect(repriceVerdict({ ...base, newPrice: 14_000, newReference: 10_000, band: "rejected" })).toMatch(/melebihi/);
  });
});
