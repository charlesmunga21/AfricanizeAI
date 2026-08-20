// Interactive visual models for the "How Computers Work" module. Plain DOM + CSS,
// matching the rest of the site — no canvas, no build step.

// --- Submodule 1: computer parts flow (input -> CPU -> RAM -> disk -> output) ---
function initComputerFlowViz(root) {
  const parts = [
    { key: "input", label: "Input", desc: "Input devices — keyboard, mouse, camera, touch screen — turn what you do into signals the computer can work with." },
    { key: "cpu", label: "CPU", desc: "The CPU is where the actual computing happens. It runs a program's instructions one tiny step at a time — just unbelievably fast. It has a hidden helper tucked right onto its own chip: the cache. More on that next." },
    { key: "ram", label: "RAM", desc: "RAM is fast working memory. While a program runs, its data lives here so the CPU can reach it quickly — but it's wiped clean the instant the power goes off." },
    { key: "disk", label: "Disk", desc: "Disk (SSD or HDD) is where everything is kept permanently — your files, installed apps, and every database on the machine — even with no power at all." },
    { key: "output", label: "Output", desc: "Output devices — a screen, speakers, a saved file — turn the result back into something you can see, hear, or reuse." },
  ];
  let selected = "cpu";

  root.innerHTML = `
    <div class="ll-row" id="cf-row"></div>
    <div class="viz-formula" id="cf-desc"></div>
  `;
  const rowEl = root.querySelector("#cf-row");
  const descEl = root.querySelector("#cf-desc");

  function render() {
    rowEl.innerHTML = "";
    parts.forEach((p, i) => {
      const box = document.createElement("button");
      box.type = "button";
      box.className = "viz-box" + (p.key === selected ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${p.label}</span>`;
      box.addEventListener("click", () => { selected = p.key; render(); });
      rowEl.appendChild(box);
      if (i < parts.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "ll-arrow";
        arrow.textContent = "→";
        rowEl.appendChild(arrow);
      }
    });
    descEl.textContent = parts.find((p) => p.key === selected).desc;
  }
  render();
}

// --- Submodule 2: CPU fetch-decode-execute-store cycle -------------------------
function initCpuCycleViz(root) {
  const stages = [
    { label: "Fetch", msg: "Fetch: the CPU grabs the next instruction from memory." },
    { label: "Decode", msg: "Decode: it figures out what that instruction means — e.g. “add these two numbers.”" },
    { label: "Execute", msg: "Execute: it actually does it — adds, compares, moves data, whatever the instruction says." },
    { label: "Store", msg: "Store: the result is written back — to a tiny slot inside the CPU, or out to memory." },
  ];
  let stage = 0;
  let cycles = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="cy-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="cy-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="cy-stop">Stop</button>
    </div>
    <div class="viz-row" id="cy-boxes"></div>
    <div class="viz-meta"><span class="viz-badge" id="cy-count">Instructions completed: 0</span></div>
    <div class="viz-log" id="cy-log"></div>
  `;
  const boxesEl = root.querySelector("#cy-boxes");
  const countEl = root.querySelector("#cy-count");
  const logEl = root.querySelector("#cy-log");

  function render() {
    boxesEl.innerHTML = "";
    stages.forEach((s, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (i === stage ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${s.label}</span>`;
      boxesEl.appendChild(box);
    });
  }
  function addLog(text) {
    log.unshift(text);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function step() {
    addLog(stages[stage].msg);
    if (stage === stages.length - 1) {
      cycles++;
      countEl.textContent = `Instructions completed: ${cycles}`;
    }
    stage = (stage + 1) % stages.length;
    render();
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }
  root.querySelector("#cy-step").addEventListener("click", step);
  root.querySelector("#cy-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(step, 600);
  });
  root.querySelector("#cy-stop").addEventListener("click", stopPlay);

  render();
}

// --- Submodule 3: cache/RAM/SSD/disk latency comparison -------------------------
function initLatencyViz(root) {
  const tiers = [
    { label: "CPU Cache (L1)", ns: 0.5, human: "1 second", fill: "" },
    { label: "RAM", ns: 100, human: "≈ 3 minutes", fill: "race-bar__fill--binary" },
    { label: "SSD (flash disk)", ns: 150000, human: "≈ 6 days", fill: "race-bar__fill--amber" },
    { label: "Hard disk (spinning, a seek)", ns: 10000000, human: "≈ 10 months", fill: "race-bar__fill--danger" },
  ];
  const maxLog = Math.log10(tiers[tiers.length - 1].ns + 1);
  let humanMode = false;

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn viz-btn--ghost" id="lat-toggle">Switch to human-scale time →</button>
    </div>
    <div class="race-row" id="lat-rows"></div>
  `;
  const rowsEl = root.querySelector("#lat-rows");
  const toggleBtn = root.querySelector("#lat-toggle");

  function fmtNs(ns) {
    if (ns < 1000) return `${ns} ns`;
    if (ns < 1000000) return `${(ns / 1000).toFixed(0)} µs`;
    return `${(ns / 1000000).toFixed(0)} ms`;
  }

  function render() {
    rowsEl.innerHTML = "";
    tiers.forEach((t) => {
      const pct = Math.max(4, (Math.log10(t.ns + 1) / maxLog) * 100);
      const row = document.createElement("div");
      row.innerHTML = `
        <div class="race-label">${t.label}</div>
        <div class="race-bar"><div class="race-bar__fill ${t.fill}" style="width:${pct}%"></div></div>
        <div class="race-count">${humanMode ? `if the CPU cache took 1 second, this would take ${t.human}` : `≈ ${fmtNs(t.ns)} to fetch data from here`}</div>
      `;
      rowsEl.appendChild(row);
    });
  }
  toggleBtn.addEventListener("click", () => {
    humanMode = !humanMode;
    toggleBtn.textContent = humanMode ? "← Back to real time (nanoseconds)" : "Switch to human-scale time →";
    render();
  });
  render();
}

// --- Submodule 4: RAM slots — capacity limits, eviction, volatility on power-off
function initRamViz(root) {
  const capacity = 4;
  const programs = ["Browser", "Music Player", "Camera App", "Photo Editor", "Spreadsheet", "Video Game"];
  let slots = [];
  let poweredOn = true;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls" id="ram-buttons"></div>
    <div class="viz-row" id="ram-slots"></div>
    <div class="viz-meta"><span class="viz-badge" id="ram-status"></span></div>
    <div class="viz-log" id="ram-log"></div>
  `;
  const btnsEl = root.querySelector("#ram-buttons");
  const slotsEl = root.querySelector("#ram-slots");
  const statusEl = root.querySelector("#ram-status");
  const logEl = root.querySelector("#ram-log");

  programs.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "viz-btn";
    b.textContent = `Open ${p}`;
    b.addEventListener("click", () => openProgram(p));
    btnsEl.appendChild(b);
  });
  const powerBtn = document.createElement("button");
  powerBtn.type = "button";
  powerBtn.className = "viz-btn viz-btn--ghost";
  powerBtn.textContent = "Power Off";
  powerBtn.addEventListener("click", togglePower);
  btnsEl.appendChild(powerBtn);

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function openProgram(name) {
    if (!poweredOn) { addLog("The computer is off — turn it on first."); return; }
    if (slots.includes(name)) { addLog(`${name} is already open — reused instantly from RAM.`); return; }
    if (slots.length >= capacity) {
      const evicted = slots.shift();
      addLog(`RAM is full — ${evicted} gets closed to make room.`);
    }
    slots.push(name);
    addLog(`${name} loaded into RAM.`);
    render();
  }
  function togglePower() {
    poweredOn = !poweredOn;
    if (!poweredOn) {
      slots = [];
      addLog("Power off — RAM is wiped instantly. Anything unsaved is gone.");
      powerBtn.textContent = "Power On";
    } else {
      addLog("Power on — RAM starts empty again.");
      powerBtn.textContent = "Power Off";
    }
    render();
  }
  function render() {
    slotsEl.innerHTML = "";
    for (let i = 0; i < capacity; i++) {
      const box = document.createElement("div");
      box.className = "viz-box" + (slots[i] ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${slots[i] || "empty"}</span>`;
      slotsEl.appendChild(box);
    }
    statusEl.textContent = poweredOn
      ? `Powered on — ${capacity - slots.length} slot(s) free out of ${capacity}`
      : "Powered off — RAM is empty";
  }
  render();
}

// --- Submodule 5: RAM (volatile) vs disk (persistent) side by side --------------
function initDiskViz(root) {
  const ramCapacity = 2;
  let ram = [];
  let disk = [];
  let poweredOn = true;
  let programCount = 0;
  let fileCount = 0;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="dk-open">Open a Program → RAM</button>
      <button type="button" class="viz-btn" id="dk-save">Save a File → Disk</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="dk-power">Power Off</button>
    </div>
    <div class="viz-meta"><span class="viz-badge">RAM — volatile</span></div>
    <div class="viz-row" id="dk-ram"></div>
    <div class="viz-meta"><span class="viz-badge viz-badge--neutral">Disk — persistent</span></div>
    <div class="viz-row" id="dk-disk"></div>
    <div class="viz-log" id="dk-log"></div>
  `;
  const ramEl = root.querySelector("#dk-ram");
  const diskEl = root.querySelector("#dk-disk");
  const logEl = root.querySelector("#dk-log");
  const powerBtn = root.querySelector("#dk-power");

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function render() {
    ramEl.innerHTML = "";
    for (let i = 0; i < ramCapacity; i++) {
      const box = document.createElement("div");
      box.className = "viz-box" + (ram[i] ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${ram[i] || "empty"}</span>`;
      ramEl.appendChild(box);
    }
    diskEl.innerHTML = "";
    if (disk.length === 0) {
      const empty = document.createElement("div");
      empty.className = "viz-badge viz-badge--neutral";
      empty.textContent = "no files saved yet";
      diskEl.appendChild(empty);
    }
    disk.forEach((f) => {
      const box = document.createElement("div");
      box.className = "viz-box";
      box.innerHTML = `<span class="viz-box__val">${f}</span>`;
      diskEl.appendChild(box);
    });
  }
  root.querySelector("#dk-open").addEventListener("click", () => {
    if (!poweredOn) { addLog("The computer is off — turn it on first."); return; }
    programCount++;
    const name = `App ${programCount}`;
    if (ram.length >= ramCapacity) {
      const evicted = ram.shift();
      addLog(`RAM is full — ${evicted} gets closed to make room.`);
    }
    ram.push(name);
    addLog(`${name} loaded into RAM.`);
    render();
  });
  root.querySelector("#dk-save").addEventListener("click", () => {
    if (!poweredOn) { addLog("The computer is off — turn it on first."); return; }
    fileCount++;
    const name = `file-${fileCount}.db`;
    disk.push(name);
    addLog(`${name} written to disk — it will survive a restart.`);
    render();
  });
  powerBtn.addEventListener("click", () => {
    poweredOn = !poweredOn;
    if (!poweredOn) {
      ram = [];
      addLog("Power off — RAM is wiped instantly. Disk is completely untouched.");
      powerBtn.textContent = "Power On";
    } else {
      addLog("Power on — RAM starts empty again. Every saved file is still on disk, right where it was.");
      powerBtn.textContent = "Power Off";
    }
    render();
  });
  render();
}

// --- Submodule 6: a query's path through cache/RAM and disk, SQLite vs Postgres -
function initDbQueryViz(root) {
  const rows = Array.from({ length: 8 }, (_, i) => `row ${i + 1}`);
  const cacheCapacity = 3;
  let cache = [];
  let mode = "sqlite";
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Engine
        <select id="db-mode">
          <option value="sqlite">SQLite</option>
          <option value="postgres">Postgres</option>
        </select>
      </label>
      <label>Row <input type="number" id="db-row" value="3" min="1" max="${rows.length}"></label>
      <button type="button" class="viz-btn" id="db-read">Run Query (read)</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="db-write">Write Row (update)</button>
    </div>
    <div class="viz-meta"><span class="viz-badge" id="db-cache-label"></span></div>
    <div class="viz-row" id="db-cache-boxes"></div>
    <div class="viz-meta"><span class="viz-badge viz-badge--neutral">Disk — the real data file</span></div>
    <div class="viz-row" id="db-disk-boxes"></div>
    <div class="viz-log" id="db-log"></div>
  `;

  const modeSel = root.querySelector("#db-mode");
  const rowInput = root.querySelector("#db-row");
  const cacheLabel = root.querySelector("#db-cache-label");
  const cacheBoxes = root.querySelector("#db-cache-boxes");
  const diskBoxes = root.querySelector("#db-disk-boxes");
  const logEl = root.querySelector("#db-log");

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 7).map((l) => `<div>${l}</div>`).join("");
  }
  function cacheName() {
    return mode === "sqlite" ? "SQLite’s page cache (inside your app’s own memory)" : "Postgres shared_buffers (inside the database server’s memory)";
  }
  function render(highlight) {
    cacheLabel.textContent = cacheName();
    cacheBoxes.innerHTML = "";
    for (let i = 0; i < cacheCapacity; i++) {
      const box = document.createElement("div");
      box.className = "viz-box" + (cache[i] ? " is-active" : "") + (highlight && cache[i] === highlight ? " is-found" : "");
      box.innerHTML = `<span class="viz-box__val">${cache[i] || "empty"}</span>`;
      cacheBoxes.appendChild(box);
    }
    diskBoxes.innerHTML = "";
    rows.forEach((r) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (highlight === r ? " is-found" : "");
      box.innerHTML = `<span class="viz-box__val">${r}</span>`;
      diskBoxes.appendChild(box);
    });
  }
  function readRow(name) {
    if (cache.includes(name)) {
      addLog(`Hit — ${name} was already cached in RAM. Read straight from there, ≈ 100 ns.`);
      render(name);
      return;
    }
    addLog(`Miss — ${name} isn’t cached. Reading it from disk instead, ≈ 150,000 ns — roughly 1,000× slower than RAM.`);
    if (cache.length >= cacheCapacity) {
      const evicted = cache.shift();
      addLog(`Cache is full — ${evicted} is evicted to make room for ${name}.`);
    }
    cache.push(name);
    addLog(`${name} is now cached in RAM — the next read of it will be fast.`);
    render(name);
  }
  function writeRow(name) {
    addLog(`Write: ${name}’s new value is appended to the WAL (write-ahead log) — one fast, sequential write to disk.`);
    if (!cache.includes(name)) {
      if (cache.length >= cacheCapacity) cache.shift();
      cache.push(name);
    }
    render(name);
    setTimeout(() => {
      addLog(`A little later, a checkpoint copies that change from the WAL into the real, organized data file.`);
    }, 500);
  }

  modeSel.addEventListener("change", () => { mode = modeSel.value; render(); });
  root.querySelector("#db-read").addEventListener("click", () => {
    const i = Math.min(rows.length, Math.max(1, Number(rowInput.value) || 1));
    readRow(rows[i - 1]);
  });
  root.querySelector("#db-write").addEventListener("click", () => {
    const i = Math.min(rows.length, Math.max(1, Number(rowInput.value) || 1));
    writeRow(rows[i - 1]);
  });

  render();
}
