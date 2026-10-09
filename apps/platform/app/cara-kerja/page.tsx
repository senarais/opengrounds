import { DEMO_PARAMS } from "@venue-rwa/shared";
import { Card, PageHeader } from "@venue-rwa/ui";
import { Asumsi, Statements } from "@/components/Statements";
import { REGISTRY, etherscan } from "@/lib/chain";

export const metadata = { title: "Cara kerja dan rumus" };
const P = DEMO_PARAMS;
const pct = (b: number) => `${b / 100}%`;

export default function HowItWorks() {
  let registry: string | null = null;
  try { registry = REGISTRY.address; } catch { /* belum dideploy */ }
  return (
    <div className="container">
      <PageHeader eyebrow="Transparansi" title="Cara kerja dan rumus" lead="Semua angka di produk dihitung dengan rumus di halaman ini. Kontrak di Sepolia menghitung ulang angka yang sama dan menolak yang melanggar aturan." />

      <div className="grid c2">
        <Card title="Valuasi dan harga referensi" subtitle="PRD §4.1–4.3">
          <div id="rumus" className="small" style={{ lineHeight: 1.9 }}>
            <div><b>D12</b> = laba bersih yang bisa dibagikan selama 12 bulan terakhir yang lolos rekonsiliasi</div>
            <div><b>V_income</b> = D12 ÷ r, dengan r = {pct(P.requiredYieldBps)}<Asumsi /></div>
            <div><b>V</b> = min(nilai aset, V_income): diambil yang lebih konservatif</div>
            <div><b>y</b> = D12 ÷ V; wajar bila {pct(P.yieldMinBps)}–{pct(P.yieldMaxBps)}<Asumsi />. Di luar rentang ditandai untuk reviewer, bukan ditolak otomatis.</div>
            <div><b>S</b> = V × X (X = porsi hak ekonomi yang dibeli Grounds)</div>
            <div><b>N</b> = S ÷ p, dengan harga nominal p = Rp{P.tokenPrice.toLocaleString("id-ID")}<Asumsi /></div>
            <div><b>Harga referensi</b> = V × X ÷ N. Berubah hanya lewat revaluasi (ditandatangani platform + verifier), untuk transaksi baru.</div>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Nilai aset di demo diinput reviewer dari dokumen dan dilabeli. Di production berasal dari penilai independen. Grounds menentukan nilai sekaligus menjual token: karena itu input dan hasilnya ditampilkan.</p>
        </Card>
        <Card title="Waterfall bulanan dan jatah per token" subtitle="PRD §4.4–4.5">
          <div className="small" style={{ lineHeight: 1.9 }}>
            <div><b>D</b> = max(0, omzet kotor − refund − biaya operasional − pajak − fee operator − cadangan venue − fee platform)</div>
            <div><b>P_SPV</b> = D × X · <b>F_spv</b> = P_SPV × m (m = {pct(P.spvFeeBps)}<Asumsi />) · <b>P_inv</b> = P_SPV − F_spv</div>
            <div><b>Jatah per token</b> = P_inv ÷ N (akumulator 1e18, dibulatkan ke bawah; sisa dibawa ke periode berikutnya)</div>
            <div><b>Kewajiban periode</b> = (N − token di treasury) × jatah per token. Bagian token treasury kembali ke Grounds.</div>
            <div>Kontrak menolak bila total potongan melebihi omzet kotor atau biaya operasional di atas {pct(P.maxOpexBps)}<Asumsi /> omzet. Fee platform {pct(P.platformFeeBps)}<Asumsi /> omzet. Kerugian tidak dibawa ke bulan berikutnya dan investor tidak ditagih.</div>
          </div>
        </Card>
        <Card title="Uang harian dan koreksi akhir bulan" subtitle="PRD §3.6.1–3.6.2">
          <p className="small">Tiap pembayaran booking lewat payment gateway dipecah: {pct(P.splitBps)}<Asumsi /> ke kantong SPV, sisanya langsung ke owner. Akhir periode, kantong dibandingkan dengan P_SPV: kelebihan kembali ke owner, kekurangan dilengkapi owner sebelum tenggat. Bila jatah belum tersedia {P.payoutWindowSeconds / 86_400} hari<Asumsi /> setelah diposting, siapa pun bisa menandai seri <b>Overdue</b>; {P.defaultGraceSeconds / 86_400} hari<Asumsi /> kemudian <b>Defaulted</b>.</p>
          <p className="small muted" style={{ marginTop: 8 }}>Split di demo memakai MockPaymentProvider (sandbox) karena xenPlatform belum aktif di akun kami.</p>
        </Card>
        <Card title="Siapa menyetujui apa" subtitle="Attestation EIP-712, 2 dari 3 penanda tangan">
          <table className="table small">
            <thead><tr><th>Keputusan</th><th>Penanda tangan</th></tr></thead>
            <tbody>
              <tr><td>Verifikasi aset → token boleh terbit</td><td>Grounds (SPV) via Open Grounds sebagai pembeli + owner sebagai penjual. SPV lebih dulu menyetujui pembelian di aplikasi.</td></tr>
              <tr><td>Angka laba bulanan</td><td>Grounds via Open Grounds + owner; bila owner diam {P.ownerSignWindowSeconds / 86_400} hari<Asumsi />, + reviewer independen (verifier)</td></tr>
              <tr><td>Revaluasi harga referensi</td><td>Grounds via Open Grounds + reviewer independen (verifier)</td></tr>
              <tr><td>Beli token / jual balik</td><td>Investor sendiri (pesanan bertanda tangan), dieksekusi platform setelah rupiah masuk</td></tr>
              <tr><td>Jatah sudah dikreditkan</td><td>Platform, tidak bisa melebihi kewajiban on-chain</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>Jujur untuk demo: Open Grounds dan Grounds (SPV) dijalankan tim kami, dan bila dua kunci dipegang tim yang sama, 2-dari-3 hanya mendemokan mekanismenya. Pihak yang benar-benar independen dari kami hanya owner dan reviewer. Di production SPV dan platform harus dipisah (pengurus, rekening, kendali).{registry && <> Registry: <a href={etherscan(registry)} target="_blank" rel="noreferrer" className="mono">{registry.slice(0, 10)}…</a></>}</p>
        </Card>
        <Card title="Token" subtitle="ERC-20 decimals 0, transfer terbatas">
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Supply dicetak sekali ke treasury saat akuisisi; tidak ada mint tambahan dan tidak ada burn.</li>
            <li>Token hanya bergerak treasury → investor (setelah bayar) dan investor → treasury (jual balik). Transfer antar investor ditolak kontrak.</li>
            <li>Setiap pembelian membentuk lot dengan masa kunci sendiri: {P.lockSeconds / 60} menit di demo mode<Asumsi /> (production: 6 bulan).</li>
            <li>Jual balik di harga referensi × (1 − d), d = {pct(P.sellbackDiscountBps)}<Asumsi />, dari cadangan buyback, antrean FIFO per jendela. Tidak dijamin.</li>
            <li>Token tidak punya masa berlaku. Berakhir hanya lewat likuidasi/pembubaran.</li>
          </ul>
        </Card>
        <Card title="Status seri">
          <p className="small" style={{ lineHeight: 1.8 }}>Draft → Verified → <b>Active</b> ⇄ Disputed · Active → Overdue → (Active | Defaulted) · Defaulted → (Active | Liquidating) · Liquidating → Closed</p>
          <p className="small muted">Status dibaca langsung dari kontrak.</p>
        </Card>
      </div>
      <div className="mt"><Statements /></div>
    </div>
  );
}
