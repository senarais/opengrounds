import type { FinancialMonth } from "../src";

/** Fixture KHUSUS TES (tidak dipakai aplikasi): venue contoh PRD §4.6 (D = Rp15 juta per bulan). */
export function testOnboarding(over: Record<string, any> = {}) {
  const now = new Date();
  const months: FinancialMonth[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + i, 1));
    return {
      month: d.toISOString().slice(0, 7), gross: 52_000_000, refunds: 1_000_000, opex: 27_000_000, tax: 1_500_000,
      operatorFee: 4_000_000, reserve: 2_000_000, platformFee: 1_500_000, digitalGross: 49_400_000, bankCredits: null,
    };
  });
  const base = {
    company: {
      legalName: "PT Lapangan Sejahtera", nib: "1234567890123", npwp: "123456789012345", deedNumber: "12", deedDate: "2020-03-01",
      registeredAddress: "Jl. Contoh No. 10, Bandung", kbli: "93112", directors: [{ name: "Budi Santoso", title: "Direktur Utama" }], commissioners: [],
      signatoryName: "Budi Santoso", signatoryTitle: "Direktur Utama", contactEmail: "budi@example.com", contactPhone: "081234567890",
    },
    beneficialOwners: [{ fullName: "Budi Santoso", ownershipPct: 60, idNumber: "3273010101900001" }],
    venue: {
      name: "Arena Padel Dago", address: "Jl. Contoh No. 10, Dago, Bandung", city: "Bandung", province: "Jawa Barat", lat: -6.88, lng: 107.61,
      sports: ["padel"], openHour: 7, closeHour: 23, operatingSince: `${now.getUTCFullYear() - 3}-01`,
      facilities: [
        { name: "Padel 1", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: false, pricePerHour: 180_000 },
        { name: "Padel 2", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: true, pricePerHour: 200_000 },
      ],
    },
    land: { owned: true, rightType: "SHM", certificateNumber: "10.20.30.40.1.00123", holderName: "PT Lapangan Sejahtera", encumbered: false, encumbranceConsent: false, permits: ["PBG"], assetValue: 2_400_000_000 },
    financials: months,
    debt: { outstanding: 0, monthlyInstallment: 0, lender: "", covenantRestricts: false },
    offering: { stakeBps: 5000, useOfFunds: "Renovasi atap dan lampu lapangan" },
    payout: { bank: "BCA", accountName: "PT Lapangan Sejahtera", accountNumber: "1234567890" },
    integrations: { gatewayOnly: true, bankDataAccess: true },
    consent: { dataProcessing: true, truthful: true },
  };
  return structuredClone({ ...base, ...over });
}
