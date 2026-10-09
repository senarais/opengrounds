# Xendit: yang terverifikasi vs belum

Diuji 2026-10-08 dengan key **test mode** (`xnd_development_…`) lewat `pnpm --filter @venue-rwa/platform xendit:probe`.

| Kapabilitas | Status | Bukti |
|---|---|---|
| Invoice API (`POST /v2/invoices`) | ✓ Terverifikasi (test mode) | Tagihan terbit dengan halaman bayar staging |
| QRIS | ✓ Terverifikasi (test mode) | Tersedia di checkout; tombol "simulate your payment with QRIS" mengubah invoice jadi PAID |
| Virtual account | ✓ Tersedia (test mode) | BRI, Mandiri, BNI, Permata, CIMB, Muamalat, dll. di checkout |
| E-wallet | ✓ Tersedia (test mode) | OVO, ShopeePay, DANA, LinkAja, dll. |
| Status via `GET /v2/invoices/{id}` | ✓ | Dipakai PoS untuk sinkronisasi (tanpa perlu webhook publik) |
| Webhook invoice (`x-callback-token`) | Kode siap, belum diuji end-to-end | Butuh URL publik yang didaftarkan di dashboard Xendit |
| Fee nyata per transaksi | ✗ Tidak muncul di invoice staging | PoS memakai estimasi 0,7% bila fee tidak tersedia |
| **Split rules** (`POST /split_rules`) | **✗ Ditolak** (`INVALID_CREDENTIALS`) | Akun/key ini belum punya akses xenPlatform |
| **Sub-akun** (`/v2/accounts`) | **✗ Ditolak** (`INVALID_CREDENTIALS`) | idem |
| Split untuk QRIS/VA | Tidak terkonfirmasi di dokumentasi | Dokumen hanya menyebut header `with-split-rule` untuk "charge"; produk yang didukung tidak dirinci |
| Test mode untuk split | Tidak terkonfirmasi | Dokumentasi tidak membahasnya |

## Konsekuensi untuk desain

- **Pembayaran pelanggan** memakai Xendit sungguhan (test mode) lewat adapter `PSP_MODE=xendit`.
- **Pool investor** tetap berupa **kantong kustodian simulasi** (Mode A): bagian investor dihitung per transaksi dari ledger yang cocok dengan settlement PSP, lalu dicatat di `custody_ledger`. Uang test tetap berada di saldo akun master Xendit.
- Pool fisik di Xendit (sub-akun investor + split otomatis di sumber) **belum bisa dipakai** sampai Xendit mengaktifkan xenPlatform untuk akun ini. Jangan dijanjikan ke juri.
- Jalankan ulang `xendit:probe` setelah aktivasi; bila "Split rules" dan "Sub-akun" bertanda ✓, adapter split bisa ditambahkan tanpa mengubah model akuntansi (P, R, S).

Sumber dokumentasi: [Route & split payments](https://docs.xendit.co/xenplatform/split-payments/), [Create split rule](https://docs.xendit.co/apidocs/create-split-rule), [Create a payment request](https://docs.xendit.co/apidocs/create-payment-request), [xenPlatform overview](https://docs.xendit.co/docs/xenplatform-overview).


**Status kode:** adapter split (`createSplitRule`, header `with-split-rule`) sudah ada di `apps/pos/lib/psp.ts` di belakang `XENDIT_SPLIT=on` dan diuji hanya dengan fetch palsu (`pnpm --filter @venue-rwa/pos exec tsx scripts/split-test.ts`). Belum dipasang ke alur booking dan belum pernah dipanggil ke Xendit.
