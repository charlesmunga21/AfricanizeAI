// YOLO11n pre/post-processing. Pure functions, no ORT calls — the worker
// owns the session and calls these around session.run().
//
// Model I/O (verified against the actual ONNX graph, not assumed):
//   input  "images"  float32 [1, 3, 640, 640]  NCHW, RGB, 0..1
//   output "output0" float32 [1, 84, 8400]     4 box coords + 80 COCO class scores, per anchor

const PAD_COLOR = 114; // standard YOLO letterbox pad grey

// Resizes `bitmap` onto a 640x640 canvas preserving aspect ratio (letterbox),
// returns the NCHW tensor data plus the transform needed to map boxes back
// to source-image coordinates.
export function preprocess(bitmap, inputSize, canvas) {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = Math.min(inputSize / srcW, inputSize / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((inputSize - newW) / 2);
  const padY = Math.floor((inputSize - newH) / 2);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = `rgb(${PAD_COLOR},${PAD_COLOR},${PAD_COLOR})`;
  ctx.fillRect(0, 0, inputSize, inputSize);
  ctx.drawImage(bitmap, 0, 0, srcW, srcH, padX, padY, newW, newH);

  const { data } = ctx.getImageData(0, 0, inputSize, inputSize);
  const plane = inputSize * inputSize;
  const tensorData = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    tensorData[i] = data[i * 4] / 255; // R
    tensorData[plane + i] = data[i * 4 + 1] / 255; // G
    tensorData[2 * plane + i] = data[i * 4 + 2] / 255; // B
  }

  return { tensorData, transform: { scale, padX, padY, srcW, srcH } };
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

function nms(boxes, iouThreshold) {
  const byClass = new Map();
  for (const b of boxes) {
    if (!byClass.has(b.classId)) byClass.set(b.classId, []);
    byClass.get(b.classId).push(b);
  }
  const kept = [];
  for (const group of byClass.values()) {
    group.sort((a, b) => b.score - a.score);
    const active = [...group];
    while (active.length) {
      const best = active.shift();
      kept.push(best);
      for (let i = active.length - 1; i >= 0; i--) {
        if (iou(best, active[i]) > iouThreshold) active.splice(i, 1);
      }
    }
  }
  return kept;
}

// `output` is the raw Float32Array from output0, dims [1, 84, 8400].
export function postprocess(output, numAnchors, numClasses, transform, { confThreshold, iouThreshold, classFilter }) {
  const { scale, padX, padY, srcW, srcH } = transform;
  const candidates = [];

  for (let a = 0; a < numAnchors; a++) {
    let bestScore = 0;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * numAnchors + a];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < confThreshold) continue;
    if (classFilter && classFilter.size && !classFilter.has(bestClass)) continue;

    const cx = output[a];
    const cy = output[numAnchors + a];
    const w = output[2 * numAnchors + a];
    const h = output[3 * numAnchors + a];

    // 640-space box -> source-image space, reversing the letterbox transform.
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;

    candidates.push({
      x1: Math.max(0, x1),
      y1: Math.max(0, y1),
      x2: Math.min(srcW, x2),
      y2: Math.min(srcH, y2),
      classId: bestClass,
      score: bestScore,
    });
  }

  return nms(candidates, iouThreshold);
}
