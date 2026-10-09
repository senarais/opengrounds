import { encodeAbiParameters, getAddress, keccak256, type Address, type Hex } from "viem";
import { DEMO_PARAMS, bps, canonicalJson, checkWaterfall, merkleRoot, splitOf, waterfall, type Waterfall } from "@venue-rwa/shared";
import { publicClient, readPeriod, readSeries, seriesTokenAbi, venueSeriesAbi } from "../chain";
import { platformDb, posDb } from "../db";
import { evidenceHashOf, periodPayload, toChainWaterfall } from "../eip712";
import { audit, getSeries, moveCash, needContract } from "../flow";
import { operatorSend } from "../operator";
import { provider, providerFor } from "../psp";
import { addSignature, createAttestation, isReady, markSubmitted, signAsPlatform, sigsOf } from "./attest";

/**
 * Siklus bulanan (§3.6). Demo: periode ditutup kapan saja oleh operator (production: akhir bulan).
 *   1. split harian s% dari tiap pembayaran booking yang settle → kantong SPV (MockPaymentProvider, sandbox)
 *   2. tutup periode: waterfall dari ledger PoS + biaya yang diajukan owner → attestation REVENUE_PERIOD, PLATFORM menandatangani
 *   3. owner menandatangani angka (atau mengajukan sengketa); bila owner diam melewati jendela, VERIFIER boleh menggantikan
 *   4. posting on-chain: kontrak menghitung ulang waterfall, jatah per token, dan kewajiban
 *   5. koreksi akhir bulan (true-up) kantong vs P_SPV; kekurangan dibayar owner lewat gateway
 *   6. dana jatah ke rekening distribusi → kredit saldo investor → settlePayout (tidak bisa melebihi kewajiban)
 */
export const PERIOD_STATUS_LABEL: Record<string, string> = {
  awaiting_owner: "Menunggu tanda tangan owner", disputed: "Disengketakan", posted: "Diposting on-chain", awaiting_topup: "Menunggu kekurangan dari owner", paid: "Jatah sudah dikreditkan",
};
const ATT_WINDOW_DAYS = 10;
const TOPUP_SECONDS = 24 * 3600;

// ---------------------------------------------------------------- 1. split di sumber

