// Interactive visual models for the "Networking Basics" module. Plain DOM + CSS,
// matching the rest of the site — no canvas, no build step.

// --- Submodule 1: the basic chain a request travels through -------------------
function initNetworkOverviewViz(root) {
  const parts = [
    { key: "you", label: "Your Device", desc: "Your phone or laptop — the “client” asking for something, like a web page." },
    { key: "router", label: "Wi-Fi Router", desc: "Your home router is the first stop. It forwards your request out toward the wider internet." },
    { key: "isp", label: "ISP", desc: "Your Internet Service Provider — the company (a phone or cable company, usually) that connects your home network to everyone else's." },
    { key: "internet", label: "The Internet", desc: "Not one single network — really thousands of separately-run networks that all agree to pass each other's traffic along. That agreement is the whole trick behind “the internet”: a network of networks." },
    { key: "server", label: "A Server", desc: "A computer that's always on, waiting for requests like yours — a website, an app's backend, or a database server like the ones from the Databases submodule." },
  ];
  let selected = "internet";

  root.innerHTML = `
    <div class="ll-row" id="no-row"></div>
    <div class="viz-formula" id="no-desc"></div>
  `;
  const rowEl = root.querySelector("#no-row");
  const descEl = root.querySelector("#no-desc");

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

// --- Submodule 2: splitting a message into packets and reassembling it --------
function initPacketViz(root) {
  const defaultMsg = "NETWORKS ARE COOL";
  let received = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Message <input type="text" id="pk-msg" value="${defaultMsg}" maxlength="30"></label>
      <button type="button" class="viz-btn" id="pk-send">Split &amp; Send</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="pk-reassemble">Reassemble</button>
    </div>
    <div class="viz-meta"><span class="viz-badge viz-badge--neutral">Packets as they arrive (order isn't guaranteed)</span></div>
    <div class="viz-row" id="pk-boxes"></div>
    <div class="viz-meta"><span class="viz-badge">Reassembled message</span></div>
    <div class="viz-formula" id="pk-result">— send a message first —</div>
  `;
  const msgInput = root.querySelector("#pk-msg");
  const boxesEl = root.querySelector("#pk-boxes");
  const resultEl = root.querySelector("#pk-result");

  function chunk(str, size) {
    const out = [];
    for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
    return out;
  }
  function renderBoxes(list, found) {
    boxesEl.innerHTML = "";
    list.forEach((p) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (found ? " is-found" : "");
      box.innerHTML = `<span class="viz-box__val">“${p.text}”</span><span class="viz-box__idx">#${p.seq}</span>`;
      boxesEl.appendChild(box);
    });
  }
  root.querySelector("#pk-send").addEventListener("click", () => {
    const msg = (msgInput.value || defaultMsg).toUpperCase();
    const chunks = chunk(msg, 3);
    const packets = chunks.map((c, i) => ({ seq: i, text: c }));
    received = packets.slice().sort(() => Math.random() - 0.5);
    renderBoxes(received, false);
    resultEl.textContent = "Packets have arrived — but not necessarily in order. Click Reassemble.";
  });
  root.querySelector("#pk-reassemble").addEventListener("click", () => {
    if (!received.length) return;
    const ordered = received.slice().sort((a, b) => a.seq - b.seq);
    renderBoxes(ordered, true);
    resultEl.textContent = ordered.map((p) => p.text).join("");
  });
  root.querySelector("#pk-send").click();
}

