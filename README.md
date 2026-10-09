# OpenGrounds (venue-rwa)

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
cp .env.example .env     # satu .env di root untuk semua app, skrip, dan Foundry (tanpa .env per app)
pnpm install
cd packages/contracts && forge install OpenZeppelin/openzeppelin-contracts --no-git && forge install foundry-rs/forge-std --no-git && forge build && cd ../..
```

1. **Database.** Di Supabase SQL editor jalankan berurutan `db/migrations/0001` … `0019`. Reset total: `db/reset_all.sql` lalu `pnpm --filter @venue-rwa/platform reset:storage`.
2. **Wallet.** Buat 4 wallet testnet baru (deployer + 3 penandatangan, orang berbeda; Signer 3 = auditor independen), isi Sepolia ETH, tulis alamatnya di `.env`. Jangan pakai kunci asli.
3. **Kontrak.** `./scripts/deploy.sh` (butuh keystore Foundry `deployer`: `cast wallet import deployer --interactive`). Alamat registry tersimpan otomatis di `packages/contracts/deployments/latest.json` dan dibaca platform; kontrak Series per pengajuan dideploy otomatis setelah review.
4. **Akun staf dan wallet operator.** `pnpm --filter @venue-rwa/platform staff:create`, lalu `./scripts/setup-operator.sh` (hot wallet server; beri ETH).
5. **Jalankan** (terminal terpisah): `pnpm dev:pos` (→ :3001) dan `pnpm dev:platform` (→ :3000).

Opsional di `.env` (kosong = jalur simulasi berlabel):
- `PSP_MODE=xendit` + `XENDIT_SECRET_KEY`: pembelian token dan booking dibayar lewat Xendit Invoice; token di-mint setelah invoice PAID menurut API Xendit. Key `xnd_development_…` = mode uji.
- `NEXT_PUBLIC_PRIVY_APP_ID`: wallet investor dibuat otomatis (Privy, custom auth JWT dari Supabase: signing key asimetris, JWKS `…/auth/v1/.well-known/jwks.json`, claim `sub`, `aud=authenticated`).
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`: gateway OpenAI-compatible (Morphic) untuk ekstraksi dokumen; hanya teks yang sudah diredaksi yang dikirim.
- `DIDIT_*`: KYC sungguhan lewat Didit; kosong = KYC mock berlabel.
- `INTERNAL_API_TOKEN`: token rahasia antar-app. Setiap pembayaran booking yang settle di gateway membuat PoS memberi tahu platform, lalu bagian investor langsung diposting ke kantong on-chain (bila penawaran sudah terdanai). Kosong = kantong hanya bertambah lewat finalisasi manual operator.

Semua pembayaran booking wajib lewat payment gateway (tunai dan QRIS milik sendiri tidak diterima). Syarat penawaran (jumlah token, harga, persen omzet, tenor, minimum) dikunci sejak owner mengirim pengajuan.

Tidak ada akun maupun data contoh: owner dan investor mendaftar sendiri di `/register`, staf dibuat dengan `staff:create`.

**Alur satu perusahaan:** owner daftar dan ajukan (data + dokumen) → verifikasi otomatis + analisis dokumen AI → operator dan auditor masing-masing setuju dengan satu tanda tangan MetaMask → kontrak dideploy, attestation dikirim, penawaran dibuka otomatis → investor membayar → token di-mint → PoS mencatat omzet → kantong investor → redeem.

**Tes:** `pnpm test:contracts`, `pnpm --filter @venue-rwa/shared test`, `pnpm --filter @venue-rwa/verification test`, `pnpm --filter @venue-rwa/pos selftest`, `./scripts/e2e-local.sh` (chain lokal anvil + Supabase). Uji AI sungguhan: `pnpm --filter @venue-rwa/platform exec tsx --env-file=../../.env scripts/ai-live-test.ts`.

## Kontrak (Sepolia)

Registry `AssetAttestation` aktif: lihat `packages/contracts/deployments/latest.json`. Setiap pengajuan mendapat kontrak `Series` dan token sendiri; alamatnya tampil di halaman penawaran dan konsol Operator (tersambung ke Etherscan).

## Aturan main demo

Testnet Sepolia · fiat dan KYC disimulasikan dan dilabeli · data sintetis dilabeli · tidak pernah mengklaim disetujui OJK · prinsip syariah sebagai aturan desain (tanpa bunga tetap, bagi hasil dari pendapatan nyata), bukan klaim sertifikasi.
