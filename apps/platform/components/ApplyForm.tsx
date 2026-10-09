"use client";
import { startTransition, useActionState, useRef, useState, useTransition, type ReactNode } from "react";
import { CSV_TEMPLATE, INSURANCE_COVERAGE, SALES_TEMPLATE_MONTHLY, type SalesResult } from "@venue-rwa/shared";
import { apply, previewSales, type ApplyState, type SalesPreview } from "@/app/owner/apply/actions";
import { DataNote } from "@/components/DataNote";

const SPORTS = ["futsal", "basket", "badminton", "padel", "tenis", "voli", "mini soccer", "lainnya"];
const SURFACES = ["rumput sintetis", "vinyl", "parket kayu", "semen/beton", "karpet", "tanah liat", "lainnya"];
const COLLATERALS = ["tanah/bangunan", "peralatan/aset usaha", "piutang/pendapatan", "lainnya"];
const STEPS = ["Profil & lokasi", "Lapangan", "Properti", "Utang & beban", "Penjualan", "Penawaran", "Identitas & rekening", "Dokumen", "Tinjau & kirim"];
const SALES_STEP = 4;
const csvUrl = (text: string) => `data:text/csv;charset=utf-8,${encodeURIComponent(text)}`;
const fmt = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const toNum = (v: string) => Number(v.replace(/\D/g, "")) || 0;
const toPct = (v: string) => Number(v.replace(",", ".")) || 0;
let uid = 0;

const YesNo = ({ name, def = "tidak" }: { name: string; def?: "ya" | "tidak" }) => (
  <select className="select" name={name} defaultValue={def}><option value="tidak">Tidak</option><option value="ya">Ya</option></select>
);

