import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, ImportRow, parseCsv, parseRupiah, rowsFromCsv } from "../src";

describe("parseCsv", () => {
  it("kutip, koma dalam kutip, kutip ganda, CRLF, BOM, titik-koma", () => {
    expect(parseCsv('a,b\r\n"x,y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x,y", 'say "hi"']]);
    expect(parseCsv("﻿a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
describe("parseRupiah", () => {
  it("titik ribuan Indonesia; desimal ditolak", () => {
    expect(parseRupiah("Rp 150.000")).toBe(150000);
    expect(parseRupiah("150000")).toBe(150000);
    expect(parseRupiah("1.500.000")).toBe(1500000);
    expect(parseRupiah("150.5")).toBeNull();
    expect(parseRupiah("150,50")).toBeNull();
    expect(parseRupiah("abc")).toBeNull();
  });
});
describe("rowsFromCsv", () => {
  it("template contoh valid", () => {
    const r = rowsFromCsv(CSV_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1]!.method).toBe("cash");
    expect(r.rows[0]!.occurredAt).toBe("2026-09-01T03:00:00.000Z"); // 10:00 WIB
  });
  it("tanggal tanpa zona = WIB", () => {
    const r = rowsFromCsv("ref,tanggal,jumlah,tipe,metode\nA,2026-09-01,1000,penjualan,tunai");
    expect(r.rows[0]!.occurredAt).toBe("2026-09-01T05:00:00.000Z");
  });
  it("galat per baris dengan nomor baris", () => {
    const r = rowsFromCsv("ref,tanggal,jumlah,tipe,metode,psp_ref,ref_asal\nA,2026-09-01,0,penjualan,tunai,,\nB,2026-09-01,1000,penjualan,gateway,,\nC,2026-09-01,1000,refund,tunai,,\nD,bukan-tanggal,1000,penjualan,tunai,,\nE,2026-09-01,1000,x,tunai,,");
    expect(r.rows).toHaveLength(0);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
  });
  it("ref ganda dalam file ditolak; kolom wajib hilang ditolak", () => {
    const r = rowsFromCsv("ref,tanggal,jumlah,tipe,metode\nA,2026-09-01,1000,penjualan,tunai\nA,2026-09-02,1000,penjualan,tunai");
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]!.message).toMatch(/ganda/);
    expect(rowsFromCsv("ref,jumlah\nA,1").errors[0]!.message).toMatch(/Kolom wajib/);
  });
  it("skema API: jumlah harus integer positif", () => {
    const base = { externalRef: "x", occurredAt: "2026-09-01T00:00:00.000Z", kind: "sale", method: "cash" };
    expect(ImportRow.safeParse({ ...base, amount: 1000 }).success).toBe(true);
    expect(ImportRow.safeParse({ ...base, amount: 10.5 }).success).toBe(false);
    expect(ImportRow.safeParse({ ...base, amount: -5 }).success).toBe(false);
  });
});
