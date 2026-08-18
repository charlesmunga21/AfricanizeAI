// IndexedDB persistence for the Annotation Studio. Raw IndexedDB, no dependency —
// the schema is small enough that a wrapper library would cost more to read than
// it saves to write. Everything here is promises over IDBRequest.
//
// Schema (see §4.2 of the build spec):
//   projects:    { id, name, createdAt, updatedAt, classes: [{id, name, color}] }
//   images:      { id, projectId, name, blob, width, height, order }
//   annotations: { id, imageId, classId, type: 'box'|'polygon', data, createdAt }
//
// Annotation coordinates are normalized 0..1 at write time (against the image's
// own width/height), never denormalized back into the store. That makes every
// export format a pure function of the stored data — resizing, cropping, or
// re-exporting never needs to touch a pixel value.

const DB_NAME = "africanize-annotate";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("images")) {
        const images = db.createObjectStore("images", { keyPath: "id" });
        images.createIndex("projectId", "projectId");
      }
      if (!db.objectStoreNames.contains("annotations")) {
        const annotations = db.createObjectStore("annotations", { keyPath: "id" });
        annotations.createIndex("imageId", "imageId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeNames, mode, fn) {
  const db = await openDB();
  const t = db.transaction(storeNames, mode);
  const stores = Array.isArray(storeNames)
    ? Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]))
    : t.objectStore(storeNames);
  const result = await fn(stores, t);
  await new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result;
}

function uid() {
  return crypto.randomUUID();
}

// ---------- Projects ----------

async function createProject(name) {
  const now = Date.now();
  const project = { id: uid(), name, createdAt: now, updatedAt: now, classes: [] };
  await tx("projects", "readwrite", (store) => reqToPromise(store.add(project)));
  return project;
}

async function listProjects() {
  const all = await tx("projects", "readonly", (store) => reqToPromise(store.getAll()));
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function getProject(id) {
  return tx("projects", "readonly", (store) => reqToPromise(store.get(id)));
}

async function updateProject(id, patch) {
  return tx("projects", "readwrite", async (store) => {
    const project = await reqToPromise(store.get(id));
    if (!project) throw new Error(`store: no project ${id}`);
    Object.assign(project, patch, { updatedAt: Date.now() });
    await reqToPromise(store.put(project));
    return project;
  });
}

async function deleteProject(id) {
  const imgs = await listImages(id);
  await Promise.all(imgs.map((img) => deleteImage(img.id)));
  return tx("projects", "readwrite", (store) => reqToPromise(store.delete(id)));
}

// ---------- Images ----------

async function addImage({ projectId, name, blob, width, height }) {
  const siblings = await listImages(projectId);
  const image = {
    id: uid(),
    projectId,
    name,
    blob,
    width,
    height,
    order: siblings.length,
  };
  await tx("images", "readwrite", (store) => reqToPromise(store.add(image)));
  return image;
}

async function listImages(projectId) {
  const all = await tx("images", "readonly", (store) => {
    const idx = store.index("projectId");
    return reqToPromise(idx.getAll(projectId));
  });
  return all.sort((a, b) => a.order - b.order);
}

async function getImage(id) {
  return tx("images", "readonly", (store) => reqToPromise(store.get(id)));
}

async function deleteImage(id) {
  await deleteAnnotationsForImage(id);
  return tx("images", "readwrite", (store) => reqToPromise(store.delete(id)));
}

// ---------- Annotations ----------

async function addAnnotation({ id, imageId, classId, type, data }) {
  const annotation = { id: id ?? uid(), imageId, classId, type, data, createdAt: Date.now() };
  await tx("annotations", "readwrite", (store) => reqToPromise(store.add(annotation)));
  return annotation;
}

async function listAnnotations(imageId) {
  return tx("annotations", "readonly", (store) => {
    const idx = store.index("imageId");
    return reqToPromise(idx.getAll(imageId));
  });
}

async function updateAnnotation(id, patch) {
  return tx("annotations", "readwrite", async (store) => {
    const annotation = await reqToPromise(store.get(id));
    if (!annotation) return null;
    Object.assign(annotation, patch);
    await reqToPromise(store.put(annotation));
    return annotation;
  });
}

async function deleteAnnotation(id) {
  return tx("annotations", "readwrite", (store) => reqToPromise(store.delete(id)));
}

async function deleteAnnotationsForImage(imageId) {
  return tx("annotations", "readwrite", async (store) => {
    const idx = store.index("imageId");
    const keys = await reqToPromise(idx.getAllKeys(imageId));
    await Promise.all(keys.map((k) => reqToPromise(store.delete(k))));
  });
}

// Counts per class across a whole project — right rail instance counts.
// Small projects only (annotation counts, not annotation bodies), so a
// project-wide scan is fine; this is not called per-frame.
async function countAnnotationsByClass(projectId) {
  const images = await listImages(projectId);
  const counts = new Map();
  for (const image of images) {
    const annotations = await listAnnotations(image.id);
    for (const a of annotations) counts.set(a.classId, (counts.get(a.classId) ?? 0) + 1);
  }
  return counts;
}

export const store = {
  projects: {
    create: createProject,
    list: listProjects,
    get: getProject,
    update: updateProject,
    delete: deleteProject,
  },
  images: {
    add: addImage,
    listByProject: listImages,
    get: getImage,
    delete: deleteImage,
  },
  annotations: {
    add: addAnnotation,
    listByImage: listAnnotations,
    update: updateAnnotation,
    delete: deleteAnnotation,
    deleteByImage: deleteAnnotationsForImage,
    countByClass: countAnnotationsByClass,
  },
};
