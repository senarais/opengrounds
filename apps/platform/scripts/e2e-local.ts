/**
 * Uji end-to-end TANPA browser: perjalanan penuh satu perusahaan baru memakai kode flows yang sama dengan aplikasi.
 * Chain: anvil lokal (scripts/e2e-local.sh). Database: Supabase sungguhan, tapi hanya baris uji yang dibuat lalu dibersihkan.
 */
import { createHash } from "node:crypto";
import { createWalletClient, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ApplicationInput, ZERO_HASH, ledgerEntryHash, serviceClient } from "@venue-rwa/shared";

const RUN = Date.now().toString(36);
const pf = serviceClient("platform");
const pos = serviceClient("pos");
let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) { failed++; process.exitCode = 1; } };
async function expectErr(p: Promise<unknown>, part: string, label: string) {
  const { friendlyError } = await import("../lib/operator");
  try { await p; ok(false, `${label}: seharusnya ditolak`); } catch (e: any) { const msg = friendlyError(e); ok((msg + " " + String(e?.message)).toLowerCase().includes(part.toLowerCase()), `${label}: ditolak (${msg.slice(0, 90)})`); }
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const file = (name: string, type: string, body: Buffer | string | Uint8Array) => new File([body as any], name, { type });
async function makePdf(pages: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) { const page = doc.addPage([595, 842]); let y = 780; for (const line of text.split("\n")) { page.drawText(line, { x: 50, y, size: 11, font }); y -= 18; } }
  return doc.save();
}

