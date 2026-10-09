/** Sesi = potongan waktu tetap antara jam buka dan jam tutup produk. Semua jam dalam WIB (UTC+7). */
export interface SessionDef {
  index: number; // 1-based: Sesi 1, Sesi 2, ...
  startMinutes: number; // menit sejak 00:00 WIB
  endMinutes: number;
}

export function sessionsFor(p: { openHour: number; closeHour: number; sessionMinutes: number }): SessionDef[] {
  const out: SessionDef[] = [];
  const open = p.openHour * 60;
  const close = p.closeHour * 60;
  for (let s = open, i = 1; s + p.sessionMinutes <= close; s += p.sessionMinutes, i++) {
    out.push({ index: i, startMinutes: s, endMinutes: s + p.sessionMinutes });
  }
  return out;
}

export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Waktu mulai sesi (UTC) pada tanggal kalender WIB `date` (YYYY-MM-DD). */
export function sessionStartUtc(date: string, startMinutes: number): Date {
  return new Date(new Date(`${date}T00:00:00+07:00`).getTime() + startMinutes * 60_000);
}

/** Cari sesi yang cocok dengan slot_start (UTC). Null bila tidak sejajar dengan grid sesi produk. */
export function sessionOf(p: { openHour: number; closeHour: number; sessionMinutes: number }, slotStartIso: string): SessionDef | null {
  const wib = new Date(new Date(slotStartIso).getTime() + 7 * 3_600_000);
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return sessionsFor(p).find((s) => s.startMinutes === minutes) ?? null;
}

/** Harga sesi: harga peak bila mulai dalam jendela peak (WIB), selain itu harga dasar. */
export function priceOfSession(p: { price: number; peakPrice: number | null; peakStartHour: number | null; peakEndHour: number | null }, startMinutes: number): number {
  if (p.peakPrice != null && p.peakStartHour != null && p.peakEndHour != null) {
    const h = startMinutes / 60;
    if (h >= p.peakStartHour && h < p.peakEndHour) return p.peakPrice;
  }
  return p.price;
}
