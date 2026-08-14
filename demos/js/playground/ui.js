import { MLP } from "./net.js";
import { generateDataset, splitDataset, DATASET_NAMES } from "./data.js";
import { frame } from "../frame.js";

const MODULE = "PLAYGROUND";
const MAX_LAYERS = 4;
const MAX_NEURONS = 8;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hex2rgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---------- State ----------

const DEFAULTS = {
  dataset: "moons",
  noise: 10,
  split: 80,
  hidden: [4, 4],
  activation: "tanh",
  lrSlider: 60, // maps to log-scale learning rate
  reg: "none",
  regRate: 0.01,
  batch: 10,
  seed: 1,
};

function lrFromSlider(v) {
  // slider 0..100 -> lr 0.001..1, log scale
  const t = v / 100;
  return Math.pow(10, lerp(-3, 0, t));
}
function sliderFromLr(lr) {
  const t = (Math.log10(lr) + 3) / 3;
  return Math.round(t * 100);
}

function parseState() {
  const p = new URLSearchParams(location.search);
  const s = { ...DEFAULTS };
  if (p.has("dataset") && DATASET_NAMES.includes(p.get("dataset"))) s.dataset = p.get("dataset");
  if (p.has("noise")) s.noise = clamp(+p.get("noise"), 0, 50);
  if (p.has("split")) s.split = clamp(+p.get("split"), 10, 90);
  if (p.has("hidden")) {
    const h = p
      .get("hidden")
      .split(",")
      .map((n) => clamp(+n || 1, 1, MAX_NEURONS))
      .slice(0, MAX_LAYERS);
    if (h.length) s.hidden = h;
  }
  if (p.has("activation") && ["relu", "tanh", "sigmoid"].includes(p.get("activation")))
    s.activation = p.get("activation");
  if (p.has("lr")) s.lrSlider = sliderFromLr(clamp(+p.get("lr"), 0.001, 1));
  if (p.has("reg") && ["none", "l1", "l2"].includes(p.get("reg"))) s.reg = p.get("reg");
  if (p.has("regRate")) s.regRate = clamp(+p.get("regRate"), 0, 1);
  if (p.has("batch")) s.batch = clamp(+p.get("batch"), 1, 30);
  if (p.has("seed")) s.seed = +p.get("seed") || 1;
  return s;
}

