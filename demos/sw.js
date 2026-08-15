// App-shell cache for live.html — installability plus "still opens if the
// network drops," which is the deployment reality the demo is teaching
// about. Model weights are NOT cached here: model-cache.js already caches
// them under a separate, independently-versioned Cache Storage entry, and
// duplicating tens of MB of ONNX weights into this cache too would just
// waste the visitor's disk for no benefit.
//
// Bump CACHE_NAME whenever any file in SHELL_ASSETS changes.
const CACHE_NAME = "afai-live-shell-v1";

const SHELL_ASSETS = [
  "live.html",
  "assets/tokens.css",
  "assets/base.css",
  "assets/fonts/archivo-variable.woff2",
  "assets/fonts/public-sans-400.woff2",
  "assets/fonts/public-sans-500.woff2",
  "assets/fonts/jetbrains-mono-500.woff2",
  "js/frame.js",
  "js/config.js",
  "js/runtime.js",
  "js/model-cache.js",
  "js/camera.js",
  "js/live/detect.js",
  "js/live/segment.js",
  "js/live/worker.js",
  "js/live/overlay.js",
  "js/live/main.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first for the shell, network passthrough for everything else
// (model weight requests to huggingface.co, in particular, must never
// touch this cache).
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
