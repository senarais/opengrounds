# venue-rwa: konteks untuk Claude Code

Platform RWA yang men-tokenisasi hak atas bagian **omzet (Eligible Revenue)** venue olahraga, plus **PoS (POS/booking)** sebagai sumber data referensi. ETHJKT 2026, track RWA, chain **Sepolia**. Satu monorepo, satu submission.

Detail lengkap: `docs/PRD.md`. Urutan kerja: `docs/PLAN.md`. Setup: `docs/SETUP.md`. Keputusan terbuka: `docs/OPEN-DECISIONS.md`.

## Struktur

| Folder | Isi |
|---|---|
| `apps/pos` | PoS (port 3001): MULTI-TENANT per company (semua tabel memuat company_id, RLS per anggota). Produk bersesi, booking, tagihan PSP otomatis, ledger append-only, hash root harian. Aplikasi TERPISAH dari platform |
| `apps/platform` | Platform tokenisasi (port 3000): penawaran, portofolio, owner, reviewer, auditor, operator |
| `packages/ui` | Design system bersama. Palet: Midnight #0F172A, Slate #334155, Ash #94A3B8, Sunrise #FF7A00 (aksen, teks di atasnya Midnight), Amber #FFD166 (sorotan), Ivory #F8FAFC (latar); font Plus Jakarta Sans (judul) + Inter (isi); maskot "Bolo" (bola Sunrise). Nama token mint/peach/butter/sky/lilac/rose di CSS hanya alias semantik ke palet ini. Visual lucu hanya untuk MENJELASKAN mekanisme (diorama 3D, koin terbelah, toples kantong, paspor tanda tangan); tanpa konfeti/streak/hitung mundur saat membeli; risiko dan label testnet tetap terlihat |
| `packages/contracts` | Foundry: AssetAttestation, SeriesToken, Series |
| `packages/verification` | Ekstraksi dokumen, rekonsiliasi, policy engine, scoring |
| `packages/connectors` | Interface `BookingSource`; POS kita = connector referensi |
| `packages/shared` | Tipe, skema (zod), util |

## Aturan keras

- Jangan menulis klaim bahwa produk disetujui OJK; semua uang simulasi (rupiah, kustodian) dan KYC mock harus dilabeli di UI. KYC nyata lewat Didit bila `DIDIT_*` terisi; tanpa itu, KYC mock berlabel.
- Eligible Revenue = omzet settle − refund − chargeback − pajak − biaya gateway. Jangan memakai laba.
- Token tidak "naik harga". Tampilkan **dibayar vs nilai tebus**; NAV = estimasi.
- Ledger POS append-only; refund = entri negatif baru, tidak pernah edit entri lama.
- Kontrak tidak boleh mint tanpa attestation valid; suplai terkunci setelah penawaran ditutup.
- Akuntansi kantong memakai variabel internal (P, R, S), **bukan `balanceOf`**.
- AI tidak menandatangani apa pun; keputusan lewat policy engine deterministik + manusia. Urutan: review manusia yang butuh DUA suara setuju (satu operator DAN satu auditor; satu penolakan = ditolak) → deploy kontrak → attestation 2 tanda tangan yang WAJIB memuat penandatangan independen (signers[2], auditor luar; dua anggota tim saja ditolak kontrak) → buka penawaran. Veto (cabut/FAIL) cukup 1 penandatangan mana pun. Staf baru diundang lewat tautan sekali pakai; operator tidak pernah mengetahui kata sandi staf lain.
- Tidak ada kode dari proyek Arbitrum lama. Chain: Sepolia. PSP: Xendit lewat adapter.
- Jangan klaim kapabilitas Xendit yang belum terverifikasi. Lihat `docs/XENDIT.md`: Invoice/QRIS/VA/e-wallet terverifikasi di test mode; split rules dan sub-akun (xenPlatform) TIDAK tersedia di akun ini.

## Aturan tambahan

