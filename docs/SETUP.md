# Setup lingkungan

## Versi yang dipakai (sudah terverifikasi di mesin Nuza)

Node v24, pnpm 10.34, Foundry 1.7.1, git 2.52.

## 1. Dependensi workspace

```bash
cp .env.example .env
pnpm install
```

## 2. Foundry (packages/contracts)

```bash
cd packages/contracts
forge init --no-git --force .
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install foundry-rs/forge-std --no-git   # sudah ikut forge init; lewati jika ada
```

`foundry.toml` minimal:

```toml
[profile.default]
src = "src"
test = "test"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
remappings = ["@openzeppelin/=lib/openzeppelin-contracts/"]

[invariant]
runs = 256
depth = 64
fail_on_revert = false
```

Cek nama file OZ v5 persis setelah install, mis.:
`@openzeppelin/contracts/token/ERC20/ERC20.sol`, `utils/ReentrancyGuard.sol`, `utils/cryptography/EIP712.sol`, `utils/cryptography/ECDSA.sol`, `utils/cryptography/MerkleProof.sol`, `access/AccessControl.sol`, `utils/Pausable.sol`.

## 3. Wallet dan Sepolia

1. Buat **4 wallet testnet baru**: deployer + 3 penandatangan (orang berbeda). Jangan pakai kunci asli.
2. Isi Sepolia ETH dari faucet (deployer paling banyak; gas mint ditanggung platform).
3. Isi `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `SIGNER_{1,2,3}_ADDRESS`, `ETHERSCAN_API_KEY`.
4. Urutkan alamat penandatangan **naik** (kontrak menolak yang tidak terurut).

## 4. Deploy

Foundry hanya auto-baca `.env` di folder tempat `forge` dijalankan. `.env` kita ada di root, jadi muat dulu:

```bash
cd packages/contracts
set -a; source ../../.env; set +a
```

Signer = 3 wallet testnet baru: `cast wallet new` (3x). Alamat ke `.env`; private key simpan terpisah (jangan di `.env` yang ke-commit, jangan dibagikan).


```bash
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

Catat alamat ke `README.md` dan `deployments/sepolia.json`.

## 5. PSP

Default `PSP_MODE=simulated`. Xendit sandbox hanya dicoba **setelah** dicek langsung: dukungan split QRIS/VA, test mode split, batas sub-akun, biaya. Jangan dijanjikan ke juri sebelum terverifikasi.

## 6. AI

Lapisan ekstraksi dokumen memakai gateway **Kagiro** (OpenAI-compatible, `KAGIRO_BASE_URL` + `KAGIRO_API_KEY` + `KAGIRO_MODEL`), bukan API Anthropic langsung. Hanya teks yang sudah diredaksi yang boleh dikirim; dokumen sintetis berlabel di hackathon.

## 7. Cek cepat

```bash
node -v && pnpm -v && forge --version
pnpm test:contracts   # setelah kontrak ada
```

## Catatan

- `.env` tidak boleh ke-commit (sudah di `.gitignore`).
- Direktori `packages/contracts/lib` di-ignore; install ulang dengan `forge install` di mesin lain.


## 8. Migration database (urutan wajib)

Jalankan di Supabase SQL editor, berurutan: `0001` … `0019` di `db/migrations/`.
`0006` membuat ulang skema `pos` (multi-tenant), `0007` menambah kolom PSP di `pos.payments`, `0008` menambah alur pengajuan owner (akun, status, disclosure pack, seri per perusahaan), `0009` hasil ekstraksi AI + payout owner + refund, `0010` metode bayar booking (gateway/tunai/QRIS sendiri), `0011` sesi KYC Didit, connector impor (kolom `source`, tabel `pos.api_keys`), seri pengganti untuk perubahan harga, `0012` catatan transfer token, `0013` data privat pengajuan (identitas usaha, rekening), `0014` jenis dokumen baru (bukti kepemilikan, data penjualan), `0015`–`0017` gerbang review dua pihak + undangan staf, `0018` bukti tanda tangan wallet pada suara review, `0019` pembelian investor lewat payment gateway (status, invoice Xendit).

Setelah itu: `pnpm --filter @venue-rwa/platform staff:create` (akun staf Anda sendiri), lalu `./scripts/setup-operator.sh` (sekali).

## 9. Uji tanpa browser

```bash
pnpm test:contracts                       # kontrak + invarian (Foundry)
pnpm --filter @venue-rwa/shared test      # logika murni (sesi, disclosure, pengajuan, matematika kantong)
pnpm --filter @venue-rwa/verification test
pnpm --filter @venue-rwa/pos selftest     # PoS multi-tenant + RLS (ke Supabase, venue uji terpisah)
./scripts/e2e-local.sh                    # perjalanan penuh di chain lokal (anvil) + Supabase; membersihkan baris uji
```

## 10. Reset total (mulai dari nol)

1. Supabase SQL editor: jalankan `db/reset_all.sql` (menghapus SEMUA data aplikasi dan SEMUA akun login).
2. `pnpm --filter @venue-rwa/platform reset:storage` (hapus file dokumen/foto; `--dry` untuk hanya menghitung).
3. `pnpm --filter @venue-rwa/platform staff:create` (buat akun staf Anda lagi).

Kontrak di blockchain tidak ikut terhapus; seri lama hanya menjadi yatim. Registry `AssetAttestation` tetap dipakai.


