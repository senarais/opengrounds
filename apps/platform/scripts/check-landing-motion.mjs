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
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('.og-hero-mesh[data-ready="true"]');
  await page.waitForSelector('.og-hero-flow[data-ready="true"]');
  await page.waitForTimeout(200);
  const header = page.locator(".og-header");
  const surface = () => header.evaluate((el) => getComputedStyle(el).backgroundColor);
  const headerHeight = (await header.boundingBox()).height;
  const heroTop = await page.locator(".og-hero").evaluate((el) => el.getBoundingClientRect().top + scrollY);
  assert.equal(await surface(), "rgba(0, 0, 0, 0)", "header is transparent over the hero");
  assert.ok(Math.abs((await header.boundingBox()).y - heroTop) < 1, "hero starts behind the navigation");
  await page.evaluate(() => scrollTo(0, 80));
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".og-header")).backgroundColor === "rgb(255, 255, 255)");
  assert.equal((await header.boundingBox()).height, headerHeight, "scroll does not resize navigation");
  assert.equal((await header.boundingBox()).y, 0, "white header remains sticky");
  assert.equal(await page.locator(".og-hero").evaluate((el) => el.getBoundingClientRect().top + scrollY), heroTop, "surface change does not shift the hero");
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".og-header")).backgroundColor === "rgba(0, 0, 0, 0)");
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
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeroTop = await page.locator(".og-hero").evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".og-header")).backgroundColor === "rgb(255, 255, 255)");
  assert.equal(await page.locator(".og-hero").evaluate((el) => el.getBoundingClientRect().top + scrollY), mobileHeroTop, "mobile menu overlays rather than pushing the hero");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#og-mobile-nav").isVisible(), false);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => !document.querySelector(".og-header").hasAttribute("data-open"));
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
  await fallback.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await fallback.waitForSelector('.og-hero-flow[data-ready="true"]');
  assert.equal(await fallback.locator(".og-hero-mesh").getAttribute("data-ready"), null);
  assert.ok(await fallback.locator("#hero-title").isVisible(), "fallback keeps the headline");
  assert.ok(await fallback.locator(".og-hero").getByRole("link", { name: "Explore venues" }).isVisible(), "fallback keeps the primary action");
  console.log("PASS: transparent/sticky header, stable layout, mobile menu, mesh/flow render, pause, reduced-motion, off-screen suspension, pixel cap, dark contrast, and WebGL fallback.");
} finally {
  await browser.close();
}
