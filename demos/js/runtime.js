// WebGPU/WASM backend selection. Shared between the main thread (for a quick
// display-only probe, so the UI can say what it's about to try) and the
// inference worker (which actually builds the ORT session).
//
// §1.2 of the build spec: GitHub Pages can't set COOP/COEP, so
// SharedArrayBuffer is unavailable and multi-threaded WASM is off the table.
// numThreads is pinned to 1 below — that is not a performance oversight,
// it's the only mode that works without those headers.

export function hasWebGPU() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

// Ordered by preference. ORT tries each in turn and falls back silently if
// one fails to initialize — callers should check session.handler or the
// resolved backend some other way and surface it, never assume the first
// entry won.
export function preferredExecutionProviders() {
  return hasWebGPU() ? ["webgpu", "wasm"] : ["wasm"];
}

// Call once, right after `import * as ort from ...`, before creating any
// session — env config is global and must land before the first session.create.
// wasmBase is config.js's ORT_CDN_BASE; passed in rather than imported so
// this module has zero dependencies and stays trivially readable on its own.
export function configureOrt(ort, wasmBase) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = wasmBase;
}

// Given the list actually passed to InferenceSession.create and the session
// it returns, there is no public ORT API that reports which EP won. The
// practical approach every ORT Web app uses: try webgpu alone first, catch,
// fall back to wasm — so the caller always knows exactly which one is live.
export async function createSession(ort, arrayBuffer, opts = {}) {
  const providers = preferredExecutionProviders();
  for (const ep of providers) {
    try {
      const session = await ort.InferenceSession.create(arrayBuffer, {
        executionProviders: [ep],
        graphOptimizationLevel: "all",
        ...opts,
      });
      return { session, backend: ep };
    } catch (err) {
      if (ep === providers[providers.length - 1]) throw err;
      // else: try the next provider in the list
    }
  }
  throw new Error("No execution provider succeeded");
}