/** Tarik pembayaran booking yang sudah settle di PoS dan catat split-nya (idempoten per pembayaran). Hanya sejak seri aktif. */
export async function ingestSplits(seriesId: string) {
  const ctx = await getSeries(seriesId);
  const companyId = ctx.venue.pos_company_id;
  if (!companyId || !["Active", "Disputed", "Overdue", "Defaulted"].includes(ctx.series.status)) return 0;
  const { data: att } = await platformDb().from("attestations").select("created_at").eq("series_id", seriesId).eq("kind", "ACQUISITION_CLOSED").eq("status", "submitted").maybeSingle();
  const since = att?.created_at ?? ctx.series.created_at;
  const { data: pays } = await posDb().from("payments").select("id, gross, settled_at").eq("company_id", companyId).in("status", ["settled", "refunded"]).gte("settled_at", since);
  if (!pays?.length) return 0;
  const { data: done } = await platformDb().from("split_events").select("pos_payment_id").in("pos_payment_id", pays.map((p) => p.id));
  const seen = new Set((done ?? []).map((d) => d.pos_payment_id));
  let n = 0;
  for (const p of pays.filter((x) => !seen.has(x.id))) {
    const sp = splitOf(Number(p.gross), ctx.series.split_bps);
    const { error } = await platformDb().from("split_events").insert({ series_id: seriesId, pos_payment_id: p.id, gross: Number(p.gross), spv_amount: sp.spv, owner_amount: sp.owner, settled_at: p.settled_at });
    if (error) continue; // balapan: sudah dicatat pemanggil lain
    await moveCash(seriesId, `split-${p.id}`, [["spv_pocket", sp.spv], ["owner", sp.owner]]);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- 2. biaya dan penutupan periode

export async function submitExpense(seriesId: string, actor: string, e: { category: string; amount: number; documentId?: string | null; note?: string }) {
  if (!Number.isInteger(e.amount) || e.amount <= 0) throw new Error("Nominal harus rupiah bulat > 0");
  const no = (await lastPeriodNo(seriesId)) + 1;
  const status = e.amount > DEMO_PARAMS.expenseReviewThreshold && e.category !== "operator_fee" && e.category !== "reserve" ? "pending" : "approved";
  const { error } = await platformDb().from("expense_items").insert({ series_id: seriesId, period_no: no, category: e.category, amount: e.amount, document_id: e.documentId ?? null, status, note: e.note ?? null });
  if (error) throw new Error(error.message);
  await audit(actor, "expense.submit", { entity: "series", entityId: seriesId, after: e });
  return status === "pending" ? "Biaya tercatat; di atas ambang, menunggu tinjauan reviewer." : "Biaya tercatat untuk periode berjalan.";
}

export async function reviewExpense(id: string, actor: string, approve: boolean, note: string) {
  await platformDb().from("expense_items").update({ status: approve ? "approved" : "rejected", reviewed_by: actor, note: note || null }).eq("id", id);
  await audit(actor, "expense.review", { entity: "expense_items", entityId: id, after: { approve, note } });
}

async function lastPeriodNo(seriesId: string) {
  const { data } = await platformDb().from("revenue_periods").select("period_no").eq("series_id", seriesId).order("period_no", { ascending: false }).limit(1).maybeSingle();
  return data?.period_no ?? 0;
}

/** Komponen waterfall periode berjalan dari ledger PoS + biaya disetujui. Fee gateway dihitung sebagai biaya operasional. */
export async function draftWaterfall(seriesId: string, start: Date, end: Date) {
  const ctx = await getSeries(seriesId);
  const companyId = ctx.venue.pos_company_id;
  const { data: entries } = companyId ? await posDb().from("ledger_entries").select("type, amount").eq("company_id", companyId).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()) : { data: [] as any[] };
  const sum = (t: string[]) => (entries ?? []).filter((e) => t.includes(e.type)).reduce((a, e) => a + Math.abs(Number(e.amount)), 0);
  const no = (await lastPeriodNo(seriesId)) + 1;
  const { data: items } = await platformDb().from("expense_items").select("*").eq("series_id", seriesId).eq("period_no", no);
  const approved = (items ?? []).filter((i) => i.status === "approved");
  const by = (pred: (c: string) => boolean) => approved.filter((i) => pred(i.category)).reduce((a, i) => a + Number(i.amount), 0);
  const gross = sum(["sale"]);
  const w: Waterfall = {
    gross,
    refunds: sum(["refund", "chargeback"]),
    opex: by((c) => c !== "operator_fee" && c !== "reserve") + sum(["fee"]),
    tax: sum(["tax"]),
    operatorFee: by((c) => c === "operator_fee"),
    reserve: by((c) => c === "reserve"),
    platformFee: bps(gross, DEMO_PARAMS.platformFeeBps),
  };
  return { periodNo: no, w, pendingItems: (items ?? []).filter((i) => i.status === "pending").length, items: items ?? [] };
}

/**
 * Tutup periode: snapshot waterfall, simpan sebagai attestation REVENUE_PERIOD, PLATFORM menandatangani. Owner menandatangani dari dashboard.
 * Angka melanggar aturan kontrak (potongan > gross, opex > plafon) ditolak di sini lebih dulu.
 */
export async function closePeriod(seriesId: string, actor: string) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  await ingestSplits(seriesId);
  const pf = platformDb();
  const { data: open } = await pf.from("revenue_periods").select("period_no, status").eq("series_id", seriesId).in("status", ["awaiting_owner", "disputed"]).maybeSingle();
  if (open) throw new Error(`Periode ${open.period_no} masih ${PERIOD_STATUS_LABEL[open.status]}`);
  const { data: prev } = await pf.from("revenue_periods").select("period_end").eq("series_id", seriesId).order("period_no", { ascending: false }).limit(1).maybeSingle();
  const { data: acq } = await pf.from("attestations").select("created_at").eq("series_id", seriesId).eq("kind", "ACQUISITION_CLOSED").eq("status", "submitted").single();
  const start = new Date(prev?.period_end ?? acq!.created_at);
  // periodEnd harus ≤ waktu blok saat posting: mundurkan 60 detik dari sekarang
  const end = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
  if (end <= start) throw new Error("Periode terlalu pendek");
  const { periodNo, w, pendingItems } = await draftWaterfall(seriesId, start, end);
  if (pendingItems) throw new Error(`${pendingItems} biaya masih menunggu tinjauan reviewer`);
  checkWaterfall(w, ctx.series.max_opex_bps);
  const r = waterfall(w, ctx.series.stake_bps, ctx.series.spv_fee_bps);
  const { data: splits } = await pf.from("split_events").select("spv_amount").eq("series_id", seriesId).gte("settled_at", start.toISOString()).lt("settled_at", end.toISOString());
  const pocket = (splits ?? []).reduce((a, s) => a + Number(s.spv_amount), 0);

  const evidence = { series: addr, periodNo, start: start.toISOString(), end: end.toISOString(), waterfall: w, posCompany: ctx.venue.pos_company_id, splitCount: splits?.length ?? 0, pocket };
  const evidenceHash = evidenceHashOf(canonicalJson(evidence));
  const periodEnd = BigInt(Math.floor(end.getTime() / 1000));
  const payloadHash = periodPayload(periodNo, periodEnd, w, evidenceHash);
  const ownerDeadline = new Date(end.getTime() + ctx.series.owner_sign_window_seconds * 1000);
  await pf.from("revenue_periods").insert({
    series_id: seriesId, period_no: periodNo, period_start: start.toISOString(), period_end: end.toISOString(), gross: w.gross, refunds: w.refunds, opex: w.opex, tax: w.tax,
    operator_fee: w.operatorFee, reserve: w.reserve, platform_fee: w.platformFee, distributable: r.distributable, p_spv: r.pSpv, f_spv: r.fSpv, p_inv: r.pInv,
    pocket_collected: pocket, evidence, evidence_hash: evidenceHash, status: "awaiting_owner", owner_deadline: ownerDeadline.toISOString(),
  });
  const att = await createAttestation({ seriesId, kind: "REVENUE_PERIOD", refId: periodNo, payload: { periodNo, periodEnd: String(periodEnd), waterfall: w, evidenceHash }, payloadHash, evidenceHash, deadline: new Date(Date.now() + ATT_WINDOW_DAYS * 86_400_000) });
  await signAsPlatform(att.id, addr);
  await audit(actor, "period.close", { entity: "series", entityId: seriesId, after: { periodNo, distributable: r.distributable, pInv: r.pInv } });
  return `Periode ${periodNo} ditutup: D ${rp(r.distributable)}, jatah investor ${rp(r.pInv)}. Menunggu tanda tangan owner.`;
}

