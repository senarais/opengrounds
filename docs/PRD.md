# PRD ringkas: Platform RWA Pendapatan Venue + Venue OS

Ringkasan dari brief tim (ETHJKT 2026, track RWA, Sepolia). Bagian Q&A panjang tidak disalin; inti jawabannya sudah masuk bagian terkait di bawah. Bukan nasihat hukum.

## 1. Produk

Owner venue menjual sebagian omzet booking selama tenor tertentu ke banyak investor kecil. Uang pelanggan terbelah di sumber, bagian investor tidak lewat tangan owner. Yang dijual = manfaat ekonomi (revenue share), bukan kepemilikan venue.

- Dasar bagi hasil = **Eligible Revenue**: omzet settle − refund − chargeback − pajak − biaya gateway. Bukan laba (laba bergantung biaya yang dikontrol owner).
- Persen ditentukan owner, dikunci di kontrak. Tenor tetap (12–36 bln), tidak melebihi hak sewa.
- AI menilai dan merekomendasi; manusia (quorum 2-dari-3) menandatangani attestation EIP-712.
- Token = klaim atas kantong investor. Redeem: token dibakar, terima rupiah. Bukan klaim berkala.
- Platform tidak memegang dana pihak ketiga. Produksi: kustodian berlisensi. Demo: ledger simulasi.

Tiga pool: **escrow penggalangan**, **kantong investor**, **sumber pendapatan**.

## 2. Alur besar

1. Owner daftar, upload dokumen, hubungkan sumber booking.
2. Verifikasi berlapis: ekstraksi dokumen, konsistensi, policy engine, scoring.
3. Reviewer 2-dari-3 tanda tangan attestation on-chain.
4. Penawaran dibuka; investor (KYC mock) beli token pada harga tetap.
5. Dana ke escrow; rilis ke owner bertahap.
6. Pelanggan bayar via PSP; split di sumber ke kantong investor.
7. Rekonsiliasi harian (booking vs settlement vs bank); hash root harian di-anchor on-chain.
8. Investor redeem kapan saja atau tunggu tenor habis.

## 3. Venue OS (apps/pos)

Dibuat sendiri agar data demo bisa dikontrol dan disabotase (skenario fraud). POS lain masuk lewat connector.

Wajib: master data (venue, court, harga peak/off-peak, jam buka); booking (hold 10 menit, bayar, konfirmasi; status held/paid/cancelled/completed/refunded); pembayaran QRIS/VA via Xendit atau adapter simulasi, settlement dari webhook; refund = entri negatif baru (append-only); diskon/void butuh persetujuan kedua; event log berantai hash; Merkle root harian (bukti tidak diubah, bukan bukti benar); laporan; seed sintetis 6–12 bulan berlabel + satu skenario fraud.

Tidak masuk: loyalty, inventori kantin, multi-cabang kompleks, mobile native.

| Tabel | Isi penting |
|---|---|
| venues, courts | id, nama, harga, jam buka |
| bookings | id, court, slot, status, customer_ref (hash), amount |
| payments | id, booking, psp_ref, status, settled_at, fee |
| ledger_entries | id, type (sale/refund/fee), amount (bisa negatif), booking, prev_hash, hash |
| approvals | id, entry, requested_by, approved_by, reason |
| daily_roots | date, merkle_root, anchored_tx, cosigner_sig |

```ts
interface BookingSource {
  listEntries(venueId: string, from: Date, to: Date): Promise<LedgerEntry[]>;
  getDailyRoot(venueId: string, date: string): Promise<{ root: string; count: number }>;
  verifyEntry(entryId: string): Promise<{ ok: boolean; proof: string[] }>;
}
```

## 4. Platform tokenisasi (apps/platform)

Portal: **Owner** (daftar, dokumen, set %/tenor, tarik bagian owner), **Investor** (KYC, beli, kantong, nilai tebus, redeem), **Reviewer** (bukti + skor, tanda tangan/veto), **Auditor** (co-sign hash harian, exception queue).

State machine: Draft → Verifying → Attested → Offering → Funded / Failed (refund) → Active → Closed.

**Attestation:** verdict, skor, evidenceRoot, rulesetHash, expiry; bisa dicabut. 3 penandatangan, salah satunya independen. Veto mudah, approve sulit (membatalkan "tidak lolos" butuh semua + hash alasan on-chain). Kontrak menolak penawaran tanpa attestation valid.

