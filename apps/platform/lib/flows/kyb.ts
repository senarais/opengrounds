import { chatFn, crossCheck, EXTRACTABLE, extractDocument, kybGate, llmFromEnv, summarize, type DocKind, type Extraction, type Finding } from "@venue-rwa/verification";
import { extractText, getDocumentProxy } from "unpdf";
import { platformDb } from "../db";
import { audit } from "../flow";
import { isImage, ocrImage, ocrPdf } from "../ocr";
import { BUCKET } from "../storage";
import { loadOnboarding } from "./onboarding";
import type { Me } from "../auth";
import { savedReviewQuorum, validateReviewApproval, type ReviewProof } from "./review-signature";

export const KYB_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", AUTOMATED_CHECK: "Automated check", NEEDS_INFO: "More information needed", IN_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Declined",
};

/** Teks per halaman dari PDF; PDF hasil pindai di-OCR. */
export async function pdfPages(buf: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(buf.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  if (pages.some((p) => p.replace(/\s/g, "").length > 40)) return pages;
  return ocrPdf(buf);
}

async function pagesOf(path: string, name: string): Promise<string[]> {
  const pdf = /\.pdf$/i.test(name) || /\.pdf$/i.test(path);
  if (!pdf && !isImage(name, "")) return [];
  const { data, error } = await platformDb().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Could not download document: ${error?.message}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  return pdf ? pdfPages(bytes) : [await ocrImage(bytes)];
}

/**
 * Pemeriksaan otomatis (§3.2 langkah 3): gerbang data wajib + agen ekstraksi, silang-cek, rekonsiliasi, indikator risiko.
 * Semua temuan advisory dan wajib ditinjau manusia. AI hanya membaca teks yang sudah diredaksi; tanpa LLM, dokumen ditandai UNVERIFIED.
 */
export async function runAutomatedCheck(caseId: string, opts: { assetValue?: number } = {}) {
  const pf = platformDb();
  const { data: kc } = await pf.from("kyb_cases").select("*").eq("id", caseId).single();
  if (!kc) throw new Error("KYB case not found.");
  if (kc.status === "APPROVED" || kc.status === "REJECTED") throw new Error("This case has already been decided.");
  await pf.from("kyb_cases").update({ status: "AUTOMATED_CHECK", updated_at: new Date().toISOString() }).eq("id", caseId);
  const { input, docs } = await loadOnboarding(kc.venue_id);

  // 1) agen ekstraksi
  const cfg = llmFromEnv();
  const byKind: Partial<Record<DocKind, Extraction>> = {};
  const todo = docs.filter((d) => EXTRACTABLE.includes(d.kind as DocKind));
  for (const d of todo) {
    let ex: Extraction;
    if (!cfg) ex = { kind: d.kind, status: "failed", fields: {}, pages: 0, note: "LLM_API_KEY is not configured; document extraction was skipped." };
    else {
      try { ex = await extractDocument(d.kind as DocKind, await pagesOf(d.storage_path, String(d.original_name ?? "")), chatFn(cfg)); }
      catch (e: any) { ex = { kind: d.kind, status: "failed", fields: {}, pages: 0, note: String(e?.message ?? e) }; }
    }
    const prev = byKind[d.kind as DocKind];
    if (!prev || Object.values(ex.fields).filter((f) => f.verified).length > Object.values(prev.fields).filter((f) => f.verified).length) byKind[d.kind as DocKind] = ex;
    await pf.from("documents").update({ extraction: ex.fields, extraction_status: ex.status, extraction_note: ex.note ?? null }).eq("id", d.id);
  }

  // 2) gerbang + silang-cek + rekonsiliasi (deterministik)
  const gate = kybGate(input, docs.map((d) => d.kind), { assetValue: opts.assetValue });
  const ownerNames = [input.company.legalName, ...input.company.directors.map((d) => d.name), ...input.beneficialOwners.map((b) => b.fullName)];
  const cross = crossCheck({
    legalName: input.company.legalName, deedNumber: input.company.deedNumber, deedDate: input.company.deedDate, kbli: input.company.kbli, ownerNames,
    landHolderName: input.land.holderName, landRightType: input.land.rightType, landEncumbered: input.land.encumbered, monthlyGross: input.financials.map((m) => m.gross),
  }, byKind);
  const findings: Finding[] = [...gate.findings, ...cross];
  const summary = summarize(findings);

  // 3) indikator risiko: ringkasan untuk reviewer (deterministik; bukan keputusan)
  await pf.from("kyb_findings").delete().eq("case_id", caseId).is("disposition", null);
  if (findings.length) {
    const { error } = await pf.from("kyb_findings").insert(findings.map((f) => ({
      case_id: caseId, agent: f.agent, check_type: f.checkType, finding_code: f.code, severity: f.severity, finding_text: f.text, field_paths: f.fieldPaths,
      source_refs: f.sourceRefs, verified: f.verified, model_version: f.agent === "extraction" || f.sourceRefs.some((r) => r.quote) ? cfg?.model ?? null : "rules-v4.1",
      source_sha256: f.sourceRefs.map((r) => docs.find((d) => d.kind === r.doc)?.sha256).filter(Boolean),
    })));
    if (error) throw new Error(error.message);
  }
  await pf.from("kyb_cases").update({
    status: "IN_REVIEW", gate_result: { blocked: gate.blocked || summary.blocked, valuation: gate.valuation, financial: gate.financial, checkedAt: new Date().toISOString(), llm: cfg?.model ?? null },
    risk_summary: summary, updated_at: new Date().toISOString(),
  }).eq("id", caseId);
  await audit("ai", "kyb.automated_check", { entity: "kyb_cases", entityId: caseId, detail: { counts: summary.counts, blocked: summary.blocked, model: cfg?.model ?? null } });
  return { summary, gate };
}

/** Reviewer menandai satu temuan: diterima, dikesampingkan (wajib alasan), minta data, atau tolak. */
export async function disposeFinding(findingId: string, actor: string, disposition: "accepted" | "overridden" | "request_info" | "rejected", reason: string) {
    if (disposition === "overridden" && reason.trim().length < 10) throw new Error("An override requires a reason of at least 10 characters.");
  const pf = platformDb();
  const { data: before } = await pf.from("kyb_findings").select("disposition, disposition_reason").eq("id", findingId).single();
  const { error } = await pf.from("kyb_findings").update({ disposition, disposition_reason: reason || null, disposed_by: actor }).eq("id", findingId);
  if (error) throw new Error(error.message);
  await audit(actor, "kyb.finding.dispose", { entity: "kyb_findings", entityId: findingId, before, after: { disposition, reason } });
}

/**
 * Keputusan reviewer. Menyetujui hanya bila setiap temuan critical/high sudah ditinjau dan tidak ada yang "rejected".
 * Menyetujui KYB BELUM menerbitkan token: penerbitan butuh ACQUISITION_CLOSED yang ditandatangani platform + owner.
 */
export async function decideCase(caseId: string, actor: string, decision: "APPROVED" | "REJECTED" | "NEEDS_INFO", note: string, approval?: { me: Me; assetValue: number; proof: ReviewProof }) {
  const pf = platformDb();
  const { data: kc } = await pf.from("kyb_cases").select("*").eq("id", caseId).single();
  if (!kc) throw new Error("Application not found.");
  if (kc.status !== "IN_REVIEW") throw new Error(`Application status: ${KYB_STATUS_LABEL[kc.status] ?? kc.status}. Run the automated check first.`);
  if (decision !== "APPROVED" && note.trim().length < 10) throw new Error("Add a decision note of at least 10 characters for the owner.");
  if (!["APPROVED", "REJECTED", "NEEDS_INFO"].includes(decision)) throw new Error("Invalid review decision.");
  if (decision === "APPROVED") {
    if (!approval || approval.me.email !== actor) throw new Error("Review approval must be signed by the reviewer in MetaMask.");
    const verified = await validateReviewApproval(caseId, approval.me, approval.assetValue, note, approval.proof);
    if (verified.version !== kc.updated_at) throw new Error("The application changed. Reload and review it again.");
    // Persist the verified signed statement before changing the decision; fail closed if evidence cannot be stored.
    const { error: proofError } = await pf.from("audit_log").insert({ actor, action: "kyb.review.signed", entity: "kyb_cases", entity_id: caseId, detail: verified.signedReview });
    if (proofError) throw new Error("Could not save signature evidence. Approval was not recorded.");
    const { data: fs } = await pf.from("kyb_findings").select("severity, disposition, finding_text").eq("case_id", caseId);
    const open = (fs ?? []).filter((f) => (f.severity === "critical" || f.severity === "high") && !f.disposition);
    if (open.length) throw new Error(`${open.length} critical/high findings still need review.`);
    const rejected = (fs ?? []).filter((f) => f.disposition === "rejected");
    if (rejected.length) throw new Error("A finding is marked as a reason to decline. This case cannot be approved.");
    if (!kc.gate_result?.valuation) throw new Error("Valuation is unavailable because D12 is not positive.");
    const quorum = await savedReviewQuorum(caseId, verified.signedReview.typed.message.evidenceHash, approval.assetValue);
    if (!quorum.ready) return { venueId: kc.venue_id as string, finalized: false, waitingFor: quorum.operator ? "reviewer independen" : "operator" };
  }
  const { data: changed, error: decisionError } = await pf.from("kyb_cases").update({ status: decision, decided_by: actor, decision_note: note || null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", caseId).eq("status", "IN_REVIEW").eq("updated_at", kc.updated_at).select("id").maybeSingle();
  if (decisionError || !changed) throw new Error("Decision was not saved or the application changed. Reload and try again.");
  await audit(actor, "kyb.decide", { entity: "kyb_cases", entityId: caseId, before: { status: kc.status }, after: { status: decision, note } });
  return { venueId: kc.venue_id as string, finalized: true, waitingFor: null };
}

/** Owner melengkapi data setelah NEEDS_INFO: kasus kembali ke SUBMITTED lalu diperiksa ulang. */
export async function resubmitCase(caseId: string, actor: string) {
  const pf = platformDb();
  const { data: kc } = await pf.from("kyb_cases").select("status").eq("id", caseId).single();
  if (kc?.status !== "NEEDS_INFO") throw new Error("This case is not waiting for additional information.");
  await pf.from("kyb_cases").update({ status: "SUBMITTED", updated_at: new Date().toISOString() }).eq("id", caseId);
  await audit(actor, "kyb.resubmit", { entity: "kyb_cases", entityId: caseId });
}

export async function latestCase(venueId: string) {
  const { data } = await platformDb().from("kyb_cases").select("*").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}
