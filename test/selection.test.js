import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bounds,
  world,
  scaleFromAnchor,
  rotateAboutCenter,
} from "../src/selection.js";
const near = (a, b) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-8));
test("scaling a rotated element keeps its opposite corner fixed", () => {
  const e = { x: 20, y: 35, angle: 37, scale: 1.4 },
    anchor = [5, 7],
    start = world([35, 22], e),
    fixed = world(anchor, e);
  const result = scaleFromAnchor(e, anchor, start, [
    fixed[0] + 2 * (start[0] - fixed[0]),
    fixed[1] + 2 * (start[1] - fixed[1]),
  ]);
  near(world(anchor, result), fixed);
  assert.ok(Math.abs(result.scale - 2.8) < 1e-8);
});
test("rotation preserves center and supports 15-degree snapping", () => {
  const e = { x: 8, y: 12, angle: 0, scale: 2 },
    center = [10, 5],
    fixed = world(center, e),
    start = [fixed[0] + 10, fixed[1]];
  const result = rotateAboutCenter(e, center, start, [fixed[0], fixed[1] + 10]);
  near(world(center, result), fixed);
  assert.equal(result.angle, 90);
  const snap = rotateAboutCenter(
    e,
    center,
    start,
    [fixed[0] + 10, fixed[1] + 2],
    true,
  );
  assert.equal(snap.angle, 15);
});
test("thin paths remain selectable and scale never becomes negative", () => {
  const b = bounds([
    [
      [0, 0],
      [20, 0],
    ],
  ]);
  assert.ok(b.maxY > b.minY);
  assert.equal(bounds([]), null);
  const result = scaleFromAnchor(
    { x: 0, y: 0, angle: 0, scale: 1 },
    [0, 0],
    [10, 0],
    [-5, 0],
  );
  assert.equal(result.scale, 0.001);
});
