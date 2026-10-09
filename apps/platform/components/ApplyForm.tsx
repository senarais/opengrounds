"use client";
import { useState } from "react";
import { LAND_RIGHTS, LAND_RIGHT_LABEL, MAX_STAKE_BPS, MIN_STAKE_BPS, SPORT_OPTIONS, SURFACE_OPTIONS } from "@venue-rwa/shared";

interface Person { name: string; title: string }
interface Owner { fullName: string; ownershipPct: number; idNumber: string }
interface Fac { name: string; sport: string; lengthM: number; widthM: number; surface: string; indoor: boolean; pricePerHour: number }

const DOCS: { kind: string; label: string; required?: boolean; hint?: string }[] = [
  { kind: "deed", label: "Akta pendirian/perubahan", required: true }, { kind: "nib", label: "NIB", required: true }, { kind: "npwp", label: "NPWP badan usaha", required: true },
  { kind: "land_certificate", label: "Sertifikat tanah", required: true }, { kind: "bank_statement", label: "Rekening koran (6–12 bulan)", required: true },
  { kind: "financial_report", label: "Laporan keuangan" }, { kind: "permit", label: "Izin bangunan (PBG/SLF)" }, { kind: "tax", label: "Bukti pajak" }, { kind: "debt", label: "Perjanjian utang (bila ada)" }, { kind: "insurance", label: "Polis asuransi" }, { kind: "photo", label: "Foto venue (publik)" },
];

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <fieldset className="card" style={{ border: "1px solid var(--line)", padding: 18, borderRadius: 16, margin: "0 0 16px" }}>
    <legend style={{ padding: "0 8px", fontWeight: 700 }}>{title}</legend>
    {hint && <p className="small muted" style={{ marginTop: 0 }}>{hint}</p>}
    <div className="stack" style={{ ["--gap" as any]: "12px" }}>{children}</div>
  </fieldset>
);
const F = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field">{label}{children}</label>;

