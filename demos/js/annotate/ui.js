// Wires the Annotation Studio DOM to store.js / canvas.js / tools.js / classes.js
// / export.js / import.js. This file owns no annotation logic of its own —
// it only translates DOM events into calls on those modules and redraws.

import { frame } from "../frame.js";
import { store } from "./store.js";
import { classes as classOps } from "./classes.js";
import { AnnotationCanvas } from "./canvas.js";
import { ToolController } from "./tools.js";
import { buildExportZip } from "./export.js";
import { importYoloZip } from "./import.js";
import * as assist from "./assist.js";

frame.mountAll();

const $ = (id) => document.getElementById(id);
const LAST_PROJECT_KEY = "africanize-annotate:last-project";

const el = {
  projectSelect: $("an-project-select"),
  projectNew: $("an-project-new"),
  projectRename: $("an-project-rename"),
  projectDelete: $("an-project-delete"),
  importBtn: $("an-import"),
  importInput: $("an-import-input"),
  status: $("an-status"),

  layout: $("an-layout"),
  tabs: document.querySelectorAll(".an-tabs button"),

  filmstrip: $("an-filmstrip"),
  emptyImages: $("an-empty-images"),
  filter: $("an-filter"),
  addImagesBtn: $("an-add-images"),
  addImagesInput: $("an-add-images-input"),

  stageWrap: $("an-stage-wrap"),
  canvas: $("an-canvas"),
  emptyCanvas: $("an-empty-canvas"),
  coord: $("an-coord"),
  toolButtons: document.querySelectorAll("[data-tool]"),
  undoBtn: $("an-undo"),
  redoBtn: $("an-redo"),
  deleteBtn: $("an-delete"),
  fitBtn: $("an-fit"),
  shortcutsBtn: $("an-shortcuts"),
  suggestBtn: $("an-suggest"),

  consentModal: $("an-consent-modal"),
  consentTitle: $("an-consent-title"),
  consentBody: $("an-consent-body"),
  consentProgress: $("an-consent-progress"),
  consentBar: $("an-consent-bar"),
  consentOk: $("an-consent-ok"),
  consentCancel: $("an-consent-cancel"),
  prevBtn: $("an-prev"),
  nextBtn: $("an-next"),
  navPos: $("an-nav-pos"),

  className: $("an-class-name"),
  classAddBtn: $("an-class-add-btn"),
  classList: $("an-class-list"),
  emptyClasses: $("an-empty-classes"),
  exportBtn: $("an-export"),

  exportModal: $("an-export-modal"),
  exportCancel: $("an-export-cancel"),
  exportGo: $("an-export-go"),
  exportWarning: $("an-export-warning"),
  splitEnable: $("an-split-enable"),
  splitRatios: $("an-split-ratios"),
  splitTrain: $("an-split-train"),
  splitVal: $("an-split-val"),
  splitTest: $("an-split-test"),

  shortcutsModal: $("an-shortcuts-modal"),
  shortcutsClose: $("an-shortcuts-close"),
};

const state = {
  project: null,
  images: [],
  imageIndex: -1,
  activeClassId: null,
  filter: "all",
  imageCounts: new Map(), // imageId -> annotation count, kept in sync as we go
  classCounts: new Map(), // classId -> annotation count
  currentBitmap: null,
};

const canvas = new AnnotationCanvas(el.canvas, { onResize: () => redraw() });
const tools = new ToolController(canvas, {
  onChange: (annotations) => {
    if (state.imageIndex >= 0) state.imageCounts.set(state.images[state.imageIndex].id, annotations.length);
    redraw();
    renderFilmstrip();
    refreshClassCounts();
  },
  onSelect: () => redraw(),
  getActiveClassId: () => state.activeClassId,
});

function redraw() {
  const colorMap = new Map();
  for (const c of state.project?.classes ?? []) {
    colorMap.set(c.id, c.color);
    colorMap.set(`${c.id}:name`, c.name);
  }
  canvas.draw({ ...tools.renderState(), classColorMap: colorMap });
}

