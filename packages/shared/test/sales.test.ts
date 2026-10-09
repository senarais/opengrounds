import { describe, expect, it } from "vitest";
import { parseCsv, parseSalesTable, SALES_TEMPLATE_MONTHLY } from "../src";

const NOW = new Date("2026-10-08T03:00:00Z"); // Oktober 2026 (bulan berjalan, tidak dihitung)
const monthly = (rows: string[]) => parseSalesTable(parseCsv(["bulan,bruto,refund,pajak,fee", ...rows].join("\n")), NOW);

describe("data penjualan: template bulanan", () => {
  it("6 bulan berurutan diterima; omzet bersih = bruto − refund − pajak − fee", () => {
    const r = monthly(["2026-03,100000000,1000000,9000000,700000", "2026-04,100000000,0,9000000,0", "2026-05,100000000,0,0,0", "2026-06,100000000,0,0,0", "2026-07,100000000,0,0,0", "2026-08,100000000,0,0,0"]);
    expect(r.errors).toEqual([]);
    expect(r.labels).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(r.months[0]).toBe(100_000_000 - 1_000_000 - 9_000_000 - 700_000);
    expect(r.paymentMix).toBeNull();
  });
  it("bulan berjalan tidak dihitung; kurang dari 6 bulan ditolak", () => {
    const r = monthly(["2026-08,1,0,0,0", "2026-09,1,0,0,0", "2026-10,5,0,0,0"]);
    expect(r.labels).toEqual(["2026-08", "2026-09"]);
    expect(r.notes.join(" ")).toContain("Bulan berjalan");
    expect(r.errors.join(" ")).toContain("minimal 6");
  });
  it("celah bulan: hanya rangkaian terbaru yang dipakai dan dilaporkan", () => {
    const r = monthly(["2026-01,1,0,0,0", "2026-02,1,0,0,0", "2026-05,1,0,0,0", "2026-06,1,0,0,0", "2026-07,1,0,0,0", "2026-08,1,0,0,0", "2026-09,1,0,0,0", "2026-04,1,0,0,0"]);
    expect(r.labels[0]).toBe("2026-04");
    expect(r.labels.length).toBe(6);
    expect(r.notes.join(" ")).toContain("2026-03");
  });
  it("bulan ganda, angka desimal, dan pengurang melebihi bruto ditolak", () => {
    expect(monthly(["2026-08,1,0,0,0", "2026-08,2,0,0,0"]).errors.join(" ")).toContain("dua kali");
    expect(monthly(["2026-08,1.5,0,0,0"]).errors.join(" ")).toContain("rupiah bulat");
    expect(monthly(["2026-03,100,90,20,0", "2026-04,1,0,0,0", "2026-05,1,0,0,0", "2026-06,1,0,0,0", "2026-07,1,0,0,0", "2026-08,1,0,0,0"]).errors.join(" ")).toContain("melebihi");
  });
  it("kolom wajib hilang dilaporkan", () => expect(parseSalesTable(parseCsv("bulan,bruto\n2026-01,1"), NOW).errors[0]).toContain("Kolom wajib"));
  it("template contoh bisa dibaca (struktur)", () => expect(parseSalesTable(parseCsv(SALES_TEMPLATE_MONTHLY), NOW).labels).toEqual(["2026-01", "2026-02"]));
});

describe("data penjualan: ekspor transaksi", () => {
  const head = "ref,tanggal,jumlah,tipe,metode,psp_ref,biaya,pajak,ref_asal";
  it("dijumlah per bulan WIB; porsi pembayaran dari metode; pajak/fee diperkirakan dan diberi catatan", () => {
    const rows = [head];
    for (let m = 3; m <= 8; m++) {
      const mm = String(m).padStart(2, "0");
      rows.push(`G${m},2026-${mm}-10T10:00:00+07:00,110000,penjualan,gateway,PSP${m},,,`);
      rows.push(`C${m},2026-${mm}-11T10:00:00+07:00,110000,penjualan,tunai,,,,`);
    }
    rows.push("R1,2026-08-20T10:00:00+07:00,110000,refund,gateway,PSP8,,,G8");
    const r = parseSalesTable(parseCsv(rows.join("\n")), NOW);
    expect(r.errors).toEqual([]);
    expect(r.mode).toBe("transactions");
    expect(r.labels.length).toBe(6);
    expect(r.paymentMix).toEqual({ gatewayPct: 50, cashPct: 50, transferPct: 0 });
    const aug = r.breakdown[5]!;
    expect(aug.gross).toBe(220_000);
    expect(aug.refund).toBe(110_000);
    expect(aug.tax).toBe(20_000); // 2 × 110000/11
    expect(aug.fee).toBe(770); // 0,7% × 110000 hanya gateway
    expect(r.notes.join(" ")).toContain("Pajak diperkirakan");
  });
  it("transaksi 1 Oktober 00:30 WIB jatuh ke Oktober (bulan berjalan, tidak dihitung); 30 September 23:30 WIB ke September", () => {
    const r = parseSalesTable(parseCsv([head, "A,2026-10-01T00:30:00+07:00,1000,penjualan,tunai,,,,", "B,2026-09-30T23:30:00+07:00,1000,penjualan,tunai,,,,"].join("\n")), NOW);
    expect(r.labels).toEqual(["2026-09"]);
  });
  it("galat baris dilaporkan dengan nomor baris", () => {
    const r = parseSalesTable(parseCsv([head, "A,2026-08-01T00:00:00+07:00,x,penjualan,tunai,,,,"].join("\n")), NOW);
    expect(r.errors.join(" ")).toContain("Baris 2");
  });
});
