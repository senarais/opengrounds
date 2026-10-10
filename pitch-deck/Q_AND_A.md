# Open Grounds — Q&A backup

Materi di bawah sengaja tidak masuk slide utama. Pitch memakai 6 slide, sekitar 3 menit 10 detik.

## Mengapa Ethereum?

Chain sebagai wasit: memeriksa tanda tangan investor, nominal exact, anti-replay, allowlist, plafon biaya, fixed supply dan periode yang tidak boleh diposting dua kali. Rupiah dan data privat tetap off-chain. Attestation akuisisi: platform + owner; angka bulanan: platform + owner (verifier dapat menggantikan owner yang diam melewati tenggat); revaluasi: platform + verifier. Review KYB off-chain memerlukan operator dan reviewer independen. AI advisory; manusia memutuskan. Dua kunci tim hanya demonstrasi mekanisme, bukan bukti governance independen.

## Bagaimana ekonomi dan valuasi bekerja?

Seluruh angka berikut **[Asumsi]**, bukan data venue atau forecast. `V = min(V_aset, D12 / r)`. D12 adalah laba bersih 12 bulan dari pendapatan yang lolos rekonsiliasi booking ↔ pembayaran ↔ bank. Nilai aset Rp2,4 miliar, D12 Rp180 juta, r 9% → V Rp2 miliar. Hak yang dibeli 50% → S Rp1 miliar, diterbitkan 100.000 token × Rp10.000.

Contoh satu bulan: gross Rp52 juta dikurangi refund Rp1 juta, OPEX Rp27 juta, pajak Rp1,5 juta, operator Rp4 juta, cadangan Rp2 juta dan platform Rp1,5 juta → laba distributable Rp15 juta. Bagian SPV 50% = Rp7,5 juta; fee manajemen SPV 2% = Rp150 ribu → pool token Rp7,35 juta. Investor memegang 10.000 dari 100.000 token (10%, modal contoh Rp100 juta) → Rp735 ribu bulan tersebut sebelum pembulatan ledger. Treasury mendapat bagian untuk token yang belum dijual. Bila laba nol, distribusi nol. Tidak ada yield yang dijanjikan. Tarif platform produksi belum diputuskan.

## Investor bisa keluar kapan?

Tidak ada pasar transfer antar investor. Sell-back ke treasury bersyarat: lot terbuka, seri Active, jendela FIFO dan cadangan tersedia. Token kembali ke treasury, tidak dibakar. Likuiditas tidak dijamin. Owner bukan pembeli balik.

## Apa yang sudah ada dan apa yang disimulasikan?

Implementasi web, kontrak dan verifikasi ada di repo. Berdasarkan status AGENTS.md, full end-to-end Sepolia masih pending; deck tidak mengklaim sudah terverifikasi. Akuisisi di depan, rupiah, escrow dan split disimulasikan. xenPlatform belum aktif. Privy untuk owner/investor, MetaMask untuk reviewer. Tidak ada klaim regulator approval atau sandbox OJK. PoS dan shared UI/connectors berasal dari iterasi awal; kontrak/platform/verifikasi/model v4.1 merupakan build hackathon menurut README.

## Apakah token dijamin aset?

Tidak. Aset menjadi patokan harga, bukan jaminan. Yang ditokenisasi adalah hak manfaat ekonomi atas sebagian laba bersih yang bisa dibagikan; bukan tanah, omzet atau saham PT. Bentuk hukum, perizinan, pembiayaan SPV dan struktur SPV produksi tetap keputusan terbuka. Catatan chain bukan bukti kepemilikan hukum.

## Ada pilot atau partner?

Deck tidak mengklaim pilot, partner, investor atau traction yang belum ada buktinya. Data AYO adalah bukti digitalisasi pasar, bukan data Open Grounds atau partnership. Next step yang diusulkan: validasi satu venue bersama owner, reviewer, counsel dan penyedia pembayaran.
