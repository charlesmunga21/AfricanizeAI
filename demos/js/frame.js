// The detection frame: the one signature element every demo module composes inside.
// Usage:
//   <div class="frame" data-frame data-module="PLAYGROUND" data-state="idle"> ... </div>
//   import { frame } from '../frame.js';
//   frame.mountAll();
//   frame.setState('PLAYGROUND', 'training', 'epoch 42');

const TICK_POSITIONS = ["tl", "tr", "bl", "br"];
const registry = new Map();

function label({ module, state, detail }) {
  const parts = [];
  if (module) parts.push(String(module).toUpperCase());
  if (state) parts.push(String(state).toUpperCase());
  if (detail) parts.push(detail);
  return parts.join(" · ");
}

function render(instance) {
  const { tab, text } = instance;
  tab.dataset.state = instance.state;
  const next = label(instance);
  // Crossfade carries information (a state actually changed) — skip it for
  // reduced-motion users and for the very first render.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !text.textContent) {
    text.textContent = next;
    return;
  }
  if (text.textContent === next) return;
  text.classList.add("is-swapping");
  window.setTimeout(() => {
    text.textContent = next;
    text.classList.remove("is-swapping");
  }, 120);
}

function mount(el) {
  if (el.dataset.frameMounted) return registry.get(el.dataset.module || "");

  const module = el.dataset.module || "";
  const state = el.dataset.state || "idle";
  const detail = el.dataset.detail || "";

  for (const pos of TICK_POSITIONS) {
    const tick = document.createElement("span");
    tick.className = `frame__tick frame__tick--${pos}`;
    tick.setAttribute("aria-hidden", "true");
    el.appendChild(tick);
  }

  const tab = document.createElement("div");
  tab.className = "frame__tab mono";
  tab.setAttribute("role", "status");
  tab.setAttribute("aria-live", "polite");
  const text = document.createElement("span");
  text.className = "frame__tab-text";
  tab.appendChild(text);
  el.insertBefore(tab, el.firstChild);

  el.dataset.frameMounted = "true";

  const instance = { el, tab, text, module, state, detail };
  registry.set(module, instance);
  render(instance);
  return instance;
}

function mountAll(root = document) {
  root.querySelectorAll("[data-frame]").forEach(mount);
}

function setState(moduleName, state, detail = "") {
  const instance = registry.get(moduleName);
  if (!instance) {
    console.warn(`frame.setState: no mounted frame for module "${moduleName}"`);
    return;
  }
  instance.state = state;
  instance.detail = detail;
  render(instance);
}

export const frame = { mount, mountAll, setState };
