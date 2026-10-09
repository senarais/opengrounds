import { Badge, Card, Notice, PageHeader } from "@venue-rwa/ui";
import { DATA_CATALOG, VISIBILITY_LABEL, type Visibility } from "@venue-rwa/shared";

export const metadata = { title: "Kebijakan data" };
const TONE: Record<Visibility, "ok" | "warn" | "neutral" | "bad"> = { public: "neutral", kyc_investor: "warn", staff: "warn", owner_only: "warn", never: "ok" };

export default function DataPolicy() {
  return (
    <div className="container">
      <PageHeader eyebrow="Transparansi" title="Kebijakan data" lead="Apa yang kami minta, untuk apa, siapa yang melihat, dan ke mana perginya. Dirancang mengikuti prinsip pelindungan data pribadi (UU No. 27 Tahun 2022): tujuan yang spesifik, hanya data yang diperlukan, dan akses yang dibatasi." />
      <Notice tone="warn" title="Catatan jujur:">Ini dokumen produk di testnet, bukan nasihat hukum dan bukan pernyataan kepatuhan hukum. Sebelum dipakai untuk data nyata, kebijakan ini perlu ditinjau konsultan hukum. Bagian yang belum kami bangun ditandai jelas di bawah.</Notice>

      <div className="section-title"><h2>Data apa, untuk apa, siapa yang melihat</h2></div>
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Data</th><th>Tujuan</th><th>Siapa yang melihat</th><th>Dikirim ke AI?</th><th>Disimpan di</th></tr></thead>
            <tbody>{DATA_CATALOG.map((d) => (
              <tr key={d.id}>
                <td><b>{d.label}</b>{!d.required && <div className="small muted">opsional</div>}</td>
                <td className="small">{d.purpose}</td>
                <td><Badge tone={TONE[d.visibility]} plain>{VISIBILITY_LABEL[d.visibility]}</Badge></td>
                <td className="small">{d.ai === "tidak" ? "Tidak" : "Ya, hanya teks yang sudah disamarkan"}</td>
                <td className="small">{d.where}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid c2 mt">
        <Card title="Yang benar-benar dilakukan sistem">
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
            <li>Dokumen disimpan di penyimpanan privat. Tautan unduh hanya dibuat untuk staf (foto venue boleh publik), dan berlaku 5 menit.</li>
            <li>Identitas usaha, rekening, kontak, dan rincian keuangan internal disimpan di tabel tanpa akses dari browser; hanya server yang membacanya.</li>
            <li>Sebelum teks dokumen dikirim ke model AI, NIK, nomor rekening, telepon, dan email disamarkan. Gambar tidak dikirim; hanya teks hasil pembacaan. Model AI tidak punya akses ke alat atau jaringan, dan keluarannya divalidasi.</li>
            <li>AI tidak menyetujui apa pun dan tidak bisa mencetak token, mengubah rekening, atau memindahkan uang. Setiap temuan AI wajib ditinjau reviewer manusia; penerbitan token butuh tanda tangan platform dan owner.</li>
            <li>KTP dan selfie investor diproses penyedia KYC (Didit). Platform hanya menerima status dan nama (untuk mencocokkan rekening bank). Tanpa Didit, KYC memakai mock berlabel sandbox.</li>
            <li>Nomor rekening dan NIK disimpan tersamarkan (4 digit terakhir) beserta hash, bukan nomor utuh.</li>
            <li>Tidak ada data pribadi di blockchain: hanya alamat wallet, angka, dan hash. Karena sifat blockchain, catatan itu tidak bisa dihapus.</li>
            <li>Semua tindakan penting dicatat di jejak audit.</li>
          </ul>
        </Card>
        <Card title="Yang belum kami bangun">
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
            <li><b>Penghapusan otomatis (retensi).</b> Belum ada jadwal penghapusan data. Untuk produksi, kami mengusulkan: pengajuan yang ditolak dihapus setelah masa sanggah; data aktif disimpan selama seri berjalan ditambah masa wajib simpan menurut hukum.</li>
            <li><b>Hak subjek data</b> (akses, koreksi, penghapusan, menarik persetujuan). Belum ada tombol; saat ini lewat permintaan manual ke penyelenggara. Penghapusan data yang terikat transaksi bisa dibatasi kewajiban hukum.</li>
            <li><b>Verifikasi resmi NIB/NPWP/akta</b> ke sumber pemerintah (AHU/OSS). Belum terintegrasi; saat ini format diperiksa dan dokumen yang diunggah disilang-cek.</li>
            <li><b>Pemberitahuan insiden</b> kepada pemilik data. Belum ada prosedur otomatis.</li>
            <li><b>Penilaian dampak pelindungan data</b> formal. Belum dilakukan.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
