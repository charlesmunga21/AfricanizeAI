// Runs the embedding model off the main thread — 200-odd chunks is enough
// WASM work (§1.2: no COOP/COEP means single-threaded WASM, see runtime.js)
// to visibly jank the UI if it ran inline, and every later question re-embeds
// one more string on top of whatever else the page is doing.

import { TRANSFORMERS_MODULE_URL, EMBED_MODEL } from "./config.js";

const BATCH_SIZE = 16;

let extractor = null;

async function boot() {
  const { pipeline, env } = await import(TRANSFORMERS_MODULE_URL);

  // Same constraint as ../runtime.js's configureOrt: no cross-origin isolation
  // on GitHub Pages, so SharedArrayBuffer/multi-threaded WASM aren't available.
  env.backends.onnx.wasm.numThreads = 1;
  env.allowLocalModels = false;

  extractor = await pipeline("feature-extraction", EMBED_MODEL.id, {
    dtype: EMBED_MODEL.dtype,
    progress_callback: (p) => {
      if (p.status === "progress") {
        postMessage({ type: "modelProgress", file: p.file, loaded: p.loaded, total: p.total });
      }
    },
  });

  postMessage({ type: "ready" });
}

async function embed(text) {
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return { data: out.data, dim: out.dims[out.dims.length - 1] };
}

async function embedCorpus(texts) {
  const dim = 384; // all-MiniLM-L6-v2's fixed output width
  const vectors = new Float32Array(texts.length * dim);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const out = await extractor(batch, { pooling: "mean", normalize: true });
    vectors.set(out.data, i * dim);
    postMessage({ type: "embedProgress", done: Math.min(i + BATCH_SIZE, texts.length), total: texts.length });
  }

  postMessage({ type: "embedCorpusDone", vectors: vectors.buffer, dim }, [vectors.buffer]);
}

onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "boot":
        await boot();
        break;
      case "embedCorpus":
        await embedCorpus(msg.texts);
        break;
      case "embedQuery": {
        const { data } = await embed(msg.text);
        postMessage({ type: "embedQueryResult", requestId: msg.requestId, vector: data.buffer }, [data.buffer]);
        break;
      }
    }
  } catch (err) {
    postMessage({ type: "error", message: err?.message || String(err) });
  }
};
