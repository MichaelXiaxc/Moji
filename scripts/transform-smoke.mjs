import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "排版快捷入口", exact: true }).click();
  const center = async (selector) => {
    const b = await page.locator(selector).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const value = (id) =>
    page
      .locator("#" + id)
      .inputValue()
      .then(Number);
  const drag = async (start, end) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
  };
  async function exercise() {
    assert.equal(await page.locator(".selection-handle").count(), 8);
    const p = await center(".selection-box"),
      x = await value("ex");
    await drag(p, { x: p.x + 28, y: p.y + 22 });
    assert.ok((await value("ex")) > x);
    await page.locator("#zoomIn").click();
    const corner = await center('[data-handle="se"]'),
      scale = await value("scale");
    const anchor = await center('[data-handle="nw"]');
    await drag(corner, { x: corner.x + 35, y: corner.y + 20 });
    assert.ok((await value("scale")) > scale);
    const fixed = await center('[data-handle="nw"]');
    assert.ok(Math.hypot(fixed.x - anchor.x, fixed.y - anchor.y) < 1);
    const c = await center(".selection-box"),
      r = await center(".rotation-handle");
    await drag(r, { x: c.x - (r.y - c.y), y: c.y + (r.x - c.x) });
    assert.ok(Math.abs((await value("angle")) - 90) < 1);
    const old = await value("ex"),
      move = await center(".selection-box");
    await page.mouse.move(move.x, move.y);
    await page.mouse.down();
    await page.mouse.move(move.x + 20, move.y + 15);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await value("ex"), old);
    await page.locator("#fitCanvas").click();
  }
  await page.locator("#fontFile").setInputFiles("C:/Windows/Fonts/arial.ttf");
  await page.locator("#fontName").filter({ hasText: "arial.ttf" }).waitFor();
  await page.locator("#text").fill("MOJI");
  await page.locator("#fontSize").fill("18");
  await page.locator("#addText").click();
  await exercise();
  await page.getByRole("tab", { name: "矢量图", exact: true }).click();
  await page
    .locator("#svgFile")
    .setInputFiles({
      name: "triangle.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L30 0L30 20Z"/></svg>',
      ),
    });
  await exercise();
  const count = await page.locator(".selection-overlay").count();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".selection-overlay").count(), 0);
  assert.equal(count, 1);
  await page.locator("#layers button").first().click();
  await page.screenshot({ path: "selection-preview.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Transform browser passed: text + SVG move/scale/rotate, fixed anchor, zoom, cancel, deselect, layer selection.",
  );
} finally {
  await browser.close();
}
