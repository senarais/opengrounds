import { createCanvas } from "@napi-rs/canvas";
import { ocrPdf } from "../lib/ocr";

/** PDF "hasil pindai": satu halaman berisi gambar JPEG, tanpa lapisan teks. */
function scannedPdf(jpeg: Buffer, w: number, h: number) {
  const parts: Buffer[] = []; const off: number[] = []; let len = 0;
  const push = (b: Buffer | string) => { const x = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); parts.push(x); len += x.length; };
  const obj = (n: number, body: Buffer | string) => { off.push(len); push(`${n} 0 obj\n`); push(body); push("\nendobj\n"); };
  push("%PDF-1.4\n");
  obj(1, "<</Type/Catalog/Pages 2 0 R>>");
  obj(2, "<</Type/Pages/Kids[3 0 R]/Count 1>>");
  obj(3, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w} ${h}]/Contents 4 0 R/Resources<</XObject<</Im0 5 0 R>>>>>>`);
  const cs = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  obj(4, `<</Length ${cs.length}>>\nstream\n${cs}\nendstream`);
  obj(5, Buffer.concat([Buffer.from(`<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>\nstream\n`, "latin1"), jpeg, Buffer.from("\nendstream", "latin1")]));
  const x = len;
  push(`xref\n0 6\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`);
  return new Uint8Array(Buffer.concat(parts));
}
async function main() {
  const c = createCanvas(900, 200);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 900, 200);
  g.fillStyle = "#000"; g.font = "40px sans-serif";
  g.fillText("Masa sewa tersisa 36 bulan", 40, 110);
  const t = await ocrPdf(scannedPdf(c.toBuffer("image/jpeg"), 900, 200));
  console.log(t);
  const ok = /sewa/i.test(t[0] ?? "") && /36/.test(t[0] ?? "");
  console.log(ok ? "OCR PDF OK" : "OCR PDF GAGAL");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("ERR:", String(e?.message ?? e).slice(0, 300)); process.exit(1); });