// ---------------------------------------------------------------- 3. tanda tangan owner / verifier, sengketa

export async function periodAttestation(seriesId: string, periodNo: number) {
  const { data } = await platformDb().from("attestations").select("*").eq("series_id", seriesId).eq("kind", "REVENUE_PERIOD").eq("ref_id", String(periodNo)).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

/** Owner (COUNTERPARTY) atau, setelah owner diam melewati jendela, VERIFIER menandatangani; lengkap → posting otomatis. */
export async function signPeriod(seriesId: string, periodNo: number, signature: Hex) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const { data: per } = await platformDb().from("revenue_periods").select("*").eq("series_id", seriesId).eq("period_no", periodNo).single();
  if (per.status !== "awaiting_owner") throw new Error(`Periode ${PERIOD_STATUS_LABEL[per.status]}`);
  const att = await periodAttestation(seriesId, periodNo);
  const ownerSilent = Date.now() > Date.parse(per.owner_deadline);
  const { att: updated, slot } = await addSignature(att.id, addr, signature, { ownerSilent });
  if (slot === "VERIFIER" && !ownerSilent) throw new Error("Verifier hanya boleh menggantikan owner setelah jendela tanda tangan owner lewat");
  if (!isReady(updated)) return "Tanda tangan tersimpan.";
  return postPeriod(seriesId, periodNo);
}

