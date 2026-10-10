import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Use external browser-test tooling; no animation or browser dependency ships with the app.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
const url = process.env.LANDING_URL ?? "http://localhost:3000";

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.framesDrawn = { mesh: 0, flow: 0 };
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) {
      if (this.canvas.classList.contains("og-hero-mesh")) window.framesDrawn.mesh++;
      return draw.apply(this, args);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains("og-hero-flow")) window.framesDrawn.flow++;
      return clear.apply(this, args);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector('.og-hero-mesh[data-ready="true"]');
  await page.waitForSelector('.og-hero-flow[data-ready="true"]');
  await page.waitForTimeout(200);
  const counts = () => page.evaluate(() => ({ ...window.framesDrawn }));
  let before = await counts();
  await page.waitForTimeout(200);
  let after = await counts();
  assert.ok(after.mesh > before.mesh && after.flow > before.flow, "both layers animate");
  await page.getByRole("button", { name: "Pause background" }).click();
  await page.waitForTimeout(100);
  before = await counts();
  await page.waitForTimeout(200);
  assert.deepEqual(await counts(), before, "pause stops both renderers");
  await page.getByRole("button", { name: "Resume background" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  before = await counts();
  await page.waitForTimeout(200);
  assert.deepEqual(await counts(), before, "live reduced-motion stops rendering");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    assert.ok(await page.locator(".og-hero canvas").evaluateAll((cs) => cs.every((c) => c.width * c.height <= 1_200_000)), "bounded render resolution");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`);
  }
  await page.locator(".og-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  before = await counts();
  await page.waitForTimeout(200);
  assert.deepEqual(await counts(), before, "off-screen hero stops rendering");
  const contrasts = await page.evaluate(() => {
    const luminance = (rgb) => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return [[".og-gallery-heading .og-kicker", ".og-gallery-section"], [".og-footer-top > p", ".og-footer"]].map(([text, surface]) => {
      const values = [luminance(getComputedStyle(document.querySelector(text)).color), luminance(getComputedStyle(document.querySelector(surface)).backgroundColor)].sort((a, b) => b - a);
      return (values[0] + .05) / (values[1] + .05);
    });
  });
  assert.ok(contrasts.every((n) => n >= 4.5), "dark sections have readable text");
  assert.deepEqual(errors, []);
  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl" || type === "webgl2" ? null : original.call(this, type, ...args);
    };
  });
  await fallback.goto(url, { waitUntil: "networkidle" });
  await fallback.waitForSelector('.og-hero-flow[data-ready="true"]');
  assert.equal(await fallback.locator(".og-hero-mesh").getAttribute("data-ready"), null);
  assert.ok(await fallback.locator("#hero-title").isVisible(), "fallback keeps the headline");
  assert.ok(await fallback.locator(".og-hero").getByRole("link", { name: "Explore venues" }).isVisible(), "fallback keeps the primary action");
  console.log("PASS: mesh/flow render, pause, reduced-motion, off-screen suspension, pixel cap, responsive layout, dark contrast, and WebGL fallback.");
} finally {
  await browser.close();
}
