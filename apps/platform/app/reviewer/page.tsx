import { encodeFunctionData } from "viem";
import { Badge, Card, Empty, Flash, KV, Notice, PageHeader } from "@venue-rwa/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SeriesPicker } from "@/components/SeriesPicker";
import { ReviewVoteButtons, SendTxButton, SignTypedButton } from "@/components/Wallet";
import { ADDR, attestationAbi, chain, etherscanTx } from "@/lib/chain";
import { chainAttState, currentDraft, lastSubmitted, requiredSignatures } from "@/lib/attest";
import { requireArea } from "@/lib/auth";
import { attMessage, attestationDomain, attestationTypes, walletTypedData } from "@/lib/eip712";
import { refOf, getStaffCtx } from "@/lib/flow";
import { rp, short } from "@/lib/format";
import { onchainSigners } from "@/lib/signers";
import { signedUrl } from "@/lib/storage";
import { votesOf } from "@/lib/flows/review";
import { createDraftAction, reanalyze, submitOnchain } from "./actions";
import { RunSummary } from "./RunSummary";

export const dynamic = "force-dynamic";
const DOC_LABEL: Record<string, string> = { sales_data: "Data penjualan", ownership: "Bukti kepemilikan", insurance: "Polis asuransi", consent_letter: "Surat persetujuan bank", lease: "Perjanjian sewa", bank_statement: "Mutasi rekening", loan: "Kredit & jaminan", tax: "NPWP / pajak", license: "Izin usaha", photo: "Foto venue", other: "Lainnya" };
const XSTATUS: Record<string, [string, "ok" | "warn" | "bad" | "neutral"]> = { ok: ["terbaca", "ok"], partial: ["sebagian terbaca", "warn"], unreadable: ["tidak terbaca (pindai/gambar)", "warn"], failed: ["gagal dianalisis", "bad"], pending: ["menganalisis…", "neutral"] };
const FIELD_LABEL: Record<string, string> = { lease_end_date: "Sewa berakhir", lessee_name: "Penyewa", rent_per_month: "Sewa/bulan", forbids_revenue_assignment: "Larang alihkan pendapatan", period_months: "Periode (bulan)", total_credit_amount: "Total dana masuk", monthly_installment: "Angsuran/bulan", forbids_sale_of_revenue: "Larang jual pendapatan", collateral: "Jaminan", taxpayer_name: "Wajib pajak", business_name: "Nama usaha", valid_until: "Berlaku sampai" };

interface Finding { key: string; level: "bad" | "warn"; title: string; detail?: string; todo: string; tag: string }
interface Passed { key: string; title: string; detail?: string }

