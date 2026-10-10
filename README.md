# Open Grounds (venue-rwa)

Token **hak manfaat ekonomi atas sebagian laba bersih** venue olahraga yang tanahnya milik sendiri, plus **PoS** (POS/booking) sebagai sumber data pendapatan.
ETHJKT 2026 · track RWA · Ethereum Sepolia (testnet). Spesifikasi lengkap: `Open_Grounds_PRD_v4.1_Hackathon.md` (lokal, tidak di git).

> **Disclaimer.** Proyek hackathon di **testnet**, tanpa uang riil. Rupiah, kustodian, KYC (bila Didit tidak dikonfigurasi), dan split venue **disimulasikan dan dilabeli** di UI. Open Grounds **belum memiliki izin atau persetujuan regulator** untuk menawarkan produk ini dan tidak mengklaim sandbox, sukuk, atau "trustless". Imbal hasil dan likuiditas tidak dijamin. Bukan nasihat hukum atau investasi.

## Ide dalam satu paragraf

Owner venue menjual **X% hak ekonomi atas laba bersih yang bisa dibagikan** ke SPV **Grounds**, dan dibayar di depan (simulasi). Grounds mencetak supply token **sekali** ke treasury lalu menjualnya berkelanjutan ke investor kecil lewat payment gateway. Tiap bulan, waterfall (omzet kotor − refund − biaya − pajak − fee operator − cadangan − fee platform) menghasilkan **jatah per token** yang masuk saldo investor. Chain adalah wasit: kontrak memeriksa nominal, tanda tangan, plafon biaya, dan kewajiban; platform tidak bisa bertindak sendirian.

- **Siapa menyetujui apa** (2-dari-3, EIP-712): verifikasi aset → token boleh terbit = platform + owner · angka laba bulanan = platform + owner (verifier menggantikan owner yang diam; beda angka → sengketa) · revaluasi = platform + verifier. Beli dan jual balik: **investor menandatangani pesanannya sendiri** lewat wallet Privy.
- **Rumus** ada di `/cara-kerja` dan `packages/shared/src/economics.ts`; kontrak menghitung ulang angka yang sama.
- **AI hanya advisory:** ekstraksi dokumen, silang-cek, rekonsiliasi, indikator risiko. Setiap temuan wajib ditinjau manusia.

## Arsitektur

```
Pelanggan venue ─bayar─▶ Gateway ─┬─ s% ─▶ kantong SPV        (MockPaymentProvider, sandbox)
                                  └─ sisa ─▶ owner
Investor ─tanda tangan pesanan (Privy)─▶ bayar Xendit/sandbox ─▶ escrow ─▶ allocate() on-chain ─▶ token + lot
Akhir bulan: PoS ledger ─▶ waterfall ─▶ attestation REVENUE_PERIOD ─▶ postRevenuePeriod() ─▶ true-up ─▶ saldo investor ─▶ settlePayout()

apps/pos (:3001)  ─▶ packages/connectors ─▶ apps/platform (:3000) ─▶ packages/contracts (Sepolia)
                                                                      AttestationRegistry · SeriesToken · VenueSeries
```

| Folder | Peran |
|---|---|
| `apps/pos` | **PoS** (:3001): multi-tenant per company, produk & sesi, booking, tagihan gateway, ledger append-only, hash harian, laporan |
| `apps/platform` | **Platform** (:3000): produk, portofolio, portal owner, review KYB, konsol operator, halaman verifier |
| `packages/contracts` | Foundry: `AttestationRegistry`, `SeriesToken`, `VenueSeries` + tes unit, invarian, skenario "platform curang ditolak" |
| `packages/shared` | Rumus ekonomi, skema formulir owner, disclosure, katalog kebijakan data |
| `packages/verification` | Ekstraksi dokumen (redaksi + validasi kutipan), silang-cek, gerbang KYB, rekonsiliasi |
| `packages/connectors` · `packages/ui` | Interface `BookingSource` + laporan · design system |
| `db/` | `00_reset` → `01_pos` → `02_platform` → `03_access` |

## Cara jalan

Prasyarat: Node ≥ 22, pnpm ≥ 10, Foundry, akun Supabase, wallet testnet dengan Sepolia ETH, MetaMask (untuk wallet verifier), akun Privy.

```bash
cp .env.example .env     # satu .env di root untuk semua app, skrip, dan Foundry
pnpm install
cd packages/contracts && forge install OpenZeppelin/openzeppelin-contracts --no-git && forge install foundry-rs/forge-std --no-git && forge build && cd ../..
node scripts/gen-abi.mjs   # ABI + bytecode ke apps/platform/lib/abi.ts (setelah forge build)
```

1. **Database.** Di Supabase SQL editor jalankan berurutan `db/00_reset.sql` (HAPUS semua data), `01_pos.sql`, `02_platform.sql`, `03_access.sql`. Lalu `pnpm --filter @venue-rwa/platform reset:storage` untuk mengosongkan bucket dokumen.
2. **Wallet.** Deployer (keystore: `cast wallet import deployer --interactive`), wallet **verifier** independen (`ATTESTOR_VERIFIER_ADDRESS`), dan operator (dibuat `./scripts/setup-operator.sh`). Slot owner memakai wallet Privy masing-masing owner.
3. **Kontrak.** `./scripts/deploy.sh` men-deploy `AttestationRegistry` sekali (alamat di `packages/contracts/deployments/latest.json`). `VenueSeries` + token dideploy otomatis per venue saat reviewer menyetujui KYB.
4. **Staf.** `pnpm --filter @venue-rwa/platform staff:create` (operator pertama), lalu undang **reviewer** (pihak luar independen, slot VERIFIER) dan akun **SPV** (Grounds, pembeli hak) lewat `/staff`.
5. **Jalankan:** `pnpm dev:pos` (:3001) dan `pnpm dev:platform` (:3000).

