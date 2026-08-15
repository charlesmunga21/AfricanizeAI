// Fetch model weights with a real progress callback, cache them in Cache
// Storage keyed by CACHE_VERSION, and serve from cache on repeat visits.
//
// Two things this exists to enforce (§5, §1.9 of the build spec): a visitor
// on metered data sees real megabytes before they spend the data, and a
// repeat visit costs nothing.

const CACHE_NAME_PREFIX = "afai-models";

function cacheKey(version) {
  return `${CACHE_NAME_PREFIX}-${version}`;
}

export async function isCached(url, version) {
  if (!("caches" in self)) return false;
  const cache = await caches.open(cacheKey(version));
  const hit = await cache.match(url);
  return !!hit;
}

// True when the connection is metered or slow enough that we should ask
// before spending the visitor's data, rather than fetching automatically.
export function isMeteredConnection() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false; // unknown — don't block on a signal we don't have
  if (conn.saveData) return true;
  if (conn.effectiveType && /2g/.test(conn.effectiveType)) return true;
  return false;
}

// onProgress({ loaded, total }) fires as bytes arrive. Returns an ArrayBuffer.
export async function fetchModel(url, version, onProgress) {
  const cache = "caches" in self ? await caches.open(cacheKey(version)) : null;

  if (cache) {
    const cached = await cache.match(url);
    if (cached) {
      const buf = await cached.arrayBuffer();
      onProgress?.({ loaded: buf.byteLength, total: buf.byteLength, fromCache: true });
      return buf;
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model fetch failed: ${response.status} ${url}`);

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total, fromCache: false });
  }

  const buf = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (cache) {
    // Cache Storage needs its own Response; the one we streamed from is
    // already consumed by the reader above.
    await cache.put(url, new Response(buf, { headers: { "Content-Length": String(loaded) } }));
  }

  return buf.buffer;
}

export function formatBytes(n) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
