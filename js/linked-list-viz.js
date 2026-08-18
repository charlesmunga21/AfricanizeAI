// Interactive visual models for the Linked Lists module.

function renderLLChain(chainEl, values, opts) {
  chainEl.innerHTML = "";
  values.forEach((v, i) => {
    const box = document.createElement("div");
    let cls = "viz-box";
    if (opts) {
      if (opts.found === i) cls += " is-found";
      else if (opts.active === i) cls += " is-active";
    }
    box.className = cls;
    box.innerHTML = `<span class="viz-box__val">${v}</span><span class="viz-box__idx">${i === 0 ? "head" : ""}</span>`;
    chainEl.appendChild(box);
    const arrow = document.createElement("span");
    arrow.className = "ll-arrow";
    arrow.textContent = "→";
    chainEl.appendChild(arrow);
  });
  const nullBox = document.createElement("div");
  nullBox.className = "ll-null";
  nullBox.textContent = "None";
  chainEl.appendChild(nullBox);
}

// --- Submodule 1: introduction — traverse the chain ------------------------------
function initLLTraverseViz(root) {
  const values = [10, 4, 17, 8, 23];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="ll-traverse">Traverse</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="ll-reset">Reset</button>
    </div>
    <div class="ll-row" id="ll-chain"></div>
    <div class="viz-log" id="ll-log"></div>
  `;

  const chainEl = root.querySelector("#ll-chain");
  const logEl = root.querySelector("#ll-log");

  function addLog(text) {
    const line = document.createElement("div");
    line.textContent = text;
    logEl.prepend(line);
  }

  root.querySelector("#ll-traverse").addEventListener("click", () => {
    logEl.innerHTML = "";
    let i = 0;
    (function step() {
      if (i >= values.length) {
        renderLLChain(chainEl, values, null);
        addLog("current = None → stop, end of list reached");
        return;
      }
      renderLLChain(chainEl, values, { active: i });
      addLog(`current → node(value=${values[i]}), move to current.next`);
      i++;
      setTimeout(step, 500);
    })();
  });

  root.querySelector("#ll-reset").addEventListener("click", () => {
    renderLLChain(chainEl, values, null);
    logEl.innerHTML = "";
  });

  renderLLChain(chainEl, values, null);
}

// --- Submodule 2: insert & delete operations -------------------------------------
function initLLOperationsViz(root) {
  const initial = [10, 4, 17];
  let values = initial.slice();

  root.innerHTML = `
    <div class="viz-controls">
      <label>Value <input type="number" id="llop-value" value="99"></label>
      <label>Index <input type="number" id="llop-index" value="1" min="0"></label>
      <button type="button" class="viz-btn" id="llop-head">Insert at Head</button>
      <button type="button" class="viz-btn" id="llop-tail">Insert at Tail</button>
      <button type="button" class="viz-btn" id="llop-after">Insert After Index</button>
      <button type="button" class="viz-btn" id="llop-delete">Delete at Index</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="llop-reset">Reset</button>
    </div>
    <div class="ll-row" id="llop-chain"></div>
    <div class="viz-meta"><span class="viz-badge" id="llop-complexity">Pick an operation</span></div>
    <div class="viz-log" id="llop-log"></div>
  `;

  const chainEl = root.querySelector("#llop-chain");
  const valueInput = root.querySelector("#llop-value");
  const indexInput = root.querySelector("#llop-index");
  const complexityEl = root.querySelector("#llop-complexity");
  const logEl = root.querySelector("#llop-log");

  function render(activeIndex) {
    if (values.length === 0) {
      renderLLChain(chainEl, [], null);
      return;
    }
    renderLLChain(chainEl, values, activeIndex === undefined ? null : { active: activeIndex });
  }

  function addLog(text) {
    const line = document.createElement("div");
    line.textContent = text;
    logEl.prepend(line);
  }

  function clampIndex(i) {
    if (Number.isNaN(i)) return 0;
    return Math.max(0, Math.min(values.length - 1, i));
  }

  root.querySelector("#llop-head").addEventListener("click", () => {
    const v = Number(valueInput.value) || 0;
    values.unshift(v);
    render(0);
    complexityEl.textContent = "Insert at head — O(1): new node's next = old head, head = new node";
    addLog(`Insert ${v} at head`);
  });

  root.querySelector("#llop-tail").addEventListener("click", () => {
    const v = Number(valueInput.value) || 0;
    values.push(v);
    render(values.length - 1);
    complexityEl.textContent = `Insert at tail — O(n): walked ${values.length - 1} node(s) to find the end (no tail pointer)`;
    addLog(`Insert ${v} at tail`);
  });

  root.querySelector("#llop-after").addEventListener("click", () => {
    if (values.length === 0) return;
    const i = clampIndex(Number(indexInput.value));
    const v = Number(valueInput.value) || 0;
    values.splice(i + 1, 0, v);
    render(i + 1);
    complexityEl.textContent = `Insert after index ${i} — O(1) to link once there, O(n) to walk ${i} node(s) first`;
    addLog(`Insert ${v} after index ${i}`);
  });

  root.querySelector("#llop-delete").addEventListener("click", () => {
    if (values.length === 0) return;
    const i = clampIndex(Number(indexInput.value));
    const removed = values[i];
    values.splice(i, 1);
    render(values.length ? Math.min(i, values.length - 1) : undefined);
    complexityEl.textContent = i === 0
      ? "Delete at head — O(1): head = head.next"
      : `Delete at index ${i} — O(1) to unlink once there, O(n) to walk ${i} node(s) first`;
    addLog(`Delete index ${i} (was ${removed})`);
  });

  root.querySelector("#llop-reset").addEventListener("click", () => {
    values = initial.slice();
    render();
    complexityEl.textContent = "Pick an operation";
    logEl.innerHTML = "";
  });

  render();
}

// --- Submodule 3: array vs. linked list, insert at front, side by side ----------
function initLLVsArrayViz(root) {
  const startValues = [10, 4, 17, 8, 23];
  let arr = startValues.slice();
  let ll = startValues.slice();

  root.innerHTML = `
    <div class="viz-controls">
      <label>Value <input type="number" id="cmp-value" value="99"></label>
      <button type="button" class="viz-btn" id="cmp-run">Insert at Front (both)</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="cmp-reset">Reset</button>
    </div>
    <div class="race-label">Array — insert at index 0</div>
    <div class="viz-row" id="cmp-arr-boxes"></div>
    <div class="viz-meta"><span class="viz-badge" id="cmp-arr-complexity">—</span></div>
    <div class="race-label" style="margin-top:1rem;">Linked List — insert at head</div>
    <div class="ll-row" id="cmp-ll-chain"></div>
    <div class="viz-meta"><span class="viz-badge" id="cmp-ll-complexity">—</span></div>
  `;

  const arrBoxesEl = root.querySelector("#cmp-arr-boxes");
  const llChainEl = root.querySelector("#cmp-ll-chain");
  const arrBadge = root.querySelector("#cmp-arr-complexity");
  const llBadge = root.querySelector("#cmp-ll-complexity");
  const valueInput = root.querySelector("#cmp-value");

  function renderArr(highlightAll) {
    arrBoxesEl.innerHTML = "";
    arr.forEach((v, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (highlightAll ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${v}</span><span class="viz-box__idx">${i}</span>`;
      arrBoxesEl.appendChild(box);
    });
  }

  root.querySelector("#cmp-run").addEventListener("click", () => {
    const v = Number(valueInput.value) || 0;
    const movedCount = arr.length;
    arr.unshift(v);
    renderArr(true);
    arrBadge.textContent = `O(n) — every existing element (${movedCount}) shifted right one slot`;

    ll.unshift(v);
    renderLLChain(llChainEl, ll, { active: 0 });
    llBadge.textContent = "O(1) — only the head pointer changed, no other node touched";
  });

  root.querySelector("#cmp-reset").addEventListener("click", () => {
    arr = startValues.slice();
    ll = startValues.slice();
    renderArr(false);
    renderLLChain(llChainEl, ll, null);
    arrBadge.textContent = "—";
    llBadge.textContent = "—";
  });

  renderArr(false);
  renderLLChain(llChainEl, ll, null);
}

