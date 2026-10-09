# Berkas contoh untuk menguji form pengajuan

**Semua berkas di folder ini data buatan untuk pengujian.** Setiap PDF diberi tulisan "DOKUMEN CONTOH UNTUK PENGUJIAN SISTEM. BUKAN DOKUMEN HUKUM ASLI" di footer. Jangan dipakai di luar uji coba, dan tidak dibaca oleh aplikasi kecuali kamu mengunggahnya sendiri lewat form.

Tanggal di dalam dokumen dihitung dari hari pembuatan (8 Oktober 2026). Kalau kamu menguji jauh setelah itu, sisa sewa dan masa polis bisa tidak cocok lagi dan perlu dibuat ulang.

## Isi form supaya cocok dengan dokumen

| Bagian form | Isi |
|---|---|
| Nama perusahaan | **Arena Contoh Sejahtera** |
| Status tanah / bangunan | **Sewa / Sewa** (jalur biasa) |
| Pemilik lahan | PT Lapangan Sejahtera |
| Biaya sewa per bulan | 15000000 |
| Sisa masa sewa | **36** bulan |
| Opsi perpanjang | Ya |
| Pemilik setuju omzet dijual | Ya |
| Punya utang | **Ya** |
| Cicilan per bulan | 10000000 |
| Sisa pokok utang | 240000000 |
| Sisa tenor utang | 24 |
| Jaminan | tanah/bangunan |
| Kredit melarang menjual pendapatan | **Ya** (pasal 7) |
| Ada surat persetujuan bank | **Ya** (unggah berkas 4) |
| Aset diasuransikan | Ya: PT Asuransi Contoh, pertanggungan 2000000000, berlaku sampai **2028-06**, centang kebakaran, gempa, tanggung gugat, **gangguan usaha** |
| NIB | 1234567890123 |
| NPWP | 012345678901234 |
| Nomor rekening | 1234567890 (nama pemilik: Arena Contoh Sejahtera) |

## Unggah apa di langkah mana

**Langkah Penjualan** (pilih salah satu, bukan dua-duanya):
- `penjualan-bulanan-12-bulan.csv` atau `.xlsx`: 12 bulan ringkasan. Setelah diunggah kamu perlu mengisi porsi pembayaran sendiri (mis. 80 / 10 / 10).
- `ekspor-transaksi-8-bulan.csv`: 8 bulan transaksi. Porsi gateway/tunai dihitung otomatis (sekitar 79 / 11 / 10). Pratinjau akan menampilkan 2 catatan (pajak dan fee diperkirakan).

**Langkah Dokumen:**

| Berkas | Wajib bila |
|---|---|
| 2-mutasi-rekening.pdf | selalu |
| 1-perjanjian-sewa.pdf | tanah atau bangunan disewa |
| 3-perjanjian-kredit.pdf | punya utang |
| 4-surat-persetujuan-bank.pdf | ada surat persetujuan bank |
| 6-polis-asuransi.pdf | aset diasuransikan |
| 5-bukti-kepemilikan-sertifikat.pdf | tanah atau bangunan **milik sendiri** (uji jalur ini dengan memilih Milik; nama pemegang hak sudah cocok) |
| 7-npwp.pdf, 8-izin-usaha-nib.pdf | opsional, tetapi dipakai AI untuk mencocokkan nama |
| 9-foto-venue.png | opsional, tampil publik |

## Hasil yang diharapkan
Dibaca otomatis (sudah dicoba dengan model yang sama): sisa sewa 2029-10-08, sewa Rp15 juta, penyewa "Arena Contoh Sejahtera", total kredit rekening Rp1.077.000.000 untuk 6 bulan, angsuran Rp10 juta, larangan menjual pendapatan terdeteksi, nama NPWP dan NIB cocok. Klausul "larangan mengalihkan pendapatan" pada perjanjian sewa tidak terbaca (sengaja tidak ada), jadi status dokumen sewa "sebagian terbaca", dan itu normal.

Uji penolakan: ubah satu angka di CSV (mis. tulis `1.5` di kolom bruto atau hapus dua bulan di tengah) lalu unggah; pratinjau harus menampilkan galat yang jelas.
