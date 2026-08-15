// Main-thread canvas drawing — boxes and masks only. Everything upstream of
// pixels (inference, NMS, mask thresholding) happens in the worker; this
// module never touches a tensor.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

// `boxes` are in source-frame pixel coords; `scaleX`/`scaleY` map that frame
// to the overlay canvas's own pixel size (they differ whenever the video's
// intrinsic resolution isn't the same as its rendered CSS size).
export function drawBoxes(ctx, boxes, classNames, { scaleX, scaleY }) {
  const boxColor = css("--box");
  const labelText = css("--surface-2");
  ctx.lineWidth = 2;
  ctx.font = "600 12px 'JetBrains Mono', monospace";
  ctx.textBaseline = "top";

  for (const b of boxes) {
    const x = b.x1 * scaleX;
    const y = b.y1 * scaleY;
    const w = (b.x2 - b.x1) * scaleX;
    const h = (b.y2 - b.y1) * scaleY;

    ctx.strokeStyle = boxColor;
    ctx.strokeRect(x, y, w, h);

    const label = `${classNames[b.classId] ?? b.classId} ${(b.score * 100).toFixed(0)}%`;
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = boxColor;
    ctx.fillRect(x, y - 16, textW + 8, 16);
    ctx.fillStyle = labelText;
    ctx.fillText(label, x + 4, y - 14);
  }
}

// fillBitmap/contourBitmap are already at the frozen frame's native
// resolution (the decoder upscales internally) — draw at the same rect the
// frame itself was drawn at.
export function drawMask(ctx, fillBitmap, contourBitmap, destRect) {
  ctx.drawImage(fillBitmap, destRect.x, destRect.y, destRect.w, destRect.h);
  ctx.drawImage(contourBitmap, destRect.x, destRect.y, destRect.w, destRect.h);
}
