import { describe, expect, it } from "vitest";
import { evidenceCoverage, FIELD_SPECS, REQUIRED_DOCS } from "../src";

const complete = () => REQUIRED_DOCS.map((kind) => ({ kind, extraction_status: "ok", extraction: Object.fromEntries(Object.keys(FIELD_SPECS[kind]).map((key) => [key, { value: "Evidence", verified: true, quote: "Evidence", page: 1 }])) }));

describe("advisory evidence coverage", () => {
  it("does not score missing or failed documents as verified", () => {
    expect(evidenceCoverage([])).toMatchObject({ score: 0, missing: 5 });
    expect(evidenceCoverage(complete().map((d) => ({ ...d, extraction_status: "failed" }))).score).toBe(0);
  });
  it("requires citation and verified non-null fields", () => {
    const docs = complete();
    expect(evidenceCoverage(docs).score).toBe(100);
    docs[0]!.extraction.company_name = { value: "Evidence", verified: true, quote: "", page: 1 };
    expect(evidenceCoverage(docs).score).toBeLessThan(100);
  });
  it("does not inflate the score for duplicate or optional uploads", () => {
    const docs = complete().slice(0, 1);
    expect(evidenceCoverage([...docs, ...docs, { kind: "photo" }]).score).toBe(20);
  });
});
