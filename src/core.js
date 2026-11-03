export function transform(points, e) {
  const a = (e.angle * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return points.map(([x, y]) => [
    e.x + e.scale * (x * c - y * s),
    e.y + e.scale * (x * s + y * c),
  ]);
}
export function generate(elements, cfg) {
  const n = (v) => Number(v.toFixed(3));
  for (const k of [
    "width",
    "height",
    "feed",
    "travelFeed",
    "zFeed",
    "up",
    "down",
  ])
    if (!Number.isFinite(cfg[k])) throw Error("参数必须为有效数字");
  if (
    cfg.width <= 0 ||
    cfg.height <= 0 ||
    cfg.feed <= 0 ||
    cfg.travelFeed <= 0 ||
    cfg.zFeed <= 0
  )
    throw Error("尺寸和速度必须大于零");
  if (cfg.up >= cfg.down) throw Error("本机 Z+ 落笔：抬笔 Z 必须小于落笔 Z");
  const paths = elements
    .flatMap((e) => e.paths.map((p) => transform(p, e)))
    .filter((p) => p.length > 1);
  if (!paths.length) throw Error("画布没有可书写路径");
  if (
    paths.some((p) =>
      p.some(
        ([x, y]) =>
          !Number.isFinite(x + y) ||
          x < 0 ||
          y < 0 ||
          x > cfg.width ||
          y > cfg.height,
      ),
    )
  )
    throw Error("路径超出工作区域，请调整位置或尺寸");
  const lines = ["G21", "G90", "G17", "G54", `G1 Z${n(cfg.up)} F${cfg.zFeed}`];
  for (const p of paths) {
    lines.push(
      `G1 X${n(p[0][0])} Y${n(p[0][1])} F${cfg.travelFeed}`,
      `G1 Z${n(cfg.down)} F${cfg.zFeed}`,
    );
    for (const [x, y] of p.slice(1))
      lines.push(`G1 X${n(x)} Y${n(y)} F${cfg.feed}`);
    lines.push(`G1 Z${n(cfg.up)} F${cfg.zFeed}`);
  }
  return lines.join("\n") + "\n";
}
export class GrblStream {
  constructor(write, onChange = () => {}) {
    this.write = write;
    this.onChange = onChange;
    this.queue = [];
    this.pending = null;
    this.active = false;
    this.paused = false;
    this.sent = 0;
    this.total = 0;
    this.generation = 0;
  }
  start(lines) {
    if (this.pending || this.active) throw Error("串口正忙");
    this.queue = lines.filter(Boolean);
    this.total = this.queue.length;
    this.sent = 0;
    this.active = true;
    this.paused = false;
    this.pump();
  }
  async pump() {
    if (this.pending || this.paused || !this.active) return;
    if (!this.queue.length) {
      this.active = false;
      this.onChange("所有指令已确认，等待机器 Idle");
      return;
    }
    const line = this.queue.shift();
    this.pending = line;
    const generation = this.generation;
    try {
      await this.write(line + "\n");
    } catch (e) {
      if (generation !== this.generation) return;
      this.reset();
      this.onChange(e.message);
    }
  }
  receive(line) {
    if (/^error:|^ALARM:/.test(line)) {
      this.reset();
      this.onChange("控制器报错：" + line);
      return;
    }
    if (line === "ok" && this.pending) {
      this.pending = null;
      this.sent++;
      this.onChange();
      this.pump();
    }
    if (/^Grbl/.test(line)) this.reset();
  }
  reset() {
    this.generation++;
    this.queue = [];
    this.pending = null;
    this.active = false;
    this.paused = false;
    this.onChange();
  }
}
