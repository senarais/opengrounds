import { createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, publicClient, rpcUrl } from "./chain";

/** SERVER ONLY. Wallet operator platform (hot wallet testnet). */
function account() {
  const k = process.env.OPERATOR_PRIVATE_KEY;
  if (!k) throw new Error("OPERATOR_PRIVATE_KEY belum ada di .env. Jalankan scripts/setup-operator.sh");
  return privateKeyToAccount((k.startsWith("0x") ? k : `0x${k}`) as Hex);
}

export const operatorAddress = () => account().address;

export async function operatorSend(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<Hex> {
  const acct = account();
  const wallet = createWalletClient({ account: acct, chain, transport: http(rpcUrl) });
  // simulasi dulu supaya revert reason kontrak (mis. NoValidAttestation) muncul sebagai pesan jelas
  const { request } = await publicClient.simulateContract({ account: acct, address, abi, functionName, args } as any);
  const hash = await wallet.writeContract(request as any);
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`Transaksi gagal on-chain: ${hash}`);
  return hash;
}

/** Terjemahan nama error kontrak yang paling sering muncul di alur pengguna. */
const ERR_ID: Record<string, string> = {
  TransferNotOpen: "token baru bisa dikirim setelah penawaran berhasil (status Funded/Aktif)",
  SelfTransfer: "tidak bisa mengirim ke wallet sendiri",
  NoValidAttestation: "belum ada attestation yang valid (belum disetujui, kedaluwarsa, atau dicabut)",
  PriceAboveMax: "harga token melebihi harga maksimal di attestation",
  OfferingNotEnded: "penawaran belum bisa ditutup (waktu belum habis dan belum terjual habis)",
  OfferingEnded: "masa penawaran sudah berakhir",
  CapExceeded: "melebihi suplai maksimum token",
  PeriodNotClean: "periode pertama belum terekonsiliasi bersih",
  ExceptionIsOpen: "ada exception terbuka dari auditor",
  Tranche1First: "rilis tahap 1 harus lebih dulu",
  AlreadyReleased: "dana tahap ini sudah dirilis",
  NotAllowlisted: "wallet belum lolos KYC (allowlist)",
  TransfersLocked: "token tidak dapat dipindahtangankan",
  BadPeriod: "nomor periode tidak berurutan",
  NotHead: "antrian redeem harus diproses berurutan (FIFO)",
  ZeroPayout: "nilai tebus masih nol (kantong belum terisi)",
  InsufficientBalance: "saldo token (di luar yang terkunci) tidak cukup",
  WrongState: "status seri tidak sesuai untuk aksi ini",
  NotEnoughSignatures: "tanda tangan penandatangan belum cukup",
  IndependentRequired: "persetujuan wajib memuat tanda tangan pihak independen (auditor luar)",
  SignersNotAscending: "urutan alamat penandatangan harus naik",
  NotSigner: "bukan penandatangan terdaftar",
  BadNonce: "nonce attestation tidak cocok",
  Expired: "sudah kedaluwarsa",
  TenorNotEnded: "tenor belum berakhir",
  TenorEnded: "tenor sudah berakhir",
  PaymentRefReused: "referensi pembayaran sudah dipakai",
  RootAlreadyAnchored: "root hari itu sudah di-anchor",
  BadSignature: "tanda tangan tidak valid atau sudah dipakai (nonce)",
  SignatureExpired: "tanda tangan sudah kedaluwarsa",
  NotAuditor: "hanya pihak independen (auditor) yang boleh melakukan ini",
};

export function friendlyError(e: any): string {
  const m: string = e?.shortMessage ?? e?.message ?? String(e);
  const name: string | undefined = e?.cause?.data?.errorName ?? e?.data?.errorName ?? e?.cause?.cause?.data?.errorName ?? m.match(/reverted with the following reason:\s*(.+)/)?.[1] ?? m.match(/\b(?:Error|error):?\s+([A-Z][A-Za-z]+)\(/)?.[1];
  if (name) return `Kontrak menolak: ${ERR_ID[name] ?? name}`;
  return m.split("\n")[0]!;
}
