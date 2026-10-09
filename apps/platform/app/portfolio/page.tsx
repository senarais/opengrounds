import Link from "next/link";
import { getAddress } from "viem";
import { Badge, Card, Empty, Flash, Kpi, Notice, PageHeader } from "@venue-rwa/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PoolJar } from "@/components/visual/PoolJar";
import { RedeemButton, TransferButton, WalletStatus } from "@/components/Wallet";
import { chain, publicClient, readSeries, seriesAbi, tokenAbi } from "@/lib/chain";
import { requireInvestor } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { isKycVerified } from "@/lib/flows/investor";
import { pct, rp, short } from "@/lib/format";
import { listOfferings } from "@/lib/offering";
import { diditConfig } from "@/lib/didit";
import { latestKyc, syncKyc } from "@/lib/flows/kyc";
import { settleWalletPurchases } from "@/lib/flows/payment";
import { xenditConfigured, xenditTestMode } from "@/lib/psp";
import { kyc, refund, startDidit } from "./actions";

export const dynamic = "force-dynamic";

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ kyc?: string; s?: string; ok?: string; err?: string; pay?: string }> }) {
  const sp = await searchParams;
  const me = await requireInvestor();
  const pf = platformDb();
  const wallet = me.wallet ? getAddress(me.wallet) : null;
  const didit = diditConfig().configured;
  if (didit && sp.kyc === "return") await syncKyc(me.userId).catch(() => null);
  const lastKyc = didit ? await latestKyc(me.userId) : null;
  const kycOk = wallet ? await isKycVerified(wallet) : false;
  // pembayaran lewat payment gateway: selesaikan yang sudah dibayar (mint token) dan tampilkan yang masih menunggu
  const settled = wallet && xenditConfigured() ? await settleWalletPurchases(wallet).catch((e) => ({ ok: undefined, err: String(e?.message ?? e) })) : null;
  const { data: waiting } = wallet && xenditConfigured() ? await pf.from("purchases").select("id, units, amount, psp_url, status, expires_at, note, series_id").eq("wallet", wallet).in("status", ["pending", "paid", "mint_failed"]).order("created_at", { ascending: false }) : { data: [] as any[] };
  const offerings = await listOfferings();

  // posisi di setiap seri
  const rows = wallet ? await Promise.all(offerings.filter((o) => o.s).map(async ({ series, venue, s }) => {
    const ref = { series: series.contract_address, token: series.token_address };
    const [bal, locked, nonce, tnonce] = await Promise.all([
      publicClient.readContract({ address: ref.token, abi: tokenAbi, functionName: "balanceOf", args: [wallet] }) as Promise<bigint>,
      publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "pendingUnits", args: [wallet] }) as Promise<bigint>,
      publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "redeemNonce", args: [wallet] }) as Promise<bigint>,
      publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "transferNonce", args: [wallet] }) as Promise<bigint>,
    ]);
    const { data: ps } = await pf.from("purchases").select("amount, refunded_at").eq("series_id", series.id).eq("wallet", wallet).eq("status", "minted");
    const paid = (ps ?? []).reduce((a, p) => a + Number(p.amount), 0);
    const refunded = (ps ?? []).length > 0 && (ps ?? []).every((p) => p.refunded_at);
    const info = s!;
    const per = info.S > 0n ? Number((info.P - info.R) / info.S) : 0;
    return { series, venue, info, bal, locked, nonce, tnonce, paid, per, ref, refunded };
  })) : [];
  const held = rows.filter((r) => r.bal > 0n || r.paid > 0);
  // perkiraan bagian ke depan per token per bulan (dari omzet yang tercatat di halaman penawaran; konservatif = setelah haircut)
  const { data: vds } = held.length ? await pf.from("venues").select("id, disclosure, data_source").in("id", held.map((r) => r.venue.id)) : { data: [] as any[] };
  const future = (r: (typeof held)[number]) => {
    const v = (vds ?? []).find((x) => x.id === r.venue.id);
    const months: number[] = [...(v?.disclosure?.public?.performance?.months ?? [])].sort((a: number, b: number) => a - b);
    const med = months.length ? months[Math.floor(months.length / 2)]! : 0;
    const supply = Number(r.info.cap) || 1;
    const high = (med * r.series.share_bps) / 10_000 / supply;
    const haircut = v?.data_source === "self_reported" ? 0.35 : 0.2;
    const monthsLeft = Math.round(r.series.tenor_days / 30);
    return { low: high * (1 - haircut) * monthsLeft, high: high * monthsLeft, monthsLeft };
  };
  const totalPaid = held.reduce((a, r) => a + r.paid, 0);
  const totalValue = held.reduce((a, r) => a + Number(r.bal) * r.per, 0);

  return (
    <div className="container">
      <PageHeader eyebrow="Investor" title="Portofolio" lead="Token tidak punya harga pasar. Yang ditampilkan adalah apa yang Anda bayar dan nilai tebus saat ini (estimasi). Harga beli tidak sama dengan nilai tebus." />
      <Flash ok={settled?.ok ?? sp.ok} err={settled?.err ?? sp.err} />
      {(waiting ?? []).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Card title="Pembayaran menunggu" subtitle={`Token masuk ke wallet setelah payment gateway mengonfirmasi pembayaran.${xenditTestMode() ? " Xendit dalam mode uji: bayar lewat tombol simulasi di halaman Xendit, tidak ada uang sungguhan." : ""}`}>
            <table className="table"><tbody>{(waiting ?? []).map((w: any) => (
              <tr key={w.id}>
                <td><b>{Number(w.units).toLocaleString("id-ID")} token</b><div className="small muted">{rp(w.amount)}{w.note ? ` · ${w.note}` : ""}</div></td>
                <td>{w.status === "pending" ? <Badge tone="warn">menunggu bayar</Badge> : w.status === "paid" ? <Badge tone="info">memproses token</Badge> : <Badge tone="bad">token gagal di-mint</Badge>}</td>
                <td className="r">{w.status === "pending" && w.psp_url && <a className="btn sm primary" href={w.psp_url}>Lanjut bayar</a>} <Link className="btn sm" href="/portfolio">Cek status</Link></td>
              </tr>
            ))}</tbody></table>
          </Card>
        </div>
      )}
      {(waiting ?? []).some((w: any) => w.status === "pending" || w.status === "paid") && <AutoRefresh seconds={10} />}
      {held.length > 0 && <AutoRefresh seconds={20} />}

      <div className="grid c2">
        <Card title="1 · Wallet" subtitle="Token di-mint ke wallet Anda sendiri; tidak ada transaksi kripto di sisi investor selain tanda tangan.">
          {wallet ? <div className="row between"><span className="mono">{short(wallet)}</span><Badge tone="ok">terhubung</Badge></div> : <WalletStatus authId={me.authId} chainId={chain.id} />}
        </Card>
        {didit ? (
          <Card title="2 · KYC" subtitle="Verifikasi identitas oleh Didit. Platform hanya menyimpan status terikat wallet, bukan KTP/selfie.">
            {!wallet ? <p className="muted small">Hubungkan wallet dulu.</p> : kycOk ? <Badge tone="ok">KYC terverifikasi</Badge> : (
              <div className="stack" style={{ ["--gap" as any]: "8px" }}>
                {lastKyc?.state === "review" && <Notice tone="warn">Verifikasi sedang ditinjau.</Notice>}
                {lastKyc?.state === "rejected" && <Notice tone="warn">Verifikasi ditolak. Anda bisa mencoba lagi.</Notice>}
                {lastKyc?.state === "pending" && <p className="small muted">Sesi belum selesai. Lanjutkan di Didit.</p>}
                <form action={startDidit}><button className="btn primary">{lastKyc ? "Mulai ulang verifikasi (Didit)" : "Mulai verifikasi (Didit)"}</button></form>
                {lastKyc && <Link className="btn sm" href="/portfolio?kyc=return">Periksa status</Link>}
              </div>
            )}
          </Card>
        ) : (
        <Card title="2 · KYC (mock)" subtitle="Simulasi dan dilabeli. Platform hanya menyimpan status terikat wallet, bukan KTP/selfie.">
          {!wallet ? <p className="muted small">Hubungkan wallet dulu.</p> : kycOk ? <Badge tone="ok">KYC (mock) lolos</Badge> : (
            <form action={kyc}><input type="hidden" name="back" value="/portfolio" /><button className="btn primary">Verifikasi KYC (mock)</button></form>
          )}
        </Card>
        )}
      </div>

      {wallet && (
        <>
          <div className="grid c4 mt">
            <Kpi label="Total dibayar" value={rp(totalPaid)} hint="rupiah simulasi" />
            <Kpi label="Nilai tebus (final)" value={rp(totalValue)} hint="estimasi" accent />
            <Kpi label="Seri dimiliki" value={held.length} />
          </div>
          <div className="mt"><Notice tone="warn" title="Ingat:">Tebus awal berarti kehilangan bagian masa depan. Nilai tebus mulai dari sekitar Rp0 dan hanya tumbuh seiring omzet terbukti.</Notice></div>

          <div className="section-title"><h2>Posisi Anda</h2></div>
          {held.length === 0 ? <Card><Empty>Belum ada token. <Link href="/offering" style={{ color: "var(--accent)", fontWeight: 700 }}>Lihat penawaran →</Link></Empty></Card> : (
            <div className="grid c2">
              {held.map((r) => {
                const free = r.bal - r.locked;
                const canRedeem = ["Funded", "Active"].includes(r.info.state) || (r.info.state === "Closed" && r.info.S > 0n);
                return (
                  <Card key={r.series.id} title={r.venue.name} subtitle={`${pct(r.series.share_bps / 10000)} omzet · ${r.series.token_symbol ?? ""} · ${r.info.state}`}
                    actions={<Link className="btn sm" href={`/offering/${r.series.id}`}>Detail</Link>}>
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <span className="badge plain">{r.bal.toString()} token</span>
                      {r.locked > 0n && <span className="badge warn">{r.locked.toString()} terkunci untuk redeem</span>}
                      {r.paid === 0 && r.bal > 0n && <span className="badge info">diterima lewat transfer</span>}
                    </div>
                    <PoolJar label={r.paid > 0 ? "Posisi Anda" : "Posisi Anda (garis = harga awal token)"} paid={r.paid > 0 ? r.paid : Number(r.bal) * Number(r.info.unitPrice)} value={Number(r.bal) * r.per} />
                    {r.info.state === "Failed" && (
                      <>
                        <div className="divider" />
                        {r.bal > 0n ? (
                          <div className="stack" style={{ ["--gap" as any]: "8px" }}>
                            <Notice tone="warn">Penawaran gagal: minimum raise tidak tercapai. Anda berhak atas <b>refund penuh</b> ({rp(Number(r.bal) * Number(r.info.unitPrice))}).</Notice>
                            <form action={refund}><input type="hidden" name="back" value="/portfolio" /><input type="hidden" name="s" value={r.series.id} /><button className="btn primary">Ajukan refund penuh</button></form>
                          </div>
                        ) : <Badge tone="ok">{r.refunded ? "Sudah direfund" : "Tidak ada token"}</Badge>}
                      </>
                    )}
                    {["Funded", "Active"].includes(r.info.state) && free > 0n && (
                      <>
                        <div className="divider" />
                        <div className="eyebrow">Kirim token</div>
                        <TransferButton seriesId={r.series.id} series={r.ref.series} holder={wallet} nonce={r.tnonce.toString()} chainId={chain.id} max={Number(free)} />
                        <p className="small muted" style={{ marginTop: 8 }}>Penerima harus sudah lolos KYC di platform. Platform tidak menetapkan harga dan tidak mengurus pembayaran antar pihak. Nilai tebus mengikuti token, bukan pemilik lama.</p>
                      </>
                    )}
                    {canRedeem && free > 0n && (
                      <>
                        <div className="divider" />
                        <RedeemButton seriesId={r.series.id} series={r.ref.series} holder={wallet} nonce={r.nonce.toString()} chainId={chain.id} max={Number(free)} valuePerToken={r.per} futurePerToken={future(r)} />
                        <p className="small muted" style={{ marginTop: 8 }}>Anda menandatangani permintaan di wallet (tanpa gas). Kustodian (simulasi) lalu membayar dan token dibakar.</p>
                      </>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
