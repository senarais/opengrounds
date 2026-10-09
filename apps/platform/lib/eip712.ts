import { encodeAbiParameters, keccak256, stringToBytes, toHex, type Address, type Hex } from "viem";
import type { Waterfall } from "@venue-rwa/shared";
import { REGISTRY, chain } from "./chain";

/**
 * Data EIP-712 yang ditandatangani di luar chain. Harus identik dengan kontrak:
 *  - Attestation  : AttestationRegistry (domain "OpenGroundsAttestation"), ditandatangani 2 dari 3 slot
 *  - Order        : VenueSeries (domain "OpenGroundsSeries"), ditandatangani investor lewat Privy
 *  - SellBack     : VenueSeries, ditandatangani pemegang lewat Privy
 */
export const KIND = { ACQUISITION_CLOSED: 0, REVENUE_PERIOD: 1, VALUATION_UPDATE: 2 } as const;
export type AttKind = keyof typeof KIND;
export const SLOT = { PLATFORM: 1, COUNTERPARTY: 2, VERIFIER: 4 } as const;
export type SlotName = keyof typeof SLOT;

const t = (name: string, type: string) => ({ name, type });
export const attestationTypes = { Attestation: [t("kind", "uint8"), t("seriesId", "uint256"), t("refId", "uint256"), t("payloadHash", "bytes32"), t("deadline", "uint64")] } as const;
export const orderTypes = { Order: [t("investor", "address"), t("tokens", "uint256"), t("paidIdr", "uint256"), t("orderId", "uint256"), t("deadline", "uint64")] } as const;
export const sellBackTypes = { SellBack: [t("holder", "address"), t("tokens", "uint256"), t("paidIdr", "uint256"), t("requestId", "uint256"), t("deadline", "uint64")] } as const;

export const registryDomain = () => ({ name: "OpenGroundsAttestation", version: "1", chainId: chain.id, verifyingContract: REGISTRY.address });
export const seriesDomain = (series: Address) => ({ name: "OpenGroundsSeries", version: "1", chainId: chain.id, verifyingContract: series });

export interface AttMessage { kind: number; seriesId: bigint; refId: bigint; payloadHash: Hex; deadline: bigint }
export const attMessage = (kind: AttKind, series: Address, refId: bigint | number, payloadHash: Hex, deadline: bigint | number): AttMessage =>
  ({ kind: KIND[kind], seriesId: BigInt(series), refId: BigInt(refId), payloadHash, deadline: BigInt(deadline) });

export interface OrderMessage { investor: Address; tokens: bigint; paidIdr: bigint; orderId: bigint; deadline: bigint }
export interface SellBackMessage { holder: Address; tokens: bigint; paidIdr: bigint; requestId: bigint; deadline: bigint }

// ---------------------------------------------------------------- payload attestation (sama dengan kontrak)

export const acquisitionPayload = (a: { valuation: bigint; supply: bigint; refPrice: bigint; stakeBps: number; spvFeeBps: number; evidenceHash: Hex }) =>
  keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" }, { type: "uint16" }, { type: "bytes32" }],
    [a.valuation, a.supply, a.refPrice, a.stakeBps, a.spvFeeBps, a.evidenceHash],
  ));

const waterfallTuple = { type: "tuple", components: ["gross", "refunds", "opex", "tax", "operatorFee", "reserve", "platformFee"].map((name) => ({ name, type: "uint256" })) } as const;
export const toChainWaterfall = (w: Waterfall) => ({
  gross: BigInt(w.gross), refunds: BigInt(w.refunds), opex: BigInt(w.opex), tax: BigInt(w.tax), operatorFee: BigInt(w.operatorFee), reserve: BigInt(w.reserve), platformFee: BigInt(w.platformFee),
});
export const periodPayload = (periodId: number, periodEnd: bigint, w: Waterfall, evidenceHash: Hex) =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }, waterfallTuple, { type: "bytes32" }], [BigInt(periodId), periodEnd, toChainWaterfall(w), evidenceHash]));

export const valuationPayload = (nonce: bigint, valuation: bigint, refPrice: bigint, evidenceHash: Hex) =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }], [nonce, valuation, refPrice, evidenceHash]));

/** JSON untuk eth_signTypedData_v4 / Privy: semua angka sebagai string. */
export function walletTypedData(primaryType: string, types: Record<string, readonly { name: string; type: string }[]>, domain: object, message: object) {
  return JSON.stringify({
    types: { EIP712Domain: [t("name", "string"), t("version", "string"), t("chainId", "uint256"), t("verifyingContract", "address")], ...types },
    primaryType,
    domain,
    message: Object.fromEntries(Object.entries(message as Record<string, unknown>).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
  });
}

/** Hash bukti dari objek apa pun (JSON kanonik di luar chain, hanya hash yang masuk chain). */
export const evidenceHashOf = (s: string): Hex => keccak256(toHex(stringToBytes(s)));
export const refOf = evidenceHashOf;
