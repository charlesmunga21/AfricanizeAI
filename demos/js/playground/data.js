// Toy 2D datasets, all normalized to roughly [-1, 1]. Spiral is the one that actually
// separates good hyperparameters from bad — moons and circles are linearly-ish separable
// with enough depth, spiral punishes underfitting.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function moons(n, noise, rng) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const label = i % 2;
    const t = rng() * Math.PI;
    let x, y;
    if (label === 0) {
      x = Math.cos(t);
      y = Math.sin(t);
    } else {
      x = 1 - Math.cos(t);
      y = 1 - Math.sin(t) - 0.5;
    }
    x += gauss(rng) * noise;
    y += gauss(rng) * noise;
    pts.push([[x, y], label]);
  }
  return pts;
}

function circles(n, noise, rng) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const label = i % 2;
    const r = label === 0 ? 0.5 : 1;
    const t = rng() * 2 * Math.PI;
    const x = r * Math.cos(t) + gauss(rng) * noise;
    const y = r * Math.sin(t) + gauss(rng) * noise;
    pts.push([[x, y], label]);
  }
  return pts;
}

function spiral(n, noise, rng) {
  const pts = [];
  const turns = 2.2;
  for (let i = 0; i < n; i++) {
    const label = i % 2;
    const t = (i / n) * turns * Math.PI;
    const r = t / (turns * Math.PI);
    const sign = label === 0 ? 1 : -1;
    const x = sign * r * Math.cos(t) + gauss(rng) * noise;
    const y = sign * r * Math.sin(t) + gauss(rng) * noise;
    pts.push([[x, y], label]);
  }
  return pts;
}

function xor(n, noise, rng) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let x = rng() * 2 - 1;
    let y = rng() * 2 - 1;
    const label = x * y >= 0 ? 1 : 0;
    x += gauss(rng) * noise;
    y += gauss(rng) * noise;
    pts.push([[x, y], label]);
  }
  return pts;
}

const GENERATORS = { moons, circles, spiral, xor };

export function generateDataset(name, { n = 240, noise = 0.1, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const gen = GENERATORS[name] || GENERATORS.moons;
  return gen(n, noise, rng);
}

export function splitDataset(points, trainFraction, seed = 2) {
  const rng = mulberry32(seed);
  const shuffled = points
    .map((p) => [rng(), p])
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
  const cut = Math.round(shuffled.length * trainFraction);
  return { train: shuffled.slice(0, cut), test: shuffled.slice(cut) };
}

export const DATASET_NAMES = Object.keys(GENERATORS);
