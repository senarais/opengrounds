import { createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attestationRegistryAbi, chain, publicClient, rpcUrl, seriesTokenAbi, venueSeriesAbi } from "./chain";

/** Error kontrak lain (registry, token) yang bisa muncul dari panggilan ke seri: dimasukkan ke ABI supaya revert terbaca namanya. */
const EXTRA_ERRORS = [...attestationRegistryAbi, ...seriesTokenAbi, ...venueSeriesAbi].filter((i: any) => i.type === "error") as unknown as Abi;
const withErrors = (abi: Abi): Abi => [...abi, ...EXTRA_ERRORS.filter((e: any) => !(abi as any[]).some((a) => a.type === "error" && a.name === e.name))];

/**
 * SERVER ONLY. Kunci backend Open Grounds (hot wallet testnet; production: KMS/HSM [Roadmap]):
 *  - CONTROLLER + ADMIN seri: mengeksekusi alokasi/jual balik/periode yang sudah ditandatangani pihak lain, membayar gas
 *  - ATTESTOR_PLATFORM: satu dari tiga slot attestation (tidak pernah cukup sendirian)
 */
const key = (name: string, fallback?: string) => {
  const k = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!k) throw new Error(`${name} belum ada di .env. Jalankan scripts/setup-operator.sh`);
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
  if (rc.status !== "success") throw new Error(`Transaksi gagal on-chain: ${hash}`);
  return hash;
}

/** Simulasikan panggilan tanpa mengirim (dipakai demo "platform curang ditolak"): kembalikan nama error kontrak bila ditolak. */
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
  if (rc.status !== "success" || !rc.contractAddress) throw new Error(`Deploy gagal on-chain: ${hash}`);
  return { address: rc.contractAddress, tx: hash };
}

/** Tanda tangan slot PLATFORM atas digest attestation (typed data). */
export async function platformSignTyped(args: { domain: any; types: any; primaryType: string; message: any }): Promise<Hex> {
  return platformSigner().signTypedData(args);
}

/** Terjemahan error kontrak yang muncul di alur pengguna. */
const ERR_ID: Record<string, string> = {
  WrongState: "status seri tidak sesuai untuk aksi ini",
  BadParams: "parameter tidak valid",
  BadPrice: "nominal tidak sama dengan jumlah token × harga referensi",
  BadPeriod: "nomor atau tanggal periode tidak berurutan",
  DeductionsExceedGross: "total potongan melebihi omzet kotor",
  OpexAboveCap: "biaya operasional melebihi plafon seri",
  ItemDisputed: "item ini sedang disengketakan",
  OrderUsed: "pesanan/permintaan ini sudah pernah dieksekusi",
  LengthMismatch: "jumlah pesanan dan tanda tangan tidak sama",
  BadInvestorSignature: "tanda tangan investor tidak valid untuk pesanan ini",
  OrderExpired: "pesanan sudah kedaluwarsa",
  NotVerified: "wallet belum terverifikasi (KYC/allowlist)",
  IsFrozen: "wallet sedang dibekukan",
  InsufficientTreasury: "token di treasury tidak cukup",
  HoldingCapExceeded: "melebihi batas kepemilikan per investor",
  ExceedsOwed: "pembayaran melebihi kewajiban periode",
  NotOverdueYet: "tenggat belum lewat",
  NothingOwed: "tidak ada kewajiban yang tertunggak",
  NotAttestor: "bukan penanda tangan terdaftar",
  NotDisputed: "item ini tidak sedang disengketakan",
  AlreadyDisputed: "item ini sudah disengketakan",
  UnsettledPeriods: "masih ada periode yang belum dilunasi",
  LockedTokens: "token masih dalam masa kunci",
  TransfersRestricted: "token tidak bisa dipindahkan langsung (hanya lewat kontrak seri)",
  NotRegisteredSeries: "seri belum terdaftar di registry",
  Expired: "attestation sudah kedaluwarsa",
  AlreadyUsed: "attestation ini sudah dipakai",
  UnknownSigner: "penanda tangan tidak dikenal registry",
  SlotNotAllowed: "penanda tangan ini tidak berhak untuk jenis attestation ini",
  DuplicateSlot: "dua tanda tangan dari slot yang sama",
  NotEnoughSignatures: "tanda tangan kurang dari 2",
  PlatformRequired: "tanda tangan platform wajib ada",
  AccessControlUnauthorizedAccount: "wallet ini tidak punya peran untuk aksi ini",
  ECDSAInvalidSignature: "tanda tangan tidak valid",
};

export function friendlyError(e: any): string {
  const m: string = e?.shortMessage ?? e?.message ?? String(e);
  const name: string | undefined = e?.cause?.data?.errorName ?? e?.data?.errorName ?? e?.cause?.cause?.data?.errorName ?? m.match(/reverted with the following reason:\s*(.+)/)?.[1] ?? m.match(/\b(?:Error|error):?\s+([A-Z][A-Za-z]+)\(/)?.[1];
  if (name) return `Kontrak menolak: ${ERR_ID[name] ?? name}`;
  return m.split("\n")[0]!;
}
export const errorName = (e: any): string | undefined => e?.cause?.data?.errorName ?? e?.data?.errorName ?? e?.cause?.cause?.data?.errorName;