**Penggalangan:** harga tetap per seri; suplai = target ÷ harga unit, terkunci saat penawaran ditutup; mint hanya saat penawaran. Rilis bertahap: tahap 1 ≈ 50% saat target tercapai dan attestation valid; tahap 2 setelah periode pertama terekonsiliasi tanpa exception. Gagal = refund penuh. Tanggal efektif = penutupan penawaran. Pembelian pihak terkait owner diizinkan, dilabeli, tidak dihitung ke target minimum. "Tujuan dana" hanya kolom pengungkapan.

**Harga:** referensi = proyeksi bayaran per token selama tenor ÷ (1 + margin minimum investor), dari median 12 bln data gateway/POS dengan haircut. Contoh: omzet Rp100jt/bln, haircut → Rp90jt, jual 10% × 24 bln = Rp216jt ÷ 10.000 token = Rp21.600; margin 30% → ≈ Rp16.600. Pita: ≤ +10% otomatis; +10–25% butuh reviewer + bukti baru; > +25% tolak; di bawah referensi boleh dengan peringatan. Angka 10/25/30 = parameter kebijakan. Harga maksimal masuk attestation; kontrak menolak di atasnya. Perubahan harga = pengajuan baru + attestation baru, hanya untuk token belum terjual, ada jeda (mis. 24 jam), tidak boleh naik kalau omzet turun. Venue < 6 bln data: haircut lebih besar atau batas raise lebih kecil.

**Halaman penawaran (disclosure pack).** Investor berhak tahu cukup banyak untuk menilai (arah draf RPOJK AKD: informasi yang jelas, lengkap, akurat, jujur, mudah diakses, dan tidak menyesatkan; masih draf), sedangkan data sensitif owner tidak perlu terbuka ke semua orang. Tanpa data venue, investor membeli kucing dalam karung (gharar).

| Kelompok | Isi | Terbuka untuk |
|---|---|---|
| Profil venue | Nama, kota dan kawasan, jenis olahraga, jumlah lapangan, ukuran dan jenis lantai/rumput, jam operasional, foto, tarif | Publik |
| Kinerja | Omzet dan okupansi historis (berlabel **terverifikasi gateway** atau **dilaporkan owner**), refund rate, musiman | Publik |
| Syarat penawaran | Persen, tenor, harga token, pita harga, harga maksimal, jadwal rilis dana | Publik |
| Verifikasi | Skor dan alasan ringkas, penandatangan, hash attestation, hash halaman | Publik |
| Risiko dan kewajiban | Sisa hak sewa, utang dan covenant kredit (ringkasan), sengketa, transaksi pihak terkait, tujuan dana | Publik |
| Detail sensitif | Alamat persis, salinan dokumen | Investor yang sudah KYC (dan staf) |
| Tidak pernah dibuka | KTP/data pribadi owner, nomor rekening, data pelanggan | Tidak ada |

Ukuran dan jenis lapangan relevan karena menentukan kapasitas, tarif, dan potensi omzet, dan bisa dicek lewat foto atau kunjungan. **Kaitan on-chain:** isi halaman di-hash (bagian publik + hash alamat persis + hash dokumen) dan masuk ke `evidenceRoot` attestation, sehingga investor dapat memastikan isi yang dilihatnya tidak berubah setelah diverifikasi. Bila owner mengubah data penting, verifikasi dan attestation harus diperbarui. Implementasi: `packages/shared/src/disclosure.ts`.

**Alur pengajuan owner.** Daftar (akun Supabase Auth) → isi formulir (perusahaan, penawaran, data hukum dan keuangan, omzet 6 bulan, dokumen) → verifikasi otomatis dari data yang **dilaporkan** owner (haircut lebih besar 35% dan peringatan eksplisit, karena belum diverifikasi gateway) → operator men-deploy kontrak seri perusahaan → 3 penandatangan memeriksa dokumen berdampingan dengan hasil → attestation 2-dari-3 → **workspace PoS dibuat otomatis** (akun login yang sama) → operator membuka penawaran. Setelah PoS berjalan, omzet diverifikasi dari gateway setiap hari; rilis dana tahap 2 menunggu periode pertama terekonsiliasi bersih.

