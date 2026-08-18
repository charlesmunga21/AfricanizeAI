// Export a project to YOLO, YOLO-seg, COCO, and Pascal VOC — as pure functions
// over already-normalized annotation data. Nothing here touches IndexedDB;
// callers (ui.js) pull the project/images/annotations out of store.js first.
// That split is what keeps every format a straight data transform: normalized
// 0..1 coordinates in, format-specific text/XML/JSON out, no pixel math here.

import { FFLATE_URL } from "../config.js";

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic shuffle + bucket assignment so the same project with the same
// seed always produces the same split — "reproducible" per the spec, not just "random".
function assignSplits(images, ratios, seed = 1) {
  const rng = mulberry32(seed);
  const shuffled = [...images];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const nTrain = Math.round(images.length * ratios.train);
  const nVal = Math.round(images.length * ratios.val);
  const assignment = new Map();
  shuffled.forEach((img, i) => {
    const split = i < nTrain ? "train" : i < nTrain + nVal ? "val" : "test";
    assignment.set(img.id, split);
  });
  return assignment;
}

function polygonToBox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function classIndex(project, classId) {
  return project.classes.findIndex((c) => c.id === classId);
}

// ---------- YOLO (detection) ----------

function yoloLine(project, annotation) {
  const idx = classIndex(project, annotation.classId);
  const box = annotation.type === "box" ? annotation.data : polygonToBox(annotation.data.points);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return `${idx} ${cx.toFixed(6)} ${cy.toFixed(6)} ${box.w.toFixed(6)} ${box.h.toFixed(6)}`;
}

function yoloSegLine(project, annotation) {
  const idx = classIndex(project, annotation.classId);
  const points =
    annotation.type === "polygon"
      ? annotation.data.points
      : boxToCornerPolygon(annotation.data);
  return `${idx} ${points.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join(" ")}`;
}

function boxToCornerPolygon({ x, y, w, h }) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function dataYaml(project, split) {
  const names = project.classes.map((c) => c.name);
  const lines = ["path: .", ...(split ? ["train: images/train", "val: images/val", "test: images/test"] : ["train: images"]), `nc: ${names.length}`, `names: [${names.map((n) => JSON.stringify(n)).join(", ")}]`];
  return lines.join("\n") + "\n";
}

// ---------- COCO ----------

function cocoJson(project, images, annotationsByImage) {
  const categories = project.classes.map((c, i) => ({ id: i + 1, name: c.name, supercategory: "none" }));
  const cocoImages = images.map((img, i) => ({ id: i + 1, file_name: img.name, width: img.width, height: img.height }));
  const imageIndex = new Map(images.map((img, i) => [img.id, i + 1]));

  let annId = 1;
  const annotations = [];
  for (const img of images) {
    const list = annotationsByImage.get(img.id) ?? [];
    for (const a of list) {
      const catId = classIndex(project, a.classId) + 1;
      const imgId = imageIndex.get(img.id);
      if (a.type === "box") {
        const { x, y, w, h } = a.data;
        const bbox = [x * img.width, y * img.height, w * img.width, h * img.height];
        annotations.push({
          id: annId++,
          image_id: imgId,
          category_id: catId,
          bbox,
          area: bbox[2] * bbox[3],
          iscrowd: 0,
          segmentation: [],
        });
      } else {
        const pxPoints = a.data.points.flatMap(([x, y]) => [x * img.width, y * img.height]);
        const box = polygonToBox(a.data.points);
        const bbox = [box.x * img.width, box.y * img.height, box.w * img.width, box.h * img.height];
        annotations.push({
          id: annId++,
          image_id: imgId,
          category_id: catId,
          bbox,
          area: bbox[2] * bbox[3],
          iscrowd: 0,
          segmentation: [pxPoints],
        });
      }
    }
  }

  return JSON.stringify(
    {
      info: { description: `${project.name} — exported from AfricanizeAI Annotation Studio`, date_created: new Date().toISOString() },
      licenses: [],
      images: cocoImages,
      annotations,
      categories,
    },
    null,
    2
  );
}

