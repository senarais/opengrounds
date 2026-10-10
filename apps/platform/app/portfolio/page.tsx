import Link from "next/link";
import { getAddress, type Address } from "viem";
import { Badge, Card, Empty, Flash, Kpi, Notice, PageHeader, Bars } from "@venue-rwa/ui";
import { SellBackBox, WalletStatus } from "@/components/Wallet";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Statements } from "@/components/Statements";
import { requireInvestor } from "@/lib/auth";
import { readHolder, readSeries, etherscanTx } from "@/lib/chain";
import { diditConfig } from "@/lib/didit";
import { platformDb } from "@/lib/db";
import { balanceOf, ledgerOf, WITHDRAW_STATUS_LABEL, withdrawalsOf } from "@/lib/flows/cash";
import { activeBankAccount, kycOf, syncDiditKyc } from "@/lib/flows/investor";
import { ORDER_STATUS_LABEL, syncOrders } from "@/lib/flows/orders";
import { SELLBACK_STATUS_LABEL } from "@/lib/flows/sellback";
import { date, dt, rp } from "@/lib/format";
import { cancelOrderAction, cancelSellBackAction, mockKycAction, saveBankAction, startKycAction, withdrawAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portofolio" };

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; kyc?: string }> }) {
  const sp = await searchParams;
  const me = await requireInvestor();
  if (sp.kyc === "return") await syncDiditKyc(me.userId).catch(() => null);
  const syncErrs = await syncOrders(me.userId).catch(() => []);
  const pf = platformDb();
  const [kyc, bank, balance, ledger, wds] = await Promise.all([kycOf(me.userId), activeBankAccount(me.userId), balanceOf(me.userId), ledgerOf(me.userId, 12), withdrawalsOf(me.userId)]);
  const { data: orders } = await pf.from("orders").select("*, series(symbol, venue_id)").eq("user_id", me.userId).order("created_at", { ascending: false }).limit(15);
  const { data: sbs } = await pf.from("sellback_requests").select("*").eq("user_id", me.userId).order("created_at", { ascending: false }).limit(10);
  const { data: allocated } = await pf.from("orders").select("series_id").eq("user_id", me.userId).eq("status", "ALLOCATED");
  const seriesIds = [...new Set((allocated ?? []).map((o) => o.series_id))];
  const { data: seriesRows } = seriesIds.length ? await pf.from("series").select("*, venues(name)").in("id", seriesIds) : { data: [] as any[] };
  const holdings = me.wallet ? await Promise.all((seriesRows ?? []).map(async (s: any) => {
    const addr = s.contract_address as Address;
    const info = await readSeries(addr);
    const h = await readHolder(addr, info.token, getAddress(me.wallet!));
    return { s, info, h };
  })) : [];
  const kycOk = kyc?.status === "verified";
  const live = diditConfig().configured;
  const bankOk = bank?.status === "verified";
  const canSignOut = true;

  const chartRows = holdings.map((x) => ({
    label: x.s.symbol,
    value: Number(x.h.balance) * Number(x.info.refPriceIdr),
    display: rp(Number(x.h.balance) * Number(x.info.refPriceIdr)),
  })).sort((a, b) => b.value - a.value);

  return (
    <div className="container">
      <AutoRefresh seconds={15} />
      <PageHeader eyebrow="Investor" title="Portofolio" lead="Token Anda, saldo hasil jatah, dan status pesanan." />
      <Flash ok={sp.ok} err={sp.err} />
      {ledger.some((entry) => String(entry.ref).startsWith("demo-test-balance-")) && <Notice tone="info" title="Saldo distribusi telah ditambahkan">Saldo ledger Anda telah ditambahkan. Anda dapat menarik saldo ini langsung ke rekening bank Anda melalui Xendit Payout secara real-time.</Notice>}
      {syncErrs.length > 0 && <Notice tone="warn" title="Sebagian pesanan belum selesai diproses:">{syncErrs[0]}</Notice>}

      <div className="grid c3">
        <Card title="1. Wallet" subtitle="Dibuat otomatis, kuncinya disimpan Privy">
          {me.wallet ? <><span className="mono small">{me.wallet}</span><div className="small muted">Tanpa biaya gas untuk Anda. Platform yang mengirim transaksi.</div></> : <WalletStatus />}
        </Card>
        <Card title="2. KYC" subtitle={live ? "Didit" : "Mock berlabel sandbox (Didit belum dikonfigurasi)"}>
          {kycOk ? <Badge tone="ok">Terverifikasi{kyc?.provider === "mock" ? " (mock)" : ""}</Badge> : kyc?.status === "rejected" ? <Badge tone="bad">Ditolak</Badge> : live ? (
            <form action={startKycAction}><button className="btn primary" disabled={!me.wallet}>Mulai verifikasi identitas</button><p className="small muted" style={{ marginTop: 6 }}>KTP dan selfie diproses Didit; platform hanya menerima status dan nama.</p></form>
          ) : (
            <form action={mockKycAction} className="stack" style={{ ["--gap" as any]: "8px" }}>
              <label className="field">Nama lengkap sesuai KTP<input className="input" name="name" required minLength={3} defaultValue={me.name} /></label>
              <button className="btn primary" disabled={!me.wallet}>Verifikasi (mock)</button>
              <p className="small muted">Ini simulasi. Tidak ada identitas yang diperiksa.</p>
            </form>
          )}
        </Card>
        <Card title="3. Rekening bank" subtitle="Atas nama sendiri; nama harus sama dengan KYC">
          {bank ? <div className="small"><b>{bank.bank}</b> {bank.account_masked}<div className="muted">a.n. {bank.holder_name}</div>{bank.status === "cooling_off" && <Badge tone="warn">Masa tunggu sampai {dt(bank.cooling_until)}</Badge>}</div> : null}
          {kycOk ? (
            <details style={{ marginTop: 8 }} open={!bank}><summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>{bank ? "Ganti rekening (tunggu 48 jam)" : "Daftarkan rekening"}</summary>
              <form action={saveBankAction} className="stack" style={{ ["--gap" as any]: "8px", marginTop: 8 }}>
                <input className="input" name="bank" placeholder="Bank (mis. BCA)" required />
                <input className="input" name="number" placeholder="Nomor rekening" required inputMode="numeric" />
                <input className="input" name="holder" placeholder="Nama pemilik rekening" required />
                <button className="btn">Simpan</button>
                <p className="small muted">Pencocokan nama otomatis adalah mock; layanan cek nama bank belum terverifikasi.</p>
              </form>
            </details>
          ) : <p className="small muted">Selesaikan KYC dulu.</p>}
        </Card>
      </div>

      <div className="grid c3 mt">
        <Kpi label="Saldo tersedia" value={rp(balance)} hint="untuk tarik atau reinvest · rupiah simulasi" accent />
        <Kpi label="Token dimiliki" value={holdings.reduce((a, x) => a + Number(x.h.balance), 0).toLocaleString("id-ID")} />
        <Kpi label="Jatah kumulatif" value={rp(holdings.reduce((a, x) => a + Number(x.h.claimable), 0))} hint="hitungan kontrak, termasuk yang belum dikreditkan" />
      </div>

      <div className="section-title mt"><h2>Token saya</h2><Link className="small" href="/products">Cari produk</Link></div>
      {chartRows.length > 0 && (
        <Card title="Sebaran Portofolio" subtitle="Nilai token berdasarkan harga referensi saat ini" className="mb">
          <Bars rows={chartRows} />
        </Card>
      )}
      {holdings.length === 0 ? <Empty>Belum ada token. <Link href="/products" style={{ fontWeight: 700 }}>Lihat produk</Link></Empty> : holdings.map(({ s, info, h }) => (
        <Card key={s.id} title={<><Link href={`/products/${s.id}`}>{s.venues?.name}</Link> · {s.symbol}</>} subtitle={`${info.state} · harga referensi ${rp(Number(info.refPriceIdr))}`}>
          <div className="grid c2">
            <div>
              <div className="big-amount">{Number(h.balance).toLocaleString("id-ID")} <span className="small muted">token ({(Number(h.balance) / Number(info.supply) * 100).toFixed(2)}% dari supply)</span></div>
              <div className="small muted">Dibayar (harga referensi saat ini): {rp(Number(h.balance) * Number(info.refPriceIdr))}. Nilai tebus dan harga pasar tidak dijanjikan.</div>
              <div className="lots" style={{ marginTop: 10 }}>{h.lots.map((l, i) => {
                const open = l.unlockAt * 1000 <= Date.now();
                return <div className="lot" key={i}><b>{Number(l.amount).toLocaleString("id-ID")}</b><span className="small muted">{open ? "bisa dijual balik" : `terbuka ${dt(new Date(l.unlockAt * 1000).toISOString())}`}</span><span className={`lock ${open ? "open" : ""}`}>{open ? "terbuka" : "terkunci"}</span></div>;
              })}</div>
            </div>
            <div>
              <h3>Jual balik ke treasury</h3>
              {info.state === "Active" ? <SellBackBox seriesId={s.id} unlocked={Number(h.unlocked)} price={Number(info.refPriceIdr) * (10_000 - info.params.sellbackDiscountBps) / 10_000} /> : <p className="small muted">Tidak tersedia saat seri {info.state}.</p>}
            </div>
          </div>
        </Card>
      ))}

      <Card title="Bagaimana laba menjadi saldo Anda?" className="mt">
        <ol className="small" style={{ paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Pelanggan membayar booking lewat gateway. Penjualan PoS belum langsung menjadi saldo investor.</li>
          <li>Di akhir periode, pendapatan dikurangi refund, biaya, pajak, dan cadangan. Platform dan owner menyetujui laporan laba.</li>
          <li>Setelah dana distribusi tersedia, jatah berdasarkan token Anda dikreditkan ke saldo. Token treasury juga mendapat bagiannya, jadi seluruh pool bukan milik investor yang sudah membeli.</li>
          <li><b>Tarik:</b> kirim saldo ke rekening terverifikasi, minimal Rp10.000. <b>Reinvest:</b> buka produk, pilih “Reinvest dari saldo”, lalu tanda tangani pembelian token baru. Lot baru punya masa kunci.</li>
        </ol>
        <p className="small muted">Harga referensi token dan saldo laba adalah dua hal berbeda. Laba tidak otomatis menaikkan harga token. Demo ini memakai rupiah simulasi.</p>
        <Link href="/products" className="btn sm">Pilih produk untuk reinvest</Link>
      </Card>
      <div className="grid c2 mt">
        <Card title="Tarik saldo" subtitle="Hanya ke rekening terdaftar atas nama Anda">
          {bankOk && balance >= 10_000 ? (
            <form action={withdrawAction} className="row">
              <input className="input" name="amount" type="number" min={10000} max={balance} defaultValue={balance} aria-label="Nominal penarikan" />
              <button className="btn primary">Tarik</button>
            </form>
          ) : <p className="small muted">{bank?.status === "cooling_off" ? "Penarikan ditahan selama masa tunggu ganti rekening." : !bank ? "Daftarkan rekening dulu." : "Saldo belum cukup (minimal Rp10.000)."}</p>}
          <p className="small muted" style={{ marginTop: 8 }}>Saldo juga bisa dipakai membeli token (reinvest) di halaman produk. Tidak ada auto-reinvest.</p>
          {wds.length > 0 && <table className="table small" style={{ marginTop: 10 }}><tbody>{wds.slice(0, 5).map((w) => <tr key={w.id}><td>{date(w.created_at)}</td><td>{rp(Number(w.amount))}</td><td><Badge tone={w.status === "Settled" ? "ok" : w.status === "Failed" ? "bad" : "info"}>{WITHDRAW_STATUS_LABEL[w.status]}</Badge></td></tr>)}</tbody></table>}
        </Card>
        <Card title="Riwayat saldo" subtitle="Append-only; koreksi lewat entri pembalik">
          {ledger.length === 0 ? <p className="small muted">Belum ada.</p> : <table className="table small"><tbody>{ledger.map((l) => <tr key={l.id}><td>{date(l.created_at)}</td><td>{{ distribution: "Jatah periode " + (l.period_no ?? ""), withdrawal: "Penarikan", withdrawal_reversal: "Penarikan gagal (dikembalikan)", reinvest: "Reinvest", sellback: "Jual balik", adjustment: String(l.ref).startsWith("demo-test-balance-") ? "Saldo uji demo (bukan bagi hasil)" : "Penyesuaian" }[l.kind as string]}</td><td style={{ textAlign: "right", color: Number(l.amount) < 0 ? "var(--bad)" : "var(--ok)" }}>{Number(l.amount) < 0 ? "−" : "+"}{rp(Math.abs(Number(l.amount)))}</td></tr>)}</tbody></table>}
        </Card>
      </div>

      <div className="section-title mt"><h2>Pesanan</h2></div>
      <Card>
        {(orders ?? []).length === 0 ? <p className="small muted">Belum ada pesanan.</p> : <table className="table small"><thead><tr><th>Tanggal</th><th>Seri</th><th>Token</th><th>Dibayar</th><th>Status</th><th /></tr></thead><tbody>{(orders ?? []).map((o: any) => (
          <tr key={o.id}>
            <td>{dt(o.created_at)}</td><td>{o.series?.symbol}</td><td>{Number(o.tokens).toLocaleString("id-ID")}</td><td>{rp(Number(o.amount_idr))}{o.funding === "balance" ? " (saldo)" : ""}</td>
            <td><Badge tone={o.status === "ALLOCATED" ? "ok" : ["FAILED", "CANCELLED", "EXPIRED"].includes(o.status) ? "bad" : "info"}>{ORDER_STATUS_LABEL[o.status]}</Badge>{o.note && <div className="small muted">{o.note}</div>}</td>
            <td>{o.status === "AWAITING_PAYMENT" && o.psp_url && <a className="btn sm primary" href={o.psp_url}>Bayar</a>} {["AWAITING_PAYMENT", "AWAITING_SIGNATURE"].includes(o.status) && <form action={cancelOrderAction} style={{ display: "inline" }}><input type="hidden" name="id" value={o.id} /><button className="btn sm ghost">Batalkan</button></form>}{o.allocated_tx && <a className="small" href={etherscanTx(o.allocated_tx)} target="_blank" rel="noreferrer">tx ↗</a>}</td>
          </tr>))}</tbody></table>}
      </Card>
      {(sbs ?? []).length > 0 && <Card title="Pengajuan jual balik" className="mt"><table className="table small"><tbody>{(sbs ?? []).map((r) => <tr key={r.id}><td>{dt(r.created_at)}</td><td>{Number(r.tokens).toLocaleString("id-ID")} token</td><td>{rp(Number(r.amount_idr))}</td><td><Badge tone={r.status === "Executed" ? "ok" : r.status === "Queued" ? "info" : "neutral"}>{SELLBACK_STATUS_LABEL[r.status]}</Badge></td><td>{["Queued", "AwaitingSignature"].includes(r.status) && canSignOut && <form action={cancelSellBackAction}><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost">Batalkan</button></form>}</td></tr>)}</tbody></table></Card>}
      <div className="mt"><Statements /></div>
    </div>
  );
}
