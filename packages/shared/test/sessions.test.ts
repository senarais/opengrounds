import { describe, expect, it } from "vitest";
import { hhmm, priceOfSession, sessionOf, sessionStartUtc, sessionsFor } from "../src";

describe("sesi produk", () => {
  const basket = { openHour: 9, closeHour: 12, sessionMinutes: 60 };
  it("membagi jam buka–tutup menjadi sesi tetap", () => {
    const s = sessionsFor(basket);
    expect(s.map((x) => `${x.index}:${hhmm(x.startMinutes)}-${hhmm(x.endMinutes)}`)).toEqual(["1:09:00-10:00", "2:10:00-11:00", "3:11:00-12:00"]);
  });
  it("sesi terakhir tidak boleh melewati jam tutup", () => {
    expect(sessionsFor({ openHour: 8, closeHour: 11, sessionMinutes: 90 }).length).toBe(2);
    expect(sessionsFor({ openHour: 8, closeHour: 9, sessionMinutes: 90 }).length).toBe(0);
  });
  it("jam dalam WIB dikonversi ke UTC dengan benar", () => {
    expect(sessionStartUtc("2026-10-08", 9 * 60).toISOString()).toBe("2026-10-08T02:00:00.000Z");
  });
  it("sessionOf mengenali sesi dari slot_start dan menolak yang tidak sejajar", () => {
    expect(sessionOf(basket, "2026-10-08T03:00:00.000Z")?.index).toBe(2); // 10:00 WIB
    expect(sessionOf(basket, "2026-10-08T03:30:00.000Z")).toBeNull();
  });
  it("harga peak berlaku hanya di jendela peak", () => {
    const p = { price: 180_000, peakPrice: 250_000, peakStartHour: 17, peakEndHour: 22 };
    expect(priceOfSession(p, 10 * 60)).toBe(180_000);
    expect(priceOfSession(p, 19 * 60)).toBe(250_000);
    expect(priceOfSession(p, 22 * 60)).toBe(180_000);
    expect(priceOfSession({ ...p, peakPrice: null }, 19 * 60)).toBe(180_000);
  });
});
