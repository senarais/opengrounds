/** Klien LLM tipis untuk gateway OpenAI-compatible (saat ini Morphic). Tanpa tools, tanpa jaringan lain, keluaran harus JSON. */
export interface LlmConfig { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }

export function llmFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  // LLM_* adalah nama baru; KAGIRO_* tetap dibaca sebagai cadangan supaya .env lama tidak patah.
  const apiKey = env.LLM_API_KEY || env.KAGIRO_API_KEY;
  if (!apiKey) return null;
  const baseUrl = env.LLM_BASE_URL || env.KAGIRO_BASE_URL || "https://morphic-api.web.id/v1";
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model: env.LLM_MODEL || env.KAGIRO_MODEL || "deepseek-v4-pro" };
}

/** Ambil objek JSON dari balasan model (boleh terbungkus ```json ... ``` atau teks pengantar). */
export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1]! : text).trim();
  try { return JSON.parse(body); } catch { /* lanjut cari objek */ }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
  throw new Error("balasan model bukan JSON");
}

export type ChatFn = (system: string, user: string) => Promise<string>;

export function chatFn(cfg: LlmConfig): ChatFn {
  return async (system, user) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 120_000);
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, temperature: 0, max_tokens: 1800, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: ctl.signal,
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`LLM ${res.status}: ${body?.error?.message ?? body?.message ?? "gagal"}`);
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new Error("LLM mengembalikan balasan kosong");
      return text;
    } finally { clearTimeout(timer); }
  };
}
