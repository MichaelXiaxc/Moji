export function bounds(paths) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const path of paths)
    for (const [x, y] of path) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (!Number.isFinite(minX)) return null;
  if (maxX - minX < 1) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (maxY - minY < 1) {
    minY -= 0.5;
    maxY += 0.5;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}
const rotate = ([x, y], angle) => {
  const r = (angle * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
export function world(point, element) {
  const [x, y] = rotate(point, element.angle);
  return [element.x + x * element.scale, element.y + y * element.scale];
}
export function scaleFromAnchor(initial, anchor, start, pointer) {
  const fixed = world(anchor, initial),
    vx = start[0] - fixed[0],
    vy = start[1] - fixed[1],
    den = vx * vx + vy * vy;
  if (den < 1e-12) return { ...initial };
  const scale = Math.min(
    10000,
    Math.max(
      0.001,
      (initial.scale *
        ((pointer[0] - fixed[0]) * vx + (pointer[1] - fixed[1]) * vy)) /
        den,
    ),
  );
  const [ax, ay] = rotate(anchor, initial.angle);
  return {
    ...initial,
    scale,
    x: fixed[0] - ax * scale,
    y: fixed[1] - ay * scale,
  };
}
export function rotateAboutCenter(
  initial,
  center,
  start,
  pointer,
  snap = false,
) {
  const fixed = world(center, initial);
  if (Math.hypot(pointer[0] - fixed[0], pointer[1] - fixed[1]) < 1e-6)
    return { ...initial };
  const delta =
    Math.atan2(pointer[1] - fixed[1], pointer[0] - fixed[0]) -
    Math.atan2(start[1] - fixed[1], start[0] - fixed[0]);
  let angle =
    initial.angle +
    (Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
  if (snap) angle = Math.round(angle / 15) * 15;
  const [cx, cy] = rotate(center, angle);
  return {
    ...initial,
    angle,
    x: fixed[0] - cx * initial.scale,
    y: fixed[1] - cy * initial.scale,
  };
}
