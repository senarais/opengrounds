import { kycStateOf, type KycState } from "@venue-rwa/shared";

/** Klien Didit (KYC nyata). Hanya status sesi yang dipakai; data identitas dari keputusan TIDAK disimpan. */
export function diditConfig() {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  return {
    configured: Boolean(apiKey && workflowId),
    apiKey: apiKey ?? "",
    workflowId: workflowId ?? "",
    baseUrl: (process.env.DIDIT_BASE_URL || "https://verification.didit.me").replace(/\/$/, ""),
    webhookSecret: process.env.DIDIT_WEBHOOK_SECRET,
  };
}

async function call<T>(path: string, init: RequestInit, f: typeof fetch = fetch): Promise<T> {
  const c = diditConfig();
  if (!c.configured) throw new Error("Didit is not configured. Set DIDIT_API_KEY and DIDIT_WORKFLOW_ID.");
  const res = await f(`${c.baseUrl}${path}`, { ...init, headers: { "x-api-key": c.apiKey, "content-type": "application/json", accept: "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Didit ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

export interface DiditSession { session_id: string; url: string; status: string }

/** vendor_data = id akun platform, supaya sesi bisa dicocokkan balik tanpa menyimpan identitas. */
export function createSession(args: { vendorData: string; callback: string }, f?: typeof fetch) {
  const c = diditConfig();
  return call<DiditSession>("/v3/session/", { method: "POST", body: JSON.stringify({ workflow_id: c.workflowId, vendor_data: args.vendorData, callback: args.callback }) }, f);
}

export function getDecision(sessionId: string, f?: typeof fetch) {
  return call<{ session_id: string; status: string; vendor_data?: string }>(`/v3/session/${encodeURIComponent(sessionId)}/decision/`, { method: "GET" }, f);
}

export { kycStateOf };
export type { KycState };
