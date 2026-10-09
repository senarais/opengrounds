/**
 * Kontrak output agen (PRD v4.1 §8.3): setiap temuan berbukti (`source_refs`) atau berstatus UNVERIFIED, dan selalu
 * `requires_human_review`. Agen tidak pernah menyetujui, menolak, mencetak token, atau memindahkan uang.
 */
export type Agent = "extraction" | "cross_check" | "reconciliation" | "risk";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export interface SourceRef { doc: string; page?: number | null; quote?: string | null }

export interface Finding {
  agent: Agent;
  checkType: string;
  code: string;
  severity: Severity;
  text: string;
  fieldPaths: string[];
  sourceRefs: SourceRef[];
  /** false = UNVERIFIED: tidak ada bukti yang bisa dirujuk (mis. dokumen tidak terbaca). */
  verified: boolean;
}

export const finding = (f: Omit<Finding, "fieldPaths" | "sourceRefs" | "verified"> & Partial<Pick<Finding, "fieldPaths" | "sourceRefs" | "verified">>): Finding =>
  ({ fieldPaths: [], sourceRefs: [], verified: true, ...f });

/** Ringkasan untuk reviewer: jumlah per tingkat dan apakah ada penghalang (critical). Penghalang tetap harus diputus manusia. */
export function summarize(findings: Finding[]) {
  const counts = { info: 0, low: 0, medium: 0, high: 0, critical: 0 } as Record<Severity, number>;
  for (const f of findings) counts[f.severity]++;
  const top = [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]).slice(0, 5);
  return { counts, blocked: counts.critical > 0, top: top.map((f) => `${f.severity.toUpperCase()}: ${f.text}`) };
}
