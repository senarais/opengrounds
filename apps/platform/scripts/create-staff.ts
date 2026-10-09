/**
 * Buat akun staf platform (operator) dengan email dan kata sandi Anda sendiri. Tidak ada akun bawaan.
 * Jalankan: pnpm --filter @venue-rwa/platform staff:create
 * (atau non-interaktif: --email you@x.com --name "Nama"; kata sandi tetap ditanya tanpa ditampilkan)
 */
import { createInterface } from "node:readline";
import { createStaffAccount } from "../lib/flows/staff";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

function ask(q: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      (rl as any)._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(s); else process.stdout.write("*"); };
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}

(async () => {
  const email = flag("email") ?? (await ask("Email staf: "));
  const name = flag("name") ?? (await ask("Nama: "));
  const password = await ask("Kata sandi (min. 8 karakter): ", true);
  const r = await createStaffAccount({ name, email, password, role: "operator" });
  console.log(`Akun staf dibuat: ${r.email}. Masuk di /login.`);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
