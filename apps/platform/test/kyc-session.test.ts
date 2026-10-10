import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ results: [] as any[], create: vi.fn(), insert: vi.fn() }));
vi.mock("../lib/chain", () => ({}));
vi.mock("../lib/operator", () => ({}));
vi.mock("../lib/flow", () => ({ audit: vi.fn() }));
vi.mock("../lib/didit", () => ({ createSession: h.create, diditConfig: () => ({ configured: true }), getDecision: vi.fn() }));
vi.mock("../lib/db", () => ({ platformDb: () => ({ from: () => {
  const builder: any = {
    select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
    maybeSingle: async () => h.results.shift(), insert: h.insert,
  };
  return builder;
} }) }));
import { startDiditKyc } from "../lib/flows/investor";

const result = (data: unknown) => ({ data, error: null });
describe("Didit session idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.results = [result(null), result(null)];
    h.create.mockResolvedValue({ session_id: "didit-1", url: "https://verify.didit.me/session", status: "Not Started" });
    h.insert.mockResolvedValue({ error: null });
  });
  it("reuses an active session without creating or inserting another", async () => {
    h.results[1] = result({ state: "pending", url: "https://verify.didit.me/existing" });
    expect(await startDiditKyc("user-1", null, "https://grounds.test")).toBe("https://verify.didit.me/existing");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });
  it("does not restart KYC for a verified investor", async () => {
    h.results = [result({ status: "verified" })];
    expect(await startDiditKyc("user-1", null, "https://grounds.test")).toBe("https://grounds.test/portfolio");
    expect(h.create).not.toHaveBeenCalled();
  });
  it("creates and records a new session when none exists", async () => {
    await startDiditKyc("user-1", "0x123", "https://grounds.test");
    expect(h.create).toHaveBeenCalledWith({ vendorData: "user-1", callback: "https://grounds.test/portfolio?kyc=return" });
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", wallet: "0x123", session_id: "didit-1", state: "pending" }));
  });
  it("accepts a duplicate response only for the same account", async () => {
    h.insert.mockResolvedValue({ error: { code: "23505" } });
    h.results.push(result({ user_id: "user-1", state: "pending", url: "https://verify.didit.me/existing" }));
    expect(await startDiditKyc("user-1", null, "https://grounds.test")).toBe("https://verify.didit.me/existing");
  });
  it("never takes over a session belonging to another account", async () => {
    h.insert.mockResolvedValue({ error: { code: "23505" } });
    h.results.push(result({ user_id: "user-2", state: "pending", url: "https://verify.didit.me/other" }));
    await expect(startDiditKyc("user-1", null, "https://grounds.test")).rejects.toThrow("does not match your account");
  });
  it("does not hide unrelated database failures", async () => {
    h.insert.mockResolvedValue({ error: { code: "08006", message: "Connection failed" } });
    await expect(startDiditKyc("user-1", null, "https://grounds.test")).rejects.toThrow("Connection failed");
  });
});
