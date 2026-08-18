// Interactive visual models for the Binary Search module.

function renderBSArray(boxesWrap, ptrWrap, arr, opts) {
  if (ptrWrap) {
    ptrWrap.innerHTML = "";
    arr.forEach((_, i) => {
      const cell = document.createElement("div");
      cell.className = "viz-ptr-cell";
      const labels = [];
      if (opts) {
        if (opts.low === i) labels.push("low");
        if (opts.mid === i) labels.push("mid");
        if (opts.high === i) labels.push("high");
      }
      cell.textContent = labels.join("/");
      ptrWrap.appendChild(cell);
    });
  }
  boxesWrap.innerHTML = "";
  arr.forEach((v, i) => {
    const box = document.createElement("div");
    let cls = "viz-box";
    if (opts) {
      const inRange = opts.low === undefined || opts.high === undefined ? true : i >= opts.low && i <= opts.high;
      if (!inRange) cls += " is-dim";
      if (opts.found === i) cls += " is-found";
      else if (opts.candidates && opts.candidates.has(i)) cls += " is-candidate";
      else if (opts.mid === i) cls += " is-active";
    }
    box.className = cls;
    box.innerHTML = `<span class="viz-box__val">${v}</span><span class="viz-box__idx">${i}</span>`;
    boxesWrap.appendChild(box);
  });
}

