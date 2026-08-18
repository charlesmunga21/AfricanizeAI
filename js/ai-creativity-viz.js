// Interactive visual models for the AI for Creativity module.

// --- Submodule 1: writing — prompt specificity vs. output quality ---------------
function initPromptIterationViz(root) {
  const outputsByLevel = [
    ["Coffee shop.", "Good coffee here.", "Visit our shop."],
    ["Great coffee for busy people.", "Coffee made for professionals.", "Coffee to fuel your day."],
    ["Nairobi's own small-batch coffee, made for the 9-to-5.", "Kenyan beans, roasted fresh, for people on the move.", "Your local coffee, your daily edge."],
    ["Single-origin Kenyan beans, roasted in Nairobi, for people building something.", "Fresh-roasted, Nairobi-grown, made for your next big idea.", "Real Kenyan coffee for Nairobi's next generation of builders."],
    ["Nairobi-roasted. Kenyan-grown. Built for hustle.", "Your beans. Your city. Your grind.", "Kenyan roast, Nairobi pace, your morning edge."],
  ];
  const constraints = [
    { id: "audience", label: 'Specify the audience ("for young professionals")' },
    { id: "detail", label: 'Specify product detail ("single-origin Kenyan beans")' },
    { id: "tone", label: 'Specify a tone ("playful", "minimal")' },
    { id: "length", label: 'Set a length limit ("under 8 words")' },
  ];

  root.innerHTML = `
    <div class="viz-controls" id="pi-checks"></div>
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="pi-generate">Generate Taglines</button>
    </div>
    <div class="viz-meta" id="pi-badge"></div>
    <div class="viz-log" id="pi-outputs"></div>
  `;

  const checksEl = root.querySelector("#pi-checks");
  const badgeEl = root.querySelector("#pi-badge");
  const outputsEl = root.querySelector("#pi-outputs");

  constraints.forEach((c) => {
    const label = document.createElement("label");
    label.style.flexDirection = "row";
    label.style.alignItems = "center";
    label.style.gap = "0.4rem";
    label.innerHTML = `<input type="checkbox" data-id="${c.id}"> ${c.label}`;
    checksEl.appendChild(label);
  });

  function generate() {
    const checked = checksEl.querySelectorAll("input:checked").length;
    badgeEl.innerHTML = `<span class="viz-badge">Specificity: ${checked}/4 constraints</span>`;
    outputsEl.innerHTML = outputsByLevel[checked].map((o) => `<div>"${o}"</div>`).join("");
  }

  checksEl.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", generate));
  root.querySelector("#pi-generate").addEventListener("click", generate);

  generate();
}

