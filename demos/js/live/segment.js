// MobileSAM pre/post-processing for the freeze-then-prompt flow (§4.3).
// Pure functions; the worker owns both ONNX sessions and calls these around
// session.run().
//
// Model I/O (verified against the actual ONNX graphs, not assumed):
//   encoder input  "input_image"     float32 [h, w, 3]   raw RGB 0..255, HWC, UNNORMALIZED
//                                                          (the graph itself does mean/std
//                                                          normalize + pad-to-1024 + batch —
//                                                          do not double-normalize here)
//   encoder output "image_embeddings" float32 [1, 256, 64, 64]
//
//   decoder inputs "image_embeddings" [1,256,64,64]
//                  "point_coords"     float32 [1, N, 2]  in the RESIZED (longest-side-1024,
//                                                          pre-pad) pixel space — same space
//                                                          `resizeLongestSide` below produces
//                  "point_labels"     float32 [1, N]     1 = foreground, 0 = background
//                  "mask_input"       float32 [1,1,256,256] zeros (no mask prompt in v1)
//                  "has_mask_input"   float32 [1]         0
//                  "orig_im_size"     float32 [2]         [H, W] of the ORIGINAL frame
//   decoder output "masks"            float32 [1,1,H,W]  logits, already upscaled to
//                                                          orig_im_size by the graph —
//                                                          threshold > 0 for foreground

export const SAM_IMG_SIZE = 1024;

// Resizes so the longest side hits `targetLong`, no padding (the encoder
// graph pads internally). Returns raw HWC pixel data — the encoder does its
// own mean/std normalization, so these are 0..255 floats, not 0..1.
export function resizeLongestSide(bitmap, targetLong, canvas) {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = targetLong / Math.max(srcW, srcH);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, srcW, srcH, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    out[i * 3] = data[i * 4];
    out[i * 3 + 1] = data[i * 4 + 1];
    out[i * 3 + 2] = data[i * 4 + 2];
  }
  return { data: out, w, h, scale };
}

// `points` is [{x, y, label}] in ORIGINAL frame pixel coords, label 1 (fg) or 0 (bg).
// `scale` is the value resizeLongestSide returned for this frame.
export function pointsToTensors(points, scale) {
  const coords = new Float32Array(points.length * 2);
  const labels = new Float32Array(points.length);
  points.forEach((p, i) => {
    coords[i * 2] = p.x * scale;
    coords[i * 2 + 1] = p.y * scale;
    labels[i] = p.label;
  });
  return { coords, labels };
}

// Mask logits ([1,1,H,W], already at original-frame resolution) -> binary 0/1 array.
export function logitsToBinary(logits, w, h, threshold = 0) {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = logits[i] > threshold ? 1 : 0;
  return out;
}

// 4-connected edge detection, dilated by one pixel to read as a ~2px contour
// rather than a hairline — matches the frame's own corner-tick weight.
export function contourFromBinary(binary, w, h) {
  const edge = new Uint8Array(w * h);
  const isEdge = (x, y) => {
    const v = binary[y * w + x];
    if (!v) return false;
    const n = x > 0 && !binary[y * w + x - 1];
    const s = x < w - 1 && !binary[y * w + x + 1];
    const e = y > 0 && !binary[(y - 1) * w + x];
    const wst = y < h - 1 && !binary[(y + 1) * w + x];
    return n || s || e || wst || x === 0 || x === w - 1 || y === 0 || y === h - 1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEdge(x, y)) edge[y * w + x] = 1;
    }
  }
  // Dilate once for a visible 2px line.
  const dilated = new Uint8Array(edge);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!edge[y * w + x]) continue;
      if (x + 1 < w) dilated[y * w + x + 1] = 1;
      if (y + 1 < h) dilated[(y + 1) * w + x] = 1;
    }
  }
  return dilated;
}

export function binaryToImageData(binary, w, h, [r, g, b], alpha) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = binary[i] ? alpha : 0;
  }
  return new ImageData(data, w, h);
}
