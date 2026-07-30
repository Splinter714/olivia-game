// Per-section furniture layout — pure geometry, no Phaser. Derived from
// data/sections.js's SECTIONS the same way penRects()/wallRects() are: plain
// rects that both KennelScene's rendering and its interaction/collision code
// can share, so the numbers only live in one place.
import {
  SECTIONS, RECEPTION, CAGES_PER_SECTION, STORAGE_ROOM, HOUSE_ROOM, ROOM, OUTSIDE,
  WALL, CAGE_HALL,
} from './sections.js';

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
// (including turtle/snake as of issue #20) gets one. Used for NORMAL ("By
// Type") mode — untouched by the Cage Hall rework below (owner note
// 2026-07-29: normal mode stays exactly as it is today).
export const CAGES = Object.fromEntries(
  SECTIONS.map((s) => [s.key, cageGrid(cageAreaFor(s.key), 3, 2, 8, 8)]), // 3x2 = CAGES_PER_SECTION
);

// ── Unified cage grid (Mix Cages mode, owner note 2026-07-29) ───────────────
// "Make the whole place just a big grid of empty cages with halls... between
// them" — a completely separate position set (not a resize of the 8
// sections above) laid out inside CAGE_HALL (sections.js), a brand-new room
// appended south of the main building. Same (sectionKey, slot) identity as
// CAGES (roster.js's occupancy bookkeeping doesn't change — a stay's
// `location`/`cageSlot` still means "section s's Nth nominal cage"), just a
// different on-screen position for that identity while generalized mode is
// on. KennelScene swaps which of CAGES/UNIFIED_CAGES it reads from (and
// re-renders every settled stay + re-positions every cage/bowl/litter sprite)
// the instant the mode toggles — see its _activeCages().
//
// 8 sections x CAGES_PER_SECTION(6) = 48 cages, laid out as a flat 8-column x
// 6-row grid (48 cells exactly) — no clustering by species (owner: "no
// residual per-section identity in the layout"). Each cell is exactly
// GENERALIZED_CAGE_W/H (167x167, art/props.js) with an 8px gap, sized to
// fill CAGE_HALL's interior edge-to-edge: 8*167 + 7*8 = 1392 = CAGE_HALL.w -
// 2*WALL, and 6*167 + 5*8 = 1042 = CAGE_HALL.h - 2*WALL.
const UNIFIED_COLS = 8;
const UNIFIED_ROWS = 6; // 8*6 = 48 = SECTIONS.length * CAGES_PER_SECTION
const UNIFIED_CELL = 167; // matches art/props.js's GENERALIZED_CAGE_W/H exactly
const UNIFIED_GAP = 8;
const UNIFIED_ORIGIN_X = CAGE_HALL.x + WALL;
const UNIFIED_ORIGIN_Y = CAGE_HALL.y + WALL;

export const UNIFIED_CAGES = Object.fromEntries(
  SECTIONS.map((s, si) => [
    s.key,
    Array.from({ length: CAGES_PER_SECTION }, (_, slot) => {
      const idx = si * CAGES_PER_SECTION + slot;
      const col = idx % UNIFIED_COLS;
      const row = Math.floor(idx / UNIFIED_COLS);
      return {
        x: UNIFIED_ORIGIN_X + col * (UNIFIED_CELL + UNIFIED_GAP),
        y: UNIFIED_ORIGIN_Y + row * (UNIFIED_CELL + UNIFIED_GAP),
        w: UNIFIED_CELL,
        h: UNIFIED_CELL,
      };
    }),
  ]),
);

// Where an animal sprite stands inside a cage rect (origin 0.5, 1 — feet on
// the ground, matching every other placed sprite).
export function cageAnimalSpot(cage) {
  return { x: cage.x + cage.w / 2, y: cage.y + cage.h - 6 };
}

// Small per-cage litter box (owner note 2026-07-29: "each cat cage should
// have a small litter box, not a corner everyone litter box") — same
// occupancy-driven create/destroy/reskin pattern as bowlSpotForCage/
// BOWL_SPOTS below, just gated on species === 'cat' (KennelScene
// ._refreshLitterBoxes) rather than the whole bowl-eligible list, and one
// spot per cage instead of two (no separate water variant). Computed for
// every section key (not just 'cat') because in generalized mode a cat can
// end up settled in ANY section's nominal slot — mirrors exactly how
// BOWL_SPOTS covers every key regardless of who's actually placed there.
export const LITTER_BOX_SIZE = { w: 40, h: 24 };
function litterBoxSpotForCage(cage) {
  return { x: cage.x + cage.w * 0.26, y: cage.y + cage.h * 0.46 };
}
export const LITTER_SPOTS = Object.fromEntries(
  Object.keys(CAGES).map((key) => [key, CAGES[key].map(litterBoxSpotForCage)]),
);
export const LITTER_SPOTS_UNIFIED = Object.fromEntries(
  Object.keys(UNIFIED_CAGES).map((key) => [key, UNIFIED_CAGES[key].map(litterBoxSpotForCage)]),
);

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

