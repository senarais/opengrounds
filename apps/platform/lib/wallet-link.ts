import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

export const linkMessage = (authId: string, at = new Date()) => `Link your wallet to Open Grounds\nAccount: ${authId}\nTime: ${at.toISOString()}`;

/** Verify wallet ownership with a signed account/time-bound message (10-minute window). */
export async function verifyWalletLink(authId: string, address: string, message: string, signature: Hex, now = Date.now()): Promise<Address> {
  if (!isAddress(address)) throw new Error("Invalid wallet address.");
  const m = message.match(/^Link your wallet to Open Grounds\nAccount: (\S+)\nTime: (\S+)$/);
  if (!m || m[1] !== authId) throw new Error("Invalid wallet-link message.");
  if (Math.abs(now - Date.parse(m[2]!)) > 10 * 60_000) throw new Error("Message expired. Try again.");
  if (!(await verifyMessage({ address: getAddress(address), message, signature }))) throw new Error("Signature does not match this wallet.");
  return getAddress(address);
}
