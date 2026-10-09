/**
 * Katalog data: satu sumber kebenaran untuk "apa yang kami minta, untuk apa, siapa yang melihat, dan ke mana perginya".
 * Dipakai oleh form pengajuan (catatan per bagian) dan halaman /kebijakan-data. Isi HARUS mencerminkan perilaku kode yang sebenarnya.
 */
export type Visibility = "public" | "kyc_investor" | "staff" | "owner_only" | "never";

export interface DataItem {
  id: string;
  label: string;
  purpose: string;
  /** Siapa yang boleh melihat. */
  visibility: Visibility;
  /** Dikirim ke model AI? "teks diredaksi" = hanya teks dokumen setelah NIK/rekening/telepon/email disamarkan. */
  ai: "tidak" | "teks diredaksi";
  where: string;
  /** Wajib untuk pengajuan, atau opsional. */
  required: boolean;
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "Publik (siapa saja)",
  kyc_investor: "Investor yang sudah KYC + staf",
  staff: "Hanya staf verifikasi",
  owner_only: "Hanya owner & anggota PoS-nya",
  never: "Tidak pernah dibuka",
};

export const DATA_CATALOG: DataItem[] = [
  { id: "venue_photos", label: "Foto venue dan ilustrasi demo beratribusi", purpose: "Menampilkan kondisi yang diajukan; foto referensi demo dilabeli dan bukan bukti venue.", visibility: "public", ai: "tidak", where: "Galeri produk/review; storage privat dengan tautan foto berlaku 1 jam", required: false },
  { id: "profile", label: "Profil venue: nama, kota, provinsi, jenis olahraga, daftar lapangan (ukuran, lantai, tarif), jam operasi, tujuan dana", purpose: "Investor menilai kapasitas dan kewajaran pendapatan venue.", visibility: "public", ai: "tidak", where: "Halaman produk; hash-nya terikat ke attestation ACQUISITION_CLOSED", required: true },
  { id: "financial_summary", label: "Ringkasan keuangan bulanan: omzet kotor dan laba bersih yang bisa dibagikan (D), porsi pembayaran digital", purpose: "Rumus valuasi memakai D12; input dan hasilnya wajib transparan ke investor (PRD §4.1).", visibility: "public", ai: "tidak", where: "Halaman produk", required: true },
  { id: "valuation", label: "Valuasi: nilai aset (input reviewer, berlabel), D12, r, V, imbal hasil tersirat, X, jumlah token, harga referensi", purpose: "Menjelaskan dari mana harga referensi berasal.", visibility: "public", ai: "tidak", where: "Halaman produk + kontrak (angka valuasi, supply, harga referensi)", required: true },
  { id: "land_public", label: "Status lahan: milik sendiri, jenis hak, sedang dijaminkan atau tidak (tanpa nomor sertifikat)", purpose: "Venue hanya diterima bila tanahnya milik sendiri; risiko jaminan diungkap.", visibility: "public", ai: "tidak", where: "Halaman produk", required: true },
  { id: "address", label: "Alamat persis venue", purpose: "Memastikan venue benar ada; tidak perlu terbuka bagi publik.", visibility: "kyc_investor", ai: "tidak", where: "Halaman produk (bagian investor KYC)", required: true },
  { id: "periods", label: "Waterfall bulanan per periode: omzet kotor, refund, biaya, pajak, fee operator, cadangan, fee platform, D, jatah per token", purpose: "Investor memeriksa angka yang ditandatangani platform dan owner; kontrak menghitung ulang.", visibility: "public", ai: "tidak", where: "Halaman produk + kontrak (angka waterfall dan hash bukti)", required: false },
  { id: "venue_ledger", label: "Transaksi venue dari ledger PoS: waktu, jenis, nominal, status settle di gateway", purpose: "Sumber omzet periode; bisa dicocokkan dengan hash bukti on-chain.", visibility: "staff", ai: "tidak", where: "pos.ledger_entries. Identitas pelanggan tidak pernah disimpan (hanya hash)", required: false },
  { id: "documents", label: "Dokumen KYB: akta, NIB, NPWP, sertifikat tanah, izin, rekening koran, laporan keuangan, pajak, utang, asuransi", purpose: "Bukti untuk reviewer dan agen AI (ekstraksi dan silang-cek).", visibility: "staff", ai: "teks diredaksi", where: "Penyimpanan privat; tautan unduh berlaku 5 menit; foto venue boleh publik", required: true },
  { id: "identity", label: "Identitas badan usaha: nama legal, NIB, NPWP, akta, KBLI, direksi/komisaris, penandatangan, kontak", purpose: "KYB: memastikan badan usaha dan pihak yang berwenang.", visibility: "staff", ai: "tidak", where: "platform.organizations (hanya server)", required: true },
  { id: "ubo", label: "Pemilik manfaat ≥25%: nama, persentase, NIK (disimpan tersamarkan, 4 digit terakhir)", purpose: "KYB/AML: siapa yang mengendalikan usaha.", visibility: "staff", ai: "tidak", where: "platform.beneficial_owners", required: true },
  { id: "land", label: "Sertifikat tanah: nomor, atas nama, jenis hak, hak tanggungan, izin bangunan", purpose: "Gerbang 'tanah milik sendiri' dan risiko jaminan.", visibility: "staff", ai: "teks diredaksi", where: "platform.venue_land", required: true },
  { id: "finance", label: "Rincian keuangan dan utang: komponen waterfall per bulan, kredit rekening koran, sisa utang, kreditur, covenant", purpose: "Menghitung D12 dan menilai beban atas laba.", visibility: "staff", ai: "tidak", where: "platform.venue_financials, platform.organizations.debt", required: true },
  { id: "payout", label: "Rekening owner: bank, nama pemilik, nomor (disimpan tersamarkan + hash)", purpose: "Tujuan dana akuisisi dan split harian; nama harus sama dengan badan usaha.", visibility: "staff", ai: "tidak", where: "platform.owner_bank_accounts", required: true },
  { id: "investor", label: "Akun investor: email, alamat wallet Privy, status KYC", purpose: "Mengikat token ke satu akun dan wallet. Hanya status allowlist yang masuk chain.", visibility: "staff", ai: "tidak", where: "platform.users, platform.kyc_records", required: true },
  { id: "kyc_name", label: "Nama lengkap hasil KYC investor", purpose: "Mencocokkan nama pemilik rekening bank dengan nama KYC sebelum pembelian pertama.", visibility: "staff", ai: "tidak", where: "platform.kyc_records", required: true },
  { id: "investor_bank", label: "Rekening bank investor: bank, nama pemilik, nomor (tersamarkan + hash), hasil cocok nama, masa tunggu ganti rekening", purpose: "Penarikan saldo hanya ke rekening atas nama investor sendiri.", visibility: "staff", ai: "tidak", where: "platform.investor_bank_accounts", required: true },
  { id: "investor_ledger", label: "Saldo dan riwayat investor: distribusi, penarikan, reinvest, jual balik", purpose: "Menunjukkan hak investor di rekening distribusi (simulasi).", visibility: "staff", ai: "tidak", where: "platform.investor_ledger (append-only); investor melihat miliknya sendiri", required: true },
  { id: "kyc", label: "Dokumen identitas investor (KTP, selfie)", purpose: "Verifikasi identitas dilakukan penyedia KYC (Didit). Platform tidak menyimpannya.", visibility: "never", ai: "tidak", where: "Hanya di penyedia KYC; platform menerima status dan nama", required: true },
  { id: "customers", label: "Data pelanggan venue di PoS", purpose: "PoS hanya menyimpan hash referensi dan label singkat untuk mencegah booking fiktif.", visibility: "owner_only", ai: "tidak", where: "PoS (terpisah per perusahaan)", required: false },
  { id: "onchain", label: "Data on-chain: alamat wallet, status allowlist/beku, jumlah token dan lot, angka waterfall, hash bukti", purpose: "Chain menegakkan aturan. Tidak ada nama, NIK, rekening, atau dokumen di chain.", visibility: "public", ai: "tidak", where: "Sepolia (publik dan permanen)", required: true },
];

export const itemsFor = (...ids: string[]) => DATA_CATALOG.filter((d) => ids.includes(d.id));
