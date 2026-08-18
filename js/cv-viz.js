// Interactive visual models for the Computer Vision Fundamentals module.

function cvHexToRgba(hex, alpha) {
  const v = hex.replace("#", "");
  const r = parseInt(v.substring(0, 2), 16);
  const g = parseInt(v.substring(2, 4), 16);
  const b = parseInt(v.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Submodule 1: images as data — editable pixel grid --------------------------
function initPixelGridViz(root) {
  const size = 6;
  let grid = makePattern();
  let showNumbers = true;

  function makePattern() {
    const g = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const dist = Math.abs(r - c);
        row.push(Math.max(0, 255 - dist * 60));
      }
      g.push(row);
    }
    return g;
  }

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="px-toggle">Hide Numbers</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="px-randomize">Randomize</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="px-reset">Reset</button>
    </div>
    <div class="grid-2d" id="px-grid" style="--cols:${size}"></div>
    <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">Click a cell to cycle its value. Darker = lower number, brighter = higher — this grid <em>is</em> the image.</p>
  `;

  const gridEl = root.querySelector("#px-grid");
  const toggleBtn = root.querySelector("#px-toggle");

  function render() {
    gridEl.innerHTML = "";
    grid.forEach((row, r) => {
      row.forEach((v, c) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "px-cell";
        cell.style.background = `rgb(${v}, ${v}, ${v})`;
        cell.style.color = v > 128 ? "#111" : "#eee";
        cell.textContent = showNumbers ? v : "";
        cell.addEventListener("click", () => {
          grid[r][c] = (v + 51) % 256;
          render();
        });
        gridEl.appendChild(cell);
      });
    });
  }

  toggleBtn.addEventListener("click", () => {
    showNumbers = !showNumbers;
    toggleBtn.textContent = showNumbers ? "Hide Numbers" : "Show Numbers";
    render();
  });
  root.querySelector("#px-randomize").addEventListener("click", () => {
    grid = grid.map((row) => row.map(() => Math.floor(Math.random() * 256)));
    render();
  });
  root.querySelector("#px-reset").addEventListener("click", () => {
    grid = makePattern();
    showNumbers = true;
    toggleBtn.textContent = "Hide Numbers";
    render();
  });

  render();
}

// --- Submodule 2: classification vs. detection vs. segmentation -----------------
function initTaskModesViz(root) {
  const shapes = [
    { label: "mango", color: "#e08a2b", shape: "circle", x: 40, y: 60, w: 90, h: 90 },
    { label: "leaf", color: "#2f8d46", shape: "rect", x: 190, y: 40, w: 120, h: 70 },
  ];
  let mode = "classification";

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="task-classification">Classification</button>
      <button type="button" class="viz-btn" id="task-detection">Detection</button>
      <button type="button" class="viz-btn" id="task-segmentation">Segmentation</button>
    </div>
    <div class="cv-scene" id="task-scene"></div>
    <p class="viz-badge" id="task-caption" style="margin-top:0.75rem; display:inline-block;"></p>
  `;

  const sceneEl = root.querySelector("#task-scene");
  const captionEl = root.querySelector("#task-caption");

  function render() {
    sceneEl.innerHTML = "";
    if (mode === "classification") {
      const chip = document.createElement("div");
      chip.className = "cv-chip";
      chip.textContent = "Label: mango + leaf";
      sceneEl.appendChild(chip);
    }
    shapes.forEach((s) => {
      const el = document.createElement("div");
      el.className = `cv-shape cv-shape--${s.shape}`;
      el.style.left = s.x + "px";
      el.style.top = s.y + "px";
      el.style.width = s.w + "px";
      el.style.height = s.h + "px";
      if (mode === "classification") {
        el.style.background = "rgba(0, 0, 0, 0.08)";
      } else if (mode === "detection") {
        el.style.background = "transparent";
        el.style.border = `2px solid ${s.color}`;
        const tag = document.createElement("span");
        tag.className = "cv-tag";
        tag.style.background = s.color;
        tag.textContent = s.label;
        el.appendChild(tag);
      } else {
        el.style.background = cvHexToRgba(s.color, 0.55);
        el.style.border = `1px solid ${s.color}`;
      }
      sceneEl.appendChild(el);
    });
    captionEl.textContent = {
      classification: "One label for the whole image — no location information.",
      detection: "A box + label per object — knows what and roughly where.",
      segmentation: "Every pixel classified — knows the exact shape/boundary of each object.",
    }[mode];
  }

  ["classification", "detection", "segmentation"].forEach((m) => {
    root.querySelector(`#task-${m}`).addEventListener("click", () => { mode = m; render(); });
  });

  render();
}

