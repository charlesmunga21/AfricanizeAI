// Interactive visual models for the "Hardware Meets Software" (IoT + Software) module.
// Plain DOM + CSS, matching the rest of the site — no canvas, no build step.

// --- Submodule 1: code -> GPIO -> the physical world ----------------------------
function initSoftwareHardwareViz(root) {
  const parts = [
    { key: "code", label: "Your Code", desc: "The program you write — C/C++ on a microcontroller, or Python/Node on a Raspberry Pi. Structurally it's not that different from backend code you already know: read some input, decide something, write some output." },
    { key: "gpio", label: "GPIO / Registers", desc: "General-Purpose Input/Output pins are the bridge. Think of a GPIO pin as a variable that's physically wired to a circuit: read it and you get a real voltage from the outside world; write to it and you change a real voltage out there. digitalRead(pin) and digitalWrite(pin, HIGH) are just get/set on that variable." },
    { key: "world", label: "The Physical World", desc: "A sensor turns something physical — light, moisture, motion, temperature — into a signal your code can read. An actuator does the reverse: it turns a signal your code writes into physical motion, heat, or light. Almost everything in this module is a variation on “read a sensor, decide something, write an actuator.”" },
  ];
  let selected = "gpio";

  root.innerHTML = `
    <div class="ll-row" id="sh-row"></div>
    <div class="viz-formula" id="sh-desc"></div>
  `;
  const rowEl = root.querySelector("#sh-row");
  const descEl = root.querySelector("#sh-desc");

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

// --- Submodule 2: the scan cycle — a button moving a robotic arm ---------------
function initScanCycleViz(root) {
  const stages = ["Read Inputs", "Evaluate Logic", "Update Outputs"];
  let stage = 0;
  let lastButtonRead = false;
  let armExtended = false;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label><input type="checkbox" id="sc-button"> Hold the button down</label>
      <button type="button" class="viz-btn" id="sc-step">Next Scan-Cycle Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="sc-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="sc-stop">Stop</button>
    </div>
    <div class="viz-row" id="sc-stages"></div>
    <div class="viz-meta"><span class="viz-badge viz-badge--neutral" id="sc-arm">Arm: retracted</span></div>
    <div class="viz-log" id="sc-log"></div>
  `;
  const buttonChk = root.querySelector("#sc-button");
  const stagesEl = root.querySelector("#sc-stages");
  const armEl = root.querySelector("#sc-arm");
  const logEl = root.querySelector("#sc-log");

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 6).map((l) => `<div>${l}</div>`).join("");
  }
  function render() {
    stagesEl.innerHTML = "";
    stages.forEach((s, i) => {
      const box = document.createElement("div");
      box.className = "viz-box" + (i === stage ? " is-active" : "");
      box.innerHTML = `<span class="viz-box__val">${s}</span>`;
      stagesEl.appendChild(box);
    });
    armEl.textContent = armExtended ? "Arm: EXTENDED (moving a part)" : "Arm: retracted";
    armEl.className = "viz-badge" + (armExtended ? "" : " viz-badge--neutral");
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }
  function step() {
    if (stage === 0) {
      lastButtonRead = buttonChk.checked;
      addLog(`Read Inputs — button is currently ${lastButtonRead ? "PRESSED" : "not pressed"}.`);
    } else if (stage === 1) {
      addLog(`Evaluate Logic — the program's rule: "if button is pressed, extend the arm."`);
    } else {
      armExtended = lastButtonRead;
      addLog(`Update Outputs — arm is now ${armExtended ? "EXTENDED" : "retracted"}.`);
    }
    stage = (stage + 1) % stages.length;
    render();
  }
  root.querySelector("#sc-step").addEventListener("click", step);
  root.querySelector("#sc-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(step, 700);
  });
  root.querySelector("#sc-stop").addEventListener("click", stopPlay);
  render();
}

