// One source of truth for the assistant's model + cache versions, mirroring
// the pattern in ../config.js.
//
// Unlike the detect/SAM models, transformers.js manages its own file fetching
// and Cache Storage entries internally (config.json, tokenizer.json, the onnx
// weights — several small files, not one), so there's no single MODELS[...]
// {url, bytes} entry to reuse from model-cache.js. BYTES_APPROX below is only
// for the consent-dialog copy ("~23 MB"), not used to drive progress math.

export const TRANSFORMERS_VERSION = "4.2.0";
export const TRANSFORMERS_MODULE_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/+esm`;

export const EMBED_MODEL = {
  name: "all-MiniLM-L6-v2",
  id: "Xenova/all-MiniLM-L6-v2",
  dtype: "q8",
  bytesApprox: 24_000_000,
};

// Bump alongside a model or corpus.json schema change — store.js keys the
// cached embedding matrix on this plus corpus.json's own content-hash
// version, so either one changing forces a re-embed instead of silently
// serving a stale/mismatched vector cache.
export const EMBED_CACHE_VERSION = "v1";

export const CORPUS_URL = "js/assistant/corpus.json";

export const TOP_K = 5;
