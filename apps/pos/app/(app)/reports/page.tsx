import { createSupabasePosSource, monthlyEligible, occupancy } from "@venue-rwa/connectors";
import { eligibleRevenue, utcDate } from "@venue-rwa/shared";
import { reconcile } from "@venue-rwa/verification";
import { Badge, Bars, Card, Empty, Flash, Kpi, PageHeader } from "@venue-rwa/ui";
import { requireSession } from "@/lib/session";
import { pct, rp } from "@/lib/format";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { fictitious_booking: "Booking fiktif (referensi berulang)", cash_outside_system: "Pembayaran tunai di luar sistem", unexplained_gap: "Selisih tak terjelaskan", hash_chain_broken: "Rantai hash putus" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const db = s.db, cid = s.company.id;
  const now = new Date();
  const D = 86_400_000;
  const src = createSupabasePosSource(db);
  const [entries, settled, occ, { count: nProducts }] = await Promise.all([
    src.listEntries(cid, new Date(now.getTime() - 200 * D), new Date(now.getTime() + 60_000)),
    src.listSettledPayments(cid, new Date(0), new Date(now.getTime() + D)),
    occupancy(db, cid, now, 30),
    db.from("products").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("active", true),
  ]);
  const settledIds = new Set(settled.map((x) => x.bookingId));
  const monthly = monthlyEligible(entries, settledIds, now, 6);

  const last30 = entries.filter((e) => new Date(e.createdAt).getTime() > now.getTime() - 30 * D);
  const sum = (t: string) => last30.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0);
  const gross = sum("sale"), refunds = -sum("refund"), taxes = sum("tax"), fees = sum("fee");
  const eligible = eligibleRevenue({ settledGross: gross, refunds, chargebacks: 0, taxes, gatewayFees: fees });

  const days = new Map<string, number>();
  for (const e of entries) if (e.type === "sale" && new Date(e.createdAt).getTime() > now.getTime() - 14 * D) days.set(utcDate(e.createdAt), (days.get(utcDate(e.createdAt)) ?? 0) + e.amount);
  const daily = [...days].sort().map(([d, v]) => ({ label: d.slice(5), value: v, display: rp(v) }));

  const ids = last30.filter((e) => e.type === "sale" && e.bookingId && !settledIds.has(e.bookingId)).map((e) => e.bookingId!);
  const refs = new Map<string, string>();
  const { data: offs } = await db.from("bookings").select("id, payment_method").eq("company_id", cid).neq("payment_method", "gateway").gte("slot_start", new Date(now.getTime() - 40 * D).toISOString());
  const offRail = new Set((offs ?? []).map((r) => r.id as string));
  if (ids.length) { const { data } = await db.from("bookings").select("id, customer_ref").in("id", ids.slice(0, 200)); (data ?? []).forEach((r) => refs.set(r.id, r.customer_ref)); }
  const rec = reconcile({ companyId: cid, entries: last30, settled, customerRefs: refs, offRail });

  return (
    <>
      <PageHeader eyebrow="Laporan" title="Omzet, okupansi, dan selisih vs settlement" lead="Angka di sini dihitung dari ledger dan dicocokkan dengan settlement PSP. Penjualan tanpa settlement tidak dihitung sebagai omzet terverifikasi." />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid c4">
        <Kpi label="Penjualan kotor 30 hari" value={rp(gross)} />
        <Kpi label="Refund" value={rp(refunds)} hint={`${pct(gross ? refunds / gross : 0, 1)} dari penjualan`} />
        <Kpi label="Omzet bersih" value={rp(eligible)} hint="bahan waterfall; bukan laba" accent />
        <Kpi label="Cakupan terverifikasi" value={pct(rec.coverage)} hint="penjualan settle di gateway ÷ semua penjualan" />
      </div>

      <div className="grid c2 mt">
        <Card title="Omzet bersih per 30 hari" subtitle="Hanya penjualan yang settle di PSP.">
          <Bars rows={monthly.map((m, i) => ({ label: `${(monthly.length - 1 - i) * 30}–${(monthly.length - i) * 30}h`, value: m, display: rp(m) }))} />
        </Card>
        <Card title="Penjualan harian" subtitle="14 hari terakhir (UTC).">
          {daily.length ? <Bars rows={daily} /> : <Empty>Belum ada data.</Empty>}
        </Card>
      </div>

      <div className="mt">
        <Card tone={rec.clean ? "ok" : "bad"} title="Selisih vs settlement PSP (30 hari)" actions={rec.clean ? <Badge tone="ok">Cocok</Badge> : <Badge tone="bad">{rec.exceptions.length} exception</Badge>}>
          <table className="kv"><tbody>
            <tr><td>Dibukukan di PoS</td><td>{rp(rec.salesTotal)}</td></tr>
            <tr><td>Settle di PSP</td><td>{rp(rec.settledTotal)}</td></tr>
            <tr><td>Dibayar di luar gateway (tunai/QRIS sendiri)</td><td>{rp(rec.offRailTotal)}</td></tr>
            <tr><td>Tanpa settlement dan tanpa catatan metode</td><td><b>{rp(rec.unmatchedTotal)}</b></td></tr>
          </tbody></table>
          {rec.exceptions.length > 0 && (
            <div className="table-wrap mt-s"><table className="table">
              <thead><tr><th>Tanggal</th><th>Jenis</th><th className="r">Nominal</th></tr></thead>
              <tbody>{rec.exceptions.map((e, i) => <tr key={i}><td>{e.date}</td><td>{KIND[e.kind]}</td><td className="r">{rp(e.amount)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
      </div>

    </>
  );
}
