import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ start: vi.fn(), redirect: vi.fn(), requireInvestor: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "grounds.test", "x-forwarded-proto": "https" }) }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("../lib/auth", () => ({ requireInvestor: h.requireInvestor }));
vi.mock("../lib/flow", () => ({ guarded: async (back: string, fn: () => Promise<unknown>) => {
  await fn();
  h.redirect(back);
} }));
vi.mock("../lib/flows/investor", () => ({ startDiditKyc: h.start, mockKyc: vi.fn(), registerBankAccount: vi.fn() }));
vi.mock("../lib/flows/cash", () => ({ requestWithdrawal: vi.fn() }));
vi.mock("../lib/flows/orders", () => ({ cancelOrder: vi.fn() }));
vi.mock("../lib/flows/sellback", () => ({ cancelSellBack: vi.fn() }));
vi.mock("../lib/didit", () => ({ diditConfig: vi.fn() }));

import { startKycAction } from "../app/portfolio/actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireInvestor.mockResolvedValue({ userId: "investor-1", wallet: "wallet-1" });
  h.redirect.mockImplementation((url: string) => { throw Object.assign(new Error(url), { digest: "NEXT_REDIRECT" }); });
});

it("redirects to Didit before the guarded default portfolio redirect", async () => {
  h.start.mockResolvedValue("https://verify.didit.me/session");
  await expect(startKycAction()).rejects.toThrow("https://verify.didit.me/session");
  expect(h.start).toHaveBeenCalledWith("investor-1", "wallet-1", "https://grounds.test");
  expect(h.redirect).toHaveBeenCalledTimes(1);
  expect(h.redirect).toHaveBeenCalledWith("https://verify.didit.me/session");
});

it("returns an already verified investor to the portfolio", async () => {
  h.start.mockResolvedValue("https://grounds.test/portfolio");
  await expect(startKycAction()).rejects.toThrow("https://grounds.test/portfolio");
  expect(h.redirect).toHaveBeenCalledWith("https://grounds.test/portfolio");
});
