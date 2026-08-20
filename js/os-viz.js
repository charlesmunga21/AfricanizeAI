// Interactive visual models for the "Operating Systems Basics" module. Plain DOM + CSS,
// matching the rest of the site — no canvas, no build step.

// --- Submodule 1: apps -> OS -> hardware ----------------------------------------
function initOsOverviewViz(root) {
  const parts = [
    { key: "apps", label: "Your Apps", desc: "Every program you open — a browser, a game, a database — asks the operating system for what it needs: CPU time, memory, files, network access." },
    { key: "os", label: "Operating System", desc: "The OS is a special program with extra privileges. It's the referee: it decides which app gets the CPU next, hands out slices of RAM, and controls access to disk and the network — so apps don't have to fight over the hardware directly, or step on each other." },
    { key: "hw", label: "Hardware", desc: "The CPU, RAM, disk, and network you met in the earlier modules — the actual physical machine every app is ultimately sharing." },
  ];
  let selected = "os";

  root.innerHTML = `
    <div class="ll-row" id="os-row"></div>
    <div class="viz-formula" id="os-desc"></div>
  `;
  const rowEl = root.querySelector("#os-row");
  const descEl = root.querySelector("#os-desc");

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

// --- Submodule 2: processes vs threads, Postgres vs MySQL, with a pooler -------
function initProcessThreadViz(root) {
  const poolSize = 5;
  let mode = "postgres";
  let pooler = false;
  let real = [];
  let queued = [];
  let nextId = 1;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Database
        <select id="pt-mode">
          <option value="postgres">Postgres (process-per-connection)</option>
          <option value="mysql">MySQL (thread-per-connection)</option>
        </select>
      </label>
      <label><input type="checkbox" id="pt-pooler"> Use a connection pooler</label>
      <button type="button" class="viz-btn" id="pt-connect">New Client Connects</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="pt-reset">Reset</button>
    </div>
    <div class="viz-meta"><span class="viz-badge" id="pt-label"></span></div>
    <div class="viz-row" id="pt-real"></div>
    <div class="viz-meta" id="pt-queue-meta" hidden><span class="viz-badge viz-badge--neutral">Waiting in the pooler's queue</span></div>
    <div class="viz-row" id="pt-queue"></div>
    <div class="viz-log" id="pt-log"></div>
  `;
  const modeSel = root.querySelector("#pt-mode");
  const poolerChk = root.querySelector("#pt-pooler");
  const labelEl = root.querySelector("#pt-label");
  const realEl = root.querySelector("#pt-real");
  const queueMeta = root.querySelector("#pt-queue-meta");
  const queueEl = root.querySelector("#pt-queue");
  const logEl = root.querySelector("#pt-log");

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function render() {
    labelEl.textContent = mode === "postgres"
      ? "Postgres: each connection gets its own OS process (≈ 5 µs to context-switch into)"
      : "MySQL: each connection gets a lightweight thread inside one mysqld process (≈ 1 µs to context-switch into)";
    realEl.innerHTML = "";
    real.forEach((c) => {
      const box = document.createElement("div");
      box.className = "viz-box";
      box.innerHTML = `<span class="viz-box__val">${mode === "postgres" ? "Process" : "Thread"}</span><span class="viz-box__idx">#${c.id}</span>`;
      realEl.appendChild(box);
    });
    queueMeta.hidden = !pooler;
    queueEl.innerHTML = "";
    if (pooler) {
      queued.forEach((c) => {
        const box = document.createElement("div");
        box.className = "viz-box is-dim";
        box.innerHTML = `<span class="viz-box__val">Client</span><span class="viz-box__idx">#${c.id}</span>`;
        queueEl.appendChild(box);
      });
    }
  }
  root.querySelector("#pt-connect").addEventListener("click", () => {
    const id = nextId++;
    if (pooler && real.length >= poolSize) {
      queued.push({ id });
      addLog(`Client #${id} connects — the pooler queues it and reuses one of its ${poolSize} real connections once one is free.`);
    } else {
      real.push({ id });
      addLog(mode === "postgres"
        ? `Client #${id} connects — a brand new OS process is spawned for it.`
        : `Client #${id} connects — a lightweight new thread is spawned inside mysqld.`);
    }
    render();
  });
  modeSel.addEventListener("change", () => {
    mode = modeSel.value;
    real = [];
    queued = [];
    nextId = 1;
    addLog(`Switched engine — starting fresh with ${mode === "postgres" ? "Postgres" : "MySQL"}.`);
    render();
  });
  poolerChk.addEventListener("change", () => { pooler = poolerChk.checked; render(); });
  root.querySelector("#pt-reset").addEventListener("click", () => {
    real = [];
    queued = [];
    nextId = 1;
    log.length = 0;
    logEl.innerHTML = "";
    render();
  });
  render();
}

