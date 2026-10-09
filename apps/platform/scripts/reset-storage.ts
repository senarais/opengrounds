/** Hapus semua file di bucket privat `documents`. Gunakan `--dry` untuk hanya menghitung. */
import { serviceClient } from "@venue-rwa/shared";

const dry = process.argv.includes("--dry");
const sb = serviceClient("platform").storage.from("documents");

async function listAll(prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await sb.list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listAll(path))); // folder
    else out.push(path);
  }
  return out;
}

(async () => {
  let files: string[] = [];
  try { files = await listAll(); } catch (e: any) { if (/not found|does not exist/i.test(e.message)) { console.log("Bucket 'documents' belum ada: tidak ada yang dihapus."); return; } throw e; }
  console.log(`${files.length} file di bucket 'documents'.`);
  if (dry || files.length === 0) return;
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await sb.remove(files.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  console.log("Semua file dihapus.");
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