**Kantong & redeem:** setiap transaksi di-split di sumber. Nilai tebus per token = saldo final kantong ÷ suplai; mulai ≈ 0 dan naik seiring omzet. Redeem: serahkan token → dibakar → terima rupiah; tebus awal = kehilangan bagian masa depan (wajib diungkapkan). Produksi: request → token dikunci → kustodian bayar → konfirmasi → burn (gagal = buka kunci); kas kurang = antrian. Semua token dibakar = Closed, split mati. Tenor habis: sisa kantong dibagi ke token tersisa. Tampilkan "dibayar" vs "nilai tebus"; jangan klaim "harga token naik"; NAV = estimasi. Periode = interval pembukuan (default harian, pendek di demo); tenor = umur token per seri. Akrual real-time (pending) lalu final setelah settlement PSP + jendela refund.

**Rekonsiliasi:** booking vs settlement vs bank setelah biaya yang diketahui. Hanya selisih tak terjelaskan masuk exception queue. Refund = entri negatif, di-net di periode berikutnya.

## 5. Smart contract (packages/contracts)

| Kontrak | Tugas |
|---|---|
| AssetAttestation | Registry bersama: EIP-712 2-dari-3 (alamat terurut naik), verdict, harga maks, batas total persen lintas seri, expiry, revoke |
| SeriesToken | ERC-20 OZ v5, decimals 0, allowlist, transfer terkunci; mint/burn hanya oleh Series (fallback: gabung ke Series) |
| Series | State machine, escrow, rilis bertahap, angka kantong (P, R, S), antrian redeem, anchor root harian, close |

Akuntansi: **P** = total masuk kantong (final, hanya naik), **R** = total dibayar, **S** = suplai. Nilai tebus = (P − R) ÷ S. Redeem k token = k × (P − R) ÷ S, bulatkan ke bawah, lalu R naik, S turun. Koreksi refund terlambat masuk periode berikutnya.

Tidak dipakai: ERC-3643 (ditunda ke produksi), ERC-4626 (beli harga tetap, uang keluar ke owner), ERC-1155, NFT.

Library: OZ ERC20 (override `_update` untuk allowlist/lock), AccessControl, Pausable, ReentrancyGuard, EIP712 + ECDSA, MerkleProof. Tes: Foundry + invariant.

On-chain: attestation, status penawaran, mint setelah dana terkonfirmasi, rilis escrow, angka kantong, root harian, redeem, close. Off-chain: rupiah, KYC, dokumen, data POS lengkap, proses AI. Gas mint ditanggung platform; redeem bisa lewat permintaan bertanda tangan.

Invarian: redeemed ≤ pool; suplai ≤ cap; tidak ada mint tanpa attestation valid; tidak ada rilis tanpa syarat; Closed tidak terima split.

Keamanan: ReentrancyGuard; replay EIP-712 (chainId, alamat, nonce, expiry); pembulatan; hindari serangan donasi/inflasi dengan akuntansi internal; 3 kunci dipegang orang berbeda; admin/upgrade seminimal mungkin dan diungkapkan.

Mode demo: **A** (utama) kustodian = ledger simulasi, tanpa stablecoin; **B** (opsional) mock stablecoin.

## 6. Aliran uang

1. Pelanggan bayar via Xendit (QRIS/VA).
2. Split di sumber (xenPlatform): bagian venue ke sub-akun owner, bagian investor ke sub-akun platform → bank kustodian.
3. Split dihitung setelah biaya gateway.
4. Payout sub-akun via akun master dengan `for-user-id`.

**Belum terverifikasi (jangan dijanjikan):** split untuk QRIS/VA, test mode split, batas sub-akun, struktur biaya. Solusi: adapter PSP + fiat simulasi.

Beli investor: KYC vendor → connect wallet (MetaMask Sepolia) → bayar QRIS/VA → escrow kustodian → Series mint ke wallet. MetaMask hanya tampil jumlah token (tanpa harga; tidak terdaftar CoinGecko); nilai tebus di dashboard. Token via `wallet_watchAsset` (simbol ≤ 5 karakter, decimals 0). "Tanpa wallet": alamat dibuatkan, dilabeli simulasi (wallet dikuncikan platform = platform menyimpan aset, perlu cek izin).

Pendapatan platform: fee penerbitan saat sukses, fee servis lewat split, SaaS POS/rekonsiliasi, fee investor, fee sekunder nanti. Biaya pihak independen: platform talangi, dipotong dari raise saat sukses, bayaran tetap.

## 7. AI, KYC, data pribadi

