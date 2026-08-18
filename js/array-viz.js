// Interactive visual models for the Arrays module. Plain DOM + CSS transitions —
// no canvas needed since every visual here is a row/grid of boxes, and DOM gives
// free hit-testing (click a box) and free animation (class toggles) over pixel drawing.

function renderBoxes(el, values, classify) {
  el.innerHTML = "";
  values.forEach((v, i) => {
    const box = document.createElement(classify && classify(i).clickable === false ? "div" : "button");
    const extra = classify ? classify(i) : {};
    if (box.tagName === "BUTTON") box.type = "button";
    box.className = "viz-box" + (extra.className ? " " + extra.className : "");
    box.innerHTML = `${extra.addr !== undefined ? `<span class="viz-box__addr">${extra.addr}</span>` : ""}<span class="viz-box__val">${v}</span><span class="viz-box__idx">${i}</span>`;
    if (extra.onClick) box.addEventListener("click", extra.onClick);
    el.appendChild(box);
  });
}

// --- Submodule 1: memory address visualizer -------------------------------------
function initAddressViz(root) {
  const values = [72, 88, 95, 61, 79, 34, 50, 12];
  const state = { base: 1000, size: 4, selected: 3 };

  root.innerHTML = `
    <div class="viz-controls">
      <label>Base address <input type="number" id="addr-base" value="${state.base}" step="4"></label>
      <label>Element size (bytes) <input type="number" id="addr-size" value="${state.size}" min="1" max="16"></label>
    </div>
    <div class="viz-row" id="addr-boxes"></div>
    <div class="viz-formula" id="addr-formula"></div>
  `;

  const boxesEl = root.querySelector("#addr-boxes");
  const formulaEl = root.querySelector("#addr-formula");

  function render() {
    renderBoxes(boxesEl, values, (i) => ({
      className: i === state.selected ? "is-active" : "",
      addr: state.base + i * state.size,
      onClick: () => { state.selected = i; render(); },
    }));
    const addr = state.base + state.selected * state.size;
    formulaEl.textContent = `address(${state.selected}) = base + (i × size) = ${state.base} + (${state.selected} × ${state.size}) = ${addr}`;
  }

  root.querySelector("#addr-base").addEventListener("input", (e) => {
    state.base = Number(e.target.value) || 0;
    render();
  });
  root.querySelector("#addr-size").addEventListener("input", (e) => {
    state.size = Math.max(1, Number(e.target.value) || 1);
    render();
  });

  render();
}

