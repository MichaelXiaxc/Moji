import React, { useEffect, useState } from "react";
import { initController } from "./controller.js";

const Field = ({ id, label, value, step = "0.1", min }) => (
  <label className="field" htmlFor={id}>
    <span>{label}</span>
    <input id={id} type="number" defaultValue={value} step={step} min={min} />
  </label>
);
const FileButton = ({ id, accept, children, className = "" }) => (
  <label className={`file ${className}`}>
    <span>{children}</span>
    <input id={id} type="file" accept={accept} />
  </label>
);
const Heading = ({ number, title, english }) => (
  <div className="panel-heading">
    <span className="panel-number">{number}</span>
    <div>
      <h2>{title}</h2>
      <span className="eyebrow">{english}</span>
    </div>
  </div>
);
function Tabs({ items, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map(([id, text]) => (
        <button
          key={id}
          id={`tab-${id}`}
          role="tab"
          aria-selected={value === id}
          aria-controls={`pane-${id}`}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const current = items.findIndex(([key]) => key === id);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (current +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      items.length) %
                    items.length;
            onChange(items[next][0]);
            document.getElementById(`tab-${items[next][0]}`).focus();
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
const Pane = ({ id, active, children }) => (
  <section
    id={`pane-${id}`}
    role="tabpanel"
    aria-labelledby={`tab-${id}`}
    hidden={!active}
  >
    {children}
  </section>
);

export default function App() {
  const [tool, setTool] = useState("text"),
    [machine, setMachine] = useState("motion"),
    [inspection, setInspection] = useState("photo");
  useEffect(() => initController(), []);
  return (
    <>
      <header className="masthead">
        <div className="identity">
          <div className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="wordmark">
            MOJI<span>墨迹</span>
          </div>
          <div className="brand-caption">
            把想法
            <br />
            写在纸上。
          </div>
        </div>
        <div className="connection">
          <span className="eyebrow">MACHINE / 连接</span>
          <span id="status" className="pill">
            ● 未连接
          </span>
          <select id="baud" aria-label="串口波特率" defaultValue="115200">
            <option>115200</option>
            <option>9600</option>
            <option>250000</option>
          </select>
          <button id="connect" className="ink">
            连接串口 ↗
          </button>
          <button id="estop" className="danger">
            ■ 急停 / 复位
          </button>
        </div>
      </header>
      <div className="project-bar">
        <div>
          <span className="red-square" />
          三轴书写工作台 <span className="divider">/</span>
          <span className="eyebrow">THE ART OF MOVEMENT</span>
        </div>
        <div className="project-actions">
          <button id="save">↓ 保存工程</button>
          <FileButton id="open" accept=".json">
            ↗ 打开工程
          </FileButton>
          <span className="edition">工作室 / 01</span>
        </div>
      </div>
      <div className="workspace">
        <aside className="panel creation">
          <Heading number="01" title="编排你的想法" english="COMPOSITION" />
          <Tabs
            label="创作工具"
            items={[
              ["text", "文字"],
              ["vector", "矢量图"],
            ]}
            value={tool}
            onChange={setTool}
          />
          <div className="panel-scroll">
            <Pane id="text" active={tool === "text"}>
              <label className="field" htmlFor="text">
                <span>
                  文字内容 <em>TYPE SOMETHING</em>
                </span>
                <textarea
                  id="text"
                  rows="4"
                  defaultValue="把想法，写在纸上。"
                  placeholder="输入想写下的文字…"
                />
              </label>
              <div className="file-pair">
                <FileButton id="txtFile" accept=".txt">
                  ＋ 文本文件
                </FileButton>
                <FileButton id="fontFile" accept=".ttf,.otf">
                  ＋ 字体文件
                </FileButton>
              </div>
              <small id="fontName" className="font-note">
                载入 TTF / OTF 字体以生成路径
              </small>
              <div className="two">
                <Field id="fontSize" label="字号 / mm" value={8} min={1} />
                <Field id="lineGap" label="行间距 / mm" value={4} min={0} />
                <Field
                  id="columns"
                  label="每行最多字数"
                  value={16}
                  step="1"
                  min={1}
                />
                <label className="field" htmlFor="align">
                  <span>段落对齐</span>
                  <select id="align" defaultValue="left">
                    <option value="left">左对齐</option>
                    <option value="center">居中</option>
                    <option value="right">右对齐</option>
                  </select>
                </label>
              </div>
              <Field
                id="maxLines"
                label="最多行数 · 0 为不限"
                value={0}
                min={0}
                step="1"
              />
              <button id="addText" className="primary full">
                生成文字路径 <span>↗</span>
              </button>
              <p className="hint">普通字体沿字形轮廓描边，非单线笔顺。</p>
            </Pane>
            <Pane id="vector" active={tool === "vector"}>
              <div className="vector-art" aria-hidden="true">
                <div />
                <i />
                <b>SVG</b>
              </div>
              <h3>让线条自由生长。</h3>
              <p className="hint">
                导入路径与基础几何形状，再在纸面上移动、缩放、旋转。
              </p>
              <FileButton id="svgFile" accept=".svg" className="upload-area">
                ＋ 导入 SVG 矢量图
              </FileButton>
              <p className="hint">请将文字转为路径。不含图片、填充与蒙版。</p>
            </Pane>
            <div className="section">
              <div className="section-title">
                <h3>画布图层</h3>
                <span id="layerCount" className="count">
                  00
                </span>
              </div>
              <div id="layers" className="layers" />
              <div className="layer-empty">
                还没有图层
                <br />
                <small>从一段文字，或一条线开始。</small>
              </div>
            </div>
            <div className="section">
              <div className="section-title">
                <h3>位置与变换</h3>
                <span className="eyebrow">TRANSFORM</span>
              </div>
              <div className="two">
                <Field id="ex" label="X / mm" value={20} />
                <Field id="ey" label="Y / mm" value={20} />
                <Field id="scale" label="缩放倍数" value={1} min={0.001} />
                <Field id="angle" label="旋转 / °" value={0} />
              </div>
              <div className="row">
                <button id="apply" className="ink">
                  应用变换 ↗
                </button>
                <button id="delete" className="text-danger">
                  删除
                </button>
              </div>
            </div>
          </div>
          <div className="panel-foot">
            <span className="tiny-cross">✳</span> 文字 · 线条 · 纸张
          </div>
        </aside>
        <main className="studio">
          <div className="studio-title">
            <div>
              <span className="eyebrow">PAPER IS YOUR STAGE</span>
              <h1>纸上，见。</h1>
            </div>
            <div className="studio-stamp">
              创作
              <br />
              <strong>进行时</strong>
              <span>MAKE YOUR MARK</span>
            </div>
          </div>
          <div className="canvas-toolbar">
            <span className="canvas-title">
              <b>02</b> 书写版面
            </span>
            <div>
              <button id="preview" aria-pressed="false">
                ◎ 路径预览
              </button>
              <button id="zoomOut" aria-label="缩小画布">
                −
              </button>
              <span id="zoomLabel" className="zoom-label">
                100%
              </span>
              <button id="zoomIn" aria-label="放大画布">
                ＋
              </button>
              <button id="fitCanvas" title="恢复纸面适配">
                ⤢ 适配
              </button>
            </div>
          </div>
          <div className="stage" id="stage">
            <div className="ruler ruler-top" aria-hidden="true" />
            <div className="ruler ruler-left" aria-hidden="true" />
            <span className="stage-origin">0,0 ↘</span>
            <span className="stage-label">MOJI / WORKING AREA</span>
            <div className="board">
              <svg
                id="canvas"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 210 297"
                width="595"
                height="842"
                aria-label="毫米排版画布"
              />
              <div className="canvas-empty" aria-hidden="true">
                <span className="empty-line" />
                <span>
                  每一笔，
                  <br />
                  都有自己的位置。
                </span>
                <small>从左侧添加文字或 SVG</small>
              </div>
            </div>
            <span id="dimensions" className="dimension-tag">
              210 × 297 mm
            </span>
          </div>
          <div className="canvas-caption">
            <span>
              ↖ 左上原点 <b>X → / Y ↓</b>
            </span>
            <span>拖动排列 · 缩放 · 旋转</span>
          </div>
          <details className="inspection">
            <summary>
              <span>＋ 叠加与检查</span>
              <span className="eyebrow">PHOTO / G-CODE / CONSOLE</span>
            </summary>
            <div className="inspection-body">
              <Tabs
                label="检查工具"
                items={[
                  ["photo", "照片叠加"],
                  ["gcode", "G-code"],
                  ["console", "串口终端"],
                ]}
                value={inspection}
                onChange={setInspection}
              />
              <Pane id="photo" active={inspection === "photo"}>
                <div className="two">
                  <FileButton id="basePhoto" accept="image/*">
                    ＋ 空底板照片
                  </FileButton>
                  <FileButton id="paperPhoto" accept="image/*">
                    ＋ 放纸后照片
                  </FileButton>
                </div>
                <div className="row">
                  <select
                    id="photoLayer"
                    aria-label="待校准照片"
                    defaultValue="base"
                  >
                    <option value="base">底板</option>
                    <option value="paper">纸张</option>
                  </select>
                  <button id="calibrate">四点校准</button>
                  <button id="clearPhoto">清除</button>
                </div>
                <label className="field" htmlFor="opacity">
                  <span>叠加透明度</span>
                  <input
                    id="opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    defaultValue="0.5"
                  />
                </label>
                <p className="hint">
                  依次点击工作矩形：左上 → 右上 → 右下 →
                  左下。真实尺寸使用工作区宽高。
                </p>
              </Pane>
              <Pane id="gcode" active={inspection === "gcode"}>
                <label className="field" htmlFor="code">
                  <span>生成的指令 · 可编辑</span>
                  <textarea
                    id="code"
                    spellCheck="false"
                    placeholder="生成 G-code 后在这里检查指令"
                  />
                </label>
              </Pane>
              <Pane id="console" active={inspection === "console"}>
                <div id="log" role="log" aria-label="串口日志" />
                <div className="row">
                  <input
                    id="command"
                    aria-label="串口命令"
                    placeholder="输入命令，如 $$"
                  />
                  <button id="send" className="ink">
                    发送 ↗
                  </button>
                </div>
              </Pane>
            </div>
          </details>
        </main>
        <aside className="panel machine">
          <Heading number="03" title="让机器落笔" english="MOTION & CONTROL" />
          <div id="position" className="coords">
            X —　Y —　Z —
          </div>
          <div id="serialError" className="serial-error" role="alert" hidden />
          <Tabs
            label="机器设置"
            items={[
              ["motion", "手动控制"],
              ["settings", "运笔设置"],
            ]}
            value={machine}
            onChange={setMachine}
          />
          <div className="panel-scroll">
            <Pane id="motion" active={machine === "motion"}>
              <div className="two">
                <Field
                  id="step"
                  label="点动距离 / mm"
                  value={0.1}
                  min={0.001}
                />
                <Field id="jogFeed" label="速度 / mm/min" value={100} min={1} />
              </div>
              <div className="jog">
                <button data-axis="Z" data-dir="-1" className="z-button">
                  抬笔 Z−
                </button>
                <button data-axis="Y" data-dir="-1">
                  ↑ Y−
                </button>
                <button data-axis="Z" data-dir="1" className="z-button">
                  落笔 Z＋
                </button>
                <button data-axis="X" data-dir="-1">
                  ← X−
                </button>
                <button id="cancelJog" title="取消点动">
                  ■
                </button>
                <button data-axis="X" data-dir="1">
                  X＋ →
                </button>
                <span />
                <button data-axis="Y" data-dir="1">
                  ↓ Y＋
                </button>
              </div>
              <div className="zero-controls">
                <button id="zero">
                  ↖ 设置左上原点 <b>X0 Y0</b>
                </button>
                <button id="zeroZ">
                  ↓ 设置落笔面 <b>Z0</b>
                </button>
              </div>
              <div className="power-block">
                <div className="section-title">
                  <h3>手动移笔</h3>
                  <span className="eyebrow">MOTOR</span>
                </div>
                <button
                  id="motorPower"
                  type="button"
                  aria-pressed="false"
                  disabled
                >
                  电机断电 / 休眠
                </button>
                <button id="unlock" type="button" hidden>
                  解除报警锁定
                </button>
                <p id="motorHint" className="hint" role="status">
                  连接后可休眠释放电机，手动移动笔。
                </p>
              </div>
            </Pane>
            <Pane id="settings" active={machine === "settings"}>
              <div className="section-title">
                <h3>工作区与运笔</h3>
                <span className="eyebrow">mm</span>
              </div>
              <div className="two">
                {[
                  ["width", "宽度 / mm", 210],
                  ["height", "高度 / mm", 297],
                  ["up", "抬笔 Z / mm", -3],
                  ["down", "落笔 Z / mm", 0],
                  ["feed", "书写 / mm/min", 800],
                  ["zFeed", "Z 速度 / mm/min", 100],
                ].map(([id, label, value]) => (
                  <Field key={id} id={id} label={label} value={value} />
                ))}
              </div>
              <p className="hint">
                Z+ 落笔 / Z− 抬笔。以纸面为 Z0，抬笔值应为负数，请先实测。
              </p>
              <details className="calibration-details">
                <summary>
                  步数标定 <span>＋</span>
                </summary>
                <div className="calibration-body">
                  <label className="field" htmlFor="calAxis">
                    <span>标定轴</span>
                    <select id="calAxis" defaultValue="X">
                      <option>X</option>
                      <option>Y</option>
                      <option>Z</option>
                    </select>
                  </label>
                  <Field id="oldSteps" label="当前 steps/mm" value={80} />
                  <div className="two">
                    <Field id="commanded" label="命令距离 / mm" value={10} />
                    <Field id="measured" label="实测距离 / mm" value={10} />
                  </div>
                  <div className="row">
                    <button id="calc">计算</button>
                    <button id="writeSteps" className="ink">
                      写入参数
                    </button>
                  </div>
                  <p id="calResult" className="hint" />
                </div>
              </details>
            </Pane>
          </div>
          <div className="job-dock">
            <div className="section-title">
              <h3>准备，让想法落地。</h3>
              <span className="job-symbol" aria-hidden="true">
                ↘
              </span>
            </div>
            <label className="verification">
              <input id="verified" type="checkbox" />
              <span>已确认轴方向、Z 高度与 G54 原点</span>
            </label>
            <div className="row">
              <button id="generate" className="primary">
                生成 G-code ↗
              </button>
              <button id="export">↓ 导出</button>
            </div>
            <progress id="progress" value="0" max="1" />
            <small id="job">等待生成路径</small>
            <div className="job-buttons">
              <button id="start" className="ink">
                ▶ 开始
              </button>
              <button id="pause">Ⅱ 暂停</button>
              <button id="resume">继续</button>
              <button id="stop" className="text-danger">
                ■ 停止
              </button>
            </div>
          </div>
        </aside>
      </div>
      <footer id="footer">
        <span>
          <i /> LOCAL FIRST · 本地创作
        </span>
        <span>
          纸面左上角 0,0 <b>/</b> X →　Y ↓　Z+ 落笔
        </span>
        <span>MOJI — 从屏幕，到纸面。</span>
      </footer>
      <div id="toast" role="status" />
    </>
  );
}
