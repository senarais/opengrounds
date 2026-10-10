export const rp = (n: number | bigint) => "Rp" + Number(n).toLocaleString("id-ID");
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const pct = (x: number, d = 0) => (x * 100).toFixed(d) + "%";
export const dt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
export const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
