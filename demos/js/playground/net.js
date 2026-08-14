// A dense MLP with manual forward and backward passes. No autodiff, no dependency —
// every gradient here is written out so the file can be read as the lesson itself.
// Output is a single sigmoid unit (binary classification); loss is binary cross-entropy,
// which is why the output layer's error term collapses to (prediction - label).

const ACTIVATIONS = {
  relu: {
    f: (x) => (x > 0 ? x : 0),
    df: (x) => (x > 0 ? 1 : 0),
  },
  tanh: {
    f: (x) => Math.tanh(x),
    df: (x) => 1 - Math.tanh(x) ** 2,
  },
  sigmoid: {
    f: (x) => 1 / (1 + Math.exp(-x)),
    df: (x) => {
      const s = 1 / (1 + Math.exp(-x));
      return s * (1 - s);
    },
  },
};

function randn(rng) {
  // Box-Muller — good enough for weight init, avoids pulling in a dependency.
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MLP {
  constructor({ inputSize = 2, hiddenLayers = [4, 4], activation = "tanh", seed = 1 }) {
    this.activation = activation;
    this.sizes = [inputSize, ...hiddenLayers, 1];
    const rng = mulberry32(seed);
    this.layers = [];
    for (let l = 1; l < this.sizes.length; l++) {
      const fanIn = this.sizes[l - 1];
      const fanOut = this.sizes[l];
      // Xavier init: keeps activations from exploding/vanishing at depth 0–4.
      const scale = Math.sqrt(2 / (fanIn + fanOut));
      const W = Array.from({ length: fanOut }, () =>
        Array.from({ length: fanIn }, () => randn(rng) * scale)
      );
      const b = new Array(fanOut).fill(0);
      this.layers.push({ W, b });
    }
  }

  // Returns per-layer pre-activation (z) and post-activation (a), a[0] = input.
  forward(x) {
    const a = [x];
    const z = [null];
    for (let l = 0; l < this.layers.length; l++) {
      const { W, b } = this.layers[l];
      const isOutput = l === this.layers.length - 1;
      const fn = isOutput ? ACTIVATIONS.sigmoid : ACTIVATIONS[this.activation];
      const zl = W.map((row, i) => row.reduce((s, w, j) => s + w * a[l][j], b[i]));
      z.push(zl);
      a.push(zl.map(fn.f));
    }
    return { a, z };
  }

  predict(x) {
    return this.forward(x).a[this.layers.length][0];
  }

  // One step of backprop for a single example. Returns per-layer {dW, db}.
  gradients(x, y) {
    const { a, z } = this.forward(x);
    const L = this.layers.length;
    const grads = new Array(L);
    // Output layer: d(BCE)/d(z) simplifies to (prediction - label) when paired with sigmoid.
    let delta = [a[L][0] - y];

    for (let l = L - 1; l >= 0; l--) {
      const { W } = this.layers[l];
      const dW = W.map((row, i) => row.map((_, j) => delta[i] * a[l][j]));
      const db = delta.slice();
      grads[l] = { dW, db };

      if (l > 0) {
        const fn = ACTIVATIONS[this.activation];
        const prevSize = this.sizes[l];
        const next = new Array(prevSize).fill(0);
        for (let i = 0; i < delta.length; i++) {
          for (let j = 0; j < prevSize; j++) next[j] += delta[i] * W[i][j];
        }
        delta = next.map((v, j) => v * fn.df(z[l][j]));
      }
    }
    return grads;
  }

  // Averages gradients over a batch, applies L1/L2 regularization, then gradient descent.
  trainBatch(batch, { lr, reg = "none", regRate = 0 }) {
    const L = this.layers.length;
    const acc = this.layers.map(({ W, b }) => ({
      dW: W.map((row) => row.map(() => 0)),
      db: b.map(() => 0),
    }));

    for (const [x, y] of batch) {
      const grads = this.gradients(x, y);
      for (let l = 0; l < L; l++) {
        for (let i = 0; i < acc[l].dW.length; i++) {
          for (let j = 0; j < acc[l].dW[i].length; j++) acc[l].dW[i][j] += grads[l].dW[i][j];
          acc[l].db[i] += grads[l].db[i];
        }
      }
    }

    const n = batch.length;
    for (let l = 0; l < L; l++) {
      const { W, b } = this.layers[l];
      for (let i = 0; i < W.length; i++) {
        for (let j = 0; j < W[i].length; j++) {
          let grad = acc[l].dW[i][j] / n;
          if (reg === "l2") grad += regRate * W[i][j];
          if (reg === "l1") grad += regRate * Math.sign(W[i][j]);
          W[i][j] -= lr * grad;
        }
        b[i] -= lr * (acc[l].db[i] / n);
      }
    }
  }

  loss(examples) {
    let sum = 0;
    for (const [x, y] of examples) {
      const p = Math.min(Math.max(this.predict(x), 1e-7), 1 - 1e-7);
      sum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    }
    return sum / examples.length;
  }
}
