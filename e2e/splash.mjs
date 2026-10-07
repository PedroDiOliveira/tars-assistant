/** Run against a running app: BASE=http://localhost:3001 npm run test:splash */
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, webkit } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const engine = process.env.BROWSER || "chromium";
const browser = await ({ chromium, webkit }[engine]).launch();
const options = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
};
const errors = [];
const ready = (page) => page.locator('.app-launch[data-launch-phase="ready"]').waitFor();
const playing = (page) => page.locator('.app-launch[data-launch-phase="playing"]').waitFor();
const pass = (name) => console.log(`PASS [${engine}] ${name}`);

function watch(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

// The browser cannot synthesize a real iOS home-screen launch. Exercise the same lifecycle
// events deterministically; the native launch image still needs a physical-device check.
async function resume(page) {
  await page.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
      document.dispatchEvent(new Event("visibilitychange"));
    }
    delete document.visibilityState;
  });
}

try {
  fs.mkdirSync("e2e/artifacts", { recursive: true });
  const context = await browser.newContext(options);
  const page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}/inicio`);
  await playing(page);
  assert.equal(await page.locator(".app-content").evaluate((el) => el.inert), true);
  assert.equal(await page.getByRole("status", { name: "Abrindo Tars" }).count(), 1);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest(".app-content")), false);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `e2e/artifacts/splash-${engine}.png` });
  await ready(page);
  assert.equal(await page.locator(".app-content").evaluate((el) => el.inert), false);
  assert.equal(await page.locator(".launch-screen").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
  pass("Cold launch reveals the app and restores keyboard/touch access");

  await page.getByRole("link", { name: "Finanças", exact: true }).click();
  await page.waitForURL("**/financas");
  assert.equal(await page.locator(".launch-screen").count(), 0);
  await resume(page);
  assert.equal(await page.locator(".launch-screen").count(), 0);
  pass("Internal navigation and ordinary browser tab switches do not replay");

  await page.reload();
  await playing(page);
  await ready(page);
  assert.equal(new URL(page.url()).pathname, "/financas");
  pass("Reload replays the intro without changing the destination");

  const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) =>
    els.map((el) => ({ href: el.href, media: el.media })),
  );
  assert.equal(links.length, 13);
  for (const link of links) {
    const response = await context.request.get(link.href);
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /image\/png/);
    const png = await response.body();
    const [width, height] = new URL(link.href).pathname.split("/").at(-1).split("x").map(Number);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.match(link.media, /orientation: portrait/);
  }
  assert.equal((await context.request.get(`${BASE}/startup/invalid`)).status(), 404);
  const manifest = await (await context.request.get(`${BASE}/manifest.webmanifest`)).json();
  assert.equal(manifest.background_color, "#084734");
  pass("All 13 iPhone launch images have matching PNG sizes and manifest color");

  await context.close();

  const installed = await browser.newContext({ ...options, colorScheme: "dark" });
  await installed.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  });
  const app = await installed.newPage();
  watch(app);
  await app.goto(`${BASE}/login`);
  await ready(app);
  await app.getByRole("textbox", { name: "E-mail" }).fill("test@tars.example");
  await resume(app);
  await playing(app);
  // Reopen again during the intro: old timers must not dismiss the new animation.
  await app.waitForTimeout(600);
  await resume(app);
  await playing(app);
  await app.waitForTimeout(1600);
  assert.equal(await app.locator(".app-launch").getAttribute("data-launch-phase"), "playing");
  await ready(app);
  assert.equal(await app.getByRole("textbox", { name: "E-mail" }).inputValue(), "test@tars.example");
  pass("Installed resume replays, cancels stale timers and preserves form state");

  await app.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await playing(app);
  await ready(app);
  pass("Restoring a cached installed page replays the intro");
  await installed.close();

  const reduced = await browser.newContext({ ...options, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  watch(reducedPage);
  await reducedPage.goto(`${BASE}/inicio`);
  await ready(reducedPage);
  assert.ok(await reducedPage.evaluate(() => performance.now()) < 2000, "Reduced motion should skip the long intro");
  pass("Reduced motion opens promptly without the blade animation");
  await reduced.close();

  // Narrow portrait and landscape retain the logo, wordmark and footer without overflow.
  for (const viewport of [{ width: 320, height: 568 }, { width: 852, height: 393 }]) {
    const small = await browser.newContext({ ...options, viewport });
    const smallPage = await small.newPage();
    watch(smallPage);
    await smallPage.goto(`${BASE}/inicio`);
    await playing(smallPage);
    assert.equal(await smallPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const wordmark = await smallPage.locator(".launch-wordmark").boundingBox();
    const footer = await smallPage.locator(".launch-footer").boundingBox();
    assert.ok(wordmark.y + wordmark.height < footer.y);
    await ready(smallPage);
    await small.close();
  }
  pass("Small phones and landscape have no overflow or overlapping text");

  const noJS = await browser.newContext({ ...options, javaScriptEnabled: false });
  const noJSPage = await noJS.newPage();
  await noJSPage.goto(`${BASE}/inicio`);
  assert.equal(await noJSPage.locator("noscript p").isVisible(), true);
  assert.match(await noJSPage.locator("noscript p").textContent(), /Este app precisa de JavaScript/);
  assert.equal(await noJSPage.locator(".launch-screen").isVisible(), false);
  await noJS.close();
  pass("Disabled JavaScript shows the existing explanation instead of a stuck splash");

  const blocked = await browser.newContext(options);
  await blocked.route("**/_next/**/*.js*", (route) => route.abort());
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(`${BASE}/inicio`);
  await blockedPage.getByRole("alert").filter({ hasText: "O app não terminou de carregar" }).waitFor({ timeout: 12000 });
  assert.equal(await blockedPage.locator(".launch-screen").count(), 0);
  assert.equal(await blockedPage.getByRole("button", { name: "Recarregar" }).isVisible(), true);
  await blocked.close();
  pass("Failed JavaScript downloads expose the recovery action");

  assert.deepEqual(errors, []);
  pass("No hydration or browser console errors");
} finally {
  await browser.close();
}
