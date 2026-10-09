# venue-rwa

Tokenisasi hak atas **bagian omzet** venue olahraga (futsal / badminton / padel) + **PoS** (POS/booking) sebagai sumber data referensi.
ETHJKT 2026 · track RWA · Sepolia testnet.

> **Disclaimer.** Proyek hackathon di **testnet**, tanpa uang riil dan tanpa penawaran publik. Rupiah, KYC, kustodian, dan data venue **disimulasikan dan dilabeli** di UI. Produk ini **tidak disetujui OJK** dan belum masuk sandbox mana pun. Bukan nasihat hukum atau investasi.

## Ide dalam satu kalimat

Owner venue menjual sebagian omzet booking selama tenor tertentu ke banyak investor kecil. Uang pelanggan terbelah di sumbernya, jadi bagian investor tidak pernah lewat tangan owner.

- **Yang dijual:** manfaat ekonomi (revenue share atas *Eligible Revenue*), bukan kepemilikan venue.
- **Eligible Revenue** = omzet settle − refund − chargeback − pajak − biaya gateway. Bukan laba.
- **Token** (ERC-20, `decimals = 0`) = klaim atas kantong investor. **Redeem:** serahkan token → dibakar → terima rupiah dari kantong.
- **AI hanya menilai.** Yang menandatangani attestation adalah manusia (quorum 2-dari-3, EIP-712).
- **Bukti pendapatan** datang dari settlement payment gateway, bukan laporan owner. POS hanya mencatat hash root harian yang di-anchor on-chain (tamper-evidence, bukan bukti kebenaran).

## Arsitektur

```
Pelanggan ──bayar──▶ PSP (Xendit / simulasi) ──split di sumber──┬─▶ owner (bagian venue)
                                                                └─▶ kantong investor (kustodian)

apps/pos (PoS, :3001) ─▶ packages/connectors (BookingSource) ─▶ packages/verification ─▶ apps/platform (:3000)
                                                                                                   │
                                                                                          reviewer 2-dari-3
                                                                                                   ▼
                                                                                  packages/contracts (Sepolia)
                                                                   AssetAttestation · SeriesToken · Series
```

| Folder | Peran |
|---|---|
| `apps/pos` | **PoS** (port 3001): multi-tenant per company; login admin, produk & sesi, jadwal & booking, tagihan payment gateway otomatis, ledger append-only, hash harian, laporan |
| `apps/platform` | **Platform tokenisasi** (port 3000): landing & penawaran, portofolio investor, portal owner, reviewer, auditor, konsol operator |
| `packages/ui` | Design system bersama (palet Midnight / Slate / Ash / Sunrise / Amber / Ivory) |
| `packages/contracts` | Foundry: attestation, token seri, escrow + kantong + redeem + anchor |
| `packages/verification` | Rekonsiliasi, policy engine, skor, redaksi |
| `packages/connectors` | Interface `BookingSource` + implementasi POS (Supabase), laporan & Merkle root |
| `packages/shared` | Tipe, skema, matematika inti, hash chain, Merkle |

Tiga "pool" yang jangan tertukar: **escrow penggalangan** (dana saat raise), **kantong investor** (akumulasi bagian investor), **sumber pendapatan** (pembayaran pelanggan sebelum split).

## Alur demo (12 jam)

1. POS: buat booking → bayar (simulasi / Xendit sandbox) → refund → laporan.
2. Owner submit venue → skor AI → 2-dari-3 tanda tangan attestation on-chain.
3. Investor beli token (KYC mock) → escrow → rilis tahap 1.
4. Booking baru → split → kantong naik real-time.
5. Redeem: token dibakar, rupiah (simulasi) keluar.
6. Skenario fraud: booking tunai/fiktif terdeteksi di rekonsiliasi → exception → attestation dicabut / rilis tahap 2 ditahan.

## Cara jalan

Prasyarat: Node ≥ 22, pnpm ≥ 10, Foundry, akun Supabase, wallet testnet dengan Sepolia ETH, MetaMask.

