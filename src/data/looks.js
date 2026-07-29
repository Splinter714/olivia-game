// Hands out per-species hues that are both unique AND visually well-spaced —
// a hue 1° away from another looks identical to a kid, so plain non-equal
// floats aren't enough ("no two animals should ever look the same"). Each
// species draws from its own shuffled "deck" of hues at 15° steps (24 slots
// covering 0-359); once a deck is exhausted it's refilled with a small phase
// offset so the new lap doesn't immediately hand out a hue right next to one
// already given. Pairs with art/palette.js's paletteForHue(), which turns a
// hue into the actual color fields a species' draw function expects.
const STEP = 15;
const state = {}; // speciesKey -> { queue: number[], lap: number }

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomHue(speciesKey, rng = Math.random) {
  const s = state[speciesKey] ?? (state[speciesKey] = { queue: [], lap: 0 });
  if (s.queue.length === 0) {
    const offset = (s.lap * (STEP / 2)) % STEP;
    const hues = [];
    for (let h = 0; h < 360; h += STEP) hues.push((h + offset) % 360);
    s.queue = shuffle(hues, rng);
    s.lap += 1;
  }
  return s.queue.pop();
}
