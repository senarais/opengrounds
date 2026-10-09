import { keccak256, toHex, concat, stringToBytes, type Hex } from "viem";

export const ZERO_HASH: Hex = `0x${"00".repeat(32)}`;

export interface HashableEntry {
  id: string;
  companyId: string;
  type: string;
  amount: number;
  bookingId: string | null;
  createdAt: string;
}

/** Hash entri ledger = keccak256(prevHash || kanonik(entri)). Mengubah entri lama memutus rantai. */
export function ledgerEntryHash(prevHash: Hex, e: HashableEntry): Hex {
  const canonical = [e.id, e.companyId, e.type, String(e.amount), e.bookingId ?? "", e.createdAt].join("|");
  return keccak256(concat([prevHash, toHex(stringToBytes(canonical))]));
}

/** Cek rantai: kembalikan indeks entri pertama yang rusak, atau -1 jika utuh. */
export function verifyHashChain(entries: Array<HashableEntry & { prevHash: Hex; hash: Hex }>, genesis: Hex = ZERO_HASH): number {
  let prev = genesis;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.prevHash !== prev || ledgerEntryHash(prev, e) !== e.hash) return i;
    prev = e.hash;
  }
  return -1;
}

function hashPair(a: Hex, b: Hex): Hex {
  // sorted-pair, kompatibel dengan OpenZeppelin MerkleProof
  return BigInt(a) <= BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

/** Merkle root dari daftar leaf (hash entri). Node ganjil dinaikkan apa adanya. Kosong => ZERO_HASH. */
export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return ZERO_HASH;
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i]!, level[i + 1]!) : level[i]!);
    }
    level = next;
  }
  return level[0]!;
}

export function merkleProof(leaves: Hex[], index: number): Hex[] {
  if (index < 0 || index >= leaves.length) throw new Error("index di luar jangkauan");
  const proof: Hex[] = [];
  let level = [...leaves];
  let idx = index;
  while (level.length > 1) {
    const sibling = idx ^ 1;
    if (sibling < level.length) proof.push(level[sibling]!);
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i]!, level[i + 1]!) : level[i]!);
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyMerkleProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h === root;
}

/** customer_ref: hash referensi pelanggan dengan salt, supaya tidak ada data pribadi. */
export function customerRef(rawRef: string, salt: string): Hex {
  return keccak256(toHex(stringToBytes(`${salt}:${rawRef}`)));
}

/** Tanggal UTC (YYYY-MM-DD) dari timestamp ISO. Dipakai untuk pengelompokan root harian. */
export function utcDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