Tiga lapisan: (1) ekstraksi + konsistensi dokumen, (2) rekonsiliasi + anomali, (3) policy engine + scoring deterministik (juga pertahanan prompt injection: AI tidak memutuskan).

KYC: wajib di produksi, vendor (KTP/selfie hanya di vendor), platform simpan status terikat wallet, on-chain hanya allowlist, redeem ke rekening atas nama sama. Demo: mock, berlabel. Kandidat vendor (klaim vendor, belum diuji): Didit, Verihubs, ASLI RI, ADVANCE.AI, VIDA.

Gerbang owner (pass/fail): sewa ≥ tenor; tidak bentrok covenant bank (atau ada surat persetujuan); tidak ada sengketa aktif atas aset; minimal N bulan pendapatan via gateway. Skor: margin, rasio cicilan/omzet, okupansi, musiman. Data owner: utang & jaminan, klausul kredit, sewa/hak lahan, pemilik manfaat, sengketa, pajak & izin, keuangan, kewajiban lain, aset.

UU PDP 27/2022: AI tidak memutuskan sendiri (Pasal 10); redaksi sebelum model; selfie/KTP tidak pernah ke AI; dokumen = data tak tepercaya (LLM tanpa tools/jaringan, output divalidasi skema); lapor kebocoran ≤ 3×24 jam; API LLM luar negeri butuh perlindungan setara (Pasal 56).

## 8. Anti-fraud

| Ancaman | Mitigasi |
|---|---|
| Pendapatan dipalsukan di POS | Settlement PSP = bukti utama; rekonsiliasi harian |
| Data diubah setelah lapor | Merkle root harian + co-sign independen |
| Tunai / di luar sistem | Covenant anti-circumvention, deteksi anomali okupansi vs omzet |
| Booking fiktif | Hash referensi pelanggan, pola, exception queue |
| Diskon palsu | Persetujuan kedua |
| Kasir curang | Pembayaran hanya via gateway |
| Jual ganda | Negative pledge; split-at-source |
| Aset bodong | Rilis bertahap, monitoring PSP, attestation bisa dicabut, reviewer manusia |
| Reviewer disuap | Quorum, independen, veto mudah/approve sulit, bayaran tetap |
| Owner beli token sendiri | Diizinkan, dilabeli, tidak dihitung ke minimum |
| Donasi/inflasi kantong | Akuntansi internal |

## 9. Regulasi & posisi hackathon

Testnet, tanpa uang riil, tanpa penawaran publik. Fiat/KYC/data disimulasikan dan dilabeli. **Jangan klaim disetujui OJK**, masuk sandbox, atau hasil sandbox GORO berlaku untuk kita. Klasifikasi efek/sekuritas butuh penasihat hukum. Referensi: UU P2SK, POJK 27/2024, POJK 17/2025, RPOJK aset tokenisasi (draf). Xendit berlisensi PG BI, hanya jalur bayar. Tanpa pasar sekunder; likuiditas lewat redeem. Prinsip syariah sebagai aturan desain, bukan klaim sertifikasi.

Beda dengan GORO: GORO jual pecahan properti (sewa + kenaikan nilai, agunan fisik, lulus sandbox OJK Nov 2025). Kita: bagi hasil omzet usaha tanpa agunan, bukti dari data gateway harian, belum ada status regulasi.

## 10. Scope demo 12 jam

1. POS: booking, bayar (simulasi/Xendit sandbox), refund, laporan.
2. Owner submit → skor AI → 2-dari-3 attestation di Sepolia.
3. Investor beli (KYC mock) → escrow → rilis tahap 1.
4. Booking baru → split → kantong naik real-time.
5. Redeem: token dibakar, rupiah simulasi keluar.
6. Fraud: booking tunai/fiktif terdeteksi → exception → attestation dicabut atau tahap 2 ditahan.

Dilewatkan: pasar sekunder, banyak seri, pajak, mode B, mobile.

## 11. Keputusan

**Final:** revenue = Eligible Revenue; model redeem; AI hanya menilai; escrow + rilis bertahap; split di sumber; mode A utama; Sepolia + Xendit; satu monorepo; KYC mock; AI 3 lapisan; 3 kontrak (fallback 2); ERC-20 decimals 0; harga tetap per seri; beli via rupiah → escrow → mint ke wallet; tanpa listing CoinGecko.

**Terbuka:** lihat `docs/OPEN-DECISIONS.md`.
