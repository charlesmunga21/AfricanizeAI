import { frame } from "../frame.js";
import { isMeteredConnection, formatBytes } from "../model-cache.js";
import { EMBED_MODEL, EMBED_CACHE_VERSION, CORPUS_URL, TOP_K } from "./config.js";
import * as store from "./store.js";
import { topK } from "./search.js";

const MODULE = "ASSISTANT";
const el = (id) => document.getElementById(id);

const startBtn = el("as-start");
const gate = el("as-gate");
const statusNote = el("as-status");
const progress = el("as-progress");
const progressBar = el("as-progress-bar");

const askForm = el("as-ask-form");
const questionInput = el("as-question");
const askBtn = el("as-ask-btn");
const chips = document.querySelectorAll(".as-chip");

const resultsHost = el("as-results");

const consentDialog = el("as-consent");
const consentBody = el("as-consent-body");
const consentProgress = el("as-consent-progress");
const consentBar = el("as-consent-bar");
const consentOk = el("as-consent-ok");
const consentCancel = el("as-consent-cancel");

let worker = null;
let vectors = null; // Float32Array, chunkCount * dim
let dim = 0;
let chunks = []; // corpus.json chunks, same order as vectors rows
let activeRequestId = 0;

function showStatus(text, kind = "info") {
  statusNote.hidden = false;
  statusNote.className = "note as-status" + (kind === "warn" ? " note--warn" : "");
  statusNote.textContent = text;
}

function askConsent(bytes) {
  return new Promise((resolve) => {
    consentBody.textContent = `This connection looks metered or slow. ${EMBED_MODEL.name} is roughly ${formatBytes(bytes)}. Download it now?`;
    consentProgress.hidden = true;
    consentBar.style.width = "0%";
    consentDialog.showModal();
    const cleanup = () => {
      consentOk.onclick = null;
      consentCancel.onclick = null;
      consentDialog.close();
    };
    consentOk.onclick = () => { cleanup(); resolve(true); };
    consentCancel.onclick = () => { cleanup(); resolve(false); };
  });
}

// ---------- Worker request/response plumbing ----------

function bootWorker() {
  return new Promise((resolve, reject) => {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    const modelFiles = new Map(); // file -> {loaded, total}, for aggregate download progress

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "modelProgress") {
        modelFiles.set(msg.file, { loaded: msg.loaded, total: msg.total });
        let loaded = 0, total = 0;
        for (const f of modelFiles.values()) { loaded += f.loaded; total += f.total; }
        if (total > 0) {
          const pct = Math.round((loaded / total) * 100);
          showStatus(`Downloading ${EMBED_MODEL.name} — ${formatBytes(loaded)} of ${formatBytes(total)}`);
          if (!consentDialog.open) { progress.hidden = false; progressBar.style.width = `${pct}%`; }
          else { consentBar.style.width = `${pct}%`; }
        }
      } else if (msg.type === "ready") {
        resolve();
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => reject(e.error || new Error(e.message));
    worker.postMessage({ type: "boot" });
  });
}

function embedCorpusInWorker(texts) {
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const msg = e.data;
      if (msg.type === "embedProgress") {
        showStatus(`Indexing site content — ${msg.done} of ${msg.total} sections`);
      } else if (msg.type === "embedCorpusDone") {
        worker.removeEventListener("message", onMsg);
        resolve({ vectors: new Float32Array(msg.vectors), dim: msg.dim });
      } else if (msg.type === "error") {
        worker.removeEventListener("message", onMsg);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage({ type: "embedCorpus", texts });
  });
}

function embedQueryInWorker(text) {
  const requestId = ++activeRequestId;
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const msg = e.data;
      if (msg.type === "embedQueryResult" && msg.requestId === requestId) {
        worker.removeEventListener("message", onMsg);
        resolve({ vector: new Float32Array(msg.vector), requestId });
      } else if (msg.type === "error") {
        worker.removeEventListener("message", onMsg);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage({ type: "embedQuery", text, requestId });
  });
}

