# Open Grounds — Pitch deck

Deck web 16:9, 8 slide untuk pitch **sekitar 3 menit**. Slide dalam bahasa Inggris, speaker notes dalam bahasa Indonesia. Aplikasi ini berdiri sendiri; tidak membutuhkan Supabase, wallet, API key atau `.env`.

## Jalankan

Node **22+**, pnpm **10+**.

```bash
cd pitch-deck # atau masuk folder open-grounds-pitch setelah extract ZIP
pnpm install
pnpm dev
```

Buka **http://localhost:4173**. Fonts dan foto dibundel lokal, jadi setelah instalasi presentasi bisa berjalan tanpa internet. Tautan sumber tetap membutuhkan internet.

- **Present / F:** presentasi fullscreen. Esc untuk keluar.
- **← / → / Space:** berpindah slide; Home/End ke awal/akhir.
- **Speaker notes / N:** catatan pembicara dan estimasi waktu.
- **Overview / O:** lihat semua slide; klik slide untuk membukanya.
- **Replay / R:** ulang animasi pada slide saat ini.
- **Sources:** sumber primer, batas interpretasi data, dan atribusi.
- **Export PDF:** print dialog browser → Save as PDF. Gunakan Chrome/Edge untuk ukuran slide kustom; tanpa margin atau header/footer, aktifkan background graphics. PDF berisi seluruh 8 slide, tanpa toolbar atau speaker notes, sekalipun hanya satu slide terlihat.

## PDF otomatis

PDF siap pakai juga ada di `deliverables/Open-Grounds-Pitch.pdf` pada ZIP. Untuk memperbarui setelah mengedit:

```bash
pnpm exec playwright install chromium # sekali, untuk export otomatis
pnpm export:pdf
```

Output: `exports/Open-Grounds-Pitch.pdf`. Bisa menentukan nama file:

```bash
pnpm export:pdf exports/My-Pitch.pdf
```

Export otomatis menjalankan server sendiri di port 4174 dan menutupnya setelah selesai. `pnpm dev` tidak harus sedang berjalan. `pnpm build` melakukan TypeScript check dan build produksi; `pnpm preview` menayangkan hasil build pada port 4173.

## Isi deck

1. Open Grounds — cover.
2. Sports Venue — court hijau, background orange, judul dengan shadow tipis.
3. Same court. Repeated rentals. — studi Batam.
4. Market — grafik BPS + data AYO dengan logo sumber resmi.
5. The Problem — dua teks besar pada bidang hijau–orange, dengan ilustrasi court dan gap akses.
6. Open Grounds — poster nama besar, foto court dan satu kalimat penjelasan solusi.
7. How it works — diagram lapangan, owner → SPV → investor.
8. Closing — Open the upside.

BMC tetap tersimpan di `src/content.ts` dengan `hidden: true`. Ubah ke `hidden: false` atau hapus properti itu untuk menampilkannya kembali. `src/main.ts` memfilter slide tersembunyi dari navigasi, overview, presentasi dan PDF. Catatan BMC tetap ada sebagai backup di `SPEAKER_NOTES.md`.

Urutan mengikuti revisi pengguna: ekonomi venue → bukti pasar → dua masalah → pengenalan platform → mekanisme. Detail teknis tetap di `SPEAKER_NOTES.md` dan `Q_AND_A.md`. `PITCH_SCRIPT.md` membantu latihan sekitar tiga menit.

Animasi membawa mekanisme: servis bola di cover, jalur transaksi dan distribusi di solusi, token-unit terbentuk, lalu bar grafik BPS tumbuh dan angka menghitung ke nilai sumber. Animasi dipicu saat slide dibuka; tekan **Replay / R** untuk mengulang. Tidak ada autoplay slide atau infinite loop. Reduced motion dihormati; PDF statis dengan angka final yang benar. Grafik memakai skala nol yang sama, panjang bar proporsional terhadap nilai asli. AYO ditampilkan terpisah karena unitnya berbeda.

Edit copy, notes, sumber dan durasi di `src/content.ts`; visual di `src/style.css`; kontrol presentasi di `src/main.ts`. Semua teks adalah HTML/TypeScript yang bisa diedit, bukan gambar slide. Baca `SPEAKER_NOTES.md` untuk latihan tanpa membuka browser. `SOURCES.md` memuat audit klaim dan atribusi.

## Arahan desain

Ivory `#F8FAFC`, Midnight `#0F172A`, Slate `#334155`, Sunrise `#FF7A00`, Amber `#FFD166`. Plus Jakarta Sans untuk judul, Inter untuk body. Visual mengadaptasi referensi awal Saku Pitch dan foto lapangan yang sudah ada di repo; revisi memakai bidang terbuka, SVG court, transaction lanes, serta chart nyata. SVG, grafik dan animasi dibuat sendiri. Teks di atas orange memakai Midnight. Mode terang; tidak ada autoplay, countdown atau konfeti.

## Status dan batas klaim

PRD v4.1 + keputusan terbaru di AGENTS.md adalah acuan model. Kata “ownership” pada draft diganti dengan akses hak manfaat ekonomi atas sebagian **laba bersih yang bisa dibagikan**, bukan tanah, omzet atau saham PT. Bentuk hukum, izin, tarif platform dan pendanaan SPV produksi belum final; deck tidak menetapkannya. Sumber market bukan traction Open Grounds dan bukan ukuran pasar investasi yang bisa dijumlahkan.

Testnet/simulasi saja. Rupiah, escrow, split dan akuisisi disimulasikan. Full end-to-end Sepolia belum terverifikasi menurut konteks proyek saat deck dibuat. Open Grounds belum berizin; token tidak dijamin oleh aset venue; imbal hasil dan likuiditas tidak dijamin. On-chain records bukan bukti kepemilikan hukum. Proposed ask tidak mengklaim pilot atau partnership yang sudah ada.

## What's new in this hackathon

Deck ini adalah artefak presentasi baru, terpisah dari aplikasi utama. Menurut README produk, kontrak, platform, verifikasi dan model v4.1 merupakan build hackathon; PoS serta shared UI/connectors berasal dari iterasi sebelumnya. Deck tidak menambahkan klaim test pass, user traction atau deployment yang belum diverifikasi.

## Atribusi

Desain referensi: [Saku Pitch](https://github.com/s-erzv/saku-pitch) dan dua gambar referensi pengguna; layout dan kode deck asli. Foto ilustratif dari Unsplash yang sudah ada di repo produk, bukan bukti venue/customer. Plus Jakarta Sans dan Inter via Fontsource (SIL OFL; license tersedia pada paket). Vite (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0). Tidak memakai aset mascot atau screenshot Saku. Sumber data primer dan link foto ada di `SOURCES.md`.

## Verifikasi deck

Dengan `pnpm dev` berjalan, gunakan `pnpm check:deck`. Check mencakup navigasi, notes, sources, fullscreen, reduced motion, mobile, batas layout, serta PDF tepat 8 halaman. Ini hanya pengujian deck, bukan validasi aplikasi RWA utama.

Preview animasi asli dari browser ada di `deliverables/Motion-Preview.webm`. Gunakan browser atau pemutar video yang mendukung WebM. Cover, chart market dan closing tersedia sebagai PNG untuk preview cepat.