## Fitur tambahan (Didit, OCR, impor data, ubah harga)

**Pembelian investor lewat Xendit.** Set `PSP_MODE=xendit` dan `XENDIT_SECRET_KEY` di `.env`. Tombol beli membuat tagihan Xendit Invoice (QRIS, virtual account, e-wallet) dan mengarahkan investor ke halaman bayar Xendit; token di-mint setelah status invoice terbukti PAID dari API Xendit, bukan dari klik atau isi webhook. Penyelesaian dipicu saat investor kembali ke Portofolio (cukup untuk lokal) dan, bila ada URL publik, oleh webhook `POST /api/xendit/webhook` (daftarkan di dashboard Xendit dengan `XENDIT_WEBHOOK_TOKEN` yang sama). Dengan key `xnd_development_…` pembayaran dilakukan di mode uji (tombol simulasi di halaman Xendit); escrow kustodian tetap simulasi (Mode A). Kosong/`simulated` = alur simulasi lama. Catatan: batas nominal per transaksi mengikuti metode bayar Xendit (e-wallet/QRIS lebih kecil dari virtual account).

**Wallet investor otomatis (Privy).** Isi `NEXT_PUBLIC_PRIVY_APP_ID` di `.env`. Investor yang login langsung mendapat wallet embedded (kunci disimpan Privy, bukan platform); alamatnya dibuktikan ke server dengan satu tanda tangan pesan, lalu tombol Tebus dan Kirim token menandatangani lewat wallet itu. Kosong = investor menautkan MetaMask sendiri. Pengaturan satu kali:
1. Supabase → Settings → JWT Keys: pindah ke signing key **asimetris** (JWKS publik di `https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json`).
2. Dashboard Privy → buat app → Authentication → JWT-based auth: isi JWKS endpoint di atas, claim user id `sub`. Catatan: custom auth + embedded wallet tertulis sebagai fitur Enterprise di dokumentasi Privy; periksa paket akun Anda.
3. Privy → Wallets: aktifkan embedded wallet Ethereum, `Allowed origins` = `http://localhost:3000`.
Staf (operator/auditor) tetap memakai wallet Signer di MetaMask karena alamatnya terdaftar di kontrak.

**KYC Didit.** Isi di `.env`: `DIDIT_API_KEY` (Didit Console → Settings → API & Webhooks), `DIDIT_WORKFLOW_ID` (Console → Workflows), dan `DIDIT_WEBHOOK_SECRET` (opsional untuk lokal). Kosong = KYC mock yang dilabeli. Setelah verifikasi, pengguna kembali ke Portofolio dan status ditarik dari API Didit; webhook (`/api/kyc/didit`) hanya perlu bila server punya URL publik, dan selalu memverifikasi tanda tangan. Platform hanya menyimpan status per wallet, bukan data identitas.

**OCR.** Gambar (PNG/JPEG) dan PDF hasil pindai dibaca dengan tesseract.js (bahasa `ind`+`eng`; data bahasa diunduh sekali ke `apps/platform/.ocr-cache`, jadi pemakaian pertama butuh internet). Gambar tidak pernah dikirim ke model AI; teks hasil OCR disamarkan dan kutipan angkanya divalidasi sama seperti teks PDF. Maksimal 8 halaman per dokumen. OCR bisa salah baca: kutipan yang tidak cocok ditolak dan ditandai untuk reviewer.

**Impor dari sistem lain.** Di PoS, menu *Impor data*: unggah CSV (template tersedia) atau buat kunci API untuk `POST /api/ingest`. Impor ulang aman (ref unik per perusahaan). Transaksi impor ditandai `source`; bila lebih dari separuh transaksi berasal dari impor, tingkat data menjadi `connector` (haircut minimal 20%, label di halaman penawaran). Ini sengaja lebih rendah daripada transaksi yang lahir di PoS + gateway kita.

**Ubah harga.** Harga dikunci di kontrak, jadi owner mengajukan perubahan dari halaman pengajuan; sistem membuat seri pengganti, memverifikasi ulang, dan memerlukan attestation baru. Hanya bila belum ada token terjual. Kenaikan harga menambah masa tunggu 24 jam dan ditolak bila harga referensi turun.

**Xendit split.** Adapter (`apps/pos/lib/psp.ts`) tersedia di belakang `XENDIT_SPLIT=on`, tetapi BELUM terverifikasi dan belum terpasang ke alur booking: menunggu xenPlatform aktif di akun Xendit. Pool investor tetap disimulasikan.


**Form pengajuan owner.** Berupa langkah-langkah (9 slide). Status tanah dan bangunan menentukan dokumen yang diwajibkan: sewa → perjanjian sewa; milik sendiri → bukti kepemilikan (sertifikat/AJB/PBB). Utang dan kontrak bagi hasil lain hanya meminta rincian bila dijawab Ya. Omzet tidak diketik per bulan: owner mengunggah CSV/XLSX, baik ringkasan bulanan (kolom `bulan,bruto,refund,pajak,fee`) maupun ekspor transaksi (kolom sama dengan impor PoS), lalu sistem menghitung omzet bersih dan, untuk ekspor transaksi, porsi gateway/tunai. Bulan berjalan tidak dihitung; minimal 6 bulan berurutan. Katalog data di `packages/shared/src/dataPolicy.ts` menjadi sumber halaman `/kebijakan-data` dan catatan di tiap langkah.
