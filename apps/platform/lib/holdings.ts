import type { Address } from "viem";
import { eligibleBetween } from "@venue-rwa/connectors";
import { publicClient, readSeries, seriesAbi, tokenAbi } from "./chain";
import { posDb } from "./db";
import { getCtx } from "./flow";

export type Activity = { at: string; kind: "beli" | "redeem" | "kirim" | "terima" | "periode"; title: string; detail: string; amount?: number; tx?: string | null };

/**
 * Posisi satu investor di satu seri: saldo token, yang dibayar, nilai tebus (final, dari kontrak), akrual berjalan
 * (perkiraan bagian investor dari omzet sejak periode terakhir, belum final), riwayat nilai tebus, kantong per periode, dan aktivitas.
 */
export async function holding(seriesId: string, wallet: Address) {
  const ctx = await getCtx(seriesId);
  if (!ctx.ref) throw new Error("Penawaran ini belum punya kontrak");
  const ref = ctx.ref;
  const read = (address: Address, abi: any, functionName: string) => publicClient.readContract({ address, abi, functionName, args: [wallet] } as any) as Promise<bigint>;
  const [info, bal, locked, nonce, tnonce] = await Promise.all([
    readSeries(ref), read(ref.token, tokenAbi, "balanceOf"), read(ref.series, seriesAbi, "pendingUnits"), read(ref.series, seriesAbi, "redeemNonce"), read(ref.series, seriesAbi, "transferNonce"),
  ]);
  const pf = ctx.pf;
  const sid = ctx.series.id;
  const [{ data: buys }, { data: periods }, { data: paidReds }, { data: myReds }, { data: xfers }] = await Promise.all([
    pf.from("purchases").select("units, amount, simulated, psp_ref, status, mint_tx, created_at, refunded_at").eq("series_id", sid).ilike("wallet", wallet).order("created_at"),
    pf.from("pool_periods").select("period_id, final_amount, period_end, posted_tx").eq("series_id", sid).order("period_id"),
    pf.from("redeem_requests").select("units, payout, created_at").eq("series_id", sid).eq("status", "paid"),
    pf.from("redeem_requests").select("units, payout, status, created_at").eq("series_id", sid).ilike("wallet", wallet).order("created_at"),
    pf.from("token_transfers").select("from_wallet, to_wallet, units, tx, created_at").eq("series_id", sid).or(`from_wallet.ilike.${wallet},to_wallet.ilike.${wallet}`).order("created_at"),
  ]);

  const units = Number(bal);
  const paid = (buys ?? []).filter((b) => b.status === "minted" && !b.refunded_at).reduce((a, b) => a + Number(b.amount), 0);
  const basis = paid > 0 ? paid : units * Number(info.unitPrice);
  const perToken = info.S > 0n ? Number((info.P - info.R) / info.S) : 0;
  const value = units * perToken;

  // suplai pada waktu T = suplai sekarang + token yang dibakar setelah T
  const supplyAt = (T: number) => info.S + (paidReds ?? []).filter((x) => Date.parse(x.created_at) > T).reduce((a, x) => a + BigInt(x.units), 0n);
  const perAt = (T: number) => {
    const P = (periods ?? []).filter((x) => x.period_end && Date.parse(x.period_end) <= T).reduce((a, x) => a + BigInt(x.final_amount ?? 0), 0n);
    const R = (paidReds ?? []).filter((x) => Date.parse(x.created_at) <= T).reduce((a, x) => a + BigInt(x.payout ?? 0), 0n);
    const S = supplyAt(T);
    return S > 0n ? Number((P - R) / S) : 0;
  };
  const history = [
    ...(periods ?? []).filter((x) => x.period_end).map((x) => ({ t: x.period_end as string, v: units * perAt(Date.parse(x.period_end as string)) })),
    { t: new Date().toISOString(), v: value },
  ];
  const bars = (periods ?? []).filter((x) => x.period_id > 0 && x.period_end).map((x) => {
    const S = supplyAt(Date.parse(x.period_end as string));
    return { label: `Periode ${x.period_id}`, at: x.period_end as string, pool: Number(x.final_amount ?? 0), mine: S > 0n ? Number((BigInt(x.final_amount ?? 0) * bal) / S) : 0 };
  });

  // akrual berjalan: bagian investor dari omzet eligible sejak akhir periode terakhir (hanya setelah penawaran terdanai)
  let accrual: { pool: number; mine: number; since: string } | null = null;
  const last = (periods ?? []).filter((x) => x.period_end).at(-1);
  if (["Funded", "Active"].includes(info.state) && last && ctx.companyId && info.S > 0n) {
    try {
      const calc = await eligibleBetween(posDb(), ctx.companyId, new Date(last.period_end as string), new Date());
      const pool = Math.max(0, Math.floor((calc.eligible * ctx.series.share_bps) / 10_000));
      accrual = { pool, mine: Number((BigInt(pool) * bal) / info.S), since: last.period_end as string };
    } catch { accrual = null; }
  }

  const me = wallet.toLowerCase();
  const activity: Activity[] = [
    ...(buys ?? []).map((b) => ({ at: b.created_at, kind: "beli" as const, title: `Beli ${b.units} token`, detail: `${b.simulated ? "rupiah simulasi" : `lewat Xendit${b.psp_ref ? ` · ${String(b.psp_ref).slice(0, 10)}…` : ""}`}${b.status !== "minted" ? ` · ${b.status === "pending" ? "menunggu bayar" : b.status}` : ""}${b.refunded_at ? " · sudah direfund" : ""}`, amount: Number(b.amount), tx: b.mint_tx })),
    ...(myReds ?? []).map((r) => ({ at: r.created_at, kind: "redeem" as const, title: `Tebus ${r.units} token`, detail: r.status === "paid" ? "dibayar kustodian, token dibakar" : r.status === "approved" ? "disetujui, menunggu pembayaran" : r.status === "failed" ? "gagal, token dibuka lagi" : "menunggu persetujuan", amount: r.payout ? Number(r.payout) : undefined })),
    ...(xfers ?? []).map((x) => {
      const out = String(x.from_wallet).toLowerCase() === me;
      return { at: x.created_at, kind: (out ? "kirim" : "terima") as "kirim" | "terima", title: `${out ? "Kirim" : "Terima"} ${x.units} token`, detail: `${out ? "ke" : "dari"} ${String(out ? x.to_wallet : x.from_wallet).slice(0, 8)}…`, tx: x.tx };
    }),
    ...bars.map((b) => ({ at: b.at, kind: "periode" as const, title: `${b.label} difinalkan`, detail: `kantong investor +Rp${b.pool.toLocaleString("id-ID")}`, amount: b.mine })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  // penanda periode 0 dibuat saat penawaran ditutup terdanai: sejak saat itu omzet menjadi hak kantong investor
  const fundedSince = (periods ?? []).find((x) => Number(x.period_id) === 0)?.period_end ?? null;
  return { ctx, info, bal, locked, nonce, tnonce, units, paid, basis, perToken, value, history, bars, accrual, activity, fundedSince: fundedSince ? new Date(fundedSince) : null };
}

const DAY = 86_400_000;
export type FeedEntry = { at: string; type: string; amount: number; settled: boolean; hash: string };
export type FeedDay = { day: string; gross: number; refunds: number; taxes: number; fees: number; eligible: number; investor: number };

/**
 * Keuangan venue dari ledger PoS (append-only), untuk transparansi ke pemegang token: omzet yang settle di payment gateway,
 * potongan yang mengurangi omzet (refund, pajak, biaya gateway), Eligible Revenue, dan bagian investor sejak penawaran terdanai.
 * Tidak memuat identitas pelanggan. Biaya operasional venue tidak dihitung: bagi hasil dari omzet, bukan laba.
 */
export async function venueFeed(companyId: string, opts: { fundedSince: Date | null; shareBps: number; days?: number }) {
  const to = new Date();
  const from = new Date(to.getTime() - (opts.days ?? 30) * DAY);
  const calc = await eligibleBetween(posDb(), companyId, from, to);
  const settledIds = new Set(calc.settled.map((s) => s.bookingId));
  const byDay = new Map<string, FeedDay>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    byDay.set(day, { day, gross: 0, refunds: 0, taxes: 0, fees: 0, eligible: 0, investor: 0 });
  }
  for (const e of calc.entries) {
    const d = byDay.get(e.createdAt.slice(0, 10));
    if (!d) continue;
    if (e.type === "sale" && e.bookingId && settledIds.has(e.bookingId)) d.gross += e.amount;
    else if (e.type === "refund" || e.type === "chargeback") d.refunds += -e.amount;
    else if (e.type === "tax") d.taxes += e.amount;
    else if (e.type === "fee") d.fees += e.amount;
  }
  const days = [...byDay.values()].map((d) => {
    const eligible = Math.max(0, d.gross - d.refunds - d.taxes - d.fees);
    const counts = opts.fundedSince !== null && Date.parse(`${d.day}T23:59:59.999Z`) >= opts.fundedSince.getTime();
    return { ...d, eligible, investor: counts ? Math.floor((eligible * opts.shareBps) / 10_000) : 0 };
  });
  const sum = (k: keyof Omit<FeedDay, "day">) => days.reduce((a, d) => a + d[k], 0);
  const recent: FeedEntry[] = [...calc.entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 15)
    .map((e) => ({ at: e.createdAt, type: e.type, amount: e.amount, settled: e.type !== "sale" || (!!e.bookingId && settledIds.has(e.bookingId)), hash: e.hash }));
  return { days, recent, totals: { gross: sum("gross"), refunds: sum("refunds"), taxes: sum("taxes"), fees: sum("fees"), eligible: sum("eligible"), investor: sum("investor") } };
}
