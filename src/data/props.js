// Per-section furniture layout — pure geometry, no Phaser. Derived from
// data/sections.js's SECTIONS the same way penRects()/wallRects() are: plain
// rects that both KennelScene's rendering and its interaction/collision code
// can share, so the numbers only live in one place.
import { SECTIONS, RECEPTION, CAGES_PER_SECTION, STORAGE_ROOM, HOUSE_ROOM, ROOM, OUTSIDE } from './sections.js';

const sectionByKey = (key) => SECTIONS.find((s) => s.key === key);

// Turtle tank: glass-covered water tank filling most of the section. Issue
// #20 replaced the single shared sand island with individual per-turtle
// islands (see CAGES below) — the tank itself (the water + glass cover) is
// still one shared piece of furniture per section.
export const TURTLE = (() => {
  const s = sectionByKey('turtle').rect;
  const tank = { x: s.x + 18, y: s.y + 38, w: s.w - 36, h: s.h - 56 };
  return { tank };
})();

// Snake tank (issue #14): same glass-tank geometry as the turtle tank, minus
// the water. Issue #20 replaced the single shared resting perch with
// individual per-snake perches (see CAGES below).
export const SNAKE = (() => {
  const s = sectionByKey('snake').rect;
  const tank = { x: s.x + 18, y: s.y + 38, w: s.w - 36, h: s.h - 56 };
  return { tank };
})();

