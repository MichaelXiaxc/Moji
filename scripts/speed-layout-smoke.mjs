import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  await page.goto("http://127.0.0.1:5173");
  for (const name of ["排版", "设置", "作业", "叠图"])
    await page
      .getByRole("button", { name: name + "快捷入口", exact: true })
      .click();
  const project = {
    version: 2,
    coordinateSystem: "paper-top-left-z-down",
    photos: {},
    cfg: { width: 210, height: 297, up: -3, down: 0, feed: 800, zFeed: 100 },
    elements: [
      {
        id: "a",
        name: "test",
        paths: [
          [
            [0, 0],
            [10, 10],
          ],
        ],
        x: 10,
        y: 20,
        scale: 1,
        angle: 0,
      },
    ],
  };
  await page
    .locator("#open")
    .setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  assert.equal(await page.locator("#travelFeed").inputValue(), "1500");
  await page.locator("#travelFeed").fill("1200");
  await page.locator("#feed").fill("450");
  await page.locator("#zFeed").fill("60");
  await page.locator("#generate").click();
  assert.match(
    await page.locator("#code").inputValue(),
    /G1 Z-3 F60\nG1 X10 Y20 F1200\nG1 Z0 F60\nG1 X20 Y30 F450/,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#save").click();
  const download = await downloadEvent;
  const saved = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(saved.cfg.travelFeed, 1200);
  const before = await page.locator("#canvas").boundingBox();
  await page.getByRole("button", { name: "关闭检查面板", exact: true }).click();
  const after = await page.locator("#canvas").boundingBox();
  assert.ok(Math.abs(before.height - after.height) < 1);
  await page.getByRole("button", { name: "叠图快捷入口", exact: true }).click();
  assert.ok(
    await page
      .locator(".inspection")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top >=
          el.previousElementSibling.getBoundingClientRect().bottom,
      ),
  );
  await page.screenshot({ path: "speed-layout-preview.png", fullPage: true });
  console.log(
    "Independent travel/writing/Z speeds, legacy import, project save and lower dock layout passed.",
  );
} finally {
  await browser.close();
}
