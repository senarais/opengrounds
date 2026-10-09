# Rencana kerja

Urutan dari PRD bagian 13. Centang saat selesai. Tiap paket punya "selesai kalau" yang bisa diverifikasi.

## 1. `packages/shared`
- [x] Tipe: `Venue`, `Court`, `Booking`, `Payment`, `LedgerEntry`, `Attestation`, `Series`, `KycStatus`
- [x] Skema zod untuk semua yang melintasi batas paket (webhook, dokumen hasil ekstraksi, output AI)
- [x] Util uang (integer rupiah, tanpa float), util hash/Merkle
- **Selesai kalau:** dipakai oleh pos, connectors, verification, platform tanpa duplikasi tipe.

## 2. `packages/contracts` (Foundry)
- [x] `AssetAttestation`: EIP-712, verifikasi 2-dari-3 (alamat terurut naik), verdict, skor, evidenceRoot, rulesetHash, maxPrice, batas persen lintas seri, expiry, revoke
- [x] `SeriesToken`: ERC-20 OZ v5, decimals 0, allowlist, transfer terkunci, mint/burn hanya oleh Series
- [x] `Series`: state machine, catatan escrow, rilis tahap 1/2, angka kantong (P, R, S), antrian redeem (request → lock → confirm → burn), anchor root harian, close
- [x] Tes unit + invarian: redeemed ≤ pool; suplai ≤ cap; no mint tanpa attestation valid; no rilis tanpa syarat; Closed tidak terima split
- [x] Tes replay EIP-712 (chainId, alamat, nonce, expiry), pembulatan, reentrancy
- **Skema target: Cara 1** (minimum raise, gagal = refund penuh).
- **Selesai kalau:** `forge test` hijau, invarian dijalankan ≥ 256 runs, deploy script ke Sepolia jalan.

## 3. `apps/pos` = PoS multi-tenant (aplikasi terpisah, port 3001)
- [ ] Master data venue/court/harga peak-offpeak/jam buka
- [ ] Booking: hold 10 menit → bayar → konfirmasi (held/paid/cancelled/completed/refunded)
- [ ] Adapter PSP (simulasi default, Xendit sandbox opsional); settlement dari webhook
- [ ] Ledger append-only dengan `prev_hash`/`hash`; refund = entri negatif
- [ ] Diskon/void butuh persetujuan kedua
- [ ] Merkle root harian + endpoint `getDailyRoot`
- [ ] Laporan: omzet harian, okupansi, refund, selisih vs settlement
- **Selesai kalau:** modifikasi entri lama terdeteksi (hash chain putus), root harian reproducible.

## 4. `packages/connectors`
- [ ] `BookingSource` (`listEntries`, `getDailyRoot`, `verifyEntry`) + implementasi POS
- **Selesai kalau:** verification hanya bicara ke interface, bukan ke POS langsung.

## 5. `packages/verification`
- [ ] Redaksi (NIK, rekening, telepon) sebelum teks ke model
- [ ] Ekstraksi + konsistensi dokumen (output divalidasi skema, tiap angka menunjuk sumber)
- [ ] Rekonsiliasi booking vs settlement vs bank; exception queue
- [ ] Policy engine deterministik: gerbang pass/fail (sewa ≥ tenor, covenant, sengketa, min N bulan gateway) + skor
- [ ] Harga referensi + pita harga (10/25/30)
- **Selesai kalau:** skenario fraud menghasilkan exception dan skor turun secara deterministik.

## 6. `apps/platform` (port 3000)
- [ ] Portal owner, investor, reviewer, auditor
- [ ] Penandatanganan EIP-712 lewat MetaMask (reviewer/auditor)
- [ ] Alur beli: KYC mock → connect wallet → bayar (simulasi) → escrow → mint
- [ ] Dashboard: dibayar vs nilai tebus (estimasi), akrual pending vs final
- [ ] Label "SIMULASI" / "SINTETIS" di semua uang, KYC, data
- **Selesai kalau:** alur demo 2–5 jalan dari UI.

## 7. Seed + fraud
- [x] Skenario fraud: booking fiktif / tunai di luar sistem (tombol di PoS)

## 8. Skrip demo + submission
- [ ] Skrip demo (urutan klik, data siap), video, slide
- [x] Deploy Sepolia, catat alamat di README
- [ ] Repo publik, README bisa dijalankan orang lain

## Pembagian tim (usulan)

| Peran | Tanggung jawab |
|---|---|
| Kontrak | Foundry: attestation, token, escrow, pool, invarian |
| POS | Booking, ledger append-only, hash root, connector |
| Platform + UI | Portal, alur penawaran |
| Verifikasi + demo | AI layers, rekonsiliasi, seed, skrip demo, slide |

Tiga kunci penandatangan dipegang **orang berbeda**.

## Kriteria juri → yang ditunjukkan

| Kriteria | Bobot | Ditunjukkan lewat |
|---|---|---|
| Real-World Utility | 25 | Pendanaan venue kecil tanpa utang |
| Onchain | 25 | Attestation, escrow, kantong, anchor |
| Innovation | 20 | Split-at-source + redeem + bukti gateway |
| Feasibility | 20 | Scope kecil, simulasi dilabeli |
| Demo & UX | 10 | Satu alur mulus |

## Checklist submission

- [ ] Repo publik
- [ ] README + cara jalan
- [x] Kontrak ter-deploy di Sepolia, alamat tercatat
- [ ] Video / demo script
- [ ] Slide
- [ ] PRD (`docs/PRD.md`)
- [ ] Deadline 12:00 WIB hari ke-2