export default async function ReviewerPage({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireArea("reviewer");
  const ctx = await getStaffCtx(sp.s).catch(() => null);
  if (!ctx) return <div className="container"><Card title="Belum ada seri"><Empty>Belum ada pengajuan yang masuk.</Empty></Card></div>;
  const { pf, series, venue, ref } = ctx;
  const votes = await votesOf(ctx);
  const [{ data: run }, { data: docs }, draft, submitted, signers, { data: priv }] = await Promise.all([
    pf.from("verification_runs").select("*").eq("series_id", series.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    pf.from("documents").select("*").eq("venue_id", venue.id).order("uploaded_at"),
    currentDraft(series.id), lastSubmitted(series.id), onchainSigners(),
    pf.from("venue_private").select("data").eq("venue_id", venue.id).maybeSingle(),
  ]);
  const pv = priv?.data as any;
  const st = ref ? await chainAttState(ref.series) : null;
  const need = draft ? requiredSignatures(draft.payload) : 2;
  const signLabels = ["Signer 1 · tim", "Signer 2 · tim", "Signer 3 · auditor independen (wajib)"];
  const signedBy = new Set((draft?.signatures ?? []).map((s) => s.signer.toLowerCase()));
  const typed = draft ? walletTypedData("Attestation", attestationTypes, attestationDomain(), attMessage(draft.payload) as any) : "";
  const revokeData = ref ? encodeFunctionData({ abi: attestationAbi, functionName: "revoke", args: [ref.series, refOf("fraud: booking fiktif terdeteksi di rekonsiliasi")] }) : "0x";
  const docUrls = await Promise.all((docs ?? []).map(async (d) => ({ d, url: await signedUrl(d.storage_path, 300) })));
  const g = run?.gates as any;
  const hidden = <input type="hidden" name="s" value={series.id} />;

  // ---- temuan: apa yang perlu diperiksa reviewer, yang bermasalah dulu
  const findings: Finding[] = []; const passed: Passed[] = [];
  for (const x of (g?.gates ?? []) as { id: string; label: string; detail: string; pass: boolean }[]) {
    if (x.pass) passed.push({ key: `g-${x.id}`, title: x.label, detail: x.detail });
    else findings.push({ key: `g-${x.id}`, level: "bad", title: x.label, detail: x.detail, tag: "Aturan", todo: "Gerbang kebijakan gagal. Cek buktinya di bagian Dokumen; bila memang tidak memenuhi, tolak dengan alasan ini." });
  }
  for (const w of (g?.warnings ?? []) as string[]) findings.push({ key: `w-${w}`, level: "warn", title: w, tag: "Peringatan", todo: "Tidak otomatis menggagalkan. Putuskan apakah risikonya dapat diterima." });
  for (const c of ((venue.ai_report?.checks ?? []) as { id: string; label: string; detail: string; status: string }[])) {
    if (c.status === "pass") passed.push({ key: `a-${c.id}`, title: c.label, detail: c.detail });
    else if (c.status === "fail") findings.push({ key: `a-${c.id}`, level: "bad", title: c.label, detail: c.detail, tag: "Isian vs dokumen", todo: "Isian owner TIDAK cocok dengan dokumen. Buka dokumennya dan pastikan mana yang benar." });
    else findings.push({ key: `a-${c.id}`, level: "warn", title: c.label, detail: c.detail, tag: "Isian vs dokumen", todo: "AI tidak bisa memastikan. Buka dokumennya dan cocokkan sendiri." });
  }
  for (const d of docs ?? []) {
    if (d.kind === "photo" || !d.extraction_status || d.extraction_status === "ok" || d.extraction_status === "pending") continue;
    findings.push({ key: `d-${d.id}`, level: "warn", title: `${DOC_LABEL[d.kind] ?? d.kind}: ${XSTATUS[d.extraction_status]?.[0] ?? d.extraction_status}`, detail: d.extraction_note ?? undefined, tag: "Dokumen", todo: "Baca dokumen ini langsung; hasil ekstraksi AI tidak bisa diandalkan." });
  }
  if (pv && pv.payout.accountName.trim().toLowerCase() !== String(venue.name).replace(/\s*\(.*?\)\s*$/, "").trim().toLowerCase()) {
    findings.push({ key: "payout-name", level: "warn", title: "Nama pemilik rekening berbeda dari nama badan usaha", detail: `${pv.payout.accountName} ≠ ${venue.name}`, tag: "Data privat", todo: "Pastikan rekening tujuan memang milik badan usaha (lihat Data privat di bawah)." });
  }
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === "bad" ? -1 : 1));
  const badN = findings.filter((f) => f.level === "bad").length;

  // ---- jalur status
  const approvedN = (["operator", "auditor"] as const).filter((r) => votes.some((v) => v.voter_role === r && v.decision === "approved")).length;
  const live = ["Offering", "Funded", "Active", "Closed"].includes(series.status);
  const cur = series.review_status !== "approved" ? 0 : live ? 3 : 1;
  const failed = series.review_status === "rejected";
  const steps = [
    { t: "Review", who: "Operator + auditor", s: failed ? "ditolak" : `${approvedN}/2 menyetujui` },
    { t: "Kontrak & attestation", who: "Otomatis", s: submitted ? "terkirim ke Sepolia" : ref ? "kontrak ada, attestation belum" : "setelah dua suara setuju" },
    { t: "Penawaran dibuka", who: "Otomatis", s: live ? "sudah dibuka" : "setelah attestation" },
  ];

  const canVote = series.review_status === "pending" && !series.contract_address;
  const mine = votes.find((v) => v.voter_email === viewer.email);
  const passRec = run?.recommendation === "pass";
  const seatHint = (r: "operator" | "auditor") => (r === "operator" ? `wallet Signer 1 atau 2 (${short(signers[0] ?? "")} / ${short(signers[1] ?? "")})` : `wallet Signer 3 (${short(signers[2] ?? "")})`);

  return (
    <div className="container" style={{ maxWidth: 1240 }}>
      <PageHeader title={venue.name} lead={`Seri ${series.token_symbol ?? ""} · jual ${(series.share_bps / 100).toLocaleString("id-ID")}% omzet selama ${Math.round(series.tenor_days / 30)} bulan · target ${rp(series.target)}, minimum ${rp(series.min_raise)}.`}>
        {st?.valid ? <Badge tone="ok">Attestation valid on-chain</Badge> : <Badge tone="warn">Belum ada attestation valid</Badge>}
      </PageHeader>
      <SeriesPicker path="/reviewer" current={series.id} />
      <Flash ok={sp.ok} err={sp.err} />
      {venue.ai_status === "running" && <AutoRefresh />}

      <ol className="pipeline" aria-label="Tahapan pengajuan">
        {steps.map((x, i) => (
          <li key={x.t} className={failed && i === 0 ? "bad" : i < cur ? "done" : i === cur ? "now" : ""}>
            <span className="who">{x.who}</span><b>{x.t}</b><small>{x.s}</small>
          </li>
        ))}
      </ol>

      <div className="desk">
        <div>
          {run ? (
            <dl className="facts" style={{ margin: 0 }}>
              <div><dt>Rekomendasi sistem</dt><dd style={{ color: passRec ? "var(--ok)" : "var(--bad)" }}>{passRec ? "Lolos" : "Tidak lolos"}</dd></div>
              <div><dt>Skor</dt><dd>{run.score} <small>/ 10.000</small></dd></div>
              <div><dt>Harga referensi</dt><dd>{rp(run.reference_price)}</dd></div>
              <div><dt>Harga maksimal</dt><dd>{rp(run.max_price)}</dd></div>
              <div><dt>Sumber data</dt><dd style={{ fontSize: 15 }}>{venue.data_source === "pos" ? "PoS / gateway" : venue.data_source === "connector" ? "Sistem eksternal (impor)" : "Dilaporkan owner"}</dd></div>
            </dl>
          ) : <Notice tone="warn">Belum ada hasil verifikasi untuk seri ini.</Notice>}

          {run && Array.isArray(g?.components) && g.components.length > 0 && <RunSummary run={run} g={g} proposedPrice={Number(series.unit_price)} dataSource={venue.data_source} />}

          {Array.isArray(g?.components) && g.components.length > 0 && (
            <section className="sect" aria-labelledby="skor" style={{ marginTop: 28 }}>
              <header>
                <div>
                  <h2 id="skor">Rincian skor: {run!.score.toLocaleString("id-ID")} dari 10.000</h2>
                  <p>Dihitung aturan deterministik dari data omzet, bukan oleh AI. Ambang lolos 6.000 dan semua gerbang harus lolos.</p>
                </div>
                <Badge tone={run!.score >= 6000 ? "ok" : "bad"}>{run!.score >= 6000 ? "di atas ambang" : "di bawah ambang"}</Badge>
              </header>
              {(g.components as { id: string; label: string; points: number; max: number; detail: string }[]).map((c) => (
                <div key={c.id} className={`scorebar ${c.points >= c.max ? "full" : ""}`}>
                  <div><b>{c.label}</b><div className="small muted">{c.detail}</div></div>
                  <span className="num"><b>{c.points.toLocaleString("id-ID")}</b> <span className="muted">/ {c.max.toLocaleString("id-ID")}</span></span>
                  <div className="track" role="progressbar" aria-valuenow={c.points} aria-valuemin={0} aria-valuemax={c.max}><i style={{ width: `${Math.min(100, (c.points / c.max) * 100)}%` }} /></div>
                </div>
              ))}
              {(venue.ai_report?.checks ?? []).length > 0 && (
                <p className="small muted" style={{ marginTop: 12 }}>
                  Pemeriksaan dokumen oleh AI: {(venue.ai_report.checks as { status: string }[]).filter((c) => c.status === "pass").length} cocok, {(venue.ai_report.checks as { status: string }[]).filter((c) => c.status === "fail").length} tidak cocok, {(venue.ai_report.checks as { status: string }[]).filter((c) => c.status !== "pass" && c.status !== "fail").length} perlu cek manual. Hasil ini tidak menambah poin, tetapi menentukan gerbang “Dokumen konsisten dengan isian” dan peringatan di bawah.
                </p>
              )}
            </section>
          )}

          <section className="sect" aria-labelledby="temuan">
            <header>
              <div>
                <h2 id="temuan">{findings.length ? `${findings.length} hal perlu Anda periksa` : "Tidak ada temuan"}</h2>
                <p>{findings.length ? `${badN} bertanda gagal, sisanya butuh penilaian Anda. Yang bermasalah ada di atas.` : "Semua pemeriksaan otomatis lolos. Tetap buka dokumen sebelum menyetujui."}</p>
              </div>
              <form action={reanalyze}>{hidden}<button className="btn sm">{venue.ai_status === "running" ? "AI berjalan…" : "Analisis ulang dokumen"}</button></form>
            </header>
            {findings.length === 0 ? <div className="findings-empty">Tidak ada yang ditandai.</div> : findings.map((f) => (
              <div key={f.key} className={`finding ${f.level}`}>
                <span className="mark" aria-hidden>{f.level === "bad" ? "×" : "!"}</span>
                <div>
                  <h3>{f.title}</h3>
                  {f.detail && <p>{f.detail}</p>}
                  <div className="todo">{f.todo}</div>
                </div>
                <Badge tone={f.level === "bad" ? "bad" : "warn"} plain>{f.tag}</Badge>
              </div>
            ))}
            {passed.length > 0 && (
              <details className="fold">
                <summary>{passed.length} pemeriksaan lolos otomatis</summary>
                <div className="inner">
                  {passed.map((x) => (
                    <div key={x.key} className="finding ok">
                      <span className="mark" aria-hidden>✓</span>
                      <div><h3>{x.title}</h3>{x.detail && <p>{x.detail}</p>}</div>
                      <span />
                    </div>
                  ))}
                </div>
              </details>
            )}
            {run && <p className="small muted" style={{ marginTop: 12 }}>AI hanya mengekstrak angka bersitasi; pencocokan dan rekomendasi dilakukan aturan deterministik. Keputusan ada di Anda. Evidence root <span className="mono">{short(run.evidence_root)}</span>.</p>}
          </section>

          <section className="sect" aria-labelledby="dokumen">
            <header><div><h2 id="dokumen">Dokumen pengajuan</h2><p>Buka aslinya untuk mencocokkan temuan di atas. Tautan berlaku 5 menit.</p></div></header>
            {(docs ?? []).length === 0 ? <Empty>Tidak ada dokumen terlampir.</Empty> : docUrls.map(({ d, url }) => {
              const [xl, xt] = XSTATUS[d.extraction_status ?? ""] ?? ["belum dianalisis", "neutral"];
              const fields = Object.entries((d.extraction ?? {}) as Record<string, any>).filter(([, f]) => f?.verified);
              return (
                <div key={d.id} className="doc">
                  <div className="row between">
                    <div><b>{DOC_LABEL[d.kind] ?? d.kind}</b><div className="small muted">{d.original_name} · <span className="mono">sha256 {String(d.sha256).slice(0, 10)}…</span></div></div>
                    <div className="row" style={{ gap: 8 }}>{d.kind !== "photo" && <Badge tone={xt}>{xl}</Badge>}{url && <a className="btn sm" href={url} target="_blank" rel="noreferrer">Buka dokumen</a>}</div>
                  </div>
                  {d.extraction_note && <p className="small muted" style={{ margin: 0 }}>{d.extraction_note}</p>}
                  {fields.length > 0 && (
                    <details className="disclose">
                      <summary>Angka yang dibaca AI ({fields.length}, masing-masing bersitasi)</summary>
                      <div className="body"><table className="kv"><tbody>{fields.map(([k, f]) => <tr key={k}><td>{FIELD_LABEL[k] ?? k}<div className="small muted">hal. {f.page} · “{String(f.quote).slice(0, 90)}{String(f.quote).length > 90 ? "…" : ""}”</div></td><td>{typeof f.value === "boolean" ? (f.value ? "Ya" : "Tidak") : typeof f.value === "number" ? f.value.toLocaleString("id-ID") : String(f.value)}</td></tr>)}</tbody></table></div>
                    </details>
                  )}
                </div>
              );
            })}
          </section>

          {pv && (
            <details className="fold sect" style={{ marginTop: 36 }}>
              <summary>Identitas badan usaha & data privat <Badge tone="warn" plain>hanya staf, tidak dikirim ke AI</Badge></summary>
              <div className="inner"><div className="grid c2">
              <KV rows={[
                ["NIB / NPWP", `${pv.business.nib} / ${pv.business.npwp}`],
                ["Penandatangan", `${pv.business.signatoryName} (${pv.business.signatoryTitle})`],
                ["Pemilik manfaat", (pv.business.owners as { name: string; pct: number }[]).map((o) => `${o.name} ${o.pct}%`).join(", ")],
                ["Kontak", `${pv.business.contactEmail} · ${pv.business.contactPhone}`],
                ["Beroperasi sejak", pv.business.operatingSince],
              ]} />
              <KV rows={[
                ["Rekening tujuan", `${pv.payout.bank} · ${pv.payout.accountNumber}`],
                ["Nama pemilik rekening", <span key="a">{pv.payout.accountName}{pv.payout.accountName.trim().toLowerCase() === String(venue.name).replace(/\s*\(.*?\)\s*$/, "").trim().toLowerCase() ? <Badge tone="ok"> sama dengan badan usaha</Badge> : <Badge tone="warn"> BERBEDA dari nama badan usaha: periksa</Badge>}</span>],
                ["Tanah / bangunan", `${pv.property?.land ?? "-"} / ${pv.property?.building ?? "-"}${pv.property?.ownedAssetPledged ? ` · aset milik sendiri DIJAMINKAN: ${pv.property.ownedAssetPledgedNote}` : ""}`],
                ["Sengketa", pv.disputeNote || "Tidak ada"],
                ["Sewa", pv.lease ? `${pv.lease.landlord} · ${rp(pv.lease.monthlyRent)}/bln · sisa ${pv.lease.remainingMonths} bln` : "Tidak ada (milik sendiri)"],
                ["Utang", `pokok ${rp(pv.debt.outstanding)} · sisa ${pv.debt.remainingMonths} bln · jaminan ${pv.debt.collateral}`],
                ["Biaya operasional/bulan", rp(pv.monthlyOpex)],
                ["Alamat", [pv.address.street, pv.address.kelurahan, pv.address.postalCode].join(", ")],
              ]} />
            </div></div>
            </details>
          )}


          {ref && (
            <details className="fold">
              <summary>Penandatangan terdaftar &amp; pencabutan (veto)</summary>
              <div className="inner stack" style={{ ["--gap" as any]: "14px" }}>
                <table className="kv"><tbody>{signers.map((a, i) => (
                  <tr key={a}><td>{signLabels[i]}<br /><span className="mono muted">{short(a)}</span></td><td>{signedBy.has(a.toLowerCase()) || (submitted?.signatures as any[] | undefined)?.some((x) => String(x.signer).toLowerCase() === a.toLowerCase()) ? <Badge tone="ok">menandatangani</Badge> : <Badge>belum</Badge>}</td></tr>
                ))}</tbody></table>
                {submitted && <p className="small muted" style={{ margin: 0 }}>Terakhir dikirim <a href={etherscanTx(submitted.submitted_tx)} target="_blank">{short(submitted.submitted_tx)}</a>{submitted.revoked_tx && <> · <Badge tone="bad">dicabut</Badge> <a href={etherscanTx(submitted.revoked_tx)} target="_blank">{short(submitted.revoked_tx)}</a></>}</p>}
                <Notice tone="warn" title="Veto:">Satu penandatangan cukup untuk mencabut kapan saja. Setelah dicabut, penawaran tak bisa menerima pembelian baru dan rilis dana tahap 2 tertahan. Dilakukan dari wallet salah satu Signer (butuh sedikit ETH untuk gas).</Notice>
                <div><SendTxButton to={ADDR.attestation} data={revokeData} chainId={chain.id} label="Cabut attestation dengan MetaMask" /></div>
              </div>
            </details>
          )}

          {series.review_status === "approved" && !submitted && (
            <details className="fold" open>
              <summary>Cadangan manual: attestation belum terkirim otomatis</summary>
              <div className="inner stack" style={{ ["--gap" as any]: "12px" }}>
                <p className="small muted" style={{ margin: 0 }}>Biasanya tidak perlu. Dipakai bila deploy atau pengiriman otomatis gagal di tengah jalan.</p>
                {!draft ? (
                  <form action={createDraftAction}>{hidden}<button className="btn primary" disabled={!run || !ref}>Buat draft attestation</button></form>
                ) : (
                  <>
                    <KV rows={[["Tanda tangan", `${draft.signatures.length} dari ${need}`], ["Harga maksimal", rp(Number(draft.payload.maxPrice))], ["Kedaluwarsa", new Date(Number(draft.payload.expiry) * 1000).toLocaleString("id-ID")]]} />
                    <div className="row"><SignTypedButton typedData={typed} endpoint="/api/sign" body={{ attId: draft.id }} chainId={chain.id} label="Tanda tangani dengan MetaMask" />
                      <form action={submitOnchain}>{hidden}<button className="btn primary" disabled={draft.signatures.length < need}>Kirim attestation ke Sepolia</button></form></div>
                  </>
                )}
              </div>
            </details>
          )}
        </div>

        <aside className="rail" aria-label="Keputusan">
          <div className="decision">
            <h2>{failed ? "Pengajuan ditolak" : series.review_status === "approved" ? "Review selesai" : "Keputusan Anda"}</h2>
            <p className="sub">{failed ? `Alasan: ${series.review_note ?? "-"}` : series.review_status === "approved" ? "Kedua pihak menyetujui. Kontrak, attestation, dan pembukaan penawaran diproses otomatis." : "Butuh dua suara setuju: satu operator dan satu auditor. Satu penolakan menghentikan pengajuan."}</p>
            <div className="seats">
              {(["operator", "auditor"] as const).map((r) => {
                const v = votes.find((x) => x.voter_role === r);
                return (
                  <div key={r} className={`seat ${v ? (v.decision === "approved" ? "yes" : "no") : ""}`}>
                    <b>{r === "operator" ? "Operator (tim)" : "Auditor (independen)"}</b>
                    <span className="st">{v ? (v.decision === "approved" ? "✓ setuju" : "× menolak") : "belum memberi suara"}</span>
                    <small>{v ? `${v.voter_email}${v.voter_wallet ? ` · ${short(v.voter_wallet)}` : ""}${v.note ? ` · “${v.note}”` : ""}` : `Menandatangani dengan ${seatHint(r)}`}</small>
                  </div>
                );
              })}
            </div>
            {canVote && mine ? (
              <p className="hint" style={{ marginTop: 0 }}>Suara Anda sudah tercatat: <b>menyetujui</b>. Menunggu {viewer.role === "auditor" ? "operator (tim)" : "auditor (independen)"} memberi suara; setelah itu kontrak dan attestation diproses otomatis.</p>
            ) : canVote ? (
              <>
                {!passRec && <div className="msg err" style={{ marginBottom: 10 }}>Sistem merekomendasikan “tidak lolos”, jadi persetujuan dikunci. Anda hanya bisa menolak.</div>}
                <ReviewVoteButtons seriesId={series.id} email={viewer.email} role={viewer.role} chainId={chain.id} />
                <p className="hint">Anda masuk sebagai <b>{viewer.role === "operator" ? "operator" : "auditor"}</b> ({viewer.email}). MetaMask meminta <b>satu</b> tanda tangan (tanpa gas) dari {seatHint(viewer.role === "auditor" ? "auditor" : "operator")}. Tanda tangan yang sama dipakai sebagai suara dan sebagai tanda tangan attestation.</p>
              </>
            ) : series.review_status === "approved" ? (
              <p className="hint" style={{ marginTop: 0 }}>{submitted ? <>Attestation tercatat: <a href={etherscanTx(submitted.submitted_tx)} target="_blank" rel="noreferrer" style={{ color: "var(--amber)" }}>{short(submitted.submitted_tx)}</a>. Penawaran dibuka otomatis; bila belum, operator membukanya dari konsol.</> : ref ? "Kontrak sudah dideploy; attestation belum terkirim. Pakai “Cadangan manual” di bawah." : "Kontrak belum dideploy. Operator bisa mengulang dari konsolnya."}</p>
            ) : null}
            <ul className="after">
              <li>Kontrak dideploy dan attestation dikirim ke Sepolia</li>
              <li>Penawaran langsung dibuka</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
