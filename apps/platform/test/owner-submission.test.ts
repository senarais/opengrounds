import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ owner: vi.fn(), build: vi.fn(), submit: vi.fn(), after: vi.fn(), check: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/server", () => ({ after: h.after }));
vi.mock("../lib/auth", () => ({ requireOwner: h.owner }));
vi.mock("../lib/flows/application-form", () => ({ buildApplication: h.build }));
vi.mock("../lib/flows/onboarding", () => ({ submitOnboarding: h.submit }));
vi.mock("../lib/flows/kyb", () => ({ runAutomatedCheck: h.check }));
vi.mock("../lib/operator", () => ({ friendlyError: (e: Error) => e.message }));
import { submitVenue } from "../app/owner/apply/actions";

describe("owner venue submission authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.owner.mockResolvedValue({ userId: "session-owner", email: "owner@example.test" });
    h.build.mockResolvedValue({ input: { venue: { name: "Court" } }, files: [] });
    h.submit.mockResolvedValue({ venueId: "venue-1", caseId: "case-1" });
  });
  it("binds venue ownership to the session even when another owner is posted", async () => {
    const fd = new FormData();
    fd.set("ownerEmail", "another-owner@example.test");
    fd.set("userId", "other-user");
    await expect(submitVenue(fd)).rejects.toThrow("redirect:/owner/venue-1?ok=");
    expect(h.submit).toHaveBeenCalledWith("session-owner", { venue: { name: "Court" } }, [], "owner:owner@example.test");
    expect(h.after).toHaveBeenCalledOnce();
  });
  it("does not parse or write application data when owner authorization fails", async () => {
    h.owner.mockRejectedValue(new Error("Owner role required"));
    await expect(submitVenue(new FormData())).rejects.toThrow("Owner role required");
    expect(h.build).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
  });
});
