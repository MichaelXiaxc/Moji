import { bundledFonts } from "./fonts.js";
import {
  bounds,
  world,
  scaleFromAnchor,
  rotateAboutCenter,
} from "./selection.js";
import opentype from "opentype.js";
import svgpath from "svgpath";
import { SerialConnection, serialError } from "./serial.js";
import { generate, GrblStream } from "./core.js";
const $ = (id) => document.getElementById(id);
export function initController() {
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let elements = [],
    selected = null,
    font = null,
    photos = {},
    port,
    reader,
    writer,
    poll,
    preview = false,
    calibration = null,
    drag = null,
    connection = null,
    connecting = false,
    machineState = "Unknown",
    statusAt = 0,
    powerAction = null,
    powerTimer = null;
  const toast = (m) => {
    $("toast").textContent = m;
    $("toast").style.display = "block";
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($("toast").style.display = "none"), 4500);
  };
  const guard =
    (f) =>
    async (...args) => {
      try {
        await f(...args);
      } catch (e) {
        toast(e.message);
      }
    };
  const num = (id) => Number($(id).value),
    cfg = () =>
      Object.fromEntries(
        ["width", "height", "up", "down", "feed", "travelFeed", "zFeed"].map(
          (id) => [id, num(id)],
        ),
      );
  function log(s) {
    $("log").textContent += s + "\n";
    $("log").textContent = $("log").textContent.slice(-7000);
    $("log").scrollTop = $("log").scrollHeight;
  }
  async function write(s) {
    if (!connection || !writer) throw Error("请先连接串口");
    await connection.write(s);
  }
  const stream = new GrblStream(write, (m) => {
    $("progress").max = stream.total || 1;
    $("progress").value = stream.sent;
    $("job").textContent =
      m ||
      `${stream.sent} / ${stream.total} 条已确认${stream.paused ? " · 暂停" : ""}`;
  });
  async function command(s) {
    if (machineState === "Sleep") throw Error("电机已休眠，请先唤醒");
    if (powerAction) throw Error("正在切换电机状态，请等待控制器确认");
    if (stream.active || stream.pending) throw Error("作业正在运行或等待确认");
    if (!writer) throw Error("请先连接串口");
    log("> " + s);
    stream.start([s]);
  }
  function node(tag, attrs, parent = $("canvas")) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    parent.append(el);
    return el;
  }
  function fitFactor() {
    const board = $("canvas").closest(".board"),
      { width, height } = cfg();
    return Math.min(
      (board.clientWidth - 2) / width,
      (board.clientHeight - 2) / height,
    );
  }
  function fitPaper() {
    const { width, height } = cfg(),
      factor = fitFactor() * zoom;
    if (!(width > 0 && height > 0 && factor > 0)) return;
    const canvas = $("canvas");
    canvas.style.width = width * factor + "px";
    canvas.style.height = height * factor + "px";
    canvas.style.transform = `translate(calc(-50% - ${pan.x * factor}px), calc(-50% - ${pan.y * factor}px))`;
  }
  function clampPan() {
    const { width: w, height: h } = cfg(),
      board = $("canvas").closest(".board"),
      factor = fitFactor() * zoom;
    if (zoom <= 1) {
      pan = { x: 0, y: 0 };
      return;
    }
    // Keep a visible part of the paper within the workspace, while allowing the whole sheet to move.
    if (!(factor > 0)) return;
    const mx = w / 2 + (board.clientWidth / factor) * 0.3,
      my = h / 2 + (board.clientHeight / factor) * 0.3;
    pan.x = Math.max(-mx, Math.min(mx, pan.x));
    pan.y = Math.max(-my, Math.min(my, pan.y));
  }
  function render() {
    const c = $("canvas"),
      { width: w, height: h } = cfg();
    if (!(w > 0 && h > 0)) return;
    clampPan();
    c.dataset.pannable = String(zoom > 1);
    c.replaceChildren();
    c.setAttribute("viewBox", `0 0 ${w} ${h}`);
    c.setAttribute("width", w * 2.8);
    c.setAttribute("height", h * 2.8);
    $("dimensions").textContent = `${w} × ${h} mm`;
    node("defs", {});
    const pat = node(
      "pattern",
      { id: "grid", width: 10, height: 10, patternUnits: "userSpaceOnUse" },
      c.firstChild,
    );
    node(
      "path",
      {
        d: "M 10 0 L 0 0 0 10",
        fill: "none",
        stroke: "#cdd1ca",
        "stroke-width": ".15",
      },
      pat,
    );
    node("rect", { width: w, height: h, fill: "url(#grid)" });
    for (const p of Object.values(photos))
      node("image", {
        href: p.data,
        x: 0,
        y: 0,
        width: w,
        height: h,
        preserveAspectRatio: "none",
        opacity: num("opacity"),
      });
    if (!elements.length) {
      const placeholder = node("g", {
        class: "canvas-placeholder",
        "aria-hidden": "true",
        "pointer-events": "none",
        transform: `translate(${w / 2} ${h / 2}) scale(${Math.min(w / 210, h / 150)})`,
        "text-anchor": "middle",
      });
      node(
        "path",
        {
          d: "M0 -34 L14 -20 L0 -6 L-14 -20 Z M0 -31 L11 -20 L0 -9 L-11 -20 Z",
          fill: "none",
          stroke: "#d0d0ce",
          "stroke-width": 0.4,
        },
        placeholder,
      );
      node(
        "path",
        {
          d: "M-2 -20 H2 M0 -22 V-18",
          fill: "none",
          stroke: "#adadab",
          "stroke-width": 1,
        },
        placeholder,
      );
      node(
        "text",
        {
          x: 0,
          y: 12,
          fill: "#bebebc",
          "font-size": 9,
          "font-weight": 600,
          "letter-spacing": 1,
        },
        placeholder,
      ).textContent = "等待路径输入";
      node(
        "text",
        { x: 0, y: 30, fill: "#a5a5a3", "font-size": 4, "letter-spacing": 0.3 },
        placeholder,
      ).textContent = "导入文字 / SVG 以开始编排";
    }
    for (const e of elements) {
      const g = node("g", {
        "data-id": e.id,
        class: "element " + (e.id === selected ? "selected" : ""),
        transform: `translate(${e.x} ${e.y}) rotate(${e.angle}) scale(${e.scale})`,
        fill: "none",
        stroke: e.id === selected ? "#9b8700" : "#28302e",
        "stroke-width": 0.3 / e.scale,
      });
      const hit = bounds(e.paths);
      if (hit)
        node(
          "rect",
          {
            x: hit.minX,
            y: hit.minY,
            width: hit.maxX - hit.minX,
            height: hit.maxY - hit.minY,
            fill: "transparent",
            stroke: "none",
            "pointer-events": "all",
          },
          g,
        );
      for (const p of e.paths)
        node("polyline", { points: p.map((v) => v.join(",")).join(" ") }, g);
      if (preview)
        for (const p of e.paths)
          node(
            "circle",
            {
              cx: p[0][0],
              cy: p[0][1],
              r: 0.6 / e.scale,
              fill: "#d36549",
              stroke: "none",
            },
            g,
          );
    }
    node("path", {
      d: "M 0 5 V 0 H 5",
      stroke: "#cf3427",
      fill: "none",
      "stroke-width": 0.7,
    });
    fitPaper();
    drawSelection();
    $("layerCount").textContent = String(elements.length).padStart(2, "0");
    $("stage").dataset.populated = String(elements.length > 0);
    $("layers").replaceChildren();
    elements.forEach((e) => {
      const b = document.createElement("button");
      b.textContent = `◇  ${e.name}`;
      b.className = e.id === selected ? "active" : "";
      b.onclick = () => select(e.id);
      $("layers").append(b);
    });
    fitPaper();
  }
  function drawSelection() {
    const e = elements.find((el) => el.id === selected),
      b = e && bounds(e.paths);
    if (!b) return;
    const ctm = $("canvas").getScreenCTM(),
      pixel = 1 / Math.hypot(ctm.a, ctm.b) / e.scale;
    const g = node("g", {
      "data-id": e.id,
      class: "selection-overlay",
      transform: `translate(${e.x} ${e.y}) rotate(${e.angle}) scale(${e.scale})`,
    });
    node(
      "rect",
      {
        x: b.minX,
        y: b.minY,
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
        fill: "transparent",
        stroke: "#9c9900",
        "stroke-width": 1,
        "vector-effect": "non-scaling-stroke",
        "data-action": "move",
        class: "selection-box",
      },
      g,
    );
    const handles = [
      ["nw", b.minX, b.minY, b.maxX, b.maxY],
      ["ne", b.maxX, b.minY, b.minX, b.maxY],
      ["se", b.maxX, b.maxY, b.minX, b.minY],
      ["sw", b.minX, b.maxY, b.maxX, b.minY],
      ["n", b.cx, b.minY, b.cx, b.maxY],
      ["e", b.maxX, b.cy, b.minX, b.cy],
      ["s", b.cx, b.maxY, b.cx, b.minY],
      ["w", b.minX, b.cy, b.maxX, b.cy],
    ];
    for (const [key, x, y, ax, ay] of handles)
      node(
        "rect",
        {
          x: x - 4 * pixel,
          y: y - 4 * pixel,
          width: 8 * pixel,
          height: 8 * pixel,
          fill: "#fffa00",
          stroke: "#303030",
          "stroke-width": 1,
          "vector-effect": "non-scaling-stroke",
          "data-action": "scale",
          "data-handle": key,
          "data-anchor-x": ax,
          "data-anchor-y": ay,
          class: "selection-handle handle-" + key,
        },
        g,
      );
    const view = $("canvas").viewBox.baseVal,
      margin = 9 * pixel * e.scale;
    const candidates = [
      [b.maxX + 18 * pixel, b.minY - 18 * pixel, b.maxX, b.minY],
      [b.maxX + 18 * pixel, b.maxY + 18 * pixel, b.maxX, b.maxY],
      [b.minX - 18 * pixel, b.maxY + 18 * pixel, b.minX, b.maxY],
      [b.minX - 18 * pixel, b.minY - 18 * pixel, b.minX, b.minY],
    ];
    const [rx, ry, cx, cy] =
      candidates.find(([x, y]) => {
        const p = world([x, y], e);
        return (
          p[0] > view.x + margin &&
          p[0] < view.x + view.width - margin &&
          p[1] > view.y + margin &&
          p[1] < view.y + view.height - margin
        );
      }) || candidates[0];
    node(
      "line",
      {
        x1: cx,
        y1: cy,
        x2: rx,
        y2: ry,
        stroke: "#606060",
        "stroke-width": 1,
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
      },
      g,
    );
    const rot = node(
      "circle",
      {
        cx: rx,
        cy: ry,
        r: 7 * pixel,
        fill: "#303030",
        stroke: "#fffa00",
        "stroke-width": 2,
        "vector-effect": "non-scaling-stroke",
        "data-action": "rotate",
        class: "rotation-handle",
      },
      g,
    );
    node("title", {}, rot).textContent = "拖动旋转 · Shift 按 15° 对齐";
    node(
      "text",
      {
        x: rx,
        y: ry + 3.5 * pixel,
        "text-anchor": "middle",
        fill: "#fffa00",
        "font-size": 10 * pixel,
        "pointer-events": "none",
      },
      g,
    ).textContent = "↻";
  }
  function syncTransform() {
    const e = elements.find((el) => el.id === selected);
    if (e)
      for (const [key, id] of [
        ["x", "ex"],
        ["y", "ey"],
        ["scale", "scale"],
        ["angle", "angle"],
      ])
        $(id).value = Number(e[key].toFixed(4));
  }
  function select(id) {
    selected = id;
    const e = elements.find((e) => e.id === id);
    if (e)
      for (const [key, id] of [
        ["x", "ex"],
        ["y", "ey"],
        ["scale", "scale"],
        ["angle", "angle"],
      ])
        $(id).value = Number(e[key].toFixed(4));
    render();
  }
  function add(name, paths) {
    elements.push({
      id: crypto.randomUUID(),
      name,
      paths,
      x: 15,
      y: 15,
      scale: 1,
      angle: 0,
    });
    select(elements.at(-1).id);
  }
  function samplePath(d) {
    const path = node("path", { d }),
      len = path.getTotalLength(),
      p = [];
    if (len > 200000) {
      path.remove();
      throw Error("路径过长");
    }
    for (let i = 0; i <= Math.ceil(len / 0.4); i++) {
      const q = path.getPointAtLength(Math.min(i * 0.4, len));
      p.push([q.x, q.y]);
    }
    path.remove();
    return p;
  }
  let fontVersion = 0,
    fontKey = "",
    currentFontLoad = null;
  const fontBuffers = new Map();
  let customFont = null;
  let skeletonWorker = null,
    requestId = 0;
  const requests = new Map();
  function skeletonize(glyphs) {
    if (!skeletonWorker) {
      skeletonWorker = new Worker(
        new URL("./skeleton-worker.js", import.meta.url),
        { type: "module" },
      );
      skeletonWorker.onmessage = ({ data }) => {
        const pending = requests.get(data.id);
        if (!pending) return;
        requests.delete(data.id);
        data.error
          ? pending.reject(Error(data.error))
          : pending.resolve(data.result);
      };
      skeletonWorker.onerror = () => {
        for (const pending of requests.values())
          pending.reject(Error("单线提取失败，请重试或关闭单线模式"));
        requests.clear();
        skeletonWorker.terminate();
        skeletonWorker = null;
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      requests.set(id, { resolve, reject });
      skeletonWorker.postMessage({ id, glyphs });
    });
  }
  async function loadWritingFont(id) {
    const version = ++fontVersion;
    font = null;
    const entry = bundledFonts.find((f) => f.id === id),
      label = entry?.name || customFont?.name;
    $("fontName").textContent = "正在加载 " + (label || "自定义字体") + "…";
    try {
      let buffer;
      if (id === "custom") {
        if (!customFont) throw Error("请先导入 TTF / OTF 字体文件");
        buffer = customFont.buffer;
      } else {
        if (!entry) throw Error("未知字体");
        if (!fontBuffers.has(id)) {
          const response = await fetch(
            import.meta.env.BASE_URL + "fonts/" + id + "/font.ttf",
          );
          if (!response.ok) throw Error("内置字体加载失败：" + response.status);
          fontBuffers.set(id, await response.arrayBuffer());
        }
        buffer = fontBuffers.get(id);
      }
      const parsed = opentype.parse(buffer);
      parsed.variation?.set({ wght: 400 });
      if (version !== fontVersion) return;
      font = parsed;
      fontKey = id === "custom" ? "custom-" + version : id;
      $("fontName").textContent = label;
      try {
        const family = "MojiWriting" + version,
          face = new FontFace(family, buffer);
        await face.load();
        if (version === fontVersion) {
          document.fonts.add(face);
          $("text").style.fontFamily = '"' + family + '", sans-serif';
        }
      } catch {
        /* Outline generation can still use the parsed font. */
      }
    } catch (error) {
      if (version === fontVersion) {
        font = null;
        $("fontName").textContent = error.message;
      }
      throw error;
    }
  }
  $("fontChoice").onchange = guard(() => {
    currentFontLoad = loadWritingFont($("fontChoice").value);
    return currentFontLoad;
  });
  $("fontFile").onchange = guard(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    customFont = { name: file.name, buffer: await file.arrayBuffer() };
    $("fontChoice").value = "custom";
    currentFontLoad = loadWritingFont("custom");
    await currentFontLoad;
  });
  currentFontLoad = loadWritingFont("noto-sans-sc");
  currentFontLoad.catch((error) => toast(error.message));
  $("txtFile").onchange = guard(async (e) => {
    $("text").value = await e.target.files[0].text();
  });
  $("addText").onclick = guard(async () => {
    if (currentFontLoad) await currentFontLoad;
    if (!font) throw Error("请先选择或导入字体");
    const textFont = font,
      version = fontVersion,
      mode = $("singleLine").checked;
    const size = num("fontSize"),
      gap = num("lineGap"),
      cols = num("columns"),
      max = num("maxLines");
    if (!(
      size > 0 &&
      gap >= 0 &&
      cols >= 1 &&
      Number.isInteger(cols) &&
      max >= 0
    ))
      throw Error("检查文字格式参数");
    const lines = $("text")
      .value.split("\n")
      .flatMap((s) => {
        const a = Array.from(s),
          r = [];
        while (a.length) r.push(a.splice(0, cols).join(""));
        return r.length ? r : [""];
      });
    if (max && lines.length > max)
      throw Error(`文字需要 ${lines.length} 行，超过设定行数`);
    for (const ch of lines.join(""))
      if (!font.charToGlyphIndex(ch) && !/^\s$/.test(ch))
        throw Error(`当前字体缺少字符：${ch}`);
    const widths = lines.map((t) => textFont.getAdvanceWidth(t, size)),
      width = Math.max(...widths),
      paths = [];
    const alignment = $("align").value;
    const left = (i) =>
      alignment === "center"
        ? (width - widths[i]) / 2
        : alignment === "right"
          ? width - widths[i]
          : 0;
    const name =
      "文字 · " + $("text").value.slice(0, 10) + (mode ? " / 单线" : "");
    if (!mode) {
      lines.forEach((t, i) => {
        const d = textFont
          .getPath(t, left(i), size + i * (size + gap), size)
          .toPathData(3);
        for (const sub of d.match(/M[^M]*/gi) || [])
          paths.push(samplePath(sub));
      });
    } else {
      const button = $("addText");
      button.disabled = true;
      const previous = [...button.childNodes];
      button.textContent = "正在提取单线…";
      try {
        const glyphs = [],
          placements = [],
          seen = new Set();
        lines.forEach((t, i) => {
          textFont.forEachGlyph(
            t,
            left(i),
            size + i * (size + gap),
            size,
            {},
            (glyph, x, y) => {
              const key = fontKey + ":" + glyph.index;
              placements.push({ key, x, y });
              if (!seen.has(key)) {
                seen.add(key);
                const path = glyph.getPath(0, 0, 128, {}, textFont);
                glyphs.push({
                  key,
                  d: path.toPathData(4),
                  box: path.getBoundingBox(),
                });
              }
            },
          );
        });
        const skeletons = await skeletonize(glyphs);
        if (version !== fontVersion)
          throw Error("字体已改变，请重新生成文字路径");
        for (const { key, x, y } of placements)
          for (const path of skeletons[key] || [])
            paths.push(
              path.map(([px, py]) => [
                x + (px * size) / 128,
                y + (py * size) / 128,
              ]),
            );
      } finally {
        button.disabled = false;
        button.replaceChildren(...previous);
      }
    }
    if (!paths.length) throw Error("没有可生成的文字路径");
    add(name, paths);
  });
  $("svgFile").onchange = guard(async (e) => {
    const doc = new DOMParser().parseFromString(
      await e.target.files[0].text(),
      "image/svg+xml",
    );
    if (doc.querySelector("parsererror")) throw Error("SVG 文件格式错误");
    const source = doc.documentElement;
    if (source.localName !== "svg") throw Error("请选择 SVG");
    const box = node("svg", {
      width: 1000,
      height: 1000,
      style: "position:absolute;opacity:0;pointer-events:none",
    });
    document.body.append(box);
    function copy(src, parent) {
      for (const child of src.children) {
        if (
          [
            "g",
            "svg",
            "path",
            "polyline",
            "polygon",
            "rect",
            "circle",
            "ellipse",
            "line",
          ].includes(child.localName)
        ) {
          const dst = node(child.localName, {}, parent);
          for (const a of child.attributes)
            if (
              [
                "d",
                "points",
                "x",
                "y",
                "x1",
                "y1",
                "x2",
                "y2",
                "width",
                "height",
                "rx",
                "ry",
                "cx",
                "cy",
                "r",
                "transform",
                "viewBox",
              ].includes(a.name)
            )
              dst.setAttribute(a.name, a.value);
          copy(child, dst);
        }
      }
    }
    copy(source, box);
    try {
      const paths = [];
      let budget = 0;
      for (const el of box.querySelectorAll(
        "path,polyline,polygon,rect,circle,ellipse,line",
      )) {
        const m = box.getScreenCTM().inverse().multiply(el.getScreenCTM());
        const subs =
          el.localName === "path"
            ? svgpath(el.getAttribute("d") || "")
                .abs()
                .toString()
                .match(/M[^M]*/g) || []
            : [null];
        for (const sub of subs) {
          const geo = sub ? node("path", { d: sub }, box) : el;
          const len = geo.getTotalLength(),
            count = Math.max(1, Math.ceil(len / 0.5));
          budget += count;
          if (budget > 200000) throw Error("SVG 过于复杂，请简化路径");
          const p = [];
          for (let i = 0; i <= count; i++) {
            const q = geo
              .getPointAtLength((len * i) / count)
              .matrixTransform(m);
            p.push([q.x, q.y]);
          }
          paths.push(p);
          if (sub) geo.remove();
        }
      }
      if (!paths.length) throw Error("SVG 中没有支持的路径");
      const all = paths.flat(),
        minX = Math.min(...all.map((p) => p[0])),
        minY = Math.min(...all.map((p) => p[1])),
        w = Math.max(...all.map((p) => p[0])) - minX,
        h = Math.max(...all.map((p) => p[1])) - minY,
        s = Math.min(100 / (w || 1), 100 / (h || 1));
      add(
        e.target.files[0].name,
        paths.map((p) => p.map(([x, y]) => [(x - minX) * s, (y - minY) * s])),
      );
    } finally {
      box.remove();
    }
  });
  $("apply").onclick = guard(() => {
    const e = elements.find((e) => e.id === selected);
    if (!e) return;
    if (
      ![num("ex"), num("ey"), num("scale"), num("angle")].every(
        Number.isFinite,
      ) ||
      num("scale") <= 0
    )
      throw Error("变换参数无效");
    Object.assign(e, {
      x: num("ex"),
      y: num("ey"),
      scale: num("scale"),
      angle: num("angle"),
    });
    render();
  });
  $("delete").onclick = () => {
    elements = elements.filter((e) => e.id !== selected);
    selected = null;
    render();
  };
  function point(e) {
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(
      $("canvas").getScreenCTM().inverse(),
    );
  }
  const c = $("canvas");
  c.setAttribute("tabindex", "0");
  c.onpointerdown = (e) => {
    if (e.button !== 0 || drag) return;
    if (calibration) {
      calibration.points.push(point(e));
      if (calibration.points.length === 4) guard(rectify)();
      else toast(`继续点击第 ${calibration.points.length + 1} 个角点`);
      return;
    }
    const target = e.target.closest("[data-id]");
    if (!target) {
      select(null);
      if (zoom > 1) {
        const p = point(e);
        drag = {
          action: "pan",
          p: [p.x, p.y],
          initialPan: { ...pan },
          matrix: c.getScreenCTM().inverse(),
          pointerId: e.pointerId,
        };
        c.dataset.panning = "true";
        c.focus({ preventScroll: true });
        c.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
      return;
    }
    const el = elements.find((v) => v.id === target.dataset.id);
    if (!el) return;
    const control = e.target.closest("[data-action]"),
      action = control?.dataset.action || "move";
    const anchor =
      action === "scale"
        ? [Number(control.dataset.anchorX), Number(control.dataset.anchorY)]
        : null;
    const p = point(e),
      b = bounds(el.paths);
    if (!b) return;
    select(el.id);
    c.focus({ preventScroll: true });
    drag = {
      e: el,
      initial: { ...el },
      p: [p.x, p.y],
      action,
      anchor,
      center: [b.cx, b.cy],
      pointerId: e.pointerId,
    };
    c.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  c.onpointermove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.action === "pan") {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.matrix);
      pan = {
        x: drag.initialPan.x - (p.x - drag.p[0]),
        y: drag.initialPan.y - (p.y - drag.p[1]),
      };
      render();
      return;
    }
    const p = point(e),
      v = [p.x, p.y];
    if (drag.action === "scale")
      Object.assign(
        drag.e,
        scaleFromAnchor(drag.initial, drag.anchor, drag.p, v),
      );
    else if (drag.action === "rotate")
      Object.assign(
        drag.e,
        rotateAboutCenter(drag.initial, drag.center, drag.p, v, e.shiftKey),
      );
    else
      Object.assign(drag.e, {
        x: drag.initial.x + p.x - drag.p[0],
        y: drag.initial.y + p.y - drag.p[1],
      });
    syncTransform();
    render();
  };
  function finishDrag(cancel = false) {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (cancel) {
      if (current.action === "pan") pan = { ...current.initialPan };
      else Object.assign(current.e, current.initial);
    }
    c.dataset.panning = "false";
    if (c.hasPointerCapture(current.pointerId))
      c.releasePointerCapture(current.pointerId);
    syncTransform();
    render();
  }
  c.onpointerup = (e) => {
    if (drag?.pointerId === e.pointerId) finishDrag();
  };
  c.onpointercancel = () => finishDrag(true);
  c.onlostpointercapture = () => finishDrag(true);
  const handleEscape = (e) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      if (drag) finishDrag(true);
      else select(null);
      e.preventDefault();
    }
  };
  c.onkeydown = handleEscape;
  document.addEventListener("keydown", handleEscape);
  for (const id of ["width", "height", "opacity"]) $(id).oninput = render;
  for (const [id, key] of [
    ["basePhoto", "base"],
    ["paperPhoto", "paper"],
  ])
    $(id).onchange = guard(async (e) => {
      const file = e.target.files[0];
      const data = await new Promise((r, j) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.onerror = j;
        fr.readAsDataURL(file);
      });
      photos[key] = { data };
      render();
    });
  $("calibrate").onclick = () => {
    if (!photos[$("photoLayer").value]) return toast("先导入对应照片");
    calibration = { key: $("photoLayer").value, points: [] };
    toast("请点击矩形左上角，随后右上、右下、左下");
  };
  async function rectify() {
    const { key, points: p } = calibration;
    calibration = null;
    const img = new Image();
    img.src = photos[key].data;
    await img.decode();
    const w = num("width"),
      h = num("height"),
      W = 900,
      H = Math.round((900 * h) / w);
    if (H > 4000) throw Error("工作区长宽比例过大");
    const src = document.createElement("canvas");
    src.width = img.width;
    src.height = img.height;
    const ctx = src.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, src.width, src.height);
    const pts = p.map((q) => [(q.x / w) * img.width, (q.y / h) * img.height]);
    const [a, b, c, d] = pts;
    const dx1 = b[0] - c[0],
      dx2 = d[0] - c[0],
      dy1 = b[1] - c[1],
      dy2 = d[1] - c[1],
      dx3 = a[0] - b[0] + c[0] - d[0],
      dy3 = a[1] - b[1] + c[1] - d[1],
      den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-8) throw Error("校准角点无效");
    const g = (dx3 * dy2 - dx2 * dy3) / den,
      hh = (dx1 * dy3 - dx3 * dy1) / den,
      A = b[0] - a[0] + g * b[0],
      B = d[0] - a[0] + hh * d[0],
      D = b[1] - a[1] + g * b[1],
      E = d[1] - a[1] + hh * d[1];
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const oc = out.getContext("2d"),
      dst = oc.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1),
          v = y / (H - 1),
          z = g * u + hh * v + 1,
          sx = Math.round((A * u + B * v + a[0]) / z),
          sy = Math.round((D * u + E * v + a[1]) / z),
          i = (y * W + x) * 4;
        if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height)
          dst.data.set(
            data.data.subarray(
              (sy * img.width + sx) * 4,
              (sy * img.width + sx) * 4 + 4,
            ),
            i,
          );
      }
    oc.putImageData(dst, 0, 0);
    photos[key] = { data: out.toDataURL("image/png") };
    render();
    toast("照片已校准到工作区");
  }
  $("clearPhoto").onclick = () => {
    delete photos[$("photoLayer").value];
    calibration = null;
    render();
  };
  function download(name, data, type) {
    const u = URL.createObjectURL(new Blob([data], { type })),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  $("save").onclick = () =>
    download(
      "墨迹工程.json",
      JSON.stringify({
        version: 2,
        coordinateSystem: "paper-top-left-z-down",
        elements,
        photos,
        cfg: cfg(),
      }),
      "application/json",
    );
  $("open").onchange = guard(async (e) => {
    const p = JSON.parse(await e.target.files[0].text());
    if (
      ![1, 2].includes(p.version) ||
      !Array.isArray(p.elements) ||
      p.elements.length > 1000
    )
      throw Error("无效工程");
    if (p.version === 2 && p.coordinateSystem !== "paper-top-left-z-down")
      throw Error("工程坐标约定不匹配");
    for (const el of p.elements)
      if (
        typeof el.name !== "string" ||
        !Array.isArray(el.paths) ||
        ![el.x, el.y, el.scale, el.angle].every(Number.isFinite) ||
        el.scale <= 0 ||
        el.paths.some(
          (path) =>
            !Array.isArray(path) ||
            path.some(
              (pt) =>
                !Array.isArray(pt) ||
                pt.length !== 2 ||
                !pt.every(Number.isFinite),
            ),
        )
      )
        throw Error("元素数据无效");
    if (p.cfg && p.cfg.travelFeed === undefined) p.cfg.travelFeed = 1500;
    for (const k of Object.keys(cfg()))
      if (!Number.isFinite(p.cfg?.[k])) throw Error("工程参数无效");
    if (p.cfg.width <= 0 || p.cfg.height <= 0) throw Error("工作尺寸无效");
    elements = p.elements;
    photos = {};
    for (const k of ["base", "paper"])
      if (/^data:image\/(png|jpeg|webp);base64,/.test(p.photos?.[k]?.data))
        photos[k] = p.photos[k];
    for (const [k, v] of Object.entries(p.cfg))
      if (Object.hasOwn(cfg(), k)) $(k).value = v;
    if (p.version === 1) {
      $("down").value = 0;
      $("up").value = -Math.abs(p.cfg.up - p.cfg.down || 3);
      toast(
        "旧工程已切换到左上原点，Z 参数已转换为负值抬笔；请重新确认高度并生成 G-code",
      );
    } else if (p.coordinateSystem !== "paper-top-left-z-down")
      throw Error("工程坐标约定不匹配");
    $("code").value = "";
    $("verified").checked = false;
    select(null);
  });
  $("preview").onclick = () => {
    preview = !preview;
    $("preview").setAttribute("aria-pressed", String(preview));
    render();
  };
  const setZoom = (value, anchor) => {
    if (drag) return;
    const previous = zoom,
      { width: w, height: h } = cfg();
    const origin = {
      x: w / 2 + pan.x,
      y: h / 2 + pan.y,
    };
    zoom = Math.max(0.5, Math.min(4, value));
    if (anchor) {
      pan = {
        x: anchor.x - ((anchor.x - origin.x) * previous) / zoom - w / 2,
        y: anchor.y - ((anchor.y - origin.y) * previous) / zoom - h / 2,
      };
    }
    $("zoomLabel").textContent = Math.round(zoom * 100) + "%";
    render();
  };
  $("zoomIn").onclick = () => setZoom(zoom + 0.25);
  $("zoomOut").onclick = () => setZoom(zoom - 0.25);
  $("fitCanvas").onclick = () => {
    if (drag) return;
    pan = { x: 0, y: 0 };
    setZoom(1);
  };
  const stage = $("stage");
  const wheelZoom = (e) => {
    e.preventDefault();
    if (drag) return;
    const delta =
      e.deltaY *
      (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1);
    setZoom(
      zoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002),
      point(e),
    );
  };
  stage.addEventListener("wheel", wheelZoom, { passive: false });
  stage.onpointerdown = (e) => {
    if (!c.contains(e.target)) c.onpointerdown(e);
  };
  $("generate").onclick = guard(() => {
    $("code").value = generate(elements, cfg());
    toast("G-code 已生成：左上原点，X 向右、Y 向下，Z 负值抬笔");
  });
  $("export").onclick = guard(() => {
    if (!$("code").value) throw Error("先生成 G-code");
    download("writing.gcode", $("code").value, "text/plain");
  });
  function connectionUI() {
    machineState = "Unknown";
    statusAt = 0;
    clearPowerAction();
    updatePowerUI();
    $("verified").checked = false;
    clearInterval(poll);
    stream.reset();
    port = null;
    writer = null;
    $("status").textContent = "● 未连接";
    $("connect").textContent = "连接串口";
    $("baud").disabled = false;
  }
  function showSerialError(e) {
    const message = serialError(e);
    $("serialError").hidden = false;
    $("serialError").textContent = message;
    log(message);
    toast(message.split("\n")[0]);
  }
  async function disconnect() {
    const old = connection;
    connection = null;
    connectionUI();
    if (old) await old.close();
  }
  function updatePowerUI() {
    const asleep = machineState === "Sleep";
    $("motorPower").textContent = powerAction
      ? powerAction === "sleep"
        ? "正在断电…"
        : "正在唤醒…"
      : asleep
        ? "唤醒电机 / 退出休眠"
        : "电机断电 / 休眠";
    $("motorPower").setAttribute("aria-pressed", String(asleep));
    $("motorPower").disabled =
      !writer ||
      !!powerAction ||
      !["Idle", "Alarm", "Sleep"].includes(machineState);
    $("unlock").hidden = machineState !== "Alarm";
    $("unlock").disabled = !writer || !!powerAction;
    $("motorHint").textContent = asleep
      ? "已休眠：可手动移笔。唤醒后重新设置 XY / Z 零点。"
      : powerAction
        ? "等待控制器回报；暂不可点动或启动作业。"
        : machineState === "Alarm"
          ? "报警锁定：请先检查机器，再解除锁定并重新设置零点。"
          : machineState === "Idle"
            ? "空闲，可发送 $SLP 释放电机。手动移动后需重新设置零点。"
            : "等待机器空闲；断电状态以固件回报为准。";
  }
  function clearPowerAction() {
    clearTimeout(powerTimer);
    powerTimer = null;
    powerAction = null;
  }
  function waitPowerAction(action) {
    powerAction = action;
    updatePowerUI();
    powerTimer = setTimeout(() => {
      clearPowerAction();
      updatePowerUI();
      showSerialError(
        Error("电机状态切换未得到确认，请检查串口日志和机器状态。"),
      );
    }, 6000);
  }
  function receiveLine(line) {
    if (line.startsWith("<")) {
      machineState = line.slice(1).split("|")[0].split(":")[0];
      statusAt = Date.now();
      $("status").textContent = "● " + machineState;
      const pos = line.match(/(WPos|MPos):([^|>]+)/);
      if (pos) $("position").textContent = pos[1] + " " + pos[2];
      if (machineState === "Sleep") {
        $("verified").checked = false;
        if (powerAction === "sleep") {
          clearPowerAction();
          stream.reset();
        }
      }
      if (powerAction === "wake" && ["Idle", "Alarm"].includes(machineState))
        clearPowerAction();
      updatePowerUI();
    } else {
      log("< " + line);
      stream.receive(line);
      if (/^(error:|ALARM:)/.test(line)) {
        clearPowerAction();
        if (line.startsWith("ALARM:")) {
          machineState = "Alarm";
          $("verified").checked = false;
        }
        $("motorHint").textContent = "控制器返回：" + line;
        updatePowerUI();
        showSerialError(Error(line));
      }
      if (line === "[MSG:Sleeping]") {
        machineState = "Sleep";
        $("verified").checked = false;
        clearPowerAction();
        stream.reset();
        updatePowerUI();
      }
      if (/^Grbl/.test(line)) {
        $("verified").checked = false;
        machineState = "Unknown";
        updatePowerUI();
      }
    }
  }
  $("motorPower").onclick = guard(async () => {
    if (!writer) throw Error("请先连接串口");
    if (powerAction) throw Error("请等待状态切换完成");
    if (machineState === "Sleep") {
      stream.reset();
      $("verified").checked = false;
      machineState = "Unknown";
      statusAt = 0;
      waitPowerAction("wake");
      try {
        await write("\x18");
        log("> Ctrl-X（退出休眠）");
      } catch (e) {
        clearPowerAction();
        updatePowerUI();
        throw e;
      }
    } else {
      if (
        !["Idle", "Alarm"].includes(machineState) ||
        Date.now() - statusAt > 2500
      )
        throw Error("请等待控制器报告空闲或报警状态后再断电");
      if (stream.active || stream.pending)
        throw Error("请等待当前指令完成后再断电");
      $("verified").checked = false;
      waitPowerAction("sleep");
      log("> $SLP");
      try {
        stream.start(["$SLP"]);
      } catch (e) {
        clearPowerAction();
        updatePowerUI();
        throw e;
      }
    }
  });
  $("unlock").onclick = guard(async () => {
    if (machineState !== "Alarm") throw Error("当前不是报警状态");
    $("verified").checked = false;
    await command("$X");
  });
  $("connect").onclick = async () => {
    if (connecting) return;
    if (connection) {
      await disconnect();
      return;
    }
    connecting = true;
    $("connect").disabled = true;
    $("serialError").hidden = true;
    let candidate = null;
    try {
      if (!navigator.serial)
        throw Error(
          "浏览器不支持 Web Serial。请在桌面 Chrome / Edge 打开 http://127.0.0.1:5173/",
        );
      $("status").textContent = "● 选择串口";
      const selectedPort = await navigator.serial.requestPort();
      $("status").textContent = "● 正在打开";
      const info = selectedPort.getInfo();
      log("连接参数：" + JSON.stringify({ baudRate: num("baud"), ...info }));
      candidate = new SerialConnection(receiveLine, (e) => {
        if (connection === candidate) {
          connection = null;
          connectionUI();
          if (e) showSerialError(e);
          else log("串口已断开");
        }
      });
      await candidate.open(selectedPort, num("baud"));
      connection = candidate;
      port = selectedPort;
      writer = candidate.writer;
      $("status").textContent = "● 已连接，等待 GRBL";
      $("connect").textContent = "断开";
      $("baud").disabled = true;
      poll = setInterval(() => {
        write("?").catch((e) => {
          showSerialError(e);
          disconnect();
        });
      }, 500);
      log("串口已打开（8N1，无流控），正在查询 GRBL 状态");
    } catch (e) {
      if (candidate) await candidate.close();
      connectionUI();
      showSerialError(e);
    } finally {
      connecting = false;
      $("connect").disabled = false;
    }
  };
  document.querySelectorAll("[data-axis]").forEach(
    (b) =>
      (b.onclick = guard(() => {
        if (machineState === "Sleep" || powerAction)
          throw Error("电机休眠或正在切换状态，请先唤醒");
        if (!(num("step") > 0 && num("jogFeed") > 0))
          throw Error("点动距离和速度必须大于零");
        return command(
          `$J=G91 G21 ${b.dataset.axis}${num("step") * Number(b.dataset.dir)} F${num("jogFeed")}`,
        );
      })),
  );
  $("zero").onclick = guard(async () => {
    await command("G10 L20 P1 X0 Y0");
    $("verified").checked = false;
  });
  $("zeroZ").onclick = guard(async () => {
    await command("G10 L20 P1 Z0");
    $("verified").checked = false;
  });
  $("cancelJog").onclick = guard(() => write(String.fromCharCode(0x85)));
  $("estop").onclick = $("stop").onclick = guard(async () => {
    stream.reset();
    clearPowerAction();
    machineState = "Unknown";
    statusAt = 0;
    updatePowerUI();
    await write("\x18");
    $("verified").checked = false;
    toast("已发送软复位，重新确认原点和笔状态后再运行");
  });
  $("pause").onclick = guard(async () => {
    stream.paused = true;
    await write("!");
  });
  $("resume").onclick = guard(async () => {
    if (machineState === "Sleep" || powerAction) throw Error("请先唤醒电机");
    await write("~");
    stream.paused = false;
    stream.pump();
  });
  $("start").onclick = guard(() => {
    if (machineState === "Sleep" || powerAction)
      throw Error("请先唤醒电机，再设置并确认零点");
    if (!$("verified").checked)
      throw Error("请先完成轴、Z 和原点校准，并勾选确认");
    if (!writer) throw Error("请先连接串口");
    const lines = $("code")
      .value.split(/\r?\n/)
      .map((l) => l.replace(/\([^)]*\)|;.*/g, "").trim())
      .filter(Boolean);
    if (!lines.length) throw Error("没有 G-code");
    if (lines.some((l) => new TextEncoder().encode(l).length > 78))
      throw Error("存在超过 78 字节的指令行");
    stream.start(lines);
  });
  $("send").onclick = guard(() => {
    const s = $("command").value.trim();
    if (!s || /[\r\n\x00-\x1f]/.test(s)) throw Error("请输入单行命令");
    return command(s);
  });
  let calibrated = null;
  $("calc").onclick = guard(() => {
    const a = num("oldSteps"),
      b = num("commanded"),
      c = num("measured");
    if (!(a > 0 && b > 0 && c > 0)) throw Error("标定数据必须大于零");
    calibrated = { axis: $("calAxis").value, value: (a * b) / c };
    $("calResult").textContent =
      `${calibrated.axis} 新值：${calibrated.value.toFixed(4)} steps/mm`;
  });
  $("writeSteps").onclick = guard(() => {
    if (!calibrated) throw Error("先计算标定值");
    return command(
      `$${{ X: 100, Y: 101, Z: 102 }[calibrated.axis]}=${calibrated.value.toFixed(4)}`,
    );
  });
  render();
  const paperObserver = new ResizeObserver(() => {
    fitPaper();
    const overlay = $("canvas").querySelector(".selection-overlay");
    if (overlay) overlay.remove();
    drawSelection();
  });
  paperObserver.observe($("canvas").closest(".board"));

  return () => {
    stage.removeEventListener("wheel", wheelZoom);
    stage.onpointerdown = null;
    skeletonWorker?.terminate();
    for (const pending of requests.values())
      pending.reject(Error("工作台已关闭"));
    requests.clear();
    document.removeEventListener("keydown", handleEscape);
    paperObserver.disconnect();
    clearInterval(poll);
    clearTimeout(powerTimer);
    clearTimeout(toast.timer);
    connection?.close();
  };
}