function serializeState(s) {
  const p = new URLSearchParams();
  p.set("dataset", s.dataset);
  p.set("noise", s.noise);
  p.set("split", s.split);
  p.set("hidden", s.hidden.join(","));
  p.set("activation", s.activation);
  p.set("lr", lrFromSlider(s.lrSlider).toFixed(4));
  p.set("reg", s.reg);
  if (s.reg !== "none") p.set("regRate", s.regRate);
  p.set("batch", s.batch);
  p.set("seed", s.seed);
  history.replaceState(null, "", `?${p.toString()}`);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

let state = parseState();

// ---------- DOM ----------

const el = (id) => document.getElementById(id);
const canvas = el("pg-canvas");
const ctx = canvas.getContext("2d");
const sparkCanvas = el("pg-sparkline");
const sparkCtx = sparkCanvas.getContext("2d");
const thumbsHost = el("pg-thumbs");
const noteEl = el("pg-note");
const epochEl = el("pg-epoch");
const trainLossEl = el("pg-train-loss");
const testLossEl = el("pg-test-loss");
const layersHost = el("pg-layers");
const trainBtn = el("pg-train");
const stepBtn = el("pg-step");
const resetBtn = el("pg-reset");

let dataset = [];
let split = { train: [], test: [] };
let worker = null;
let latestSnapshot = null;
let renderNet = null;
let running = false;
let lossHistory = [];

// ---------- Controls ----------

function buildControls() {
  el("pg-dataset").innerHTML = DATASET_NAMES.map((d) => `<option value="${d}">${d}</option>`).join("");
  el("pg-dataset").value = state.dataset;
  el("pg-noise").value = state.noise;
  el("pg-noise-val").textContent = state.noise + "%";
  el("pg-split").value = state.split;
  el("pg-split-val").textContent = state.split + "% train";
  el("pg-activation").value = state.activation;
  el("pg-lr").value = state.lrSlider;
  el("pg-lr-val").textContent = lrFromSlider(state.lrSlider).toFixed(3);
  el("pg-reg").value = state.reg;
  el("pg-reg-rate").value = state.regRate;
  el("pg-reg-rate").hidden = state.reg === "none";
  el("pg-batch").value = state.batch;
  el("pg-batch-val").textContent = state.batch;
  renderLayers();

  el("pg-dataset").onchange = (e) => {
    state.dataset = e.target.value;
    reconfigure();
  };
  el("pg-noise").oninput = (e) => {
    state.noise = +e.target.value;
    el("pg-noise-val").textContent = state.noise + "%";
    reconfigure();
  };
  el("pg-split").oninput = (e) => {
    state.split = +e.target.value;
    el("pg-split-val").textContent = state.split + "% train";
    reconfigure();
  };
  el("pg-activation").onchange = (e) => {
    state.activation = e.target.value;
    reconfigure();
  };
  el("pg-lr").oninput = (e) => {
    state.lrSlider = +e.target.value;
    el("pg-lr-val").textContent = lrFromSlider(state.lrSlider).toFixed(3);
    pushHyperparams();
  };
  el("pg-reg").onchange = (e) => {
    state.reg = e.target.value;
    el("pg-reg-rate").hidden = state.reg === "none";
    pushHyperparams();
  };
  el("pg-reg-rate").oninput = (e) => {
    state.regRate = +e.target.value;
    pushHyperparams();
  };
  el("pg-batch").oninput = (e) => {
    state.batch = +e.target.value;
    el("pg-batch-val").textContent = state.batch;
    pushHyperparams();
  };
  el("pg-add-layer").onclick = () => {
    if (state.hidden.length >= MAX_LAYERS) return;
    state.hidden.push(4);
    renderLayers();
    reconfigure();
  };

  trainBtn.onclick = () => setRunning(!running);
  stepBtn.onclick = () => {
    setRunning(false);
    worker.postMessage({ type: "step" });
  };
  resetBtn.onclick = () => {
    state.seed = Math.floor(Math.random() * 1e6);
    reconfigure();
  };

  if (reducedMotion()) {
    trainBtn.hidden = true;
    stepBtn.textContent = "Step one epoch";
  }
}

function renderLayers() {
  layersHost.innerHTML = "";
  state.hidden.forEach((count, i) => {
    const row = document.createElement("div");
    row.className = "pg-layer-row";
    row.innerHTML = `
      <span class="mono">L${i + 1}</span>
      <input type="range" min="1" max="${MAX_NEURONS}" value="${count}" data-i="${i}" class="pg-layer-slider" />
      <span class="num pg-layer-count">${count}</span>
      <button type="button" class="btn btn--ghost pg-layer-remove" data-i="${i}" aria-label="Remove layer ${i + 1}">&times;</button>
    `;
    layersHost.appendChild(row);
  });
  layersHost.querySelectorAll(".pg-layer-slider").forEach((slider) => {
    slider.oninput = (e) => {
      const i = +e.target.dataset.i;
      state.hidden[i] = +e.target.value;
      slider.nextElementSibling.textContent = state.hidden[i];
      reconfigure();
    };
  });
  layersHost.querySelectorAll(".pg-layer-remove").forEach((btn) => {
    btn.onclick = (e) => {
      if (state.hidden.length <= 0) return;
      const i = +e.target.dataset.i;
      state.hidden.splice(i, 1);
      renderLayers();
      reconfigure();
    };
  });
}

// ---------- Worker wiring ----------

function initWorker() {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    if (e.data.type === "snapshot") onSnapshot(e.data);
  };
}