// --- Submodule 4: traversal & search — no shortcuts, no binary search -----------
function initLLSearchViz(root) {
  const values = [10, 4, 17, 8, 23, 15];
  let steps = [];
  let stepIndex = -1;
  let playTimer = null;

  root.innerHTML = `
    <div class="viz-controls">
      <label>Target <input type="number" id="lls-target" value="8"></label>
      <button type="button" class="viz-btn" id="lls-run">Search</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="lls-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="lls-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="lls-reset">Reset</button>
    </div>
    <div class="ll-row" id="lls-chain"></div>
    <div class="viz-log" id="lls-log"></div>
  `;

  const chainEl = root.querySelector("#lls-chain");
  const targetInput = root.querySelector("#lls-target");
  const logEl = root.querySelector("#lls-log");

  function build(target) {
    const s = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === target) {
        s.push({ active: i, found: i, message: `current → node(value=${values[i]}) = ${target} → found!` });
        return s;
      }
      s.push({ active: i, message: `current → node(value=${values[i]}) ≠ ${target}, move to current.next` });
    }
    s.push({ notFound: true, message: `current → None — ${target} is not in the list` });
    return s;
  }

  function renderPlain() {
    renderLLChain(chainEl, values, null);
  }

  function render() {
    const cur = steps[stepIndex];
    renderLLChain(chainEl, values, cur && !cur.notFound ? cur : null);
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

  root.querySelector("#lls-run").addEventListener("click", run);
  root.querySelector("#lls-step").addEventListener("click", () => { if (!steps.length) run(); step(); });
  root.querySelector("#lls-play").addEventListener("click", () => {
    if (!steps.length) run();
    stopPlay();
    playTimer = setInterval(step, 600);
  });
  root.querySelector("#lls-reset").addEventListener("click", () => {
    stopPlay(); steps = []; stepIndex = -1; logEl.innerHTML = ""; renderPlain();
  });

  renderPlain();
}