```bash
cp .env.example .env                 # isi RPC, Supabase, gateway LLM (Morphic), alamat deployer & 3 signer
pnpm install

# 1) Database (Supabase SQL editor): jalankan berurutan db/migrations/0001 … 0008
# 2) Akun staf platform (tidak ada akun bawaan): email dan kata sandi Anda sendiri
pnpm --filter @venue-rwa/platform staff:create
# 3) Wallet operator platform (sekali): hot wallet testnet, beri ETH ke operator dan signer
./scripts/setup-operator.sh

# 4) Dua web app (terminal terpisah)
pnpm dev:pos         # PoS       → http://localhost:3001
pnpm dev:platform    # Platform  → http://localhost:3000
```

Tidak ada akun maupun data contoh: semuanya dibuat dari nol. Owner dan investor mendaftar sendiri di `/register`; staf dibuat dengan `staff:create`. Investor memakai wallet MetaMask sendiri. Tiga penandatangan attestation adalah tiga wallet (orang berbeda) yang alamatnya dikunci saat `AssetAttestation` di-deploy; mereka menandatangani lewat MetaMask.

**PoS (:3001):** Login, Dashboard, Jadwal & booking (sesi), Produk & sesi, Ledger & bukti, Laporan, Pengaturan (anggota). Halaman bayar pelanggan publik di `/pay/<token>`. Workspace PoS dibuat otomatis setelah pengajuan owner disetujui.
**Platform (:3000):** Landing, Penawaran (daftar dan detail dengan halaman penawaran/disclosure pack), Portofolio investor (hubungkan wallet, KYC via Didit atau mock bila belum dikonfigurasi, redeem), **Untuk owner** (daftar, ajukan penjualan omzet, pantau status), dan back-office khusus staf: Verifikasi (data PoS/gateway), Reviewer (tanda tangan attestation 2-dari-3), Auditor (exception + co-sign root harian), Operator (deploy seri per perusahaan, buka/tutup penawaran, rilis dana, finalisasi kantong, antrian redeem).

**Alur satu perusahaan:** owner daftar → ajukan (data + dokumen) → verifikasi otomatis → operator deploy kontrak seri → reviewer menandatangani attestation → workspace PoS dibuat otomatis → penawaran dibuka → investor membeli → PoS mencatat omzet → kantong investor → redeem.

Tes: `pnpm test:contracts` (69 tes), `pnpm --filter @venue-rwa/shared test`, `pnpm --filter @venue-rwa/verification test`, `pnpm --filter @venue-rwa/pos selftest`, `./scripts/e2e-local.sh`.
Deploy kontrak: `scripts/deploy.sh`. Uji lokal tanpa Sepolia: `scripts/local-chain.sh` (anvil).

## Kontrak ter-deploy (Sepolia)

| Kontrak | Alamat |
|---|---|
| AssetAttestation | [`0x778D1CdbB195f6a9d46262BF6c53dBe1d4603131`](https://sepolia.etherscan.io/address/0x778D1CdbB195f6a9d46262BF6c53dBe1d4603131) |
| Series (seri demo, Draft) | [`0x91D53C9f1cd95E5f0447Aeddc619126f49Fd1b6a`](https://sepolia.etherscan.io/address/0x91D53C9f1cd95E5f0447Aeddc619126f49Fd1b6a) |
| SeriesToken (`PDLD`) | [`0x40B1C77aa6711Ea3Ce3615dd106a9625C22fC3CA`](https://sepolia.etherscan.io/address/0x40B1C77aa6711Ea3Ce3615dd106a9625C22fC3CA) |

## Dokumen

- [`docs/PRD.md`](docs/PRD.md): ringkasan PRD
- [`docs/PLAN.md`](docs/PLAN.md): urutan kerja, pembagian tim, checklist submission
- [`docs/SETUP.md`](docs/SETUP.md): persiapan lingkungan
- [`docs/OPEN-DECISIONS.md`](docs/OPEN-DECISIONS.md): keputusan yang masih terbuka
- [`CLAUDE.md`](CLAUDE.md): aturan keras untuk Claude Code

## Aturan main demo

Testnet Sepolia · fiat dan KYC disimulasikan dan dilabeli · data sintetis dilabeli · tidak pernah mengklaim disetujui OJK · prinsip syariah sebagai aturan desain (tanpa bunga tetap, bagi hasil dari pendapatan nyata), bukan klaim sertifikasi.
