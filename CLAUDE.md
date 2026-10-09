# venue-rwa: konteks untuk Claude Code

Produk: **Open Grounds** (platform) + **Grounds** (SPV penerbit token). Logo `OG.png` (`apps/*/public/og-logo.png`, `apps/*/app/icon.png`). Nama paket/folder tetap `venue-rwa`. ETHJKT 2026, track RWA, **Ethereum Sepolia**, testnet saja.

**Sumber kebenaran: `Open_Grounds_PRD_v4.1_Hackathon.md`** (lokal, tidak di git: di root repo, atau salinannya di `~/Downloads/`). Aturan di bawah adalah ringkasan wajibnya. Bila kode dan PRD berbeda, PRD yang benar; bila PRD menandai **[Terbuka]**, tanya, jangan menebak.

**Status migrasi:** kontrak (53 tes), `packages/shared` (rumus, formulir owner), `packages/verification` (gerbang KYB, silang-cek), skema `db/00–03`, backend dan halaman platform, serta README sudah di model v4.1 (build Next lulus). Belum teruji end-to-end di Sepolia: butuh Supabase + Privy + deploy registry. Masih tertinggal: script e2e baru, data contoh, model 3D per jenis lapangan di halaman produk, tes TS untuk flow platform.

## Model (PRD v4.1 §2–4)

- Owner menjual **X% hak manfaat ekonomi atas laba bersih yang bisa dibagikan** ke SPV Grounds; Grounds memecahnya jadi token dan menjual lewat Open Grounds. Bukan omzet, bukan tanah, bukan saham PT owner.
- Venue hanya diterima bila **tanah milik sendiri** (sertifikat atas nama owner/badan usahanya, tidak sedang dijaminkan), histori ≥12 bulan, ≥90% pendapatan digital, lulus KYB (badan usaha, penandatangan, pemilik manfaat ≥25%).
- SPV membayar owner **di depan** (`ACQUISITION_CLOSED`, simulasi berlabel), supply dicetak **sekali** ke treasury, lalu dijual **berkelanjutan**. Tidak ada periode penawaran, min raise, refund karena gagal terkumpul, atau tenor. Token tanpa masa berlaku; berakhir hanya lewat likuidasi/pembubaran atau penegakan gagal bayar.
- **Tidak ada burn.** Token jual balik kembali ke treasury dan dijual lagi.
- Aset venue = patokan harga, **bukan jaminan**. UI wajib: "Token ini tidak dijamin oleh aset venue."

## Rumus (§4)

- `V = min(V_aset, D12 ÷ r)`; `r` 9% [Asumsi]. `D12` hanya dari pendapatan yang lolos rekonsiliasi booking ↔ pembayaran ↔ bank.
- Uji kewajaran `y = D12 ÷ V`, band 5–20% [Asumsi]; di luar band = ditandai untuk reviewer, bukan ditolak otomatis.
- `S = V × X`, `p` Rp10.000 [Asumsi], `N = S ÷ p`, `p_ref = V × X ÷ N` (berubah hanya lewat revaluasi `VALUATION_UPDATE`, untuk transaksi baru).
- Waterfall: `D = max(0, gross − refund − opex − pajak − fee_operator − cadangan_venue − fee_platform)`; `P_SPV = D × X`; `F_spv = P_SPV × m` (m 2% [Asumsi]); `P_inv = P_SPV − F_spv`; `P_owner = D × (1 − X) + fee_operator`. Kerugian tidak dibawa ke bulan berikutnya.
- Jatah: akumulator `accPerToken` (rupiah × 1e18) dari `P_inv ÷ N`, dibulatkan ke bawah, dust ke periode berikutnya. Bagian token treasury kembali ke Grounds. Kewajiban periode = `(N − saldo_treasury) × jatah_per_token`.
- Pengumpulan harian: split di sumber `s%` (12% [Asumsi]) ke kantong SPV, sisanya ke owner; akhir bulan **true-up** ke `P_SPV`. Kekurangan yang tidak dilengkapi owner sampai tenggat → `Overdue`.

