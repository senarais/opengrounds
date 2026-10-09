import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabasePosSource, monthlyEligible } from "@venue-rwa/connectors";
import { disclosureHash, hhmm, type Disclosure } from "@venue-rwa/shared";
import { Badge, Bars, Card, Empty, Flash, KV, Notice, PageHeader, Progress, Stepper } from "@venue-rwa/ui";
import { BuyForm, type BuyCalc } from "@/components/BuyForm";
import { CourtDiorama } from "@/components/visual/CourtDiorama";
import { PoolJar } from "@/components/visual/PoolJar";
import { TrustPassport } from "@/components/visual/TrustPassport";
import { diditConfig } from "@/lib/didit";
import { hourlyOccupancy } from "@/lib/occupancy";
import { etherscan, etherscanTx } from "@/lib/chain";
import { posDb } from "@/lib/db";
import { lastSubmitted } from "@/lib/attest";
import { pct, rp, short } from "@/lib/format";
import { loadOffering, STATE_STEPS, stateStep } from "@/lib/offering";
import { onchainSigners } from "@/lib/signers";
import { PUBLIC_KINDS, signedUrl } from "@/lib/storage";
import { buy } from "../../portfolio/actions";
import { isKycVerified } from "@/lib/flows/investor";
import { xenditConfigured, xenditTestMode } from "@/lib/psp";
import { getMe, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
const POS_URL = process.env.POS_URL ?? "http://localhost:3001";
const DOC_LABEL: Record<string, string> = { sales_data: "Data penjualan", ownership: "Bukti kepemilikan", insurance: "Asuransi", consent_letter: "Surat persetujuan bank", lease: "Perjanjian sewa / hak lahan", bank_statement: "Mutasi rekening", loan: "Kredit & jaminan", tax: "NPWP / pajak", license: "Izin usaha", covenant: "Covenant", other: "Lainnya" };
const yn = (b: boolean) => (b ? "Ya" : "Tidak");
const COVER: Record<string, string> = { kebakaran: "kebakaran", gempa: "gempa", banjir: "banjir", tanggung_gugat: "tanggung gugat", gangguan_usaha: "gangguan usaha" };
const OWN: Record<string, string> = { milik: "milik sendiri", sewa: "sewa", tidak_ada: "tidak ada bangunan" };

export default async function OfferingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const o = await loadOffering(id);
  if (!o) notFound();
  const { ctx, series, venue, run, s } = o;
  const pack = venue.disclosure as Disclosure | null;
  const pub = pack?.public;
  const me = await getMe().catch(() => null);

  // kinerja: data PoS/gateway bila ada, selain itu angka yang dilaporkan owner
  let monthly: number[] = pub?.performance.months ?? [];
  if (venue.data_source !== "self_reported" && ctx.companyId) {
    const now = new Date();
    const src = createSupabasePosSource(posDb());
    const [entries, settled] = await Promise.all([src.listEntries(ctx.companyId, new Date(now.getTime() - 200 * 86_400_000), now), src.listSettledPayments(ctx.companyId, new Date(0), new Date(now.getTime() + 86_400_000))]);
    monthly = monthlyEligible(entries, new Set(settled.map((x) => x.bookingId)), now, 6);
  }

  const [{ data: excs }, { data: docs }, submitted, signers] = await Promise.all([
    ctx.pf.from("recon_exceptions").select("id").eq("series_id", series.id).eq("explained", false),
    ctx.pf.from("documents").select("*").eq("venue_id", venue.id).order("uploaded_at"),
    lastSubmitted(series.id), onchainSigners(),
  ]);
  const photos = await Promise.all((docs ?? []).filter((d) => PUBLIC_KINDS.includes(d.kind)).map((d) => signedUrl(d.storage_path, 3600)));
  const privateDocs = (docs ?? []).filter((d) => !PUBLIC_KINDS.includes(d.kind));

  // gerbang detail sensitif: investor yang login, punya wallet, dan sudah lolos KYC (atau staf platform)
  const wallet = me?.role === "investor" ? me.wallet : null;
  const walletKyc = wallet ? await isKycVerified(wallet) : false;
  const kycOk = isStaff(me) || walletKyc;
  const sensitiveDocs = kycOk ? await Promise.all(privateDocs.map(async (d) => ({ d, url: await signedUrl(d.storage_path, 300) }))) : [];

  // hash isi halaman vs yang diverifikasi (masuk evidenceRoot)
  const hashNow = pack ? disclosureHash(pack) : null;
  const hashOk = !!(hashNow && run?.disclosure_hash && run.disclosure_hash === hashNow);

  const step = s ? stateStep(s.state) : { current: 0, failed: false };
  const offering = s?.state === "Offering";
  const remaining = s ? Number(s.cap - s.minted) : 0;
  const minAt = s && Number(s.target) > 0 ? (Number(s.minRaise) / Number(s.target)) * 100 : 0;
  const g = run?.gates as any;
  const back = `/offering/${series.id}`;

  // diorama: okupansi per jam (data PoS bila ada; selain itu ilustrasi berlabel dari angka yang dilaporkan owner)
  const occ = pub ? await hourlyOccupancy({ companyId: ctx.companyId, openHour: pub.profile.openHour, closeHour: pub.profile.closeHour, courts: pub.profile.facilities.length, reportedPct: pub.performance.occupancyPct }) : null;

  // kalkulator: perkiraan masuk kantong per token per bulan (dasar = median omzet; konservatif = setelah haircut sesuai sumber data)
  const sorted = [...monthly].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2) : 0;
  const supply = s ? Number(s.cap) : Math.floor(Number(series.target) / Number(series.unit_price));
  const haircut = venue.data_source === "self_reported" ? 0.35 : venue.data_source === "connector" ? 0.2 : monthly.length >= 12 ? 0.1 : 0.2;
  const perTokenBase = supply > 0 ? (median * series.share_bps) / 10_000 / supply : 0;
  const calc: BuyCalc = { perTokenBase, perTokenCons: perTokenBase * (1 - haircut), tenorMonths: Math.round(series.tenor_days / 30) };
  const kycReal = diditConfig().configured;
  const gateway = xenditConfigured();

  return (
    <div className="container">
      <PageHeader eyebrow={pub ? `${pub.profile.area}, ${pub.profile.city}` : "Penawaran"} title={venue.name} lead={`Jual ${pct(series.share_bps / 10000)} dari Eligible Revenue selama ${Math.round(series.tenor_days / 30)} bulan. Harga tetap ${rp(series.unit_price)} per token (${series.token_symbol ?? "token"}).`}>
        {s && <Badge tone={s.attValid ? "ok" : "warn"}>{s.attValid ? "Attestation valid (on-chain)" : "Belum ada attestation valid"}</Badge>}
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      <div style={{ marginBottom: 22 }}><Stepper steps={STATE_STEPS} current={step.current} failed={step.failed} /></div>

      {photos.filter(Boolean).length > 0 && (
        <div className="grid c3" style={{ marginBottom: 20 }}>
          {photos.filter(Boolean).slice(0, 3).map((u, i) => <img key={i} src={u!} alt={`Foto ${venue.name} ${i + 1}`} style={{ width: "100%", height: 190, objectFit: "cover", borderRadius: 14, border: "1px solid var(--line)" }} />)}
        </div>
      )}

      {pub && occ && pub.profile.facilities.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <CourtDiorama facilities={pub.profile.facilities} hours={occ.hours} openHour={pub.profile.openHour} closeHour={pub.profile.closeHour} source={occ.source} note={occ.note} venueName={venue.name} area={`${pub.profile.area}, ${pub.profile.city}`} />
        </div>
      )}

      <div className="split">
        <div className="stack" style={{ ["--gap" as any]: "20px" }}>
          {pub && (
            <Card title="Profil venue" actions={<Badge plain>publik</Badge>}>
              <KV rows={[
                ["Lokasi", `${pub.profile.area}, ${pub.profile.city}, ${pub.profile.province}`],
                ["Beroperasi sejak", pub.profile.operatingSince],
                ["Tahun dibangun", pub.profile.builtYear],
                ["Asuransi", pub.profile.insurance ? `${pub.profile.insurance.insurer} · pertanggungan ${rp(pub.profile.insurance.sumInsured)} · ${pub.profile.insurance.coverage.map((c) => COVER[c] ?? c).join(", ")} · berlaku sampai ${pub.profile.insurance.validUntil}` : "Tidak diasuransikan"],
                ["Jenis olahraga", pub.profile.sports.join(", ")],
                ["Jumlah lapangan", pub.profile.courts],
                ["Jam operasional", `${hhmm(pub.profile.openHour * 60)}–${hhmm(pub.profile.closeHour * 60)} WIB`],
                ["Tarif", pub.profile.tariffNote],
              ]} />
              <table className="table" style={{ marginTop: 12 }}>
                <thead><tr><th>Lapangan</th><th>Olahraga</th><th>Ukuran</th><th>Lantai</th><th className="r">Tarif/jam</th></tr></thead>
                <tbody>{pub.profile.facilities.map((f, i) => <tr key={i}><td><b>{f.name}</b>{f.indoor && <span className="muted small"> · indoor</span>}</td><td>{f.sport}</td><td className="num">{f.lengthM}×{f.widthM} m</td><td>{f.surface}</td><td className="r num">{rp(f.pricePerHour)}</td></tr>)}</tbody>
              </table>
              {pub.profile.capexPlan && <p className="small" style={{ marginTop: 8 }}>Rencana capex: {pub.profile.capexPlan}</p>}
              <p className="small muted" style={{ marginTop: 10 }}>Ukuran dan jenis lapangan menentukan kapasitas, tarif, dan potensi omzet, sehingga membantu menilai kewajaran proyeksi.</p>
            </Card>
          )}

          <Card title="Kinerja" actions={venue.data_source === "pos" ? <Badge tone="ok">terverifikasi gateway</Badge> : venue.data_source === "connector" ? <Badge tone="warn">dari sistem eksternal owner · belum dicocokkan langsung dengan gateway</Badge> : <Badge tone="warn">dilaporkan owner · belum terverifikasi</Badge>}
            subtitle="Eligible Revenue = penjualan settle − refund − pajak − biaya gateway.">
            {monthly.length ? <Bars rows={monthly.map((m, i) => ({ label: `${(monthly.length - 1 - i) * 30}–${(monthly.length - i) * 30}h`, value: m, display: rp(m) }))} /> : <Empty>Belum ada data.</Empty>}
            <div className="row between small" style={{ marginTop: 12 }}>
              <span className="muted">Okupansi{venue.data_source === "pos" ? "" : " (dilaporkan)"}: <b>{pub?.performance.occupancyPct ?? "–"}{pub ? "%" : ""}</b></span>
              <span>Rekonsiliasi: {(excs?.length ?? 0) === 0 ? <Badge tone="ok">bersih</Badge> : <Badge tone="bad">{excs!.length} exception</Badge>}</span>
            </div>
            {venue.data_source !== "pos" && <div style={{ marginTop: 12 }}><Notice tone="warn">Angka ini dilaporkan owner. Setelah penawaran berjalan, PoS mencatat transaksi dan platform mencocokkannya dengan settlement gateway setiap hari; rilis dana tahap 2 menunggu periode pertama terekonsiliasi bersih.</Notice></div>}
            {ctx.companyId && <p className="small muted" style={{ marginTop: 10 }}><a href={POS_URL} target="_blank" rel="noreferrer">Sumber data (PoS) ↗</a></p>}
          </Card>

          <Card title="Syarat penawaran" actions={<Badge plain>publik</Badge>}>
            {s && (
              <div style={{ ["--at" as any]: `${minAt}%` }} className="marker">
                <Progress value={Number(s.raised)} max={Number(s.target)} left={<><b>{rp(s.raised)}</b> terkumpul</>} right={<>target {rp(s.target)}</>} />
              </div>
            )}
            <p className="small muted" style={{ marginTop: 8 }}>Garis hitam = minimum raise {rp(series.min_raise)}. Tidak tercapai berarti penawaran gagal dan <b>semua investor di-refund penuh</b>.</p>
            <div className="divider" />
            <KV rows={[
              ["Bagian omzet dijual", pct(series.share_bps / 10000)],
              ["Tenor", `${series.tenor_days} hari (≤ hak sewa)`],
              ["Harga per token (tetap)", rp(series.unit_price)],
              ["Harga maksimal di attestation", run ? rp(run.max_price) : "–"],
              ["Harga referensi (dari data historis)", run ? rp(run.reference_price) : "–"],
              ["Rilis dana ke owner", "Tahap 1 ±50% saat target tercapai & attestation valid; tahap 2 setelah periode pertama terekonsiliasi bersih"],
            ]} />
          </Card>

          <Card title="Verifikasi" actions={<Badge plain>publik</Badge>}>
            {run ? (
              <div className="stack" style={{ ["--gap" as any]: "12px" }}>
                <div className="row between"><span>Rekomendasi policy engine</span><Badge tone={run.recommendation === "pass" ? "ok" : "bad"}>{run.recommendation === "pass" ? "Lolos" : "Tidak lolos"} · skor {run.score}/10.000</Badge></div>
                {(g?.warnings ?? []).map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}
                <table className="kv"><tbody>{(g?.gates ?? []).map((x: any) => <tr key={x.id}><td>{x.label}<div className="small muted">{x.detail}</div></td><td><Badge tone={x.pass ? "ok" : "bad"}>{x.pass ? "lolos" : "gagal"}</Badge></td></tr>)}</tbody></table>
              </div>
            ) : <Empty>Belum diverifikasi.</Empty>}
            <div className="divider" />
            <TrustPassport signers={signers} signed={((submitted?.signatures ?? []) as { signer: string }[]).map((x) => x.signer)} valid={!!s?.attValid}
              txUrl={submitted ? etherscanTx(submitted.submitted_tx) : null} evidenceRoot={run?.evidence_root ?? null} gateway={venue.data_source} hashOk={hashOk} />
            <p className="small muted" style={{ marginTop: 10 }}>Hash halaman penawaran ({hashNow ? <span className="mono">{short(hashNow)}</span> : "–"}) masuk ke evidence root attestation. Bila owner mengubah data penting, verifikasi dan attestation harus diperbarui.</p>
          </Card>

          {pub && (
            <Card title="Risiko & kewajiban" actions={<Badge plain>publik</Badge>}>
              <KV rows={[
                ["Tanah / bangunan", `${OWN[pub.risk.land]} / ${OWN[pub.risk.building]}`],
                ...(pub.risk.leaseMonthsRemaining !== null ? [["Sisa masa sewa", `${pub.risk.leaseMonthsRemaining} bulan (tenor ${pub.terms.tenorMonths} bulan)`] as [string, string]] : []),
                ...(pub.risk.land === "milik" || pub.risk.building === "milik" ? [["Aset milik sendiri sedang dijaminkan", yn(pub.risk.ownedAssetPledged)] as [string, string]] : []),
                ["Utang bank", pub.risk.hasBankDebt ? `Ada · cicilan ≈ ${pub.risk.installmentToRevenuePct}% dari omzet rata-rata` : "Tidak ada"],
                ["Kredit melarang jual pendapatan", pub.risk.revenueSaleForbiddenByCredit ? (pub.risk.bankConsentLetter ? "Ya, ada surat persetujuan bank" : "Ya, tanpa surat persetujuan") : "Tidak"],
                ["Sengketa lahan/hukum aktif", yn(pub.risk.activeDispute)],
                ["NPWP / izin usaha", `${pub.risk.hasNpwp ? "NPWP ada" : "tanpa NPWP"} · ${pub.risk.hasBusinessLicense ? "izin usaha ada" : "tanpa izin usaha"}`],
                ["Pembayaran lewat gateway / tunai / transfer sendiri (menurut owner)", `${pub.performance.paymentMix.gatewayPct}% / ${pub.performance.paymentMix.cashPct}% / ${pub.performance.paymentMix.transferPct}%`],
                ["Jaminan utang", pub.risk.collateral],
                ["Omzet sudah dijanjikan ke pihak lain", pub.risk.otherPledgedPct > 0 ? `${pub.risk.otherPledgedPct}%: ${pub.risk.otherPledgeNote}` : "Tidak ada"],
                ...(pub.risk.landlordConsentsToSale !== null ? [["Pemilik lahan setuju omzet dijual", yn(pub.risk.landlordConsentsToSale)] as [string, string]] : []),
                ...(pub.risk.leaseRenewalOption !== null ? [["Opsi perpanjang sewa", yn(pub.risk.leaseRenewalOption)] as [string, string]] : []),
                ["Transaksi pihak terkait", pub.risk.relatedParty ? `Ada: ${pub.risk.relatedPartyNote}` : "Tidak ada"],
                ["Tujuan dana (pengungkapan, tidak dienforce)", pub.risk.useOfFunds || "–"],
              ]} />
              <p className="small muted" style={{ marginTop: 10 }}>Dibagi dari <b>omzet</b>, bukan laba: owner tetap membayar bagian investor saat rugi. Tanpa agunan fisik dan tanpa harga pasar; token hanya bisa dipindahkan antar investor yang lolos KYC, atau ditebus.</p>
            </Card>
          )}

          <Card title="Detail sensitif" actions={<Badge tone={kycOk ? "ok" : "neutral"}>{kycOk ? "terbuka (KYC)" : "khusus investor KYC"}</Badge>}>
            {kycOk ? (
              <div className="stack" style={{ ["--gap" as any]: "12px" }}>
                <KV rows={[["Alamat lengkap", pack ? [pack.sensitive.address, `Kel. ${pack.sensitive.kelurahan}`, pack.sensitive.postalCode, pack.sensitive.landmark].filter(Boolean).join(", ") : "–"]]} />
                {sensitiveDocs.length ? <table className="table"><tbody>{sensitiveDocs.map(({ d, url }) => <tr key={d.id}><td>{DOC_LABEL[d.kind] ?? d.kind}</td><td className="small">{d.original_name}</td><td className="r">{url ? <a className="btn sm" href={url} target="_blank" rel="noreferrer">Buka ↗</a> : "–"}</td></tr>)}</tbody></table> : <Empty>Tidak ada salinan dokumen.</Empty>}
                <p className="small muted">Tautan berlaku 5 menit.</p>
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>Alamat persis dan salinan dokumen hanya terlihat oleh investor yang sudah lolos KYC. {!me ? <>Masuk sebagai investor, hubungkan wallet, dan selesaikan KYC di Portofolio.</> : me.role === "investor" ? <>Hubungkan wallet dan selesaikan KYC di <Link href="/portfolio" style={{ color: "var(--accent)", fontWeight: 700 }}>Portofolio</Link>.</> : null}</p>
            )}
            <div className="divider" />
            <p className="small muted" style={{ margin: 0 }}><b>Tidak pernah dibuka:</b> KTP dan data pribadi owner, nomor rekening, dan data pelanggan.</p>
          </Card>

          {s && (
            <Card title="Imbal hasil & redeem">
              <div className="stack small" style={{ ["--gap" as any]: "10px" }}>
                <p className="muted">Tidak ada pembayaran berkala. Setiap transaksi pelanggan membagi {pct(series.share_bps / 10000)} Eligible Revenue ke <b>kantong investor</b>. <b>Nilai tebus per token = saldo kantong ÷ suplai</b>; mulai dari sekitar Rp0 dan naik seiring omzet.</p>
                <PoolJar label="Satu token" paid={Number(s.unitPrice)} value={Number(s.redeemValue)} />
                <KV rows={[["Masuk kantong (P, final)", rp(s.P)], ["Sudah/akan dibayar (R)", rp(s.R)], ["Nilai tebus per token (estimasi)", rp(s.redeemValue)], ["Harga beli", rp(s.unitPrice)]]} />
                <p className="muted">Redeem: serahkan token → dikunci → kustodian membayar → token dibakar. Titik impas tercapai saat kumpulan per token ≥ harga beli, atau Anda menahan sampai tenor berakhir.</p>
              </div>
            </Card>
          )}

          {ctx.ref && (
            <Card title="Kontrak di Sepolia">
              <KV rows={[
                ["Series", <a key="s" className="mono" href={etherscan(ctx.ref.series)} target="_blank">{short(ctx.ref.series)}</a>],
                [`Token (${series.token_symbol ?? ""})`, <a key="t" className="mono" href={etherscan(ctx.ref.token)} target="_blank">{short(ctx.ref.token)}</a>],
              ]} />
            </Card>
          )}
        </div>

        <aside className="side">
          <Card title="Beli token" subtitle={gateway ? `Bayar lewat payment gateway Xendit${xenditTestMode() ? " (mode uji, bukan uang sungguhan)" : ""} → pembayaran terkonfirmasi → token di-mint ke wallet. Escrow kustodian tetap simulasi.` : "Rupiah simulasi via PSP → escrow kustodian → token di-mint ke wallet."} tone="accent">
            {offering ? null : <div style={{ marginBottom: 12 }}><Notice tone="warn">{!ctx.ref ? "Kontrak seri belum dideploy." : s?.state === "Draft" ? "Penawaran belum dibuka: menunggu persetujuan operator dan auditor." : `Penawaran tidak sedang dibuka (status ${s?.state}).`}</Notice></div>}
            <BuyForm action={buy} unitPrice={Number(series.unit_price)} remaining={remaining} disabled={!offering} back={back} seriesId={series.id} calc={calc} gateway={gateway} status={!me ? { kind: "login" } : me.role !== "investor" ? { kind: "not-investor" } : !me.wallet ? { kind: "no-wallet" } : !walletKyc ? { kind: "no-kyc", wallet: me.wallet } : { kind: "ready", wallet: me.wallet }} />
            <p className="small muted" style={{ marginTop: 12 }}>{kycReal ? "KYC lewat Didit." : <>KYC di lingkungan ini adalah <b>mock</b> dan berlabel.</>} Tidak ada transaksi kripto di sisi investor selain tanda tangan; platform tidak menyimpan KTP atau selfie.</p>
          </Card>

          <details className="disclose">
            <summary>Pengungkapan risiko</summary>
            <div className="body">
              <p>Yang dibeli adalah hak atas bagian omzet ke depan, bukan kepemilikan venue.</p>
              <p>Dibagi dari omzet, bukan laba. Tanpa agunan fisik dan tanpa harga pasar; likuiditas lewat redeem atau pengalihan ke investor lain yang lolos KYC (pembayaran antar pihak di luar platform).</p>
              <p>Tebus awal berarti kehilangan bagian masa depan. Nilai tebus adalah estimasi dan bisa turun bila ada refund atau koreksi.</p>
              <p>Ini demo di testnet. Tidak diklaim disetujui OJK.</p>
            </div>
          </details>

          <Link className="btn ghost" href="/portfolio">Lihat portofolio →</Link>
        </aside>
      </div>
    </div>
  );
}