/** Pertanyaan pilihan: tombol radio besar; jawaban menentukan kolom lanjutan yang muncul. */
function Choice({ name, value, onChange, options, label, hint }: { name: string; value: string; onChange: (v: string) => void; options: [string, string][]; label: string; hint?: ReactNode }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 650, marginBottom: 6 }}>{label}</legend>
      {hint && <div className="small muted" style={{ marginBottom: 6 }}>{hint}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {options.map(([v, l]) => (
          <label key={v} className={`btn ${value === v ? "primary" : ""}`} style={{ cursor: "pointer" }}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} required />{l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const Step = ({ i, cur, title, lead, children }: { i: number; cur: number; title: string; lead?: string; children: ReactNode }) => (
  <section className="card" data-step={i} hidden={i !== cur}>
    <h2 style={{ marginBottom: 4 }}>{title}</h2>
    {lead && <p className="muted small" style={{ marginBottom: 12 }}>{lead}</p>}
    <div className="stack" style={{ ["--gap" as any]: "14px" }}>{children}</div>
  </section>
);

function SalesPreviewView({ r }: { r: SalesResult }) {
  return (
    <div className="stack" style={{ ["--gap" as any]: "8px" }}>
      <div className="small"><b>{r.labels.length} bulan terbaca</b> ({r.mode === "transactions" ? "ekspor transaksi" : "template bulanan"}): {r.labels[0]} s.d. {r.labels[r.labels.length - 1]}</div>
      <div style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Bulan</th><th className="r">Bruto</th><th className="r">Refund</th><th className="r">Pajak</th><th className="r">Fee</th><th className="r">Omzet bersih</th></tr></thead>
          <tbody>{r.labels.map((l, i) => <tr key={l}><td>{l}</td><td className="r num">{fmt(r.breakdown[i]!.gross)}</td><td className="r num">{fmt(r.breakdown[i]!.refund)}</td><td className="r num">{fmt(r.breakdown[i]!.tax)}</td><td className="r num">{fmt(r.breakdown[i]!.fee)}</td><td className="r num"><b>{fmt(r.months[i]!)}</b></td></tr>)}</tbody></table>
      </div>
      {r.paymentMix && <div className="small">Porsi pembayaran dari file: gateway <b>{r.paymentMix.gatewayPct}%</b> · tunai <b>{r.paymentMix.cashPct}%</b> · transfer/QRIS sendiri <b>{r.paymentMix.transferPct}%</b></div>}
      {r.notes.map((n) => <div key={n} className="small muted">ℹ {n}</div>)}
    </div>
  );
}

export function ApplyForm() {
  const [state, action, pending] = useActionState<ApplyState, FormData>(apply, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [stepErr, setStepErr] = useState("");
  const [facs, setFacs] = useState<number[]>([uid++]);
  const [owners, setOwners] = useState<number[]>([uid++]);
  const [land, setLand] = useState("");
  const [building, setBuilding] = useState("");
  const [hasDebt, setHasDebt] = useState("");
  const [hasPledge, setHasPledge] = useState("");
  const [related, setRelated] = useState("");
  const [dispute, setDispute] = useState("");
  const [insured, setInsured] = useState("");
  const [ownedPledged, setOwnedPledged] = useState("");
  const [consentLetter, setConsentLetter] = useState("");
  const [preview, setPreview] = useState<SalesPreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [unit, setUnit] = useState("");
  const [tokens, setTokens] = useState("");
  const [share, setShare] = useState("");
  const [minTokens, setMinTokens] = useState("");
  const [summary, setSummary] = useState<[string, string][]>([]);

  const leased = land === "sewa" || building === "sewa";
  const owned = land === "milik" || building === "milik";
  const price = toNum(unit), n = toNum(tokens), sh = toPct(share), mt = minTokens.trim() === "" ? n : toNum(minTokens);
  const t = price * n; // target dana = jumlah token × harga per token
  const divisible = price > 0 && n > 0;
  const salesResult = preview?.ok ? preview.result : undefined;

  /** Validasi isian pada satu langkah. Mengembalikan true bila lolos; bila tidak, menampilkan pesan bawaan browser pada kolom pertama yang salah. */
  function validate(i: number): boolean {
    const root = formRef.current?.querySelector(`[data-step="${i}"]`);
    if (!root) return true;
    for (const el of Array.from(root.querySelectorAll<HTMLInputElement>("input, select, textarea"))) {
      if (el.disabled || el.type === "hidden") continue;
      if (el.type === "radio") {
        const group = root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${el.name}"]`);
        if (el.required && !Array.from(group).some((g) => g.checked)) { setStepErr("Jawab semua pertanyaan di langkah ini."); return false; }
        continue;
      }
      if (!el.checkValidity()) { el.reportValidity(); setStepErr(""); return false; }
    }
    if (i === 1 && insured === "ya" && !root.querySelector<HTMLInputElement>("input[name=coverage]:checked")) { setStepErr("Pilih minimal satu jenis pertanggungan asuransi."); return false; }
    if (i === 5 && (!divisible || sh <= 0 || sh > 50 || mt < 1 || mt > n)) { setStepErr("Isi persen omzet (maks. 50), jumlah token, dan harga per token; minimum token harus 1 sampai jumlah token."); return false; }
    if (i === SALES_STEP) {
      if (!salesResult) { setStepErr("Unggah file penjualan lalu tekan “Periksa file” sampai hasilnya lolos."); return false; }
      if (!salesResult.paymentMix) {
        const sum = ["gatewayPct", "cashPct", "transferPct"].reduce((a, k) => a + toPct((formRef.current!.elements.namedItem(k) as HTMLInputElement)?.value ?? ""), 0);
        if (Math.round(sum) !== 100) { setStepErr("Porsi pembayaran (gateway + tunai + transfer/QRIS sendiri) harus berjumlah 100%."); return false; }
      }
    }
    setStepErr("");
    return true;
  }

  function go(to: number) {
    if (to > step && !validate(step)) return;
    if (to === STEPS.length - 1 && formRef.current) {
      const fd = new FormData(formRef.current);
      const get = (k: string) => String(fd.get(k) ?? "");
      setSummary([
        ["Perusahaan", `${get("name")} · ${get("area")}, ${get("city")}, ${get("province")}`],
        ["Lapangan", `${facs.length} lapangan`],
        ["Tanah / bangunan", `${land === "milik" ? "milik sendiri" : "sewa"} / ${building === "milik" ? "milik sendiri" : building === "sewa" ? "sewa" : "tidak ada bangunan"}`],
        ["Utang bank/pembiayaan", hasDebt === "ya" ? `Ada · pokok ${fmt(toNum(get("debtOutstanding")))}` : "Tidak ada"],
        ["Omzet terbaca", salesResult ? `${salesResult.labels.length} bulan · rata-rata ${fmt(salesResult.months.reduce((a, b) => a + b, 0) / Math.max(1, salesResult.months.length))}/bulan` : "–"],
        ["Penawaran", divisible ? `${fmt(t)} dalam ${n} token (${fmt(price)}/token) · ${sh}% omzet selama ${get("tenorMonths")} bulan · minimum ${mt} token` : "–"],
      ]);
    }
    setStep(to);
    setStepErr("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Kirim lewat onSubmit + startTransition (bukan prop `action` pada <form>): React 19 mengosongkan semua kolom setelah
   * form action selesai, termasuk saat server membalas galat validasi. Dengan cara ini isian dan file tetap ada.
   */
  function submitAll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    for (let i = 0; i < STEPS.length - 1; i++) {
      if (!validate(i)) {
        setStep(i);
        setTimeout(() => validate(i), 50); // tampilkan pesan pada langkah yang salah
        return;
      }
    }
    const form = formRef.current;
    if (form) startTransition(() => action(new FormData(form)));
  }

  const check = (file: File | null | undefined) => {
    setPreview(null);
    if (!file) return;
    const fd = new FormData(); fd.set("file", file);
    startPreview(async () => setPreview(await previewSales(fd)));
  };

  return (
    <form ref={formRef} onSubmit={submitAll} noValidate className="stack" style={{ ["--gap" as any]: "18px" }}>
      <nav aria-label="Langkah pengajuan" className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={`btn sm ${i === step ? "primary" : ""}`} disabled={i > step} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>{i + 1}. {s}</button>
        ))}
      </nav>

      {(state.error || stepErr) && (
        <div className="notice bad" role="alert"><div className="ico"><span>×</span></div>
          <div><b>{stepErr || state.error}</b>{!stepErr && state.fieldErrors && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{state.fieldErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>}</div></div>
      )}

      <Step i={0} cur={step} title="Profil & lokasi" lead="Mulai dari yang paling mudah: siapa Anda dan di mana venue-nya.">
        <DataNote ids={["profile", "address"]} />
        <div className="form-row">
          <label className="field">Nama perusahaan<input className="input" name="name" placeholder="mis. Ayo Sport" required /></label>
          <label className="field">Beroperasi sejak (bulan)<input className="input" type="month" name="operatingSince" required /></label>
          <label className="field">Jam buka (WIB)<input className="input" name="openHour" inputMode="numeric" defaultValue="7" required /></label>
          <label className="field">Jam tutup (WIB)<input className="input" name="closeHour" inputMode="numeric" defaultValue="23" required /></label>
        </div>
        <label className="field">Jalan dan nomor (sensitif)<input className="input" name="address" placeholder="mis. Jl. Ir. H. Juanda No. 10" required /></label>
        <div className="form-row">
          <label className="field">Kelurahan (sensitif)<input className="input" name="kelurahan" required /></label>
          <label className="field">Kecamatan / kawasan (publik)<input className="input" name="area" placeholder="mis. Coblong" required /></label>
          <label className="field">Kota / kabupaten<input className="input" name="city" placeholder="mis. Bandung" required /></label>
          <label className="field">Provinsi<input className="input" name="province" placeholder="mis. Jawa Barat" required /></label>
          <label className="field">Kode pos (sensitif)<input className="input" name="postalCode" inputMode="numeric" maxLength={5} placeholder="40135" required /></label>
        </div>
        <label className="field">Patokan / petunjuk lokasi (sensitif, opsional)<input className="input" name="landmark" maxLength={120} placeholder="mis. sebelah Indomaret" /></label>
      </Step>

      <Step i={1} cur={step} title="Lapangan / produk" lead="Isi setiap lapangan yang disewakan. Setelah disetujui, tiap lapangan menjadi produk awal di PoS (sesi 60 menit; bisa diubah di PoS).">
        <DataNote ids={["profile"]} />
        {facs.map((k, idx) => (
          <div key={k} className="card">
            <div className="row between" style={{ marginBottom: 8 }}><b>Lapangan {idx + 1}</b>{facs.length > 1 && <button type="button" className="btn sm" onClick={() => setFacs(facs.filter((x) => x !== k))}>Hapus</button>}</div>
            <div className="form-row">
              <label className="field">Nama<input className="input" name={`fac_name_${k}`} placeholder="mis. Futsal A" required /></label>
              <label className="field">Olahraga<select className="select" name={`fac_sport_${k}`}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="field">Panjang (m)<input className="input" name={`fac_len_${k}`} inputMode="decimal" placeholder="25" required /></label>
              <label className="field">Lebar (m)<input className="input" name={`fac_wid_${k}`} inputMode="decimal" placeholder="15" required /></label>
              <label className="field">Lantai / permukaan<select className="select" name={`fac_surface_${k}`}>{SURFACES.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="field">Indoor?<YesNo name={`fac_indoor_${k}`} /></label>
              <label className="field">Tarif per jam (Rp)<input className="input" name={`fac_price_${k}`} inputMode="numeric" placeholder="180000" required /></label>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn" onClick={() => setFacs([...facs, uid++])} disabled={facs.length >= 40}>+ Tambah lapangan</button></div>
        <div className="form-row">
          <label className="field">Tahun bangunan / lapangan dibuat<input className="input" name="builtYear" inputMode="numeric" placeholder="2020" required /></label>
        </div>
        <Choice name="insured" label="Aset (bangunan/lapangan) diasuransikan?" value={insured} onChange={setInsured} options={[["tidak", "Tidak"], ["ya", "Ya"]]}
          hint="Asuransi penting bagi investor: bila venue rusak atau tutup, omzet berhenti." />
        {insured === "ya" && (
          <div className="card">
            <div className="form-row">
              <label className="field">Perusahaan asuransi<input className="input" name="insurer" placeholder="mis. Asuransi Sinar Mas" required /></label>
              <label className="field">Nilai pertanggungan (Rp)<input className="input" name="sumInsured" inputMode="numeric" required /></label>
              <label className="field">Polis berlaku sampai (bulan)<input className="input" type="month" name="insuranceUntil" required /></label>
            </div>
            <div className="field" style={{ marginTop: 10 }}>Jenis pertanggungan (pilih yang tercakup)
              <div className="stack" style={{ ["--gap" as any]: "4px" }}>{INSURANCE_COVERAGE.map((c) => <label key={c.id} className="row small" style={{ gap: 8, fontWeight: 500 }}><input type="checkbox" name="coverage" value={c.id} />{c.label}</label>)}</div>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Salinan polis diunggah di langkah Dokumen.</p>
          </div>
        )}
        <label className="field">Rencana capex (opsional)<input className="input" name="capexPlan" maxLength={300} placeholder="mis. ganti rumput sintetis tahun depan" /></label>
      </Step>

      <Step i={2} cur={step} title="Status tanah dan bangunan" lead="Dijawab dulu supaya kami hanya meminta dokumen yang memang relevan.">
        <DataNote ids={["risk", "documents"]} />
        <Choice name="land" label="Tanah tempat venue berdiri itu…" value={land} onChange={setLand} options={[["milik", "Milik sendiri"], ["sewa", "Sewa"]]} />
        <Choice name="building" label="Bangunan / gedung di atasnya…" value={building} onChange={setBuilding} options={[["milik", "Milik sendiri"], ["sewa", "Sewa"], ["tidak_ada", "Tidak ada bangunan (lapangan terbuka)"]]} />
        {owned && (
          <div className="notice"><div>
            <b>Bukti kepemilikan diperlukan.</b> Unggah sertifikat (SHM/HGB), AJB, atau minimal PBB di langkah Dokumen. Alasannya: hak atas omzet hanya sah bila Anda benar-benar berhak atas lokasinya, dan kami perlu tahu apakah asetnya sedang menjadi jaminan.
            <div style={{ marginTop: 10 }}>
              <Choice name="ownedPledged" label="Apakah sertifikat / aset milik Anda sedang dijaminkan (mis. ke bank)?" value={ownedPledged} onChange={setOwnedPledged} options={[["tidak", "Tidak"], ["ya", "Ya"]]} />
              {ownedPledged === "ya" && <label className="field" style={{ marginTop: 8 }}>Dijaminkan kepada siapa dan untuk apa? <span className="muted" style={{ fontWeight: 400 }}>(tanpa nomor sertifikat; hanya staf yang melihat)</span><input className="input" name="ownedPledgedNote" maxLength={300} placeholder="mis. Bank X, untuk kredit modal kerja" required /></label>}
            </div>
          </div></div>
        )}
        {leased && (
          <div className="card">
            <b>Detail sewa</b>
            <div className="form-row" style={{ marginTop: 8 }}>
              <label className="field">Nama pemilik lahan / gedung<input className="input" name="landlord" required /></label>
              <label className="field">Biaya sewa per bulan (Rp)<input className="input" name="monthlyRent" inputMode="numeric" required /></label>
              <label className="field">Sisa masa sewa (bulan)<input className="input" name="leaseMonths" inputMode="numeric" required /></label>
              <label className="field">Ada opsi perpanjang?<YesNo name="renewal" /></label>
              <label className="field">Pemilik setuju omzet dijual?<YesNo name="landlordConsent" /></label>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Perjanjian sewa diunggah di langkah Dokumen.</p>
          </div>
        )}
      </Step>

      <Step i={3} cur={step} title="Utang dan beban atas omzet" lead="Jawab Ya/Tidak; kolom rincian hanya muncul bila perlu.">
        <DataNote ids={["risk", "finance"]} />
        <Choice name="hasDebt" label="Punya utang / kredit bank atau pembiayaan lain?" value={hasDebt} onChange={setHasDebt} options={[["tidak", "Tidak"], ["ya", "Ya"]]} />
        {hasDebt === "ya" && (
          <div className="card"><div className="form-row">
            <label className="field">Cicilan per bulan (Rp)<input className="input" name="installment" inputMode="numeric" required /></label>
            <label className="field">Sisa pokok utang (Rp)<input className="input" name="debtOutstanding" inputMode="numeric" required /></label>
            <label className="field">Sisa tenor (bulan)<input className="input" name="debtRemaining" inputMode="numeric" required /></label>
            <label className="field">Jaminan utang<select className="select" name="collateral" defaultValue="">{[<option key="" value="" disabled>Pilih…</option>, ...COLLATERALS.map((c) => <option key={c}>{c}</option>)]}</select></label>
            <label className="field">Perjanjian kredit melarang menjual/menjaminkan pendapatan?<YesNo name="covenant" /></label>
          </div>
          <div style={{ marginTop: 10 }}><Choice name="consent" label="Ada surat persetujuan bank untuk menjual sebagian omzet?" value={consentLetter} onChange={setConsentLetter} options={[["tidak", "Tidak"], ["ya", "Ya"]]} /></div>
          <p className="small muted" style={{ marginTop: 8 }}>Perjanjian kredit{consentLetter === "ya" ? " dan surat persetujuan bank" : ""} diunggah di langkah Dokumen.</p></div>
        )}
        <Choice name="hasPledge" label="Omzet venue ini sudah dijanjikan ke pihak lain (bagi hasil, tokenisasi di platform lain)?" value={hasPledge} onChange={setHasPledge} options={[["tidak", "Tidak"], ["ya", "Ya"]]}
          hint="Total beban atas omzet (yang dijual di sini + yang sudah dijanjikan) maksimal 50%." />
        {hasPledge === "ya" && (
          <div className="card"><div className="form-row">
            <label className="field">Berapa persen omzet?<input className="input" name="otherPledgedPct" inputMode="decimal" required /></label>
            <label className="field" style={{ flex: 2 }}>Jelaskan kontraknya<input className="input" name="otherPledgeNote" maxLength={300} required /></label>
          </div></div>
        )}
        <Choice name="dispute" label="Ada sengketa lahan / hukum yang sedang berjalan?" value={dispute} onChange={setDispute} options={[["tidak", "Tidak"], ["ya", "Ya"]]} />
        {dispute === "ya" && <label className="field">Jenis dan status sengketa <span className="muted" style={{ fontWeight: 400 }}>(ringkas; jangan tulis nama individu atau nomor identitas; hanya staf yang melihat)</span><input className="input" name="disputeNote" maxLength={300} placeholder="mis. gugatan batas tanah, tahap mediasi" required /></label>}
        <Choice name="relatedParty" label="Ada transaksi dengan pihak terkait owner (keluarga, perusahaan lain milik owner)?" value={related} onChange={setRelated} options={[["tidak", "Tidak"], ["ya", "Ya"]]} />
        {related === "ya" && <label className="field">Jelaskan transaksinya<input className="input" name="relatedPartyNote" maxLength={300} required /></label>}
        <label className="field" style={{ maxWidth: 360 }}>Biaya operasional per bulan (Rp)<input className="input" name="monthlyOpex" inputMode="numeric" required /></label>
      </Step>

      <Step i={4} cur={step} title="Data penjualan" lead="Unggah data penjualan Anda; kami yang menghitung omzet bersihnya. Tidak perlu mengetik angka per bulan.">
        <DataNote ids={["performance", "finance"]} />
        <div className="notice"><div>
          <b>Format apa?</b> Pilih salah satu:
          <ol className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>Ringkasan bulanan</b> (paling mudah): satu baris per bulan dengan kolom <span className="mono">bulan, bruto, refund, pajak, fee</span>. <a href={csvUrl(SALES_TEMPLATE_MONTHLY)} download="template-penjualan-bulanan.csv" style={{ color: "var(--accent)", fontWeight: 700 }}>Unduh template</a></li>
            <li><b>Ekspor transaksi</b> dari kasir/ERP Anda: satu baris per transaksi, kolom <span className="mono">ref, tanggal, jumlah, tipe, metode, …</span>. Lebih kuat sebagai bukti, dan porsi tunai/gateway dihitung otomatis. <a href={csvUrl(CSV_TEMPLATE)} download="template-transaksi.csv" style={{ color: "var(--accent)", fontWeight: 700 }}>Unduh template</a></li>
          </ol>
          <p className="small muted" style={{ margin: "8px 0 0" }}>Buka template di Excel, isi dengan data Anda, simpan sebagai CSV atau XLSX. Minimal 6 bulan penuh berurutan (disarankan 12); bulan berjalan tidak dihitung.</p>
        </div></div>
        <label className="field">File data penjualan (CSV / XLSX, maks. 5 MB)
          <input className="input" type="file" name="doc_sales_data" accept=".csv,.xlsx,text/csv" required onChange={(e) => check(e.target.files?.[0])} /></label>
        {previewing && <div className="small muted">Membaca file…</div>}
        {preview && !preview.ok && (
          <div className="notice bad"><div><b>File belum bisa dipakai:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{(preview.result?.errors ?? [preview.message ?? "tidak terbaca"]).map((m, i) => <li key={i}>{m}</li>)}</ul></div></div>
        )}
        {salesResult && <SalesPreviewView r={salesResult} />}
        {salesResult && !salesResult.paymentMix && (
          <div>
            <p className="small muted" style={{ marginBottom: 6 }}>Template bulanan tidak memuat metode bayar, jadi isi porsi pembayaran (total 100%). Hanya yang lewat gateway yang bisa diverifikasi otomatis; tunai dan transfer langsung tampil jujur sebagai tidak terverifikasi.</p>
            <div className="form-row">
              <label className="field">Lewat gateway (%)<input className="input" name="gatewayPct" inputMode="decimal" placeholder="80" /></label>
              <label className="field">Tunai (%)<input className="input" name="cashPct" inputMode="decimal" placeholder="10" /></label>
              <label className="field">Transfer / QRIS sendiri (%)<input className="input" name="transferPct" inputMode="decimal" placeholder="10" /></label>
            </div>
          </div>
        )}
        <label className="field" style={{ maxWidth: 260 }}>Okupansi rata-rata (%)<input className="input" name="occupancy" inputMode="decimal" placeholder="60" required /></label>
        <p className="small muted">Angka ini <b>belum terverifikasi</b>. Setelah disetujui, PoS mencocokkannya dengan settlement gateway tiap hari, dan file asli disimpan sebagai bukti untuk reviewer.</p>
      </Step>

      <Step i={5} cur={step} title="Penawaran" lead="Tiga pertanyaan: berapa persen omzet yang dijual, dibagi jadi berapa token, dan satu token harganya berapa. Yang dijual adalah bagian omzet selama tenor, bukan kepemilikan venue atau saham.">
        <DataNote ids={["terms"]} />
        <div className="form-row">
          <label className="field">1. Berapa persen omzet yang dijual? (maks. 50)<input className="input" name="sharePct" inputMode="decimal" placeholder="20" value={share} onChange={(e) => setShare(e.target.value)} required /></label>
          <label className="field">2. Dibagi jadi berapa token?<input className="input" name="tokenCount" inputMode="numeric" placeholder="5" value={tokens} onChange={(e) => setTokens(e.target.value)} required /></label>
          <label className="field">3. Harga satu token (Rp)<input className="input" name="unitPrice" inputMode="numeric" placeholder="40000000" value={unit} onChange={(e) => setUnit(e.target.value)} required /></label>
          <label className="field">Tenor (bulan, 3–36)<input className="input" name="tenorMonths" inputMode="numeric" placeholder="12" required /></label>
        </div>
        <label className="field">Minimal berapa token harus terjual agar penawaran jalan? <span className="muted" style={{ fontWeight: 400 }}>(kosong = semua token)</span>
          <input className="input" name="minTokens" inputMode="numeric" placeholder="mis. 3" value={minTokens} onChange={(e) => setMinTokens(e.target.value)} style={{ maxWidth: 220 }} /></label>
        <div className="notice" role="status"><div>
          {divisible ? (<>
            <div><b>Anda mengumpulkan {fmt(t)}</b> dari {n} token × {fmt(price)}.</div>
            {sh > 0 && <div>Total <b>{sh}% omzet</b> dibagi rata: <b>satu token = {(sh / n).toLocaleString("id-ID", { maximumFractionDigits: 3 })}% omzet</b> selama tenor.</div>}
            <div className="small muted" style={{ marginTop: 4 }}>Minimum: {mt >= 1 && mt <= n ? <>{mt} token ({fmt(mt * price)}). Jika yang terjual kurang dari itu saat penawaran ditutup, penawaran gagal dan semua investor di-refund penuh; Anda tidak menerima dana.</> : <span style={{ color: "var(--bad)" }}>harus 1 sampai {n}</span>}</div>
          </>) : <span className="small muted">Isi persen, jumlah token, dan harga satu token; total dana dan persen per token dihitung otomatis di sini.</span>}
        </div></div>
        <label className="field">Tujuan dana (pengungkapan, tidak dienforce)<input className="input" name="useOfFunds" maxLength={300} placeholder="mis. renovasi lapangan dan atap" /></label>
      </Step>

      <Step i={6} cur={step} title="Identitas badan usaha & rekening" lead="Dipakai reviewer untuk memverifikasi badan usaha dan tidak pernah ditampilkan ke investor.">
        <DataNote ids={["identity", "payout"]} />
        <div className="form-row">
          <label className="field">NIB (13 digit)<input className="input" name="nib" inputMode="numeric" maxLength={13} required /></label>
          <label className="field">NPWP badan usaha (15/16 digit)<input className="input" name="npwp" inputMode="numeric" required /></label>
          <label className="field">Nama penandatangan<input className="input" name="signatoryName" required /></label>
          <label className="field">Jabatan<input className="input" name="signatoryTitle" placeholder="mis. Direktur" required /></label>
          <label className="field">Email kontak resmi<input className="input" type="email" name="contactEmail" required /></label>
          <label className="field">HP kontak<input className="input" name="contactPhone" inputMode="tel" placeholder="08123456789" required /></label>
        </div>
        <div className="stack" style={{ ["--gap" as any]: "8px" }}>
          <b className="small">Pemilik manfaat (pemegang ≥ 25% atau pengendali)</b>
          {owners.map((k) => (
            <div key={k} className="row">
              <input className="input" name={`owner_name_${k}`} placeholder="Nama lengkap" required style={{ flex: 2 }} />
              <input className="input" name={`owner_pct_${k}`} inputMode="decimal" placeholder="% kepemilikan" required style={{ flex: 1 }} />
              {owners.length > 1 && <button type="button" className="btn sm" onClick={() => setOwners(owners.filter((x) => x !== k))}>Hapus</button>}
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => setOwners([...owners, uid++])} disabled={owners.length >= 5}>+ Tambah pemilik</button></div>
        </div>
        <b className="small">Rekening tujuan pembayaran (nama harus sama dengan badan usaha)</b>
        <div className="form-row">
          <label className="field">Bank<input className="input" name="bank" placeholder="mis. BCA" required /></label>
          <label className="field">Nama pemilik rekening<input className="input" name="accountName" required /></label>
          <label className="field">Nomor rekening<input className="input" name="accountNumber" inputMode="numeric" required /></label>
        </div>
      </Step>

      <Step i={7} cur={step} title="Dokumen" lead="Hanya dokumen yang relevan dengan jawaban Anda yang diwajibkan. PDF, PNG, atau JPG, maks. 10 MB per file; foto dan hasil pindai dibaca dengan OCR.">
        <DataNote ids={["documents", "photos"]} />
        <div className="stack" style={{ ["--gap" as any]: "12px" }}>
          <label className="field">Mutasi rekening 6 bulan terakhir <span style={{ color: "var(--bad)" }}>*</span><input className="input" type="file" name="doc_bank_statement" accept="application/pdf,image/png,image/jpeg" required /></label>
          {leased && <label className="field">Perjanjian sewa <span style={{ color: "var(--bad)" }}>*</span><input className="input" type="file" name="doc_lease" accept="application/pdf,image/png,image/jpeg" required /></label>}
          {owned && <label className="field">Bukti kepemilikan: sertifikat SHM/HGB, AJB, atau PBB <span style={{ color: "var(--bad)" }}>*</span><input className="input" type="file" name="doc_ownership" accept="application/pdf,image/png,image/jpeg" required /></label>}
          {insured === "ya" && <label className="field">Polis asuransi <span style={{ color: "var(--bad)" }}>*</span><input className="input" type="file" name="doc_insurance" accept="application/pdf,image/png,image/jpeg" required /></label>}
          {hasDebt === "ya" && consentLetter === "ya" && <label className="field">Surat persetujuan bank <span style={{ color: "var(--bad)" }}>*</span><input className="input" type="file" name="doc_consent_letter" accept="application/pdf,image/png,image/jpeg" required /></label>}
          {hasDebt === "ya" && <label className="field">Perjanjian kredit & jaminan <span style={{ color: "var(--bad)" }}>*</span><input className="input" type="file" name="doc_loan" accept="application/pdf,image/png,image/jpeg" required /></label>}
          <label className="field">NPWP / bukti pajak daerah <span className="muted" style={{ fontWeight: 400 }}>(opsional)</span><input className="input" type="file" name="doc_tax" accept="application/pdf,image/png,image/jpeg" /></label>
          <label className="field">Izin usaha / NIB <span className="muted" style={{ fontWeight: 400 }}>(opsional)</span><input className="input" type="file" name="doc_license" accept="application/pdf,image/png,image/jpeg" /></label>
          <label className="field">Foto venue, tampil publik, maks. 5 <span className="muted" style={{ fontWeight: 400 }}>(opsional)</span><input className="input" type="file" name="doc_photo" multiple accept="image/png,image/jpeg" /></label>
        </div>
      </Step>

      <Step i={8} cur={step} title="Tinjau & kirim" lead="Periksa ringkasan, lalu kirim. Setelah dikirim, verifikasi otomatis berjalan dan reviewer memeriksa pengajuan Anda.">
        <table className="kv"><tbody>{summary.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        <div className="stack" style={{ ["--gap" as any]: "10px" }}>
          <label className="row small" style={{ gap: 8, fontWeight: 500, alignItems: "flex-start" }}><input type="checkbox" name="consentData" required /> <span>Saya telah membaca <a href="/kebijakan-data" target="_blank" style={{ color: "var(--accent)", fontWeight: 700 }}>kebijakan data</a> dan menyetujui data serta dokumen saya diproses untuk tujuan verifikasi pengajuan ini, termasuk analisis AI atas teks dokumen yang sudah disamarkan.</span></label>
          <label className="row small" style={{ gap: 8, fontWeight: 500, alignItems: "flex-start" }}><input type="checkbox" name="consentTrue" required /> <span>Saya menyatakan seluruh data benar dan dapat dipertanggungjawabkan.</span></label>
        </div>
        <p className="small muted">Pengajuan ini adalah demo di testnet dan tidak diklaim disetujui OJK.</p>
      </Step>

      <div className="row between">
        <button type="button" className="btn" disabled={step === 0} onClick={() => go(step - 1)}>← Kembali</button>
        {step < STEPS.length - 1
          ? <button key="next" type="button" className="btn primary lg" onClick={() => go(step + 1)}>Lanjut →</button>
          : <button key="submit" type="submit" className="btn primary lg" disabled={pending}>{pending ? "Mengirim dan memverifikasi…" : "Kirim pengajuan"}</button>}
      </div>
    </form>
  );
}
