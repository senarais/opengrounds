/**
 * Data contoh (SINTETIS) untuk satu pengajuan venue lengkap dengan dokumen PDF, dimasukkan langsung ke database.
 * Semua nama, nomor, dan angka karangan; tidak ada data nyata. Jalankan:
 *   pnpm --filter @venue-rwa/platform seed:demo -- kopiKenangan@gmail.com
 * Akun owner dibuat bila belum ada (kata sandi acak dicetak sekali). Pemeriksaan otomatis (AI) dijalankan bila LLM_API_KEY terisi.
 */
import { DEMO_PHOTOS } from "../lib/demo-photos";
import { provisionPos } from "../lib/flows/provision";
import { seedPosDemo } from "./seed-pos-demo";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { OnboardingInput, serviceClient, type FinancialMonth } from "@venue-rwa/shared";
import { runAutomatedCheck } from "../lib/flows/kyb";
import { submitOnboarding, type DocKindAll } from "../lib/flows/onboarding";

const email = (process.argv.slice(2).find((a) => a.includes("@")) ?? "kopiKenangan@gmail.com").trim().toLowerCase();
const variant = process.argv.find((a) => a.startsWith("--variant="))?.split("=")[1];
const examples = {
  futsal: { company: "PT Demo Senja Olahraga", name: "Demo Senja Futsal", sport: "futsal", price: 5000, tariff: 150000, scale: 0.5, stake: 3000, asset: 1500000000, length: 25, width: 15 },
  padel: { company: "PT Demo Rimba Olahraga", name: "Demo Rimba Padel", sport: "padel", price: 10000, tariff: 300000, scale: 1, stake: 4000, asset: 3000000000, length: 20, width: 10 },
  tenis: { company: "PT Demo Langit Olahraga", name: "Demo Langit Tenis", sport: "tenis", price: 25000, tariff: 450000, scale: 1.5, stake: 5000, asset: 5000000000, length: 23.77, width: 10.97 },
} as const;
if (variant && !(variant in examples)) throw new Error("Unknown demo variant");
const example = variant ? examples[variant as keyof typeof examples] : null;
const COMPANY = example?.company ?? "PT Arena Kenangan Sejahtera";
const VENUE = example?.name ?? "Kenangan Arena Futsal & Padel";
const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");