// --- Submodule 3: DNS lookup, with a repeat lookup showing the cache ----------
function initDnsViz(root) {
  const table = {
    "example.com": "93.184.216.34",
    "wikipedia.org": "208.80.154.224",
    "africanizeai.example": "102.130.44.9",
  };
  const cached = {};
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Domain name
        <select id="dns-domain">
          ${Object.keys(table).map((d) => `<option value="${d}">${d}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="viz-btn" id="dns-lookup">Look Up</button>
    </div>
    <div class="ll-row" id="dns-row"></div>
    <div class="viz-log" id="dns-log"></div>
  `;
  const domainSel = root.querySelector("#dns-domain");
  const rowEl = root.querySelector("#dns-row");
  const logEl = root.querySelector("#dns-log");

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 5).map((l) => `<div>${l}</div>`).join("");
  }
  function renderRow(stage) {
    const parts = ["You", "DNS", "Server"];
    rowEl.innerHTML = "";
    parts.forEach((p, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (stage === i ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${p}</span>`;
      rowEl.appendChild(box);
      if (i < parts.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "ll-arrow";
        arrow.textContent = "→";
        rowEl.appendChild(arrow);
      }
    });
  }
  root.querySelector("#dns-lookup").addEventListener("click", () => {
    const domain = domainSel.value;
    renderRow(1);
    if (cached[domain]) {
      addLog(`“${domain}” was looked up recently — reused instantly from the cache, no need to ask DNS again.`);
    } else {
      addLog(`Asking DNS: “What's the address for ${domain}?”`);
      cached[domain] = table[domain];
      addLog(`DNS replies: ${domain} → ${table[domain]}`);
    }
    setTimeout(() => {
      renderRow(2);
      addLog(`Now connecting directly to ${cached[domain]}.`);
    }, 500);
  });
  renderRow(0);
}

// --- Submodule 4: hopping across routers to reach a destination ---------------
function initRouterHopViz(root) {
  const hops = ["Your Device", "Home Router", "ISP Router", "Internet Backbone", "Destination Network", "Server"];
  let stage = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="hop-step">Next Hop</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="hop-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="hop-reset">Reset</button>
    </div>
    <div class="viz-row" id="hop-boxes"></div>
    <div class="viz-log" id="hop-log"></div>
  `;
  const boxesEl = root.querySelector("#hop-boxes");
  const logEl = root.querySelector("#hop-log");

  function render() {
    boxesEl.innerHTML = "";
    hops.forEach((h, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (i === stage ? " is-active" : i < stage ? " is-found" : "");
      box.innerHTML = `<span class="viz-box__val">${h}</span>`;
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
    if (stage >= hops.length - 1) { addLog("Arrived — the server has the packet."); stopPlay(); return; }
    stage++;
    render();
    addLog(`Hop ${stage}: passed along to ${hops[stage]}.`);
  }
  root.querySelector("#hop-step").addEventListener("click", step);
  root.querySelector("#hop-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(() => {
      if (stage >= hops.length - 1) { stopPlay(); return; }
      step();
    }, 700);
  });
  root.querySelector("#hop-reset").addEventListener("click", () => {
    stopPlay();
    stage = 0;
    log.length = 0;
    logEl.innerHTML = "";
    render();
  });
  render();
}

// --- Submodule 5: scaled latency comparison, extended with network hops -------
function initNetworkLatencyViz(root) {
  const tiers = [
    { label: "CPU Cache (L1)", ns: 0.5, human: "1 second", fill: "" },
    { label: "RAM", ns: 100, human: "≈ 3 minutes", fill: "race-bar__fill--binary" },
    { label: "SSD (flash disk)", ns: 150000, human: "≈ 6 days", fill: "race-bar__fill--amber" },
    { label: "Round trip within the same data center", ns: 500000, human: "≈ 3 weeks", fill: "race-bar__fill--amber" },
    { label: "Hard disk seek (spinning)", ns: 10000000, human: "≈ 10 months", fill: "race-bar__fill--danger" },
    { label: "Round trip to another continent", ns: 150000000, human: "≈ 12 years", fill: "race-bar__fill--danger" },
  ];
  const maxLog = Math.log10(tiers[tiers.length - 1].ns + 1);
  let humanMode = false;

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn viz-btn--ghost" id="netlat-toggle">Switch to human-scale time →</button>
    </div>
    <div class="race-row" id="netlat-rows"></div>
  `;
  const rowsEl = root.querySelector("#netlat-rows");
  const toggleBtn = root.querySelector("#netlat-toggle");

  function fmtNs(ns) {
    if (ns < 1000) return `${ns} ns`;
    if (ns < 1000000) return `${(ns / 1000).toFixed(0)} µs`;
    if (ns < 1000000000) return `${(ns / 1000000).toFixed(0)} ms`;
    return `${(ns / 1000000000).toFixed(1)} s`;
  }
  function render() {
    rowsEl.innerHTML = "";
    tiers.forEach((t) => {
      const pct = Math.max(3, (Math.log10(t.ns + 1) / maxLog) * 100);
      const row = document.createElement("div");
      row.innerHTML = `
        <div class="race-label">${t.label}</div>
        <div class="race-bar"><div class="race-bar__fill ${t.fill}" style="width:${pct}%"></div></div>
        <div class="race-count">${humanMode ? `if the CPU cache took 1 second, this would take ${t.human}` : `≈ ${fmtNs(t.ns)}`}</div>
      `;
      rowsEl.appendChild(row);
    });
  }
  toggleBtn.addEventListener("click", () => {
    humanMode = !humanMode;
    toggleBtn.textContent = humanMode ? "← Back to real time" : "Switch to human-scale time →";
    render();
  });
  render();
}

// --- Submodule 6: a full web request, start to finish --------------------------
function initWebRequestViz(root) {
  const stages = [
    { label: "DNS Lookup", msg: "Your browser asks DNS for the server's IP address — or reuses one it already cached." },
    { label: "Routing", msg: "Your request is split into packets and hops across routers toward the server." },
    { label: "Server", msg: "The server receives the request — it might even ask its own database (like Postgres) for the page's data." },
    { label: "Response", msg: "The server's reply travels back the same way, in packets, across the network." },
    { label: "Render", msg: "Your browser reassembles the response in order and draws the page on your screen." },
  ];
  let stage = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="wr-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="wr-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="wr-reset">Reset</button>
    </div>
    <div class="viz-row" id="wr-boxes"></div>
    <div class="viz-log" id="wr-log"></div>
  `;
  const boxesEl = root.querySelector("#wr-boxes");
  const logEl = root.querySelector("#wr-log");

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
  root.querySelector("#wr-step").addEventListener("click", step);
  root.querySelector("#wr-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(() => {
      if (stage >= stages.length) { stopPlay(); return; }
      step();
    }, 800);
  });
  root.querySelector("#wr-reset").addEventListener("click", () => {
    stopPlay();
    stage = 0;
    log.length = 0;
    logEl.innerHTML = "";
    render();
  });
  render();
}