// --- Submodule 2: visual art — step-through denoising ---------------------------
function initDiffusionViz(root) {
  const size = 8;
  const target = [
    [0, 1, 1, 0, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const totalCells = size * size;
  const totalSteps = 8;
  let step = 0;
  let noise = [];
  let revealOrder = [];

  function shuffledOrder() {
    const order = Array.from({ length: totalCells }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  function randomizeNoise() {
    noise = Array.from({ length: totalCells }, () => (Math.random() > 0.5 ? 1 : 0));
    revealOrder = shuffledOrder();
  }

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="dn-step">Denoise Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="dn-reset">Start Over (New Noise)</button>
    </div>
    <div class="viz-meta"><span class="viz-badge" id="dn-badge"></span></div>
    <div class="grid-2d" id="dn-grid" style="--cols:${size}; max-width:16rem;"></div>
  `;

  const gridEl = root.querySelector("#dn-grid");
  const badgeEl = root.querySelector("#dn-badge");

  function render() {
    gridEl.innerHTML = "";
    const revealedCount = Math.round((step / totalSteps) * totalCells);
    const revealed = new Set(revealOrder.slice(0, revealedCount));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const value = revealed.has(idx) ? target[r][c] : noise[idx];
        const cell = document.createElement("div");
        cell.className = "grid-2d__cell";
        cell.style.background = value ? "#1c1c1c" : "#fff";
        gridEl.appendChild(cell);
      }
    }
    badgeEl.textContent = step === 0
      ? `Step 0 / ${totalSteps} — pure noise`
      : step === totalSteps
        ? `Step ${totalSteps} / ${totalSteps} — fully denoised`
        : `Step ${step} / ${totalSteps} — ${revealedCount}/${totalCells} cells resolved`;
  }

  root.querySelector("#dn-step").addEventListener("click", () => {
    if (step < totalSteps) step++;
    render();
  });
  root.querySelector("#dn-reset").addEventListener("click", () => {
    step = 0;
    randomizeNoise();
    render();
  });

  randomizeNoise();
  render();
}

// --- Submodule 3: music — mood-based chord progression generator ----------------
function initChordViz(root) {
  const moodChords = {
    Happy: [["C", "G", "Am", "F"], ["G", "D", "Em", "C"], ["D", "A", "Bm", "G"]],
    Sad: [["Am", "F", "C", "G"], ["Em", "C", "G", "D"], ["Dm", "Bb", "F", "C"]],
    Tense: [["Em", "C", "D", "Em"], ["Am", "F", "E", "Am"], ["Dm", "Bb", "A", "Dm"]],
    Chill: [["Cmaj7", "Am7", "Dm7", "G7"], ["Fmaj7", "Em7", "Am7", "G"], ["Dm7", "G7", "Cmaj7", "Am7"]],
  };
  let mood = "Happy";
  let index = 0;

  root.innerHTML = `
    <div class="viz-controls">
      ${Object.keys(moodChords).map((m) => `<button type="button" class="viz-btn" data-mood="${m}">${m}</button>`).join("")}
      <button type="button" class="viz-btn viz-btn--ghost" id="ch-regen">Regenerate</button>
    </div>
    <div class="viz-row" id="ch-chords"></div>
    <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">A starting point to react to, not a finished song — change the mood or regenerate for a different progression.</p>
  `;

  const chordsEl = root.querySelector("#ch-chords");

  function render() {
    const pool = moodChords[mood];
    const progression = pool[index % pool.length];
    chordsEl.innerHTML = "";
    progression.forEach((chord) => {
      const box = document.createElement("div");
      box.className = "viz-box";
      box.innerHTML = `<span class="viz-box__val">${chord}</span>`;
      chordsEl.appendChild(box);
    });
  }

  root.querySelectorAll("[data-mood]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mood = btn.dataset.mood;
      index = 0;
      render();
    });
  });
  root.querySelector("#ch-regen").addEventListener("click", () => {
    index++;
    render();
  });

  render();
}

// --- Submodule 4: where human judgment matters — pick-your-favorite -------------
function initTasteViz(root) {
  const options = [
    "Nairobi-roasted. Kenyan-grown. Built for hustle.",
    "Your local coffee, your daily edge.",
    "Real Kenyan coffee for Nairobi's next generation of builders.",
    "Kenyan roast, Nairobi pace, your morning edge.",
  ];

  root.innerHTML = `
    <p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 0.75rem;">These are four different outputs from the same well-specified prompt. Pick the one you'd actually ship.</p>
    <div class="viz-options" id="taste-options"></div>
    <div class="viz-meta" id="taste-result" style="margin-top:0.75rem;"></div>
  `;

  const optionsEl = root.querySelector("#taste-options");
  const resultEl = root.querySelector("#taste-result");

  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option";
    btn.textContent = `"${opt}"`;
    btn.addEventListener("click", () => {
      optionsEl.querySelectorAll("button").forEach((b) => b.classList.remove("correct"));
      btn.classList.add("correct");
      resultEl.innerHTML = `<span class="viz-badge">You picked option ${i + 1}.</span> Someone else reviewing the same four options might genuinely pick a different one — and there's no automated check that says either of you is wrong. That call is exactly the judgment a model can't make for itself.`;
    });
    optionsEl.appendChild(btn);
  });
}