// --- Submodule 1: how it works — step through the standard algorithm -----------
function initBSHowItWorksViz(root) {
  const arr = [2, 5, 8, 12, 16, 23, 38, 45, 56, 72, 91];
  let steps = [];
  let stepIndex = -1;
  let playTimer = null;

  root.innerHTML = `
    <div class="viz-controls">
      <label>Target <input type="number" id="bs-target" value="45"></label>
      <button type="button" class="viz-btn" id="bs-run">Run</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="bs-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="bs-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="bs-reset">Reset</button>
    </div>
    <div class="viz-ptr-row" id="bs-ptrs"></div>
    <div class="viz-row" id="bs-boxes"></div>
    <div class="viz-log" id="bs-log"></div>
  `;

  const boxesEl = root.querySelector("#bs-boxes");
  const ptrsEl = root.querySelector("#bs-ptrs");
  const targetInput = root.querySelector("#bs-target");
  const logEl = root.querySelector("#bs-log");

  function build(target) {
    const s = [];
    let low = 0, high = arr.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (arr[mid] === target) {
        s.push({ low, high, mid, found: mid, message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) = ${target} → found!` });
        return s;
      } else if (arr[mid] < target) {
        s.push({ low, high, mid, message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) < ${target} → search right half` });
        low = mid + 1;
      } else {
        s.push({ low, high, mid, message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) > ${target} → search left half` });
        high = mid - 1;
      }
    }
    s.push({ notFound: true, message: `low > high — ${target} is not in the array` });
    return s;
  }

  function renderPlain() {
    renderBSArray(boxesEl, ptrsEl, arr, null);
  }

  function render() {
    const cur = steps[stepIndex];
    renderBSArray(boxesEl, ptrsEl, arr, cur && !cur.notFound ? cur : null);
    logEl.innerHTML = steps.slice(0, stepIndex + 1).map((s) => `<div>${s.message}</div>`).reverse().join("");
  }

  function run() {
    stopPlay();
    steps = build(Number(targetInput.value));
    stepIndex = -1;
    logEl.innerHTML = "";
    renderPlain();
  }
  function step() {
    if (stepIndex >= steps.length - 1) { stopPlay(); return; }
    stepIndex++;
    render();
  }
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

  root.querySelector("#bs-run").addEventListener("click", run);
  root.querySelector("#bs-step").addEventListener("click", () => { if (!steps.length) run(); step(); });
  root.querySelector("#bs-play").addEventListener("click", () => {
    if (!steps.length) run();
    stopPlay();
    playTimer = setInterval(step, 700);
  });
  root.querySelector("#bs-reset").addEventListener("click", () => {
    stopPlay(); steps = []; stepIndex = -1; logEl.innerHTML = ""; renderPlain();
  });

  renderPlain();
}

// --- Submodule 2: iterative vs recursive — call stack visualizer ---------------
function initBSRecursionViz(root) {
  const arr = [2, 5, 8, 12, 16, 23, 38, 45, 56, 72, 91];
  let steps = [];
  let stepIndex = -1;
  let playTimer = null;
  let peakDepth = 0;

  root.innerHTML = `
    <div class="viz-controls">
      <label>Target <input type="number" id="rec-target" value="72"></label>
      <button type="button" class="viz-btn" id="rec-recursive">Run Recursive</button>
      <button type="button" class="viz-btn" id="rec-iterative">Run Iterative</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="rec-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="rec-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="rec-reset">Reset</button>
    </div>
    <div class="viz-meta"><span class="viz-badge" id="rec-depth">Call stack empty</span></div>
    <div class="callstack" id="rec-stack"></div>
    <div class="viz-log" id="rec-log"></div>
  `;

  const stackEl = root.querySelector("#rec-stack");
  const depthEl = root.querySelector("#rec-depth");
  const logEl = root.querySelector("#rec-log");
  const targetInput = root.querySelector("#rec-target");

  function buildRecursive(target) {
    const s = [];
    const stack = [];
    function recurse(low, high, depth) {
      if (low > high) {
        s.push({ stack: stack.slice(), message: `depth ${depth}: low(${low}) > high(${high}) → return -1` });
        return -1;
      }
      const mid = Math.floor((low + high) / 2);
      stack.push({ depth, low, high, mid });
      s.push({ stack: stack.slice(), message: `push frame: bsearch(${low}, ${high}), mid=${mid} (${arr[mid]})` });
      let result;
      if (arr[mid] === target) {
        stack[stack.length - 1].found = true;
        s.push({ stack: stack.slice(), message: `arr[${mid}] = ${target} → found!` });
        result = mid;
      } else if (arr[mid] < target) {
        result = recurse(mid + 1, high, depth + 1);
      } else {
        result = recurse(low, mid - 1, depth + 1);
      }
      stack.pop();
      s.push({ stack: stack.slice(), message: `pop frame: bsearch(${low}, ${high}) returns ${result}` });
      return result;
    }
    recurse(0, arr.length - 1, 0);
    return s;
  }

  function buildIterative(target) {
    const s = [];
    let low = 0, high = arr.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const frame = { depth: 0, low, high, mid };
      if (arr[mid] === target) {
        frame.found = true;
        s.push({ stack: [frame], message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) → found!` });
        return s;
      } else if (arr[mid] < target) {
        s.push({ stack: [frame], message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) < target → low = mid+1` });
        low = mid + 1;
      } else {
        s.push({ stack: [frame], message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) > target → high = mid-1` });
        high = mid - 1;
      }
    }
    s.push({ stack: [], message: `low > high → not found` });
    return s;
  }

  function renderStack(frames) {
    stackEl.innerHTML = "";
    if (!frames || frames.length === 0) {
      stackEl.innerHTML = `<div class="callstack-empty">— empty —</div>`;
    } else {
      frames.slice().reverse().forEach((f) => {
        const el = document.createElement("div");
        el.className = "callstack-frame" + (f.found ? " is-found" : "");
        el.innerHTML = `<span>depth ${f.depth}: low=${f.low}, high=${f.high}</span><span>mid=${f.mid}</span>`;
        stackEl.appendChild(el);
      });
    }
    peakDepth = Math.max(peakDepth, frames ? frames.length : 0);
    depthEl.textContent = frames && frames.length
      ? `Stack depth: ${frames.length} (peak so far: ${peakDepth})`
      : `Call stack empty (peak reached: ${peakDepth})`;
  }

  function render() {
    const cur = steps[stepIndex];
    renderStack(cur ? cur.stack : []);
    logEl.innerHTML = steps.slice(0, stepIndex + 1).map((s) => `<div>${s.message}</div>`).reverse().join("");
  }

  function start(kind) {
    stopPlay();
    const target = Number(targetInput.value);
    steps = kind === "recursive" ? buildRecursive(target) : buildIterative(target);
    stepIndex = -1;
    peakDepth = 0;
    logEl.innerHTML = "";
    renderStack([]);
  }
  function step() {
    if (stepIndex >= steps.length - 1) { stopPlay(); return; }
    stepIndex++;
    render();
  }
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

  root.querySelector("#rec-recursive").addEventListener("click", () => start("recursive"));
  root.querySelector("#rec-iterative").addEventListener("click", () => start("iterative"));
  root.querySelector("#rec-step").addEventListener("click", step);
  root.querySelector("#rec-play").addEventListener("click", () => {
    if (!steps.length) return;
    stopPlay();
    playTimer = setInterval(step, 600);
  });
  root.querySelector("#rec-reset").addEventListener("click", () => {
    stopPlay(); steps = []; stepIndex = -1; peakDepth = 0; logEl.innerHTML = ""; renderStack([]);
  });

  renderStack([]);
}