function showStatus(message, tone = "note") {
  el.status.textContent = message;
  el.status.className = `note an-status ${tone === "warn" ? "note--warn" : ""}`;
  el.status.hidden = false;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => (el.status.hidden = true), 4000);
}

// ---------- Project lifecycle ----------

async function refreshProjectList(selectId) {
  const projects = await store.projects.list();
  el.projectSelect.innerHTML = "";
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    el.projectSelect.appendChild(opt);
  }
  if (projects.length === 0) {
    const created = await store.projects.create("My project");
    return refreshProjectList(created.id);
  }
  const target = selectId && projects.some((p) => p.id === selectId) ? selectId : projects[0].id;
  el.projectSelect.value = target;
  await loadProject(target);
}

async function loadProject(id) {
  state.project = await store.projects.get(id);
  localStorage.setItem(LAST_PROJECT_KEY, id);
  state.images = await store.images.listByProject(id);
  state.imageCounts = new Map();
  for (const img of state.images) {
    state.imageCounts.set(img.id, (await store.annotations.listByImage(img.id)).length);
  }
  state.activeClassId = state.project.classes[0]?.id ?? null;
  state.imageIndex = -1;
  canvas.clearImage();
  el.emptyCanvas.hidden = false;
  frame.setState("IMAGES", "idle", `${state.images.length} IMG`);
  frame.setState("ANNOTATE", "idle");
  renderFilmstrip();
  renderClasses();
  await refreshClassCounts();
  if (state.images.length) await selectImage(0);
}

el.projectSelect.addEventListener("change", () => loadProject(el.projectSelect.value));

el.projectNew.addEventListener("click", async () => {
  const name = prompt("Project name", "New project");
  if (!name) return;
  const project = await store.projects.create(name);
  await refreshProjectList(project.id);
});

el.projectRename.addEventListener("click", async () => {
  if (!state.project) return;
  const name = prompt("Rename project", state.project.name);
  if (!name) return;
  await store.projects.update(state.project.id, { name });
  await refreshProjectList(state.project.id);
});

el.projectDelete.addEventListener("click", async () => {
  if (!state.project) return;
  if (!confirm(`Delete "${state.project.name}" and everything in it? This can't be undone.`)) return;
  await store.projects.delete(state.project.id);
  await refreshProjectList();
});

// ---------- Images ----------

function filteredImages() {
  if (state.filter === "all") return state.images;
  return state.images.filter((img) => {
    const done = (state.imageCounts.get(img.id) ?? 0) > 0;
    return state.filter === "done" ? done : !done;
  });
}

function renderFilmstrip() {
  el.filmstrip.innerHTML = "";
  const list = filteredImages();
  el.emptyImages.hidden = state.images.length !== 0;
  for (const img of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "an-thumb";
    const globalIndex = state.images.indexOf(img);
    btn.setAttribute("aria-current", String(globalIndex === state.imageIndex));
    const count = state.imageCounts.get(img.id) ?? 0;
    btn.innerHTML = `
      <img src="${URL.createObjectURL(img.blob)}" alt="">
      <span class="an-thumb-name">${escapeHtml(img.name)}</span>
      <span class="an-thumb-badge" data-done="${count > 0}">${count}</span>
    `;
    btn.addEventListener("click", () => selectImage(globalIndex));
    el.filmstrip.appendChild(btn);
  }
}

async function selectImage(index) {
  if (index < 0 || index >= state.images.length) return;
  state.imageIndex = index;
  const img = state.images[index];
  if (state.currentBitmap) state.currentBitmap.close();
  state.currentBitmap = await createImageBitmap(img.blob);
  canvas.setImage(state.currentBitmap, img.width, img.height);
  await tools.loadImage(img.id);
  el.emptyCanvas.hidden = true;
  el.navPos.textContent = `${index + 1} / ${state.images.length}`;
  frame.setState("ANNOTATE", "live", img.name.toUpperCase());
  redraw();
  renderFilmstrip();
}

el.filter.addEventListener("change", () => {
  state.filter = el.filter.value;
  renderFilmstrip();
});

