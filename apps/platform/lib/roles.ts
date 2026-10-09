export type Role = "owner" | "investor" | "reviewer" | "auditor" | "operator";

/**
 * Peta akses halaman staf per peran (satu sumber kebenaran: dipakai pagar halaman, server action, API, dan menu).
 *  - operator : konsol operator, review, verifikasi, kelola staf
 *  - auditor  : review (wajib ikut menyetujui), halaman auditor (exception, co-sign root harian), verifikasi
 */
export type StaffArea = "operator" | "reviewer" | "verification" | "auditor" | "staff";
export const AREA_ROLES: Record<StaffArea, Role[]> = {
  operator: ["operator"],
  staff: ["operator"],
  reviewer: ["operator", "auditor"],
  verification: ["operator", "auditor"],
  auditor: ["auditor"],
};

