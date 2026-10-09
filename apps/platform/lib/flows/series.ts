import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWalletClient, encodeDeployData, getContractAddress, http, type Abi, type Address, type Hex } from "viem";
import { computeDailyRoot } from "@venue-rwa/connectors";
import { utcDate } from "@venue-rwa/shared";
import { privateKeyToAccount } from "viem/accounts";
import { eligibleBetween } from "@venue-rwa/connectors";
import { reconcile } from "@venue-rwa/verification";
import { ADDR, chain, publicClient, readSeries, rpcUrl, seriesAbi, tokenAbi } from "../chain";
import { posDb } from "../db";
import { audit, chainRef, needCompany, refOf, type Ctx } from "../flow";
import { operatorSend } from "../operator";
import { onchainSigners } from "../signers";

const send = (ctx: Ctx, fn: string, args: unknown[] = []) => operatorSend(chainRef(ctx).series, seriesAbi as any, fn, args);
const rp = (n: number | bigint) => "Rp" + Number(n).toLocaleString("id-ID");

async function custody(ctx: Ctx, account: string, amount: number, ref: string) {
  await ctx.pf.from("custody_ledger").insert({ series_id: ctx.series.id, account, amount, ref, simulated: true });
}

/** Artefak hasil `forge build` (ABI + bytecode). */
function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(join(process.cwd(), "../../packages/contracts/out", `${name}.sol`, `${name}.json`), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object as Hex };
}

/**
 * Deploy kontrak Series untuk satu pengajuan (token dibuat oleh konstruktor Series).
 * Gas diestimasi oleh NODE (bukan simulasi lokal Foundry, yang di Sepolia terlalu kecil) lalu diberi margin 30%.
 * Admin & operator = wallet operator platform (diungkapkan); auditor = penandatangan ke-3 (pihak independen).
 */
export async function deploySeries(ctx: Ctx, _actorEmail?: string) {
  const s = ctx.series;
  if (s.contract_address) throw new Error("Kontrak seri sudah dideploy");
  if (s.review_status !== "approved") throw new Error("Pengajuan belum disetujui. Review manusia dilakukan SEBELUM deploy (halaman Reviewer).");
  const pk = process.env.OPERATOR_PRIVATE_KEY;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY belum ada. Jalankan scripts/setup-operator.sh");
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const signers = await onchainSigners();
  const { abi, bytecode } = artifact("Series");
  const symbol = s.token_symbol ?? "SERI";
  const name = s.name ?? `${ctx.venue.name} · bagi hasil omzet`;
  const data = encodeDeployData({
    abi, bytecode,
    args: [account.address, account.address, signers[2], ADDR.attestation, name, symbol, {
      target: BigInt(s.target), minRaise: BigInt(s.min_raise), unitPrice: BigInt(s.unit_price), shareBps: s.share_bps, tenorDays: Math.round(s.tenor_days), offeringDuration: 7 * 86_400,
    }],
  });
  const gas = await publicClient.estimateGas({ account, data });
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const hash = await wallet.sendTransaction({ account, chain, data, gas: (gas * 13n) / 10n });
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success" || !rc.contractAddress) throw new Error(`Deploy gagal on-chain: ${hash}`);
  const series = rc.contractAddress as Address;
  // Token = CREATE pertama dari konstruktor Series (nonce kontrak mulai 1), jadi alamatnya deterministik.
  // Jangan membaca token() di sini: node RPC lain di belakang load balancer bisa belum melihat blok deploy ("returned no data").
  const token = getContractAddress({ from: series, nonce: 1n });
  await ctx.pf.from("series").update({ contract_address: series, token_address: token, deployed_tx: hash, name }).eq("id", s.id);
  await audit("operator", "series.deploy", { series: series, token, tx: hash, venue: ctx.venue.name });
  return { series, token, tx: hash };
}

export async function openOffering(ctx: Ctx) {
  if (ctx.series.status === "Superseded") throw new Error("Seri ini sudah digantikan seri baru");
  if (ctx.series.open_after && new Date(ctx.series.open_after) > new Date()) throw new Error(`Masa tunggu perubahan harga belum selesai (buka paling cepat ${new Date(ctx.series.open_after).toLocaleString("id-ID")})`);
  const tx = await send(ctx, "openOffering");
  await ctx.pf.from("series").update({ status: "Offering" }).eq("id", ctx.series.id);
  await ctx.pf.from("venues").update({ status: "active" }).eq("id", ctx.venue.id);
  await audit("platform", "series.open", { tx });
  return "Penawaran dibuka. Kontrak memeriksa attestation valid dan harga ≤ harga maksimal.";
}

