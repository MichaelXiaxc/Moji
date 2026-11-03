import opentype from "opentype.js";
import svgpath from "svgpath";
import { SerialConnection, serialError } from "./serial.js";
import { generate, GrblStream } from "./core.js";
const $ = (id) => document.getElementById(id);
export function initController() {
  let zoom = 1;
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
        ["width", "height", "up", "down", "feed", "zFeed"].map((id) => [
          id,
          num(id),
        ]),
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
  function render() {
    const c = $("canvas"),
      { width: w, height: h } = cfg();
    if (!(w > 0 && h > 0)) return;
    c.replaceChildren();
    c.setAttribute(
      "viewBox",
      `${(w * (1 - 1 / zoom)) / 2} ${(h * (1 - 1 / zoom)) / 2} ${w / zoom} ${h / zoom}`,
    );
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
        stroke: "#cfc6b6",
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
    for (const e of elements) {
      const g = node("g", {
        "data-id": e.id,
        class: "element " + (e.id === selected ? "selected" : ""),
        transform: `translate(${e.x} ${e.y}) rotate(${e.angle}) scale(${e.scale})`,
        fill: "none",
        stroke: e.id === selected ? "#cf3427" : "#20201c",
        "stroke-width": 0.3 / e.scale,
      });
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
        $(id).value = e[key];
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
  $("fontFile").onchange = guard(async (e) => {
    font = opentype.parse(await e.target.files[0].arrayBuffer());
    $("fontName").textContent = e.target.files[0].name;
  });
  $("txtFile").onchange = guard(async (e) => {
    $("text").value = await e.target.files[0].text();
  });
  $("addText").onclick = guard(() => {
    if (!font) throw Error("请先导入字体文件");
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
    const widths = lines.map((t) => font.getAdvanceWidth(t, size)),
      width = Math.max(...widths),
      paths = [];
    lines.forEach((t, i) => {
      const x =
        $("align").value === "center"
          ? (width - widths[i]) / 2
          : $("align").value === "right"
            ? width - widths[i]
            : 0;
      const d = font.getPath(t, x, size + i * (size + gap), size).toPathData(3);
      for (const sub of d.match(/M[^M]*/gi) || []) paths.push(samplePath(sub));
    });
    add("文字 · " + $("text").value.slice(0, 10), paths);
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
  $("canvas").onpointerdown = (e) => {
    if (calibration) {
      calibration.points.push(point(e));
      if (calibration.points.length === 4) guard(rectify)();
      else toast(`继续点击第 ${calibration.points.length + 1} 个角点`);
      return;
    }
    const g = e.target.closest("[data-id]");
    if (!g) return;
    select(g.dataset.id);
    drag = { p: point(e), e: elements.find((v) => v.id === selected) };
    drag.x = drag.e.x;
    drag.y = drag.e.y;
    $("canvas").setPointerCapture(e.pointerId);
  };
  $("canvas").onpointermove = (e) => {
    if (!drag) return;
    const p = point(e);
    drag.e.x = drag.x + p.x - drag.p.x;
    drag.e.y = drag.y + p.y - drag.p.y;
    render();
  };
  $("canvas").onpointerup = () => {
    if (drag) select(drag.e.id);
    drag = null;
  };
  $("canvas").onpointercancel = () => (drag = null);
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
  const setZoom = (value) => {
    zoom = Math.max(0.5, Math.min(4, value));
    $("zoomLabel").textContent = Math.round(zoom * 100) + "%";
    render();
  };
  $("zoomIn").onclick = () => setZoom(zoom + 0.25);
  $("zoomOut").onclick = () => setZoom(zoom - 0.25);
  $("fitCanvas").onclick = () => setZoom(1);
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

  return () => {
    clearInterval(poll);
    clearTimeout(powerTimer);
    clearTimeout(toast.timer);
    connection?.close();
  };
}