function wrap(t: string, f: any, size: number, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of t.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (f.widthOfTextAtSize(next, size) > width && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

async function pdf(title: string, lines: string[]): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  const put = (t: string, f = font, size = 11) => {
    for (const row of wrap(t, f, size, 480)) {
      if (y < 60) { page = doc.addPage([595, 842]); y = 790; }
      page.drawText(row, { x: 56, y, size, font: f });
      y -= size + 6;
    }
  };
  put(title, bold, 15);
  y -= 8;
  for (const l of lines) put(l);
  y -= 10;
  put("DOKUMEN CONTOH (DATA SINTETIS) UNTUK DEMO. Bukan dokumen resmi.", bold, 9);
  return new File([Buffer.from(await doc.save())], `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, { type: "application/pdf" });
}

/** 12 bulan penuh sebelum bulan berjalan, dengan musim (libur ramai, awal tahun sepi). D ≈ 25% omzet kotor. */
function financials(): FinancialMonth[] {
  const now = new Date();
  const season = [0.9, 0.85, 0.95, 1.0, 1.05, 1.15, 1.2, 1.1, 1.0, 1.0, 0.95, 1.15];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + i, 1));
    const gross = Math.round((80_000_000 * (example?.scale ?? 1) * season[d.getUTCMonth()]!) / 100_000) * 100_000;
    const r = (p: number) => Math.round(gross * p);
    return {
      month: d.toISOString().slice(0, 7), gross, refunds: r(0.02), opex: r(0.5), tax: r(0.09), operatorFee: r(0.07), reserve: r(0.04), platformFee: r(0.03),
      digitalGross: r(0.94), bankCredits: Math.round(r(0.94) * 1.03),
    };
  });
}

async function ensureOwner(): Promise<string> {
  const db = serviceClient("platform");
  const { data: u } = await db.from("users").select("id, role").ilike("email", email).maybeSingle();
  if (u) {
    if (u.role !== "owner") throw new Error(`Email ${email} sudah terdaftar sebagai ${u.role}, bukan owner`);
    console.log("Akun owner sudah ada, dipakai.");
    return u.id;
  }
  const password = randomBytes(9).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? "gagal membuat akun owner");
  const { data: row, error: ue } = await db.from("users").insert({ role: "owner", display_name: "Owner Kenangan (demo)", email, auth_user_id: data.user.id }).select("id").single();
  if (ue) { await db.auth.admin.deleteUser(data.user.id); throw new Error(ue.message); }
  console.log(`Akun owner dibuat: ${email}\nKata sandi (catat sekarang, tidak ditampilkan lagi): ${password}`);
  return row!.id;
}

(async () => {
  const ownerId = await ensureOwner();
  const fin = financials();
  const total = fin.reduce((a, m) => a + m.gross, 0);
  const credits = fin.reduce((a, m) => a + (m.bankCredits ?? 0), 0);
  const first = fin[0]!.month, last = fin[fin.length - 1]!.month;
  const since = `${new Date().getUTCFullYear() - 4}-03`;

  const input = OnboardingInput.parse({
    company: {
      legalName: COMPANY, nib: "9120300451237", npwp: "0912345678012000", deedNumber: "47", deedDate: "2021-02-18", registeredAddress: "Jl. Kenangan Raya No. 12, Coblong, Kota Bandung, Jawa Barat",
      kbli: "93112", directors: [{ name: "Ratna Wulandari", title: "Direktur Utama" }, { name: "Bagas Prakoso", title: "Direktur" }], commissioners: [{ name: "Hendra Santoso", title: "Komisaris Utama" }],
      signatoryName: "Ratna Wulandari", signatoryTitle: "Direktur Utama", contactEmail: email, contactPhone: "081234567800",
    },
    beneficialOwners: [{ fullName: "Ratna Wulandari", ownershipPct: 60, idNumber: "3273014505880002" }, { fullName: "Hendra Santoso", ownershipPct: 40, idNumber: "3273011209750004" }],
    venue: {
      name: VENUE, address: "Jl. Kenangan Raya No. 12, Dago, Coblong, Kota Bandung", city: "Bandung", province: "Jawa Barat", lat: -6.8915, lng: 107.6107,
      sports: ["futsal", "padel", "badminton"], openHour: 7, closeHour: 23, operatingSince: since,
      facilities: [
        { name: "Futsal A", sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 220_000 },
        { name: "Futsal B", sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 200_000 },
        { name: "Padel 1", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: false, pricePerHour: 260_000 },
        { name: "Padel 2", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: false, pricePerHour: 260_000 },
        { name: "Badminton 1", sport: "badminton", lengthM: 13.4, widthM: 6.1, surface: "vinyl", indoor: true, pricePerHour: 90_000 },
        { name: "Badminton 2", sport: "badminton", lengthM: 13.4, widthM: 6.1, surface: "vinyl", indoor: true, pricePerHour: 90_000 },
      ],
    },
    land: { owned: true, rightType: "HGB", certificateNumber: "10.05.12.17.1.00482", holderName: COMPANY, encumbered: false, encumbranceConsent: false, permits: ["PBG", "SLF"], assetValue: example?.asset ?? 3_000_000_000 },
    financials: fin,
    debt: { outstanding: 0, monthlyInstallment: 0, lender: "", covenantRestricts: false },
    offering: { tokenPrice: example?.price ?? 10000, stakeBps: example?.stake ?? 4000, useOfFunds: "Renovasi atap dan pencahayaan lapangan futsal, serta penambahan satu lapangan padel." },
    payout: { bank: "BCA", accountName: COMPANY, accountNumber: "8830456712" },
    integrations: { gatewayOnly: true, bankDataAccess: true },
    consent: { dataProcessing: true, truthful: true },
  });

  if (example) {
    input.venue.sports = [example.sport];
    input.venue.facilities = [1, 2, 3].map((i) => ({ name: `${example.sport} ${i}`, sport: example.sport, lengthM: example.length, widthM: example.width, surface: "vinyl", indoor: example.sport === "futsal", pricePerHour: example.tariff }));
    input.offering.useOfFunds = "DATA DEMO SINTETIS: renovasi lapangan. Foto adalah referensi eksternal, bukan kondisi venue ini.";
  }
  const files: { kind: DocKindAll; file: File }[] = [
    { kind: "deed", file: await pdf("Akta Pendirian Perseroan Terbatas", [
      `AKTA PENDIRIAN ${COMPANY.toUpperCase()}`, "Nomor: 47", "Tanggal: 18 Februari 2021",
      `Di hadapan saya, Notaris di Bandung, menghadap para pendiri yang mendirikan perseroan terbatas bernama ${COMPANY}.`,
      "Kedudukan perseroan di Kota Bandung. Maksud dan tujuan: penyewaan fasilitas olahraga (KBLI 93112).",
      "Direktur Utama: Ratna Wulandari. Direktur: Bagas Prakoso. Komisaris Utama: Hendra Santoso."]) },
    { kind: "nib", file: await pdf("Nomor Induk Berusaha", [
      "NOMOR INDUK BERUSAHA (NIB) 9120300451237", `Nama pelaku usaha: ${COMPANY}`, "Alamat: Jl. Kenangan Raya No. 12, Coblong, Kota Bandung",
      "Kode KBLI 93112 - Kegiatan Pengelolaan Fasilitas Olahraga", "Tanggal terbit: 22 Februari 2021"]) },
    { kind: "npwp", file: await pdf("Kartu NPWP Badan", ["NOMOR POKOK WAJIB PAJAK 09.123.456.7-012.000", `Nama wajib pajak: ${COMPANY}`, "Alamat: Jl. Kenangan Raya No. 12, Coblong, Kota Bandung"]) },
    { kind: "land_certificate", file: await pdf("Sertifikat Hak Guna Bangunan", [
      "SERTIFIKAT HAK GUNA BANGUNAN Nomor 10.05.12.17.1.00482", `Pemegang hak: ${COMPANY}`,
      "Letak tanah: Jl. Kenangan Raya No. 12, Kelurahan Dago, Kecamatan Coblong, Kota Bandung",
      "Luas tanah: 2.400 meter persegi. Berlaku sampai 17 Februari 2051.", "Catatan pada buku tanah: tidak ada pembebanan hak tanggungan; tanah tidak sedang dijaminkan."]) },
    { kind: "bank_statement", file: await pdf("Rekening Koran 12 Bulan", [
      "REKENING KORAN BCA nomor 8830456712", `Nama pemilik rekening: ${COMPANY}`, `Periode 12 bulan, ${first} sampai ${last}.`,
      `Total kredit ${rp(credits)} selama periode.`, "Mutasi kredit utama berasal dari pencairan payment gateway (QRIS dan virtual account)."]) },
    { kind: "financial_report", file: await pdf("Laporan Keuangan Tahunan", [
      `LAPORAN KEUANGAN ${COMPANY}`, `Periode ${first} sampai ${last}.`, `Total pendapatan ${rp(total)}.`, "Biaya operasional sekitar 50 persen dari pendapatan; tidak ada utang bank."]) },
    { kind: "permit", file: await pdf("Persetujuan Bangunan Gedung", ["PERSETUJUAN BANGUNAN GEDUNG (PBG) dan SLF", `Pemilik: ${COMPANY}`, "Fungsi: gedung olahraga. Berlaku sampai 2030."]) },
  ];
  const csv = ["bulan,bruto,refund,biaya_operasional,pajak,fee_operator,cadangan,fee_platform,omzet_digital", ...fin.map((m) => [m.month, m.gross, m.refunds, m.opex, m.tax, m.operatorFee, m.reserve, m.platformFee, m.digitalGross].join(","))].join("\n");
  files.push({ kind: "sales_data", file: new File([csv], "penjualan.csv", { type: "text/csv" }) });

  if (variant) {
    const photo = DEMO_PHOTOS[variant as keyof typeof DEMO_PHOTOS];
    const page = await fetch(photo.source, { headers: { "User-Agent": "OpenGroundsHackathonDemo/1.0" } });
    if (!page.ok) throw new Error(`Photo source HTTP ${page.status}`);
    const html = await page.text();
    const original = html.match(/class="fullImageLink"[\s\S]*?<a href="([^"]+)"/i)?.[1]?.replaceAll("&amp;", "&");
    if (!original || !original.startsWith("https://upload.wikimedia.org/")) throw new Error("Original image not found");
    const image = await fetch(original);
    if (!image.ok) throw new Error(`Photo download HTTP ${image.status}`);
    files.push({ kind: "photo", file: new File([await image.arrayBuffer()], `demo-reference-${variant}.jpg`, { type: "image/jpeg" }) });
  }
  const db = serviceClient("platform");
  const { data: dup } = await db.from("venues").select("id, organizations!inner(owner_user_id)").eq("name", VENUE).eq("organizations.owner_user_id", ownerId).limit(1);
  if (dup?.length) { console.log("Venue demo sudah ada; pengajuan tidak digandakan."); return; }

  const r = await submitOnboarding(ownerId, input, files, "seed:demo");
  console.log(`Pengajuan dibuat: venue ${r.venueId}, kasus KYB ${r.caseId} (status SUBMITTED)`);
  const pos = await provisionPos(r.venueId);
  await db.schema("pos").from("companies").update({ synthetic: true }).eq("id", pos.companyId);
  await seedPosDemo(pos.companyId, 12, example?.tariff ?? 200000);
  try {
    const c = await runAutomatedCheck(r.caseId);
    console.log(`Pemeriksaan otomatis selesai: ${c.summary.counts.critical} critical, ${c.summary.counts.high} high, ${c.summary.counts.medium} medium. Buka /review.`);
  } catch (e: any) { console.log("Pemeriksaan otomatis belum jalan:", e?.message ?? e, "- jalankan dari /review."); }
})().catch((e) => { console.error(e?.issues ? JSON.stringify(e.issues.slice(0, 5)) : (e.message ?? e)); process.exit(1); });