// --- Submodule 3: round-robin scheduling, taking turns on the CPU --------------
function initSchedulerViz(root) {
  const procs = ["Browser", "Music Player", "Chat App", "Game"];
  let turn = 0;
  let round = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="sch-step">Next Turn</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="sch-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="sch-stop">Stop</button>
    </div>
    <div class="viz-row" id="sch-boxes"></div>
    <div class="viz-meta"><span class="viz-badge" id="sch-round">Round 0</span></div>
    <div class="viz-log" id="sch-log"></div>
  `;
  const boxesEl = root.querySelector("#sch-boxes");
  const roundEl = root.querySelector("#sch-round");
  const logEl = root.querySelector("#sch-log");

  function render() {
    boxesEl.innerHTML = "";
    procs.forEach((p, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (i === turn ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${p}</span>`;
      boxesEl.appendChild(box);
    });
  }
  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }
  function step() {
    addLog(`CPU gives ${procs[turn]} a short turn, then switches away.`);
    turn = (turn + 1) % procs.length;
    if (turn === 0) {
      round++;
      roundEl.textContent = `Round ${round}`;
    }
    render();
  }
  root.querySelector("#sch-step").addEventListener("click", step);
  root.querySelector("#sch-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(step, 500);
  });
  root.querySelector("#sch-stop").addEventListener("click", stopPlay);
  render();
}