el.addImagesBtn.addEventListener("click", () => el.addImagesInput.click());
el.addImagesInput.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!state.project) return;
  for (const file of files) {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    const img = await store.images.add({ projectId: state.project.id, name: file.name, blob: file, width, height });
    state.images.push(img);
    state.imageCounts.set(img.id, 0);
  }
  frame.setState("IMAGES", "idle", `${state.images.length} IMG`);
  renderFilmstrip();
  if (state.imageIndex < 0 && state.images.length) await selectImage(0);
  showStatus(`Added ${files.length} image${files.length === 1 ? "" : "s"}.`);
});

el.prevBtn.addEventListener("click", () => selectImage(state.imageIndex - 1));
el.nextBtn.addEventListener("click", () => selectImage(state.imageIndex + 1));

// ---------- Tools / toolbar ----------

function setActiveTool(tool) {
  tools.setTool(tool);
  for (const btn of el.toolButtons) btn.setAttribute("aria-pressed", String(btn.dataset.tool === tool));
  el.stageWrap.classList.toggle("an-tool-select", tool === "select");
  redraw();
}

for (const btn of el.toolButtons) {
  btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
}

el.undoBtn.addEventListener("click", () => tools.undo());
el.redoBtn.addEventListener("click", () => tools.redo());
el.deleteBtn.addEventListener("click", () => tools.deleteSelected());
el.fitBtn.addEventListener("click", () => {
  canvas.fitToScreen();
  redraw();
});
el.shortcutsBtn.addEventListener("click", () => el.shortcutsModal.showModal());
el.shortcutsClose.addEventListener("click", () => el.shortcutsModal.close());

// ---------- Assisted labelling ----------
// §4.2's highest-value feature: run YOLO11n (the same model/weights live.html
// uses) over the current still image and drop in editable box predictions.
// One-shot, main-thread — see assist.js for why that's fine here but would
// not be for live video.

