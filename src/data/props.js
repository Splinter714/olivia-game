// Per-section furniture layout — pure geometry, no Phaser. Derived from
// data/sections.js's SECTIONS the same way penRects()/wallRects() are: plain
// rects that both KennelScene's rendering and its interaction/collision code
// can share, so the numbers only live in one place.
import { SECTIONS } from './sections.js';

const sectionByKey = (key) => SECTIONS.find((s) => s.key === key);

// Turtle tank: glass-covered water tank filling most of the section, with a
// smaller sand island in the middle where turtles + eggs "share the island
// together... plenty of space" (DESIGN.md).
export const TURTLE = (() => {
  const s = sectionByKey('turtle').rect;
  const tank = { x: s.x + 18, y: s.y + 38, w: s.w - 36, h: s.h - 56 };
  const island = {
    x: tank.x + tank.w * 0.28,
    y: tank.y + tank.h * 0.22,
    w: tank.w * 0.44,
    h: tank.h * 0.56,
  };
  return { tank, island };
})();

// Cat/dog playpens: a smaller fenced corral inside each section, distinct from
// the section's own pen wall — "so nobody gets in a fight" (DESIGN.md). Both
// sections happen to share the same w/h, so the two playpens come out the
// same size (handy: one fence texture covers both).
function playpenFor(key) {
  const s = sectionByKey(key).rect;
  return { x: s.x + 26, y: s.y + 46, w: s.w - 52, h: s.h - 80 };
}
export const CAT_PLAYPEN = playpenFor('cat');
export const DOG_PLAYPEN = playpenFor('dog');

// Litter box sits in a back corner of the cat playpen — cats "use litter
// boxes" instead of the general playpen scoop (DESIGN.md).
export const LITTER_BOX = {
  x: CAT_PLAYPEN.x + 10,
  y: CAT_PLAYPEN.y + CAT_PLAYPEN.h - 34,
  w: 46,
  h: 26,
};

// Scooper pickup prop, tucked in the dog playpen's far corner (from the
// litter box's spot, mirrored) — "you pick it up with the scooper" (DESIGN.md).
export const SCOOPER_SPOT = {
  x: DOG_PLAYPEN.x + DOG_PLAYPEN.w - 20,
  y: DOG_PLAYPEN.y + DOG_PLAYPEN.h - 26,
};

// One food/water bowl per (non-turtle) section — turtles get their water from
// topping off the tank instead (see TURTLE above), so they don't need one.
// Cat/dog bowls sit inside their playpen (where the animals actually are);
// the small pets' bowls sit in a free corner of their whole section.
export const BOWL_SPOT = {
  guineaPig: cornerOf(sectionByKey('guineaPig').rect),
  hamster: cornerOf(sectionByKey('hamster').rect),
  bunny: cornerOf(sectionByKey('bunny').rect),
  cat: { x: CAT_PLAYPEN.x + 18, y: CAT_PLAYPEN.y + 20 },
  dog: { x: DOG_PLAYPEN.x + 18, y: DOG_PLAYPEN.y + 20 },
};

function cornerOf(rect) {
  return { x: rect.x + rect.w - 24, y: rect.y + rect.h - 20 };
}
