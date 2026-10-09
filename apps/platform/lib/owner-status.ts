/** Label dan warna status pengajuan owner. */
export const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "neutral" }> = {
  applied: { label: "Diajukan", tone: "info" },
  verifying: { label: "Menunggu persetujuan reviewer", tone: "warn" },
  approved: { label: "Disetujui · PoS aktif", tone: "ok" },
  active: { label: "Penawaran dibuka", tone: "ok" },
  rejected: { label: "Ditolak", tone: "bad" },
};

