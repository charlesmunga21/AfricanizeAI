import { frame } from "../frame.js";
import * as cam from "../camera.js";
import { fetchModel, isCached, isMeteredConnection, formatBytes } from "../model-cache.js";
import { drawBoxes, drawMask, clear } from "./overlay.js";
import { MODELS, THRESHOLDS, COCO_CLASSES, CACHE_VERSION, ORT_MODULE_URL, ORT_CDN_BASE } from "../config.js";

const MODULE = "LIVE";
const el = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const video = el("lv-video");
const canvas = el("lv-overlay");
const ctx = canvas.getContext("2d");
const stage = el("lv-stage");
const placeholder = el("lv-placeholder");
const hud = el("lv-hud");
const statusNote = el("lv-status");

const startBtn = el("lv-start");
const switchBtn = el("lv-switch");
const freezeBtn = el("lv-freeze");
const resumeBtn = el("lv-resume");
const clearPointsBtn = el("lv-clear-points");
const confField = el("lv-conf-field");
const confSlider = el("lv-conf");
const confVal = el("lv-conf-val");
const pointHint = el("lv-point-hint");
const classesHost = el("lv-classes");

const consentDialog = el("lv-consent");
const consentTitle = el("lv-consent-title");
const consentBody = el("lv-consent-body");
const consentProgress = el("lv-consent-progress");
const consentBar = el("lv-consent-bar");
const consentOk = el("lv-consent-ok");
const consentCancel = el("lv-consent-cancel");

let stream = null;
let facing = "environment";
let mode = "idle"; // idle | detecting | frozen
let paused = false; // tab hidden
let batteryPaused = false;
let workerBusy = false;
let frameId = 0;
let fpsEma = null;
let lastResultAt = 0;
let confThreshold = THRESHOLDS.confidence;
let classFilter = new Set();

let frozenBitmap = null; // kept for redraw, closed on resume
let points = [];
let lastMask = null; // { fillBitmap, contourBitmap }
let decodeRequestId = 0;

let detectReady = false;
let detectBackend = null;
let segmentReady = false;
let segmentLoading = false;
let segmentBackend = null;
let encoded = false; // true once the worker has embeddings for the current frozen frame

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map(); // requestId -> resolve, for the encode/decode request/response pairs

worker.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "booted":
      break;
    case "detectReady":
      detectReady = true;
      detectBackend = msg.backend;
      pending.get("loadDetect")?.();
      pending.delete("loadDetect");
      break;
    case "detectResult":
      onDetectResult(msg);
      break;
    case "segmentReady":
      segmentReady = true;
      segmentLoading = false;
      segmentBackend = msg.backend;
      pending.get("loadSegment")?.();
      pending.delete("loadSegment");
      break;
    case "encodeResult":
      pending.get(msg.requestId)?.(msg);
      pending.delete(msg.requestId);
      break;
    case "decodeResult":
      onDecodeResult(msg);
      break;
    case "error":
      showStatus(`${msg.stage}: ${msg.message}`, "warn");
      workerBusy = false;
      break;
  }
};

function bootWorker() {
  worker.postMessage({ type: "boot", ortModuleUrl: ORT_MODULE_URL, wasmBase: ORT_CDN_BASE });
}

function showStatus(text, kind = "info") {
  statusNote.hidden = false;
  statusNote.className = "note lv-status" + (kind === "warn" ? " note--warn" : "");
  statusNote.textContent = text;
}
function hideStatus() {
  statusNote.hidden = true;
}

// ---------- Model download, with the metered-connection consent gate ----------

