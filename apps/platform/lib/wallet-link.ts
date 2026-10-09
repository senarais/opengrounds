import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

export const linkMessage = (authId: string, at = new Date()) => `Hubungkan wallet ke OpenGrounds\nAkun: ${authId}\nWaktu: ${at.toISOString()}`;

/** Verifikasi bukti kepemilikan wallet: pesan terikat ke akun dan waktu (≤ 10 menit), ditandatangani wallet itu. Lempar Error bila tidak valid. */
export async function verifyWalletLink(authId: string, address: string, message: string, signature: Hex, now = Date.now()): Promise<Address> {
  if (!isAddress(address)) throw new Error("Alamat wallet tidak valid");
  const m = message.match(/^Hubungkan wallet ke OpenGrounds\nAkun: (\S+)\nWaktu: (\S+)$/);
  if (!m || m[1] !== authId) throw new Error("Pesan tidak valid");
  if (Math.abs(now - Date.parse(m[2]!)) > 10 * 60_000) throw new Error("Pesan kedaluwarsa, ulangi");
  if (!(await verifyMessage({ address: getAddress(address), message, signature }))) throw new Error("Tanda tangan tidak cocok dengan wallet");
  return getAddress(address);
}
