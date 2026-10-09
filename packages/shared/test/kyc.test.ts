import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalize, kycStateOf, verifyDiditWebhook } from "../src";

const secret = "whsec_test_123";
const body = { session_id: "s1", status: "Approved", vendor_data: "user-1", webhook_type: "status.updated", event_id: "e1", decision: { id_verifications: [{ status: "Approved", score: 98.5, nested: { b: 2, a: 1 } }] }, metadata: { nama: "Budi Ünïcode" } };
const raw = JSON.stringify(body);
const now = 1_800_000_000_000;
const sign = (b: unknown) => createHmac("sha256", secret).update(canonicalize(b)).digest("hex");

describe("webhook Didit", () => {
  it("canonicalize: kunci diurutkan rekursif, ringkas, Unicode utuh", () => {
    expect(canonicalize({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: "é" } })).toBe('{"a":{"c":"é","d":[3,{"x":2,"y":1}]},"b":1}');
  });
  it("tanda tangan valid diterima, tak bergantung urutan kunci pada body mentah", async () => {
    const reordered = JSON.stringify({ webhook_type: body.webhook_type, decision: body.decision, status: body.status, session_id: body.session_id, event_id: body.event_id, vendor_data: body.vendor_data, metadata: body.metadata });
    expect(await verifyDiditWebhook({ rawBody: raw, signature: sign(body), timestamp: String(now / 1000), secret, nowMs: now })).toBe(true);
    expect(await verifyDiditWebhook({ rawBody: reordered, signature: sign(body), timestamp: String(now / 1000), secret, nowMs: now })).toBe(true);
  });
  it("ditolak: body diubah, secret salah, tanda tangan kosong, tanpa secret", async () => {
    const tampered = JSON.stringify({ ...body, status: "Declined" });
    expect(await verifyDiditWebhook({ rawBody: tampered, signature: sign(body), timestamp: String(now / 1000), secret, nowMs: now })).toBe(false);
    expect(await verifyDiditWebhook({ rawBody: raw, signature: sign(body), timestamp: String(now / 1000), secret: "lain", nowMs: now })).toBe(false);
    expect(await verifyDiditWebhook({ rawBody: raw, signature: null, timestamp: String(now / 1000), secret, nowMs: now })).toBe(false);
    expect(await verifyDiditWebhook({ rawBody: raw, signature: sign(body), timestamp: String(now / 1000), secret: undefined, nowMs: now })).toBe(false);
  });
  it("ditolak: timestamp lebih dari 300 detik (replay)", async () => {
    expect(await verifyDiditWebhook({ rawBody: raw, signature: sign(body), timestamp: String(now / 1000 - 301), secret, nowMs: now })).toBe(false);
    expect(await verifyDiditWebhook({ rawBody: raw, signature: sign(body), timestamp: String(now / 1000 - 299), secret, nowMs: now })).toBe(true);
  });
  it("body bukan JSON ditolak", async () => expect(await verifyDiditWebhook({ rawBody: "bukan json", signature: "x", timestamp: String(now / 1000), secret, nowMs: now })).toBe(false));
});

describe("status KYC", () => {
  it("hanya Approved yang verified; peka huruf besar-kecil", () => {
    expect(kycStateOf("Approved")).toBe("verified");
    expect(kycStateOf("approved")).toBe("pending");
    expect(kycStateOf("Declined")).toBe("rejected");
    expect(kycStateOf("In Review")).toBe("review");
    expect(["Abandoned", "Expired", "Kyc Expired"].map(kycStateOf)).toEqual(["expired", "expired", "expired"]);
    expect(["Not Started", "In Progress", "Awaiting User"].map(kycStateOf)).toEqual(["pending", "pending", "pending"]);
  });
});