// ── Individual cages (issue #18, extended by issue #20) ─────────────────────
// Every section gets a fixed grid of CAGES_PER_SECTION (6) individual cages —
// "a cage to sleep" for every animal, auto-assigned on drop-off, one per stay
// (her babies/eggs share it, same as today's "near mom" rendering).
//
// Issue #20: turtles/snakes now get this same per-slot treatment instead of
// one big shared island/perch — each cage slot sits inside the section's
// shared tank and is styled with a small island (turtle) or perch (snake)
// instead of wire-pen art (see art/props.js's CAGE_KEY building). A turtle/
// snake mom still shares her one slot with her eggs/babies, same as before.
//
// Cats/dogs used to reserve only the bottom half of their section for cages
// (the top half held their shared playpen) — issue #20 removed the playpen
// entirely, so they now use their whole section rect like everyone else.
function cageAreaFor(key) {
  const s = sectionByKey(key).rect;
  if (key === 'turtle' || key === 'snake') {
    const tank = key === 'turtle' ? TURTLE.tank : SNAKE.tank;
    return { x: tank.x + 10, y: tank.y + 12, w: tank.w - 20, h: tank.h - 22 };
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

// sectionKey -> array of CAGES_PER_SECTION cage rects. Every section
// (including turtle/snake as of issue #20) gets one.
export const CAGES = Object.fromEntries(
  SECTIONS.map((s) => [s.key, cageGrid(cageAreaFor(s.key), 3, 2, 8, 8)]), // 3x2 = CAGES_PER_SECTION
);

// Where an animal sprite stands inside a cage rect (origin 0.5, 1 — feet on
// the ground, matching every other placed sprite).
export function cageAnimalSpot(cage) {
  return { x: cage.x + cage.w / 2, y: cage.y + cage.h - 6 };
}

// Litter box lives in a back corner of the cat section now that the shared
// playpen (issue #20) is gone — cats "use litter boxes" instead of the
// general scoop (DESIGN.md). Kept as one shared box per section (not one per
// cage) — a litter mess is still a "whole section" chore like it always was.
export const LITTER_BOX = (() => {
  const s = sectionByKey('cat').rect;
  return { x: s.x + s.w - 46, y: s.y + s.h - 30, w: 40, h: 24 };
})();

// Scooper pickup prop — relocated out of the (now-removed) dog playpen to a
// small stand in the hallway just outside the dog section's opening, since
// that's the section it was tucked into before (issue #20). Dogs no longer
// have an indoor mess of their own to scoop (their only potty pathway is the
// leash walk outside — see needs.bathroom); the scooper is now purely for the
// cat litter box.
export const SCOOPER_SPOT = (() => {
  const s = sectionByKey('dog').rect;
  return { x: s.x - 22, y: s.y + s.h - 30 };
})();

// One food/water bowl per individual cage slot (issue #22 #6) — reuses the
// CAGES grid so every animal's bowl sits right next to (or in) its own cage,
// instead of one shared bowl per section. Turtles are excluded: a turtle on
// its water-tank island can't walk over to a bowl the way a land animal can,
// so they're fed differently (a piece of lettuce dropped into the tank —
// see KennelScene._feedTurtleTank). Snakes stay on dry sand/perch, so a
// regular per-cage bowl still works fine for them.
function bowlSpotForCage(cage) {
  return { x: cage.x + cage.w - 6, y: cage.y + cage.h - 4 };
}
export const BOWL_SPOTS = Object.fromEntries(
  ['guineaPig', 'hamster', 'bunny', 'snake', 'cat', 'dog', 'bird'].map((key) => [key, CAGES[key].map(bowlSpotForCage)]),
);

// Turtle feeding spot (issue #20 follow-up): a little lettuce-leaf marker at
// the tank's edge — interact here to drop in a piece of lettuce, which every
// hungry turtle in the tank drifts over to eat (KennelScene._feedTurtleTank).
export const TURTLE_FEED_SPOT = {
  x: TURTLE.tank.x + TURTLE.tank.w - 18,
  y: TURTLE.tank.y + 18,
};

// ── Outside yard (issue #20) ─────────────────────────────────────────────────
// The outside grass strip (data/sections.js's OUTSIDE/WORLD) is the real play
// space for any species now. A single movable divider prop splits it into two
// zones by default ("two zones, but generalizable so they can be split
// however the player puts them") — the divider only ever moves along x, and
// a drop point's zone is just "which side of the divider's current x". See
// KennelScene for the carry/drop logic that moves it.
export const YARD_MARGIN = 40;
export const YARD_DIVIDER_DEFAULT_X = OUTSIDE.x + OUTSIDE.w / 2;
export const YARD_DIVIDER_Y0 = ROOM.y + YARD_MARGIN;
export const YARD_DIVIDER_Y1 = ROOM.y + ROOM.h - YARD_MARGIN;

// The reception computer (issue #10) — "the player has a computer... to send
// a message with a picture of the babies to the owners" (DESIGN.md). Sits on
// the right side of the reception desk, clear of the desk's own graphics.
export const COMPUTER_SPOT = {
  x: RECEPTION.desk.x + RECEPTION.desk.w - 22,
  y: RECEPTION.desk.y + 6,
};

// ── Back wing furniture (issue #13) ─────────────────────────────────────────
// The storage room's shelves/boxes are purely atmospheric fixed dressing; the
// house's oven/counter is the one real interactive spot — interact there to
// bake a treat, which then sits as a tray on the counter until it either gets
// eaten (not modeled) or a raccoon sneaks in and steals it.

export const OVEN_SPOT = { x: HOUSE_ROOM.x + HOUSE_ROOM.w * 0.62, y: HOUSE_ROOM.y + HOUSE_ROOM.h * 0.36 };
// Solid counter/oven obstacle — same idea as the reception desk.
export const OVEN = { x: OVEN_SPOT.x - 24, y: OVEN_SPOT.y - 34, w: 56, h: 40 };
// Where the baked treat tray appears, just beside the oven on the counter.
export const TREAT_TRAY_SPOT = { x: OVEN_SPOT.x - 38, y: OVEN_SPOT.y + 2 };

// Fixed shelves/box/bag dressing scattered around the storage room.
export const STORAGE_PROPS = [
  { key: 'shelf', x: STORAGE_ROOM.x + 20, y: STORAGE_ROOM.y + 46 },
  { key: 'shelf', x: STORAGE_ROOM.x + 20, y: STORAGE_ROOM.y + 166 },
  { key: 'boxes', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.55, y: STORAGE_ROOM.y + STORAGE_ROOM.h - 30 },
  { key: 'boxes', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.78, y: STORAGE_ROOM.y + 120 },
  { key: 'bag', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.4, y: STORAGE_ROOM.y + STORAGE_ROOM.h - 26 },
];
