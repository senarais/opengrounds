import { createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attestationRegistryAbi, chain, publicClient, rpcUrl, seriesTokenAbi, venueSeriesAbi } from "./chain";

/** Error kontrak lain (registry, token) yang bisa muncul dari panggilan ke seri: dimasukkan ke ABI supaya revert terbaca namanya. */
const EXTRA_ERRORS = [...attestationRegistryAbi, ...seriesTokenAbi, ...venueSeriesAbi].filter((i: any) => i.type === "error") as unknown as Abi;
const withErrors = (abi: Abi): Abi => [...abi, ...EXTRA_ERRORS.filter((e: any) => !(abi as any[]).some((a) => a.type === "error" && a.name === e.name))];

/**
 * SERVER ONLY. Open Grounds backend testnet keys (KMS/HSM is a production roadmap item):
 *  - CONTROLLER + ADMIN seri: mengeksekusi alokasi/jual balik/periode yang sudah ditandatangani pihak lain, membayar gas
 *  - ATTESTOR_PLATFORM: satu dari tiga slot attestation (tidak pernah cukup sendirian)
 */
const key = (name: string, fallback?: string) => {
  const k = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!k) throw new Error(`${name} is missing from .env. Run scripts/setup-operator.sh.`);
  return privateKeyToAccount((k.startsWith("0x") ? k : `0x${k}`) as Hex);
};
const controller = () => key("OPERATOR_PRIVATE_KEY");
const platformSigner = () => key("ATTESTOR_PLATFORM_PRIVATE_KEY", "OPERATOR_PRIVATE_KEY");

export const operatorAddress = () => controller().address;
export const platformAttestorAddress = () => platformSigner().address;
/** Treasury Grounds (pemegang token yang belum terjual). Default: wallet operator. */
export const treasuryAddress = () => (process.env.TREASURY_ADDRESS as Address | undefined) ?? controller().address;

export async function operatorSend(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<Hex> {
  const acct = controller();
  const wallet = createWalletClient({ account: acct, chain, transport: http(rpcUrl) });
  // simulasi dulu supaya revert reason kontrak muncul sebagai pesan jelas
  const { request } = await publicClient.simulateContract({ account: acct, address, abi: withErrors(abi), functionName, args } as any);
  const hash = await wallet.writeContract(request as any);
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`On-chain transaction failed: ${hash}`);
  return hash;
}

/** Simulate a contract call without broadcasting it; return the contract error when rejected. */
export async function operatorTry(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await publicClient.simulateContract({ account: controller(), address, abi: withErrors(abi), functionName, args } as any);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export async function operatorDeploy(abi: Abi, bytecode: Hex, args: unknown[]): Promise<{ address: Address; tx: Hex }> {
  const account = controller();
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  // gas diestimasi node (bukan simulasi lokal) lalu diberi margin 30%
  const { encodeDeployData } = await import("viem");
  const data = encodeDeployData({ abi, bytecode, args });
  const gas = await publicClient.estimateGas({ account, data });
  const hash = await wallet.sendTransaction({ account, chain, data, gas: (gas * 13n) / 10n });
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success" || !rc.contractAddress) throw new Error(`On-chain deployment failed: ${hash}`);
  return { address: rc.contractAddress, tx: hash };
}

/** Tanda tangan slot PLATFORM atas digest attestation (typed data). */
export async function platformSignTyped(args: { domain: any; types: any; primaryType: string; message: any }): Promise<Hex> {
  return platformSigner().signTypedData(args);
}

/** Contract errors shown in user-facing flows. */
const ERR_ID: Record<string, string> = {
  WrongState: "The series is not in a state that allows this action.",
  BadParams: "One or more parameters are invalid.",
  BadPrice: "The payment does not equal token quantity × reference price.",
  BadPeriod: "The period number or date is out of sequence.",
  DeductionsExceedGross: "Total deductions exceed gross revenue.",
  OpexAboveCap: "Operating expenses exceed the series limit.",
  ItemDisputed: "This item is disputed.",
  OrderUsed: "This order or request has already been executed.",
  LengthMismatch: "The order and signature counts do not match.",
  BadInvestorSignature: "The investor signature is invalid for this order.",
  OrderExpired: "This order has expired.",
  NotVerified: "This wallet is not verified or allowlisted.",
  IsFrozen: "This wallet is frozen.",
  InsufficientTreasury: "The treasury does not hold enough tokens.",
  HoldingCapExceeded: "This exceeds the investor holding limit.",
  ExceedsOwed: "Payment exceeds the period obligation.",
  NotOverdueYet: "The deadline has not passed.",
  NothingOwed: "No outstanding obligation is due.",
  NotAttestor: "This wallet is not a registered signer.",
  NotDisputed: "This item is not disputed.",
  AlreadyDisputed: "This item is already disputed.",
  UnsettledPeriods: "Some periods remain unsettled.",
  LockedTokens: "These tokens are still locked.",
  TransfersRestricted: "Tokens cannot be transferred directly; use the series contract.",
  NotRegisteredSeries: "This series is not registered.",
  Expired: "This attestation has expired.",
  AlreadyUsed: "This attestation has already been used.",
  UnknownSigner: "This wallet is not recognized by the registry.",
  SlotNotAllowed: "This signer is not allowed for this attestation type.",
  DuplicateSlot: "Two signatures came from the same signer slot.",
  NotEnoughSignatures: "At least two signatures are required.",
  PlatformRequired: "A platform signature is required.",
  AccessControlUnauthorizedAccount: "This wallet does not have permission for this action.",
  ECDSAInvalidSignature: "The signature is invalid.",
};

export function friendlyError(e: any): string {
  const m: string = e?.shortMessage ?? e?.message ?? String(e);
  const name: string | undefined = e?.cause?.data?.errorName ?? e?.data?.errorName ?? e?.cause?.cause?.data?.errorName ?? m.match(/reverted with the following reason:\s*(.+)/)?.[1] ?? m.match(/\b(?:Error|error):?\s+([A-Z][A-Za-z]+)\(/)?.[1];
  if (name) return `Contract rejected the action: ${ERR_ID[name] ?? name}`;
  return m.split("\n")[0]!;
}
export const errorName = (e: any): string | undefined => e?.cause?.data?.errorName ?? e?.data?.errorName ?? e?.cause?.cause?.data?.errorName;
