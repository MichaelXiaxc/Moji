// Zhang–Suen thinning on a padded binary bitmap, followed by graph tracing.
export function thin(bitmap, width, height) {
  const data = Uint8Array.from(bitmap);
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const remove = [];
      for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (!data[i]) continue;
          const p = [
            data[i - width],
            data[i - width + 1],
            data[i + 1],
            data[i + width + 1],
            data[i + width],
            data[i + width - 1],
            data[i - 1],
            data[i - width - 1],
          ];
          const count = p.reduce((a, b) => a + b, 0);
          if (count < 2 || count > 6) continue;
          let transitions = 0;
          for (let k = 0; k < 8; k++)
            if (!p[k] && p[(k + 1) % 8]) transitions++;
          if (transitions !== 1) continue;
          if (
            pass === 0
              ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6]
              : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]
          )
            continue;
          remove.push(i);
        }
      if (remove.length) changed = true;
      for (const i of remove) data[i] = 0;
    }
  }
  return data;
}
function simplify(points, tolerance = 0.65) {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]),
    stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(),
      [ax, ay] = points[a],
      [bx, by] = points[b],
      dx = bx - ax,
      dy = by - ay,
      den = dx * dx + dy * dy;
    let best = tolerance * tolerance,
      index = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i],
        t = den
          ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / den))
          : 0,
        d = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (d > best) {
        best = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep.add(index);
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep.has(i));
}
export function trace(bitmap, width, height) {
  const adjacency = new Map();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!bitmap[i]) continue;
      const links = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = i + dy * width + dx;
          if (!bitmap[n]) continue;
          if (dx && dy && (bitmap[i + dx] || bitmap[i + dy * width])) continue;
          links.push(n);
        }
      adjacency.set(i, links);
    }
  const visited = new Set(),
    paths = [],
    edge = (a, b) => (a < b ? a + ":" + b : b + ":" + a),
    point = (i) => [i % width, Math.floor(i / width)];
  const walk = (start, next) => {
    const path = [point(start)];
    let prev = start,
      current = next;
    visited.add(edge(prev, current));
    while (true) {
      path.push(point(current));
      const links = adjacency.get(current) || [];
      if (links.length !== 2) break;
      const n = links[0] === prev ? links[1] : links[0];
      if (visited.has(edge(current, n))) break;
      visited.add(edge(current, n));
      prev = current;
      current = n;
    }
    if (path.length > 1) paths.push(simplify(path));
  };
  for (const [i, links] of adjacency) {
    if (!links.length) {
      const [x, y] = point(i);
      paths.push([
        [x - 0.35, y],
        [x + 0.35, y],
      ]);
    }
    if (links.length !== 2)
      for (const n of links) if (!visited.has(edge(i, n))) walk(i, n);
  }
  for (const [i, links] of adjacency)
    for (const n of links) if (!visited.has(edge(i, n))) walk(i, n);
  return paths;
}