Opsional di `.env` (kosong = jalur simulasi berlabel): `PSP_MODE=xendit` + `XENDIT_SECRET_KEY` (pembelian investor lewat Xendit mode uji), `NEXT_PUBLIC_PRIVY_APP_ID` (wajib untuk wallet investor/owner; custom auth JWT Supabase, JWKS `…/auth/v1/.well-known/jwks.json`), `LLM_*` (gateway Morphic untuk ekstraksi dokumen), `DIDIT_*` (KYC sungguhan), `INTERNAL_API_TOKEN` (PoS → platform dan HMAC webhook sandbox).

**Alur demo:** SPV mengajukan atas nama owner → pemeriksaan otomatis + temuan AI → operator dan reviewer menandatangani persetujuan (kontrak seri dideploy) → platform menandatangani → owner (penjual) menandatangani akuisisi (simulasi) → token dicetak ke treasury → investor KYC + rekening + tanda tangan pesanan + bayar → token masuk (lot terkunci 10 menit, demo mode) → booking di PoS (split s%) → operator menutup periode → owner menandatangani angka → kontrak menghitung jatah → true-up → saldo investor → tarik / reinvest / jual balik → halaman operator "platform curang ditolak" dan status Overdue.

**Tes:** `pnpm test:contracts`, `pnpm --filter @venue-rwa/shared test`, `pnpm --filter @venue-rwa/verification test`, `pnpm --filter @venue-rwa/pos selftest`.

## What's new in this hackathon (aturan #1–#2)

Dibuat selama periode hackathon: seluruh `packages/contracts`, `apps/platform`, `packages/shared`, `packages/verification`, `db/`, dan README ini (riwayat commit di repo). **Kode atau infrastruktur yang sudah ada sebelumnya** dan dipakai ulang: PoS (`apps/pos`) dan `packages/connectors`/`packages/ui` dari iterasi awal proyek ini (dibuat di dalam repo ini sebelum pivot ke PRD v4.1; tidak ada kode dari proyek Arbitrum lama). Pustaka dan layanan pihak ketiga: OpenZeppelin Contracts v5, forge-std, viem, Next.js, React, Supabase, Privy, Xendit (mode uji), Didit, Morphic (gateway LLM), unpdf, tesseract.js, three.js / react-three-fiber, zod.

Landing Platform berbahasa Inggris memakai Lucide icons, galeri melengkung dari brief pengguna, serta referensi desain Rana Grounds dan Alsager Padel. Analisis desain, aksesibilitas, dan atribusi foto: [`apps/platform/LANDING_DESIGN.md`](apps/platform/LANDING_DESIGN.md).

## Batas yang jujur

Open Grounds tidak memiliki izin regulator; rupiah dan escrow disimulasikan; 2-dari-3 hanya mendemokan mekanisme bila kunci dipegang tim yang sama; nilai aset diinput reviewer (production: penilai independen); cek AHU/OSS belum terintegrasi; xenPlatform belum aktif sehingga split memakai sandbox; catatan on-chain bukan bukti kepemilikan hukum.


### Data demo venue dan PoS

`pnpm --filter @venue-rwa/platform seed:demo -- --variant=futsal` (atau `padel`, `tenis`) menambahkan pengajuan sintetis ke owner `kopiKenangan@gmail.com`, dokumen PDF/CSV, foto referensi eksternal berlabel, workspace PoS sintetis, serta 12 pembayaran sandbox. Pemeriksaan otomatis dijalankan; persetujuan operator/reviewer/owner tetap memakai wallet masing-masing. Harga awal token Rp5.000/Rp10.000/Rp25.000; pengajuan biasa juga dapat menentukan harga awal. Harga tersimpan bersama pengaturan venue dan ikut hash review.

Foto referensi dan lisensi tercatat di `apps/platform/lib/demo-photos.ts` dan ditampilkan di galeri; bukan bukti venue fiktif. Seed tidak menghubungi bank/payment gateway sungguhan. Baris pembayaran memakai `simulated=true`; ledger dibuat oleh jalur settlement PoS. Jalankan seed sekali per varian; pengajuan yang sudah ada tidak digandakan.

Untuk demo Kenangan yang sudah Active, `pnpm --filter @venue-rwa/platform exec tsx --env-file=../../.env scripts/seed-active-profit.ts` mengisi pembayaran sandbox dan biaya, tanpa menghapus ledger. Tambahkan `--close` setelah settlement terakhir berusia minimal 60 detik untuk menyiapkan laporan: owner menandatangani → lunasi true-up sandbox bila diminta → saldo investor dikreditkan → investor memilih reinvest atau tarik. Tidak ada kredit laba sebelum pengesahan, dan seed tidak menandatangani sebagai investor/owner.
