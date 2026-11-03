import { thin, trace } from "./skeleton.js";
const cache = new Map();
self.onmessage = ({ data: { id, glyphs } }) => {
  try {
    const result = {};
    for (const glyph of glyphs) {
      if (cache.has(glyph.key)) {
        result[glyph.key] = cache.get(glyph.key);
        continue;
      }
      const { x1, y1, x2, y2 } = glyph.box,
        w = x2 - x1,
        h = y2 - y1;
      if (!(w > 0 && h > 0)) {
        result[glyph.key] = [];
        continue;
      }
      const factor = 184 / Math.max(w, h),
        width = Math.ceil(w * factor) + 10,
        height = Math.ceil(h * factor) + 10;
      const canvas = new OffscreenCanvas(width, height),
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.translate(5 - x1 * factor, 5 - y1 * factor);
      ctx.scale(factor, factor);
      ctx.fill(new Path2D(glyph.d));
      const rgba = ctx.getImageData(0, 0, width, height).data,
        bitmap = new Uint8Array(width * height);
      for (let i = 0; i < bitmap.length; i++)
        bitmap[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
      const paths = trace(thin(bitmap, width, height), width, height).map(
        (path) =>
          path.map(([x, y]) => [
            (x - 5 + 0.5) / factor + x1,
            (y - 5 + 0.5) / factor + y1,
          ]),
      );
      if (cache.size > 1200) cache.clear();
      cache.set(glyph.key, paths);
      result[glyph.key] = paths;
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
