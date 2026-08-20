// IndexedDB cache for the corpus's embedding matrix, so a repeat visit skips
// re-embedding 200-odd chunks. Same raw-IndexedDB idiom as ../annotate/store.js.
//
// One row only, keyed by a fixed id — cached() compares its own
// corpusVersion/cacheVersion against the caller's current values, so editing
// an article (which changes corpus.json's content-hash version) or bumping
// EMBED_CACHE_VERSION both invalidate it automatically rather than needing a
// manual "clear cache" step.

const DB_NAME = "africanize-assistant";
const DB_VERSION = 1;
const STORE = "vectorCache";
const KEY = "index";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
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

// Returns { vectors: Float32Array, dim } or null if absent/stale.
export async function loadCached(corpusVersion, cacheVersion) {
  const db = await openDB();
  const t = db.transaction(STORE, "readonly");
  const row = await reqToPromise(t.objectStore(STORE).get(KEY));
  if (!row) return null;
  if (row.corpusVersion !== corpusVersion || row.cacheVersion !== cacheVersion) return null;
  return { vectors: new Float32Array(row.vectors), dim: row.dim };
}

export async function save(corpusVersion, cacheVersion, vectors, dim) {
  const db = await openDB();
  const t = db.transaction(STORE, "readwrite");
  t.objectStore(STORE).put({ key: KEY, corpusVersion, cacheVersion, dim, vectors: vectors.buffer });
  await new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
