import { test } from "node:test";
import assert from "node:assert/strict";
import { thin, trace } from "../src/skeleton.js";
test("a thick stroke produces a narrow connected centerline", () => {
  const w = 20,
    h = 20,
    bitmap = new Uint8Array(w * h);
  for (let y = 3; y < 16; y++)
    for (let x = 7; x < 12; x++) bitmap[y * w + x] = 1;
  const result = thin(bitmap, w, h),
    paths = trace(result, w, h);
  assert.ok(
    result.reduce((a, b) => a + b, 0) < bitmap.reduce((a, b) => a + b, 0) / 2,
  );
  assert.equal(paths.length, 1);
  assert.ok(paths[0].length >= 2);
  assert.ok(paths[0].every(([x]) => x >= 7 && x < 12));
  assert.equal(bitmap[3 * w + 7], 1, "input bitmap is preserved");
});
test("closed contours retain a closed single-line loop", () => {
  const w = 16,
    h = 16,
    b = new Uint8Array(w * h);
  for (let n = 4; n <= 10; n++) {
    b[4 * w + n] = 1;
    b[10 * w + n] = 1;
    b[n * w + 4] = 1;
    b[n * w + 10] = 1;
  }
  const paths = trace(b, w, h);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0][0], paths[0].at(-1));
});
test("isolated dots remain writable, and empty glyphs stay empty", () => {
  const b = new Uint8Array(100);
  b[55] = 1;
  assert.equal(trace(b, 10, 10)[0].length, 2);
  assert.deepEqual(trace(new Uint8Array(100), 10, 10), []);
});
