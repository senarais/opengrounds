import { eligibleOf, type MonthRevenue } from "../src";

/** Fixture KHUSUS TES (tidak dipakai aplikasi). */
export function testApplication(over: Record<string, any> = {}) {
  const now = new Date();
  const since = `${now.getUTCFullYear() - 3}-01`;
  const breakdown: MonthRevenue[] = [100, 110, 120, 115, 118, 122].map((x) => {
    const gross = x * 1_200_000;
    return { gross, refund: Math.round(gross * 0.02), tax: Math.round(gross / 11), fee: Math.round(gross * 0.007) };
  });
  const base = {
    company: {
      name: "Warung Padel", city: "Bandung", area: "Coblong", province: "Jawa Barat", address: "Jl. Contoh No. 10", kelurahan: "Dago", postalCode: "40135", landmark: "",
      sports: ["padel"], courts: 2, courtSpecs: "Padel 20x10 m", openHour: 7, closeHour: 23, tariffNote: "Rp180rb/jam",
      facilities: [
        { name: "Padel 1", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: false, pricePerHour: 180_000 },
        { name: "Padel 2", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: true, pricePerHour: 200_000 },
      ],
    },
    offering: { target: 150_000_000, minRaise: 100_000_000, unitPrice: 15_000, shareBps: 1000, tenorMonths: 12, useOfFunds: "renovasi" },
    dossier: {
      leaseMonthsRemaining: 36, monthlyBankInstallment: 5_000_000, bankCovenantForbidsRevenueSale: false, bankConsentLetter: false, activeLandDispute: false, hasNpwp: true, hasBusinessLicense: true, relatedParty: false, relatedPartyNote: "",
      debtOutstanding: 120_000_000, debtRemainingMonths: 24, collateral: "tanah/bangunan", otherPledgedBps: 0, otherPledgeNote: "", monthlyOpex: 40_000_000,
    },
    property: { land: "sewa", building: "sewa", ownedAssetPledged: false },
    lease: { landlord: "PT Pemilik Lahan", monthlyRent: 15_000_000, remainingMonths: 36, renewalOption: true, landlordConsentsToSale: true },
    assets: {
      builtYear: 2020, capexPlan: "", insured: true,
      insurance: { insurer: "Asuransi Contoh", coverage: ["kebakaran", "gangguan_usaha"], sumInsured: 2_000_000_000, validUntil: `${now.getUTCFullYear() + 2}-06` },
    },
    business: {
      operatingSince: since, nib: "1234567890123", npwp: "123456789012345", signatoryName: "Budi Santoso", signatoryTitle: "Direktur",
      owners: [{ name: "Budi Santoso", pct: 60 }], contactEmail: "budi@example.com", contactPhone: "081234567890",
    },
    payout: { bank: "BCA", accountName: "Warung Padel", accountNumber: "1234567890" },
    consent: { dataProcessing: true, truthful: true },
    revenue: { months: breakdown.map(eligibleOf), breakdown, occupancyPct: 60, paymentMix: { gatewayPct: 80, cashPct: 10, transferPct: 10 } },
  };
  return structuredClone({ ...base, ...over });
}
