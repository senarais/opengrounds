"use server";
import { requireArea } from "@/lib/auth";
import { createDraft, submitAttestation } from "@/lib/flows/attestation";
import { analyzeVenueDocuments } from "@/lib/flows/documents";
import { getCtx, guarded } from "@/lib/flow";

const backOf = (fd: FormData) => `/reviewer?s=${String(fd.get("s"))}`;
const ctxOf = async (fd: FormData) => { await requireArea("reviewer"); return getCtx(String(fd.get("s"))); };

export async function createDraftAction(fd: FormData) { return guarded(backOf(fd), async () => createDraft(await ctxOf(fd))); }
export async function submitOnchain(fd: FormData) { return guarded(backOf(fd), async () => submitAttestation(await ctxOf(fd))); }

/** Jalankan ulang analisis AI atas dokumen pengajuan (menunggu selesai), lalu buat hasil verifikasi baru. */
export async function reanalyze(fd: FormData) {
  return guarded(backOf(fd), async () => {
    const ctx = await ctxOf(fd);
    const r = await analyzeVenueDocuments(ctx.venue.id);
    if (!r.ok) throw new Error(`Analisis dokumen gagal: ${r.reason}`);
    return `Analisis dokumen selesai: ${r.checks.filter((c) => c.status === "pass").length} cocok, ${r.checks.filter((c) => c.status === "fail").length} gagal, ${r.checks.filter((c) => c.status === "na" || c.status === "warn").length} perlu cek manual. Hasil verifikasi diperbarui.`;
  });
}
