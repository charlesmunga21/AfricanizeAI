// Assisted labelling: run the same YOLO11n detector live.html uses, but as a
// single one-shot call over a still image rather than a per-frame video loop.
// That's why this has no worker and no OffscreenCanvas — a few hundred
// milliseconds of main-thread blocking on a button click is fine; it would
// not be fine at 20+ fps, which is why live.html's version is worker-based.
// Reuses live/detect.js's pure pre/postprocess functions unchanged.

import { MODELS, THRESHOLDS, COCO_CLASSES, CACHE_VERSION, ORT_MODULE_URL, ORT_CDN_BASE } from "../config.js";
import { configureOrt, createSession } from "../runtime.js";
import { fetchModel, isCached, isMeteredConnection, formatBytes } from "../model-cache.js";
import { preprocess, postprocess } from "../live/detect.js";

const workCanvas = document.createElement("canvas");
workCanvas.width = MODELS.detect.inputSize;
workCanvas.height = MODELS.detect.inputSize;

let ort = null;
let session = null;
let backend = null;

export const modelName = MODELS.detect.name;
export const modelBytes = MODELS.detect.bytes;

export function isModelCached() {
  return isCached(MODELS.detect.url, CACHE_VERSION);
}
export { isMeteredConnection, formatBytes };

// onProgress({ loaded, total, fromCache }) — same shape as model-cache.js's
// fetchModel, passed straight through so the caller can drive a progress bar.
export async function ensureSession(onProgress) {
  if (session) return { backend };
  if (!ort) {
    ort = await import(ORT_MODULE_URL);
    configureOrt(ort, ORT_CDN_BASE);
  }
  const buffer = await fetchModel(MODELS.detect.url, CACHE_VERSION, onProgress);
  const created = await createSession(ort, buffer);
  session = created.session;
  backend = created.backend;
  return { backend };
}

// Returns boxes in the bitmap's own pixel space — [{ x1, y1, x2, y2, className, score }].
// Caller (ui.js) normalizes to 0..1 and maps className to a project class.
export async function suggestBoxes(bitmap, { confThreshold = THRESHOLDS.confidence, iouThreshold = THRESHOLDS.iou } = {}) {
  if (!session) throw new Error("assist.suggestBoxes: call ensureSession() first");
  const inputSize = MODELS.detect.inputSize;
  const { tensorData, transform } = preprocess(bitmap, inputSize, workCanvas);

  const feeds = { images: new ort.Tensor("float32", tensorData, [1, 3, inputSize, inputSize]) };
  const results = await session.run(feeds);
  const out = results.output0;
  const numAnchors = out.dims[2];
  const numClasses = out.dims[1] - 4;

  const boxes = postprocess(out.data, numAnchors, numClasses, transform, {
    confThreshold,
    iouThreshold,
    classFilter: null,
  });

  return boxes.map((b) => ({ ...b, className: COCO_CLASSES[b.classId] ?? `class_${b.classId}` }));
}
