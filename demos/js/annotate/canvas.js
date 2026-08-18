// The annotation canvas: render loop, coordinate transforms, and hit-testing.
// Owns the view (zoom/pan) and drawing; does not own tool state or pointer
// interpretation — tools.js calls into `screenToNorm` / `hitTest` and tells
// this module what to draw. Keeping "where things are on screen" separate
// from "what a drag means" is what lets box and polygon tools share one canvas.

const HANDLE_SCREEN_RADIUS = 8; // px, hit radius for corner/vertex handles — fixed in screen space so it doesn't shrink to unusable at high zoom
const VERTEX_SCREEN_RADIUS = 7;

export class AnnotationCanvas {
  // onResize fires after a *layout-driven* resize (window resize, sidebar
  // reflow, a self-hosted font finishing its swap) so the caller can redraw
  // at the new backing-store size — see the resize() comment for why this
  // can't just redraw itself.
  constructor(canvasEl, { onResize } = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.image = null; // { bitmap, width, height }
    this.view = { scale: 1, offsetX: 0, offsetY: 0 };
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    // Run the initial resize before wiring onResize: this constructor call is
    // typically still the right-hand side of `const canvas = new
    // AnnotationCanvas(...)` in the caller, so a callback that closes over
    // that `canvas` binding would hit it mid-initialization if fired now.
    // Nothing needs redrawing yet anyway — no image is loaded at construction time.
    this.resize();
    this.onResize = onResize;
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvasEl.parentElement);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.round(rect.width * this.dpr);
    const height = Math.round(rect.height * this.dpr);
    // Assigning canvas.width/height clears the bitmap even when set to its
    // current value — the canvas spec treats it as a reset, not a no-op. The
    // ResizeObserver fires once immediately on observe() and again whenever
    // a later reflow (window resize, a self-hosted font's swap shifting
    // toolbar width) touches this box, so without this guard every one of
    // those fires silently wipes whatever was just drawn.
    if (width === this.canvas.width && height === this.canvas.height) {
      this.cssWidth = rect.width;
      this.cssHeight = rect.height;
      return;
    }
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.onResize?.();
  }

  setImage(bitmap, width, height) {
    this.image = { bitmap, width, height };
    this.fitToScreen();
  }

  clearImage() {
    this.image = null;
  }

  fitToScreen() {
    if (!this.image) return;
    const pad = 24;
    const availW = Math.max(1, this.cssWidth - pad * 2);
    const availH = Math.max(1, this.cssHeight - pad * 2);
    const scale = Math.min(availW / this.image.width, availH / this.image.height);
    this.view.scale = scale;
    this.view.offsetX = (this.cssWidth - this.image.width * scale) / 2;
    this.view.offsetY = (this.cssHeight - this.image.height * scale) / 2;
  }

  zoomAt(factor, screenPoint) {
    const { scale, offsetX, offsetY } = this.view;
    const nextScale = Math.min(16, Math.max(0.05, scale * factor));
    const imgX = (screenPoint.x - offsetX) / scale;
    const imgY = (screenPoint.y - offsetY) / scale;
    this.view.scale = nextScale;
    this.view.offsetX = screenPoint.x - imgX * nextScale;
    this.view.offsetY = screenPoint.y - imgY * nextScale;
  }

  pan(dx, dy) {
    this.view.offsetX += dx;
    this.view.offsetY += dy;
  }

  // ---------- Coordinate transforms ----------
  // Screen = CSS pixels within the canvas element. Image = pixel space of the
  // loaded bitmap. Norm = 0..1 over image dimensions — the only space that
  // ever reaches the store.

  screenToImage(pt) {
    return {
      x: (pt.x - this.view.offsetX) / this.view.scale,
      y: (pt.y - this.view.offsetY) / this.view.scale,
    };
  }

  imageToScreen(pt) {
    return {
      x: pt.x * this.view.scale + this.view.offsetX,
      y: pt.y * this.view.scale + this.view.offsetY,
    };
  }

  screenToNorm(pt) {
    if (!this.image) return { x: 0, y: 0 };
    const img = this.screenToImage(pt);
    return { x: img.x / this.image.width, y: img.y / this.image.height };
  }

  normToScreen(pt) {
    if (!this.image) return { x: 0, y: 0 };
    return this.imageToScreen({ x: pt.x * this.image.width, y: pt.y * this.image.height });
  }

  clientToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // ---------- Hit-testing ----------
  // Returns the topmost (last-drawn) match: { annotation, handle } where handle
  // is 'move', a box corner ('tl'|'tr'|'bl'|'br'), or a polygon vertex index.

  hitTest(screenPt, annotations) {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      const hit = a.type === "box" ? this._hitBox(screenPt, a) : this._hitPolygon(screenPt, a);
      if (hit) return { annotation: a, ...hit };
    }
    return null;
  }

  _hitBox(screenPt, annotation) {
    const { x, y, w, h } = annotation.data;
    const tl = this.normToScreen({ x, y });
    const br = this.normToScreen({ x: x + w, y: y + h });
    const corners = {
      tl,
      tr: { x: br.x, y: tl.y },
      bl: { x: tl.x, y: br.y },
      br,
    };
    for (const [handle, pt] of Object.entries(corners)) {
      if (dist(screenPt, pt) <= HANDLE_SCREEN_RADIUS) return { handle };
    }
    if (screenPt.x >= tl.x && screenPt.x <= br.x && screenPt.y >= tl.y && screenPt.y <= br.y) {
      return { handle: "move" };
    }
    return null;
  }

  _hitPolygon(screenPt, annotation) {
    const points = annotation.data.points.map((p) => this.normToScreen({ x: p[0], y: p[1] }));
    for (let i = 0; i < points.length; i++) {
      if (dist(screenPt, points[i]) <= VERTEX_SCREEN_RADIUS) return { handle: i };
    }
    if (pointInPolygon(screenPt, points)) return { handle: "move" };
    return null;
  }

  // ---------- Render ----------

  draw({ annotations, classColorMap, selectedId, hoverId, inProgress } = {}) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    ctx.fillStyle = "#1a1e24";
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    if (this.image) {
      const tl = this.imageToScreen({ x: 0, y: 0 });
      ctx.drawImage(
        this.image.bitmap,
        tl.x,
        tl.y,
        this.image.width * this.view.scale,
        this.image.height * this.view.scale
      );
    }

    for (const a of annotations || []) {
      const color = classColorMap?.get(a.classId) ?? "#1B4DFF";
      const label = classColorMap?.get(`${a.classId}:name`) ?? "";
      const selected = a.id === selectedId;
      const hovered = a.id === hoverId;
      if (a.type === "box") this._drawBox(a, color, label, selected, hovered);
      else this._drawPolygon(a, color, label, selected, hovered);
    }

    if (inProgress) this._drawInProgress(inProgress);
  }

  _drawBox(a, color, label, selected, hovered) {
    const ctx = this.ctx;
    const tl = this.normToScreen({ x: a.data.x, y: a.data.y });
    const w = a.data.w * this.image.width * this.view.scale;
    const h = a.data.h * this.image.height * this.view.scale;

    ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.5;
    ctx.strokeStyle = color;
    ctx.fillStyle = hexToRgba(color, selected ? 0.16 : 0.08);
    ctx.fillRect(tl.x, tl.y, w, h);
    ctx.strokeRect(tl.x, tl.y, w, h);

    if (selected) {
      for (const pt of [tl, { x: tl.x + w, y: tl.y }, { x: tl.x, y: tl.y + h }, { x: tl.x + w, y: tl.y + h }]) {
        ctx.fillStyle = color;
        ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
      }
    }
    this._drawLabel(tl, color, label);
  }

  _drawPolygon(a, color, label, selected, hovered) {
    const ctx = this.ctx;
    const points = a.data.points.map((p) => this.normToScreen({ x: p[0], y: p[1] }));
    if (points.length === 0) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, selected ? 0.16 : 0.08);
    ctx.fill();
    ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    if (selected) {
      for (const pt of points) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this._drawLabel(points[0], color, label);
  }

  _drawInProgress(shape) {
    const ctx = this.ctx;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    if (shape.type === "box") {
      const a = this.normToScreen(shape.a);
      const b = this.normToScreen(shape.b);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (shape.type === "polygon" && shape.points.length) {
      const points = shape.points.map((p) => this.normToScreen({ x: p[0], y: p[1] }));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      if (shape.cursor) {
        const c = this.normToScreen(shape.cursor);
        ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      for (const p of points) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
  }

  _drawLabel(anchorScreenPt, color, text) {
    if (!text) return;
    const ctx = this.ctx;
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    const padX = 5;
    const w = ctx.measureText(text).width + padX * 2;
    const h = 16;
    const y = anchorScreenPt.y - h < 0 ? anchorScreenPt.y : anchorScreenPt.y - h;
    ctx.fillStyle = color;
    ctx.fillRect(anchorScreenPt.x, y, w, h);
    ctx.fillStyle = "#0E1116";
    ctx.fillText(text, anchorScreenPt.x + padX, y + h - 4.5);
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInPolygon(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersects = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const rgbCache = new Map();

function hexToRgba(color, alpha) {
  // Accepts hex (#rrggbb) or oklch(...) strings. Canvas 2D understands oklch()
  // directly for stroke/fill but not for a separate alpha channel, so resolve
  // to rgb() once per distinct colour via a throwaway element, then cache —
  // this runs per shape per frame, and the annotation canvas targets 60fps
  // at 500 shapes (§7), so a DOM round-trip per draw call is not affordable.
  let rgb = rgbCache.get(color);
  if (!rgb) {
    const probe = hexToRgba._probe ?? (hexToRgba._probe = document.createElement("span"));
    probe.style.color = color;
    document.body.appendChild(probe);
    rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).join(", ") ?? "27, 77, 255";
    document.body.removeChild(probe);
    rgbCache.set(color, rgb);
  }
  return `rgba(${rgb}, ${alpha})`;
}
