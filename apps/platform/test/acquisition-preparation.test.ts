import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  context: null as any, existing: null as any, reviewStatus: "APPROVED", updates: vi.fn(),
  create: vi.fn(), sign: vi.fn(), audit: vi.fn(),
}));
vi.mock("../lib/chain", () => ({ REGISTRY: { address: "0x0000000000000000000000000000000000000001" }, chain: { id: 11155111 } }));
vi.mock("../lib/operator", () => ({}));
vi.mock("../lib/flows/onboarding", () => ({}));
vi.mock("../lib/flows/provision", () => ({}));
vi.mock("../lib/flow", () => ({ getSeries: async () => h.context, needContract: () => h.context.address, audit: h.audit }));
vi.mock("../lib/flows/attest", () => ({ createAttestation: h.create, signAsPlatform: h.sign }));
vi.mock("../lib/db", () => ({ platformDb: () => ({ from: (table: string) => {
  const builder: any = {
    select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
    single: async () => ({ data: { status: h.reviewStatus }, error: null }),
    maybeSingle: async () => ({ data: h.existing, error: null }),
    update: (value: unknown) => { h.updates(value); return builder; },
    is: async () => ({ error: null }),
  };
  if (table !== "kyb_cases" && table !== "attestations" && table !== "series") throw new Error("Unexpected table");
  return builder;
} }) }));

import { prepareAcquisition } from "../lib/flows/series";

describe("automatic acquisition preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.reviewStatus = "APPROVED";
    h.existing = null;
    h.context = {
      address: "0x0000000000000000000000000000000000000002",
      venue: { submitted_by: "spv:grounds@example.test", created_at: "2026-10-01T00:00:00Z", public_profile_hash: "public-profile" },
      series: { id: "series-1", venue_id: "venue-1", status: "Verified", valuation_id: "valuation-1", valuation_idr: "1000000", supply: "40", ref_price: "10000", stake_bps: 4000, spv_fee_bps: 200, spv_approved_at: null },
    };
    h.create.mockImplementation(async (args: any) => {
      h.existing = { id: "att-1", status: "collecting", payload_hash: args.payloadHash, deadline: args.deadline.toISOString(), signatures: [] };
      return h.existing;
    });
    h.sign.mockImplementation(async () => { h.existing.signatures = [{ slot: "PLATFORM" }]; });
  });
  it("prepares the platform signature without a second SPV approval", async () => {
    expect(await prepareAcquisition("series-1")).toBe("att-1");
    expect(h.sign).toHaveBeenCalledWith("att-1", h.context.address);
    expect(h.updates).toHaveBeenCalledWith(expect.objectContaining({ spv_approved_by: "spv:grounds@example.test" }));
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "ACQUISITION_CLOSED" }));
  });
  it("reuses a valid attestation without signing again or losing existing signatures", async () => {
    await prepareAcquisition("series-1");
    h.existing.signatures.push({ slot: "COUNTERPARTY" });
    expect(await prepareAcquisition("series-1")).toBe("att-1");
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.existing.signatures).toHaveLength(2);
  });
  it("refuses to prepare before review is approved", async () => {
    h.reviewStatus = "IN_REVIEW";
    await expect(prepareAcquisition("series-1")).rejects.toThrow("Review belum disetujui");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.sign).not.toHaveBeenCalled();
  });
});
