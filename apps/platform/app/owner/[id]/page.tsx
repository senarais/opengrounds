import { notFound } from "next/navigation";
import { Badge, Card, Flash, KV, Notice, PageHeader } from "@venue-rwa/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AttestSignButton, WalletStatus } from "@/components/Wallet";
import { requireOwner } from "@/lib/auth";
import { chain, etherscanTx, readSeries } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { cashBalance } from "@/lib/flow";
import { KYB_STATUS_LABEL, latestCase } from "@/lib/flows/kyb";
import { ownerOfVenue } from "@/lib/flows/onboarding";
import { checkDeadlines, ingestSplits, PERIOD_STATUS_LABEL, periodsOf, draftWaterfall } from "@/lib/flows/periods";
import { seriesOfVenue } from "@/lib/flows/series";
import { dt, rp } from "@/lib/format";
import { disputeAction, expenseAction, removeExpenseAction, resubmitAction, topupSyncAction } from "./actions";

export const dynamic = "force-dynamic";
const POS_URL = process.env.POS_URL ?? "http://localhost:3001";
const CATEGORIES = [["opex", "Biaya operasional (listrik, gaji, perawatan)"], ["operator_fee", "Fee operator"], ["reserve", "Cadangan venue"]];

export default async function OwnerVenue({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireOwner(`/owner/${id}`);
  if ((await ownerOfVenue(id).catch(() => null)) !== me.userId) notFound();
  const pf = platformDb();
  const { data: v } = await pf.from("venues").select("*").eq("id", id).single();
  const kc = await latestCase(id);
  const s = await seriesOfVenue(id);
  let info = null as Awaited<ReturnType<typeof readSeries>> | null;
  let periods: any[] = [], atts: any[] = [], items: any[] = [], draft = null as Awaited<ReturnType<typeof draftWaterfall>> | null, pocket = 0, ownerCash = 0;
  if (s?.contract_address) {
    await checkDeadlines(s.id).catch(() => null);
    await ingestSplits(s.id).catch(() => null);
    info = await readSeries(s.contract_address);
    periods = await periodsOf(s.id);
    ({ data: atts } = (await pf.from("attestations").select("*").eq("series_id", s.id).in("status", ["collecting"]).order("created_at")) as any);
    if (s.status === "Active" || info.state !== "Verified") {
      const last = periods[0];
      draft = await draftWaterfall(s.id, new Date(last?.period_end ?? s.created_at), new Date()).catch(() => null);
      items = draft?.items ?? [];
    }
    pocket = await cashBalance(s.id, "spv_pocket"); ownerCash = await cashBalance(s.id, "owner");
  }
  const acq = (atts ?? []).find((a) => a.kind === "ACQUISITION_CLOSED");
  const acqSigned = acq && (acq.signatures ?? []).some((x: any) => x.slot === "COUNTERPARTY");

  return (
    <div className="container">
      <AutoRefresh seconds={20} />
      <PageHeader eyebrow="Owner" title={v.name} lead={`${v.city}, ${v.province}`}>{v.pos_company_id && <a className="btn dark" href={POS_URL} target="_blank" rel="noreferrer">Buka PoS ↗</a>}</PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {!me.wallet && <Notice tone="warn" title="Wallet Anda sedang dibuat.">Wallet dipakai untuk menandatangani akuisisi dan angka laba bulanan (tanpa gas). <WalletStatus /></Notice>}

      <Card title="Verifikasi (KYB)" subtitle="Pemeriksaan otomatis lalu tinjauan reviewer manusia" className="mt">
        <div className="row"><Badge tone={kc?.status === "APPROVED" ? "ok" : kc?.status === "REJECTED" ? "bad" : kc?.status === "NEEDS_INFO" ? "warn" : "info"}>{KYB_STATUS_LABEL[kc?.status ?? "DRAFT"]}</Badge></div>
        {kc?.decision_note && <p className="small" style={{ marginTop: 8 }}><b>Catatan reviewer:</b> {kc.decision_note}</p>}
        {kc?.status === "NEEDS_INFO" && <form action={resubmitAction}><input type="hidden" name="venueId" value={id} /><button className="btn" style={{ marginTop: 8 }}>Saya sudah melengkapi, periksa ulang</button><p className="small muted">Perubahan data dilakukan lewat pengajuan baru bila diperlukan; hubungi tim untuk menambah dokumen.</p></form>}
        {kc?.status === "REJECTED" && <p className="small muted">Anda dapat melengkapi data dan mengajukan ulang sebagai pengajuan baru.</p>}
      </Card>

      {s && !acq && s.status === "Verified" && <div className="mt"><Notice tone="info" title="Review disetujui">Platform sedang menyiapkan tanda tangan akuisisi. Setelah tersedia, periksa detail pengalihan hak dan pembayaran lalu tanda tangani lewat wallet Anda.</Notice></div>}
      {acq && (
        <Card title="Tanda tangan akuisisi" subtitle="ACQUISITION_CLOSED: platform + owner" tone="accent" className="mt">
          <p className="small">Anda adalah penjual. Dengan menandatangani, Anda menyatakan: hak manfaat ekonomi <b>{(s!.stake_bps / 100).toLocaleString("id-ID")}%</b> atas laba bersih venue ini dialihkan ke Grounds, dan dana <b>{rp(Math.floor(Number(s!.valuation_idr) * s!.stake_bps / 10_000))}</b> sudah Anda terima (<b>simulasi</b>, tidak ada uang sungguhan). Setelah tanda tangan platform dan Anda lengkap, {Number(s!.supply).toLocaleString("id-ID")} token dicetak sekali ke treasury Grounds.</p>
          <KV rows={[["Valuasi (V)", rp(Number(s!.valuation_idr))], ["Harga referensi", rp(Number(s!.ref_price))], ["Grounds (SPV) via Open Grounds", (acq.signatures ?? []).some((x: any) => x.slot === "PLATFORM") ? <Badge tone="ok">sudah</Badge> : "belum"], ["Anda", acqSigned ? <Badge tone="ok">sudah</Badge> : "belum"]]} />
          {!acqSigned && <div style={{ marginTop: 10 }}><AttestSignButton attId={acq.id} via="privy" chainId={chain.id} label="Tanda tangani akuisisi (simulasi)" confirmText={`Anda menyatakan ${(s!.stake_bps / 100).toLocaleString("id-ID")}% hak manfaat ekonomi atas laba bersih yang bisa dibagikan dari ${v.name} dialihkan ke Grounds, dan dana ${rp(Math.floor(Number(s!.valuation_idr) * s!.stake_bps / 10_000))} telah diterima. Ini simulasi di testnet; tidak ada uang sungguhan yang dipindahkan.`} /></div>}
        </Card>
      )}

      {s && info && (
        <>
          <div className="grid c3 mt">
            <Card title="Seri"><Badge tone={info.state === "Active" ? "ok" : "warn"}>{info.state}</Badge><div className="small muted" style={{ marginTop: 6 }}>{Number(info.supply).toLocaleString("id-ID")} token · beredar {Number(info.circulating).toLocaleString("id-ID")}</div></Card>
            <Card title="Kantong SPV periode ini" subtitle="Split harian dari gateway (sandbox)"><div className="big-amount">{rp(pocket)}</div><div className="small muted">{s.split_bps / 100}% tiap pembayaran booking. Dikoreksi ke hak SPV saat tutup periode.</div></Card>
            <Card title="Diterima owner (simulasi)"><div className="big-amount">{rp(ownerCash)}</div><div className="small muted">dana akuisisi + sisa split harian − fee platform ± koreksi</div></Card>
          </div>

          {info.state !== "Verified" && (
            <Card title="Biaya periode berjalan" subtitle="Biaya diajukan dengan bukti; hanya yang disetujui masuk waterfall. Di atas ambang ditinjau reviewer." className="mt">
              <form action={expenseAction} className="grid c3" style={{ alignItems: "end" }}>
                <input type="hidden" name="venueId" value={id} /><input type="hidden" name="seriesId" value={s.id} />
                <label className="field">Kategori<select className="input" name="category">{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field">Nominal (Rp)<input className="input" name="amount" type="number" min={1} required /></label>
                <label className="field">Catatan / nomor bukti<input className="input" name="note" /></label>
                <button className="btn primary">Catat biaya</button>
              </form>
              {items.length > 0 && <table className="table small" style={{ marginTop: 10 }}><tbody>{items.map((i) => <tr key={i.id}><td>{i.category}</td><td>{rp(Number(i.amount))}</td><td>{i.note}</td><td><Badge tone={i.status === "approved" ? "ok" : i.status === "rejected" ? "bad" : "warn"}>{i.status === "pending" ? "menunggu tinjauan" : i.status === "approved" ? "disetujui" : "ditolak"}</Badge></td><td>{i.status === "pending" && <form action={removeExpenseAction}><input type="hidden" name="venueId" value={id} /><input type="hidden" name="id" value={i.id} /><button className="btn sm ghost">Hapus</button></form>}</td></tr>)}</tbody></table>}
              {draft && <p className="small muted" style={{ marginTop: 8 }}>Perkiraan sementara periode {draft.periodNo}: omzet kotor {rp(draft.w.gross)}, biaya {rp(draft.w.opex)} (termasuk fee gateway), pajak {rp(draft.w.tax)}.</p>}
            </Card>
          )}

          <div className="section-title mt"><h2>Periode bulanan</h2></div>
          {periods.length === 0 ? <Card><p className="muted small">Belum ada periode. Operator menutup periode (di production tiap akhir bulan).</p></Card> : periods.map((p) => {
            const att = (atts ?? []).find((a) => a.kind === "REVENUE_PERIOD" && Number(a.ref_id) === p.period_no);
            const signed = att && (att.signatures ?? []).some((x: any) => x.slot === "COUNTERPARTY");
            return (
              <Card key={p.id} title={`Periode ${p.period_no}`} subtitle={`${dt(p.period_start)} → ${dt(p.period_end)}`} className="mt">
                <div className="row" style={{ marginBottom: 8 }}><Badge tone={p.status === "paid" ? "ok" : p.status === "disputed" ? "bad" : "warn"}>{PERIOD_STATUS_LABEL[p.status]}</Badge></div>
                <div className="grid c2">
                  <div className="wf">
                    <div className="wf-row"><span>Omzet kotor (PoS, lewat gateway)</span><b>{rp(Number(p.gross))}</b></div>
                    {[["Refund", p.refunds], ["Biaya operasional (+ fee gateway)", p.opex], ["Pajak", p.tax], ["Fee operator", p.operator_fee], ["Cadangan venue", p.reserve], ["Fee platform", p.platform_fee]].map(([l, n]) => <div className="wf-row minus" key={l as string}><span>− {l}</span><span>{rp(Number(n))}</span></div>)}
                    <div className="wf-row total"><span>D (bisa dibagikan)</span><span>{rp(Number(p.distributable))}</span></div>
                    <div className="wf-row share"><span>Hak SPV (X = {(s.stake_bps / 100).toFixed(0)}%)</span><span>{rp(Number(p.p_spv))}</span></div>
                  </div>
                  <div>
                    <KV rows={[["Kantong SPV terkumpul", rp(Number(p.pocket_collected))], ["Koreksi", Number(p.true_up) >= 0 ? `kelebihan ${rp(Number(p.true_up))} kembali ke Anda` : `kurang ${rp(-Number(p.true_up))} harus Anda lengkapi`], ["Anda terima dari laba", rp(Number(p.distributable) - Number(p.p_spv) + Number(p.operator_fee))]]} />
                    {p.status === "awaiting_owner" && att && !signed && <div className="stack" style={{ marginTop: 10 }}>
                      <p className="small muted">Tanda tangan sebelum {dt(p.owner_deadline)}. Lewat itu, verifier independen boleh menggantikan Anda.</p>
                      <AttestSignButton attId={att.id} via="privy" chainId={chain.id} label="Setujui angka & tanda tangani" confirmText="Anda menyetujui angka waterfall periode ini?" />
                      <details><summary className="small" style={{ cursor: "pointer" }}>Angka tidak sesuai? Ajukan sengketa</summary>
                        <form action={disputeAction} className="stack" style={{ marginTop: 8 }}><input type="hidden" name="venueId" value={id} /><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><textarea className="input" name="reason" rows={2} required minLength={10} placeholder="Angka mana yang tidak sesuai dan mengapa" /><button className="btn sm">Ajukan sengketa</button></form></details>
                    </div>}
                    {p.status === "awaiting_topup" && <div className="stack" style={{ marginTop: 10 }}><Notice tone="warn" title="Lengkapi kekurangan koreksi">Bayar lewat payment gateway{p.topup_url?.startsWith("/sandbox") ? " (sandbox)" : ""}; setelah itu jatah investor dikreditkan. Bila tidak dipenuhi sampai tenggat, seri berstatus Overdue.</Notice><div className="row"><a className="btn primary" href={p.topup_url}>Bayar {rp(-Number(p.true_up))}</a><form action={topupSyncAction}><input type="hidden" name="venueId" value={id} /><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><button className="btn">Saya sudah bayar</button></form></div></div>}
                    {p.posted_tx && <a className="small" href={etherscanTx(p.posted_tx)} target="_blank" rel="noreferrer">tx posting ↗</a>}
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