## On-chain (§6): chain = wasit, bukan database

- Kontrak (OZ v5, Foundry, **tanpa proxy**): `AttestationRegistry` (EIP-712 2-of-3, domain `OpenGroundsAttestation`, anti-replay per `(kind, seriesId, refId)`), `SeriesToken` (ERC-20 `decimals=0`, fungsi gaya ERC-3643 lite: `isVerified`, `canTransfer` dengan kode alasan, `freeze`, `forcedTransfer`; jangan diklaim patuh ERC-3643), `VenueSeries` (state machine, alokasi, jual balik, posting periode, waterfall, akumulator, kewajiban, Overdue/Default, likuidasi).
- **Siapa menyetujui apa (menggantikan PRD §6.5):** 2-of-3 lewat `AttestationRegistry` hanya untuk keputusan yang tidak boleh diambil platform sendirian: `ACQUISITION_CLOSED` (verifikasi aset → token boleh terbit; PLATFORM + OWNER; persetujuan pembelian SPV tercakup saat mengajukan venue, tanpa klik persetujuan ulang), `REVENUE_PERIOD` (angka waterfall bulanan; PLATFORM + OWNER, atau PLATFORM + VERIFIER bila owner diam melewati tenggat; beda angka → `Disputed`, VERIFIER menengahi), `VALUATION_UPDATE` (PLATFORM + VERIFIER). **Beli dan jual balik:** investor menandatangani pesanan EIP-712 (`Order` / `SellBack`, domain `OpenGroundsSeries`) lewat Privy, platform (`CONTROLLER`) mengeksekusi setelah rupiah masuk. **Jatah sudah dibayar:** platform saja (`settlePayout`), tidak bisa melebihi kewajiban. Owner dan investor sama-sama memakai wallet Privy.
- Kontrak memeriksa: `paidIdr == tokens × refPrice`; tanda tangan pesanan milik investor penerimanya; pesanan tidak kedaluwarsa dan tidak dipakai ulang; total alokasi ≤ saldo treasury; penerima di allowlist dan tidak dibekukan; potongan ≤ gross; `opex ≤ maxOpexBps × gross`; periode tidak diposting dua kali; pembayaran jatah tidak melebihi kewajiban; `markOverdue`/`markDefaulted` boleh dipanggil siapa pun setelah tenggat.
- Transfer: treasury → investor (allowlist + `PAYMENT_SETTLED`), investor → treasury (lot terbuka, `Active`, `SELLBACK_SETTLED`), **investor → investor dilarang**, `forcedTransfer` hanya `CONTROLLER` dengan kode alasan.
- Lot per alokasi `{amount, unlockAt}`, kunci 6 bulan [Asumsi] sebagai parameter seri (demo boleh dipendekkan, berlabel "demo mode"), FIFO, maks 32 lot per alamat.
- Peran: `ADMIN` (multisig), `CONTROLLER` dan `ATTESTOR_PLATFORM` (relayer backend), `ATTESTOR_VERIFIER`, `ATTESTOR_COUNTERPARTY`, `TREASURY`. Demo jujur: bila dua kunci dipegang tim, 2-of-3 hanya mendemokan mekanisme.
- State seri: `Draft → Verified → Active ⇄ Disputed`, `Active → Overdue → (Active | Defaulted)`, `Defaulted → (Active | Liquidating)`, `Active → Liquidating → Closed`.
- Parameter demo [Asumsi]: r 9%, p Rp10.000, m 2%, s 12%, d 0%, band y 5–20%, maxOpex 80%, kunci lot 10 menit ("demo mode"), tenggat Overdue 7 hari, toleransi Defaulted 14 hari, jendela tanda tangan owner 3 hari.
- Rupiah, saldo ledger, dan penarikan **di luar chain**. Data pribadi tidak pernah ke chain (hanya status allowlist dan hash bukti).
- Invarian Foundry wajib (PRD §6.7, disesuaikan): supply tetap setelah `activate`, Σsaldo = totalSupply, tidak ada transfer investor→investor, lot terkunci tidak keluar, pesanan tidak dipakai ulang, nominal salah revert, token tidak terbit tanpa tanda tangan investor, potongan > gross revert, akumulator × supply + dust = Σ pool. Skenario demo "platform curang ditolak" §6.8 (versi kita: tanpa tanda tangan investor, nominal salah, transfer antar investor, opex di atas plafon, posting ulang periode, laba bulanan tanpa owner).

