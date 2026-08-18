// Tool state machine (box / polygon / select) and the undo/redo command stack.
// Owns pointer and keyboard interpretation; delegates coordinate math and
// hit-testing to the AnnotationCanvas instance it's given. Every mutation to
// the annotation list goes through a Command so undo/redo is never a special
// case bolted on afterward — it's the only way annotations change at all.

import { store } from "./store.js";

const MIN_NORM_SIZE = 0.004; // ~a few px at typical zoom — below this, treat a drag as an accidental click
const UNDO_LIMIT = 50;

class CommandStack {
  constructor(limit = UNDO_LIMIT) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(command) {
    command.do();
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.do();
    this.undoStack.push(command);
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

// Recompute a canonical {x,y,w,h} from two dragged corners, so dragging past
// the opposite corner flips the box instead of producing negative width.
function boxFromCorners(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
}

export class ToolController {
  constructor(canvas, { onChange, onSelect, getActiveClassId }) {
    this.canvas = canvas;
    this.onChange = onChange ?? (() => {});
    this.onSelect = onSelect ?? (() => {});
    this.getActiveClassId = getActiveClassId;

    this.tool = "select";
    this.imageId = null;
    this.annotations = [];
    this.selectedId = null;
    this.hoverId = null;
    this.commands = new CommandStack();

    this._drag = null; // { kind: 'create-box'|'move'|'resize'|'vertex', ... }
    this._polygonPoints = null; // in-progress polygon, norm points
    this._polygonCursor = null;
  }

  async loadImage(imageId) {
    this.imageId = imageId;
    this.annotations = await store.annotations.listByImage(imageId);
    this.selectedId = null;
    this.hoverId = null;
    this._polygonPoints = null;
    this.commands.clear(); // undo history is per-image — a stray undo shouldn't reach back into a different photo
    this.onChange(this.annotations);
  }

  setTool(tool) {
    this.tool = tool;
    if (tool !== "polygon") this._polygonPoints = null;
    if (tool !== "select") {
      this.selectedId = null;
      this.onSelect(null);
    }
  }

  renderState() {
    let inProgress = null;
    if (this._drag?.kind === "create-box") {
      inProgress = { type: "box", a: this._drag.start, b: this._drag.current };
    } else if (this._polygonPoints) {
      inProgress = { type: "polygon", points: this._polygonPoints, cursor: this._polygonCursor };
    }
    return { annotations: this.annotations, selectedId: this.selectedId, hoverId: this.hoverId, inProgress };
  }

  // ---------- Pointer handling ----------

  onPointerDown(clientX, clientY, { shiftKey } = {}) {
    const screenPt = this.canvas.clientToCanvas(clientX, clientY);
    const norm = this.canvas.screenToNorm(screenPt);

    if (this.tool === "box") {
      this._drag = { kind: "create-box", start: norm, current: norm };
      return;
    }

    if (this.tool === "polygon") {
      if (!this._polygonPoints) this._polygonPoints = [];
      this._polygonPoints.push([clamp01(norm.x), clamp01(norm.y)]);
      return;
    }

    // select tool
    const hit = this.canvas.hitTest(screenPt, this.annotations);
    if (!hit) {
      this.selectedId = null;
      this.onSelect(null);
      return;
    }
    this.selectedId = hit.annotation.id;
    this.onSelect(hit.annotation.id);

    if (hit.annotation.type === "box") {
      if (hit.handle === "move") {
        this._drag = { kind: "move", annotation: hit.annotation, startNorm: norm, before: { ...hit.annotation.data } };
      } else {
        this._drag = { kind: "resize", annotation: hit.annotation, handle: hit.handle, before: { ...hit.annotation.data } };
      }
    } else {
      if (hit.handle === "move") {
        this._drag = {
          kind: "move-polygon",
          annotation: hit.annotation,
          startNorm: norm,
          before: { points: hit.annotation.data.points.map((p) => p.slice()) },
        };
      } else {
        this._drag = {
          kind: "vertex",
          annotation: hit.annotation,
          vertexIndex: hit.handle,
          before: { points: hit.annotation.data.points.map((p) => p.slice()) },
        };
      }
    }
  }

  onPointerMove(clientX, clientY) {
    const screenPt = this.canvas.clientToCanvas(clientX, clientY);
    const norm = this.canvas.screenToNorm(screenPt);

    if (this._polygonPoints) {
      this._polygonCursor = norm;
    }

    if (!this._drag) {
      if (this.tool === "select") {
        const hit = this.canvas.hitTest(screenPt, this.annotations);
        this.hoverId = hit?.annotation.id ?? null;
      }
      return;
    }

    const d = this._drag;
    if (d.kind === "create-box") {
      d.current = norm;
    } else if (d.kind === "move") {
      const dx = norm.x - d.startNorm.x;
      const dy = norm.y - d.startNorm.y;
      d.annotation.data = {
        x: clamp01(d.before.x + dx),
        y: clamp01(d.before.y + dy),
        w: d.before.w,
        h: d.before.h,
      };
    } else if (d.kind === "resize") {
      const opposite = {
        tl: { x: d.before.x + d.before.w, y: d.before.y + d.before.h },
        tr: { x: d.before.x, y: d.before.y + d.before.h },
        bl: { x: d.before.x + d.before.w, y: d.before.y },
        br: { x: d.before.x, y: d.before.y },
      }[d.handle];
      d.annotation.data = boxFromCorners(opposite, norm);
    } else if (d.kind === "move-polygon") {
      const dx = norm.x - d.startNorm.x;
      const dy = norm.y - d.startNorm.y;
      d.annotation.data = {
        points: d.before.points.map(([x, y]) => [clamp01(x + dx), clamp01(y + dy)]),
      };
    } else if (d.kind === "vertex") {
      const points = d.before.points.map((p) => p.slice());
      points[d.vertexIndex] = [clamp01(norm.x), clamp01(norm.y)];
      d.annotation.data = { points };
    }
    this.onChange(this.annotations);
  }

  onPointerUp() {
    const d = this._drag;
    this._drag = null;
    if (!d) return;

    if (d.kind === "create-box") {
      const box = boxFromCorners(d.start, d.current);
      if (box.w < MIN_NORM_SIZE || box.h < MIN_NORM_SIZE) return;
      const classId = this.getActiveClassId();
      if (!classId) return; // no class to assign — annotate.js surfaces a prompt to create one first
      this._commitAdd({ classId, type: "box", data: box });
      return;
    }

    if (d.kind === "move" || d.kind === "resize") {
      this._commitUpdate(d.annotation, d.before, d.annotation.data);
    } else if (d.kind === "move-polygon" || d.kind === "vertex") {
      this._commitUpdate(d.annotation, d.before, d.annotation.data);
    }
  }

  // Double-click or Enter closes the in-progress polygon.
  closePolygon() {
    if (!this._polygonPoints || this._polygonPoints.length < 3) {
      this._polygonPoints = null;
      this._polygonCursor = null;
      return false;
    }
    const classId = this.getActiveClassId();
    const points = this._polygonPoints;
    this._polygonPoints = null;
    this._polygonCursor = null;
    if (!classId) return false;
    this._commitAdd({ classId, type: "polygon", data: { points } });
    return true;
  }

  hasPendingPolygon() {
    return Boolean(this._polygonPoints);
  }

  cancelPolygon() {
    this._polygonPoints = null;
    this._polygonCursor = null;
    this.onChange(this.annotations);
  }

  // ---------- Commands ----------

  _commitAdd({ classId, type, data }) {
    const id = crypto.randomUUID();
    const imageId = this.imageId;
    const annotations = this.annotations;
    const command = {
      do: () => {
        const annotation = { id, imageId, classId, type, data, createdAt: Date.now() };
        annotations.push(annotation);
        store.annotations.add(annotation).catch(console.error);
        this.selectedId = id;
        this.onSelect(id);
        this.onChange(annotations);
      },
      undo: () => {
        const idx = annotations.findIndex((a) => a.id === id);
        if (idx >= 0) annotations.splice(idx, 1);
        store.annotations.delete(id).catch(console.error);
        if (this.selectedId === id) {
          this.selectedId = null;
          this.onSelect(null);
        }
        this.onChange(annotations);
      },
    };
    this.commands.push(command);
  }

  _commitUpdate(annotation, before, after) {
    // The drag already mutated annotation.data in place for live feedback;
    // do()/undo() below just replay that onto the annotation and the store,
    // so pushing this command re-applies `after` — a harmless no-op write.
    const id = annotation.id;
    const command = {
      do: () => {
        annotation.data = after;
        store.annotations.update(id, { data: after }).catch(console.error);
        this.onChange(this.annotations);
      },
      undo: () => {
        annotation.data = before;
        store.annotations.update(id, { data: before }).catch(console.error);
        this.onChange(this.annotations);
      },
    };
    this.commands.push(command);
  }

  deleteSelected() {
    if (!this.selectedId) return;
    const annotation = this.annotations.find((a) => a.id === this.selectedId);
    if (!annotation) return;
    const id = annotation.id;
    const index = this.annotations.indexOf(annotation);
    const annotations = this.annotations;
    const command = {
      do: () => {
        const i = annotations.findIndex((a) => a.id === id);
        if (i >= 0) annotations.splice(i, 1);
        store.annotations.delete(id).catch(console.error);
        if (this.selectedId === id) {
          this.selectedId = null;
          this.onSelect(null);
        }
        this.onChange(annotations);
      },
      undo: () => {
        annotations.splice(index, 0, annotation);
        store.annotations.add(annotation).catch(console.error);
        this.onChange(annotations);
      },
    };
    this.commands.push(command);
  }

  undo() {
    if (this.commands.undo()) this.onChange(this.annotations);
  }

  redo() {
    if (this.commands.redo()) this.onChange(this.annotations);
  }
}
