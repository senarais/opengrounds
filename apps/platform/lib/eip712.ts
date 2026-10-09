import { keccak256, stringToBytes, toHex, type Address, type Hex } from "viem";
import { ADDR, chain } from "./chain";

const t = (name: string, type: string) => ({ name, type });

export const attestationTypes = {
  Attestation: [
    t("series", "address"), t("assetId", "bytes32"), t("verdict", "uint8"), t("aiRecommendation", "uint8"), t("score", "uint16"),
    t("evidenceRoot", "bytes32"), t("rulesetHash", "bytes32"), t("maxPrice", "uint256"), t("maxShareBps", "uint16"),
    t("maxTotalShareBps", "uint16"), t("expiry", "uint64"), t("overrideReasonHash", "bytes32"), t("nonce", "uint256"),
  ],
} as const;
export const dailyRootTypes = { DailyRoot: [t("series", "address"), t("day", "uint32"), t("root", "bytes32"), t("count", "uint32")] } as const;
export const redeemTypes = { RedeemRequest: [t("series", "address"), t("holder", "address"), t("units", "uint256"), t("nonce", "uint256"), t("deadline", "uint256")] } as const;

export const transferTypes = { TransferRequest: [t("series", "address"), t("from", "address"), t("to", "address"), t("units", "uint256"), t("nonce", "uint256"), t("deadline", "uint256")] } as const;

export const attestationDomain = () => ({ name: "AssetAttestation", version: "1", chainId: chain.id, verifyingContract: ADDR.attestation });
export const seriesDomain = (series: Address) => ({ name: "Series", version: "1", chainId: chain.id, verifyingContract: series });

/** Payload attestation sebagai string (aman disimpan di JSON & dikirim ke wallet). */
export interface AttPayload {
  series: Address; assetId: Hex; verdict: number; aiRecommendation: number; score: number; evidenceRoot: Hex; rulesetHash: Hex;
  maxPrice: string; maxShareBps: number; maxTotalShareBps: number; expiry: string; overrideReasonHash: Hex; nonce: string;
}
/** Bentuk untuk viem (uint256/uint64 = bigint). */
export const attMessage = (p: AttPayload) => ({ ...p, maxPrice: BigInt(p.maxPrice), expiry: BigInt(p.expiry), nonce: BigInt(p.nonce) });

/** JSON untuk eth_signTypedData_v4 (MetaMask): semua angka sebagai string. */
export function walletTypedData(primaryType: string, types: Record<string, readonly { name: string; type: string }[]>, domain: object, message: Record<string, unknown>) {
  return JSON.stringify({
    types: { EIP712Domain: [t("name", "string"), t("version", "string"), t("chainId", "uint256"), t("verifyingContract", "address")], ...types },
    primaryType,
    domain,
    message: Object.fromEntries(Object.entries(message).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
  });
}

export const dayNum = (isoDate: string) => Number(isoDate.replaceAll("-", "")); // 2026-10-08 -> 20261008
export const assetIdFor = (venueUuid: string): Hex => keccak256(toHex(stringToBytes(`venue:${venueUuid}`)));
