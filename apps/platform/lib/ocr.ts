import path from "node:path";
import { createWorker } from "tesseract.js";
import { getDocumentProxy, renderPageAsImage } from "unpdf";

/** Batas pemrosesan supaya satu unggahan tidak menahan server. */
export const OCR_MAX_PAGES = 8;

let workerP: ReturnType<typeof createWorker> | null = null;
const worker = () => (workerP ??= createWorker(["ind", "eng"], 1, { cachePath: path.join(process.cwd(), ".ocr-cache"), logger: () => {} }));

/** OCR satu gambar (PNG/JPEG). Teks dikembalikan apa adanya; validasi kutipan dan redaksi dilakukan di pipeline berikutnya. */
export async function ocrImage(img: Uint8Array | Buffer): Promise<string> {
  const w = await worker();
  const { data } = await w.recognize(Buffer.from(img));
  return data.text.trim();
}

/** Halaman PDF hasil pindai: render tiap halaman ke gambar lalu OCR. */
export async function ocrPdf(buf: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const n = Math.min(pdf.numPages, OCR_MAX_PAGES);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const png = await renderPageAsImage(new Uint8Array(buf), i, { scale: 2, canvas: async () => { const m: any = await import("@napi-rs/canvas"); return m.createCanvas ? m : m.default; } });
    out.push(await ocrImage(new Uint8Array(png)));
  }
  return out;
}

export const isImage = (name: string, mime: string) => /^image\//i.test(mime) || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name);
