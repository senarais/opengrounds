"use server";
import { requireArea } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { decideCase, disposeFinding, runAutomatedCheck } from "@/lib/flows/kyb";
import { issueSeries } from "@/lib/flows/series";
import { prepareReviewApproval } from "@/lib/flows/review-signature";
import type { Hex } from "viem";

export async function prepareApprovalAction(fd: FormData) {
  const me = await requireArea("review");
  return prepareReviewApproval(String(fd.get("caseId")), me, Number(fd.get("assetValue")), String(fd.get("note") ?? ""), String(fd.get("reviewWallet") ?? ""));
}

export async function checkAction(fd: FormData) {
  await requireArea("review");
  const id = String(fd.get("caseId"));
  await guarded(`/review/${id}`, async () => {
    const v = fd.get("assetValue") ? Math.floor(Number(fd.get("assetValue"))) : undefined;
    const r = await runAutomatedCheck(id, { assetValue: v });
    return `Pemeriksaan selesai. ${r.summary.counts.critical + r.summary.counts.high} temuan penting dan ${r.summary.counts.medium} hal perlu perhatian. Baca ringkasan dan tinjau bukti sebelum memutuskan.`;
  });
}
export async function disposeAction(fd: FormData) {
  const me = await requireArea("review");
  const id = String(fd.get("caseId"));
  await guarded(`/review/${id}`, async () => { await disposeFinding(String(fd.get("findingId")), me.email, String(fd.get("disposition")) as any, String(fd.get("reason") ?? "")); });
}
/** Setujui → langsung terbitkan seri (deploy, daftar registry, attestation akuisisi ditandatangani platform). Token belum terbit sampai owner menandatangani. */
export async function decideAction(fd: FormData) {
  const me = await requireArea("review");
  const id = String(fd.get("caseId"));
  const decision = String(fd.get("decision")) as "APPROVED" | "REJECTED" | "NEEDS_INFO";
  await guarded(`/review/${id}`, async () => {
    const assetValue = Number(fd.get("assetValue"));
    const result = await decideCase(id, me.email, decision, String(fd.get("note") ?? ""), decision === "APPROVED" ? {
      me, assetValue, proof: { signature: String(fd.get("reviewSignature") ?? "") as Hex, deadline: String(fd.get("reviewDeadline") ?? ""), wallet: String(fd.get("reviewWallet") ?? "") },
    } : undefined);
    if (decision !== "APPROVED") return decision === "REJECTED" ? "Pengajuan ditolak." : "Owner diminta melengkapi data.";
    if (!result.finalized) return `Persetujuan Anda tersimpan (1 dari 2). Menunggu tanda tangan ${result.waitingFor}; kontrak belum dibuat.`;
    const r = await issueSeries(result.venueId, me.email, assetValue);
    return `Dua persetujuan lengkap. Kontrak seri otomatis dibuat (${r.address.slice(0, 10)}…). Tanda tangan platform disiapkan otomatis; menunggu tanda tangan akuisisi owner.`;
  });
}