// ---------- Pascal VOC ----------

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function vocXml(project, image, annotations) {
  const objects = annotations
    .map((a) => {
      const box = a.type === "box" ? a.data : polygonToBox(a.data.points);
      const className = project.classes.find((c) => c.id === a.classId)?.name ?? "unknown";
      const xmin = Math.round(box.x * image.width);
      const ymin = Math.round(box.y * image.height);
      const xmax = Math.round((box.x + box.w) * image.width);
      const ymax = Math.round((box.y + box.h) * image.height);
      return `  <object>\n    <name>${xmlEscape(className)}</name>\n    <pose>Unspecified</pose>\n    <truncated>0</truncated>\n    <difficult>0</difficult>\n    <bndbox>\n      <xmin>${xmin}</xmin>\n      <ymin>${ymin}</ymin>\n      <xmax>${xmax}</xmax>\n      <ymax>${ymax}</ymax>\n    </bndbox>\n  </object>`;
    })
    .join("\n");
  return `<annotation>\n  <folder>images</folder>\n  <filename>${xmlEscape(image.name)}</filename>\n  <size>\n    <width>${image.width}</width>\n    <height>${image.height}</height>\n    <depth>3</depth>\n  </size>\n  <segmented>0</segmented>\n${objects}\n</annotation>\n`;
}

// ---------- Orchestration ----------

// formats: subset of ['yolo', 'yolo-seg', 'coco', 'voc']
// split: null to disable, or { train, val, test } ratios summing to 1
export async function buildExportZip({ project, images, annotationsByImage, formats, split }) {
  const { zipSync, strToU8 } = await import(/* @vite-ignore */ FFLATE_URL);

  const files = {};
  const splitAssignment = split ? assignSplits(images, split) : null;
  let hadPolygonToBoxLoss = false;

  const imageBytes = new Map();
  for (const img of images) {
    imageBytes.set(img.id, new Uint8Array(await img.blob.arrayBuffer()));
  }

  const imagePath = (img) => (splitAssignment ? `images/${splitAssignment.get(img.id)}/${img.name}` : `images/${img.name}`);

  if (formats.includes("yolo") || formats.includes("yolo-seg")) {
    // Shared image copies for both YOLO variants land under the same images/
    // tree if both are requested — write once, not twice.
    for (const img of images) files[imagePath(img)] = imageBytes.get(img.id);
  }

  if (formats.includes("yolo")) {
    for (const img of images) {
      const list = annotationsByImage.get(img.id) ?? [];
      if (list.some((a) => a.type === "polygon")) hadPolygonToBoxLoss = true;
      const labelPath = (splitAssignment ? `labels/${splitAssignment.get(img.id)}/` : "labels/") + img.name.replace(/\.[^.]+$/, ".txt");
      files[labelPath] = strToU8(list.map((a) => yoloLine(project, a)).join("\n") + (list.length ? "\n" : ""));
    }
    files["classes.txt"] = strToU8(project.classes.map((c) => c.name).join("\n") + "\n");
    files["data.yaml"] = strToU8(dataYaml(project, splitAssignment));
  }

  if (formats.includes("yolo-seg")) {
    for (const img of images) {
      const list = annotationsByImage.get(img.id) ?? [];
      const labelPath = (splitAssignment ? `labels-seg/${splitAssignment.get(img.id)}/` : "labels-seg/") + img.name.replace(/\.[^.]+$/, ".txt");
      files[labelPath] = strToU8(list.map((a) => yoloSegLine(project, a)).join("\n") + (list.length ? "\n" : ""));
    }
    files["classes.txt"] = strToU8(project.classes.map((c) => c.name).join("\n") + "\n");
  }

  if (formats.includes("coco")) {
    for (const img of images) files[`images/${img.name}`] = imageBytes.get(img.id);
    files["annotations.json"] = strToU8(cocoJson(project, images, annotationsByImage));
  }

  if (formats.includes("voc")) {
    for (const img of images) {
      files[`JPEGImages/${img.name}`] = imageBytes.get(img.id);
      const list = annotationsByImage.get(img.id) ?? [];
      if (list.some((a) => a.type === "polygon")) hadPolygonToBoxLoss = true;
      files[`Annotations/${img.name.replace(/\.[^.]+$/, ".xml")}`] = strToU8(vocXml(project, img, list));
    }
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  return { blob, hadPolygonToBoxLoss };
}
