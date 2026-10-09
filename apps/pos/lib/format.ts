export const rp = (n: number | bigint) => "Rp" + Number(n).toLocaleString("id-ID");
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const pct = (x: number, d = 0) => (x * 100).toFixed(d) + "%";
export const dt = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
export const wibDate = (d = new Date()) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
export const wibTime = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", hour12: false }).replace(".", ":");
export const POS_URL = process.env.POS_URL ?? "http://localhost:3001";
