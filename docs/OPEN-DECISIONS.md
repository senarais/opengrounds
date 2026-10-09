# Keputusan terbuka

Putuskan sebelum bagian terkait dikerjakan. Kolom "default" dipakai kalau tidak ada keputusan.

## Diputuskan

- **Skema target: Cara 1** (minimum raise; gagal = refund penuh), diputuskan 2026-10-08. Cara 2 (persen berskala, tanpa minimum) masuk roadmap.

## Masih terbuka

| Keputusan | Rekomendasi PRD | Default saat coding | Blokir paket |
|---|---|---|---|
| Redeem sebagian | Ya | Ya | contracts |
| Masa tahan minimum | Belum ditentukan | Tidak ada | contracts |
| Panjang tenor | 12–36 bln, ≤ hak sewa | 12 bln di demo | contracts, verification |
| Pemicu rilis tahap 2 | Periode pertama terekonsiliasi tanpa exception | Itu | contracts, verification |
| Cadangan (reserve) | Opsional, dari bagian owner | Tidak ada | contracts |
| Identitas 3 penandatangan | Anggota tim berbeda | 2 tim + 1 "auditor" | platform |
| Arbiter sengketa + SLA | Perlu ditentukan | Di luar scope demo | verification |
| Ambang minimum penarikan | Perlu ditentukan | Tidak ada | platform |
| Kapabilitas Xendit | Cek sandbox dulu | PSP simulasi | pos |
| Pajak, batas investor | Belum diverifikasi | Di luar scope | – |

Keputusan yang sudah final ada di `docs/PRD.md` bagian "Keputusan".