function reconfigure() {
  serializeState(state);
  dataset = generateDataset(state.dataset, { noise: state.noise / 100, seed: state.seed });
  split = splitDataset(dataset, state.split / 100, state.seed + 1);
  lossHistory = [];
  noteEl.hidden = true;
  renderNet = null;
  worker.postMessage({
    type: "configure",
    train: split.train,
    test: split.test,
    hiddenLayers: state.hidden,
    activation: state.activation,
    seed: state.seed,
    lr: lrFromSlider(state.lrSlider),
    reg: state.reg,
    regRate: state.regRate,
    batchSize: state.batch,
  });
  setRunning(false);
  drawStatic();
}

function pushHyperparams() {
  serializeState(state);
  worker.postMessage({
    type: "updateHyperparams",
    lr: lrFromSlider(state.lrSlider),
    reg: state.reg,
    regRate: state.regRate,
    batchSize: state.batch,
  });
}

function setRunning(next) {
  running = next;
  trainBtn.textContent = running ? "Pause" : "Train";
  frame.setState(MODULE, running ? "training" : "idle", `epoch ${latestSnapshot?.epoch ?? 0}`);
  worker.postMessage({ type: running ? "start" : "pause" });
}

// ---------- Rendering ----------

function applySnapshotToRenderNet(snap) {
  if (!renderNet) {
    renderNet = new MLP({ inputSize: 2, hiddenLayers: snap.sizes.slice(1, -1), activation: snap.activation, seed: 1 });
  }
  renderNet.sizes = snap.sizes;
  renderNet.activation = snap.activation;
  renderNet.layers = snap.layers;
}

function onSnapshot(snap) {
  latestSnapshot = snap;
  applySnapshotToRenderNet(snap);
  epochEl.textContent = snap.epoch;
  trainLossEl.textContent = snap.trainLoss.toFixed(3);
  testLossEl.textContent = snap.testLoss != null ? snap.testLoss.toFixed(3) : "–";
  lossHistory.push([snap.trainLoss, snap.testLoss]);
  if (lossHistory.length > 200) lossHistory.shift();
  frame.setState(MODULE, running ? "training" : "idle", `epoch ${snap.epoch}`);
  checkOverfit();

  if (reducedMotion()) {
    drawBoundary();
    drawPoints();
    drawThumbnails();
    drawSparkline();
  }
}

function checkOverfit() {
  if (lossHistory.length < 20) return;
  const recent = lossHistory.slice(-20);
  const trainSlope = recent[19][0] - recent[0][0];
  const testSlope = recent[19][1] - recent[0][1];
  if (trainSlope < -0.001 && testSlope > 0.001) {
    noteEl.hidden = false;
    noteEl.className = "note note--warn";
    noteEl.textContent =
      "Test loss is rising while train loss falls — the network is memorizing. Try more regularization or fewer neurons.";
  }
}

function drawStatic() {
  drawBoundary();
  drawPoints();
  drawThumbnails();
  drawSparkline();
}

