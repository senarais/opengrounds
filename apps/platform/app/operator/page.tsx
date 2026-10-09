import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { operatorAddress, platformAttestorAddress } from "@/lib/operator";
import { etherscan, readSeries, registrySigners, REGISTRY } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { cashBalance } from "@/lib/flow";
import { runCheats } from "@/lib/flows/admin";
import { periodsOf, PERIOD_STATUS_LABEL } from "@/lib/flows/periods";
import { dt, rp } from "@/lib/format";
import { closePeriodAction, deadlinesAction, expenseReviewAction, forceAction, freezeAction, postPeriodAction, topupAction, valuationAction, windowAction, withdrawalAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operator" };
const ACCOUNTS = [["spv_capital", "Modal SPV"], ["escrow", "Escrow pembelian"], ["spv_pocket", "Kantong SPV"], ["distribution", "Distribusi (client money)"], ["buyback_reserve", "Cadangan buyback"], ["owner", "Owner"], ["spv_ops", "SPV operasional"], ["platform_ops", "Operasional platform"]] as const;

export default async function Operator({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; cheat?: string }> }) {
  await requireArea("operator");
  const sp = await searchParams;
  const pf = platformDb();
  const { data: series } = await pf.from("series").select("*, venues(name)").not("contract_address", "is", null).order("created_at", { ascending: false });
  const { data: pendingExp } = await pf.from("expense_items").select("*, series(venues(name))").eq("status", "pending");
  const { data: wds } = await pf.from("withdrawals").select("*").in("status", ["Requested", "Screened", "Sent", "Failed"]).order("created_at", { ascending: false }).limit(10);
  let signers: Awaited<ReturnType<typeof registrySigners>> | null = null;
  try { signers = await registrySigners(); } catch { /* registry belum dideploy */ }
  const cheats = sp.cheat && series?.find((s) => s.id === sp.cheat) ? await runCheats(sp.cheat).catch((e) => { console.error(e); return null; }) : null;

  return (
    <div className="container">
      <PageHeader eyebrow="Back-office" title="Operator" lead="Menjalankan siklus: tutup periode, jual balik, kepatuhan. Setiap angka penting tetap butuh tanda tangan pihak lain." />
      <Flash ok={sp.ok} err={sp.err} />
      <Card title="Kunci backend" subtitle="Hot wallet testnet; production: KMS/HSM [Roadmap]">
        <div className="small" style={{ lineHeight: 1.8 }}>
          <div>CONTROLLER/ADMIN seri: <span className="mono">{(() => { try { return operatorAddress(); } catch { return "belum diatur"; } })()}</span></div>
          <div>Slot PLATFORM (Grounds via Open Grounds): <span className="mono">{(() => { try { return platformAttestorAddress(); } catch { return "belum diatur"; } })()}</span> · Slot VERIFIER: <span className="mono">{signers?.verifier ?? "-"}</span></div>
          <div>Registry: {signers ? <a className="mono" href={etherscan(REGISTRY.address)} target="_blank" rel="noreferrer">{REGISTRY.address}</a> : "belum dideploy (./scripts/deploy.sh)"}</div>
          <p className="muted" style={{ margin: "6px 0 0" }}>Jujur untuk demo: akun operator dan SPV dipegang tim yang sama, dan bila kunci platform dan verifier juga sama, 2-dari-3 hanya mendemokan mekanisme.</p>
        </div>
      </Card>

      {(pendingExp ?? []).length > 0 && <Card title="Biaya menunggu tinjauan" className="mt"><table className="table small"><tbody>{pendingExp!.map((e: any) => <tr key={e.id}><td>{e.series?.venues?.name}</td><td>{e.category}</td><td>{rp(Number(e.amount))}</td><td>{e.note}</td><td><form action={expenseReviewAction} className="row"><input type="hidden" name="id" value={e.id} /><input className="input sm" name="note" placeholder="catatan" /><button className="btn sm primary" name="approve" value="1">Setujui</button><button className="btn sm" name="approve" value="0">Tolak</button></form></td></tr>)}</tbody></table></Card>}

      {(series ?? []).length === 0 ? <div className="mt"><Empty>Belum ada seri. Seri dibuat saat reviewer menyetujui KYB.</Empty></div> : await Promise.all(series!.map(async (s: any) => {
        const info = await readSeries(s.contract_address);
        const periods = await periodsOf(s.id);
        const bal = await Promise.all(ACCOUNTS.map(async ([a]) => cashBalance(s.id, a)));
        const { data: atts } = await pf.from("attestations").select("kind, ref_id, status, signatures").eq("series_id", s.id).eq("status", "collecting");
        const { count: queue } = await pf.from("sellback_requests").select("*", { count: "exact", head: true }).eq("series_id", s.id).eq("status", "Queued");
        return (
          <Card key={s.id} className="mt" title={<>{s.venues?.name} · {s.symbol}</>} subtitle={<span className="mono small">{s.contract_address}</span>}>
            <div className="row"><Badge tone={info.state === "Active" ? "ok" : info.state === "Verified" ? "info" : "bad"}>{info.state}</Badge><span className="small muted">{Number(info.circulating).toLocaleString("id-ID")}/{Number(info.supply).toLocaleString("id-ID")} beredar · {info.holderCount.toString()} pemegang · periode {info.lastPeriodId.toString()} · sengketa terbuka {info.openDisputes.toString()}</span></div>
            {(atts ?? []).length > 0 && <p className="small" style={{ marginTop: 6 }}>Menunggu tanda tangan: {atts!.map((a) => `${a.kind} (${(a.signatures ?? []).map((x: any) => x.slot).join("+") || "-"})`).join(" · ")}</p>}
            {info.state === "Verified" && <p className="small muted" style={{ marginTop: 6 }}>Menunggu konfirmasi akuisisi dan tanda tangan owner (penjual).</p>}
            <div className="chips" style={{ marginTop: 10 }}>{ACCOUNTS.map(([a, l], i) => <div className="chip" key={a}><b>{l}</b><span>{rp(bal[i]!)}</span></div>)}</div>
            <p className="small muted">Semua rekening di atas disimulasikan (sandbox).</p>

            {info.state !== "Verified" && (
              <div className="row" style={{ marginTop: 12 }}>
                <form action={closePeriodAction}><input type="hidden" name="seriesId" value={s.id} /><button className="btn primary">Tutup periode & minta tanda tangan</button></form>
                <form action={deadlinesAction}><input type="hidden" name="seriesId" value={s.id} /><button className="btn">Cek tenggat (Overdue/Default)</button></form>
                <form action={windowAction}><input type="hidden" name="seriesId" value={s.id} /><button className="btn">Jendela jual balik ({queue ?? 0} antre)</button></form>
                <a className="btn ghost" href={`/operator?cheat=${s.id}`}>Demo: platform curang ditolak</a>
              </div>
            )}

            {periods.length > 0 && <table className="table small" style={{ marginTop: 12 }}><thead><tr><th>Periode</th><th>D</th><th>P_inv</th><th>Kantong</th><th>Koreksi</th><th>Status</th><th /></tr></thead><tbody>{periods.map((p) => (
              <tr key={p.id}><td>{p.period_no}<div className="muted">{dt(p.period_end)}</div></td><td>{rp(Number(p.distributable))}</td><td>{rp(Number(p.p_inv))}</td><td>{rp(Number(p.pocket_collected))}</td><td>{Number(p.true_up) >= 0 ? "+" : "−"}{rp(Math.abs(Number(p.true_up)))}</td><td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{PERIOD_STATUS_LABEL[p.status]}</Badge></td>
                <td>{p.status === "awaiting_topup" && <form action={topupAction}><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><button className="btn sm">Cek bayar</button></form>}{p.status === "posted" && <form action={postPeriodAction}><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><button className="btn sm">Proses ulang</button></form>}</td></tr>))}</tbody></table>}

            {info.state !== "Verified" && (
              <div className="grid c3 mt">
                <div className="stack"><b className="small">Cadangan buyback</b><p className="small muted">Diisi oleh Grounds (SPV) dari modal SPV, di halaman SPV.</p></div>
                <form action={valuationAction} className="stack"><input type="hidden" name="seriesId" value={s.id} /><b className="small">Usulkan revaluasi (butuh verifier)</b><input className="input" name="valuation" type="number" placeholder="Valuasi baru V (Rp)" required /><input className="input" name="reason" placeholder="Dasar revaluasi" required /><button className="btn sm">Usulkan</button></form>
                <div className="stack"><b className="small">Kepatuhan</b>
                  <form action={freezeAction} className="stack"><input type="hidden" name="seriesId" value={s.id} /><input className="input" name="wallet" placeholder="0x… wallet" required /><input className="input" name="reason" placeholder="Alasan" required /><div className="row"><button className="btn sm" name="frozen" value="1">Bekukan</button><button className="btn sm ghost" name="frozen" value="0">Cabut</button></div></form>
                  <details><summary className="small" style={{ cursor: "pointer" }}>Forced transfer</summary><form action={forceAction} className="stack" style={{ marginTop: 6 }}><input type="hidden" name="seriesId" value={s.id} /><input className="input" name="from" placeholder="Dari 0x…" required /><input className="input" name="to" placeholder="Ke 0x… (terverifikasi)" required /><input className="input" name="tokens" type="number" placeholder="Jumlah token" required /><input className="input" name="reason" placeholder="Dasar hukum / alasan" required /><button className="btn sm">Kirim</button></form></details>
                </div>
              </div>
            )}
            {cheats && sp.cheat === s.id && (
              <div className="stack" style={{ marginTop: 14 }}>
                <h3>Platform mencoba curang: kontrak yang menjawab</h3>
                <p className="small muted">Percobaan nyata dari wallet backend (CONTROLLER + slot PLATFORM) yang disimulasikan ke node Sepolia tanpa dikirim.</p>
                {cheats.map((c) => (
                  <div className="cheat" key={c.id}><span className={`verdict ${c.result.ok ? "passed" : "blocked"}`}>{c.result.ok ? "LOLOS (BUG)" : "DITOLAK"}</span><b>{c.title}</b><span className="small muted">{c.how}</span>{!c.result.ok && <code>{c.result.error}</code>}</div>
                ))}
              </div>
            )}
          </Card>
        );
      }))}

      {(wds ?? []).length > 0 && <Card title="Penarikan investor (sandbox)" className="mt"><table className="table small"><tbody>{wds!.map((w) => <tr key={w.id}><td>{dt(w.created_at)}</td><td>{rp(Number(w.amount))}</td><td><Badge tone={w.status === "Settled" ? "ok" : w.status === "Failed" ? "bad" : "info"}>{w.status}</Badge></td><td>{w.status !== "Failed" && <form action={withdrawalAction} className="row"><input type="hidden" name="id" value={w.id} />{w.status !== "Settled" && <button className="btn sm">Majukan</button>}<input className="input sm" name="reason" placeholder="alasan gagal" /><button className="btn sm ghost" name="fail" value="1">Tandai gagal</button></form>}</td></tr>)}</tbody></table></Card>}
    </div>
  );
}
