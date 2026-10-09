import { chatFn, compareWithForm, evaluatePolicy, extractDocument, llmFromEnv, type DocCheck, type DocKind, type Extraction } from "@venue-rwa/verification";
import { extractText, getDocumentProxy } from "unpdf";
import { platformDb } from "../db";
import { audit, getCtx, type Ctx } from "../flow";
import { BUCKET } from "../storage";
import { isImage, ocrImage, ocrPdf } from "../ocr";
import { saveRun } from "../verify";
import { insuranceMonthsLeft } from "@venue-rwa/shared";
import { currentSeriesOf } from "./reprice";

const ANALYZABLE: DocKind[] = ["lease", "bank_statement", "loan", "tax", "license"];

/** Teks per halaman dari PDF. PDF tanpa lapisan teks (hasil pindai) di-OCR; lapisan teks tetap dipakai bila ada. */
export async function pdfPages(buf: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  if (pages.some((p) => p.replace(/\s/g, "").length > 40)) return pages;
  return ocrPdf(buf);
}

/** Teks per halaman: PDF (lapisan teks atau OCR) dan gambar (OCR). Teks hasil OCR diperlakukan sama seperti teks lain (redaksi, validasi kutipan). */
async function pagesOf(path: string, mime: string): Promise<string[]> {
  const name = path;
  const pdf = /pdf/i.test(mime) || /\.pdf$/i.test(name);
  if (!pdf && !isImage(name, mime) && !isImage(mime, "")) return [];
  const { data, error } = await platformDb().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Gagal mengunduh dokumen: ${error?.message}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  return pdf ? pdfPages(bytes) : [await ocrImage(bytes)];
}

/** Asuransi dari pengungkapan: null = tidak diasuransikan, undefined = pengajuan lama tanpa data. */
export function insuranceOf(venue: any): { monthsLeft: number; coverage: string[] } | null | undefined {
  const prof = venue.disclosure?.public?.profile;
  if (!prof || prof.insured === undefined) return undefined;
  return prof.insurance ? { monthsLeft: insuranceMonthsLeft(prof.insurance.validUntil), coverage: prof.insurance.coverage } : null;
}

/** Fakta dari isian owner yang dibandingkan dengan isi dokumen. */
export function formFacts(venue: any) {
  return {
    companyName: String(venue.name).replace(/\s*\(.*?\)\s*$/, ""),
    leaseMonthsRemaining: Number(venue.dossier?.leaseMonthsRemaining?.value ?? 0),
    monthlyBankInstallment: Number(venue.dossier?.monthlyBankInstallment?.value ?? 0),
    bankCovenantForbidsRevenueSale: !!venue.dossier?.bankCovenantForbidsRevenueSale,
    reportedMonthlyRevenue: (venue.reported_revenue?.months ?? []) as number[],
  };
}

/**
 * Analisis AI atas dokumen pengajuan. AI hanya mengekstrak angka bersitasi; keputusan tetap dari aturan deterministik.
 * Teks disamarkan (NIK, rekening, telepon, email) sebelum keluar dari server; gambar tidak pernah dikirim ke model.
 */
export async function analyzeVenueDocuments(venueId: string, opts: { rerunVerification?: boolean } = {}) {
  const pf = platformDb();
  const { data: venue } = await pf.from("venues").select("*").eq("id", venueId).single();
  if (!venue) throw new Error("Pengajuan tidak ditemukan");
  await pf.from("venues").update({ ai_status: "running" }).eq("id", venueId);
  try {
    const cfg = llmFromEnv();
    const { data: docs } = await pf.from("documents").select("*").eq("venue_id", venueId).order("uploaded_at");
    const todo = (docs ?? []).filter((d) => ANALYZABLE.includes(d.kind as DocKind));
    if (!cfg) {
      for (const d of todo) await pf.from("documents").update({ extraction_status: "failed", extraction_note: "KAGIRO_API_KEY belum diisi di .env: analisis AI tidak berjalan" }).eq("id", d.id);
      await pf.from("venues").update({ ai_status: "failed", ai_report: { error: "KAGIRO_API_KEY belum diisi", analyzedAt: new Date().toISOString() } }).eq("id", venueId);
      return { ok: false as const, reason: "KAGIRO_API_KEY belum diisi" };
    }
    const chat = chatFn(cfg);
    const byKind: Partial<Record<DocKind, Extraction>> = {};
    for (const d of todo) {
      await pf.from("documents").update({ extraction_status: "pending" }).eq("id", d.id);
      let ex: Extraction;
      try {
        ex = await extractDocument(d.kind as DocKind, await pagesOf(d.storage_path, String(d.original_name ?? d.storage_path)), chat);
      } catch (e: any) {
        ex = { kind: d.kind as DocKind, status: "failed", fields: {}, pages: 0, note: String(e?.message ?? e) };
      }
      // bila ada beberapa dokumen satu jenis, pakai yang paling lengkap
      const prev = byKind[d.kind as DocKind];
      if (!prev || Object.values(ex.fields).filter((f) => f.verified).length > Object.values(prev.fields).filter((f) => f.verified).length) byKind[d.kind as DocKind] = ex;
      await pf.from("documents").update({ extraction: ex.fields, extraction_status: ex.status, extraction_note: ex.note ?? null }).eq("id", d.id);
    }
    const checks = compareWithForm(formFacts(venue), byKind);
    await pf.from("venues").update({ ai_status: "done", ai_report: { checks, analyzedAt: new Date().toISOString(), model: cfg.model, documents: todo.length } }).eq("id", venueId);
    await audit("ai", "documents.analyzed", { venue: venue.name, checks: checks.map((c) => `${c.id}:${c.status}`) });
    if (opts.rerunVerification !== false) await reverifyWithDocs(venueId, checks);
    return { ok: true as const, checks };
  } catch (e: any) {
    await pf.from("venues").update({ ai_status: "failed", ai_report: { error: String(e?.message ?? e), analyzedAt: new Date().toISOString() } }).eq("id", venueId);
    return { ok: false as const, reason: String(e?.message ?? e) };
  }
}

/** Verifikasi ulang (data dilaporkan owner) dengan hasil konsistensi dokumen; membuat hasil verifikasi baru yang dibaca reviewer. */
export async function reverifyWithDocs(venueId: string, docChecks: DocCheck[]) {
  const pf = platformDb();
  const { data: venue } = await pf.from("venues").select("*").eq("id", venueId).single();
  if (!venue || venue.data_source !== "self_reported") return null;
  const ctx = await getCtx((await currentSeriesOf(venueId)).id);
  const s = ctx.series;
  const months: number[] = venue.reported_revenue?.months ?? [];
  const policy = evaluatePolicy({
    dossier: venue.dossier,
    tenorMonths: Math.round(s.tenor_days / 30),
    monthlyEligible: months,
    occupancy: Number(venue.reported_revenue?.occupancyPct ?? 0) / 100,
    openExceptions: 0,
    proposed: { target: Number(s.target), unitPrice: Number(s.unit_price), shareBps: s.share_bps },
    dataSource: "self_reported",
    docChecks,
    reportedGatewayPct: venue.disclosure?.public?.performance?.paymentMix?.gatewayPct,
    landlordConsentsToSale: venue.disclosure?.public?.risk?.landlordConsentsToSale ?? undefined,
    insurance: insuranceOf(venue),
  });
  return saveRun(ctx, { policy, asOf: new Date().toISOString(), exceptions: [], monthly: months, dataSource: "self_reported", disclosureHash: venue.disclosure_hash ?? null });
}

export type { Ctx };
