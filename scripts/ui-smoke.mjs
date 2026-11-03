import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const nav = (name) =>
    page.getByRole("button", { name: name + "快捷入口", exact: true }).click();
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#canvas rect").waitFor();
  for (const selector of [".creation", ".machine", ".inspection", ".job-panel"])
    assert.equal(await page.locator(selector).isVisible(), false);
  const placeholderSize = () =>
    page
      .locator(".canvas-placeholder")
      .evaluate((el) => el.getBoundingClientRect().width);
  const initialPlaceholder = await placeholderSize();
  await page.locator("#zoomIn").click();
  assert.ok(
    Math.abs((await placeholderSize()) / initialPlaceholder - 1.25) < 0.03,
  );
  await page.locator("#fitCanvas").click();
  await nav("叠图");
  await page.waitForFunction(
    (width) =>
      Math.abs(
        document.querySelector(".canvas-placeholder").getBoundingClientRect()
          .width - width,
      ) < 1,
    initialPlaceholder,
  );
  assert.ok(
    await page
      .locator(".inspection")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top >=
          el.previousElementSibling.getBoundingClientRect().bottom,
      ),
  );
  await page.getByRole("button", { name: "关闭检查面板", exact: true }).click();
  await page.waitForFunction(
    (width) =>
      Math.abs(
        document.querySelector(".canvas-placeholder").getBoundingClientRect()
          .width - width,
      ) < 1,
    initialPlaceholder,
  );
  const centerWidth = await page
    .locator(".studio")
    .evaluate((el) => el.getBoundingClientRect().width);
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--yellow")
        .trim(),
    ),
    "#fffa00",
  );
  await page.screenshot({ path: "endfield-preview.png", fullPage: true });
  await nav("排版");
  await page.locator("#text").fill("关闭后仍然保留");
  await nav("控制");
  assert.ok(
    (await page
      .locator(".studio")
      .evaluate((el) => el.getBoundingClientRect().width)) <
      centerWidth - 400,
  );
  assert.equal(await page.locator(".creation").isVisible(), true);
  await page
    .getByRole("button", { name: "关闭内容编排面板", exact: true })
    .click();
  await nav("排版");
  assert.equal(await page.locator("#text").inputValue(), "关闭后仍然保留");
  await nav("排版");
  assert.equal(await page.locator(".creation").isVisible(), false);
  await nav("设置");
  await page.locator(".calibration-details summary").click();
  for (const panel of ["settings", "motion"]) {
    if (panel === "motion") await nav("控制");
    const metrics = await page
      .locator(".machine .panel-scroll")
      .evaluate((el) => ({
        overflow: getComputedStyle(el).overflowY,
        height: el.clientHeight,
        scroll: el.scrollHeight,
      }));
    assert.equal(metrics.overflow, "visible");
    assert.ok(metrics.scroll <= metrics.height + 1);
  }
  await nav("设置");
  assert.equal(await page.locator("#pane-settings").isVisible(), true);
  await page
    .getByRole("button", { name: "关闭设备控制面板", exact: true })
    .click();
  await nav("设置");
  assert.equal(
    await page.locator(".calibration-details").getAttribute("open"),
    "",
  );
  await nav("排版");
  await nav("作业");
  await nav("代码");
  const project = {
    version: 2,
    coordinateSystem: "paper-top-left-z-down",
    photos: {},
    cfg: { width: 210, height: 40, up: -3, down: 0, feed: 800, zFeed: 100 },
    elements: [
      {
        id: "a",
        name: "测试路径",
        paths: [
          [
            [0, 0],
            [30, 0],
            [30, 10],
          ],
        ],
        x: 20,
        y: 20,
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
  assert.equal(await page.locator(".canvas-placeholder").count(), 0);
  await page.locator("#layers button").click();
  await page.locator("#generate").click();
  assert.match(await page.locator("#code").inputValue(), /G1 X20 Y20 F1500/);
  const before = await page
    .locator("#canvas")
    .evaluate((el) => el.getBoundingClientRect().width);
  await page.locator("#zoomIn").click();
  assert.notEqual(
    await page
      .locator("#canvas")
      .evaluate((el) => el.getBoundingClientRect().width),
    before,
  );
  await page.locator("#fitCanvas").click();
  const narrowPaper = await page
    .locator("#canvas")
    .evaluate((el) => el.getBoundingClientRect().width);
  await page
    .getByRole("button", { name: "关闭内容编排面板", exact: true })
    .click();
  await page
    .getByRole("button", { name: "关闭设备控制面板", exact: true })
    .click();
  await page
    .getByRole("button", { name: "关闭作业执行面板", exact: true })
    .click();
  await page.waitForFunction(
    (width) =>
      document.querySelector("#canvas").getBoundingClientRect().width > width,
    narrowPaper,
  );
  await nav("终端");
  await page.locator("#command").fill("$$");
  await page.locator("#send").click();
  assert.match(await page.locator("#toast").textContent(), /连接串口/);
  await page.getByRole("button", { name: "关闭检查面板", exact: true }).click();
  await nav("代码");
  assert.match(await page.locator("#code").inputValue(), /G1 X20 Y20 F1500/);
  for (const width of [1600, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["排版", "控制", "作业"]) {
      const button = page.getByRole("button", {
        name: name + "快捷入口",
        exact: true,
      });
      if ((await button.getAttribute("aria-pressed")) !== "true")
        await button.click();
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "overflow at " + width,
    );
    assert.equal(
      await page
        .locator(".machine .panel-scroll")
        .evaluate((el) => getComputedStyle(el).overflowY),
      "visible",
    );
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "关闭检查面板", exact: true }).click();
  await page.screenshot({
    path: "endfield-panels-preview.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Dock UI passed: default closed, independent toggles, close/reopen state, no device scroll, canvas refit, G-code, 390–1600px.",
  );
} finally {
  await browser.close();
}