// --- Submodule 4: virtual memory — every process gets its own illusion ---------
function initVirtualMemoryViz(root) {
  const procs = [
    { name: "Browser", slot: 1 },
    { name: "Music Player", slot: 4 },
    { name: "Game", slot: 2 },
  ];
  const ramSlots = 6;
  let selected = 0;

  root.innerHTML = `
    <div class="viz-controls" id="vm-buttons"></div>
    <div class="viz-meta"><span class="viz-badge viz-badge--neutral">What every process believes it sees: its own address 0x40</span></div>
    <div class="viz-meta"><span class="viz-badge">Real physical RAM</span></div>
    <div class="viz-row" id="vm-ram"></div>
    <div class="viz-formula" id="vm-formula"></div>
  `;
  const btnsEl = root.querySelector("#vm-buttons");
  const ramEl = root.querySelector("#vm-ram");
  const formulaEl = root.querySelector("#vm-formula");

  procs.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "viz-btn";
    b.textContent = p.name;
    b.addEventListener("click", () => { selected = i; render(); });
    btnsEl.appendChild(b);
  });

  function render() {
    [...btnsEl.children].forEach((b, i) => {
      b.className = "viz-btn" + (i === selected ? "" : " viz-btn--ghost");
    });
    ramEl.innerHTML = "";
    for (let i = 0; i < ramSlots; i++) {
      const box = document.createElement("div");
      const isMine = i === procs[selected].slot;
      box.className = "viz-box" + (isMine ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${isMine ? procs[selected].name : "—"}</span><span class="viz-box__idx">slot ${i}</span>`;
      ramEl.appendChild(box);
    }
    formulaEl.textContent = `${procs[selected].name} thinks it's using address 0x40 — the OS secretly maps that to real physical RAM slot ${procs[selected].slot}. Every other process uses that exact same "0x40" and gets mapped somewhere completely different — that's the illusion, and it's also what keeps one program from accidentally reading or corrupting another's memory.`;
  }
  render();
}

// --- Submodule 5: files as a lookup table over raw disk blocks -----------------
function initFileSystemViz(root) {
  const files = [
    { name: "notes.txt", blocks: [1] },
    { name: "photo.jpg", blocks: [3, 4, 7] },
    { name: "app.db", blocks: [0, 6] },
  ];
  const totalBlocks = 9;
  let selected = 1;

  root.innerHTML = `
    <div class="viz-controls" id="fs-buttons"></div>
    <div class="viz-meta"><span class="viz-badge viz-badge--neutral">Raw disk, divided into fixed-size blocks</span></div>
    <div class="viz-row" id="fs-blocks"></div>
    <div class="viz-formula" id="fs-formula"></div>
  `;
  const btnsEl = root.querySelector("#fs-buttons");
  const blocksEl = root.querySelector("#fs-blocks");
  const formulaEl = root.querySelector("#fs-formula");

  files.forEach((f, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "viz-btn";
    b.textContent = f.name;
    b.addEventListener("click", () => { selected = i; render(); });
    btnsEl.appendChild(b);
  });

  function render() {
    [...btnsEl.children].forEach((b, i) => {
      b.className = "viz-btn" + (i === selected ? "" : " viz-btn--ghost");
    });
    blocksEl.innerHTML = "";
    for (let i = 0; i < totalBlocks; i++) {
      const inFile = files[selected].blocks.includes(i);
      const box = document.createElement("div");
      box.className = "viz-box" + (inFile ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${inFile ? files[selected].name.split(".")[0] : "free"}</span><span class="viz-box__idx">block ${i}</span>`;
      blocksEl.appendChild(box);
    }
    formulaEl.textContent = `${files[selected].name} isn't stored in one neat chunk — it lives in block(s) ${files[selected].blocks.join(", ")}, wherever there happened to be free space. The file system keeps its own index of exactly which blocks belong to which file, so opening it instantly reassembles the right pieces in order.`;
  }
  render();
}

// --- Submodule 6: opening an app, start to finish -------------------------------
function initOpenAppViz(root) {
  const stages = [
    { label: "Find It", msg: "The OS looks up the app's files on disk, using the file system's index." },
    { label: "New Process", msg: "The OS creates a new process for it, with its own private (virtual) slice of memory." },
    { label: "Load In", msg: "The app's code is loaded from disk into that process's memory." },
    { label: "Get a Turn", msg: "The scheduler adds the new process to the rotation and gives it its first turn on the CPU." },
    { label: "Run", msg: "The CPU executes its instructions, leaning on cache and RAM to stay fast." },
    { label: "On Screen", msg: "Output reaches the screen — the app is now open and responsive." },
  ];
  let stage = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="oa-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="oa-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="oa-reset">Reset</button>
    </div>
    <div class="viz-row" id="oa-boxes"></div>
    <div class="viz-log" id="oa-log"></div>
  `;
  const boxesEl = root.querySelector("#oa-boxes");
  const logEl = root.querySelector("#oa-log");

  function render() {
    boxesEl.innerHTML = "";
    stages.forEach((s, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (i === stage ? " is-active" : i < stage ? " is-found" : "");
      box.innerHTML = `<span class="viz-box__val">${s.label}</span>`;
      boxesEl.appendChild(box);
    });
  }
  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }
  function step() {
    if (stage >= stages.length) return;
    addLog(stages[stage].msg);
    stage++;
    render();
    if (stage >= stages.length) stopPlay();
  }
  root.querySelector("#oa-step").addEventListener("click", step);
  root.querySelector("#oa-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(() => {
      if (stage >= stages.length) { stopPlay(); return; }
      step();
    }, 800);
  });
  root.querySelector("#oa-reset").addEventListener("click", () => {
    stopPlay();
    stage = 0;
    log.length = 0;
    logEl.innerHTML = "";
    render();
  });
  render();
}
