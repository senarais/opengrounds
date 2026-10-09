import { encodeFunctionData } from "viem";
import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { computeRoots, explain } from "./actions";
import { SendTxButton, SignTypedButton } from "@/components/Wallet";
import { SeriesPicker } from "@/components/SeriesPicker";
import { chain, readSeries, seriesAbi } from "@/lib/chain";
import { requireArea } from "@/lib/auth";
import { rootMessage } from "@/lib/anchor";
import { dailyRootTypes, seriesDomain, walletTypedData } from "@/lib/eip712";
import { posDb } from "@/lib/db";
import { getStaffCtx } from "@/lib/flow";
import { rp, short } from "@/lib/format";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { fictitious_booking: "Booking fiktif", cash_outside_system: "Tunai di luar sistem", unexplained_gap: "Selisih tak terjelaskan", hash_chain_broken: "Rantai hash putus" };

export default async function AuditorPage({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireArea("auditor");
  const ctx = await getStaffCtx(sp.s).catch(() => null);
  if (!ctx || !ctx.ref) return <div className="container"><Card title="Belum ada seri yang dideploy"><Empty>Auditor bekerja pada seri yang kontraknya sudah ada.</Empty></Card></div>;
  const { pf, series, ref, companyId } = ctx;
  const s = await readSeries(ref);
  const [{ data: excs }, { data: roots }] = await Promise.all([
    pf.from("recon_exceptions").select("*").eq("series_id", series.id).order("date", { ascending: false }).limit(20),
    companyId ? posDb().from("daily_roots").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(6) : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <div className="container">
      <PageHeader eyebrow="Back-office · Auditor" title="Pihak independen" lead={<>Pihak independen (penandatangan ke-3) co-sign hash harian dan memantau exception queue. Root harian adalah bukti data <b>tidak diubah</b>, bukan bukti data <b>benar</b>: kebenaran datang dari settlement gateway.</>}>
        <span className="small muted mono">auditor {short(s.auditor)}</span>
      </PageHeader>
      <SeriesPicker path="/auditor" current={series.id} onlyDeployed />
      <Flash ok={sp.ok} err={sp.err} />

      <Card tone={s.exceptionOpen ? "bad" : undefined} title="Exception queue" actions={s.exceptionOpen ? <Badge tone="bad">Ditandai on-chain · tahap 2 tertahan</Badge> : <Badge>Tanpa tanda on-chain</Badge>}>
        {excs && excs.length > 0 ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tanggal</th><th>Jenis</th><th className="r">Nominal</th><th>Status / penjelasan</th></tr></thead>
            <tbody>{excs.map((e) => <tr key={e.id}><td>{e.date}</td><td>{KIND[e.kind] ?? e.kind}</td><td className="r">{rp(e.amount)}</td><td>{e.explained ? <><Badge tone="ok">dijelaskan</Badge><div className="small muted" style={{ marginTop: 4 }}>{e.explanation} <span className="mono">({e.explained_by})</span></div></> : (
                <form action={explain} className="row" style={{ gap: 6, flexWrap: "nowrap" }}><input type="hidden" name="s" value={series.id} /><input type="hidden" name="id" value={e.id} /><input className="input" name="explanation" placeholder="Penjelasan (min. 10 karakter)" style={{ minWidth: 220 }} required minLength={10} /><button className="btn sm">Jelaskan</button></form>
              )}</td></tr>)}</tbody>
          </table></div>
        ) : <Empty>Belum ada exception. Exception muncul bila rekonsiliasi periode menemukan penjualan tanpa settlement PSP.</Empty>}
        <div className="row mt-s">
          <SendTxButton data={encodeFunctionData({ abi: seriesAbi, functionName: "setException", args: [!s.exceptionOpen] })} to={ref.series} chainId={chain.id} label={s.exceptionOpen ? "Hapus tanda exception (MetaMask)" : "Tandai exception on-chain (MetaMask)"} />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Setelah semua exception dijelaskan, operator dapat mengonfirmasi periode bersih (konsol Operator) agar rilis tahap 2 bisa dilakukan. Menandai exception menahan rilis tahap 2. Mencabut attestation dilakukan penandatangan di halaman Reviewer.</p>
      </Card>

      <div className="mt">
        <Card title="Co-sign & anchor root harian" subtitle="Hanya tanda tangan alamat auditor yang diterima kontrak. Satu root per hari, write-once."
          actions={<form action={computeRoots}><input type="hidden" name="s" value={series.id} /><button className="btn sm">Hitung root yang belum ada</button></form>}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tanggal (UTC)</th><th className="r">Entri</th><th>Merkle root</th><th>Anchor</th><th /></tr></thead>
            <tbody>{roots?.map((r) => {
              const typed = walletTypedData("DailyRoot", dailyRootTypes, seriesDomain(ref.series), rootMessage(ref.series, r.date, r.merkle_root, r.entry_count) as any);
              return (
                <tr key={r.date}>
                  <td>{r.date}</td><td className="r">{r.entry_count}</td><td className="mono">{short(r.merkle_root)}</td>
                  <td>{r.anchored_tx ? <Badge tone="ok">on-chain</Badge> : <Badge>belum</Badge>}</td>
                  <td className="r">{!r.anchored_tx && (
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <SignTypedButton typedData={typed} endpoint="/api/anchor" body={{ date: r.date, seriesId: series.id }} chainId={chain.id} label="Co-sign (MetaMask)" />
                    </div>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      </div>
    </div>
  );
}