// One food/water bowl SPRITE spot per individual cage slot (issue #22 #6,
// refined by owner note 2026-07-29: "the interact point should be the cage,
// not the food bowl... don't need to be there before placing the animal").
// This is purely where the bowl sprite visually sits; KennelScene now
// targets the cage's own rect (cageAnimalSpot) for the feeding INTERACTION,
// and only creates a bowl sprite here once a stay is actually settled in
// that cage slot (destroying it again once the cage goes empty) — see
// KennelScene._refreshBowls. Turtles are excluded: a turtle on its
// water-tank island can't walk over to a bowl the way a land animal can, so
// they're fed differently (a piece of lettuce dropped into the tank — see
// KennelScene._feedTurtleTank). Snakes stay on dry sand/perch, so a regular
// per-cage bowl still works fine for them.
//
// Issue #32 #6: recentered from a corner to bottom-center (owner note
// 2026-07-29: "food water bowls should be more centered on each cage") —
// food sits just left of center, water just right (see
// waterBowlSpotForCage below), side by side near the bottom so the two
// stay visually distinct without overlapping.
function bowlSpotForCage(cage) {
  return { x: cage.x + cage.w / 2 - 12, y: cage.y + cage.h - 8 };
}
const BOWL_ELIGIBLE_KEYS = ['guineaPig', 'hamster', 'bunny', 'snake', 'cat', 'dog', 'bird'];
export const BOWL_SPOTS = Object.fromEntries(
  BOWL_ELIGIBLE_KEYS.map((key) => [key, CAGES[key].map(bowlSpotForCage)]),
);
// Mix Cages counterpart (owner note 2026-07-29) — same per-slot corner spot,
// computed against UNIFIED_CAGES' hall positions instead. KennelScene picks
// whichever of these matches the live mode (see _activeBowlSpots).
export const BOWL_SPOTS_UNIFIED = Object.fromEntries(
  BOWL_ELIGIBLE_KEYS.map((key) => [key, UNIFIED_CAGES[key].map(bowlSpotForCage)]),
);

// Water bowl SPRITE spot (owner note 2026-07-29: "same with water bowls" —
// filling/drinking should work identically to food, as its own separate
// interactable). Issue #32 #6: sits just right of bottom-center, right next
// to the (also recentered) food bowl at cage.w/2 - 12 — same y, mirrored
// x-offset, so the two sit side by side near the cage's bottom-center
// without overlapping. Same species list/turtle exclusion as BOWL_SPOTS
// (turtles have no bowl of any kind — see the comment above).
function waterBowlSpotForCage(cage) {
  return { x: cage.x + cage.w / 2 + 12, y: cage.y + cage.h - 8 };
}
export const WATER_BOWL_SPOTS = Object.fromEntries(
  BOWL_ELIGIBLE_KEYS.map((key) => [key, CAGES[key].map(waterBowlSpotForCage)]),
);
export const WATER_BOWL_SPOTS_UNIFIED = Object.fromEntries(
  BOWL_ELIGIBLE_KEYS.map((key) => [key, UNIFIED_CAGES[key].map(waterBowlSpotForCage)]),
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
// however the player puts them") — the divider is a HORIZONTAL fence line
// that only ever moves along y, and a drop point's zone is just "which side
// of the divider's current y" (top/bottom, not left/right). See KennelScene
// for the carry/drop logic that moves it.
export const YARD_MARGIN = 40;
export const YARD_DIVIDER_DEFAULT_Y = ROOM.y + ROOM.h / 2;
export const YARD_DIVIDER_X0 = OUTSIDE.x + YARD_MARGIN;
export const YARD_DIVIDER_X1 = OUTSIDE.x + OUTSIDE.w - YARD_MARGIN;

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
// Where the baked treat tray appears, sitting on the counter's own surface —
// not on the floor. drawOven (art/props.js) draws the countertop strip at
// local y 0.5h-0.62h within its 40px-tall sprite (origin 0,1 at OVEN_SPOT), so
// the counter's top edge sits at world y = OVEN_SPOT.y - 40 + 0.5*40 =
// OVEN_SPOT.y - 20; owner note 2026-07-29 ("the cookies just going on the
// ground next to the oven is crazy") — the old spot (OVEN_SPOT.y + 2) was
// below the whole sprite, on the floor.
export const TREAT_TRAY_SPOT = { x: OVEN_SPOT.x - 10, y: OVEN_SPOT.y - 19 };

// Fixed shelves/box/bag dressing scattered around the storage room.
export const STORAGE_PROPS = [
  { key: 'shelf', x: STORAGE_ROOM.x + 20, y: STORAGE_ROOM.y + 46 },
  { key: 'shelf', x: STORAGE_ROOM.x + 20, y: STORAGE_ROOM.y + 166 },
  { key: 'boxes', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.55, y: STORAGE_ROOM.y + STORAGE_ROOM.h - 30 },
  { key: 'boxes', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.78, y: STORAGE_ROOM.y + 120 },
  { key: 'bag', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.4, y: STORAGE_ROOM.y + STORAGE_ROOM.h - 26 },
];
