import { getAddress, getContractAddress, recoverMessageAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { audit, getCtx, type Ctx } from "../flow";
import { publicClient } from "../chain";
import { currentDraft, addSignature } from "../attest";
import { attMessage, attestationDomain, attestationTypes, walletTypedData } from "../eip712";
import { operatorAddress } from "../operator";
import { reviewMessage } from "../review-message";
import { onchainSigners } from "../signers";
import { createDraft, submitAttestation } from "./attestation";
import { deploySeries, openOffering } from "./series";

/** Dua pihak yang harus sama-sama setuju: tim (operator) dan pihak independen (auditor). */
export const REVIEW_ROLES = ["operator", "auditor"] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

export interface Vote { voter_email: string; voter_role: ReviewRole; decision: "approved" | "rejected"; note: string | null; voter_wallet: string | null; created_at: string }

/** Keputusan dari kumpulan suara: satu penolakan = ditolak (veto mudah); disetujui hanya bila operator DAN auditor menyetujui. */
export function tally(votes: Pick<Vote, "voter_role" | "decision">[]): "pending" | "approved" | "rejected" {
  if (votes.some((v) => v.decision === "rejected")) return "rejected";
  const ok = (r: ReviewRole) => votes.some((v) => v.voter_role === r && v.decision === "approved");
  return ok("operator") && ok("auditor") ? "approved" : "pending";
}

export async function votesOf(ctx: Ctx): Promise<Vote[]> {
  const { data } = await ctx.pf.from("review_votes").select("voter_email, voter_role, decision, note, voter_wallet, created_at").eq("series_id", ctx.series.id).order("created_at");
  return (data ?? []) as Vote[];
}

/** Wallet yang boleh menandatangani suara per peran: operator = signer 1/2 (tim), auditor = signer 3 (independen). */
export function walletsForRole(role: ReviewRole, signers: Address[]): Address[] {
  return (role === "auditor" ? signers.slice(2, 3) : signers.slice(0, 2)).map((a) => getAddress(a));
}

function assertCanVote(ctx: Ctx, actor: { email: string; role: string }) {
  if (!(REVIEW_ROLES as readonly string[]).includes(actor.role)) throw new Error("Hanya staf (operator atau auditor) yang boleh memberi suara review");
  if (ctx.series.contract_address) throw new Error("Kontrak sudah dideploy; review tidak bisa diubah. Gunakan veto (cabut attestation) bila perlu.");
  if (ctx.series.review_status !== "pending") throw new Error(ctx.series.review_status === "approved" ? "Review sudah selesai (disetujui kedua pihak)" : "Pengajuan sudah ditolak");
}

function assertWalletRole(wallet: Address, role: ReviewRole, signers: Address[]) {
  const allowed = walletsForRole(role, signers);
  if (!allowed.includes(wallet)) {
    throw new Error(`Wallet ${wallet.slice(0, 8)}… bukan wallet ${role === "auditor" ? "Signer 3 (auditor)" : "Signer 1 atau 2 (tim)"}. Pilih wallet yang benar di MetaMask: ${allowed.map((a) => a.slice(0, 8) + "…").join(" / ")}`);
  }
}

/**
 * Alamat kontrak seri yang AKAN dibuat: alamat CREATE dari wallet operator pada nonce berikutnya.
 * Kontrak baru dideploy setelah kedua pihak setuju, tetapi attestation terikat ke alamat kontrak, jadi alamat itu dihitung lebih dulu
 * supaya satu tanda tangan reviewer sekaligus berarti "setuju" dan "tanda tangan attestation".
 */
export async function predictSeriesAddress(): Promise<{ address: Address; nonce: number }> {
  const nonce = await publicClient.getTransactionCount({ address: operatorAddress(), blockTag: "pending" });
  return { address: getContractAddress({ from: operatorAddress(), nonce: BigInt(nonce) }), nonce };
}

async function resetApprovals(ctx: Ctx) {
  await ctx.pf.from("review_votes").delete().eq("series_id", ctx.series.id);
  await ctx.pf.from("attestations").delete().eq("series_id", ctx.series.id).is("submitted_tx", null);
}

/**
 * Siapkan data yang ditandatangani reviewer saat menyetujui: draft attestation terikat ke alamat kontrak yang diprediksi.
 * Bila alamat prediksi bergeser (wallet operator mengirim transaksi lain) dan sudah ada tanda tangan, persetujuan lama diulang.
 */
export async function prepareApproval(ctx: Ctx, actor: { email: string; role: string }) {
  assertCanVote(ctx, actor);
  const { data: run } = await ctx.pf.from("verification_runs").select("recommendation").eq("series_id", ctx.series.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) throw new Error("Belum ada hasil verifikasi untuk seri ini");
  if (run.recommendation !== "pass") throw new Error("Rekomendasi verifikasi “tidak lolos”. Persetujuan tidak bisa ditandatangani; tolak pengajuan atau jalankan ulang verifikasi.");
  const predicted = await predictSeriesAddress();
  let draft = await currentDraft(ctx.series.id);
  let notice = "";
  if (draft && draft.payload.series.toLowerCase() !== predicted.address.toLowerCase()) {
    if (draft.signatures.length > 0) { await resetApprovals(ctx); notice = "Alamat kontrak yang diprediksi berubah (wallet operator mengirim transaksi lain), jadi persetujuan sebelumnya diulang. "; }
    draft = null;
  }
  if (!draft) {
    await createDraft(ctx, predicted.address);
    draft = (await currentDraft(ctx.series.id))!;
  }
  const typed = walletTypedData("Attestation", attestationTypes, attestationDomain(), attMessage(draft.payload) as any);
  const allowed = walletsForRole(actor.role as ReviewRole, await onchainSigners());
  return { typed, attId: draft.id, allowed, notice };
}

/**
 * Pulihkan wallet dari tanda tangan penolakan (personal_sign) dan pastikan itu wallet Signer yang sesuai peran.
 * Pesan dibangun ulang di server dari nilai yang kita tahu, jadi klien tidak bisa menukar putusan/catatan/akun.
 */
export async function verifyReviewSignature(
  ctx: Ctx, actor: { email: string; role: string }, decision: "approved" | "rejected", note: string, at: string, signature: Hex, now = Date.now(),
): Promise<{ wallet: Address; message: string }> {
  const t = Date.parse(at);
  if (!Number.isFinite(t) || Math.abs(now - t) > 10 * 60_000) throw new Error("Tanda tangan kedaluwarsa, ulangi");
  const message = reviewMessage({ seriesId: ctx.series.id, email: actor.email, role: actor.role, decision, note, at });
  const wallet = getAddress(await recoverMessageAddress({ message, signature }));
  assertWalletRole(wallet, actor.role as ReviewRole, await onchainSigners());
  return { wallet, message };
}

/** Bukti suara: setuju = tanda tangan EIP-712 atas attestation (sekaligus tanda tangan attestation), tolak = tanda tangan pesan alasan. */
export type VoteProof = { kind: "attestation"; signature: Hex } | { kind: "message"; at: string; signature: Hex };

export async function decideReview(ctx: Ctx, actor: { email: string; role: string }, decision: "approved" | "rejected", note: string, proof: VoteProof) {
  assertCanVote(ctx, actor);
  const text = note.trim();
  if (decision === "rejected" && text.length < 10) throw new Error("Alasan penolakan minimal 10 karakter (akan dibaca owner)");

  let wallet: Address; let signedMessage: string;
  if (decision === "approved") {
    if (proof.kind !== "attestation") throw new Error("Persetujuan harus berupa tanda tangan attestation");
    const draft = await currentDraft(ctx.series.id);
    if (!draft) throw new Error("Draft attestation belum disiapkan; ulangi dari tombol Setujui");
    wallet = getAddress(await recoverTypedDataAddress({ domain: attestationDomain() as any, types: attestationTypes as any, primaryType: "Attestation", message: attMessage(draft.payload) as any, signature: proof.signature }));
    assertWalletRole(wallet, actor.role as ReviewRole, await onchainSigners());
    signedMessage = `attestation:${draft.id}`;
    const { data: same } = await ctx.pf.from("review_votes").select("voter_email").eq("series_id", ctx.series.id).eq("voter_wallet", wallet).neq("voter_email", actor.email).limit(1);
    if (same?.length) throw new Error("Wallet ini sudah dipakai untuk suara akun lain di pengajuan ini");
    await addSignature(draft.id, wallet, proof.signature);
  } else {
    if (proof.kind !== "message") throw new Error("Penolakan harus berupa tanda tangan pesan");
    const v = await verifyReviewSignature(ctx, actor, decision, text, proof.at, proof.signature);
    wallet = v.wallet; signedMessage = v.message;
  }

  const { error } = await ctx.pf.from("review_votes").upsert({ series_id: ctx.series.id, voter_email: actor.email, voter_role: actor.role, decision, note: text || null, voter_wallet: wallet, signed_message: signedMessage, signature: proof.signature, created_at: new Date().toISOString() }, { onConflict: "series_id,voter_email" });
  if (error) throw new Error(error.message);
  const votes = await votesOf(ctx);
  const result = tally(votes);
  await audit(actor.email, `review.vote.${decision}`, { venue: ctx.venue.name, series: ctx.series.id, role: actor.role, note: text, wallet });
  if (result === "pending") {
    const missing = (["operator", "auditor"] as const).filter((r) => !votes.some((v) => v.voter_role === r && v.decision === "approved"));
    return `Suara Anda tercatat. Review belum selesai: masih menunggu persetujuan ${missing.map((r) => (r === "operator" ? "operator (tim)" : "auditor (independen)")).join(" dan ")}.`;
  }
  await ctx.pf.from("series").update({ review_status: result, review_by: actor.email, review_note: text || null, reviewed_at: new Date().toISOString(), ...(result === "rejected" ? { status: "Failed" } : {}) }).eq("id", ctx.series.id);
  if (result === "rejected") {
    await ctx.pf.from("attestations").delete().eq("series_id", ctx.series.id).is("submitted_tx", null);
    await ctx.pf.from("venues").update({ status: "rejected" }).eq("id", ctx.venue.id);
    return "Pengajuan ditolak. Owner akan melihat alasannya.";
  }
  await ctx.pf.from("venues").update({ status: "verifying" }).eq("id", ctx.venue.id);
  return finishApproved(ctx, actor);
}

/** Kedua pihak setuju: deploy kontrak, kirim attestation ke Sepolia (tanda tangan kedua penyetuju = kuorum, termasuk auditor), lalu buka penawaran. */
async function finishApproved(ctx: Ctx, actor: { email: string }) {
  const approved = { ...ctx, series: { ...ctx.series, review_status: "approved" } };
  const draft = await currentDraft(ctx.series.id);
  const predicted = await predictSeriesAddress();
  if (!draft || draft.payload.series.toLowerCase() !== predicted.address.toLowerCase()) {
    await resetApprovals(ctx);
    await ctx.pf.from("series").update({ review_status: "pending", review_by: null, reviewed_at: null }).eq("id", ctx.series.id);
    return "Alamat kontrak yang diprediksi berubah sebelum deploy (wallet operator mengirim transaksi lain). Demi keamanan tanda tangan, persetujuan diulang: operator dan auditor setujui sekali lagi.";
  }
  let deployed: { series: Address };
  try { deployed = await deploySeries(approved, actor.email); }
  catch (e: any) { return `Review selesai (kedua pihak setuju), tetapi deploy otomatis gagal: ${e?.shortMessage ?? e?.message ?? String(e)}. Ulangi deploy dari konsol Operator.`; }
  const head = `Review selesai: operator dan auditor sama-sama menyetujui. Kontrak seri dideploy: ${deployed.series.slice(0, 10)}…`;
  if (deployed.series.toLowerCase() !== draft.payload.series.toLowerCase()) {
    await ctx.pf.from("attestations").delete().eq("id", draft.id);
    return `${head}, tetapi alamatnya tidak sama dengan yang ditandatangani. Buat draft attestation baru dan tanda tangani ulang di halaman Reviewer.`;
  }
  try {
    const msg = await submitAttestation(await getCtx(ctx.series.id));
    try {
      return `${head}. ${msg} ${await openOffering(await getCtx(ctx.series.id))}`;
    } catch (e: any) {
      return `${head}. ${msg} Penawaran belum dibuka otomatis: ${e?.shortMessage ?? e?.message ?? String(e)}. Operator bisa membukanya dari konsol Operator.`;
    }
  } catch (e: any) {
    return `${head}, tetapi pengiriman attestation ke Sepolia gagal: ${e?.shortMessage ?? e?.message ?? String(e)}. Kirim ulang dari halaman Reviewer.`;
  }
}