/** Owner tidak setuju dengan angka: sengketa dicatat dan ditandai on-chain (item ditahan, item lain jalan). Verifier menengahi. */
export async function disputePeriod(seriesId: string, periodNo: number, actor: string, reason: string) {
  if (reason.trim().length < 10) throw new Error("Jelaskan angka mana yang tidak sesuai (minimal 10 karakter)");
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const itemRef = await publicClient.readContract({ address: addr, abi: venueSeriesAbi, functionName: "periodRef", args: [BigInt(periodNo)] });
  const tx = await operatorSend(addr, venueSeriesAbi as any, "raiseDispute", [itemRef, evidenceHashOf(reason)]);
  const pf = platformDb();
  await pf.from("disputes").insert({ series_id: seriesId, item_ref: itemRef, item_type: "period", reason, raised_by: actor, raise_tx: tx });
  await pf.from("revenue_periods").update({ status: "disputed" }).eq("series_id", seriesId).eq("period_no", periodNo);
  await pf.from("series").update({ status: (await readSeries(addr)).state }).eq("id", seriesId);
  await audit(actor, "period.dispute", { entity: "series", entityId: seriesId, detail: { periodNo, reason, tx } });
  return "Sengketa dicatat on-chain. Verifier independen akan menengahi; periode ini ditahan.";
}

/**
 * Verifier memutus sengketa. "recompute": periode dihapus dari antrean dan dihitung ulang (mis. setelah biaya dikoreksi), owner tanda tangan lagi.
 * Eksekusi on-chain lewat peran ADMIN atas keputusan verifier (demo; production: verifier mengirim sendiri).
 */
export async function resolvePeriodDispute(disputeId: string, actor: string, resolution: string) {
  if (resolution.trim().length < 10) throw new Error("Tulis dasar keputusan (minimal 10 karakter)");
  const pf = platformDb();
  const { data: d } = await pf.from("disputes").select("*").eq("id", disputeId).single();
  if (d.status !== "open") throw new Error("Sengketa sudah selesai");
  const ctx = await getSeries(d.series_id);
  const addr = needContract(ctx);
  const tx = await operatorSend(addr, venueSeriesAbi as any, "resolveDispute", [d.item_ref, evidenceHashOf(resolution)]);
  await pf.from("disputes").update({ status: "resolved", resolution, resolve_tx: tx, resolved_at: new Date().toISOString() }).eq("id", disputeId);
  if (d.item_type === "period") {
    const { data: per } = await pf.from("revenue_periods").select("period_no").eq("series_id", d.series_id).eq("status", "disputed").maybeSingle();
    if (per) {
      // angka lama tidak dipakai: periode dibuka ulang dan dihitung ulang dari data terbaru
      await pf.from("attestations").delete().eq("series_id", d.series_id).eq("kind", "REVENUE_PERIOD").eq("ref_id", String(per.period_no)).neq("status", "submitted");
      await pf.from("revenue_periods").delete().eq("series_id", d.series_id).eq("period_no", per.period_no);
    }
  }
  await pf.from("series").update({ status: (await readSeries(addr)).state }).eq("id", d.series_id);
  await audit(actor, "dispute.resolve", { entity: "disputes", entityId: disputeId, after: { resolution, tx } });
  return "Sengketa selesai. Tutup periode lagi untuk menghitung ulang angka.";
}

// ---------------------------------------------------------------- 4–6. posting, koreksi, pembayaran jatah

export async function postPeriod(seriesId: string, periodNo: number) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const pf = platformDb();
  const { data: per } = await pf.from("revenue_periods").select("*").eq("series_id", seriesId).eq("period_no", periodNo).single();
  const att = await periodAttestation(seriesId, periodNo);
  if (!isReady(att)) throw new Error("Tanda tangan belum lengkap");
  const w: Waterfall = { gross: Number(per.gross), refunds: Number(per.refunds), opex: Number(per.opex), tax: Number(per.tax), operatorFee: Number(per.operator_fee), reserve: Number(per.reserve), platformFee: Number(per.platform_fee) };
  const periodEnd = BigInt(Math.floor(Date.parse(per.period_end) / 1000));
  const tx = await operatorSend(addr, venueSeriesAbi as any, "postRevenuePeriod", [BigInt(periodNo), periodEnd, toChainWaterfall(w), per.evidence_hash, BigInt(Math.floor(Date.parse(att.deadline) / 1000)), sigsOf(att)]);
  await markSubmitted(att.id, tx);
  const p = await readPeriod(addr, periodNo);
  await pf.from("revenue_periods").update({ status: "posted", posted_tx: tx, owed_idr: Number(p.owedIdr) }).eq("id", per.id);
  // platform fee keluar dari omzet owner ke operasional platform (simulasi)
  await moveCash(seriesId, `platform-fee-${seriesId}-${periodNo}`, [["owner", -w.platformFee], ["platform_ops", w.platformFee]]);
  await audit("platform", "period.post", { entity: "series", entityId: seriesId, after: { periodNo, tx, owed: String(p.owedIdr) } });
  return settleTrueUp(seriesId, periodNo);
}

