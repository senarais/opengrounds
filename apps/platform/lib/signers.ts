import type { Address } from "viem";
import { publicClient, ADDR, attestationAbi } from "./chain";

/** Tiga penandatangan terdaftar di registry attestation (urutan sesuai saat deploy; ke-3 = pihak independen/auditor). */
export async function onchainSigners(): Promise<Address[]> {
  return (await Promise.all([0, 1, 2].map((i) => publicClient.readContract({ address: ADDR.attestation, abi: attestationAbi, functionName: "signers", args: [BigInt(i)] })))) as Address[];
}