function drawBoundary() {
  const w = canvas.width;
  const h = canvas.height;
  const box = hex2rgb(css("--box"));
  const mask = hex2rgb(css("--mask"));
  const neutral = hex2rgb(css("--surface"));
  const res = 48;
  const img = ctx.createImageData(w, h);
  const cell = w / res;

  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      const x = (gx / (res - 1)) * 2.4 - 1.2;
      const y = (gy / (res - 1)) * 2.4 - 1.2;
      const p = renderNet ? renderNet.predict([x, y]) : 0.5;
      const rgb = p < 0.5 ? lerpColor(box, neutral, p * 2) : lerpColor(neutral, mask, (p - 0.5) * 2);
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const ix = Math.floor(gx * cell + px);
          const iy = Math.floor(gy * cell + py);
          const idx = (iy * w + ix) * 4;
          img.data[idx] = rgb[0];
          img.data[idx + 1] = rgb[1];
          img.data[idx + 2] = rgb[2];
          img.data[idx + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function toCanvasXY(x, y) {
  return [((x + 1.2) / 2.4) * canvas.width, ((y + 1.2) / 2.4) * canvas.height];
}

function drawPoints() {
  const box = css("--box");
  const mask = css("--mask");
  const ink = css("--surface-2");
  for (const [pt, label] of split.train) {
    const [cx, cy] = toCanvasXY(pt[0], pt[1]);
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = label ? mask : box;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
  for (const [pt, label] of split.test) {
    const [cx, cy] = toCanvasXY(pt[0], pt[1]);
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.strokeStyle = label ? mask : box;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawThumbnails() {
  thumbsHost.innerHTML = "";
  if (!renderNet) return;
  const res = 16;
  const layerCount = renderNet.sizes.length - 2; // hidden layers only
  if (layerCount <= 0) return;

  const grids = renderNet.sizes.slice(1, -1).map((size) => Array.from({ length: size }, () => new Float32Array(res * res)));

  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      const x = (gx / (res - 1)) * 2.4 - 1.2;
      const y = (gy / (res - 1)) * 2.4 - 1.2;
      const { a } = renderNet.forward([x, y]);
      for (let l = 0; l < layerCount; l++) {
        const layerActivations = a[l + 1];
        for (let i = 0; i < layerActivations.length; i++) {
          grids[l][i][gy * res + gx] = layerActivations[i];
        }
      }
    }
  }

  const inkLight = hex2rgb(css("--ink-3"));
  const box = hex2rgb(css("--box"));
  for (let l = 0; l < layerCount; l++) {
    const layerWrap = document.createElement("div");
    layerWrap.className = "pg-thumb-layer";
    const label = document.createElement("div");
    label.className = "mono pg-thumb-label";
    label.textContent = `L${l + 1}`;
    layerWrap.appendChild(label);
    const row = document.createElement("div");
    row.className = "pg-thumb-row";
    grids[l].forEach((grid) => {
      const c = document.createElement("canvas");
      c.width = res;
      c.height = res;
      c.className = "pg-thumb";
      const tctx = c.getContext("2d");
      const img = tctx.createImageData(res, res);
      let min = Infinity;
      let max = -Infinity;
      for (const v of grid) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const range = max - min || 1;
      for (let i = 0; i < grid.length; i++) {
        const t = (grid[i] - min) / range;
        const rgb = lerpColor(inkLight, box, t);
        img.data[i * 4] = rgb[0];
        img.data[i * 4 + 1] = rgb[1];
        img.data[i * 4 + 2] = rgb[2];
        img.data[i * 4 + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
      row.appendChild(c);
    });
    layerWrap.appendChild(row);
    thumbsHost.appendChild(layerWrap);
  }
}

function drawSparkline() {
  const w = sparkCanvas.width;
  const h = sparkCanvas.height;
  sparkCtx.clearRect(0, 0, w, h);
  if (lossHistory.length < 2) return;
  const maxLoss = Math.max(0.05, ...lossHistory.flatMap(([tr, te]) => [tr, te ?? 0]));
  const plot = (idx, color) => {
    sparkCtx.beginPath();
    sparkCtx.strokeStyle = color;
    sparkCtx.lineWidth = 1.5;
    lossHistory.forEach((pair, i) => {
      const v = pair[idx];
      if (v == null) return;
      const x = (i / (lossHistory.length - 1)) * w;
      const y = h - (v / maxLoss) * h;
      i === 0 ? sparkCtx.moveTo(x, y) : sparkCtx.lineTo(x, y);
    });
    sparkCtx.stroke();
  };
  plot(0, css("--box"));
  plot(1, css("--mask"));
}

// ---------- Render loop (main thread renders only; training is worker-side) ----------

function tick() {
  if (!reducedMotion()) {
    drawBoundary();
    drawPoints();
    drawThumbnails();
    drawSparkline();
  }
  requestAnimationFrame(tick);
}

// ---------- Boot ----------

frame.mountAll();
frame.setState(MODULE, "idle", "epoch 0");
buildControls();
initWorker();
reconfigure();
requestAnimationFrame(tick);