function askConsent(modelName, bytes) {
  return new Promise((resolve) => {
    consentTitle.textContent = `Download ${modelName}`;
    consentBody.textContent = `This connection looks metered or slow. ${modelName} is ${formatBytes(bytes)}. Download it now?`;
    consentProgress.hidden = true;
    consentBar.style.width = "0%";
    consentDialog.showModal();
    const cleanup = () => {
      consentOk.onclick = null;
      consentCancel.onclick = null;
      consentDialog.close();
    };
    consentOk.onclick = () => {
      cleanup();
      resolve(true);
    };
    consentCancel.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

async function ensureModel(key) {
  const meta = MODELS[key];
  const cached = await isCached(meta.url, CACHE_VERSION);

  if (!cached && isMeteredConnection()) {
    const ok = await askConsent(meta.name, meta.bytes);
    if (!ok) throw Object.assign(new Error("Download declined"), { code: "declined" });
    consentDialog.showModal();
    consentProgress.hidden = false;
  }

  showStatus(`Downloading ${meta.name} — 0 of ${formatBytes(meta.bytes)}`, "info");
  const buffer = await fetchModel(meta.url, CACHE_VERSION, ({ loaded, total, fromCache }) => {
    if (fromCache) return;
    const t = total || meta.bytes;
    const pct = Math.round((loaded / t) * 100);
    showStatus(`Downloading ${meta.name} — ${formatBytes(loaded)} of ${formatBytes(t)}`, "info");
    if (!consentDialog.open) return;
    consentBar.style.width = `${pct}%`;
  });
  if (consentDialog.open) consentDialog.close();
  hideStatus();
  return buffer;
}

function loadDetectModel() {
  return ensureModel("detect").then(
    (buffer) =>
      new Promise((resolve) => {
        pending.set("loadDetect", resolve);
        worker.postMessage({ type: "loadDetect", buffer }, [buffer]);
      }),
  );
}

async function loadSegmentModels() {
  if (segmentReady || segmentLoading) return;
  segmentLoading = true;
  const [encoderBuffer, decoderBuffer] = await Promise.all([
    ensureModel("samEncoder"),
    ensureModel("samDecoder"),
  ]);
  await new Promise((resolve) => {
    pending.set("loadSegment", resolve);
    worker.postMessage({ type: "loadSegment", encoderBuffer, decoderBuffer }, [encoderBuffer, decoderBuffer]);
  });
}

// ---------- Camera lifecycle ----------

async function handleStart() {
  const permission = await cam.checkPermission();
  if (permission === cam.PermissionState.DENIED) {
    showStatus("Camera blocked. Allow camera access in your browser's site settings, then reload.", "warn");
    return;
  }
  if (permission === cam.PermissionState.UNSUPPORTED) {
    showStatus("Camera isn't supported in this browser.", "warn");
    return;
  }

  startBtn.disabled = true;
  frame.setState(MODULE, "idle", "requesting camera");
  try {
    stream = await cam.startCamera(video, { facingMode: facing });
  } catch (err) {
    showStatus(err.message, "warn");
    frame.setState(MODULE, "idle");
    startBtn.disabled = false;
    return;
  }

  video.hidden = false;
  placeholder.hidden = true;
  startBtn.hidden = true;
  switchBtn.hidden = false;
  freezeBtn.hidden = false;
  confField.hidden = false;
  classesHost.hidden = false;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  };

  cam.onVisibilityChange((visible) => {
    paused = !visible;
  });
  cam.onLowBattery((shouldPause, level) => {
    batteryPaused = shouldPause;
    if (shouldPause) frame.setState(MODULE, "degraded", `battery ${Math.round(level * 100)}% — paused`);
  });

  try {
    await loadDetectModel();
  } catch (err) {
    if (err.code !== "declined") showStatus(err.message, "warn");
    frame.setState(MODULE, "idle", "model not downloaded");
    return;
  }

  mode = "detecting";
  startDetectLoop();
}

function startDetectLoop() {
  const step = () => {
    if (mode === "detecting" && !paused && !batteryPaused && !workerBusy && detectReady) {
      sendFrameForDetection();
    }
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(step);
    } else {
      requestAnimationFrame(step);
    }
  };
  if ("requestVideoFrameCallback" in video) {
    video.requestVideoFrameCallback(step);
  } else {
    requestAnimationFrame(step);
  }
}

async function sendFrameForDetection() {
  workerBusy = true;
  const bitmap = await createImageBitmap(video);
  const id = ++frameId;
  worker.postMessage(
    {
      type: "detectFrame",
      bitmap,
      frameId: id,
      inputSize: MODELS.detect.inputSize,
      confThreshold,
      iouThreshold: THRESHOLDS.iou,
      classFilter: classFilter.size ? [...classFilter] : null,
    },
    [bitmap],
  );
}

function onDetectResult({ boxes, ms }) {
  workerBusy = false;
  if (mode !== "detecting") return; // a freeze happened while this frame was in flight

  const now = performance.now();
  if (lastResultAt) {
    const dt = now - lastResultAt;
    const fps = 1000 / dt;
    fpsEma = fpsEma == null ? fps : fpsEma * 0.85 + fps * 0.15;
  }
  lastResultAt = now;

  clear(ctx, canvas.width, canvas.height);
  drawBoxes(ctx, boxes, COCO_CLASSES, { scaleX: 1, scaleY: 1 });

  const backend = detectBackend || "wasm";
  const fpsText = fpsEma ? `${fpsEma.toFixed(0)} FPS` : "…";
  hud.hidden = false;
  hud.textContent = `YOLO11N · ${backend.toUpperCase()}\n${ms.toFixed(0)}ms · ${fpsText}\n${video.videoWidth}×${video.videoHeight}`;
  frame.setState(MODULE, backend === "webgpu" ? "live" : "degraded", `${backend.toUpperCase()} · ${fpsText}`, "YOLO11N");
}

// ---------- Freeze + segment ----------

async function handleFreeze() {
  video.pause();
  mode = "frozen";
  frozenBitmap = await createImageBitmap(video);
  redrawFrozen();

  freezeBtn.hidden = true;
  resumeBtn.hidden = false;
  clearPointsBtn.hidden = false;

  frame.setState(MODULE, "idle", "loading models", "SAM");
  try {
    await loadSegmentModels();
  } catch (err) {
    showStatus(err.message, "warn");
    return;
  }

  const bitmapForWorker = await createImageBitmap(video);
  frame.setState(MODULE, "idle", "ENCODING", "SAM");
  await new Promise((resolve) => {
    const requestId = "encode";
    pending.set(requestId, resolve);
    worker.postMessage({ type: "encodeFrame", bitmap: bitmapForWorker, requestId }, [bitmapForWorker]);
  });

  // Only now is a tap meaningful — the worker has embeddings to decode against.
  encoded = true;
  pointHint.hidden = false;
  stage.classList.add("lv-clickable");
  frame.setState(MODULE, "live", "tap to segment", "SAM");
}

function redrawFrozen() {
  clear(ctx, canvas.width, canvas.height);
  if (!frozenBitmap) return;
  ctx.drawImage(frozenBitmap, 0, 0, canvas.width, canvas.height);
  if (lastMask) {
    drawMask(ctx, lastMask.fillBitmap, lastMask.contourBitmap, { x: 0, y: 0, w: canvas.width, h: canvas.height });
  }
  for (const p of points) {
    ctx.strokeStyle = p.label ? css("--box") : css("--warn");
    ctx.lineWidth = 3;
    const r = 8;
    ctx.beginPath();
    if (p.label) {
      ctx.moveTo(p.x - r, p.y);
      ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x, p.y + r);
    } else {
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
    }
    ctx.stroke();
  }
}

