// Class list helpers: colour assignment and pure array operations on
// `project.classes`. Persistence itself goes through store.projects.update —
// this file never touches IndexedDB directly, so it stays testable as plain
// functions on plain data.

// Evenly spaced hues in OKLCH at fixed lightness/chroma keep every class
// visually distinct up to ~20 without any of them going muddy or neon — the
// failure mode of picking colours from a fixed palette once you run out of
// slots. Golden-angle spacing (137.5°) avoids near-duplicate hues landing
// next to each other as classes are added one at a time.
const GOLDEN_ANGLE = 137.508;
const LIGHTNESS = 0.62;
const CHROMA = 0.15;

function colorForIndex(index) {
  const hue = (index * GOLDEN_ANGLE) % 360;
  return `oklch(${LIGHTNESS} ${CHROMA} ${hue.toFixed(1)})`;
}

function createClass(existingClasses, name) {
  return {
    id: crypto.randomUUID(),
    name,
    color: colorForIndex(existingClasses.length),
  };
}

function renameClass(classes, id, name) {
  return classes.map((c) => (c.id === id ? { ...c, name } : c));
}

function recolorClass(classes, id, color) {
  return classes.map((c) => (c.id === id ? { ...c, color } : c));
}

function removeClass(classes, id) {
  return classes.filter((c) => c.id !== id);
}

export const classes = {
  create: createClass,
  rename: renameClass,
  recolor: recolorClass,
  remove: removeClass,
  colorForIndex,
};
