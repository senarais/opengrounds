import { randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";
import { publicClient, readSeries, seriesAbi, tokenAbi } from "../chain";
import { platformDb } from "../db";
import { audit, chainRef, refOf, type Ctx } from "../flow";
import { operatorSend } from "../operator";

const rp = (n: number | bigint) => "Rp" + Number(n).toLocaleString("id-ID");
const send = (ctx: Ctx, fn: string, args: unknown[] = []) => operatorSend(chainRef(ctx).series, seriesAbi as any, fn, args);

/** KYC MOCK (simulasi, dilabeli): platform menyimpan status terikat wallet, bukan KTP/selfie. Berlaku lintas seri. */
export async function mockKyc(wallet: string) {
  const { error } = await platformDb().from("kyc_status").upsert({ wallet, status: "verified", tier: 1, verified_at: new Date().toISOString(), simulated: true, vendor_ref: "MOCK-KYC" });
  if (error) throw new Error(error.message);
}

export async function isKycVerified(wallet: string) {
  const { data } = await platformDb().from("kyc_status").select("status").eq("wallet", wallet).maybeSingle();
  return data?.status === "verified";
}

/** Daftarkan wallet ke allowlist token seri ini (hanya bila KYC platform sudah verified). */
export async function allowOnchain(ctx: Ctx, wallet: Address) {
  const ref = chainRef(ctx);
  if (!(await isKycVerified(wallet))) throw new Error("Selesaikan KYC di halaman Portofolio dulu.");
  const allowed = (await publicClient.readContract({ address: ref.token, abi: tokenAbi, functionName: "allowed", args: [wallet] })) as boolean;
  if (!allowed) await send(ctx, "setKyc", [wallet, true]);
}

/** Beli token: rupiah SIMULASI masuk escrow kustodian, lalu Series mint token ke wallet investor. */
export async function purchase(ctx: Ctx, wallet: Address, units: number, who = wallet.slice(0, 8)) {
  const ref = chainRef(ctx);
  if (ctx.series.status === "Superseded") throw new Error("Seri ini sudah digantikan seri baru; beli di penawaran terbaru");
  let s = await readSeries(ref);
  // node RPC bisa tertinggal beberapa detik setelah attestation/pembukaan: baca ulang sekali sebelum menolak
  if (s.state === "Offering" && !s.attValid) { await new Promise((r) => setTimeout(r, 2500)); s = await readSeries(ref); }
  if (s.state !== "Offering") throw new Error(`Penawaran tidak sedang dibuka (status ${s.state})`);
  if (!s.attValid) throw new Error("Attestation tidak valid: pembelian ditolak (bila baru saja dibuka, tunggu beberapa detik lalu coba lagi)");
  if (!Number.isInteger(units) || units < 1) throw new Error("Jumlah token minimal 1");
  if (BigInt(units) + s.minted > s.cap) throw new Error(`Melebihi cap: sisa ${(s.cap - s.minted).toString()} token`);
  await allowOnchain(ctx, wallet);
  const amount = units * Number(s.unitPrice);
  const payRef: Hex = refOf(`SIM-PAY-${randomUUID()}`);
  const { error } = await ctx.pf.from("purchases").insert({ series_id: ctx.series.id, wallet, units, amount, payment_ref: payRef, related_party: false, simulated: true });
  if (error) throw new Error(error.message);
  await ctx.pf.from("custody_ledger").insert({ series_id: ctx.series.id, account: "escrow", amount, ref: `beli-${who}`, simulated: true });
  const tx = await send(ctx, "recordPurchase", [wallet, BigInt(units), payRef, false]);
  await ctx.pf.from("purchases").update({ mint_tx: tx, custody_confirmed_at: new Date().toISOString() }).eq("payment_ref", payRef);
  await audit("platform", "purchase", { series: ctx.series.id, wallet, units, amount, tx });
  return { amount, tx };
}

export async function buy(ctx: Ctx, wallet: Address, units: number) {
  const r = await purchase(ctx, wallet, units);
  const closed = await (await import("./series")).closeIfSoldOut(ctx.series.id).catch(() => null);
  return `Pembelian ${units} token berhasil (${rp(r.amount)}, rupiah simulasi → escrow → token di-mint ke wallet Anda).${closed ? ` Semua token terjual: ${closed}` : ""}`;
}

/** Permintaan redeem yang sudah DITANDATANGANI holder (EIP-712, tanpa gas); kontrak memverifikasi tanda tangan dan nonce. */
export async function requestRedeemSigned(ctx: Ctx, wallet: Address, units: bigint, deadline: bigint, signature: Hex) {
  const ref = chainRef(ctx);
  await send(ctx, "requestRedeemFor", [wallet, units, deadline, signature]);
  const s = await readSeries(ref);
  await ctx.pf.from("redeem_requests").insert({ series_id: ctx.series.id, onchain_id: Number(s.nextRedeemId), wallet, units: Number(units), status: "pending", simulated: true });
  return `Permintaan redeem ${units} token diajukan. Token terkunci menunggu kustodian membayar.`;
}

/**
 * Kirim token ke pemegang ber-KYC lain. Pengirim menandatangani (EIP-712, tanpa gas); operator meneruskan.
 * Penerima harus sudah lolos KYC di platform. Pembayaran antar pihak (jika ada) terjadi di luar platform: platform tidak menetapkan harga.
 */
export async function transferSigned(ctx: Ctx, from: Address, to: Address, units: bigint, deadline: bigint, signature: Hex) {
  const ref = chainRef(ctx);
  if (from.toLowerCase() === to.toLowerCase()) throw new Error("Tidak bisa mengirim ke wallet sendiri");
  if (!(await isKycVerified(to))) throw new Error("Wallet penerima belum lolos KYC di platform");
  await allowOnchain(ctx, to);
  const tx = await send(ctx, "transferFor", [from, to, units, deadline, signature]);
  await ctx.pf.from("token_transfers").insert({ series_id: ctx.series.id, from_wallet: from, to_wallet: to, units: Number(units), tx });
  await audit("platform", "token.transfer", { series: ctx.series.id, from, to, units: Number(units), tx });
  return `${units} token terkirim ke ${to.slice(0, 8)}… (tx ${tx.slice(0, 12)}…).`;
}