// --- Submodule 2: operations visualizer (access / insert / delete / traverse) ---
function initOperationsViz(root) {
  const initial = [10, 20, 30, 40, 50];
  let arr = initial.slice();
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Index <input type="number" id="op-index" value="2" min="0"></label>
      <label>Value <input type="number" id="op-value" value="99"></label>
      <button type="button" class="viz-btn" id="op-access">Access</button>
      <button type="button" class="viz-btn" id="op-insert">Insert</button>
      <button type="button" class="viz-btn" id="op-delete">Delete</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="op-traverse">Traverse</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="op-reset">Reset</button>
    </div>
    <div class="viz-row" id="op-boxes"></div>
    <div class="viz-meta"><span class="viz-badge" id="op-complexity">Pick an operation</span></div>
    <div class="viz-log" id="op-log"></div>
  `;

  const boxesEl = root.querySelector("#op-boxes");
  const indexInput = root.querySelector("#op-index");
  const valueInput = root.querySelector("#op-value");
  const complexityEl = root.querySelector("#op-complexity");
  const logEl = root.querySelector("#op-log");

  function render(highlight) {
    renderBoxes(boxesEl, arr, (i) => ({
      className: highlight && highlight.includes(i) ? "is-active" : "",
      clickable: false,
    }));
  }
  function addLog(text) {
    log.unshift(text);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function rangeFrom(i) {
    const r = [];
    for (let k = i; k < arr.length; k++) r.push(k);
    return r;
  }
  function clampIndex(i) {
    return Number.isNaN(i) || i < 0 || i >= arr.length ? null : i;
  }

  root.querySelector("#op-access").addEventListener("click", () => {
    const i = clampIndex(Number(indexInput.value));
    if (i === null) return;
    render([i]);
    complexityEl.textContent = "Access by index — O(1)";
    addLog(`Access arr[${i}] → ${arr[i]}`);
  });

  root.querySelector("#op-insert").addEventListener("click", () => {
    let i = Number(indexInput.value);
    if (Number.isNaN(i)) i = arr.length;
    i = Math.max(0, Math.min(arr.length, i));
    const v = Number(valueInput.value) || 0;
    arr.splice(i, 0, v);
    render(rangeFrom(i));
    const shifted = arr.length - 1 - i;
    complexityEl.textContent = shifted === 0
      ? "Insert at end — O(1)"
      : `Insert at index ${i} — O(n), shifted ${shifted} element(s) right`;
    addLog(`Insert ${v} at index ${i}`);
  });

  root.querySelector("#op-delete").addEventListener("click", () => {
    const i = clampIndex(Number(indexInput.value));
    if (i === null || arr.length === 0) return;
    const removed = arr[i];
    const shifted = arr.length - 1 - i;
    arr.splice(i, 1);
    render(rangeFrom(i));
    complexityEl.textContent = shifted === 0
      ? "Delete at end — O(1)"
      : `Delete at index ${i} — O(n), shifted ${shifted} element(s) left`;
    addLog(`Delete arr[${i}] (was ${removed})`);
  });

  root.querySelector("#op-traverse").addEventListener("click", () => {
    complexityEl.textContent = "Traversal — O(n)";
    addLog("Traverse: visit every element once");
    let i = 0;
    (function step() {
      if (i >= arr.length) return;
      render([i]);
      i++;
      setTimeout(step, 220);
    })();
  });

  root.querySelector("#op-reset").addEventListener("click", () => {
    arr = initial.slice();
    render();
    complexityEl.textContent = "Pick an operation";
    log.length = 0;
    logEl.innerHTML = "";
  });

  render();
}

// --- Submodule 3: search visualizer (linear vs binary, step-through) ------------
function initSearchViz(root) {
  const arr = [3, 7, 12, 18, 23, 29, 34, 41, 47, 52];
  let steps = [];
  let stepIndex = -1;
  let playTimer = null;

  root.innerHTML = `
    <div class="viz-controls">
      <label>Target <input type="number" id="s-target" value="34"></label>
      <button type="button" class="viz-btn" id="s-linear">Linear Search</button>
      <button type="button" class="viz-btn" id="s-binary">Binary Search</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="s-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="s-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="s-reset">Reset</button>
    </div>
    <div class="viz-row" id="s-boxes"></div>
    <div class="viz-log" id="s-log"></div>
  `;

  const boxesEl = root.querySelector("#s-boxes");
  const targetInput = root.querySelector("#s-target");
  const logEl = root.querySelector("#s-log");

  function renderPlain() {
    renderBoxes(boxesEl, arr, () => ({ clickable: false }));
  }

  function buildLinearSteps(target) {
    const s = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === target) {
        s.push({ active: [i], found: i, message: `index ${i}: ${arr[i]} = ${target} → found!` });
        return s;
      }
      s.push({ active: [i], message: `index ${i}: ${arr[i]} ≠ ${target}, continue` });
    }
    s.push({ active: [], notFound: true, message: `reached the end — ${target} is not in the array` });
    return s;
  }

  function buildBinarySteps(target) {
    const s = [];
    let lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (arr[mid] === target) {
        s.push({ active: [mid], range: [lo, hi], found: mid, message: `low=${lo} high=${hi} mid=${mid} (${arr[mid]}) = ${target} → found!` });
        return s;
      }
      if (arr[mid] < target) {
        s.push({ active: [mid], range: [lo, hi], message: `low=${lo} high=${hi} mid=${mid} (${arr[mid]}) < ${target} → search right half` });
        lo = mid + 1;
      } else {
        s.push({ active: [mid], range: [lo, hi], message: `low=${lo} high=${hi} mid=${mid} (${arr[mid]}) > ${target} → search left half` });
        hi = mid - 1;
      }
    }
    s.push({ active: [], notFound: true, message: `low > high — ${target} is not in the array` });
    return s;
  }

  function render() {
    const cur = steps[stepIndex];
    renderBoxes(boxesEl, arr, (i) => {
      if (!cur) return { clickable: false };
      const inRange = cur.range ? i >= cur.range[0] && i <= cur.range[1] : true;
      let cls = "";
      if (!inRange) cls = "is-dim";
      else if (cur.active.includes(i)) cls = cur.found === i ? "is-found" : "is-active";
      return { clickable: false, className: cls };
    });
    logEl.innerHTML = steps.slice(0, stepIndex + 1).map((s) => `<div>${s.message}</div>`).reverse().join("");
  }

  function start(kind) {
    stopPlay();
    const target = Number(targetInput.value);
    steps = kind === "linear" ? buildLinearSteps(target) : buildBinarySteps(target);
    stepIndex = -1;
    logEl.innerHTML = "";
    renderPlain();
  }

  function step() {
    if (stepIndex >= steps.length - 1) { stopPlay(); return; }
    stepIndex++;
    render();
  }

  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }

  root.querySelector("#s-linear").addEventListener("click", () => start("linear"));
  root.querySelector("#s-binary").addEventListener("click", () => start("binary"));
  root.querySelector("#s-step").addEventListener("click", step);
  root.querySelector("#s-play").addEventListener("click", () => {
    if (!steps.length) return;
    stopPlay();
    playTimer = setInterval(step, 700);
  });
  root.querySelector("#s-reset").addEventListener("click", () => {
    stopPlay();
    steps = [];
    stepIndex = -1;
    logEl.innerHTML = "";
    renderPlain();
  });

  renderPlain();
}

// --- Submodule 4: 2D grid / row-major vs column-major visualizer ----------------
function initGridViz(root) {
  const rows = 3, cols = 4;
  const values = Array.from({ length: rows * cols }, (_, i) => i);
  const state = { base: 2000, size: 4, order: "row", row: 1, col: 2 };

  root.innerHTML = `
    <div class="viz-controls">
      <label>Base address <input type="number" id="g-base" value="${state.base}" step="4"></label>
      <label>Element size <input type="number" id="g-size" value="${state.size}" min="1" max="16"></label>
      <label>Order
        <select id="g-order">
          <option value="row">Row-major</option>
          <option value="col">Column-major</option>
        </select>
      </label>
    </div>
    <div class="grid-2d" id="g-grid" style="--cols:${cols}"></div>
    <div class="viz-formula" id="g-formula"></div>
  `;

  const gridEl = root.querySelector("#g-grid");
  const formulaEl = root.querySelector("#g-formula");

  function flatIndex(r, c) {
    return state.order === "row" ? r * cols + c : c * rows + r;
  }

  function render() {
    gridEl.innerHTML = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = flatIndex(r, c);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "grid-2d__cell" + (r === state.row && c === state.col ? " is-active" : "");
        cell.innerHTML = `<span class="grid-2d__val">${values[idx]}</span><span class="grid-2d__idx">[${r}][${c}]</span>`;
        cell.addEventListener("click", () => { state.row = r; state.col = c; render(); });
        gridEl.appendChild(cell);
      }
    }
    const flat = flatIndex(state.row, state.col);
    const addr = state.base + flat * state.size;
    formulaEl.textContent = state.order === "row"
      ? `address(${state.row},${state.col}) = base + (row × cols + col) × size = ${state.base} + (${state.row}×${cols} + ${state.col}) × ${state.size} = ${addr}`
      : `address(${state.row},${state.col}) = base + (col × rows + row) × size = ${state.base} + (${state.col}×${rows} + ${state.row}) × ${state.size} = ${addr}`;
  }

  root.querySelector("#g-base").addEventListener("input", (e) => {
    state.base = Number(e.target.value) || 0;
    render();
  });
  root.querySelector("#g-size").addEventListener("input", (e) => {
    state.size = Math.max(1, Number(e.target.value) || 1);
    render();
  });
  root.querySelector("#g-order").addEventListener("change", (e) => {
    state.order = e.target.value;
    render();
  });

  render();
}