// --- Submodule 3: boundaries — find first/last occurrence with duplicates -----
function initBSBoundariesViz(root) {
  const arr = [2, 4, 4, 4, 4, 7, 9, 9, 12, 15];
  let steps = [];
  let stepIndex = -1;
  let playTimer = null;

  root.innerHTML = `
    <div class="viz-controls">
      <label>Target <input type="number" id="bd-target" value="4"></label>
      <button type="button" class="viz-btn" id="bd-first">Find First</button>
      <button type="button" class="viz-btn" id="bd-last">Find Last</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="bd-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="bd-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="bd-reset">Reset</button>
    </div>
    <div class="viz-ptr-row" id="bd-ptrs"></div>
    <div class="viz-row" id="bd-boxes"></div>
    <div class="viz-log" id="bd-log"></div>
  `;

  const boxesEl = root.querySelector("#bd-boxes");
  const ptrsEl = root.querySelector("#bd-ptrs");
  const targetInput = root.querySelector("#bd-target");
  const logEl = root.querySelector("#bd-log");
  let mode = "first";

  function build(target, m) {
    const s = [];
    let low = 0, high = arr.length - 1;
    let result = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (arr[mid] === target) {
        result = mid;
        s.push({ low, high, mid, match: mid, message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) = ${target} → candidate, keep searching ${m === "first" ? "left for an earlier one" : "right for a later one"}` });
        if (m === "first") high = mid - 1; else low = mid + 1;
      } else if (arr[mid] < target) {
        s.push({ low, high, mid, message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) < ${target} → search right half` });
        low = mid + 1;
      } else {
        s.push({ low, high, mid, message: `low=${low} high=${high} mid=${mid} (${arr[mid]}) > ${target} → search left half` });
        high = mid - 1;
      }
    }
    s.push({ result, final: true, message: result === -1 ? `${target} not found` : `done — ${m} occurrence of ${target} is at index ${result}` });
    return s;
  }

  function renderPlain() {
    renderBSArray(boxesEl, ptrsEl, arr, null);
  }

  function render() {
    const candidates = new Set();
    for (let k = 0; k <= stepIndex; k++) {
      if (steps[k].match !== undefined) candidates.add(steps[k].match);
    }
    const cur = steps[stepIndex];
    const opts = cur && !cur.final
      ? { low: cur.low, high: cur.high, mid: cur.mid, candidates }
      : { candidates, found: cur && cur.result !== -1 ? cur.result : undefined };
    renderBSArray(boxesEl, ptrsEl, arr, opts);
    logEl.innerHTML = steps.slice(0, stepIndex + 1).map((s) => `<div>${s.message}</div>`).reverse().join("");
  }

  function start(m) {
    mode = m;
    stopPlay();
    steps = build(Number(targetInput.value), mode);
    stepIndex = -1;
    logEl.innerHTML = "";
    renderPlain();
  }
  function step() {
    if (stepIndex >= steps.length - 1) { stopPlay(); return; }
    stepIndex++;
    render();
  }
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

  root.querySelector("#bd-first").addEventListener("click", () => start("first"));
  root.querySelector("#bd-last").addEventListener("click", () => start("last"));
  root.querySelector("#bd-step").addEventListener("click", () => { if (!steps.length) start(mode); step(); });
  root.querySelector("#bd-play").addEventListener("click", () => {
    if (!steps.length) start(mode);
    stopPlay();
    playTimer = setInterval(step, 700);
  });
  root.querySelector("#bd-reset").addEventListener("click", () => {
    stopPlay(); steps = []; stepIndex = -1; logEl.innerHTML = ""; renderPlain();
  });

  renderPlain();
}

// --- Submodule 4: complexity race — linear vs binary worst-case comparisons ---
function initBSComplexityRaceViz(root) {
  root.innerHTML = `
    <div class="viz-controls">
      <label>Array size (n) <input type="number" id="race-n" value="1000000" min="2" max="1000000000" step="1"></label>
      <button type="button" class="viz-btn" id="race-run">Compare</button>
    </div>
    <div class="race-row">
      <div class="race-track">
        <div class="race-label">Linear search — worst case</div>
        <div class="race-bar"><div class="race-bar__fill race-bar__fill--linear" id="race-linear-fill"></div></div>
        <div class="race-count" id="race-linear-count">0 comparisons</div>
      </div>
      <div class="race-track">
        <div class="race-label">Binary search — worst case</div>
        <div class="race-bar"><div class="race-bar__fill race-bar__fill--binary" id="race-binary-fill"></div></div>
        <div class="race-count" id="race-binary-count">0 comparisons</div>
      </div>
    </div>
  `;

  const nInput = root.querySelector("#race-n");
  const linearFill = root.querySelector("#race-linear-fill");
  const binaryFill = root.querySelector("#race-binary-fill");
  const linearCount = root.querySelector("#race-linear-count");
  const binaryCount = root.querySelector("#race-binary-count");

  function animateCount(countEl, fillEl, total, durationMs) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const value = Math.round(total * t);
      countEl.textContent = `${value.toLocaleString()} comparisons`;
      fillEl.style.width = `${t * 100}%`;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  root.querySelector("#race-run").addEventListener("click", () => {
    const n = Math.max(2, Math.round(Number(nInput.value) || 0));
    const binaryTotal = Math.ceil(Math.log2(n + 1));
    animateCount(linearCount, linearFill, n, 1800);
    animateCount(binaryCount, binaryFill, binaryTotal, 1800);
  });
}