function handleStageClick(e) {
  if (mode !== "frozen" || !encoded) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  points.push({ x, y, label: e.shiftKey ? 0 : 1 });
  redrawFrozen();
  requestDecode();
}

function requestDecode() {
  const requestId = ++decodeRequestId;
  frame.setState(MODULE, "idle", "DECODING", "SAM");
  worker.postMessage({ type: "decodePoints", points: points.map((p) => ({ x: p.x, y: p.y, label: p.label })), requestId });
}

function onDecodeResult({ requestId, fillBitmap, contourBitmap, iou, ms }) {
  if (requestId !== decodeRequestId) {
    // A newer request superseded this one — discard stale bitmaps.
    fillBitmap.close();
    contourBitmap.close();
    return;
  }
  if (lastMask) {
    lastMask.fillBitmap.close();
    lastMask.contourBitmap.close();
  }
  lastMask = { fillBitmap, contourBitmap };
  redrawFrozen();
  frame.setState(MODULE, "live", `IOU ${iou.toFixed(2)} · ${ms.toFixed(0)}ms`, "SAM");
}

function handleClearPoints() {
  points = [];
  if (lastMask) {
    lastMask.fillBitmap.close();
    lastMask.contourBitmap.close();
    lastMask = null;
  }
  redrawFrozen();
  frame.setState(MODULE, "live", "tap to segment", "SAM");
}

