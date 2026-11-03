import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.serialWrites = [];
    let state = "Idle",
      controller;
    const emit = (line) =>
      controller.enqueue(new TextEncoder().encode(line + "\r\n"));
    const port = {
      getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }),
      open: async () => {},
      close: async () => {},
      readable: new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
      writable: new WritableStream({
        write(bytes) {
          const s = new TextDecoder().decode(bytes);
          window.serialWrites.push(s);
          if (s === "?") emit(`<${state}|MPos:0,0,0>`);
          else if (s === "$SLP\n") {
            state = "Sleep";
            emit("ok");
            emit("[MSG:Sleeping]");
          } else if (s === "\x18") {
            state = "Alarm";
            emit("Grbl 1.3a ['$' for help]");
          } else if (s === "$X\n") {
            state = "Idle";
            emit("ok");
          } else emit("ok");
        },
      }),
    };
    Object.defineProperty(navigator, "serial", {
      value: { requestPort: async () => port },
      configurable: true,
    });
  });
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "控制快捷入口", exact: true }).click();
  await page.getByRole("button", { name: "作业快捷入口", exact: true }).click();
  assert.equal(await page.locator("#motorPower").isDisabled(), true);
  await page.locator("#connect").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("Idle"),
  );
  await page.locator("#verified").check();
  await page.locator("#motorPower").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#motorPower").getAttribute("aria-pressed") ===
      "true",
  );
  assert.equal(await page.locator("#verified").isChecked(), false);
  await page
    .getByRole("button", { name: "关闭设备控制面板", exact: true })
    .click();
  await page.getByRole("button", { name: "控制快捷入口", exact: true }).click();
  assert.equal(
    await page.locator("#motorPower").getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "X＋ →", exact: true }).click();
  assert.match(await page.locator("#toast").textContent(), /休眠/);
  await page.locator("#motorPower").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("Alarm"),
  );
  assert.equal(await page.locator("#unlock").isVisible(), true);
  await page.locator("#unlock").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("Idle"),
  );
  assert.deepEqual(
    (await page.evaluate(() => window.serialWrites)).filter((s) => s !== "?"),
    ["$SLP\n", "\x18", "$X\n"],
  );
  assert.equal(await page.locator("#verified").isChecked(), false);
  assert.deepEqual(errors, []);
  console.log(
    "Power smoke passed: sleep, confirmed state, jog blocked, reset wake, explicit unlock, no motion commands.",
  );
} finally {
  await browser.close();
}
