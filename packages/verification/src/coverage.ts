import { FIELD_SPECS, type DocKind, type FieldResult } from "./extract";
import { REQUIRED_DOCS } from "./kyb";

export interface EvidenceDocument {
  kind: string;
  extraction_status?: string | null;
  extraction?: Record<string, FieldResult> | null;
}

/** Advisory evidence coverage, not a risk rating. Each required document has equal weight.
 * Only cited, verified, non-null extracted fields count; duplicate uploads cannot inflate coverage.
 */
export function evidenceCoverage(docs: EvidenceDocument[]) {
  const rows = REQUIRED_DOCS.map((kind) => {
    const fields = Object.keys(FIELD_SPECS[kind as DocKind]);
    const candidates = docs.filter((d) => d.kind === kind);
    const verified = Math.max(0, ...candidates.map((d) =>
      ["ok", "partial"].includes(d.extraction_status ?? "")
        ? fields.filter((key) => {
          const f = d.extraction?.[key];
          return f?.verified === true && f.value !== null && f.value !== undefined && !!f.quote && (f.page ?? 0) > 0;
        }).length : 0));
    return { kind, present: candidates.length > 0, verified, total: fields.length };
  });
  return {
    score: Math.floor(rows.reduce((sum, row) => sum + row.verified / row.total, 0) * 100 / rows.length),
    rows,
    missing: rows.filter((row) => !row.present).length,
  };
}