export function ApplyForm({ action, error, withOwnerEmail }: { action: (fd: FormData) => Promise<void>; error?: string; withOwnerEmail?: boolean }) {
  const [directors, setDirectors] = useState<Person[]>([{ name: "", title: "Direktur Utama" }]);
  const [commissioners, setCommissioners] = useState<Person[]>([]);
  const [owners, setOwners] = useState<Owner[]>([{ fullName: "", ownershipPct: 100, idNumber: "" }]);
  const [facs, setFacs] = useState<Fac[]>([{ name: "Lapangan 1", sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 150000 }]);
  const [encumbered, setEncumbered] = useState(false);
  const [stake, setStake] = useState(5000);
  const upd = <T,>(arr: T[], set: (a: T[]) => void, i: number, patch: Partial<T>) => set(arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form action={action} encType="multipart/form-data">
      <input type="hidden" name="directors" value={JSON.stringify(directors)} />
      <input type="hidden" name="commissioners" value={JSON.stringify(commissioners.filter((c) => c.name))} />
      <input type="hidden" name="owners" value={JSON.stringify(owners)} />
      <input type="hidden" name="facilities" value={JSON.stringify(facs)} />
      {error && <div className="msg err" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {withOwnerEmail && <Section title="0. Akun owner" hint="Venue akan tercatat di akun owner ini dan owner yang menandatangani akuisisi."><F label="Email akun owner (sudah terdaftar)"><input className="input" type="email" name="ownerEmail" required /></F></Section>}
      <Section title="1. Badan usaha" hint="Hanya dilihat staf verifikasi. Tidak pernah tampil di halaman publik.">
        <div className="grid c2">
          <F label="Nama legal"><input className="input" name="legalName" required /></F>
          <F label="KBLI (5 digit)"><input className="input" name="kbli" required pattern="\d{5}" placeholder="93112" /></F>
          <F label="NIB (13 digit)"><input className="input" name="nib" required pattern="\d{13}" /></F>
          <F label="NPWP (15/16 digit, tanpa titik)"><input className="input" name="npwp" required pattern="\d{15,16}" /></F>
          <F label="Nomor akta"><input className="input" name="deedNumber" required /></F>
          <F label="Tanggal akta"><input className="input" type="date" name="deedDate" required /></F>
        </div>
        <F label="Alamat terdaftar"><input className="input" name="registeredAddress" required minLength={10} /></F>
        <div className="grid c2">
          <F label="Penandatangan"><input className="input" name="signatoryName" required /></F>
          <F label="Jabatan penandatangan"><input className="input" name="signatoryTitle" required /></F>
          <F label="Email kontak"><input className="input" type="email" name="contactEmail" required /></F>
          <F label="HP kontak"><input className="input" name="contactPhone" required placeholder="08123456789" /></F>
        </div>
        <b className="small">Direksi</b>
        {directors.map((d, i) => <div className="row" key={i}><input className="input" placeholder="Nama" value={d.name} onChange={(e) => upd(directors, setDirectors, i, { name: e.target.value })} required /><input className="input" placeholder="Jabatan" value={d.title} onChange={(e) => upd(directors, setDirectors, i, { title: e.target.value })} required />{directors.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setDirectors(directors.filter((_, j) => j !== i))}>Hapus</button>}</div>)}
        <div><button type="button" className="btn sm" onClick={() => setDirectors([...directors, { name: "", title: "Direktur" }])}>+ Direktur</button></div>
        <b className="small">Komisaris (opsional)</b>
        {commissioners.map((d, i) => <div className="row" key={i}><input className="input" placeholder="Nama" value={d.name} onChange={(e) => upd(commissioners, setCommissioners, i, { name: e.target.value })} /><input className="input" placeholder="Jabatan" value={d.title} onChange={(e) => upd(commissioners, setCommissioners, i, { title: e.target.value })} /><button type="button" className="btn sm ghost" onClick={() => setCommissioners(commissioners.filter((_, j) => j !== i))}>Hapus</button></div>)}
        <div><button type="button" className="btn sm" onClick={() => setCommissioners([...commissioners, { name: "", title: "Komisaris" }])}>+ Komisaris</button></div>
      </Section>

      <Section title="2. Pemilik manfaat ≥25%" hint="NIK hanya dipakai untuk verifikasi dan disimpan tersamarkan (4 digit terakhir).">
        {owners.map((o, i) => <div className="grid c3" key={i}><input className="input" placeholder="Nama lengkap" value={o.fullName} onChange={(e) => upd(owners, setOwners, i, { fullName: e.target.value })} required /><input className="input" type="number" min={25} max={100} step="0.01" placeholder="% kepemilikan" value={o.ownershipPct} onChange={(e) => upd(owners, setOwners, i, { ownershipPct: Number(e.target.value) })} required /><div className="row"><input className="input" placeholder="NIK 16 digit" value={o.idNumber} onChange={(e) => upd(owners, setOwners, i, { idNumber: e.target.value })} required inputMode="numeric" />{owners.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setOwners(owners.filter((_, j) => j !== i))}>×</button>}</div></div>)}
        {owners.length < 4 && <div><button type="button" className="btn sm" onClick={() => setOwners([...owners, { fullName: "", ownershipPct: 25, idNumber: "" }])}>+ Pemilik manfaat</button></div>}
      </Section>

      <Section title="3. Venue" hint="Nama, kota, jenis olahraga, dan lapangan tampil publik. Alamat persis hanya untuk investor ber-KYC.">
        <div className="grid c2">
          <F label="Nama venue"><input className="input" name="venueName" required /></F>
          <F label="Beroperasi sejak (bulan)"><input className="input" type="month" name="operatingSince" required /></F>
          <F label="Kota"><input className="input" name="city" required /></F>
          <F label="Provinsi"><input className="input" name="province" required /></F>
          <F label="Jam buka"><input className="input" type="number" name="openHour" min={0} max={23} defaultValue={7} required /></F>
          <F label="Jam tutup"><input className="input" type="number" name="closeHour" min={1} max={24} defaultValue={23} required /></F>
        </div>
        <F label="Alamat lengkap"><input className="input" name="address" required minLength={10} /></F>
        <div className="grid c2"><F label="Latitude (opsional)"><input className="input" name="lat" type="number" step="any" /></F><F label="Longitude (opsional)"><input className="input" name="lng" type="number" step="any" /></F></div>
        <b className="small">Lapangan</b>
        {facs.map((f, i) => (
          <div className="card" key={i} style={{ padding: 12 }}>
            <div className="grid c3">
              <input className="input" placeholder="Nama" value={f.name} onChange={(e) => upd(facs, setFacs, i, { name: e.target.value })} required />
              <select className="input" value={f.sport} onChange={(e) => upd(facs, setFacs, i, { sport: e.target.value })}>{SPORT_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
              <select className="input" value={f.surface} onChange={(e) => upd(facs, setFacs, i, { surface: e.target.value })}>{SURFACE_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
              <input className="input" type="number" placeholder="Panjang (m)" value={f.lengthM} onChange={(e) => upd(facs, setFacs, i, { lengthM: Number(e.target.value) })} />
              <input className="input" type="number" placeholder="Lebar (m)" value={f.widthM} onChange={(e) => upd(facs, setFacs, i, { widthM: Number(e.target.value) })} />
              <input className="input" type="number" placeholder="Tarif / jam" value={f.pricePerHour} onChange={(e) => upd(facs, setFacs, i, { pricePerHour: Number(e.target.value) })} />
            </div>
            <div className="row" style={{ marginTop: 8 }}><label className="small"><input type="checkbox" checked={f.indoor} onChange={(e) => upd(facs, setFacs, i, { indoor: e.target.checked })} /> Indoor</label>{facs.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setFacs(facs.filter((_, j) => j !== i))}>Hapus</button>}</div>
          </div>
        ))}
        <div><button type="button" className="btn sm" onClick={() => setFacs([...facs, { name: `Lapangan ${facs.length + 1}`, sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 150000 }])}>+ Lapangan</button></div>
        <F label="Jenis olahraga (otomatis dari daftar lapangan)"><input className="input" readOnly value={[...new Set(facs.map((f) => f.sport))].join(", ")} /></F>
      </Section>

      <Section title="4. Lahan (gerbang wajib)" hint="Venue hanya diterima bila tanahnya milik sendiri: sertifikat atas nama badan usaha, direksi, atau pemilik manfaat.">
        <label className="small"><input type="checkbox" name="landOwned" required /> Tanah venue ini milik sendiri</label>
        <div className="grid c2">
          <F label="Jenis hak"><select className="input" name="rightType">{LAND_RIGHTS.map((r) => <option key={r} value={r}>{r} · {LAND_RIGHT_LABEL[r]}</option>)}</select></F>
          <F label="Nomor sertifikat"><input className="input" name="certificateNumber" required /></F>
          <F label="Atas nama"><input className="input" name="holderName" required /></F>
          <F label="Perkiraan nilai aset (tanah + bangunan + peralatan), Rp"><input className="input" type="number" name="assetValue" min={1} required /></F>
        </div>
        <label className="small"><input type="checkbox" name="encumbered" checked={encumbered} onChange={(e) => setEncumbered(e.target.checked)} /> Lahan sedang dijaminkan (hak tanggungan)</label>
        {encumbered && <label className="small"><input type="checkbox" name="encumbranceConsent" /> Ada persetujuan tertulis pemegang hak tanggungan untuk penjualan hak ekonomi ini</label>}
        <F label="Izin (pisahkan koma, mis. PBG, SLF)"><input className="input" name="permits" /></F>
        <p className="small muted">Nilai aset hanyalah klaim awal Anda; reviewer menetapkan nilai final dari dokumen (di demo, input reviewer berlabel).</p>
      </Section>

      <Section title="5. Keuangan 6–12 bulan" hint="Unggah satu file CSV/XLSX per bulan: bulan, bruto, refund, biaya_operasional, pajak, fee_operator, cadangan, fee_platform, omzet_digital. Bulan berjalan tidak dihitung.">
        <F label="File data penjualan"><input className="input" type="file" name="sales_data" accept=".csv,.xlsx" required /></F>
        <a className="small" href="/api/sales-template" download>Unduh template CSV</a>
        <div className="grid c2">
          <F label="Sisa pokok utang (Rp, 0 bila tidak ada)"><input className="input" type="number" name="debtOutstanding" min={0} defaultValue={0} required /></F>
          <F label="Cicilan per bulan (Rp)"><input className="input" type="number" name="debtInstallment" min={0} defaultValue={0} required /></F>
          <F label="Kreditur (bila ada utang)"><input className="input" name="debtLender" /></F>
          <label className="small" style={{ alignSelf: "end" }}><input type="checkbox" name="covenantRestricts" /> Perjanjian kredit membatasi penjualan/penjaminan pendapatan</label>
        </div>
      </Section>

      <Section title="6. Penawaran" hint="Anda menjual hak atas sebagian laba bersih yang bisa dibagikan, bukan omzet dan bukan kepemilikan venue.">
        <F label="Harga awal per token (Rp)"><input className="input" name="tokenPrice" type="number" min={1000} max={100000000} step={1000} defaultValue={10000} required /></F>
        <F label={`Porsi hak ekonomi yang dijual (X): ${stake / 100}%`}><input type="range" name="stakeBps" min={MIN_STAKE_BPS} max={MAX_STAKE_BPS} step={100} value={stake} onChange={(e) => setStake(Number(e.target.value))} /></F>
        <F label="Rencana penggunaan dana"><textarea className="input" name="useOfFunds" required minLength={10} maxLength={400} rows={3} /></F>
        <p className="small muted">Harga awal diajukan untuk ditinjau. Jumlah token dihitung dari valuasi dan harga awal, lalu dikunci saat penerbitan.</p>
      </Section>

      <Section title="7. Rekening tujuan owner" hint="Atas nama badan usaha. Disimpan tersamarkan.">
        <div className="grid c3"><F label="Bank"><input className="input" name="bank" required /></F><F label="Nama pemilik rekening"><input className="input" name="accountName" required /></F><F label="Nomor rekening"><input className="input" name="accountNumber" required inputMode="numeric" /></F></div>
      </Section>

      <Section title="8. Dokumen" hint="PDF/PNG/JPG maks 10 MB per file. Teks disamarkan sebelum dibaca AI; AI hanya memberi temuan untuk reviewer.">
        <div className="grid c2">{DOCS.map((d) => <F key={d.kind} label={`${d.label}${d.required ? " *" : ""}`}><input className="input" type="file" name={`doc_${d.kind}`} accept=".pdf,.png,.jpg,.jpeg" required={d.required} multiple={d.kind === "photo"} /></F>)}</div>
      </Section>

      <Section title="9. Persetujuan">
        <label className="small"><input type="checkbox" name="gatewayOnly" required /> Semua pembayaran digital venue akan lewat payment gateway yang ditetapkan platform (split di sumber). Pembayaran tunai tidak dihitung terverifikasi.</label>
        <label className="small"><input type="checkbox" name="bankDataAccess" /> Saya mengizinkan akses data rekening koran untuk rekonsiliasi</label>
        <label className="small"><input type="checkbox" name="dataProcessing" required /> Saya setuju data diproses, termasuk analisis AI atas teks dokumen yang sudah disamarkan</label>
        <label className="small"><input type="checkbox" name="truthful" required /> Saya menyatakan data ini benar</label>
        {withOwnerEmail && <p className="small muted">Mengirim pengajuan ini sekaligus menyatakan persetujuan Grounds atas rencana pembelian hak ekonomi yang tercantum. Setelah operator dan reviewer menyetujui, owner tetap harus mengonfirmasi pengalihan hak dan pembayaran lewat tanda tangan wallet. Tidak ada tombol persetujuan pembelian ulang.</p>}
        <button className="btn primary lg">{withOwnerEmail ? "Ajukan pembelian hak untuk direview" : "Ajukan untuk diverifikasi"}</button>
      </Section>
    </form>
  );
}
