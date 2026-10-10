import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.DECK_URL || 'http://localhost:4173';
await mkdir('exports', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.frame').count(), 6);
  assert.equal(await page.locator('.frame:visible').count(), 1);
  assert.equal(await page.locator('.frame.active').getAttribute('id'), 'slide-1');
  const imagesOK = await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  assert.ok(imagesOK, 'Images must load');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.frame.active').getAttribute('id'), 'slide-2');
  await page.keyboard.press('n');
  assert.ok(await page.locator('#notes-panel').isVisible());
  assert.match(await page.locator('#notes-text').textContent(), /Owner/);
  await page.keyboard.press('n');
  await page.locator('#sources').click();
  assert.ok(await page.locator('#source-dialog').isVisible());
  assert.equal(await page.locator('#source-dialog article').count(), 7);
  await page.keyboard.press('Escape');
  assert.ok(!(await page.locator('#source-dialog').isVisible()));
  await page.locator('#overview').click();
  assert.equal(await page.locator('.frame:visible').count(), 6);
  await page.screenshot({ path: 'exports/overview.png', fullPage: true, animations: 'disabled' });
  await page.locator('#slide-4').click();
  assert.equal(await page.locator('.frame.active').getAttribute('id'), 'slide-4');
  assert.equal(await page.locator('.frame:visible').count(), 1);
  await page.keyboard.press('f');
  assert.ok(await page.evaluate(() => document.body.classList.contains('is-presenting')));
  await page.keyboard.press('f');
  assert.ok(await page.evaluate(() => !document.body.classList.contains('is-presenting')));
  const overflow = [];
  for (let index = 1; index <= 6; index++) {
    await page.goto(`${url}/#slide-${index}`);
    await page.evaluate(() => window.finishDeckAnimations());
    await page.screenshot({ path: `exports/slide-${index}.png`, animations: 'disabled' });
    const bad = await page.locator('.frame.active .slide-content').evaluate(root => {
      if (root.closest('.cover,.closing')) return [];
      const area = root.getBoundingClientRect();
      return [...root.querySelectorAll('h2,h3,p,small,.bmc-footnote,.thesis,.money-line,.issue-stats')].flatMap(element => {
        const r = element.getBoundingClientRect();
        return r.bottom > area.bottom + 2 || r.right > area.right + 2
          ? [{ text: element.textContent.slice(0, 80), bottom: r.bottom, limit: area.bottom }]
          : [];
      });
    });
    if (bad.length) overflow.push({ slide: index, bad });
  }
  assert.deepEqual(overflow, [], `Content exceeds safe slide area: ${JSON.stringify(overflow)}`);
  await page.goto(`${url}/#slide-4`);
  await page.waitForTimeout(2000);
  const actualCounts = await page.locator('.chart-value').allTextContents();
  assert.deepEqual(actualCounts, ['48,886', '36,540', '14,253']);
  await page.keyboard.press('r');
  assert.equal(await page.locator('.frame.active').getAttribute('id'), 'slide-4');
  assert.ok(await page.locator('.chart-bar').first().evaluate(el => getComputedStyle(el).animationName === 'bar-grow'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${url}/#slide-1`);
  assert.ok(await page.locator('.cover h1').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Reduced motion must disable animation');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}/#slide-1`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile must not overflow horizontally');
  await page.screenshot({ path: 'exports/mobile.png', fullPage: true, animations: 'disabled' });
  await page.locator('#notes').click();
  assert.ok(await page.locator('#notes-panel').isVisible());
  await page.locator('#overview').click();
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.frame:visible').count(), 6);
  assert.ok(!(await page.locator('.toolbar').isVisible()));
  assert.ok(!(await page.locator('#notes-panel').isVisible()));
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.equal(pageCount, 6, 'PDF must have exactly 6 pages');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  const report = { slides: 6, pdfPages: pageCount, browserErrors: errors, overflow, checks: ['Keyboard navigation', 'Speaker notes', 'Sources dialog + Escape', 'Overview and slide selection', 'Images + local fonts', 'Fullscreen presentation', 'Proportional BPS chart', 'Animated counts reach exact source values', 'Replay animation', 'Reduced motion', '390px mobile', 'Print from overview with notes enabled'], verifiedAt: new Date().toISOString() };
  await writeFile('exports/check-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