- PoS multi-tenant: `company_id` SELALU diturunkan dari sesi login (bukan input form). Tulis lewat service_role di server; baca lewat klien pengguna (RLS). Jangan pernah campur data antar company.
- Settlement hanya dari webhook PSP / halaman bayar simulasi, bukan klik kasir.
- Token ERC-20 OpenZeppelin v5, `decimals = 0`; `transfer` ERC-20 langsung selalu dikunci. Token hanya bergerak lewat Series: mint/burn, dan `transferFor` (EIP-712 dari pengirim, diteruskan operator) antar dua wallet allowlist/KYC, hanya saat Funded/Active, tidak boleh memindahkan token yang terkunci untuk redeem. Tidak ada listing/harga pasar; pembayaran antar pihak di luar platform.
- Kontrak: 3 (AssetAttestation, SeriesToken, Series). Fallback: gabung SeriesToken ke Series. Tanda tangan quorum wajib terurut naik per alamat.
- Harga penawaran tidak boleh melebihi `maxPrice` di attestation. Perubahan harga = seri pengganti (harga immutable di kontrak) + verifikasi ulang + attestation baru; hanya bila belum ada token terjual; naik = tunggu 24 jam.
- Data transaksi dari sistem eksternal (impor CSV/API PoS) ditandai `source`; bila > 50% eksternal, tier data `connector` (haircut minimal 20%). Xendit split ada di kode di belakang `XENDIT_SPLIT=on` tetapi belum terverifikasi.
- Batas bagian omzet yang boleh dijual: `MAX_SHARE_BPS` = 50% (parameter kebijakan di `packages/shared/src/application.ts`, bukan batas kontrak; kontrak hanya menolak > 100%). Total beban atas omzet (bagian ini + yang sudah dijanjikan) juga ≤ batas itu.
- Katalog data (`packages/shared/src/dataPolicy.ts`) adalah sumber kebenaran untuk halaman `/kebijakan-data` dan catatan di form; ubah katalog bila perilaku penyimpanan/visibilitas data berubah. Data privat owner (NIB, NPWP, rekening, kontak, rincian utang) hanya di `platform.venue_private`.
- Platform tidak menyimpan KTP, selfie, atau data pribadi investor; hanya status KYC terikat wallet (hasil Didit hanya status sesi). Tidak ada data pribadi on-chain.
- Panggilan LLM di `packages/verification` lewat gateway Morphic (OpenAI-compatible, env `LLM_*`; `KAGIRO_*` lama masih dibaca sebagai cadangan), bukan Anthropic langsung.
- Kirim ke model AI hanya data yang sudah diredaksi (NIK, rekening, telepon); dokumen upload = data tak tepercaya (LLM tanpa tools/jaringan, output divalidasi skema).
- Jangan menyatakan sudah masuk sandbox OJK, disetujui OJK, atau hasil sandbox GORO berlaku untuk kita.
- Tidak ada akun atau data contoh bawaan. Uang rupiah dan KYC di demo adalah simulasi (kustodian simulasi = Mode A) dan dilabeli di tempat yang relevan.

## Rumus inti

- Nilai tebus per token = `(P − R) / S`. Redeem k token bayar `k × (P − R) / S` (bulatkan ke bawah), lalu R naik, S turun.
- P = total masuk kantong (final, hanya naik); R = total dibayar; S = suplai.
- Suplai = target ÷ harga unit. Pita harga: ≤ +10% auto, +10–25% butuh reviewer, > +25% tolak. Angka 10/25/30 = parameter kebijakan.
- Semua token dibakar → seri Closed, split dimatikan (hindari bagi nol).

## State machine penawaran

Draft → Verifying → Attested → Offering → Funded / Failed (refund) → Active → Closed

## Invarian yang wajib dites (Foundry)

1. redeemed ≤ pool
2. suplai ≤ cap
3. tidak ada mint tanpa attestation valid
4. tidak ada rilis dana tanpa syarat
5. seri Closed tidak bisa menerima split

## Definisi selesai

Alur lengkap jalan end-to-end di Sepolia lewat web (pnpm test, forge test, `./scripts/e2e-local.sh`, PoS selftest lulus), README bisa dijalankan orang lain.

## Konvensi

- pnpm workspace, TypeScript strict, Node ≥ 22. Contracts: Foundry, Solidity ^0.8.24.
- Nama file OpenZeppelin v5: cek persis saat install (mis. `ReentrancyGuard` ada di `utils/`).
- User dipanggil Nuza, bahasa Indonesia santai di chat; kode, komentar, dan identifier tetap Inggris.