## Persetujuan review KYB

- Wallet tanda tangan review `operator` boleh akun MetaMask pilihan operator yang sedang login; alamatnya ikut ditandatangani dan dicatat di audit. Tidak wajib sama dengan hot wallet PLATFORM. Wallet `reviewer` tetap harus verifier terdaftar. Aturan wallet on-chain tidak berubah.
- Pengajuan wajib mendapat dua persetujuan SETUJU yang ditandatangani lewat MetaMask: satu `operator` dan satu `reviewer` independen. Satu suara tidak mengubah status menjadi APPROVED dan tidak mendeploy kontrak.
- Domain tanda tangan review adalah `OpenGroundsReview` (off-chain), berbeda dari attestation akuisisi. Tanda tangan mengikat kasus, identitas staf, nilai aset, catatan, hash data/bukti, chain, registry, dan batas waktu pengiriman.
- Dua suara harus dari identitas serta wallet yang berbeda, untuk snapshot bukti dan nilai aset yang sama. Suara yang sudah diverifikasi tetap tersimpan; perubahan bukti membuat suara lama tidak berlaku untuk pengajuan terkini.
- Setelah kuorum review lengkap, kontrak seri otomatis disiapkan. Token belum terbit: persetujuan pengalihan hak oleh owner tetap diperlukan dalam ACQUISITION_CLOSED.

## Peran

`owner` (penjual hak), `investor`, `operator` (tim internal Open Grounds), `reviewer` (pihak luar independen: review KYB + slot VERIFIER), `spv` (Grounds, pembeli hak: menyetujui akuisisi, treasury, modal, cadangan buyback; akun dibuat operator lewat undangan). Slot PLATFORM di kontrak mewakili Grounds via Open Grounds; kontrak tetap 3 slot. Demo jujur: operator dan SPV dipegang tim yang sama.

## Uang investor (§3.5–3.7, §8.4)

- Rupiah saja, lewat PJP (QRIS). **Tanpa stablecoin**, termasuk IDRX/MockIDRX.
- Sebelum beli pertama: KYC lolos + rekening bank atas nama sendiri (nama = nama KYC; demo mock berlabel). Dana beli ke escrow atas nama SPV, bukan rekening operasional platform. Token dialokasikan **hanya setelah** rupiah masuk (Xendit mode uji) dan pesanan investor yang ditandatangani dieksekusi. Pesanan yang tidak dibayar kedaluwarsa.
- Distribusi bulanan → dana di rekening distribusi → kredit **saldo ledger investor** (append-only, koreksi lewat entri pembalik) → `PAYOUT_SETTLED`. Investor memilih **tarik** (`Requested → Screened → Sent → Settled | Failed`; gagal sisi investor bukan Overdue) atau **reinvest** (pembelian dari saldo, butuh `PAYMENT_SETTLED`, lot baru). Ganti rekening: verifikasi ulang + cooling-off 48 jam [Asumsi].
- Jual balik ke treasury: hanya lot terbuka, seri `Active`, harga `p_ref × (1 − d)` (d 0–5% [Asumsi]), dari cadangan buyback, jendela berkala FIFO, **tidak dijamin**. Owner tidak membeli balik.
- xenPlatform belum aktif di akun ini: split dan escrow memakai `MockPaymentProvider` dengan webhook bertanda tangan identik, berlabel **sandbox**. Jangan klaim kapabilitas Xendit yang belum dicek.