// --- Submodule 3: how convolution works — slide a kernel over an input ----------
function initConvolutionViz(root) {
  const input = [
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
  ];
  const kernel = [
    [-1, 0, 1],
    [-1, 0, 1],
    [-1, 0, 1],
  ];
  const outSize = input.length - kernel.length + 1;
  let steps = [];
  let stepIndex = -1;
  let playTimer = null;

  function build() {
    const s = [];
    for (let r = 0; r <= input.length - kernel.length; r++) {
      for (let c = 0; c <= input[0].length - kernel.length; c++) {
        let sum = 0;
        const terms = [];
        for (let kr = 0; kr < kernel.length; kr++) {
          for (let kc = 0; kc < kernel.length; kc++) {
            const iv = input[r + kr][c + kc];
            const kv = kernel[kr][kc];
            sum += iv * kv;
            terms.push(`${iv}×${kv}`);
          }
        }
        s.push({ r, c, sum, formula: `${terms.join(" + ")} = ${sum}` });
      }
    }
    return s;
  }

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="cv-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="cv-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="cv-reset">Reset</button>
    </div>
    <div class="conv-layout">
      <div>
        <div class="race-label">Input (5×5)</div>
        <div class="grid-2d" id="cv-input" style="--cols:5"></div>
      </div>
      <div>
        <div class="race-label">Kernel (3×3)</div>
        <div class="grid-2d" id="cv-kernel" style="--cols:3; max-width:9rem;"></div>
      </div>
      <div>
        <div class="race-label">Output feature map</div>
        <div class="grid-2d" id="cv-output" style="--cols:${outSize}; max-width:9rem;"></div>
      </div>
    </div>
    <div class="viz-formula" id="cv-formula">Click Step to start sliding the kernel.</div>
  `;

  const inputEl = root.querySelector("#cv-input");
  const kernelEl = root.querySelector("#cv-kernel");
  const outputEl = root.querySelector("#cv-output");
  const formulaEl = root.querySelector("#cv-formula");

  function renderKernel() {
    kernelEl.innerHTML = "";
    kernel.flat().forEach((v) => {
      const cell = document.createElement("div");
      cell.className = "grid-2d__cell";
      cell.innerHTML = `<span class="grid-2d__val">${v}</span>`;
      kernelEl.appendChild(cell);
    });
  }

  function render() {
    const cur = steps[stepIndex];

    inputEl.innerHTML = "";
    input.forEach((row, r) => {
      row.forEach((v, c) => {
        const underKernel = cur && r >= cur.r && r < cur.r + kernel.length && c >= cur.c && c < cur.c + kernel.length;
        const cell = document.createElement("div");
        cell.className = "grid-2d__cell" + (underKernel ? " is-active" : "");
        cell.innerHTML = `<span class="grid-2d__val">${v}</span>`;
        inputEl.appendChild(cell);
      });
    });

    outputEl.innerHTML = "";
    for (let r = 0; r < outSize; r++) {
      for (let c = 0; c < outSize; c++) {
        const done = steps.find((s) => s.r === r && s.c === c && steps.indexOf(s) <= stepIndex);
        const cell = document.createElement("div");
        cell.className = "grid-2d__cell" + (cur && cur.r === r && cur.c === c ? " is-active" : "");
        cell.innerHTML = `<span class="grid-2d__val">${done ? done.sum : ""}</span>`;
        outputEl.appendChild(cell);
      }
    }

    formulaEl.textContent = cur ? cur.formula : "Click Step to start sliding the kernel.";
  }

  function step() {
    if (stepIndex >= steps.length - 1) { stopPlay(); return; }
    stepIndex++;
    render();
  }
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

  root.querySelector("#cv-step").addEventListener("click", step);
  root.querySelector("#cv-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(step, 900);
  });
  root.querySelector("#cv-reset").addEventListener("click", () => {
    stopPlay();
    stepIndex = -1;
    render();
  });

  steps = build();
  renderKernel();
  render();
}

// --- Submodule 4: transfer learning — illustrative data-needed comparison -------
function initTransferViz(root) {
  root.innerHTML = `
    <div class="viz-controls">
      <label>Task similarity to natural photos (%) <input type="number" id="tf-similarity" value="70" min="0" max="100"></label>
      <button type="button" class="viz-btn" id="tf-run">Compare</button>
    </div>
    <div class="race-row">
      <div class="race-track">
        <div class="race-label">Training a CNN from scratch</div>
        <div class="race-bar"><div class="race-bar__fill race-bar__fill--linear" id="tf-scratch-fill"></div></div>
        <div class="race-count" id="tf-scratch-count">0 labeled images (illustrative)</div>
      </div>
      <div class="race-track">
        <div class="race-label">Fine-tuning a pretrained backbone</div>
        <div class="race-bar"><div class="race-bar__fill race-bar__fill--binary" id="tf-finetune-fill"></div></div>
        <div class="race-count" id="tf-finetune-count">0 labeled images (illustrative)</div>
      </div>
    </div>
  `;

  const similarityInput = root.querySelector("#tf-similarity");
  const scratchFill = root.querySelector("#tf-scratch-fill");
  const finetuneFill = root.querySelector("#tf-finetune-fill");
  const scratchCount = root.querySelector("#tf-scratch-count");
  const finetuneCount = root.querySelector("#tf-finetune-count");

  function animateCount(countEl, fillEl, total, durationMs) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const value = Math.round(total * t);
      countEl.textContent = `${value.toLocaleString()} labeled images (illustrative)`;
      fillEl.style.width = `${t * 100}%`;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  root.querySelector("#tf-run").addEventListener("click", () => {
    const similarity = Math.max(0, Math.min(100, Number(similarityInput.value) || 0));
    const scratchTotal = 1000000;
    const finetuneTotal = Math.max(200, Math.round(5000 - similarity * 45));
    animateCount(scratchCount, scratchFill, scratchTotal, 1800);
    animateCount(finetuneCount, finetuneFill, finetuneTotal, 1800);
  });
}
