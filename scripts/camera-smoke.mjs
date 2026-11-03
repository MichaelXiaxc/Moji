import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#canvas rect").waitFor();
  const view = () =>
    page.locator("#canvas").evaluate((el) => {
      const v = el.getBoundingClientRect();
      return Object.fromEntries(
        Object.entries({ x: v.x, y: v.y, w: v.width, h: v.height }).map(
          ([k, n]) => [k, Number(n.toFixed(3))],
        ),
      );
    });
  const box = await page.locator("#canvas").boundingBox(),
    mouse = {
      x: Math.floor(box.x + box.width * 0.6),
      y: Math.floor(box.y + box.height * 0.5),
    };
  const world = () =>
    page.locator("#canvas").evaluate((el, p) => {
      const v = new DOMPoint(p.x, p.y).matrixTransform(
        el.getScreenCTM().inverse(),
      );
      return [v.x, v.y];
    }, mouse);
  const start = await view(),
    anchor = await world(),
    scroll = await page.evaluate(() => scrollY);
  await page.mouse.move(mouse.x, mouse.y);
  await page.mouse.wheel(0, -240);
  await page.waitForFunction(
    () => document.querySelector("#zoomLabel").textContent !== "100%",
  );
  const after = await world();
  assert.ok(Math.hypot(after[0] - anchor[0], after[1] - anchor[1]) < 0.01);
  assert.equal(await page.evaluate(() => scrollY), scroll);
  const zoomed = await view();
  await page.mouse.down();
  await page.mouse.move(mouse.x + 35, mouse.y + 25, { steps: 8 });
  await page.mouse.up();
  const panned = await view();
  assert.ok(panned.x > zoomed.x && panned.y > zoomed.y);
  assert.equal(panned.w, zoomed.w);
  await page.mouse.move(mouse.x, mouse.y);
  await page.mouse.down();
  await page.mouse.move(mouse.x - 30, mouse.y - 20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const canceled = await view();
  assert.ok(
    Math.abs(canceled.x - panned.x) < 0.001 &&
      Math.abs(canceled.y - panned.y) < 0.001,
  );
  await page.locator("#fitCanvas").click();
  assert.deepEqual(await view(), start);
  await page.mouse.move(mouse.x, mouse.y);
  await page.mouse.down();
  await page.mouse.move(mouse.x + 30, mouse.y + 20);
  await page.mouse.up();
  assert.deepEqual(await view(), start);
  const stage = await page.locator("#stage").boundingBox();
  await page.mouse.move(
    Math.floor(stage.x + 20),
    Math.floor(stage.y + stage.height / 2),
  );
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(
    () => document.querySelector("#zoomLabel").textContent !== "100%",
  );
  assert.ok((await view()).w > start.w);
  await page.locator("#fitCanvas").click();
  await page.getByRole("button", { name: "排版快捷入口", exact: true }).click();
  await page.getByRole("button", { name: "作业快捷入口", exact: true }).click();
  const project = {
    version: 2,
    coordinateSystem: "paper-top-left-z-down",
    photos: {},
    cfg: { width: 210, height: 297, up: -3, down: 0, feed: 800, zFeed: 100 },
    elements: [
      {
        id: "test",
        name: "camera-test",
        paths: [
          [
            [0, 0],
            [20, 0],
            [20, 15],
          ],
        ],
        x: 80,
        y: 120,
        scale: 1,
        angle: 0,
      },
    ],
  };
  await page.locator("#open").setInputFiles({
    name: "test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.locator("#generate").click();
  const code = await page.locator("#code").inputValue();
  await page.locator("#zoomIn").click();
  const b = await page.locator("#canvas").boundingBox();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7 + 15, b.y + b.height * 0.7 + 20);
  await page.mouse.up();
  await page.locator("#generate").click();
  assert.equal(await page.locator("#code").inputValue(), code);
  await page.locator("#layers button").click();
  const element = await page.locator(".selection-box").boundingBox();
  await page.mouse.move(
    element.x + element.width / 2,
    element.y + element.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    element.x + element.width / 2 + 20,
    element.y + element.height / 2 + 10,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.ok(Number(await page.locator("#ex").inputValue()) > 80);
  assert.deepEqual(errors, []);
  console.log(
    "Camera passed: cursor-anchored wheel zoom, no page scroll, blank-area pan, Escape, fit, no pan at 100%, unchanged G-code, element drag after pan.",
  );
} finally {
  await browser.close();
}
