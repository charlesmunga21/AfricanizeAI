// Import a zip previously produced by export.js's YOLO writer, reconstructing
// a project so annotation work can resume on a different device. This is the
// closest thing to sync this local-first tool offers (§4.2) — round-tripping
// our own export format, not a general-purpose YOLO-dataset importer.

import { FFLATE_URL } from "../config.js";
import { store } from "./store.js";
import { classes as classOps } from "./classes.js";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

function basename(path) {
  return path.split("/").pop();
}

function stem(name) {
  return name.replace(/\.[^.]+$/, "");
}

async function decodeDimensions(blob) {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

function parseYoloLine(line) {
  const parts = line.trim().split(/\s+/).map(Number);
  if (parts.length < 5) return null;
  const [classIdx, cx, cy, w, h] = parts;
  return { classIdx, box: { x: cx - w / 2, y: cy - h / 2, w, h } };
}

function parseYoloSegLine(line) {
  const parts = line.trim().split(/\s+/).map(Number);
  if (parts.length < 7 || parts.length % 2 === 0) return null; // classIdx + even count of coords
  const classIdx = parts[0];
  const points = [];
  for (let i = 1; i < parts.length; i += 2) points.push([parts[i], parts[i + 1]]);
  return { classIdx, points };
}

export async function importYoloZip(file, projectName) {
  const { unzipSync } = await import(/* @vite-ignore */ FFLATE_URL);
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const decoder = new TextDecoder();

  const classNames = entries["classes.txt"]
    ? decoder.decode(entries["classes.txt"]).split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  let project = await store.projects.create(projectName || "Imported project");
  let classList = [];
  for (const name of classNames) classList = [...classList, classOps.create(classList, name)];
  project = await store.projects.update(project.id, { classes: classList });

  // A zip exported with multiple formats checked can reference the same
  // source image from more than one path (YOLO's images/train/x.png next to
  // COCO's flat images/x.png) — dedupe by filename so it isn't imported twice.
  const candidatePaths = Object.keys(entries).filter((p) => p.startsWith("images/") && IMAGE_EXT.test(p));
  const pathByName = new Map();
  for (const p of candidatePaths) {
    const name = basename(p);
    if (!pathByName.has(name)) pathByName.set(name, p);
  }
  const imagePaths = [...pathByName.values()];

  let imported = 0;
  for (const path of imagePaths) {
    const name = basename(path);
    const key = stem(name);
    const blob = new Blob([entries[path]]);
    const { width, height } = await decodeDimensions(blob);
    const image = await store.images.add({ projectId: project.id, name, blob, width, height });

    const segPath = Object.keys(entries).find((p) => p.startsWith("labels-seg/") && stem(basename(p)) === key);
    const boxPath = Object.keys(entries).find((p) => p.startsWith("labels/") && stem(basename(p)) === key);

    if (segPath) {
      const lines = decoder.decode(entries[segPath]).split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parsed = parseYoloSegLine(line);
        if (!parsed || !classList[parsed.classIdx]) continue;
        await store.annotations.add({
          imageId: image.id,
          classId: classList[parsed.classIdx].id,
          type: "polygon",
          data: { points: parsed.points },
        });
      }
    } else if (boxPath) {
      const lines = decoder.decode(entries[boxPath]).split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parsed = parseYoloLine(line);
        if (!parsed || !classList[parsed.classIdx]) continue;
        await store.annotations.add({
          imageId: image.id,
          classId: classList[parsed.classIdx].id,
          type: "box",
          data: parsed.box,
        });
      }
    }
    imported++;
  }

  return { project, imported };
}
