// Nearest-neighbour search over the in-memory embedding matrix. Both the
// corpus vectors and the query vector come out of the pipeline already
// L2-normalized ({ normalize: true } in worker.js), so cosine similarity is
// just a dot product — no norm division needed here.

// vectors: flat Float32Array, row-major, chunkCount * dim.
export function topK(query, vectors, dim, chunkCount, k) {
  const scores = new Float32Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) {
    let dot = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) dot += vectors[base + d] * query[d];
    scores[i] = dot;
  }

  const indices = Array.from({ length: chunkCount }, (_, i) => i);
  indices.sort((a, b) => scores[b] - scores[a]);
  return indices.slice(0, k).map((i) => ({ index: i, score: scores[i] }));
}
