/** Pesan suara review yang ditandatangani wallet Signer (personal_sign, tanpa gas). Dipakai di browser dan server, jadi tanpa impor server. */
export interface ReviewVoteInput { seriesId: string; email: string; role: string; decision: "approved" | "rejected"; note: string; at: string }

export const reviewMessage = (v: ReviewVoteInput) =>
  `Suara review Venue RWA\nSeri: ${v.seriesId}\nPeran: ${v.role}\nAkun: ${v.email}\nPutusan: ${v.decision === "approved" ? "SETUJU" : "TOLAK"}\nCatatan: ${v.note.trim() || "-"}\nWaktu: ${v.at}`;
