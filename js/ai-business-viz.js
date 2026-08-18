// Interactive visual models for the AI for Business module.

// --- Submodule 1: prediction & forecasting — live linear regression -------------
function initRegressionViz(root) {
  const initial = [120, 135, 150, 170, 190, 205];
  let values = initial.slice();

  root.innerHTML = `
    <div class="viz-controls" id="reg-inputs"></div>
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="reg-fit">Fit &amp; Predict Month 7</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="reg-reset">Reset</button>
    </div>
    <svg id="reg-chart" class="viz-chart" viewBox="0 0 340 200"></svg>
    <div class="viz-formula" id="reg-formula">Click "Fit &amp; Predict" to compute the regression line.</div>
  `;

  const inputsEl = root.querySelector("#reg-inputs");
  const svgEl = root.querySelector("#reg-chart");
  const formulaEl = root.querySelector("#reg-formula");

  function renderInputs() {
    inputsEl.innerHTML = "";
    values.forEach((v, i) => {
      const label = document.createElement("label");
      label.innerHTML = `Month ${i + 1} <input type="number" value="${v}" data-i="${i}">`;
      inputsEl.appendChild(label);
    });
    inputsEl.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        values[Number(e.target.dataset.i)] = Number(e.target.value) || 0;
      });
    });
  }

  function fit() {
    const n = values.length;
    const xs = values.map((_, i) => i + 1);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (values[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    const predicted = slope * 7 + intercept;
    draw(xs, values, slope, intercept);
    formulaEl.textContent = `y = ${slope.toFixed(1)}x + ${intercept.toFixed(1)} → predicted month 7: ${predicted.toFixed(0)} units`;
  }

  function draw(xs, ys, slope, intercept) {
    const allY = ys.concat([slope * 7 + intercept]);
    const minY = Math.min(...allY) - 10;
    const maxY = Math.max(...allY) + 10;
    const toX = (x) => 30 + ((x - 1) / 6) * 290;
    const toY = (y) => 180 - ((y - minY) / (maxY - minY)) * 160;

    let svg = "";
    svg += `<line x1="30" y1="180" x2="320" y2="180" stroke="#e2e2e2" />`;
    svg += `<line x1="30" y1="20" x2="30" y2="180" stroke="#e2e2e2" />`;
    const x1 = toX(1), y1 = toY(slope * 1 + intercept);
    const x2 = toX(7), y2 = toY(slope * 7 + intercept);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2f8d46" stroke-width="2" />`;
    svg += `<circle cx="${toX(7)}" cy="${toY(slope * 7 + intercept)}" r="5" fill="#e08a2b" />`;
    xs.forEach((x, i) => {
      svg += `<circle cx="${toX(x)}" cy="${toY(ys[i])}" r="4" fill="#1c1c1c" />`;
    });
    svgEl.innerHTML = svg;
  }

  root.querySelector("#reg-fit").addEventListener("click", fit);
  root.querySelector("#reg-reset").addEventListener("click", () => {
    values = initial.slice();
    renderInputs();
    fit();
  });

  renderInputs();
  fit();
}

// --- Submodule 2: automating decisions — flag-threshold simulator ---------------
function initThresholdViz(root) {
  const data = [
    { score: 5, fraud: false }, { score: 12, fraud: false }, { score: 20, fraud: false },
    { score: 35, fraud: false }, { score: 40, fraud: true }, { score: 48, fraud: false },
    { score: 55, fraud: true }, { score: 60, fraud: false }, { score: 68, fraud: true },
    { score: 75, fraud: true }, { score: 85, fraud: true }, { score: 95, fraud: true },
  ];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Auto-flag threshold: <span id="th-value">50</span>
        <input type="range" id="th-slider" min="0" max="100" value="50">
      </label>
    </div>
    <div class="viz-row" id="th-chips"></div>
    <div class="viz-meta" id="th-stats"></div>
  `;

  const chipsEl = root.querySelector("#th-chips");
  const statsEl = root.querySelector("#th-stats");
  const slider = root.querySelector("#th-slider");
  const valueLabel = root.querySelector("#th-value");

  function render() {
    const t = Number(slider.value);
    valueLabel.textContent = t;
    chipsEl.innerHTML = "";
    let tp = 0, fp = 0, tn = 0, fn = 0;
    data.forEach((d) => {
      const flagged = d.score >= t;
      const correct = flagged === d.fraud;
      if (flagged && d.fraud) tp++;
      if (flagged && !d.fraud) fp++;
      if (!flagged && !d.fraud) tn++;
      if (!flagged && d.fraud) fn++;
      const box = document.createElement("div");
      box.className = "viz-box" + (correct ? "" : " is-candidate");
      box.innerHTML = `<span class="viz-box__val">${d.score}</span><span class="viz-box__idx">${flagged ? "flag" : "ok"}</span>`;
      chipsEl.appendChild(box);
    });
    const accuracy = Math.round(((tp + tn) / data.length) * 100);
    statsEl.innerHTML = `
      <span class="viz-badge">Correct: ${tp + tn}/${data.length} (${accuracy}%)</span>
      <span class="viz-badge viz-badge--danger">False alarms: ${fp}</span>
      <span class="viz-badge viz-badge--danger">Missed fraud: ${fn}</span>
    `;
  }

  slider.addEventListener("input", render);
  render();
}

// --- Submodule 3: unstructured data — keyword-based ticket classifier -----------
function initTicketClassifierViz(root) {
  const categories = {
    billing: ["invoice", "charge", "refund", "payment", "bill"],
    technical: ["bug", "error", "crash", "broken", "not working", "slow"],
    account: ["password", "login", "account", "access", "locked"],
  };
  const examples = [
    "I was charged twice on my last invoice, please refund the extra amount.",
    "The app keeps crashing every time I try to upload a photo.",
    "I can't log in, it says my account is locked.",
    "What's the weather like in Nairobi today?",
  ];

  root.innerHTML = `
    <div class="viz-controls">
      <label style="flex:1 1 100%;">Support ticket text
        <input type="text" id="tk-input" value="${examples[0]}" style="width:100%;">
      </label>
    </div>
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="tk-classify">Classify</button>
      ${examples.map((_, i) => `<button type="button" class="viz-btn viz-btn--ghost" data-example="${i}">Example ${i + 1}</button>`).join("")}
    </div>
    <div class="viz-meta" id="tk-result"></div>
  `;

  const input = root.querySelector("#tk-input");
  const resultEl = root.querySelector("#tk-result");

  function classify() {
    const text = input.value.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      const hit = keywords.find((k) => text.includes(k));
      if (hit) {
        resultEl.innerHTML = `<span class="viz-badge">Predicted: ${category}</span><span style="color:var(--text-muted);font-size:0.85rem;">matched keyword "${hit}"</span>`;
        return;
      }
    }
    resultEl.innerHTML = `<span class="viz-badge viz-badge--neutral">No keyword match — route to a human</span>`;
  }

  root.querySelector("#tk-classify").addEventListener("click", classify);
  root.querySelectorAll("[data-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = examples[Number(btn.dataset.example)];
      classify();
    });
  });

  classify();
}

// --- Submodule 4: personalization — co-occurrence recommender -------------------
function initRecommenderViz(root) {
  const products = ["Bread", "Milk", "Eggs", "Coffee", "Tea", "Sugar", "Butter"];
  const coOccurrence = {
    Bread: ["Butter", "Eggs"],
    Milk: ["Eggs", "Bread"],
    Eggs: ["Bread", "Butter"],
    Coffee: ["Sugar", "Milk"],
    Tea: ["Sugar", "Milk"],
    Sugar: ["Coffee", "Tea"],
    Butter: ["Bread"],
  };
  const defaultChecked = ["Bread", "Eggs"];

  root.innerHTML = `
    <div class="viz-controls" id="rec-checks"></div>
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="rec-run">Get Recommendations</button>
    </div>
    <div class="viz-meta" id="rec-result"></div>
  `;

  const checksEl = root.querySelector("#rec-checks");
  const resultEl = root.querySelector("#rec-result");

  products.forEach((p) => {
    const label = document.createElement("label");
    label.style.flexDirection = "row";
    label.style.alignItems = "center";
    label.style.gap = "0.35rem";
    label.innerHTML = `<input type="checkbox" value="${p}" ${defaultChecked.includes(p) ? "checked" : ""}> ${p}`;
    checksEl.appendChild(label);
  });

  function run() {
    const cart = Array.from(checksEl.querySelectorAll("input:checked")).map((c) => c.value);
    const scores = {};
    cart.forEach((item) => {
      (coOccurrence[item] || []).forEach((rec) => {
        if (!cart.includes(rec)) scores[rec] = (scores[rec] || 0) + 1;
      });
    });
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([name]) => name);
    resultEl.innerHTML = cart.length === 0
      ? `<span class="viz-badge viz-badge--neutral">Select at least one item</span>`
      : ranked.length
        ? `<span class="viz-badge">Recommended for this cart: ${ranked.join(", ")}</span>`
        : `<span class="viz-badge viz-badge--neutral">No strong recommendation for this combination</span>`;
  }

  root.querySelector("#rec-run").addEventListener("click", run);
  run();
}
