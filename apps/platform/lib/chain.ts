import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, type Address } from "viem";
import { foundry, sepolia } from "viem/chains";
import { SERIES_STATES, type SeriesStatus } from "@venue-rwa/shared";
import { attestationRegistryAbi, seriesTokenAbi, venueSeriesAbi } from "./abi";

export { attestationRegistryAbi, seriesTokenAbi, venueSeriesAbi };

/**
 * Hanya registry attestation yang dideploy sekali (scripts/deploy.sh → deployments/latest.json).
 * Kontrak seri (VenueSeries + SeriesToken) dideploy per venue oleh platform setelah KYB disetujui.
 */
interface Deployment { chainId: number; AttestationRegistry: Address; platform: Address; verifier: Address }
let fileCache: { mtime: number; v: Deployment } | null = null;
function deployment(): Deployment {
  if (process.env.REGISTRY_ADDRESS) {
    return { chainId: Number(process.env.CHAIN_ID ?? 11155111), AttestationRegistry: process.env.REGISTRY_ADDRESS as Address, platform: process.env.ATTESTOR_PLATFORM_ADDRESS as Address, verifier: process.env.ATTESTOR_VERIFIER_ADDRESS as Address };
  }
  // dibaca ulang bila file berubah: server yang sedang jalan tidak memegang alamat registry lama setelah deploy ulang
  const path = join(process.cwd(), "../../packages/contracts/deployments/latest.json");
  const mtime = statSync(path).mtimeMs;
  if (!fileCache || fileCache.mtime !== mtime) fileCache = { mtime, v: JSON.parse(readFileSync(path, "utf8")) };
  if (!fileCache.v.AttestationRegistry) throw new Error("Attestation registry is not deployed. Run ./scripts/deploy.sh.");
  return fileCache.v;
}

export const REGISTRY = {
  get address(): Address { return deployment().AttestationRegistry; },
};

export const etherscan = (a: string) => `https://sepolia.etherscan.io/address/${a}`;
export const etherscanTx = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;

// CHAIN_ID=31337 hanya untuk uji lokal (anvil); default Sepolia.
export const chain = process.env.CHAIN_ID === "31337" ? foundry : sepolia;
/** App memakai HTTP. Jika .env berisi URL WebSocket (untuk forge/cast), ubah ke HTTPS di host yang sama. */
export const rpcUrl = (process.env.SEPOLIA_RPC_URL ?? "").replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace("/ws/v3/", "/v3/");
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

export const stateName = (n: number | bigint): SeriesStatus => SERIES_STATES[Number(n)] ?? "Draft";

/** Penanda tangan yang terdaftar di registry saat ini (slot PLATFORM dan VERIFIER; COUNTERPARTY per seri). */
export async function registrySigners(series?: Address) {
  const r = (functionName: "platform" | "verifier") => publicClient.readContract({ address: REGISTRY.address, abi: attestationRegistryAbi, functionName });
  const [platform, verifier] = await Promise.all([r("platform"), r("verifier")]);
  const counterparty = series ? await publicClient.readContract({ address: REGISTRY.address, abi: attestationRegistryAbi, functionName: "counterpartyOf", args: [series] }) : null;
  return { platform, verifier, counterparty };
}

/** Ringkasan satu seri dari chain. */
export async function readSeries(series: Address) {
  const c = { address: series, abi: venueSeriesAbi } as const;
  const [state, supply, valuationIdr, refPriceIdr, lastPeriodId, holderCount, overduePeriods, openDisputes, token, treasury, params, accPerTokenE18] = await Promise.all([
    publicClient.readContract({ ...c, functionName: "state" }),
    publicClient.readContract({ ...c, functionName: "supply" }),
    publicClient.readContract({ ...c, functionName: "valuationIdr" }),
    publicClient.readContract({ ...c, functionName: "refPriceIdr" }),
    publicClient.readContract({ ...c, functionName: "lastPeriodId" }),
    publicClient.readContract({ ...c, functionName: "holderCount" }),
    publicClient.readContract({ ...c, functionName: "overduePeriods" }),
    publicClient.readContract({ ...c, functionName: "openDisputes" }),
    publicClient.readContract({ ...c, functionName: "token" }),
    publicClient.readContract({ ...c, functionName: "treasury" }),
    publicClient.readContract({ ...c, functionName: "params" }),
    publicClient.readContract({ ...c, functionName: "accPerTokenE18" }),
  ]);
  const treasuryBalance = supply > 0n ? await publicClient.readContract({ address: token, abi: seriesTokenAbi, functionName: "balanceOf", args: [treasury] }) : 0n;
  return {
    state: stateName(state), supply, valuationIdr, refPriceIdr, lastPeriodId, holderCount, overduePeriods, openDisputes, token, treasury, treasuryBalance,
    circulating: supply - treasuryBalance, accPerTokenE18,
    params: { stakeBps: params[0], spvFeeBps: params[1], maxOpexBps: params[2], sellbackDiscountBps: params[3], maxHoldingBps: params[4], lockPeriod: params[5], payoutWindow: params[6], defaultGrace: params[7], ownerSignWindow: params[8] },
  };
}
export type SeriesInfo = Awaited<ReturnType<typeof readSeries>>;

/** Saldo, lot (jumlah + waktu buka kunci), dan jatah kumulatif satu pemegang. */
export async function readHolder(series: Address, token: Address, holder: Address) {
  const [balance, unlocked, lots, claimable] = await Promise.all([
    publicClient.readContract({ address: token, abi: seriesTokenAbi, functionName: "balanceOf", args: [holder] }),
    publicClient.readContract({ address: token, abi: seriesTokenAbi, functionName: "unlockedBalanceOf", args: [holder] }),
    publicClient.readContract({ address: token, abi: seriesTokenAbi, functionName: "lotsOf", args: [holder] }),
    publicClient.readContract({ address: series, abi: venueSeriesAbi, functionName: "claimableOf", args: [holder] }),
  ]);
  return { balance, unlocked, lots: lots.map((l) => ({ amount: l.amount, unlockAt: Number(l.unlockAt) })), claimable };
}

export async function readPeriod(series: Address, periodId: number | bigint) {
  return publicClient.readContract({ address: series, abi: venueSeriesAbi, functionName: "periodOf", args: [BigInt(periodId)] });
}
