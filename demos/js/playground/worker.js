// Training runs here so the main thread is free to render at 60fps regardless of
// network size. The worker owns the MLP; it posts weight snapshots back on an
// interval, not every epoch, so tiny fast-converging nets don't flood the main thread.

import { MLP } from "./net.js";

let net = null;
let train = [];
let test = [];
let config = { lr: 0.1, reg: "none", regRate: 0, batchSize: 10 };
let epoch = 0;
let running = false;
let lastPost = 0;
const POST_INTERVAL_MS = 50;

function rebuildNet({ hiddenLayers, activation, seed }) {
  net = new MLP({ inputSize: 2, hiddenLayers, activation, seed });
  epoch = 0;
}

function postSnapshot(force = false) {
  const now = performance.now();
  if (!force && now - lastPost < POST_INTERVAL_MS) return;
  lastPost = now;
  postMessage({
    type: "snapshot",
    epoch,
    trainLoss: net.loss(train),
    testLoss: test.length ? net.loss(test) : null,
    sizes: net.sizes,
    activation: net.activation,
    layers: net.layers.map((l) => ({ W: l.W, b: l.b })),
  });
}

function shuffledBatches(examples, batchSize, epochSeed) {
  // Cheap shuffle per epoch so batches aren't the same slice every time.
  const arr = examples.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (epochSeed * 9301 + 49297 * i) % (i + 1);
    [arr[i], arr[Math.abs(j) % (i + 1)]] = [arr[Math.abs(j) % (i + 1)], arr[i]];
  }
  const batches = [];
  for (let i = 0; i < arr.length; i += batchSize) batches.push(arr.slice(i, i + batchSize));
  return batches;
}

function runEpoch() {
  if (!net || train.length === 0) return;
  for (const batch of shuffledBatches(train, config.batchSize, epoch + 1)) {
    net.trainBatch(batch, config);
  }
  epoch++;
}

let loopHandle = null;
function loop() {
  if (!running) return;
  runEpoch();
  postSnapshot();
  loopHandle = setTimeout(loop, 0);
}

onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "configure": {
      train = msg.train;
      test = msg.test;
      config = { lr: msg.lr, reg: msg.reg, regRate: msg.regRate, batchSize: msg.batchSize };
      rebuildNet({ hiddenLayers: msg.hiddenLayers, activation: msg.activation, seed: msg.seed });
      postSnapshot(true);
      break;
    }
    case "updateHyperparams": {
      config = { lr: msg.lr, reg: msg.reg, regRate: msg.regRate, batchSize: msg.batchSize };
      break;
    }
    case "start": {
      running = true;
      clearTimeout(loopHandle);
      loop();
      break;
    }
    case "pause": {
      running = false;
      clearTimeout(loopHandle);
      postSnapshot(true);
      break;
    }
    case "step": {
      running = false;
      clearTimeout(loopHandle);
      runEpoch();
      postSnapshot(true);
      break;
    }
    default:
      break;
  }
};