// --- Submodule 3: Arduino (no OS) vs Raspberry Pi (boots Linux) ----------------
function initMcuVsSbcViz(root) {
  const boards = [
    { key: "arduino", label: "Arduino (microcontroller)", ms: 2, fill: "", detail: "No operating system. Power on, and your one compiled program starts running immediately, in an infinite loop — there's nothing else to boot." },
    { key: "pi", label: "Raspberry Pi (single-board computer)", ms: 25000, fill: "race-bar__fill--danger", detail: "A full Linux boots first — kernel, scheduler, dozens of background processes, exactly like the Operating Systems Basics module. Only then does your program run, as one process among many." },
  ];
  const maxMs = boards[1].ms;
  let selected = "arduino";
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <label>Board
        <select id="mv-board">
          ${boards.map((b) => `<option value="${b.key}">${b.label}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="viz-btn" id="mv-power">Power On</button>
    </div>
    <div class="race-row" id="mv-rows"></div>
    <div class="viz-log" id="mv-log"></div>
  `;
  const boardSel = root.querySelector("#mv-board");
  const rowsEl = root.querySelector("#mv-rows");
  const logEl = root.querySelector("#mv-log");

  function addLog(t) {
    log.unshift(t);
    logEl.innerHTML = log.slice(0, 5).map((l) => `<div>${l}</div>`).join("");
  }
  function fmtMs(ms) {
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(0)} s`;
  }
  function render() {
    rowsEl.innerHTML = "";
    boards.forEach((b) => {
      const pct = Math.max(3, (b.ms / maxMs) * 100);
      const row = document.createElement("div");
      row.innerHTML = `
        <div class="race-label">${b.label}${b.key === selected ? " — selected" : ""}</div>
        <div class="race-bar"><div class="race-bar__fill ${b.fill}" style="width:${pct}%"></div></div>
        <div class="race-count">≈ ${fmtMs(b.ms)} to boot and start running your code</div>
      `;
      rowsEl.appendChild(row);
    });
  }
  boardSel.addEventListener("change", () => { selected = boardSel.value; render(); });
  root.querySelector("#mv-power").addEventListener("click", () => {
    const b = boards.find((x) => x.key === selected);
    addLog(`Power on ${b.label} — ${b.detail}`);
  });
  render();
}

// --- Submodule 4: soil sensor -> meter box -> gateway -> internet -> cloud -----
function initIotPipelineViz(root) {
  const stages = [
    { label: "Soil Sensor", msg: "A soil moisture probe reads a raw electrical signal from the ground and converts it into a digital value your code can use." },
    { label: "Meter Box", msg: "A field datalogger (the “meter box”) reads the sensor on a schedule, timestamps the reading, and holds it — the same read-and-store loop as any embedded program." },
    { label: "Gateway", msg: "The reading goes out over a low-power radio link like LoRaWAN — built for years of battery life over long rural distances — to a gateway." },
    { label: "Internet", msg: "From the gateway onward, it's just packets — routed hop by hop across the internet exactly like the Networking Basics module described." },
    { label: "Cloud Dashboard", msg: "A cloud platform stores the reading and updates a live dashboard — the same client-server pattern as any app checking a database." },
  ];
  let stage = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="ip-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="ip-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="ip-reset">Reset</button>
    </div>
    <div class="viz-row" id="ip-boxes"></div>
    <div class="viz-log" id="ip-log"></div>
  `;
  const boxesEl = root.querySelector("#ip-boxes");
  const logEl = root.querySelector("#ip-log");

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
  root.querySelector("#ip-step").addEventListener("click", step);
  root.querySelector("#ip-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(() => {
      if (stage >= stages.length) { stopPlay(); return; }
      step();
    }, 800);
  });
  root.querySelector("#ip-reset").addEventListener("click", () => {
    stopPlay();
    stage = 0;
    log.length = 0;
    logEl.innerHTML = "";
    render();
  });
  render();
}

// --- Submodule 5: a real center-pivot telemetry chain ---------------------------
function initPivotCaseStudyViz(root) {
  const parts = [
    { key: "sensor", label: "Soil Sensor", desc: "A probe in the field — or, in some research deployments, mounted directly on the pivot boom — measures soil moisture as the pivot passes overhead." },
    { key: "telemetry", label: "Telemetry Unit", desc: "A solar-powered box mounted on the pivot — commercial systems like Lindsay's FieldNET Pivot Watch use exactly this — reads the pivot's own sensors (position, speed, water pressure) and radios readings out on a schedule." },
    { key: "cloud", label: "Cloud Platform", desc: "Readings land in a cloud platform — FieldNET, or Valley's AgSense 365 — which logs history and can trigger alerts, like “pivot has stopped moving.”" },
    { key: "app", label: "Farmer's Phone", desc: "A dashboard app shows the pivot's live position and status from anywhere — and on advanced systems, can send commands back the other way to start, stop, or reroute it." },
  ];
  let selected = "telemetry";

  root.innerHTML = `
    <div class="ll-row" id="pv-row"></div>
    <div class="viz-formula" id="pv-desc"></div>
  `;
  const rowEl = root.querySelector("#pv-row");
  const descEl = root.querySelector("#pv-desc");

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

// --- Submodule 6: camera -> edge AI -> actuator, in milliseconds ---------------
function initAppliedIotViz(root) {
  const stages = [
    { label: "Capture", msg: "A camera on the machine captures a frame of the crop row as it passes — the same “images as data” idea from the Computer Vision module." },
    { label: "Classify", msg: "A model running right there on the machine — edge computing, not the cloud, since there's no time to round-trip — decides: crop, or weed?" },
    { label: "Decide", msg: "The program's logic picks an action from that classification: spray, or don't." },
    { label: "Actuate", msg: "A nozzle fires — precisely, on just that spot — all within milliseconds of the frame being captured." },
  ];
  let stage = 0;
  let playTimer = null;
  const log = [];

  root.innerHTML = `
    <div class="viz-controls">
      <button type="button" class="viz-btn" id="ai-step">Step</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="ai-play">Auto Play</button>
      <button type="button" class="viz-btn viz-btn--ghost" id="ai-reset">Reset</button>
    </div>
    <div class="viz-row" id="ai-boxes"></div>
    <div class="viz-log" id="ai-log"></div>
  `;
  const boxesEl = root.querySelector("#ai-boxes");
  const logEl = root.querySelector("#ai-log");

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
  root.querySelector("#ai-step").addEventListener("click", step);
  root.querySelector("#ai-play").addEventListener("click", () => {
    stopPlay();
    playTimer = setInterval(() => {
      if (stage >= stages.length) { stopPlay(); return; }
      step();
    }, 500);
  });
  root.querySelector("#ai-reset").addEventListener("click", () => {
    stopPlay();
    stage = 0;
    log.length = 0;
    logEl.innerHTML = "";
    render();
  });
  render();
}
