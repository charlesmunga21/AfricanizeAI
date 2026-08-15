// The inference worker. Owns every ONNX Runtime session and every heavy
// compute step so the main thread only ever renders — see §4.3's frame
// pacing note. Bitmaps arrive as transferables (zero-copy); results going
// back are small (boxes as plain numbers, masks as ImageBitmaps).
//
// Never queue frames: main.js tracks a busy flag and simply doesn't post a
// new frame while this worker is still chewing on the last one. A dropped
// frame is invisible; a growing backlog is what makes a live demo feel broken.

import { configureOrt, createSession } from "../runtime.js";
import * as detect from "./detect.js";
import * as segment from "./segment.js";

let ort = null;
let detectSession = null;
let encoderSession = null;
let decoderSession = null;

const detectCanvas = new OffscreenCanvas(640, 640);
const segmentCanvas = new OffscreenCanvas(1, 1);

// State from the most recent freeze+encode, needed by decodePoints.
let embeddingState = null; // { embeddings: ort.Tensor, scale, w, h, origW, origH }

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "boot":
        await boot(msg.ortModuleUrl, msg.wasmBase);
        break;
      case "loadDetect":
        await loadDetect(msg.buffer);
        break;
      case "detectFrame":
        await runDetect(msg);
        break;
      case "loadSegment":
        await loadSegment(msg.encoderBuffer, msg.decoderBuffer);
        break;
      case "encodeFrame":
        await runEncode(msg);
        break;
      case "decodePoints":
        await runDecode(msg);
        break;
    }
  } catch (err) {
    self.postMessage({ type: "error", stage: msg.type, message: err.message });
  }
};

async function boot(ortModuleUrl, wasmBase) {
  ort = await import(ortModuleUrl);
  configureOrt(ort, wasmBase);
  self.postMessage({ type: "booted", hasWebGPU: "gpu" in self.navigator });
}

async function loadDetect(buffer) {
  const { session, backend } = await createSession(ort, buffer);
  detectSession = session;
  self.postMessage({ type: "detectReady", backend });
}

async function runDetect({ bitmap, frameId, inputSize, confThreshold, iouThreshold, classFilter }) {
  const t0 = performance.now();
  const { tensorData, transform } = detect.preprocess(bitmap, inputSize, detectCanvas);
  bitmap.close();

  const feeds = { images: new ort.Tensor("float32", tensorData, [1, 3, inputSize, inputSize]) };
  const results = await detectSession.run(feeds);
  const out = results.output0;
  const numAnchors = out.dims[2];
  const numClasses = out.dims[1] - 4;

  const boxes = detect.postprocess(out.data, numAnchors, numClasses, transform, {
    confThreshold,
    iouThreshold,
    classFilter: classFilter ? new Set(classFilter) : null,
  });

  self.postMessage({ type: "detectResult", frameId, boxes, ms: performance.now() - t0 });
}

async function loadSegment(encoderBuffer, decoderBuffer) {
  const [enc, dec] = await Promise.all([createSession(ort, encoderBuffer), createSession(ort, decoderBuffer)]);
  encoderSession = enc.session;
  decoderSession = dec.session;
  self.postMessage({ type: "segmentReady", backend: enc.backend });
}

async function runEncode({ bitmap, requestId }) {
  const t0 = performance.now();
  const origW = bitmap.width;
  const origH = bitmap.height;
  const { data, w, h, scale } = segment.resizeLongestSide(bitmap, segment.SAM_IMG_SIZE, segmentCanvas);
  bitmap.close();

  const feeds = { input_image: new ort.Tensor("float32", data, [h, w, 3]) };
  const results = await encoderSession.run(feeds);

  embeddingState = { embeddings: results.image_embeddings, scale, w, h, origW, origH };
  self.postMessage({ type: "encodeResult", requestId, ms: performance.now() - t0 });
}

async function runDecode({ points, requestId }) {
  if (!embeddingState) {
    self.postMessage({ type: "error", stage: "decodePoints", message: "No frame encoded yet." });
    return;
  }
  const t0 = performance.now();
  const { embeddings, scale, origW, origH } = embeddingState;
  const { coords, labels } = segment.pointsToTensors(points, scale);

  const feeds = {
    image_embeddings: embeddings,
    point_coords: new ort.Tensor("float32", coords, [1, points.length, 2]),
    point_labels: new ort.Tensor("float32", labels, [1, points.length]),
    mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor("float32", Float32Array.of(0), [1]),
    orig_im_size: new ort.Tensor("float32", Float32Array.of(origH, origW), [2]),
  };
  const results = await decoderSession.run(feeds);
  const [, , h, w] = results.masks.dims;
  const binary = segment.logitsToBinary(results.masks.data, w, h);
  const contour = segment.contourFromBinary(binary, w, h);

  const boxColor = [255, 61, 139]; // --mask, matched in JS since workers can't read CSS custom properties
  const fillData = segment.binaryToImageData(binary, w, h, boxColor, Math.round(255 * 0.45));
  const contourData = segment.binaryToImageData(contour, w, h, boxColor, 255);
  const [fillBitmap, contourBitmap] = await Promise.all([
    createImageBitmap(fillData),
    createImageBitmap(contourData),
  ]);

  self.postMessage(
    {
      type: "decodeResult",
      requestId,
      fillBitmap,
      contourBitmap,
      iou: results.iou_predictions.data[0],
      ms: performance.now() - t0,
    },
    [fillBitmap, contourBitmap],
  );
}