function askModelConsent(name, bytes) {
  return new Promise((resolve) => {
    el.consentTitle.textContent = `Download ${name}`;
    el.consentBody.textContent = `This connection looks metered or slow. ${name} is ${assist.formatBytes(bytes)}. Download it now?`;
    el.consentProgress.hidden = true;
    el.consentBar.style.width = "0%";
    el.consentModal.showModal();
    const cleanup = () => {
      el.consentOk.onclick = null;
      el.consentCancel.onclick = null;
      el.consentModal.close();
    };
    el.consentOk.onclick = () => {
      cleanup();
      resolve(true);
    };
    el.consentCancel.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

async function ensureAssistModel() {
  const cached = await assist.isModelCached();
  if (!cached && assist.isMeteredConnection()) {
    const ok = await askModelConsent(assist.modelName, assist.modelBytes);
    if (!ok) throw Object.assign(new Error("Download declined"), { code: "declined" });
    el.consentModal.showModal();
    el.consentProgress.hidden = false;
  }
  showStatus(`Downloading ${assist.modelName} — 0 of ${assist.formatBytes(assist.modelBytes)}`);
  await assist.ensureSession(({ loaded, total, fromCache }) => {
    if (fromCache) return;
    const t = total || assist.modelBytes;
    const pct = Math.round((loaded / t) * 100);
    showStatus(`Downloading ${assist.modelName} — ${assist.formatBytes(loaded)} of ${assist.formatBytes(t)}`);
    if (el.consentModal.open) el.consentBar.style.width = `${pct}%`;
  });
  if (el.consentModal.open) el.consentModal.close();
}

el.suggestBtn.addEventListener("click", async () => {
  if (state.imageIndex < 0 || !state.currentBitmap) {
    showStatus("Select an image first.", "warn");
    return;
  }
  const img = state.images[state.imageIndex];
  el.suggestBtn.disabled = true;
  const prevLabel = el.suggestBtn.textContent;
  try {
    await ensureAssistModel();
    frame.setState("ANNOTATE", "live", "DETECTING");
    el.suggestBtn.textContent = "Detecting…";
    const boxes = await assist.suggestBoxes(state.currentBitmap);

    // Map each detected COCO class name to a project class, creating one the
    // first time it's seen this run so e.g. three "car" boxes share one class
    // instead of creating three.
    let classes = state.project.classes;
    const idByName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
    const items = boxes.map((b) => {
      const key = b.className.toLowerCase();
      let classId = idByName.get(key);
      if (!classId) {
        const created = classOps.create(classes, b.className);
        classes = [...classes, created];
        idByName.set(key, created.id);
        classId = created.id;
      }
      return {
        classId,
        type: "box",
        data: {
          x: b.x1 / img.width,
          y: b.y1 / img.height,
          w: (b.x2 - b.x1) / img.width,
          h: (b.y2 - b.y1) / img.height,
        },
      };
    });

    if (classes !== state.project.classes) await persistClasses(classes);

    if (!items.length) {
      showStatus("No objects detected above the confidence threshold.");
    } else {
      tools.addBatch(items);
      showStatus(
        `Added ${items.length} suggested box${items.length === 1 ? "" : "es"} — check them before exporting. Undo (Cmd/Ctrl+Z) removes them all.`
      );
    }
  } catch (err) {
    if (err.code !== "declined") {
      console.error(err);
      showStatus("Couldn't run detection — see console for details.", "warn");
    }
  } finally {
    frame.setState("ANNOTATE", "live", img.name.toUpperCase());
    el.suggestBtn.disabled = false;
    el.suggestBtn.textContent = prevLabel;
  }
});

// ---------- Canvas pointer interaction ----------

let spaceHeld = false;
let panning = null;

el.canvas.addEventListener("pointerdown", (e) => {
  if (!canvas.image) return;
  el.canvas.setPointerCapture(e.pointerId);
  if (spaceHeld) {
    panning = { x: e.clientX, y: e.clientY };
    return;
  }
  // A double-click fires two pointerdowns before its dblclick — for the
  // polygon tool that would otherwise add a duplicate point right where
  // the close-the-shape click landed. e.detail is the click count, same
  // as on a plain MouseEvent, so the second one is easy to swallow here.
  if (tools.tool === "polygon" && e.detail > 1) return;
  tools.onPointerDown(e.clientX, e.clientY, { shiftKey: e.shiftKey });
  redraw();
});

el.canvas.addEventListener("pointermove", (e) => {
  if (!canvas.image) return;
  if (panning) {
    canvas.pan(e.clientX - panning.x, e.clientY - panning.y);
    panning = { x: e.clientX, y: e.clientY };
    redraw();
    return;
  }
  const norm = canvas.screenToNorm(canvas.clientToCanvas(e.clientX, e.clientY));
  el.coord.textContent = `${norm.x.toFixed(3)}, ${norm.y.toFixed(3)}`;
  tools.onPointerMove(e.clientX, e.clientY);
  redraw();
});

el.canvas.addEventListener("pointerup", (e) => {
  if (panning) {
    panning = null;
    return;
  }
  tools.onPointerUp();
  redraw();
  renderFilmstrip();
  refreshClassCounts();
});

el.canvas.addEventListener("dblclick", () => {
  if (tools.tool === "polygon") {
    tools.closePolygon();
    redraw();
    renderFilmstrip();
    refreshClassCounts();
  }
});

el.canvas.addEventListener(
  "wheel",
  (e) => {
    if (!canvas.image) return;
    e.preventDefault();
    const pt = canvas.clientToCanvas(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    canvas.zoomAt(factor, pt);
    redraw();
  },
  { passive: false }
);

// ---------- Classes ----------

function renderClasses() {
  el.classList.innerHTML = "";
  const list = state.project?.classes ?? [];
  el.emptyClasses.hidden = list.length !== 0;
  list.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "an-class-row";
    row.setAttribute("aria-current", String(c.id === state.activeClassId));
    const count = state.classCounts.get(c.id) ?? 0;
    row.innerHTML = `
      <span class="an-class-key mono">${i < 9 ? i + 1 : ""}</span>
      <button type="button" class="an-class-swatch" style="background:${c.color}" title="Change colour" aria-label="Colour for ${escapeHtml(c.name)}"></button>
      <input type="color" class="an-color-input" hidden value="#1b4dff">
      <input type="text" class="an-class-name" value="${escapeHtml(c.name)}" aria-label="Class name">
      <span class="an-class-count">${count}</span>
      <button type="button" class="an-class-del" aria-label="Delete class ${escapeHtml(c.name)}">×</button>
    `;
    const swatch = row.querySelector(".an-class-swatch");
    const colorInput = row.querySelector(".an-color-input");
    const nameInput = row.querySelector(".an-class-name");
    const delBtn = row.querySelector(".an-class-del");

    row.addEventListener("click", (e) => {
      if (e.target === swatch || e.target === nameInput || e.target === delBtn) return;
      state.activeClassId = c.id;
      renderClasses();
    });
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      colorInput.click();
    });
    colorInput.addEventListener("input", async () => {
      await persistClasses(classOps.recolor(state.project.classes, c.id, colorInput.value));
      redraw();
    });
    nameInput.addEventListener("click", (e) => e.stopPropagation());
    nameInput.addEventListener("change", async () => {
      const name = nameInput.value.trim() || c.name;
      await persistClasses(classOps.rename(state.project.classes, c.id, name));
      redraw();
    });
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete class "${c.name}"? Its ${count} annotation${count === 1 ? "" : "s"} will also be deleted.`)) return;
      for (const img of state.images) {
        const annotations = await store.annotations.listByImage(img.id);
        for (const a of annotations.filter((a) => a.classId === c.id)) await store.annotations.delete(a.id);
      }
      if (state.imageIndex >= 0) await tools.loadImage(state.images[state.imageIndex].id);
      if (state.activeClassId === c.id) state.activeClassId = null;
      await persistClasses(classOps.remove(state.project.classes, c.id));
      await refreshClassCounts();
      renderFilmstrip();
      redraw();
    });

    el.classList.appendChild(row);
  });
}

async function persistClasses(nextClasses) {
  state.project = await store.projects.update(state.project.id, { classes: nextClasses });
  renderClasses();
}

el.classAddBtn.addEventListener("click", addClassFromInput);
el.className.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addClassFromInput();
});

async function addClassFromInput() {
  const name = el.className.value.trim();
  if (!name || !state.project) return;
  el.className.value = "";
  const next = [...state.project.classes, classOps.create(state.project.classes, name)];
  await persistClasses(next);
  state.activeClassId = next[next.length - 1].id;
  renderClasses();
}

async function refreshClassCounts() {
  if (!state.project) return;
  state.classCounts = await store.annotations.countByClass(state.project.id);
  renderClasses();
}

// ---------- Export ----------

el.exportBtn.addEventListener("click", async () => {
  let hasAny = false;
  for (const img of state.images) {
    const annotations = await store.annotations.listByImage(img.id);
    if (annotations.some((a) => a.type === "polygon")) {
      hasAny = true;
      break;
    }
  }
  el.exportModal._hasPolygon = hasAny;
  updateExportWarning();
  el.exportModal.showModal();
});

function updateExportWarning() {
  const checked = [...el.exportModal.querySelectorAll("[name=fmt]:checked")].map((c) => c.value);
  el.exportWarning.hidden = !(el.exportModal._hasPolygon && (checked.includes("yolo") || checked.includes("voc")));
}
el.exportModal.querySelectorAll("[name=fmt]").forEach((cb) => cb.addEventListener("change", updateExportWarning));

el.splitEnable.addEventListener("change", () => {
  el.splitRatios.style.opacity = el.splitEnable.checked ? "1" : "0.4";
  el.splitRatios.style.pointerEvents = el.splitEnable.checked ? "auto" : "none";
});

el.exportCancel.addEventListener("click", () => el.exportModal.close());

el.exportGo.addEventListener("click", async () => {
  const formats = [...el.exportModal.querySelectorAll("[name=fmt]:checked")].map((c) => c.value);
  if (!formats.length) {
    showStatus("Pick at least one export format.", "warn");
    return;
  }
  if (!state.images.length) {
    showStatus("Add images before exporting.", "warn");
    return;
  }
  el.exportGo.disabled = true;
  el.exportGo.textContent = "Zipping…";
  try {
    let split = null;
    if (el.splitEnable.checked) {
      const t = Number(el.splitTrain.value) || 0;
      const v = Number(el.splitVal.value) || 0;
      const s = Number(el.splitTest.value) || 0;
      const sum = t + v + s || 1;
      split = { train: t / sum, val: v / sum, test: s / sum };
    }
    const annotationsByImage = new Map();
    for (const img of state.images) annotationsByImage.set(img.id, await store.annotations.listByImage(img.id));
    const { blob, hadPolygonToBoxLoss } = await buildExportZip({
      project: state.project,
      images: state.images,
      annotationsByImage,
      formats,
      split,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(state.project.name)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    el.exportModal.close();
    showStatus(hadPolygonToBoxLoss ? "Exported — some polygons were flattened to boxes for this format." : "Exported.", hadPolygonToBoxLoss ? "warn" : "note");
  } catch (err) {
    console.error(err);
    showStatus("Export failed — see console for details.", "warn");
  } finally {
    el.exportGo.disabled = false;
    el.exportGo.textContent = "Download zip";
  }
});

// ---------- Import ----------

el.importBtn.addEventListener("click", () => el.importInput.click());
el.importInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const name = prompt("Name for the imported project", file.name.replace(/\.zip$/i, ""));
  if (!name) return;
  showStatus("Importing…");
  try {
    const { project, imported } = await importYoloZip(file, name);
    await refreshProjectList(project.id);
    showStatus(`Imported ${imported} image${imported === 1 ? "" : "s"} into "${project.name}".`);
  } catch (err) {
    console.error(err);
    showStatus("Import failed — is this a zip exported from this tool?", "warn");
  }
});

// ---------- Keyboard shortcuts ----------

window.addEventListener("keydown", (e) => {
  const target = e.target;
  const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

  if (e.code === "Space" && !typing) {
    spaceHeld = true;
    e.preventDefault();
    return;
  }

  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) tools.redo();
    else tools.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (state.project) store.projects.update(state.project.id, {}).then(() => showStatus("Saved."));
    return;
  }

  if (typing) return;

  switch (e.key) {
    case "b":
    case "B":
      setActiveTool("box");
      break;
    case "p":
    case "P":
      setActiveTool("polygon");
      break;
    case "v":
    case "V":
      setActiveTool("select");
      break;
    case "f":
    case "F":
      canvas.fitToScreen();
      redraw();
      break;
    case "Delete":
    case "Backspace":
      e.preventDefault();
      tools.deleteSelected();
      break;
    case "Escape":
      if (tools.hasPendingPolygon()) tools.cancelPolygon();
      redraw();
      break;
    case "Enter":
      if (tools.tool === "polygon" && tools.hasPendingPolygon()) {
        tools.closePolygon();
        redraw();
        renderFilmstrip();
        refreshClassCounts();
      }
      break;
    case "d":
    case "D":
    case "ArrowRight":
      selectImage(state.imageIndex + 1);
      break;
    case "a":
    case "A":
    case "ArrowLeft":
      selectImage(state.imageIndex - 1);
      break;
    case "?":
      el.shortcutsModal.showModal();
      break;
    default:
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const c = state.project?.classes[idx];
        if (c) {
          state.activeClassId = c.id;
          renderClasses();
        }
      }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
});

// ---------- Mobile pane tabs ----------

el.tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    el.layout.dataset.activePane = btn.dataset.pane;
    el.tabs.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
});

// ---------- Utils ----------

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dataset";
}

// ---------- Boot ----------

refreshProjectList(localStorage.getItem(LAST_PROJECT_KEY)).catch((err) => {
  console.error(err);
  showStatus("Couldn't open local storage for this tool — try a different browser or disable private browsing.", "warn");
});