## Kepatuhan dan klaim (§7)

- Tampil di UI: testnet/simulasi; imbal hasil tidak dijamin; likuiditas tidak dijamin; harga referensi dari rumus (tautan); Open Grounds belum berizin.
- **Tidak boleh mengklaim:** izin/sandbox OJK, token = sukuk/saham/efek, "trustless", janji buyback/imbal hasil/likuiditas, apa pun soal internal GORO, catatan on-chain = bukti kepemilikan hukum, statistik lahan milik sendiri, integrasi AHU/OSS.
- Semua angka **[Asumsi]** dilabeli di UI dan pitch.

## KYB dan AI (§8.3)

- Gerbang data wajib owner: NIB, NPWP, akta, KBLI, direksi/komisaris, penandatangan, pemilik manfaat ≥25%, data venue, **lahan milik sendiri** (jenis hak, nomor sertifikat, atas nama, status jaminan), keuangan 6–12 bulan, X% yang ditawarkan, integrasi.
- Empat agen advisory: ekstraksi dokumen, silang-cek antar dokumen, anomali rekonsiliasi, indikator risiko. Output JSON dengan `source_refs`; fakta tanpa bukti = `UNVERIFIED`; `requires_human_review = true` selalu. AI tidak boleh menyetujui, mencetak token, mengubah rekening, memindahkan uang.
- LLM lewat gateway Morphic (OpenAI-compatible, env `LLM_*`), bukan Anthropic langsung. Kirim hanya teks yang sudah diredaksi; dokumen upload = data tak tepercaya (tanpa tools, output divalidasi skema).

## Aturan teknis yang tetap

- PoS multi-tenant: `company_id` selalu dari sesi login, tulis lewat service_role di server, baca lewat RLS. Ledger PoS append-only, refund = entri negatif. Settlement hanya dari webhook PSP. Semua pembayaran booking wajib lewat payment gateway.
- Katalog data `packages/shared/src/dataPolicy.ts` = sumber halaman `/kebijakan-data`; ubah bila perilaku data berubah. Data privat owner hanya di tabel privat. Data investor yang boleh disimpan: status KYC, alamat dompet, rekening bank tersamarkan + hasil cocok nama; tanpa KTP/selfie.
- Wallet investor dan owner: Privy (custom auth JWT Supabase). Verifier memakai MetaMask (wallet terdaftar di registry); backend memegang CONTROLLER + slot PLATFORM.
- Satu `.env` di root untuk semua app, skrip, dan Foundry.
- Design system `packages/ui`: Midnight #0F172A, Slate #334155, Ash #94A3B8, Sunrise #FF7A00 (aksen, teks di atasnya Midnight; garis grafik pakai #c25a00), Amber #FFD166, Ivory #F8FAFC; mode terang saja; Plus Jakarta Sans + Inter. Visual lucu hanya untuk menjelaskan mekanisme; tanpa konfeti/hitung mundur di alur beli.
- pnpm workspace, TypeScript strict, Node ≥ 22, Next.js 16. Foundry, Solidity ^0.8.24, cek nama file OZ v5 saat install.
- Hackathon §9.1: README memuat "What's new in this hackathon"; kode/infrastruktur lama ditandai jelas; cantumkan atribusi pustaka/API pihak ketiga.

## Definisi selesai

Alur P0 PRD §9.3 jalan end-to-end di Sepolia lewat web; `forge test` (termasuk invarian dan skenario §6.8), tes TypeScript, dan e2e lulus; README bisa dijalankan orang lain.

## Gaya kerja

Harga awal token boleh berbeda per pengajuan: offering.tokenPrice, default Rp10.000. Disimpan pada venues.integrations.initialTokenPriceIdr, ikut snapshot review, valuasi, supply, dan attestation. Tidak mengubah harga seri yang sudah aktif.