function handleResume() {
  frozenBitmap?.close();
  frozenBitmap = null;
  encoded = false;
  points = [];
  if (lastMask) {
    lastMask.fillBitmap.close();
    lastMask.contourBitmap.close();
    lastMask = null;
  }
  stage.classList.remove("lv-clickable");
  pointHint.hidden = true;
  clearPointsBtn.hidden = true;
  resumeBtn.hidden = true;
  freezeBtn.hidden = false;
  clear(ctx, canvas.width, canvas.height);
  video.play();
  mode = "detecting";
}

// ---------- Controls ----------

async function handleSwitch() {
  const result = await cam.switchFacing(video, stream, facing);
  stream = result.stream;
  facing = result.facing;
}

function buildClassChips() {
  classesHost.innerHTML = "";
  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "lv-chip";
  allChip.textContent = "All classes";
  allChip.setAttribute("aria-pressed", String(classFilter.size === 0));
  allChip.onclick = () => {
    classFilter.clear();
    [...classesHost.children].forEach((c) => c.setAttribute("aria-pressed", c === allChip ? "true" : "false"));
  };
  classesHost.appendChild(allChip);

  COCO_CLASSES.forEach((name, id) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "lv-chip";
    chip.textContent = name;
    chip.setAttribute("aria-pressed", "false");
    chip.onclick = () => {
      const pressed = chip.getAttribute("aria-pressed") === "true";
      if (pressed) {
        classFilter.delete(id);
        chip.setAttribute("aria-pressed", "false");
      } else {
        classFilter.add(id);
        chip.setAttribute("aria-pressed", "true");
      }
      allChip.setAttribute("aria-pressed", String(classFilter.size === 0));
    };
    classesHost.appendChild(chip);
  });
}

async function renderQr() {
  if (window.innerWidth < 860) return; // only worth building on desktop viewports (see CSS)
  const { default: qrcodeFactory } = await import("https://esm.sh/qrcode-generator@1.4.4");
  const qr = qrcodeFactory(0, "M");
  qr.addData(location.href);
  qr.make();
  el("lv-qr-code").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
}

function boot() {
  frame.mountAll();
  frame.setState(MODULE, "idle");
  bootWorker();
  buildClassChips();
  renderQr();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  startBtn.onclick = handleStart;
  switchBtn.onclick = handleSwitch;
  freezeBtn.onclick = handleFreeze;
  resumeBtn.onclick = handleResume;
  clearPointsBtn.onclick = handleClearPoints;
  canvas.addEventListener("click", handleStageClick);

  confSlider.value = confThreshold * 100;
  confVal.textContent = `${Math.round(confThreshold * 100)}%`;
  confSlider.oninput = (e) => {
    confThreshold = +e.target.value / 100;
    confVal.textContent = `${e.target.value}%`;
  };
}

boot();
