import { createHash } from "node:crypto";
import { platformDb } from "./db";

export const BUCKET = "documents";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
/** File data penjualan (CSV/XLSX) hanya untuk jenis sales_data. */
export const SHEET_TYPES = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
export const IMAGE_TYPES = ["image/png", "image/jpeg"];
/** Jenis dokumen yang boleh dilihat publik (foto profil venue). Selebihnya hanya investor KYC dan staf. */
export const PUBLIC_KINDS = ["photo"];

let ensured = false;
async function ensureBucket() {
  if (ensured) return;
  const opts = { public: false, fileSizeLimit: MAX_FILE_BYTES, allowedMimeTypes: [...ALLOWED_TYPES, ...SHEET_TYPES] };
  const { error } = await platformDb().storage.createBucket(BUCKET, opts);
  if (error) {
    if (!/already exists|duplicate/i.test(error.message)) throw new Error(`Storage: ${error.message}`);
    const { error: ue } = await platformDb().storage.updateBucket(BUCKET, opts); // bucket lama belum mengizinkan CSV/XLSX
    if (ue) throw new Error(`Storage: ${ue.message}`);
  }
  ensured = true;
}

/** Browser sering memberi tipe kosong/aneh untuk CSV: tentukan dari ekstensi. */
export function sheetType(file: File): string | null {
  if (/\.csv$/i.test(file.name)) return "text/csv";
  if (/\.xlsx$/i.test(file.name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return null;
}

const safe = (n: string) => n.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);

/** Unggah dokumen ke bucket privat; kembalikan path, sha256, dan ukuran. */
export async function uploadDocument(venueId: string, kind: string, file: File) {
  if (file.size === 0) throw new Error(`File ${file.name} is empty.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`File ${file.name} exceeds the 10 MB limit.`);
  const type = kind === "sales_data" ? (sheetType(file) ?? file.type) : file.type;
  if (kind === "sales_data" ? !SHEET_TYPES.includes(type) : !ALLOWED_TYPES.includes(type)) throw new Error(kind === "sales_data" ? `Unsupported format for ${file.name} · use CSV or XLSX.` : `Unsupported format for ${file.name} · use PDF, PNG, or JPG.`);
  if (kind === "photo" && !IMAGE_TYPES.includes(file.type)) throw new Error(`Photo ${file.name} must be PNG or JPG.`);
  await ensureBucket();
  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const path = `${venueId}/${kind}-${sha256.slice(0, 8)}-${safe(file.name)}`;
  const { error } = await platformDb().storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path, sha256, size: file.size };
}

/** URL bertanda tangan berumur pendek untuk membuka file privat (foto publik, atau dokumen untuk investor KYC/staf). */
export async function signedUrl(path: string, seconds = 300): Promise<string | null> {
  const { data } = await platformDb().storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