export async function closeOffering(ctx: Ctx) {
  const tx = await send(ctx, "closeOffering");
  const s = await readSeries(chainRef(ctx));
  await ctx.pf.from("series").update({ status: s.state }).eq("id", ctx.series.id);
  if (s.state === "Funded") {
    // penanda awal periode pembukuan (tanggal efektif = penutupan penawaran)
    const { error } = await ctx.pf.from("pool_periods").upsert({ series_id: ctx.series.id, period_id: 0, final_amount: 0, pending_amount: 0, period_end: new Date().toISOString() });
    if (error) throw new Error(`${error.message} (sudah menjalankan db/migrations/0005_periods.sql?)`);
  }
  await audit("platform", "series.close", { tx, result: s.state });
  return s.state === "Funded" ? "Penawaran ditutup: Funded. Suplai terkunci; omzet setelah saat ini milik kantong investor." : `Penawaran ditutup: ${s.state}. Investor dapat refund penuh.`;
}

export async function releaseTranche(ctx: Ctx, n: 1 | 2) {
  const ref = chainRef(ctx);
  const before = (await readSeries(ref)).released;
  const tx = await send(ctx, n === 1 ? "releaseTranche1" : "releaseTranche2");
  const s = await readSeries(ref);
  const amount = Number(s.released - before);
  await custody(ctx, "escrow", -amount, `tahap-${n}`);
  await custody(ctx, "owner", amount, `tahap-${n}`);
  await ctx.pf.from("series").update({ status: s.state }).eq("id", ctx.series.id);
  await audit("platform", `series.tranche${n}`, { tx, amount });
  return `Rilis tahap ${n}: ${rp(amount)} dari escrow ke owner (kustodian simulasi)`;
}

export async function finalizePeriod(ctx: Ctx) {
  const company = needCompany(ctx);
  const s = await readSeries(chainRef(ctx));
  const { data: prev } = await ctx.pf.from("pool_periods").select("*").eq("series_id", ctx.series.id).order("period_id", { ascending: false }).limit(1).maybeSingle();
  const from = new Date(prev?.period_end ?? ctx.series.created_at);
  const now = new Date();
  const calc = await eligibleBetween(posDb(), company, from, now);
  const amount = Math.floor((calc.eligible * ctx.series.share_bps) / 10_000);
  if (amount <= 0) throw new Error("Belum ada akrual untuk difinalkan (buat & bayar booking di PoS dulu)");
  const periodId = Number(s.lastPeriod) + 1;
  const reportHash = refOf(JSON.stringify({ periodId, from, to: now, eligible: calc.eligible, amount }));
  const { error } = await ctx.pf.from("pool_periods").insert({ series_id: ctx.series.id, period_id: periodId, pending_amount: amount, final_amount: amount, period_end: now.toISOString(), eligible_revenue: calc.eligible, report_hash: reportHash });
  if (error) throw new Error(error.message);
  const tx = await send(ctx, "postPool", [BigInt(periodId), BigInt(amount), reportHash]);
  await ctx.pf.from("pool_periods").update({ posted_tx: tx }).eq("series_id", ctx.series.id).eq("period_id", periodId);
  await custody(ctx, "investor_pool", amount, `periode-${periodId}`);
  await audit("platform", "pool.post", { periodId, amount, eligible: calc.eligible, tx });
  return `Periode ${periodId} final: kantong +${rp(amount)} (${ctx.series.share_bps / 100}% × Eligible Revenue ${rp(calc.eligible)})`;
}

