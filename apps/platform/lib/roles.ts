export type Role = "owner" | "investor" | "operator" | "reviewer" | "spv";

/**
 * Peta akses halaman staf per peran (satu sumber kebenaran: pagar halaman, server action, API, dan menu).
 *  - operator : tim internal Open Grounds: tutup periode, jendela jual balik, kepatuhan, undang staf, review KYB
 *  - reviewer : pihak luar yang independen: review KYB dan slot VERIFIER (revaluasi, owner diam, sengketa)
 *  - spv      : Grounds (SPV), pembeli hak: menyetujui akuisisi, treasury, modal dan cadangan buyback
 */
export type StaffArea = "operator" | "review" | "verifier" | "spv" | "staff";
export const AREA_ROLES: Record<StaffArea, Role[]> = {
  operator: ["operator"],
  staff: ["operator"],
  review: ["operator", "reviewer"],
  verifier: ["reviewer"],
  spv: ["spv"],
};
