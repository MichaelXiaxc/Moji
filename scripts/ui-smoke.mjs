import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.locator("#canvas rect").waitFor();
  await page.locator("#text").fill("测试文字保留");
  await page.getByRole("tab", { name: "矢量图", exact: true }).click();
  await page.getByRole("tab", { name: "文字", exact: true }).click();
  assert.equal(await page.locator("#text").inputValue(), "测试文字保留");
  const initial = await page.locator("#canvas").getAttribute("viewBox");
  await page.getByRole("button", { name: "放大画布", exact: true }).click();
  assert.notEqual(
    await page.locator("#canvas").getAttribute("viewBox"),
    initial,
  );
  await page.locator("#fitCanvas").click();
  assert.equal(await page.locator("#canvas").getAttribute("viewBox"), initial);
  const project = {
    version: 2,
    coordinateSystem: "paper-top-left-z-down",
    photos: {},
    cfg: { width: 210, height: 297, up: -3, down: 0, feed: 800, zFeed: 100 },
    elements: [
      {
        id: "a",
        name: "测试路径",
        paths: [
          [
            [0, 0],
            [30, 0],
            [30, 30],
          ],
        ],
        x: 20,
        y: 20,
        scale: 1,
        angle: 0,
      },
    ],
  };
  await page
    .locator("#open")
    .setInputFiles({
      name: "test.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.locator("#layers button").click();
  await page.locator("#generate").click();
  await page.locator(".inspection>summary").click();
  await page.getByRole("tab", { name: "G-code", exact: true }).click();
  assert.match(await page.locator("#code").inputValue(), /G0 X20 Y20/);
  await page.getByRole("tab", { name: "串口终端", exact: true }).click();
  await page.locator("#command").fill("$$");
  await page.locator("#send").click();
  assert.match(await page.locator("#toast").textContent(), /连接串口/);
  await page.locator(".inspection>summary").click();
  for (const width of [1600, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `horizontal overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.reload();
  await page.locator("#canvas rect").waitFor();
  await page.screenshot({ path: "design-preview.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "UI smoke passed: tabs preserve input, zoom, project import, generation, console, responsive widths 390–1600.",
  );
} finally {
  await browser.close();
}
