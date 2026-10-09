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
  { id: "venue_ledger", label: "Transaksi venue dari ledger PoS: waktu, jenis (penjualan, refund, pajak, biaya gateway), nominal, status settle di payment gateway, dan hash entri", purpose: "Pemegang token memantau omzet yang menjadi dasar kantong investor secara realtime dan bisa mencocokkannya dengan hash harian on-chain", visibility: "kyc_investor", ai: "tidak", where: "pos.ledger_entries; ditampilkan di halaman detail token, hanya untuk pemegang token yang sudah KYC. Nama dan identitas pelanggan tidak pernah ditampilkan", required: false },
  { id: "profile", label: "Profil venue: nama, kecamatan, kota, provinsi, daftar lapangan (ukuran, lantai, tarif), tahun dibangun, asuransi", purpose: "Investor perlu menilai kewajaran proyeksi dan kapasitas venue.", visibility: "public", ai: "tidak", where: "Halaman penawaran (disclosure pack)", required: true },
  { id: "performance", label: "Kinerja: omzet bersih bulanan, okupansi, porsi pembayaran gateway/tunai/transfer", purpose: "Dasar harga dan proyeksi; porsi non-gateway diungkap karena tidak bisa diverifikasi.", visibility: "public", ai: "tidak", where: "Halaman penawaran", required: true },
  { id: "terms", label: "Syarat penawaran: target, harga token, bagian omzet, tenor, tujuan dana", purpose: "Syarat yang mengikat; hash-nya masuk bukti attestation.", visibility: "public", ai: "tidak", where: "Halaman penawaran + kontrak (hanya angka)", required: true },
  { id: "risk", label: "Risiko: sisa sewa, rasio cicilan terhadap omzet, jaminan, sengketa, beban omzet lain, persetujuan pemilik lahan, pihak terkait", purpose: "Investor berhak tahu hal yang bisa mengurangi pembayaran.", visibility: "public", ai: "tidak", where: "Halaman penawaran", required: true },
  { id: "photos", label: "Foto venue", purpose: "Memperlihatkan kondisi venue.", visibility: "public", ai: "tidak", where: "Penyimpanan privat; hanya foto yang ditampilkan publik", required: false },
  { id: "address", label: "Alamat persis: jalan, kelurahan, kode pos, patokan", purpose: "Memastikan venue benar-benar ada; tidak perlu terbuka bagi publik.", visibility: "kyc_investor", ai: "tidak", where: "Disclosure pack (bagian sensitif)", required: true },
  { id: "sales", label: "File data penjualan (CSV/XLSX) yang diunggah owner", purpose: "Bahan perhitungan omzet bersih dan porsi pembayaran; disimpan sebagai bukti untuk reviewer dan pembanding data PoS/gateway setelah disetujui. Hanya angka ringkasannya yang tampil publik.", visibility: "staff", ai: "tidak", where: "Penyimpanan privat", required: true },
  { id: "documents", label: "Salinan dokumen: perjanjian sewa, bukti kepemilikan (sertifikat/AJB/PBB), mutasi rekening, perjanjian kredit, NPWP/pajak, izin usaha", purpose: "Bukti untuk verifikasi; investor KYC dapat memeriksa sendiri.", visibility: "kyc_investor", ai: "teks diredaksi", where: "Penyimpanan privat; tautan unduh berlaku 5 menit", required: true },
  { id: "identity", label: "Identitas badan usaha: NIB, NPWP, penandatangan & jabatan, pemilik manfaat, email & HP kontak", purpose: "Verifikasi badan usaha dan pemilik manfaat (KYB) serta menghubungi pengaju.", visibility: "staff", ai: "tidak", where: "Tabel privat (hanya server)", required: true },
  { id: "payout", label: "Rekening tujuan pembayaran: bank, nama pemilik, nomor", purpose: "Mencairkan dana ke rekening yang sah; nama pemilik harus sama dengan badan usaha.", visibility: "staff", ai: "tidak", where: "Tabel privat (hanya server)", required: true },
  { id: "explain", label: "Penjelasan singkat: sengketa, aset yang dijaminkan, kontrak bagi hasil lain, transaksi pihak terkait", purpose: "Staf perlu konteks untuk menilai risiko. Diminta ringkas, tanpa nama individu atau nomor identitas; bukti utamanya dokumen, bukan narasi.", visibility: "staff", ai: "tidak", where: "Tabel privat (hanya server); ringkasan Ya/Tidak tampil publik", required: false },
  { id: "finance", label: "Rincian internal: sisa pokok & tenor utang, biaya operasional, sewa per bulan, rincian omzet (bruto, refund, pajak, fee)", purpose: "Menilai beban atas omzet dan kewajaran porsi bagi hasil.", visibility: "staff", ai: "tidak", where: "Tabel privat (hanya server)", required: true },
  { id: "investor", label: "Akun investor: email, alamat wallet, status KYC", purpose: "Mengikat hak atas token ke satu akun dan wallet; hasil KYC hanya berupa status.", visibility: "staff", ai: "tidak", where: "Basis data platform", required: true },
  { id: "kyc", label: "Dokumen identitas investor (KTP, selfie)", purpose: "Verifikasi identitas dilakukan oleh penyedia KYC (Didit). Platform tidak menyimpannya.", visibility: "never", ai: "tidak", where: "Hanya di penyedia KYC; platform menerima status Approved/Declined", required: true },
  { id: "customers", label: "Data pelanggan venue di PoS", purpose: "PoS hanya menyimpan hash referensi dan label singkat untuk mencegah booking fiktif.", visibility: "owner_only", ai: "tidak", where: "PoS (terpisah per perusahaan)", required: false },
];

export const itemsFor = (...ids: string[]) => DATA_CATALOG.filter((d) => ids.includes(d.id));
