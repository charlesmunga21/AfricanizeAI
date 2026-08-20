// Wires the deploy.html question form to questions.js's recommendation logic
// and generators.js's file output. No annotation/model code lives here —
// this page only asks questions and hands back files.

import { frame } from "../frame.js";
import { QUESTIONS, recommend } from "./questions.js";
import { generateColabNotebook, generateSpaceBundle, generateBrowserStub, generateDockerBundle, zipBundle, preloadFflate } from "./generators.js";

frame.mountAll();
preloadFflate().catch(() => {}); // start the CDN fetch now; zipBundle() surfaces any real failure later, on click

const $ = (id) => document.getElementById(id);
const fieldsHost = $("dp-fields");
const resultsHost = $("dp-results");
const generateBtn = $("dp-generate");

for (const q of QUESTIONS) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.textContent = q.prompt;
  label.htmlFor = `dp-${q.id}`;
  const select = document.createElement("select");
  select.id = `dp-${q.id}`;
  for (const opt of q.options) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.hint ? `${opt.label} — ${opt.hint}` : opt.label;
    select.appendChild(el);
  }
  field.append(label, select);
  fieldsHost.appendChild(field);
}

function currentAnswers() {
  const answers = {};
  for (const q of QUESTIONS) answers[q.id] = $(`dp-${q.id}`).value;
  return answers;
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ARTIFACTS = {
  colab: {
    module: "COLAB",
    title: "Colab notebook",
    body: (a) => `Pre-wired for ${a.task}: dataset loading matched to "${a.data}", training, evaluation, and an ONNX export cell.`,
    action: async (a, btn) => {
      btn.textContent = "Building…";
      const notebook = generateColabNotebook(a);
      download(`train-${a.task}.ipynb`, new Blob([notebook], { type: "application/x-ipynb+json" }));
      btn.textContent = "Downloaded ✓";
    },
    buttonLabel: "Download .ipynb",
  },
  space: {
    module: "SPACE",
    title: "Hugging Face Space",
    body: () => `A Gradio app (app.py), requirements.txt, and README.md with the YAML frontmatter Spaces need — zipped together.`,
    action: async (a, btn) => {
      btn.textContent = "Zipping…";
      const files = generateSpaceBundle(a);
      const blob = await zipBundle(files);
      download("huggingface-space.zip", blob);
      btn.textContent = "Downloaded ✓";
    },
    buttonLabel: "Download .zip",
  },
  browser: {
    module: "BROWSER",
    title: "Browser deployment stub",
    body: () => `One self-contained HTML file — the same ONNX Runtime Web pattern as live.html, stripped down. Runs your model client-side, no server.`,
    action: async (a, btn) => {
      btn.textContent = "Building…";
      const html = generateBrowserStub(a);
      download("model-runner.html", new Blob([html], { type: "text/html" }));
      btn.textContent = "Downloaded ✓";
    },
    buttonLabel: "Download .html",
  },
  docker: {
    module: "DOCKER",
    title: "Docker + FastAPI",
    body: () => `A Dockerfile and a FastAPI main.py with a /predict endpoint — for when you want your own hosted API, not a platform's.`,
    action: async (a, btn) => {
      btn.textContent = "Zipping…";
      const files = generateDockerBundle(a);
      const blob = await zipBundle(files);
      download("docker-api.zip", blob);
      btn.textContent = "Downloaded ✓";
    },
    buttonLabel: "Download .zip",
  },
};

function renderResults(answers, plan) {
  resultsHost.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "note dp-summary";
  summary.innerHTML = `<p>${plan.summary}</p>`;
  resultsHost.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "dp-cards";

  for (const [key, meta] of Object.entries(ARTIFACTS)) {
    const recommended = plan.artifacts.has(key);
    const card = document.createElement("div");
    card.className = `frame dp-card${recommended ? " dp-card--recommended" : ""}`;
    card.dataset.frame = "";
    card.dataset.module = meta.module;
    card.dataset.state = recommended ? "live" : "idle";

    if (recommended) {
      const tag = document.createElement("span");
      tag.className = "dp-recommended-tag";
      tag.textContent = "Recommended for you";
      card.appendChild(tag);
    }
    const h3 = document.createElement("h3");
    h3.textContent = meta.title;
    const p = document.createElement("p");
    p.textContent = meta.body(answers);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn" + (recommended ? "" : " btn--ghost");
    btn.textContent = meta.buttonLabel;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await meta.action(answers, btn);
      } catch (err) {
        console.error(err);
        btn.textContent = "Failed — see console";
      } finally {
        setTimeout(() => {
          btn.textContent = meta.buttonLabel;
          btn.disabled = false;
        }, 1500);
      }
    });

    card.append(h3, p, btn);
    grid.appendChild(card);
  }

  resultsHost.appendChild(grid);
  frame.mountAll(resultsHost);
}

generateBtn.addEventListener("click", () => {
  const answers = currentAnswers();
  const plan = recommend(answers);
  renderResults(answers, plan);
});
