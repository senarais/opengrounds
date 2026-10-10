import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { registrySigners } from "../chain";
import { platformDb } from "../db";
import { SLOT, attMessage, attestationTypes, registryDomain, walletTypedData, type AttKind, type SlotName } from "../eip712";
import { audit } from "../flow";
import { platformSignTyped } from "../operator";

/**
 * Attestation 2-of-3 (PRD v4.1 §6.5, versi tim):
 *   ACQUISITION_CLOSED : PLATFORM + COUNTERPARTY (owner)
 *   REVENUE_PERIOD     : PLATFORM + COUNTERPARTY; bila owner diam melewati jendela, PLATFORM + VERIFIER
 *   VALUATION_UPDATE   : PLATFORM + VERIFIER
 * Aturan ini ditegakkan kontrak registry; di sini hanya diperiksa lebih awal supaya pengguna mendapat pesan jelas.
 */
export function allowedSlots(kind: AttKind, ownerSilent = false): SlotName[] {
  if (kind === "ACQUISITION_CLOSED") return ["PLATFORM", "COUNTERPARTY"];
  if (kind === "REVENUE_PERIOD") return ownerSilent ? ["PLATFORM", "COUNTERPARTY", "VERIFIER"] : ["PLATFORM", "COUNTERPARTY"];
  return ["PLATFORM", "VERIFIER"];
}
export const SLOT_LABEL: Record<SlotName, string> = { PLATFORM: "Grounds · platform", COUNTERPARTY: "Venue owner · seller", VERIFIER: "Independent reviewer · verifier" };

export interface Sig { slot: SlotName; signer: Address; sig: Hex; at: string }

export async function createAttestation(a: { seriesId: string; kind: AttKind; refId: number | bigint; payload: unknown; payloadHash: Hex; evidenceHash: Hex; deadline: Date }) {
  const pf = platformDb();
  // satu attestation aktif per (seri, jenis, ref): yang lama (belum terkirim) diganti bila angka berubah
  await pf.from("attestations").delete().eq("series_id", a.seriesId).eq("kind", a.kind).eq("ref_id", String(a.refId)).neq("status", "submitted");
  const { data, error } = await pf.from("attestations").insert({
    series_id: a.seriesId, kind: a.kind, ref_id: String(a.refId), payload: a.payload, payload_hash: a.payloadHash, evidence_hash: a.evidenceHash, deadline: a.deadline.toISOString(),
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export function typedDataOf(att: any, series: Address) {
  const msg = attMessage(att.kind, series, BigInt(att.ref_id), att.payload_hash, BigInt(Math.floor(Date.parse(att.deadline) / 1000)));
  return { domain: registryDomain(), types: attestationTypes, primaryType: "Attestation" as const, message: msg };
}
export const walletJsonOf = (att: any, series: Address) => {
  const td = typedDataOf(att, series);
  return walletTypedData(td.primaryType, td.types, td.domain, td.message as any);
};

/** Tambah satu tanda tangan setelah memeriksa siapa penanda tangannya (slot) dan bahwa slot itu berhak untuk jenis ini. */
export async function addSignature(attId: string, series: Address, signature: Hex, opts: { ownerSilent?: boolean; expectSlot?: SlotName } = {}) {
  const pf = platformDb();
  const { data: att } = await pf.from("attestations").select("*").eq("id", attId).single();
  if (!att) throw new Error("Attestation not found.");
  if (att.status !== "collecting") throw new Error("This attestation is no longer collecting signatures.");
  if (Date.parse(att.deadline) < Date.now()) throw new Error("Attestation expired. Create a new one.");
  const signer = await recoverTypedDataAddress({ ...typedDataOf(att, series), signature } as any);
  const reg = await registrySigners(series);
  const slot: SlotName | null = signer === reg.platform ? "PLATFORM" : signer === reg.verifier ? "VERIFIER" : reg.counterparty && signer === reg.counterparty ? "COUNTERPARTY" : null;
  if (!slot) throw new Error(`Wallet ${signer.slice(0, 10)}… is not a registered signer for this series.`);
  if (opts.expectSlot && slot !== opts.expectSlot) throw new Error(`This signature is from ${SLOT_LABEL[slot]}, not ${SLOT_LABEL[opts.expectSlot]}.`);
  if (!allowedSlots(att.kind, opts.ownerSilent).includes(slot)) throw new Error(`${SLOT_LABEL[slot]} cannot sign ${att.kind}.`);
  const sigs: Sig[] = att.signatures ?? [];
  if (sigs.some((s) => s.slot === slot)) return { att, slot, added: false };
  const next = [...sigs, { slot, signer, sig: signature, at: new Date().toISOString() }];
  const { data: updated, error } = await pf.from("attestations").update({ signatures: next }).eq("id", attId).eq("status", "collecting").select("*").single();
  if (error) throw new Error(error.message);
  await audit(slot === "PLATFORM" ? "platform" : signer, "attestation.sign", { entity: "attestations", entityId: attId, detail: { kind: att.kind, slot } });
  return { att: updated, slot, added: true };
}

export async function signAsPlatform(attId: string, series: Address) {
  const { data: att } = await platformDb().from("attestations").select("*").eq("id", attId).single();
  const sig = await platformSignTyped(typedDataOf(att, series));
  return addSignature(attId, series, sig, { expectSlot: "PLATFORM", ownerSilent: true });
}

/** Siap dikirim: ≥2 slot berbeda, PLATFORM wajib. Kontrak memeriksa ulang. */
export const isReady = (att: { signatures: Sig[] }) => (att.signatures ?? []).length >= 2 && att.signatures.some((s) => s.slot === "PLATFORM");
export const sigsOf = (att: { signatures: Sig[] }) => (att.signatures ?? []).map((s) => s.sig);
export const slotsOf = (att: { signatures: Sig[] }) => (att.signatures ?? []).map((s) => s.slot);
export const SLOT_BITS = SLOT;

export async function markSubmitted(attId: string, tx: Hex) {
  await platformDb().from("attestations").update({ status: "submitted", tx_hash: tx }).eq("id", attId);
}
