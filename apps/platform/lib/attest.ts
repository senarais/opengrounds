import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { ADDR, attestationAbi, publicClient } from "./chain";
import { attMessage, attestationDomain, attestationTypes, type AttPayload } from "./eip712";
import { onchainSigners } from "./signers";
import { platformDb } from "./db";

export const requiredSignatures = (p: Pick<AttPayload, "verdict" | "aiRecommendation">) => (p.verdict === 2 ? 1 : p.aiRecommendation === 2 ? 3 : 2);

export async function currentDraft(seriesId: string) {
  const { data } = await platformDb().from("attestations").select("*").eq("series_id", seriesId).is("submitted_tx", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as null | { id: string; payload: AttPayload; signatures: { signer: Address; sig: Hex }[]; expiry: string; verdict: string; nonce: number };
}

export async function lastSubmitted(seriesId: string) {
  const { data } = await platformDb().from("attestations").select("*").eq("series_id", seriesId).not("submitted_tx", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

/** Verifikasi tanda tangan terhadap payload draft & daftar penandatangan on-chain, lalu simpan. */
export async function addSignature(attId: string, claimedSigner: string, signature: Hex) {
  const pf = platformDb();
  const { data: row } = await pf.from("attestations").select("*").eq("id", attId).single();
  if (!row) throw new Error("Draft tidak ditemukan");
  if (row.submitted_tx) throw new Error("Attestation sudah dikirim on-chain");
  const payload = row.payload as AttPayload;
  const recovered = await recoverTypedDataAddress({ domain: attestationDomain() as any, types: attestationTypes as any, primaryType: "Attestation", message: attMessage(payload) as any, signature });
  if (recovered.toLowerCase() !== claimedSigner.toLowerCase()) throw new Error("Tanda tangan tidak cocok dengan akun yang dipilih");
  const signers = await onchainSigners();
  if (!signers.some((s) => s.toLowerCase() === recovered.toLowerCase())) throw new Error(`${recovered} bukan penandatangan terdaftar`);
  const existing = (row.signatures as { signer: string; sig: Hex }[]) ?? [];
  if (existing.some((s) => s.signer.toLowerCase() === recovered.toLowerCase())) return { added: false, count: existing.length, signer: recovered };
  const next = [...existing, { signer: recovered, sig: signature }];
  await pf.from("attestations").update({ signatures: next }).eq("id", attId);
  return { added: true, count: next.length, signer: recovered };
}

export async function chainAttState(series: Address) {
  const [valid, nonce] = await Promise.all([
    publicClient.readContract({ address: ADDR.attestation, abi: attestationAbi, functionName: "isValid", args: [series] }) as Promise<boolean>,
    publicClient.readContract({ address: ADDR.attestation, abi: attestationAbi, functionName: "nonces", args: [series] }) as Promise<bigint>,
  ]);
  return { valid, nonce };
}