// ---------- Load flow ----------

async function loadAssistant() {
  startBtn.disabled = true;
  frame.setState(MODULE, "idle", "loading");

  try {
    if (isMeteredConnection()) {
      const ok = await askConsent(EMBED_MODEL.bytesApprox);
      if (!ok) {
        startBtn.disabled = false;
        frame.setState(MODULE, "idle");
        return;
      }
    }

    showStatus(`Loading ${EMBED_MODEL.name}…`);
    progress.hidden = false;
    await bootWorker();

    showStatus("Loading site content…");
    const res = await fetch(CORPUS_URL);
    const corpus = await res.json();
    chunks = corpus.chunks;

    const cached = await store.loadCached(corpus.version, EMBED_CACHE_VERSION);
    if (cached) {
      vectors = cached.vectors;
      dim = cached.dim;
    } else {
      const built = await embedCorpusInWorker(chunks.map((c) => c.text));
      vectors = built.vectors;
      dim = built.dim;
      await store.save(corpus.version, EMBED_CACHE_VERSION, vectors, dim);
    }

    progress.hidden = true;
    gate.hidden = true;
    showStatus(`Ready — indexed ${chunks.length} sections across the site. Ask anything.`);
    frame.setState(MODULE, "live");
    askForm.hidden = false;
    questionInput.disabled = false;
    askBtn.disabled = false;
    chips.forEach((c) => { c.disabled = false; });
    questionInput.focus();
  } catch (err) {
    console.error(err);
    showStatus(`Couldn't load the assistant: ${err.message}`, "warn");
    startBtn.disabled = false;
    frame.setState(MODULE, "error");
  }
}

// ---------- Ask flow ----------

function renderResults(hits) {
  resultsHost.innerHTML = "";
  resultsHost.hidden = false;

  if (!hits.length || hits[0].score < 0.2) {
    const empty = document.createElement("p");
    empty.className = "as-empty";
    empty.textContent = "No strong match on this site for that question yet — try rephrasing, or browse the closest section below.";
    resultsHost.appendChild(empty);
  }

  hits.forEach((hit, i) => {
    const chunk = chunks[hit.index];
    const card = document.createElement("div");
    card.className = i === 0 ? "as-card as-card--top" : "as-card";

    const kicker = document.createElement("p");
    kicker.className = "as-card__kicker mono";
    kicker.textContent = chunk.heading ? `${chunk.module} · ${chunk.title} · ${chunk.heading}` : `${chunk.module} · ${chunk.title}`;

    const excerpt = document.createElement("p");
    excerpt.className = "as-card__excerpt";
    excerpt.textContent = chunk.text;

    const link = document.createElement("a");
    link.className = "as-card__link";
    link.href = `../${chunk.url}`;
    link.textContent = "Read this section →";

    card.append(kicker, excerpt, link);
    resultsHost.appendChild(card);
  });
}

async function ask(question) {
  question = question.trim();
  if (!question || !vectors) return;

  askBtn.disabled = true;
  resultsHost.hidden = false;
  resultsHost.innerHTML = `<p class="as-empty">Searching…</p>`;

  try {
    const { vector, requestId } = await embedQueryInWorker(question);
    if (requestId !== activeRequestId) return; // superseded by a newer question
    const hits = topK(vector, vectors, dim, chunks.length, TOP_K);
    renderResults(hits);
  } catch (err) {
    console.error(err);
    resultsHost.innerHTML = `<p class="as-empty">Something went wrong answering that — try again.</p>`;
  } finally {
    askBtn.disabled = false;
  }
}

// ---------- Wiring ----------

frame.mountAll();
startBtn.addEventListener("click", loadAssistant);

askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ask(questionInput.value);
});

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    questionInput.value = chip.textContent;
    ask(chip.textContent);
  });
});