export async function reconcilePeriod(ctx: Ctx) {
  const company = needCompany(ctx);
  const s = await readSeries(chainRef(ctx));
  const id = Number(s.lastPeriod);
  if (id < 1) throw new Error("Belum ada periode yang difinalkan");
  const { data: cur } = await ctx.pf.from("pool_periods").select("*").eq("series_id", ctx.series.id).eq("period_id", id).single();
  const { data: prev } = await ctx.pf.from("pool_periods").select("*").eq("series_id", ctx.series.id).eq("period_id", id - 1).single();
  const calc = await eligibleBetween(posDb(), company, new Date(prev!.period_end), new Date(cur!.period_end));
  const settledIds = new Set(calc.settled.map((p) => p.bookingId));
  const unmatched = calc.entries.filter((e) => e.type === "sale" && e.bookingId && !settledIds.has(e.bookingId)).map((e) => e.bookingId!);
  const refs = new Map<string, string>();
  if (unmatched.length) {
    const { data } = await posDb().from("bookings").select("id, customer_ref").in("id", unmatched);
    (data ?? []).forEach((r) => refs.set(r.id, r.customer_ref));
  }
  const rec = reconcile({ companyId: company, entries: calc.entries, settled: calc.settled, customerRefs: refs });
  const clean = rec.exceptions.length === 0;
  const tx = await send(ctx, "reconcilePeriod", [BigInt(id), clean, refOf(JSON.stringify(rec.exceptions))]);
  await ctx.pf.from("pool_periods").update({ reconciled: clean }).eq("series_id", ctx.series.id).eq("period_id", id);
  if (!clean) {
    await ctx.pf.from("recon_exceptions").insert(rec.exceptions.map((e) => ({ series_id: ctx.series.id, pos_company_id: company, date: e.date, kind: e.kind, amount: e.amount, explained: false })));
  }
  await audit("platform", "pool.reconcile", { periodId: id, clean, exceptions: rec.exceptions.length, tx });
  return clean ? `Periode ${id} terekonsiliasi BERSIH: rilis tahap 2 boleh.` : `Periode ${id}: ${rec.exceptions.length} exception (${rp(rec.unmatchedTotal)} tanpa settlement PSP). Rilis tahap 2 ditahan.`;
}

export async function approveRedeem(ctx: Ctx, id: bigint) {
  const ref = chainRef(ctx);
  await send(ctx, "approveRedeem", [id]);
  const r: any = await publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "redeems", args: [id] });
  await ctx.pf.from("redeem_requests").update({ status: "approved", payout: Number(r[2]) }).eq("series_id", ctx.series.id).eq("onchain_id", Number(id));
  return `Redeem #${id} disetujui: kustodian diminta membayar ${rp(r[2])}`;
}

export async function confirmRedeem(ctx: Ctx, id: bigint) {
  const ref = chainRef(ctx);
  const r: any = await publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "redeems", args: [id] });
  await send(ctx, "confirmRedeem", [id]);
  await custody(ctx, "investor_pool", -Number(r[2]), `redeem-${id}`);
  await custody(ctx, "redeem_payout", Number(r[2]), `redeem-${id}`);
  await ctx.pf.from("redeem_requests").update({ status: "paid" }).eq("series_id", ctx.series.id).eq("onchain_id", Number(id));
  const s = await readSeries(ref);
  await ctx.pf.from("series").update({ status: s.state }).eq("id", ctx.series.id);
  return `Redeem #${id} dibayar (simulasi): token dibakar${s.state === "Closed" ? ". Semua token terbakar: seri Closed, split dimatikan." : ""}`;
}

export async function failRedeem(ctx: Ctx, id: bigint) {
  await send(ctx, "failRedeem", [id]);
  await ctx.pf.from("redeem_requests").update({ status: "failed" }).eq("series_id", ctx.series.id).eq("onchain_id", Number(id));
  return `Redeem #${id} gagal dibayar: token dibuka kuncinya, angka kantong dikembalikan`;
}

export async function endTenor(ctx: Ctx) {
  await send(ctx, "endTenor");
  await ctx.pf.from("series").update({ status: "Closed" }).eq("id", ctx.series.id);
  return "Tenor berakhir: seri Closed, split dimatikan. Sisa kantong dibagi lewat redeem.";
}


/** Refund penuh saat penawaran GAGAL (minimum raise tidak tercapai): token dibakar, kustodian (simulasi) mengembalikan rupiah. */
export async function refundHolder(ctx: Ctx, wallet: Address) {
  const ref = chainRef(ctx);
  const s = await readSeries(ref);
  if (s.state !== "Failed") throw new Error("Refund hanya tersedia bila penawaran gagal (minimum raise tidak tercapai)");
  const bal = (await publicClient.readContract({ address: ref.token, abi: tokenAbi, functionName: "balanceOf", args: [wallet] })) as bigint;
  if (bal === 0n) throw new Error("Tidak ada token untuk direfund (mungkin sudah direfund)");
  const amount = Number(bal * s.unitPrice);
  const tx = await send(ctx, "refund", [wallet]);
  await ctx.pf.from("purchases").update({ refunded_at: new Date().toISOString(), refund_tx: tx }).eq("series_id", ctx.series.id).eq("wallet", wallet).eq("status", "minted").is("refunded_at", null);
  await custody(ctx, "escrow", -amount, `refund-${wallet.slice(0, 8)}`);
  await custody(ctx, "refund", amount, `refund-${wallet.slice(0, 8)}`);
  await audit("platform", "series.refund", { wallet, amount, tx });
  return `Refund ${rp(amount)} diproses: token dibakar dan dana dikembalikan ke investor (kustodian simulasi).`;
}

