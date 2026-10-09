import { chainStatus, createSupabasePosSource } from "@venue-rwa/connectors";
import { Badge, Card, Empty, Flash, Notice, PageHeader } from "@venue-rwa/ui";
import { requireSession } from "@/lib/session";
import { dt, rp, short } from "@/lib/format";
import { makeRoot } from "../actions";

export const dynamic = "force-dynamic";
const TONE: Record<string, "ok" | "bad" | "neutral" | "info"> = { sale: "ok", refund: "bad", chargeback: "bad", fee: "neutral", tax: "neutral" };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const all = await createSupabasePosSource(s.db).listEntries(s.company.id, new Date(0), new Date(Date.now() + 60_000));
  const chain = chainStatus(all);
  const tail = all.slice(-30).reverse();
  const { data: roots } = await s.db.from("daily_roots").select("*").eq("company_id", s.company.id).order("date", { ascending: false }).limit(10);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader eyebrow="Bukti" title="Ledger & hash harian" lead="Setiap perubahan adalah satu entri yang hash-nya menyambung ke entri sebelumnya. Database menolak UPDATE dan DELETE. Hash harian (Merkle root) di-anchor on-chain dan di-co-sign pihak independen." />
      <Flash ok={sp.ok} err={sp.err} />

      <Card tone={chain.ok ? "ok" : "bad"} title="Integritas rantai hash" actions={chain.ok ? <Badge tone="ok">Utuh · {chain.count.toLocaleString("id-ID")} entri</Badge> : <Badge tone="bad">Rusak di entri #{chain.brokenAt}</Badge>}>
        <p className="muted">Diverifikasi ulang dari entri pertama setiap halaman dibuka. Ini bukti data <b>tidak diubah</b>, bukan bukti data <b>benar</b>: kebenaran datang dari settlement payment gateway, dan platform mencocokkannya setiap hari.</p>
      </Card>

      <div className="grid c2 mt">
        <Card title="Merkle root harian" subtitle="Tanggal dihitung dalam UTC.">
          {roots && roots.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Tanggal</th><th className="r">Entri</th><th>Root</th><th>Anchor</th></tr></thead>
              <tbody>{roots.map((r) => <tr key={r.date}><td>{r.date}</td><td className="r">{r.entry_count}</td><td className="mono">{short(r.merkle_root)}</td><td>{r.anchored_tx ? <Badge tone="ok">on-chain</Badge> : <Badge>belum</Badge>}</td></tr>)}</tbody>
            </table></div>
          ) : <Empty>Belum ada root.</Empty>}
          <form action={makeRoot} className="row mt-s">
            <input type="hidden" name="back" value="/ledger" />
            <input className="input" style={{ width: 170 }} type="date" name="date" defaultValue={today} />
            <button className="btn sm">Hitung ulang root</button>
          </form>
          <div className="mt-s"><Notice tone="info">Root hari berjalan bersifat sementara sampai hari berakhir. Anchoring dilakukan di platform oleh pihak independen.</Notice></div>
        </Card>

        <Card title="Cara membaca ledger">
          <table className="kv"><tbody>
            <tr><td>sale</td><td>penjualan (positif)</td></tr>
            <tr><td>refund / chargeback</td><td>entri <b>negatif</b> baru</td></tr>
            <tr><td>tax</td><td>PB1 (pengurang)</td></tr>
            <tr><td>fee</td><td>biaya gateway (pengurang)</td></tr>
            <tr><td>Eligible Revenue</td><td>sale − refund − chargeback − tax − fee</td></tr>
          </tbody></table>
          <p className="muted small mt-s">Dasar bagi hasil adalah <b>omzet</b>, bukan laba: omzet bisa dibuktikan dari gateway, sedangkan laba bergantung biaya yang dikontrol owner.</p>
        </Card>
      </div>

      <div className="mt">
        <Card title="30 entri terakhir">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Waktu</th><th>Jenis</th><th className="r">Jumlah</th><th>Booking</th><th>Hash</th><th>← sebelumnya</th></tr></thead>
            <tbody>{tail.map((e) => (
              <tr key={e.id}>
                <td className="small">{dt(e.createdAt)}</td>
                <td><Badge tone={TONE[e.type] ?? "neutral"}>{e.type}</Badge></td>
                <td className="r">{rp(e.amount)}</td>
                <td className="mono">{e.bookingId ?? "–"}</td>
                <td className="mono">{short(e.hash)}</td><td className="mono muted">{short(e.prevHash)}</td>
              </tr>))}
            </tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}