/** Koreksi akhir bulan: kantong SPV vs P_SPV. Lebih → kembali ke owner; kurang → owner membayar kekurangannya lewat gateway. */
export async function settleTrueUp(seriesId: string, periodNo: number, returnBase = process.env.PLATFORM_URL ?? "http://localhost:3000") {
  const pf = platformDb();
  const { data: per } = await pf.from("revenue_periods").select("*").eq("series_id", seriesId).eq("period_no", periodNo).single();
  const pocket = Number(per.pocket_collected);
  const pSpv = Number(per.p_spv);
  const diff = pocket - pSpv;
  await pf.from("revenue_periods").update({ true_up: diff }).eq("id", per.id);
  if (diff >= 0) {
    await moveCash(seriesId, `trueup-${seriesId}-${periodNo}`, [["spv_pocket", -diff], ["owner", diff]]);
    return payout(seriesId, periodNo);
  }
  if (!per.topup_psp_ref) {
    const ctx = await getSeries(seriesId);
    const charge = await provider().createCharge({ amount: -diff, reference: `trueup-${seriesId.slice(0, 8)}-${periodNo}`, description: `Kekurangan koreksi periode ${periodNo} · ${ctx.venue.name}`, returnUrl: `${returnBase}/owner?topup=${periodNo}`, seconds: TOPUP_SECONDS });
    await pf.from("revenue_periods").update({ status: "awaiting_topup", topup_psp_ref: charge.pspRef, topup_url: charge.checkoutUrl }).eq("id", per.id);
  }
  return `Periode ${periodNo} diposting. Kantong SPV kurang ${rp(-diff)} dari hak SPV; owner perlu melengkapi sebelum tenggat.`;
}

/** Cek pembayaran kekurangan owner; bila lunas, lanjut bayar jatah. */
export async function syncTopup(seriesId: string, periodNo: number) {
  const pf = platformDb();
  const { data: per } = await pf.from("revenue_periods").select("*").eq("series_id", seriesId).eq("period_no", periodNo).single();
  if (per.status !== "awaiting_topup" || !per.topup_psp_ref) return per.status;
  const st = await providerFor(per.topup_psp_ref).status(per.topup_psp_ref);
  if (st !== "paid") return st;
  await moveCash(seriesId, `topup-${per.topup_psp_ref}`, [["owner", Number(per.true_up)], ["spv_pocket", -Number(per.true_up)]]);
  await payout(seriesId, periodNo);
  return "paid";
}

/**
 * Bayar jatah: dana P_SPV keluar dari kantong → rekening distribusi (bagian pemegang), SPV ops (m), modal SPV (bagian token treasury).
 * Kredit per investor = floor(saldo saat posting × Δacc ÷ 1e18); jumlahnya ≤ kewajiban on-chain. Lalu settlePayout + akar Merkle.
 */