/** Staf menjelaskan satu exception (mis. pembayaran tunai yang sah). Tidak mengubah angka on-chain; lihat confirmPeriodClean. */
export async function explainException(ctx: Ctx, exceptionId: string, by: string, explanation: string) {
  if (explanation.trim().length < 10) throw new Error("Penjelasan minimal 10 karakter");
  const { error } = await ctx.pf.from("recon_exceptions").update({ explained: true, explained_by: by, explanation: explanation.trim(), explained_at: new Date().toISOString() }).eq("id", exceptionId).eq("series_id", ctx.series.id);
  if (error) throw new Error(error.message);
  await audit(by, "exception.explain", { exceptionId });
  return "Exception ditandai sudah dijelaskan.";
}

/**
 * Setelah SEMUA exception seri ini dijelaskan, tandai periode yang sebelumnya tidak bersih sebagai bersih on-chain
 * (hash penjelasan ikut dicatat) supaya rilis tahap 2 bisa dilakukan.
 */
export async function confirmPeriodClean(ctx: Ctx) {
  const { data: open } = await ctx.pf.from("recon_exceptions").select("id").eq("series_id", ctx.series.id).eq("explained", false);
  if (open?.length) throw new Error(`Masih ada ${open.length} exception yang belum dijelaskan`);
  const { data: bad } = await ctx.pf.from("pool_periods").select("period_id").eq("series_id", ctx.series.id).eq("reconciled", false).order("period_id");
  if (!bad?.length) throw new Error("Tidak ada periode yang perlu dikonfirmasi");
  const { data: why } = await ctx.pf.from("recon_exceptions").select("id, explanation, explained_by").eq("series_id", ctx.series.id);
  const hash = refOf(JSON.stringify(why));
  for (const p of bad) {
    await send(ctx, "reconcilePeriod", [BigInt(p.period_id), true, hash]);
    await ctx.pf.from("pool_periods").update({ reconciled: true }).eq("series_id", ctx.series.id).eq("period_id", p.period_id);
  }
  await audit("platform", "pool.confirmClean", { periods: bad.map((p) => p.period_id) });
  return `Periode ${bad.map((p) => p.period_id).join(", ")} dikonfirmasi bersih setelah penjelasan exception. Rilis tahap 2 boleh dilakukan bila syarat lain terpenuhi.`;
}

/** Hitung Merkle root untuk setiap hari (UTC, sebelum hari ini) yang punya entri ledger tetapi belum punya root. */
export async function computeMissingRoots(ctx: Ctx) {
  const company = needCompany(ctx);
  const db = posDb();
  const dates = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("ledger_entries").select("created_at").eq("company_id", company).order("seq").range(from, from + 999);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => dates.add(utcDate(r.created_at)));
    if (!data || data.length < 1000) break;
  }
  const { data: have } = await db.from("daily_roots").select("date").eq("company_id", company);
  const done = new Set((have ?? []).map((r) => r.date as string));
  const today = utcDate(new Date().toISOString());
  const todo = [...dates].filter((d) => d < today && !done.has(d)).sort();
  for (const d of todo) await computeDailyRoot(db, company, d);
  return todo.length ? `${todo.length} root harian baru dihitung.` : "Semua hari yang sudah lewat sudah punya root.";
}

/** Owner menarik bagian dari saldo owner di kustodian (simulasi). */
export async function ownerAvailable(ctx: Ctx) {
  const { data } = await ctx.pf.from("custody_ledger").select("amount").eq("series_id", ctx.series.id).eq("account", "owner");
  return (data ?? []).reduce((a, r) => a + Number(r.amount), 0);
}
export async function ownerWithdraw(ctx: Ctx, requestedBy: string, amount: number) {
  const avail = await ownerAvailable(ctx);
  if (!Number.isInteger(amount) || amount < 1) throw new Error("Jumlah penarikan tidak valid");
  if (amount > avail) throw new Error(`Saldo tersedia hanya ${rp(avail)}`);
  const { error } = await ctx.pf.from("owner_payouts").insert({ series_id: ctx.series.id, amount, requested_by: requestedBy });
  if (error) throw new Error(error.message);
  await custody(ctx, "owner", -amount, "penarikan-owner");
  await audit("owner", "owner.withdraw", { series: ctx.series.id, amount });
  return `Penarikan ${rp(amount)} diproses ke rekening owner (kustodian simulasi).`;
}