async function main() {
  const { submitApplication, verifyReported } = await import("../lib/flows/apply");
  const flowMod = await import("../lib/flow");
  const series = await import("../lib/flows/series");
  const att = await import("../lib/flows/attestation");
  const inv = await import("../lib/flows/investor");
  const prov = await import("../lib/flows/provision");
  const chainMod = await import("../lib/chain");
  const { currentDraft } = await import("../lib/attest");
  const { disclosureHash } = await import("@venue-rwa/shared");
  const { signedUrl } = await import("../lib/storage");
  const { addSignature } = await import("../lib/attest");
  const eip = await import("../lib/eip712");

  // ---- pembantu khusus uji (aplikasi tidak menyimpan kunci apa pun): signer dari env wrapper, investor = wallet acak
  const signerKey = (i: number) => privateKeyToAccount(process.env[`SIGNER_${i + 1}_PRIVATE_KEY`] as Hex);
  const { reviewMessage } = await import("../lib/review-message");
  /** Suara review yang ditandatangani wallet signer ke-i (seperti personal_sign MetaMask di halaman Reviewer). */
  const vote = async (c: any, email: string, role: string, decision: "approved" | "rejected", note: string, i: number) => {
    const rv = await import("../lib/flows/review");
    if (decision === "approved") {
      // setuju = SATU tanda tangan EIP-712 atas attestation (juga berfungsi sebagai tanda tangan attestation)
      const prep = await rv.prepareApproval(c, { email, role });
      const t = JSON.parse(prep.typed);
      const signature = await signerKey(i).signTypedData({ domain: t.domain, types: { Attestation: t.types.Attestation }, primaryType: "Attestation", message: t.message });
      return rv.decideReview(c, { email, role }, decision, note, { kind: "attestation", signature });
    }
    const at = new Date().toISOString();
    const signature = await signerKey(i).signMessage({ message: reviewMessage({ seriesId: c.series.id, email, role, decision, note, at }) });
    return rv.decideReview(c, { email, role }, decision, note, { kind: "message", at, signature });
  };
  const signDraft = async (seriesId: string, i: number) => {
    const d = await currentDraft(seriesId);
    const acct = signerKey(i);
    const sig = await acct.signTypedData({ domain: eip.attestationDomain() as any, types: eip.attestationTypes as any, primaryType: "Attestation", message: eip.attMessage(d!.payload) as any });
    return addSignature(d!.id, acct.address, sig);
  };
  const investors = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()));
  {
    // ---- penautan wallet: bukti kepemilikan lewat tanda tangan pesan
    const { linkMessage, verifyWalletLink } = await import("../lib/wallet-link");
    const a = investors[0]!, other = investors[1]!;
    const authId = "00000000-0000-4000-8000-000000000001";
    const msg = linkMessage(authId);
    const sig = await a.signMessage({ message: msg });
    ok((await verifyWalletLink(authId, a.address, msg, sig)).toLowerCase() === a.address.toLowerCase(), "penautan wallet: tanda tangan pemilik diterima");
    await expectErr(verifyWalletLink(authId, other.address, msg, sig), "tidak cocok", "penautan wallet: tanda tangan orang lain");
    await expectErr(verifyWalletLink("akun-lain", a.address, msg, sig), "tidak valid", "penautan wallet: pesan untuk akun lain");
    const old = linkMessage(authId, new Date(Date.now() - 3_600_000));
    await expectErr(verifyWalletLink(authId, a.address, old, await a.signMessage({ message: old })), "kedaluwarsa", "penautan wallet: pesan lama (replay)");
  }
  const kyc = async (c: any, a: (typeof investors)[number]) => { await inv.mockKyc(a.address); };

  // ---------------------------------------------------------------- 1. akun owner
  const email = `e2e-${RUN}@selftest.local`;
  const { data: au, error: ae } = await pf.auth.admin.createUser({ email, password: `Pw-${RUN}-xx!`, email_confirm: true });
  if (ae) throw new Error(ae.message);
  const { data: urow, error: ue } = await pf.from("users").insert({ role: "owner", display_name: "Owner E2E", email, auth_user_id: au.user.id }).select("id").single();
  if (ue) throw new Error(`users: ${ue.message} (sudah menjalankan migration 0008?)`);
  const me = { authId: au.user.id, email, userId: urow!.id as string, role: "owner" as const, name: "Owner E2E", wallet: null };
  let venueId = "", seriesId = "", companyId = "";
  const extraSeries: string[] = [], extraVenues: string[] = [];
  const createdUserIds = [au.user.id];
  let staffAuthId = "";

  try {
    // ---------------------------------------------------------------- 1b. pembuatan akun staf lewat web (flow bersama)
    {
      const { createStaffAccount, staffCount } = await import("../lib/flows/staff");
      const before = await staffCount();
      const stEmail = `e2e-staff-${RUN}@selftest.local`;
      await expectErr(createStaffAccount({ name: "Staf Uji", email: stEmail, password: "pendek", role: "auditor" }), "minimal 8", "staf: kata sandi terlalu pendek");
      await expectErr(createStaffAccount({ name: "Staf Uji", email: "bukan-email", password: "Panjang-123!", role: "auditor" }), "tidak valid", "staf: email tidak valid");
      await expectErr(createStaffAccount({ name: "Staf Uji", email: stEmail, password: "Panjang-123!", role: "owner" as any }), "tidak valid", "staf: peran selain staf ditolak");
      const r = await createStaffAccount({ name: "Staf Uji", email: stEmail, password: `Pw-${RUN}-xx!`, role: "auditor" });
      staffAuthId = r.userId;
      ok((await staffCount()) === before + 1, "akun staf dibuat (Auth + baris platform)");
      await expectErr(createStaffAccount({ name: "Staf Dua", email: stEmail, password: "Panjang-123!", role: "auditor" }), "sudah terdaftar", "staf: email ganda");
      ok((await staffCount()) === before + 1, "email ganda tidak meninggalkan akun setengah jadi");

      // peta akses per peran
      const { AREA_ROLES } = await import("../lib/roles");
      ok(AREA_ROLES.operator.join() === "operator" && AREA_ROLES.staff.join() === "operator", "konsol operator dan kelola staf hanya untuk operator");
      ok(AREA_ROLES.auditor.join() === "auditor", "halaman auditor hanya untuk auditor");
      ok(AREA_ROLES.reviewer.includes("operator") && AREA_ROLES.reviewer.includes("auditor") && !AREA_ROLES.reviewer.includes("owner" as any) && !AREA_ROLES.reviewer.includes("investor" as any), "halaman review untuk operator dan auditor saja");

      // undangan staf: operator tidak pernah tahu kata sandi
      const sf = await import("../lib/flows/staff");
      const invEmail = `e2e-undangan-${RUN}@selftest.local`;
      await expectErr(sf.createInvite({ email: "r@x", role: "auditor" }, { name: "Calon Auditor", email: invEmail, role: "auditor" }), "Hanya operator", "undangan: reviewer tidak boleh mengundang");
      await expectErr(sf.createInvite({ email: "o@x", role: "operator" }, { name: "Calon", email: "bukan-email", role: "auditor" }), "tidak valid", "undangan: email tidak valid");
      const iv = await sf.createInvite({ email: "o@x", role: "operator" }, { name: "Calon Auditor", email: invEmail, role: "auditor" });
      ok(/^[0-9a-f]{64}$/.test(iv.token) && (await sf.inviteByToken(iv.token))?.role === "auditor", "undangan dibuat; token valid dan hanya hash yang disimpan");
      const { data: raw } = await pf.from("staff_invites").select("token_hash").eq("email", invEmail);
      ok(!JSON.stringify(raw).includes(iv.token), "token utuh tidak tersimpan di database");
      ok((await sf.inviteByToken("0".repeat(64))) === null && (await sf.inviteByToken("salah")) === null, "token salah ditolak");
      await expectErr(sf.acceptInvite(iv.token, "pendek"), "minimal 8", "undangan: kata sandi pendek ditolak");
      ok((await sf.inviteByToken(iv.token)) !== null, "kegagalan sandi pendek tidak menghanguskan undangan");
      const acc = await sf.acceptInvite(iv.token, `Pw-${RUN}-undangan!`);
      createdUserIds.push(((await pf.from("users").select("auth_user_id").eq("email", invEmail).single()).data as any).auth_user_id);
      ok(acc.role === "auditor" && (await staffCount()) === before + 2, "penerima membuat akun dengan kata sandinya sendiri");
      await expectErr(sf.acceptInvite(iv.token, "Sandi-lain-123!"), "tidak valid", "undangan hanya bisa dipakai sekali");
      const iv2 = await sf.createInvite({ email: "o@x", role: "operator" }, { name: "Calon Dua", email: `e2e-kadaluwarsa-${RUN}@selftest.local`, role: "auditor" });
      await pf.from("staff_invites").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("email", `e2e-kadaluwarsa-${RUN}@selftest.local`);
      ok((await sf.inviteByToken(iv2.token)) === null, "undangan kedaluwarsa ditolak");
      await expectErr(sf.createInvite({ email: "o@x", role: "operator" }, { name: "Dobel", email: invEmail, role: "auditor" }), "sudah terdaftar", "undangan ke email yang sudah terdaftar ditolak");
      await pf.from("staff_invites").delete().like("email", `e2e-%${RUN}@selftest.local`);
    }

    // ---------------------------------------------------------------- 2. pengajuan
    const eligibleMonths = [196, 202, 205, 210, 208, 214].map((x) => x * 1_000_000);
    const nowD = new Date();
    const base = {
      company: {
        name: `E2E Arena ${RUN}`, city: "Bandung", area: "Coblong", province: "Jawa Barat", address: "Jl. Uji No. 1", kelurahan: "Dago", postalCode: "40135", landmark: "",
        sports: ["padel", "futsal"], courts: 3, courtSpecs: "Padel 20x10 m rumput sintetis", openHour: 7, closeHour: 23, tariffNote: "Rp180rb/jam",
        facilities: [
          { name: "Padel 1", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: false, pricePerHour: 180_000 },
          { name: "Padel 2", sport: "padel", lengthM: 20, widthM: 10, surface: "rumput sintetis", indoor: true, pricePerHour: 200_000 },
          { name: "Futsal A", sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 250_000 },
        ],
      },
      offering: { target: 150_000_000, minRaise: 100_000_000, unitPrice: 15_000, shareBps: 1000, tenorMonths: 12, useOfFunds: "uji e2e" },
      dossier: {
        leaseMonthsRemaining: 36, monthlyBankInstallment: 10_000_000, bankCovenantForbidsRevenueSale: false, bankConsentLetter: false, activeLandDispute: false, hasNpwp: true, hasBusinessLicense: true, relatedParty: false, relatedPartyNote: "",
        debtOutstanding: 200_000_000, debtRemainingMonths: 24, collateral: "tanah/bangunan", otherPledgedBps: 0, otherPledgeNote: "", monthlyOpex: 60_000_000,
      },
      property: { land: "sewa", building: "sewa", ownedAssetPledged: false },
      lease: { landlord: "PT Lapangan Sejahtera", monthlyRent: 15_000_000, remainingMonths: 36, renewalOption: true, landlordConsentsToSale: true },
      assets: { builtYear: 2020, capexPlan: "", insured: true, insurance: { insurer: "Asuransi Uji", coverage: ["kebakaran", "gangguan_usaha"], sumInsured: 2_000_000_000, validUntil: `${nowD.getUTCFullYear() + 2}-06` } },
      business: {
        operatingSince: `${nowD.getUTCFullYear() - 3}-01`, nib: "1234567890123", npwp: "123456789012345", signatoryName: "Penguji E2E", signatoryTitle: "Direktur",
        owners: [{ name: "Penguji E2E", pct: 100 }], contactEmail: "penguji@selftest.local", contactPhone: "081234567890",
      },
      payout: { bank: "BCA", accountName: `E2E Arena ${RUN}`, accountNumber: "1234567890" },
      consent: { dataProcessing: true, truthful: true },
      revenue: { months: eligibleMonths, breakdown: eligibleMonths.map((g) => ({ gross: g, refund: 0, tax: 0, fee: 0 })), occupancyPct: 60, paymentMix: { gatewayPct: 80, cashPct: 10, transferPct: 10 } },
    };
    // cari harga yang lolos pita (referensi bergantung pada suplai = target / harga)
    let price = 15_000, input: ApplicationInput = ApplicationInput.parse(base);
    for (let i = 0; i < 40; i++) {
      input = ApplicationInput.parse({ ...base, offering: { ...base.offering, unitPrice: price, target: price * 10_000, minRaise: price * 7_000 } });
      const v = verifyReported(input);
      if (v.recommendation === "pass") break;
      price = Math.floor(price * 0.95);
    }
    ok(verifyReported(input).recommendation === "pass", `input uji lolos verifikasi pada harga Rp${price.toLocaleString("id-ID")}`);

    await expectErr(submitApplication(me, input, [{ kind: "lease", file: file("catatan.txt", "text/plain", "x") }]), "tidak didukung", "dokumen berformat salah");
    const { data: leftovers } = await pf.from("venues").select("id").eq("owner_id", me.userId);
    ok((leftovers ?? []).length === 0, "pengajuan gagal tidak meninggalkan baris setengah jadi");

    // dokumen PDF sintetis yang ISINYA konsisten dengan isian (diproses AI sungguhan di bawah)
    const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() + 3);
    const leaseBytes = await makePdf([
      `PERJANJIAN SEWA TEMPAT USAHA\nPara pihak: PT Lapangan Sejahtera (Pemberi Sewa) dan ${input.company.name} (Penyewa).\nJangka waktu sewa berakhir pada tanggal ${end.toISOString().slice(0, 10)}.`,
      "Biaya sewa sebesar Rp 15.000.000 per bulan.",
    ]);
    const bankBytes = await makePdf([`REKENING KORAN\nNama: ${input.company.name}\nNo. Rekening: 1234567890123\nPeriode: 6 bulan terakhir (6 bulan)\nTotal Kredit: Rp 1.360.000.000\nTotal Debit: Rp 1.100.000.000`]);
    const loanBytes = await makePdf(["PERJANJIAN KREDIT MODAL KERJA\nAngsuran per bulan sebesar Rp 10.000.000.\nJaminan: sertifikat tanah dan bangunan atas nama pemilik."]);
    const res = await submitApplication(me, input, [
      { kind: "photo", file: file("depan.png", "image/png", PNG) },
      { kind: "lease", file: file("sewa.pdf", "application/pdf", leaseBytes) },
      { kind: "bank_statement", file: file("mutasi.pdf", "application/pdf", bankBytes) },
      { kind: "loan", file: file("kredit.pdf", "application/pdf", loanBytes) },
      { kind: "sales_data", file: file("penjualan.csv", "", ["bulan,bruto,refund,pajak,fee", ...input.revenue.months.map((m, i) => `2026-0${i + 1},${m},0,0,0`)].join("\n")) },
    ]);
    venueId = res.venueId; seriesId = res.seriesId;
    ok(res.policy.recommendation === "pass" && res.policy.dataSource === "self_reported" && res.policy.warnings.some((w: string) => w.includes("dilaporkan owner")), `verifikasi otomatis: lolos, skor ${res.policy.score}, sumber dilaporkan owner + peringatan`);

    const { data: venue } = await pf.from("venues").select("*").eq("id", venueId).single();
    {
      const { data: sd } = await pf.from("documents").select("kind, original_name").eq("venue_id", venueId).eq("kind", "sales_data");
      ok((sd ?? []).length === 1, "file data penjualan (CSV) tersimpan sebagai dokumen bukti");
    }
    ok(venue!.status === "verifying" && venue!.pos_company_id === null, "status verifying; belum ada workspace PoS (sesuai: akun PoS setelah disetujui)");
    ok(venue!.disclosure?.sensitive?.address === "Jl. Uji No. 1" && venue!.disclosure?.sensitive?.postalCode === "40135" && !JSON.stringify(venue!.company_info).includes("Jl. Uji") && !JSON.stringify(venue!.disclosure.public).includes("40135"), "alamat persis hanya di bagian sensitif disclosure (tidak bocor ke company_info maupun bagian publik)");
    {
      const { data: pv } = await pf.from("venue_private").select("data").eq("venue_id", venueId).single();
      const pubJson = JSON.stringify(venue!.disclosure.public) + JSON.stringify(venue!.company_info) + JSON.stringify(venue!.disclosure.sensitive);
      ok(pv!.data.payout.accountNumber === "1234567890" && pv!.data.business.nib === "1234567890123", "identitas usaha dan rekening tersimpan di tabel privat");
      ok(!pubJson.includes("1234567890") && !pubJson.includes("penguji@selftest.local") && !pubJson.includes("Penguji E2E"), "identitas, rekening, dan kontak TIDAK ada di disclosure maupun company_info");
      ok((venue!.disclosure.public.profile.facilities as any[]).length === 3 && venue!.disclosure.public.performance.paymentMix.gatewayPct === 80, "daftar lapangan dan porsi pembayaran tampil di bagian publik");
    }
    ok(disclosureHash(venue!.disclosure) === venue!.disclosure_hash, "hash disclosure pack konsisten dengan isi tersimpan");
    const { data: run } = await pf.from("verification_runs").select("*").eq("series_id", seriesId).single();
    ok(run!.disclosure_hash === venue!.disclosure_hash && run!.data_source === "self_reported", "hasil verifikasi mengikat hash halaman penawaran");
    const { data: docs } = await pf.from("documents").select("*").eq("venue_id", venueId);
    ok((docs ?? []).length === 5, `5 dokumen tercatat (${(docs ?? []).map((d) => d.kind).join(", ")})`);
    const lease = docs!.find((d) => d.kind === "lease")!;
    ok(lease.sha256 === createHash("sha256").update(Buffer.from(leaseBytes)).digest("hex"), "sha256 dokumen sesuai isi file");
    ok(!!(await signedUrl(lease.storage_path, 60)), "dokumen bisa dibuka lewat URL bertanda tangan");
    const { data: s0 } = await pf.from("series").select("*").eq("id", seriesId).single();
    ok(s0!.token_symbol && s0!.token_symbol.length <= 5 && s0!.contract_address === null, `seri dibuat (simbol ${s0!.token_symbol}), kontrak belum dideploy`);

    // ---------------------------------------------------------------- 2b. analisis AI dokumen (gateway LLM sungguhan)
    {
      const { analyzeVenueDocuments } = await import("../lib/flows/documents");
      const r = await analyzeVenueDocuments(venueId);
      ok(r.ok, `analisis AI dokumen selesai${r.ok ? "" : `: ${(r as any).reason}`}`);
      if (r.ok) {
        const st = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
        ok(st.lease === "pass" && st.installment === "pass" && st.bank === "pass", `isian cocok dengan isi dokumen: ${JSON.stringify(st)}`);
        const { data: v2 } = await pf.from("venues").select("ai_status, ai_report").eq("id", venueId).single();
        ok(v2!.ai_status === "done" && v2!.ai_report.checks.length >= 3, "laporan AI tersimpan di pengajuan");
        const { data: runs } = await pf.from("verification_runs").select("gates, recommendation").eq("series_id", seriesId).order("created_at", { ascending: false });
        ok((runs ?? []).length >= 2 && (runs![0]!.gates as any).gates.some((g: any) => g.id === "docs" && g.pass), "verifikasi ulang otomatis memuat gerbang konsistensi dokumen (lolos)");
        const { data: dx } = await pf.from("documents").select("kind, extraction_status, extraction").eq("venue_id", venueId).eq("kind", "lease").single();
        if (!["ok", "partial"].includes(dx!.extraction_status)) { const { data: all } = await pf.from("documents").select("kind, extraction_status, extraction_note").eq("venue_id", venueId); console.log("  [diagnosa dokumen]", JSON.stringify(all)); }
        ok(["ok", "partial"].includes(dx!.extraction_status) && (dx!.extraction as any).lease_end_date?.verified === true, "ekstraksi sewa tersimpan dengan kutipan terverifikasi");
      }
    }

    // ---------------------------------------------------------------- 3. deploy seri
    let ctx = await flowMod.getCtx(seriesId);
    await expectErr(att.createDraft(ctx), "belum dideploy", "attestation sebelum kontrak ada");
    await expectErr(series.deploySeries(ctx), "belum disetujui", "deploy sebelum review disetujui");
    await expectErr((await import("../lib/flows/review")).decideReview(ctx, { email: "inv@x", role: "investor" }, "approved", "", { kind: "message", at: new Date().toISOString(), signature: "0x" }), "Hanya staf", "non-staf tidak boleh memutuskan review");
    await expectErr((await import("../lib/flows/review")).decideReview(ctx, { email: "rv@x", role: "auditor" }, "rejected", "pendek", { kind: "message", at: new Date().toISOString(), signature: "0x" }), "minimal 10", "penolakan tanpa alasan memadai");
    {
      const rv = await import("../lib/flows/review");
      ok(rv.tally([]) === "pending" && rv.tally([{ voter_role: "operator", decision: "approved" }]) === "pending" && rv.tally([{ voter_role: "auditor", decision: "approved" }]) === "pending", "satu suara setuju saja belum cukup");
      ok(rv.tally([{ voter_role: "operator", decision: "approved" }, { voter_role: "auditor", decision: "approved" }]) === "approved", "operator + auditor setuju = disetujui");
      ok(rv.tally([{ voter_role: "operator", decision: "approved" }, { voter_role: "auditor", decision: "rejected" }]) === "rejected", "satu penolakan = ditolak (veto)");
      await expectErr(vote(ctx, "aud@x", "auditor", "approved", "dokumen cocok", 0), "bukan wallet Signer 3", "suara auditor dari wallet tim ditolak");
      await expectErr(vote(ctx, "op@x", "operator", "approved", "tim setuju", 2), "bukan wallet Signer 1 atau 2", "suara operator dari wallet auditor ditolak");
      {
        const at = new Date().toISOString();
        const sig = await signerKey(2).signMessage({ message: reviewMessage({ seriesId: ctx.series.id, email: "aud@x", role: "auditor", decision: "approved", note: "x", at }) });
        await expectErr(rv.decideReview(ctx, { email: "aud@x", role: "auditor" }, "rejected", "ditukar jadi menolak oleh klien", { kind: "message", at, signature: sig }), "bukan wallet", "tanda tangan untuk putusan lain tidak bisa dipakai ulang");
      }
      const m1 = await vote(ctx, "aud@x", "auditor", "approved", "dokumen cocok", 2);
      ok(/menunggu persetujuan operator/.test(m1), `suara auditor tercatat, review belum selesai (${m1.slice(0, 70)}…)`);
      {
        // alamat kontrak diprediksi dari nonce wallet operator; transaksi lain dari wallet itu menggeser prediksi, jadi persetujuan lama diulang
        const opWallet = createWalletClient({ account: privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as Hex), chain: chainMod.chain, transport: http(chainMod.rpcUrl) });
        await chainMod.publicClient.waitForTransactionReceipt({ hash: await opWallet.sendTransaction({ to: opWallet.account.address, value: 0n }) });
        const prep = await (await import("../lib/flows/review")).prepareApproval(ctx, { email: "op@x", role: "operator" });
        const { data: left } = await pf.from("review_votes").select("voter_email").eq("series_id", ctx.series.id);
        ok(/berubah/.test(prep.notice) && (left ?? []).length === 0, "nonce operator bergeser: persetujuan lama diulang, bukan dipakai dengan alamat salah");
      }
      await vote(ctx, "aud@x", "auditor", "approved", "setuju lagi", 2);
      ctx = await flowMod.getCtx(ctx.series.id);
      ok(ctx.series.review_status === "pending", "auditor menandatangani ulang; belum cukup tanpa operator");
      await expectErr(series.deploySeries(ctx), "belum disetujui", "deploy dengan satu suara saja ditolak");
      const m2 = await vote(ctx, "op@x", "operator", "approved", "tim setuju", 0);
      ok(/Attestation tercatat/.test(m2), `operator + auditor setuju: kontrak otomatis dideploy dan attestation otomatis dikirim (${m2.slice(0, 90)}…)`);
      ctx = await flowMod.getCtx(ctx.series.id);
      await expectErr(vote(ctx, "op@x", "operator", "rejected", "terlambat sekali menolak", 0), "sudah dideploy", "suara setelah review selesai ditolak");
    }
    await expectErr(series.deploySeries(ctx), "sudah dideploy", "deploy manual setelah deploy otomatis ditolak");
    const dep = { series: ctx.ref!.series };
    ctx = await flowMod.getCtx(seriesId);
    ok(!!ctx.ref && ctx.ref.series.toLowerCase() === dep.series.toLowerCase(), `kontrak seri dideploy ${dep.series.slice(0, 10)}…`);
    {
      const sent = await (await import("../lib/attest")).lastSubmitted(ctx.series.id);
      ok(!!sent?.submitted_tx && (sent.signatures as any[]).length === 2 && (await currentDraft(ctx.series.id)) === null, "attestation terkirim otomatis dengan 2 tanda tangan reviewer (tanpa tanda tangan ulang)");
    }
    ok(((await chainMod.publicClient.readContract({ address: ctx.ref!.series, abi: chainMod.seriesAbi, functionName: "token" })) as string).toLowerCase() === ctx.ref!.token.toLowerCase(), "alamat token tersimpan = token() kontrak (dihitung dari nonce)");
    let info = await chainMod.readSeries(ctx.ref!);
    ok(info.state === "Offering" && Number(info.cap) === 10_000 && Number(info.minRaise) === price * 7_000 && info.shareBps === 1000, `parameter on-chain sesuai pengajuan (cap ${info.cap}, minRaise Rp${Number(info.minRaise).toLocaleString("id-ID")})`);
    await expectErr(series.deploySeries(ctx), "sudah dideploy", "deploy ganda");

    // ---------------------------------------------------------------- 4. attestation 2-dari-3 -> akun PoS
    ctx = await flowMod.getCtx(seriesId);
    info = await chainMod.readSeries(ctx.ref!);
    ok(info.attValid, "attestation valid on-chain setelah kuorum 2-dari-3");
    ok(!!ctx.companyId && ctx.venue.status === "active", "persetujuan membuat workspace PoS dan penawaran aktif");
    const { data: member } = await pos.from("members").select("role, user_id").eq("company_id", ctx.companyId!).single();
    ok(member!.role === "owner" && member!.user_id === au.user.id, "owner pemohon = owner workspace PoS (akun yang sama)");
    {
      const { data: prods } = await pos.from("products").select("name, category, price, session_minutes").eq("company_id", ctx.companyId!).order("name");
      ok((prods ?? []).length === 3 && prods!.some((p) => p.name === "Futsal A" && Number(p.price) === 250_000 && p.category === "futsal"), "produk awal PoS dibuat dari daftar lapangan yang diisi owner");
    }
    companyId = ctx.companyId!;
    ok((await prov.provisionPos(ctx)).created === false, "provisioning idempoten");

    // ---------------------------------------------------------------- 5. penawaran
    info = await chainMod.readSeries(ctx.ref!);
    ok(info.state === "Offering", "penawaran dibuka otomatis setelah attestation (kontrak memeriksa attestation & harga maksimal)");
    await expectErr(inv.purchase(ctx, investors[0]!.address, 4000), "Selesaikan KYC", "beli sebelum KYC");
    for (const a of investors) await kyc(ctx, a);
    await inv.purchase(ctx, investors[0]!.address, 4000); await inv.purchase(ctx, investors[1]!.address, 3000);
    await expectErr(inv.purchase(ctx, investors[2]!.address, 4000), "Melebihi cap", "beli melebihi suplai");
    await expectErr(series.closeOffering(ctx), "belum bisa ditutup", "tutup penawaran sebelum waktunya");
    await inv.purchase(ctx, investors[2]!.address, 3000);
    info = await chainMod.readSeries(ctx.ref!);
    ok(info.minted === info.cap && info.raised === info.target, `terjual habis: Rp${Number(info.raised).toLocaleString("id-ID")} (cap ${info.cap})`);
    const closedMsg = await series.closeIfSoldOut(ctx.series.id);
    ok(!!closedMsg && /Funded/.test(closedMsg), `terjual habis: penawaran tertutup otomatis (${String(closedMsg).slice(0, 60)}…)`);
    ok((await series.closeIfSoldOut(ctx.series.id)) === null, "penutupan otomatis aman dipanggil ulang (tidak menutup dua kali)");
    info = await chainMod.readSeries(ctx.ref!);
    ok(info.state === "Funded" && info.S === info.cap, "Cara 1: minimum tercapai → Funded, suplai terkunci");
    await expectErr(inv.purchase(ctx, investors[0]!.address, 1), "tidak sedang dibuka", "beli setelah penawaran ditutup");

    await series.releaseTranche(ctx, 1);
    info = await chainMod.readSeries(ctx.ref!);
    ok(info.state === "Active" && info.released === info.raised / 2n, "rilis tahap 1 = 50% dari dana terkumpul");
    const { data: cl } = await pf.from("custody_ledger").select("account, amount").eq("series_id", seriesId);
    const sumAcc = (a: string) => (cl ?? []).filter((c) => c.account === a).reduce((x, c) => x + Number(c.amount), 0);
    ok(sumAcc("escrow") === Number(info.raised) / 2 && sumAcc("owner") === Number(info.raised) / 2, "kustodian simulasi: escrow berkurang 50%, owner bertambah 50%");

    // ---------------------------------------------------------------- 6. omzet PoS -> kantong
    const { data: prod } = await pos.from("products").insert({ company_id: companyId, name: "Lapangan Uji", category: "padel", open_hour: 7, close_hour: 22, session_minutes: 60, price: 200000 }).select("id").single();
    let prev: Hex = ZERO_HASH;
    const addEntries = async (rows: { type: string; amount: number; bookingId: string | null }[]) => {
      const out = rows.map((r, i) => {
        const base = { id: `le_e2e_${RUN}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`, companyId, type: r.type, amount: r.amount, bookingId: r.bookingId, createdAt: new Date().toISOString() };
        const hash = ledgerEntryHash(prev, base as any);
        const row = { id: base.id, company_id: companyId, type: r.type, amount: r.amount, booking_id: r.bookingId, created_at: base.createdAt, prev_hash: prev, hash };
        prev = hash; return row;
      });
      const { error } = await pos.from("ledger_entries").insert(out); if (error) throw new Error(error.message);
    };
    let n = 0;
    const sale = async (amount: number, settled: boolean, ref = `ref-${RUN}-${n}`, method = "gateway") => {
      const id = `bk_e2e_${RUN}_${++n}`;
      const slot = new Date(Date.UTC(2031, 0, 1, n % 20, 0, 0) + n * 86_400_000);
      await pos.from("bookings").insert({ id, company_id: companyId, product_id: prod!.id, slot_start: slot.toISOString(), slot_end: new Date(slot.getTime() + 3_600_000).toISOString(), status: "paid", customer_ref: `0x${createHash("sha256").update(ref).digest("hex")}`, customer_label: "Uji", amount, payment_method: method });
      if (settled) await pos.from("payments").insert({ id: `pay_e2e_${RUN}_${n}`, company_id: companyId, booking_id: id, psp_ref: `SIM-E2E-${RUN}-${n}`, pay_token: `e2e-${RUN}-${n}-${Math.random().toString(36).slice(2)}`, status: "settled", gross: amount, fee: Math.round(amount * 0.007), settled_at: new Date().toISOString() });
      await addEntries(settled ? [{ type: "sale", amount, bookingId: id }, { type: "tax", amount: Math.round(amount / 11), bookingId: id }, { type: "fee", amount: Math.round(amount * 0.007), bookingId: id }] : [{ type: "sale", amount, bookingId: id }]);
    };
    await new Promise((r) => setTimeout(r, 1100)); // pastikan setelah penanda awal periode
    await expectErr(series.finalizePeriod(ctx), "Belum ada akrual", "finalisasi tanpa omzet");
    const sales = [200_000, 300_000, 200_000, 300_000, 200_000];
    for (const a of sales) await sale(a, true);
    const eligible = sales.reduce((x, a) => x + a - Math.round(a / 11) - Math.round(a * 0.007), 0);
    const expected = Math.floor((eligible * 1000) / 10_000);
    await series.finalizePeriod(ctx);
    info = await chainMod.readSeries(ctx.ref!);
    ok(Number(info.P) === expected && Number(info.lastPeriod) === 1, `kantong P = 10% × Eligible Revenue = Rp${expected.toLocaleString("id-ID")} (dihitung independen)`);
    ok(BigInt(info.redeemValue) === BigInt(info.P) / BigInt(info.S), `nilai tebus/token = P/S = Rp${info.redeemValue}`);
    await expectErr(series.releaseTranche(ctx, 2), "terekonsiliasi bersih", "tahap 2 sebelum rekonsiliasi");
    await series.reconcilePeriod(ctx);
    await series.releaseTranche(ctx, 2);
    info = await chainMod.readSeries(ctx.ref!);
    ok(info.released === info.raised && info.tranche2Released, "periode 1 bersih → rilis tahap 2 (seluruh dana)");

    // ---------------------------------------------------------------- 6b. kirim token antar pemegang ber-KYC
    {
      const bal = async (a: string) => (await chainMod.publicClient.readContract({ address: ctx.ref!.token, abi: chainMod.tokenAbi, functionName: "balanceOf", args: [a as Hex] })) as bigint;
      const from = investors[2]!, to = investors[1]!;
      const supply0 = (await chainMod.readSeries(ctx.ref!)).totalSupply;
      const [bf0, bt0] = [await bal(from.address), await bal(to.address)];
      const tnonce = async () => (await chainMod.publicClient.readContract({ address: ctx.ref!.series, abi: chainMod.seriesAbi, functionName: "transferNonce", args: [from.address] })) as bigint;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const signFor = async (toAddr: Hex, units: bigint, nonce: bigint) => from.signTypedData({ domain: eip.seriesDomain(ctx.ref!.series) as any, types: eip.transferTypes as any, primaryType: "TransferRequest", message: { series: ctx.ref!.series, from: from.address, to: toAddr, units, nonce, deadline } });
      const stranger = "0x00000000000000000000000000000000000000ab" as Hex;
      await expectErr(inv.transferSigned(ctx, from.address, stranger, 100n, deadline, await signFor(stranger, 100n, await tnonce())), "belum lolos KYC", "kirim token ke wallet tanpa KYC");
      const sig = await signFor(to.address, 500n, await tnonce());
      await expectErr(inv.transferSigned(ctx, from.address, to.address, 500n, deadline, await signFor(to.address, 500n, 99n)), "tanda tangan tidak valid", "kirim token dengan nonce salah");
      await inv.transferSigned(ctx, from.address, to.address, 500n, deadline, sig);
      ok((await bal(from.address)) === bf0 - 500n && (await bal(to.address)) === bt0 + 500n, "token berpindah 500 antar pemegang ber-KYC");
      ok((await chainMod.readSeries(ctx.ref!)).totalSupply === supply0, "suplai tidak berubah oleh transfer (akuntansi kantong utuh)");
      await expectErr(inv.transferSigned(ctx, from.address, to.address, 500n, deadline, sig), "tanda tangan tidak valid", "replay tanda tangan kirim token");
      await expectErr(inv.transferSigned(ctx, from.address, from.address, 1n, deadline, sig), "sendiri", "kirim ke diri sendiri");
      const { data: tr } = await pf.from("token_transfers").select("units").eq("series_id", seriesId);
      ok((tr ?? []).length === 1 && Number(tr![0]!.units) === 500, "transfer tercatat di database");
    }

    // ---------------------------------------------------------------- 7. redeem
    const before = await chainMod.readSeries(ctx.ref!);
    {
      const holder = investors[0]!;
      const nonce = (await chainMod.publicClient.readContract({ address: ctx.ref!.series, abi: chainMod.seriesAbi, functionName: "redeemNonce", args: [holder.address] })) as bigint;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const sig = await holder.signTypedData({ domain: eip.seriesDomain(ctx.ref!.series) as any, types: eip.redeemTypes as any, primaryType: "RedeemRequest", message: { series: ctx.ref!.series, holder: holder.address, units: 1000n, nonce, deadline } });
      await expectErr(inv.requestRedeemSigned(ctx, investors[1]!.address, 1000n, deadline, sig), "tanda tangan tidak valid", "redeem dengan tanda tangan milik orang lain");
      await inv.requestRedeemSigned(ctx, holder.address, 1000n, deadline, sig);
      await expectErr(inv.requestRedeemSigned(ctx, holder.address, 1000n, deadline, sig), "tanda tangan tidak valid", "replay tanda tangan redeem yang sama");
    }
    const rid = BigInt(before.nextRedeemId) + 1n;
    await series.approveRedeem(ctx, rid);
    const afterApprove = await chainMod.readSeries(ctx.ref!);
    const payout = (1000n * (BigInt(before.P) - BigInt(before.R))) / BigInt(before.S);
    ok(BigInt(afterApprove.R) - BigInt(before.R) === payout && BigInt(afterApprove.S) === BigInt(before.S) - 1000n, `payout = floor(1000 × (P−R)/S) = Rp${payout} (dibulatkan ke bawah); R naik, S turun`);
    await series.confirmRedeem(ctx, rid);
    const afterPay = await chainMod.readSeries(ctx.ref!);
    ok(afterPay.totalSupply === before.totalSupply - 1000n && afterPay.R <= afterPay.P, "token dibakar setelah kustodian membayar; R ≤ P");
    const { data: rr } = await pf.from("redeem_requests").select("status, payout").eq("onchain_id", Number(rid)).eq("series_id", seriesId).single();
    ok(rr!.status === "paid" && Number(rr!.payout) === Number(payout), "catatan redeem di database = paid");

    // ---------------------------------------------------------------- 8. fraud pada periode berikutnya
    await new Promise((r) => setTimeout(r, 1100));
    await sale(200_000, true);
    for (let i = 0; i < 4; i++) await sale(300_000, false, "ghost-customer");
    await sale(150_000, false, "cash-one");
    await series.finalizePeriod(ctx);
    const msg2 = await series.reconcilePeriod(ctx);
    const { data: exc } = await pf.from("recon_exceptions").select("kind, amount").eq("series_id", seriesId);
    const kinds = (exc ?? []).map((e) => e.kind);
    ok(kinds.includes("fictitious_booking") && kinds.includes("cash_outside_system") && msg2.includes("exception"), `rekonsiliasi menangkap fraud: ${kinds.join(", ")}`);
    ok(Number((await chainMod.readSeries(ctx.ref!)).P) === expected + Math.floor(((200_000 - Math.round(200_000 / 11) - Math.round(200_000 * 0.007)) * 1000) / 10_000), "penjualan tanpa settlement TIDAK ikut masuk kantong investor");

    // ---------------------------------------------------------------- 8b. tunai tercatat (di luar jalur) dan cakupan terverifikasi
    {
      const { runVerification } = await import("../lib/stats");
      const { data: v } = await pf.from("venues").select("*").eq("id", venueId).single();
      const proposed = { target: Number(ctx.series.target), unitPrice: Number(ctx.series.unit_price), shareBps: ctx.series.share_bps, tenorDays: ctx.series.tenor_days };
      const before = await runVerification(pos, companyId, new Date(), v!.dossier, proposed);
      await sale(180_000, false, "cash-two", "cash");
      await sale(180_000, false, "qris-sendiri-one", "qris_sendiri");
      const after = await runVerification(pos, companyId, new Date(), v!.dossier, proposed);
      const cov = after.policy.gates.find((g: any) => g.id === "coverage");
      ok(!!cov, `gerbang cakupan terverifikasi muncul untuk data PoS (${cov?.detail})`);
      ok(after.recon.exceptions.length === before.recon.exceptions.length, "tunai/QRIS sendiri yang dicatat BUKAN exception baru (tidak dituduh fraud)");
      ok(after.recon.coverage < before.recon.coverage, `cakupan turun karena pembayaran di luar gateway (${(before.recon.coverage * 100).toFixed(0)}% → ${(after.recon.coverage * 100).toFixed(0)}%)`);
    }

    // ---------------------------------------------------------------- 8c. staf menjelaskan exception → periode dikonfirmasi bersih
    {
      await expectErr(series.confirmPeriodClean(ctx), "belum dijelaskan", "konfirmasi bersih sebelum exception dijelaskan");
      await expectErr(series.explainException(ctx, "00000000-0000-4000-8000-000000000000", "staf@uji", "pendek"), "minimal 10", "penjelasan terlalu pendek");
      const { data: open } = await pf.from("recon_exceptions").select("id").eq("series_id", seriesId).eq("explained", false);
      for (const e of open ?? []) await series.explainException(ctx, e.id, "staf@uji", "Pembayaran tunai sah, bukti kas harian sudah diperiksa auditor");
      await series.confirmPeriodClean(ctx);
      const isClean = (await chainMod.publicClient.readContract({ address: ctx.ref!.series, abi: chainMod.seriesAbi, functionName: "periodClean", args: [2n] })) as boolean;
      ok(isClean, "periode 2 dikonfirmasi bersih on-chain setelah semua exception dijelaskan");
      const msgRoots = await series.computeMissingRoots(ctx);
      ok(typeof msgRoots === "string" && msgRoots.toLowerCase().includes("root"), `hash harian: ${msgRoots}`);
    }

    // ---------------------------------------------------------------- 8d. owner menarik dana
    {
      const avail = await series.ownerAvailable(ctx);
      ok(avail === Number((await chainMod.readSeries(ctx.ref!)).raised), `saldo owner = seluruh dana yang dirilis (Rp${avail.toLocaleString("id-ID")})`);
      await expectErr(series.ownerWithdraw(ctx, me.userId, avail + 1), "Saldo tersedia", "tarik melebihi saldo");
      await series.ownerWithdraw(ctx, me.userId, 50_000_000);
      ok((await series.ownerAvailable(ctx)) === avail - 50_000_000, "penarikan Rp50 juta mengurangi saldo owner");
      const { data: po } = await pf.from("owner_payouts").select("amount").eq("series_id", seriesId);
      ok((po ?? []).length === 1 && Number(po![0]!.amount) === 50_000_000, "penarikan tercatat di owner_payouts");
    }

    // ---------------------------------------------------------------- 9. veto
    {
      const acct = signerKey(2);
      const wallet = createWalletClient({ account: acct, chain: chainMod.chain, transport: http(chainMod.rpcUrl) });
      const { request } = await chainMod.publicClient.simulateContract({ account: acct, address: chainMod.ADDR.attestation, abi: chainMod.attestationAbi, functionName: "revoke", args: [ctx.ref!.series, "0x" + "ab".repeat(32) as Hex] });
      await chainMod.publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
    }
    ok(!(await chainMod.readSeries(ctx.ref!)).attValid, "satu penandatangan mencabut → attestation tidak valid lagi");

    // ---------------------------------------------------------------- 10. penawaran GAGAL → refund penuh
    {
      const input2 = ApplicationInput.parse({ ...base, company: { ...base.company, name: `E2E Gagal ${RUN}` }, offering: { ...base.offering, unitPrice: price, target: price * 10_000, minRaise: price * 7_000 } });
      const lease2 = await makePdf(["PERJANJIAN SEWA\nBerakhir pada tanggal 2030-01-01."]);
      const r2 = await submitApplication(me, input2, [
        { kind: "lease", file: file("sewa2.pdf", "application/pdf", lease2) },
        { kind: "bank_statement", file: file("mutasi2.pdf", "application/pdf", lease2) },
      ]);
      extraVenues.push(r2.venueId); extraSeries.push(r2.seriesId);
      let c2 = await flowMod.getCtx(r2.seriesId);
      c2 = await flowMod.getCtx(r2.seriesId); await vote(c2, "aud@x", "auditor", "approved", "uji", 2); await vote(c2, "op@x", "operator", "approved", "uji", 0); c2 = await flowMod.getCtx(r2.seriesId);
      c2 = await flowMod.getCtx(r2.seriesId);
      const small = 1000;
      await inv.purchase(c2, investors[0]!.address, small);
      {
        // pembelian lewat payment gateway (PSP palsu): token baru di-mint setelah gateway menyatakan PAID, dan hanya sekali
        const pay = await import("../lib/flows/payment");
        let paid = false;
        const fake = { createInvoice: async (i: any) => ({ pspRef: `INV-${i.reference}`, checkoutUrl: `https://pay.test/${i.reference}` }), status: async () => (paid ? ("paid" as const) : ("pending" as const)) };
        const bal = async () => (await chainMod.publicClient.readContract({ address: c2.ref!.token, abi: chainMod.tokenAbi, functionName: "balanceOf", args: [investors[0]!.address] })) as bigint;
        const before = await bal();
        const sp = await pay.startPurchase(c2, investors[0]!.address, 5, "http://localhost:3000", fake);
        ok(sp.url.startsWith("https://pay.test/") && (await bal()) === before, "tagihan gateway dibuat; token BELUM di-mint sebelum dibayar");
        ok((await pay.settlePurchase(sp.id, fake)) === "pending" && (await bal()) === before, "belum dibayar: tetap menunggu, tidak ada token");
        paid = true;
        const rs = await Promise.allSettled([pay.settlePurchase(sp.id, fake), pay.settlePurchase(sp.id, fake)]);
        ok((await bal()) === before + 5n, "gateway PAID: tepat 5 token di-mint walau diselesaikan bersamaan");
        ok((await pay.settlePurchase(sp.id, fake)) === "minted" && (await bal()) === before + 5n && rs.some((r) => r.status === "fulfilled"), "menyelesaikan ulang pembelian yang sama tidak mint dua kali");
        const { data: row } = await pf.from("purchases").select("status, mint_tx").eq("id", sp.id).single();
        ok(row!.status === "minted" && !!row!.mint_tx, "status pembelian = minted dan tx tercatat");
      }
      await expectErr(inv.requestRedeemSigned(c2, investors[0]!.address, 1n, 1n, "0x" as Hex), "", "redeem sebelum penawaran berhasil");
      await expectErr((await import("../lib/flows/series")).refundHolder(c2, investors[0]!.address), "hanya tersedia bila penawaran gagal", "refund sebelum penawaran gagal");
      // majukan waktu chain melewati masa penawaran (anvil), lalu tutup: minimum raise tidak tercapai
      await chainMod.publicClient.request({ method: "evm_increaseTime" as any, params: [8 * 86_400] as any });
      await chainMod.publicClient.request({ method: "evm_mine" as any, params: [] as any });
      await series.closeOffering(c2);
      const failedInfo = await chainMod.readSeries(c2.ref!);
      ok(failedInfo.state === "Failed", "Cara 1: minimum raise tidak tercapai → Failed");
      await expectErr(series.releaseTranche(c2, 1), "status seri tidak sesuai", "rilis dana pada seri gagal");
      await series.refundHolder(c2, investors[0]!.address);
      const bal = (await chainMod.publicClient.readContract({ address: c2.ref!.token, abi: chainMod.tokenAbi, functionName: "balanceOf", args: [investors[0]!.address] })) as bigint;
      ok(bal === 0n, "refund: token investor dibakar");
      const { data: pu } = await pf.from("purchases").select("refunded_at, refund_tx").eq("series_id", r2.seriesId);
      ok((pu ?? []).every((x) => x.refunded_at && x.refund_tx), "refund tercatat di database");
      const { data: cl2 } = await pf.from("custody_ledger").select("account, amount").eq("series_id", r2.seriesId);
      const sum2 = (a: string) => (cl2 ?? []).filter((c) => c.account === a).reduce((x, c) => x + Number(c.amount), 0);
      const refunded = (small + 5) * price; // `small` token simulasi + 5 token dari uji pembelian lewat gateway (PSP palsu) di seri yang sama
      ok(sum2("refund") === refunded && sum2("escrow") === 0, `kustodian: escrow kembali nol, refund Rp${refunded.toLocaleString("id-ID")} (termasuk pembelian lewat gateway)`);
      await expectErr(series.refundHolder(c2, investors[0]!.address), "Tidak ada token", "refund dua kali");
    }
  } finally {
    // ---------------------------------------------------------------- bersih-bersih (baris platform & file; ledger PoS bersifat append-only dan dibiarkan)
    for (const sid of [...extraSeries]) for (const t of ["custody_ledger", "purchases", "redeem_requests", "pool_periods", "recon_exceptions", "attestations", "verification_runs", "owner_payouts"]) await pf.from(t).delete().eq("series_id", sid);
    for (const vid of extraVenues) { const { data: dd } = await pf.from("documents").select("storage_path").eq("venue_id", vid); if (dd?.length) await pf.storage.from("documents").remove(dd.map((d) => d.storage_path)); await pf.from("documents").delete().eq("venue_id", vid); }
    for (const sid of extraSeries) await pf.from("series").delete().eq("id", sid);
    for (const vid of extraVenues) await pf.from("venues").delete().eq("id", vid);
    if (seriesId) for (const t of ["custody_ledger", "purchases", "redeem_requests", "pool_periods", "recon_exceptions", "attestations", "verification_runs", "owner_payouts"]) await pf.from(t).delete().eq("series_id", seriesId);
    if (venueId) {
      const { data: docs } = await pf.from("documents").select("storage_path").eq("venue_id", venueId);
      if (docs?.length) await pf.storage.from("documents").remove(docs.map((d) => d.storage_path));
      await pf.from("documents").delete().eq("venue_id", venueId);
    }
    if (seriesId) await pf.from("series").delete().eq("id", seriesId);
    if (venueId) await pf.from("venues").delete().eq("id", venueId);
    await pf.from("users").delete().eq("id", me.userId);
    if (staffAuthId) { await pf.from("users").delete().eq("auth_user_id", staffAuthId); await pf.auth.admin.deleteUser(staffAuthId); }
    await pf.from("users").delete().like("email", `e2e-undangan-${RUN}@selftest.local`);
    for (const id of createdUserIds) await pf.auth.admin.deleteUser(id);
    console.log(failed === 0 ? "\nSEMUA LULUS" : `\n${failed} GAGAL`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
