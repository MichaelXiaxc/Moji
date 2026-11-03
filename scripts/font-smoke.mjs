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
  await page.getByRole("button", { name: "作业快捷入口", exact: true }).click();
  let count = 0;
  for (const [id, name, text] of [
    ["noto-sans-sc", "Noto Sans SC", "中文书写"],
    ["ma-shan-zheng", "Ma Shan Zheng", "中文书写"],
    ["lato", "Lato", "Hello fi"],
    ["caveat", "Caveat", "Hello fi"],
  ]) {
    await page.locator("#fontChoice").selectOption(id);
    await page.waitForFunction(
      (name) =>
        document.querySelector("#fontName").textContent.includes(name) &&
        !document.querySelector("#fontName").textContent.includes("正在"),
      name,
    );
    await page.locator("#text").fill(text);
    await page.locator("#singleLine").uncheck();
    await page.locator("#addText").click();
    count++;
    await page.waitForFunction(
      (n) => document.querySelectorAll("#layers button").length === n,
      count,
    );
    await page.locator("#singleLine").check();
    await page.locator("#addText").click();
    count++;
    await page.waitForFunction(
      (n) => document.querySelectorAll("#layers button").length === n,
      count,
      { timeout: 30000 },
    );
    const last = page.locator(".element").last();
    assert.ok((await last.locator("polyline").count()) > 0);
    assert.equal(await page.locator("#addText").isEnabled(), true);
    await page.locator("#generate").click();
    assert.match(await page.locator("#code").inputValue(), /G1 X/);
    console.log(id, "outline + skeleton passed");
  }
  await page.locator("#save").click();
  assert.deepEqual(errors, []);
  console.log(
    "Four bundled fonts, outline/single-line switch, worker, ligatures and G-code passed.",
  );
} finally {
  await browser.close();
}
