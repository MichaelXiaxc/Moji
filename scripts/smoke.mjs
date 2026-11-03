import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  for (const name of ["控制快捷入口", "排版快捷入口", "作业快捷入口"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("tab", { name: "运笔设置", exact: true }).click();
  assert.equal(await page.locator("#up").inputValue(), "-3");
  await page.getByRole("tab", { name: "手动控制", exact: true }).click();
  assert.match(await page.locator("#zero").textContent(), /X0 Y0/);
  assert.match(await page.locator("#zeroZ").textContent(), /Z0/);
  assert.equal(
    await page
      .getByRole("button", { name: "↑ Y−", exact: true })
      .getAttribute("data-dir"),
    "-1",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "↓ Y＋", exact: true })
      .getAttribute("data-dir"),
    "1",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "抬笔 Z−", exact: true })
      .getAttribute("data-dir"),
    "-1",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "落笔 Z＋", exact: true })
      .getAttribute("data-dir"),
    "1",
  );
  await page.getByRole("tab", { name: "矢量图", exact: true }).click();
  await page.locator("#svgFile").setInputFiles({
    name: "test.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(3 4)"><path d="m0 0 l10 0 l0 10 z m20 0 l10 0"/></g></svg>',
    ),
  });
  await page.locator("#layers button").waitFor();
  await page.locator("#generate").click();
  assert.ok((await page.locator("#code").inputValue()).includes("G21\nG90"));
  assert.equal(await page.locator(".element polyline").count(), 2);
  await page.getByRole("tab", { name: "文字", exact: true }).click();
  await page.locator("#fontFile").setInputFiles("C:/Windows/Fonts/arial.ttf");
  await page.locator("#fontName").filter({ hasText: "arial.ttf" }).waitFor();
  await page.locator("#text").fill("Hello\nGRBL");
  await page.locator("#addText").click();
  assert.equal(await page.locator("#layers button").count(), 2);
  await page.locator("#generate").click();
  assert.ok(
    (await page.locator("#code").inputValue()).split("\n").length > 100,
  );
  await page.locator("#ex").fill("250");
  await page.locator("#apply").click();
  await page.locator("#generate").click();
  assert.match(await page.locator("#toast").textContent(), /超出/);
  await page.locator("#ex").fill("20");
  await page.locator("#apply").click();
  await page.screenshot({ path: "preview.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: SVG subpaths, font outlines, G-code, bounds, no runtime errors.",
  );
} finally {
  await browser.close();
}
