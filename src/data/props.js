// Per-section furniture layout — pure geometry, no Phaser. Derived from
// data/sections.js's SECTIONS the same way penRects()/wallRects() are: plain
// rects that both KennelScene's rendering and its interaction/collision code
// can share, so the numbers only live in one place.
import { SECTIONS, RECEPTION, CAGES_PER_SECTION } from './sections.js';

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

// Snake tank (issue #14): same glass-tank-with-cover geometry as the turtle
// tank, but a snake doesn't need "lots of water" — instead of a sand island
// it gets a resting branch/perch it (and any eggs) can coil around. Turtles
// and snakes are the kennel's two egg-laying species, so they share this
// tank+perch pattern instead of the individual-cage grid below.
export const SNAKE = (() => {
  const s = sectionByKey('snake').rect;
  const tank = { x: s.x + 18, y: s.y + 38, w: s.w - 36, h: s.h - 56 };
  const perch = {
    x: tank.x + tank.w * 0.14,
    y: tank.y + tank.h * 0.4,
    w: tank.w * 0.72,
    h: tank.h * 0.26,
  };
  return { tank, perch };
})();

// Cat/dog playpens: a smaller fenced corral inside each section, distinct from
// the section's own pen wall — "so nobody gets in a fight" (DESIGN.md). Both
// sections happen to share the same w/h, so the two playpens come out the
// same size (handy: one fence texture covers both).
//
// Issue #18 ("cage to sleep, playpen to play"): the playpen now only fills the
// TOP part of the section — the bottom is reserved for each cat/dog's own
// individual cage (see CAGES below), which KennelScene switches them into at
// night (_startNight) and back out of each morning.
function playpenFor(key) {
  const s = sectionByKey(key).rect;
  return { x: s.x + 26, y: s.y + 46, w: s.w - 52, h: s.h * 0.5 };
}
export const CAT_PLAYPEN = playpenFor('cat');
export const DOG_PLAYPEN = playpenFor('dog');

// ── Individual cages (issue #18) ────────────────────────────────────────────
// Every section gets a fixed grid of CAGES_PER_SECTION (6) individual cages —
// "a cage to sleep" for every animal, auto-assigned on drop-off, one per stay
// (her babies/eggs share it, same as today's "near mom" rendering). Turtles
// are the one exception: their tank + shared sand island already IS their
// cage equivalent (DESIGN.md — "the turtles and the eggs share the island
// together"), so there's no turtle entry here; capacity bookkeeping for
// turtles still uses CAGES_PER_SECTION, just without a rendered cage grid.
//
// Cats/dogs reserve the bottom of their section (below the playpen) for their
// cage grid; every other non-turtle/non-snake section uses its whole rect
// (minus the floor label at the top).
function cageAreaFor(key) {
  const s = sectionByKey(key).rect;
  if (key === 'cat' || key === 'dog') {
    const playpen = playpenFor(key);
    const top = playpen.y + playpen.h + 16;
    return { x: s.x + 18, y: top, w: s.w - 36, h: s.y + s.h - 16 - top };
  }
  return { x: s.x + 16, y: s.y + 48, w: s.w - 32, h: s.h - 64 };
}

// Lays out `count` equal cage rects in a `cols`x`rows` grid across `rect`.
function cageGrid(rect, cols = 3, rows = 2, pad = 8, gap = 8) {
  const cellW = (rect.w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (rect.h - pad * 2 - gap * (rows - 1)) / rows;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        x: rect.x + pad + c * (cellW + gap),
        y: rect.y + pad + r * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }
  return out;
}

// sectionKey -> array of CAGES_PER_SECTION cage rects (no `turtle`/`snake`
// entry — see note above).
export const CAGES = Object.fromEntries(
  SECTIONS.filter((s) => s.key !== 'turtle' && s.key !== 'snake')
    .map((s) => [s.key, cageGrid(cageAreaFor(s.key), 3, 2, 8, 8)]), // 3x2 = CAGES_PER_SECTION
);

// Where an animal sprite stands inside a cage rect (origin 0.5, 1 — feet on
// the ground, matching every other placed sprite).
export function cageAnimalSpot(cage) {
  return { x: cage.x + cage.w / 2, y: cage.y + cage.h - 6 };
}

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
// the small pets' bowls sit in a free corner of their whole section. Snakes
// get a plain bowl too (issue #14: "just feeding, like every other species —
// no unique chore") — unlike the turtle tank, the snake tank has no special
// water-topping interaction.
export const BOWL_SPOT = {
  guineaPig: cornerOf(sectionByKey('guineaPig').rect),
  hamster: cornerOf(sectionByKey('hamster').rect),
  bunny: cornerOf(sectionByKey('bunny').rect),
  snake: cornerOf(sectionByKey('snake').rect),
  cat: { x: CAT_PLAYPEN.x + 18, y: CAT_PLAYPEN.y + 20 },
  dog: { x: DOG_PLAYPEN.x + 18, y: DOG_PLAYPEN.y + 20 },
};

function cornerOf(rect) {
  return { x: rect.x + rect.w - 24, y: rect.y + rect.h - 20 };
}

// The reception computer (issue #10) — "the player has a computer... to send
// a message with a picture of the babies to the owners" (DESIGN.md). Sits on
// the right side of the reception desk, clear of the desk's own graphics.
export const COMPUTER_SPOT = {
  x: RECEPTION.desk.x + RECEPTION.desk.w - 22,
  y: RECEPTION.desk.y + 6,
};
