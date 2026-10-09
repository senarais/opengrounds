import { createCanvas } from "@napi-rs/canvas";
import { ocrImage, ocrPdf } from "../lib/ocr";

async function main() {
const c = createCanvas(1000, 300);
const g = c.getContext("2d");
g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 300);
g.fillStyle = "#000"; g.font = "36px sans-serif";
g.fillText("PERJANJIAN SEWA LAHAN", 40, 80);
g.fillText("Sisa masa sewa 48 bulan sejak tanggal 1 Januari 2026", 40, 150);
g.fillText("Biaya sewa Rp 12.500.000 per bulan", 40, 220);
const png = c.toBuffer("image/png");
const t = await ocrImage(png);
console.log(t);
const ok = /SEWA/i.test(t) && /48/.test(t) && /12\.500\.000/.test(t);
console.log(ok ? "OCR OK" : "OCR GAGAL");
process.exit(ok ? 0 : 1);
}
main();
