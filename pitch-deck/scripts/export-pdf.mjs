import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = 4174;
const url = `http://127.0.0.1:${port}`;
const output = resolve(process.argv[2] || 'exports/Open-Grounds-Pitch.pdf');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
let browser;
let serverError = '';
server.stderr.on('data', chunk => { serverError += chunk.toString(); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Deck server failed: ${serverError}`);
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Deck server did not become ready.');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  await mkdir(resolve(output, '..'), { recursive: true });
  await page.pdf({ path: output, printBackground: true, preferCSSPageSize: true });
  console.log(`PDF exported: ${output}`);
} catch (error) {
  console.error(error.message);
  console.error('If Chromium is missing, run: pnpm exec playwright install chromium');
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
