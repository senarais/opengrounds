import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { foundry, sepolia } from "viem/chains";
import { contractErrors } from "./errors";

function deployments(): { Series: Address; SeriesToken: Address; AssetAttestation: Address; chainId: number } {
  // Uji lokal: cukup ATTESTATION_ADDRESS (seri dideploy per pengajuan).
  if (process.env.ATTESTATION_ADDRESS) {
    const zero = "0x0000000000000000000000000000000000000000" as Address;
    return { Series: (process.env.SERIES_ADDRESS as Address) ?? zero, SeriesToken: (process.env.TOKEN_ADDRESS as Address) ?? zero, AssetAttestation: process.env.ATTESTATION_ADDRESS as Address, chainId: Number(process.env.CHAIN_ID ?? 11155111) };
  }
  // Dibaca ulang bila file berubah (mtime): server yang sedang jalan tidak boleh memegang alamat registry lama setelah deploy ulang.
  const path = join(process.cwd(), "../../packages/contracts/deployments/latest.json");
  const mtime = statSync(path).mtimeMs;
  if (!fileCache || fileCache.mtime !== mtime) fileCache = { mtime, v: JSON.parse(readFileSync(path, "utf8")) };
  return fileCache.v;
}
let fileCache: { mtime: number; v: ReturnType<typeof deployments> } | null = null;

/** Registry attestation dipakai bersama semua seri. Seri dan token diturunkan per pengajuan (lihat SeriesRef). */
export const ADDR = { get attestation(): Address { return deployments().AssetAttestation; } };
/** Seri demo bawaan (deployments/latest.json), dipakai bootstrap untuk perusahaan "Ayo". */
export const LEGACY_SERIES = { get series(): Address { return deployments().Series; }, get token(): Address { return deployments().SeriesToken; } };
export interface SeriesRef { series: Address; token: Address }
export const etherscan = (a: string) => `https://sepolia.etherscan.io/address/${a}`;
export const etherscanTx = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;

// CHAIN_ID=31337 hanya untuk uji lokal (anvil); default Sepolia.
export const chain = process.env.CHAIN_ID === "31337" ? foundry : sepolia;
/** App memakai HTTP. Jika .env berisi URL WebSocket (untuk forge/cast), ubah ke HTTPS di host yang sama. */
export const rpcUrl = (process.env.SEPOLIA_RPC_URL ?? "").replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace("/ws/v3/", "/v3/");
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

export const seriesAbi = [...contractErrors, ...parseAbi([
  "function token() view returns (address)",
  "function attestation() view returns (address)",
  "function state() view returns (uint8)",
  "function target() view returns (uint256)",
  "function minRaise() view returns (uint256)",
  "function unitPrice() view returns (uint256)",
  "function cap() view returns (uint256)",
  "function shareBps() view returns (uint16)",
  "function raised() view returns (uint256)",
  "function countedRaise() view returns (uint256)",
  "function minted() view returns (uint256)",
  "function refunded() view returns (uint256)",
  "function released() view returns (uint256)",
  "function tranche1Released() view returns (bool)",
  "function tranche2Released() view returns (bool)",
  "function exceptionOpen() view returns (bool)",
  "function periodClean(uint64) view returns (bool)",
  "function P() view returns (uint256)",
  "function R() view returns (uint256)",
  "function S() view returns (uint256)",
  "function lastPeriod() view returns (uint64)",
  "function offeringEnd() view returns (uint64)",
  "function offeringDuration() view returns (uint32)",
  "function tenorEnd() view returns (uint64)",
  "function nextRedeemId() view returns (uint256)",
  "function redeemValuePerToken() view returns (uint256)",
  "function auditor() view returns (address)",
  "function dailyRoot(uint32) view returns (bytes32)",
  "function openOffering()",
  "function setKyc(address,bool)",
  "function recordPurchase(address,uint256,bytes32,bool)",
  "function closeOffering()",
  "function refund(address)",
  "function releaseTranche1()",
  "function releaseTranche2()",
  "function postPool(uint64,uint256,bytes32)",
  "function reconcilePeriod(uint64,bool,bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function approveRedeem(uint256)",
  "function confirmRedeem(uint256)",
  "function failRedeem(uint256)",
  "function setException(bool)",
  "function endTenor()",
  "function anchorRoot(uint32,bytes32,uint32,bytes)",
  "function requestRedeemFor(address,uint256,uint256,bytes) returns (uint256)",
  "function redeems(uint256) view returns (address holder, uint128 units, uint128 payout, uint8 status)",
  "function pendingUnits(address) view returns (uint256)",
  "function redeemNonce(address) view returns (uint256)",
  "function transferNonce(address) view returns (uint256)",
  "function transferFor(address,address,uint256,uint256,bytes)",
])];

export const attestationAbi = [...contractErrors, ...parseAbi([
  "struct Attestation { address series; bytes32 assetId; uint8 verdict; uint8 aiRecommendation; uint16 score; bytes32 evidenceRoot; bytes32 rulesetHash; uint256 maxPrice; uint16 maxShareBps; uint16 maxTotalShareBps; uint64 expiry; bytes32 overrideReasonHash; uint256 nonce; }",
  "function isValid(address) view returns (bool)",
  "function maxPrice(address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function signers(uint256) view returns (address)",
  "function totalShareBps(bytes32) view returns (uint16)",
  "function submit(Attestation a, bytes[] sigs)",
  "function revoke(address series, bytes32 reasonHash)",
])];

export const tokenAbi = [...contractErrors, ...parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
  "function allowed(address) view returns (bool)",
])];

export const SERIES_STATES = ["Draft", "Offering", "Funded", "Failed", "Active", "Closed"] as const;

export async function readSeries(ref: SeriesRef) {
  const r = (fn: string) => publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: fn as any }) as Promise<any>;
  const [state, target, minRaise, unitPrice, cap, shareBps, raised, countedRaise, minted, released, t1, t2, exc, P, R, S, lastPeriod, redeemValue, nextRedeemId, auditor] = await Promise.all([
    "state", "target", "minRaise", "unitPrice", "cap", "shareBps", "raised", "countedRaise", "minted", "released", "tranche1Released", "tranche2Released", "exceptionOpen", "P", "R", "S", "lastPeriod", "redeemValuePerToken", "nextRedeemId", "auditor",
  ].map(r));
  const attValid = (await publicClient.readContract({ address: ADDR.attestation, abi: attestationAbi, functionName: "isValid", args: [ref.series] })) as boolean;
  const totalSupply = (await publicClient.readContract({ address: ref.token, abi: tokenAbi, functionName: "totalSupply" })) as bigint;
  return {
    state: SERIES_STATES[Number(state)] ?? "?",
    target, minRaise, unitPrice, cap, shareBps: Number(shareBps), raised, countedRaise, minted, released, tranche1Released: t1 as boolean, tranche2Released: t2 as boolean,
    exceptionOpen: exc as boolean, P, R, S, lastPeriod, redeemValue, nextRedeemId, auditor: auditor as Address, attValid, totalSupply,
  };
}
export type SeriesInfo = Awaited<ReturnType<typeof readSeries>>;