async function payout(seriesId: string, periodNo: number) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const pf = platformDb();
  const { data: per } = await pf.from("revenue_periods").select("*").eq("series_id", seriesId).eq("period_no", periodNo).single();
  if (per.status === "paid") return `Periode ${periodNo} sudah dibayar.`;
  const p = await readPeriod(addr, periodNo);
  const rc = await publicClient.getTransactionReceipt({ hash: per.posted_tx as Hex });
  const credits = await creditsAt(seriesId, ctx.series.token_address as Address, rc.blockNumber, p.deltaE18);
  const total = credits.reduce((a, c) => a + c.amount, 0);
  if (BigInt(total) > p.owedIdr) throw new Error("Kredit melebihi kewajiban on-chain (tidak boleh terjadi)");
  const pSpv = Number(per.p_spv), fSpv = Number(per.f_spv);
  await moveCash(seriesId, `payout-${seriesId}-${periodNo}`, [["spv_pocket", -pSpv], ["distribution", total], ["spv_ops", fSpv], ["spv_capital", pSpv - fSpv - total]]);
  const { data: users } = await pf.from("users").select("id, wallet").in("wallet", credits.map((c) => c.wallet));
  const byWallet = new Map((users ?? []).map((u) => [String(u.wallet).toLowerCase(), u.id]));
  const rows = credits.filter((c) => c.amount > 0).map((c) => ({ user_id: byWallet.get(c.wallet.toLowerCase()), series_id: seriesId, kind: "distribution", amount: c.amount, ref: `period:${seriesId}:${periodNo}:${c.wallet.toLowerCase()}`, period_no: periodNo })).filter((r) => r.user_id);
  if (rows.length) {
    const { error } = await pf.from("investor_ledger").upsert(rows, { onConflict: "kind,ref", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const root = merkleRoot(credits.map((c) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [getAddress(c.wallet), BigInt(c.amount)]))));
  let tx: Hex | null = null;
  if (total > 0) tx = await operatorSend(addr, venueSeriesAbi as any, "settlePayout", [BigInt(periodNo), BigInt(total), root]);
  await pf.from("revenue_periods").update({ status: "paid", paid_idr: total, payout_root: root, payout_tx: tx }).eq("id", per.id);
  await audit("platform", "period.payout", { entity: "series", entityId: seriesId, after: { periodNo, total, holders: credits.length, tx } });
  return `Periode ${periodNo}: ${rp(total)} dikreditkan ke saldo ${rows.length} investor.`;
}

/** Saldo pemegang (di luar treasury) pada blok posting dan jatah masing-masing. */
async function creditsAt(seriesId: string, token: Address, blockNumber: bigint, deltaE18: bigint) {
  const { data } = await platformDb().from("orders").select("wallet").eq("series_id", seriesId).eq("status", "ALLOCATED");
  const wallets = [...new Set((data ?? []).map((o) => getAddress(o.wallet)))];
  const out: { wallet: string; tokens: bigint; amount: number }[] = [];
  for (const w of wallets) {
    const bal = await publicClient.readContract({ address: token, abi: seriesTokenAbi, functionName: "balanceOf", args: [w], blockNumber });
    if (bal > 0n) out.push({ wallet: w, tokens: bal, amount: Number((bal * deltaE18) / 10n ** 18n) });
  }
  return out;
}

// ---------------------------------------------------------------- tenggat

/** Siapa pun boleh memicu Overdue/Defaulted di kontrak; platform memanggilnya saat halaman dibuka supaya status publik akurat. */
export async function checkDeadlines(seriesId: string) {
  const ctx = await getSeries(seriesId);
  if (!ctx.address) return [];
  const addr = ctx.address;
  const info = await readSeries(addr);
  const done: string[] = [];
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (let i = 1n; i <= info.lastPeriodId; i++) {
    const p = await readPeriod(addr, i);
    if (p.settled || p.owedIdr === 0n) continue;
    if (!p.overdue && now > p.payoutDue) { await operatorSend(addr, venueSeriesAbi as any, "markOverdue", [i]); done.push(`Periode ${i} Overdue`); }
    else if (p.overdue && info.state === "Overdue" && now > p.payoutDue + BigInt(info.params.defaultGrace)) { await operatorSend(addr, venueSeriesAbi as any, "markDefaulted", [i]); done.push(`Periode ${i} Defaulted`); }
  }
  if (done.length) await platformDb().from("series").update({ status: (await readSeries(addr)).state }).eq("id", seriesId);
  return done;
}

export async function periodsOf(seriesId: string) {
  const { data } = await platformDb().from("revenue_periods").select("*").eq("series_id", seriesId).order("period_no", { ascending: false });
  return data ?? [];
}

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
