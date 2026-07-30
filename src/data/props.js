// Kennel furniture layout — pure geometry, no Phaser. Derived from
// data/sections.js the same way wallRects()/backWingWallRects() are: plain
// rects that both KennelScene's rendering and its interaction/collision code
// can share, so the numbers only live in one place.
import {
  RECEPTION, CAGES_PER_SECTION, STORAGE_ROOM, HOUSE_ROOM, ROOM, OUTSIDE, SECTIONS,
} from './sections.js';

// ── The cage grid (issue #18, reworked into one single grid by issue #32) ──
// Every species gets a fixed CAGES_PER_SECTION (6) individual cages — "a
// cage to sleep" for every animal, auto-assigned on drop-off, one per stay
// (her babies/eggs share it, same as today's "near mom" rendering).
//
// Issue #32 ("get rid of the south room and the main room floor tile areas...
// move the modular cages to a clean consistent set of rows and columns just
// north of the check-in desk"): the old 8 separate walled per-species rooms,
// and later the separate south "Cage Hall" room, are both gone — there's
// only ONE cage grid now, laid out directly in the main room, and any pet
// can go in any open cage regardless of species (no clustering). Same
// (sectionKey, slot) identity/bookkeeping data/roster.js already used for
// both of those — a stay's `location`/`cageSlot` still just means "species
// key s's Nth nominal cage" — only the physical (x, y) position changes.
//
// 8 species x CAGES_PER_SECTION(6) = 48 cages, laid out as a flat 8-column x
// 6-row grid (48 cells exactly), each cell a clean uniform 100x100 (owner:
// "the kennels themselves need to be smaller... like 100x100"), with a
// consistent gap between cells, centered in the room's open floor north of
// the reception desk, spanning roughly the same overall area the old 8
// sections used to occupy.
const CAGE_COLS = 8;
const CAGE_ROWS = 6; // 8*6 = 48 = SECTIONS.length * CAGES_PER_SECTION
export const CAGE_W = 100;
export const CAGE_H = 100;
const CAGE_GAP = 12;
const CAGE_GRID_W = CAGE_COLS * CAGE_W + (CAGE_COLS - 1) * CAGE_GAP;
const CAGE_GRID_H = CAGE_ROWS * CAGE_H + (CAGE_ROWS - 1) * CAGE_GAP;
// Centered horizontally in the room's interior; vertically just below the
// north wall, ending well clear of the reception desk/rug below it.
const CAGE_ORIGIN_X = ROOM.w / 2 - CAGE_GRID_W / 2;
const CAGE_ORIGIN_Y = ROOM.y + 48;

export const CAGES = Object.fromEntries(
  SECTIONS.map((s, si) => [
    s.key,
    Array.from({ length: CAGES_PER_SECTION }, (_, slot) => {
      const idx = si * CAGES_PER_SECTION + slot;
      const col = idx % CAGE_COLS;
      const row = Math.floor(idx / CAGE_COLS);
      return {
        x: CAGE_ORIGIN_X + col * (CAGE_W + CAGE_GAP),
        y: CAGE_ORIGIN_Y + row * (CAGE_H + CAGE_GAP),
        w: CAGE_W,
        h: CAGE_H,
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
// every species key (not just 'cat') because a cat can end up settled in
// ANY cage slot — mirrors exactly how BOWL_SPOTS covers every key regardless
// of who's actually placed there.
export const LITTER_BOX_SIZE = { w: 40, h: 24 };
function litterBoxSpotForCage(cage) {
  return { x: cage.x + cage.w * 0.26, y: cage.y + cage.h * 0.46 };
}
export const LITTER_SPOTS = Object.fromEntries(
  Object.keys(CAGES).map((key) => [key, CAGES[key].map(litterBoxSpotForCage)]),
);

// Scooper pickup prop (issue #32: the dog section it used to be tucked into
// no longer exists — relocated to a small stand just outside the cage
// grid's entrance, on the walk-in side facing reception). Purely for the cat
// litter box now — dogs' only potty pathway is the outside leash walk (see
// needs.bathroom).
export const SCOOPER_SPOT = { x: CAGE_ORIGIN_X - 22, y: CAGE_ORIGIN_Y + CAGE_GRID_H - 30 };

// One food/water bowl SPRITE spot per individual cage slot (issue #22 #6,
// refined by owner note 2026-07-29: "the interact point should be the cage,
// not the food bowl... don't need to be there before placing the animal").
// This is purely where the bowl sprite visually sits; KennelScene now
// targets the cage's own rect (cageAnimalSpot) for the feeding INTERACTION,
// and only creates a bowl sprite here once a stay is actually settled in
// that cage slot (destroying it again once the cage goes empty) — see
// KennelScene._refreshBowls.
//
// Issue #32 #4: turtles now get the exact same per-cage bowl as everyone
// else (the old shared-tank/lettuce-drop mechanic is gone — see
// BOWL_ELIGIBLE_KEYS below).
//
// Issue #32 #6: recentered from a corner to bottom-center (owner note
// 2026-07-29: "food water bowls should be more centered on each cage") —
// food sits just left of center, water just right (see
// waterBowlSpotForCage below), side by side near the bottom so the two
// stay visually distinct without overlapping.
function bowlSpotForCage(cage) {
  return { x: cage.x + cage.w / 2 - 12, y: cage.y + cage.h - 8 };
}
const BOWL_ELIGIBLE_KEYS = ['turtle', 'guineaPig', 'hamster', 'bunny', 'snake', 'cat', 'dog', 'bird'];
export const BOWL_SPOTS = Object.fromEntries(
  BOWL_ELIGIBLE_KEYS.map((key) => [key, CAGES[key].map(bowlSpotForCage)]),
);

// Water bowl SPRITE spot (owner note 2026-07-29: "same with water bowls" —
// filling/drinking should work identically to food, as its own separate
// interactable). Issue #32 #6: sits just right of bottom-center, right next
// to the (also recentered) food bowl at cage.w/2 - 12 — same y, mirrored
// x-offset, so the two sit side by side near the cage's bottom-center
// without overlapping. Same species list as BOWL_SPOTS.
function waterBowlSpotForCage(cage) {
  return { x: cage.x + cage.w / 2 + 12, y: cage.y + cage.h - 8 };
}
export const WATER_BOWL_SPOTS = Object.fromEntries(
  BOWL_ELIGIBLE_KEYS.map((key) => [key, CAGES[key].map(waterBowlSpotForCage)]),
);

// ── Outside yard (issue #20, yard bowls added by issue #32's follow-up) ────
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

// Issue #32 follow-up ("in the outdoor play area, there should be food and
// water bowls available for general animal use"): one food+water pair per
// yard zone. Fixed, not derived from the divider's current y — the divider
// only ever clamps to ROOM.y+64..ROOM.y+ROOM.h-64 (KennelScene._dropDivider),
// so a spot near the very top of the yard is always above even the highest
// the divider can sit (always in the "top" zone), and a spot near the very
// bottom is always below even the lowest the divider can sit (always in the
// "bottom" zone) — no per-frame recomputation needed as the fence moves.
export const YARD_BOWL_SPOTS = {
  top: {
    food:  { x: YARD_DIVIDER_X0 + 40, y: ROOM.y + 40 },
    water: { x: YARD_DIVIDER_X0 + 70, y: ROOM.y + 40 },
  },
  bottom: {
    food:  { x: YARD_DIVIDER_X0 + 40, y: ROOM.y + ROOM.h - 40 },
    water: { x: YARD_DIVIDER_X0 + 70, y: ROOM.y + ROOM.h - 40 },
  },
};

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

// Owner note 2026-07-29: "is there a way to initiate sleep for the player
// character? there should be" — the player's own bed, on the opposite side
// of the house room from the oven. Once every present animal is tucked in
// for the night, interacting here is what actually starts the sleep
// sequence (see KennelScene._checkAllTuckedIn/_beginSleep) — it no longer
// happens automatically the instant the last blanket goes on.
export const BED_SPOT = { x: HOUSE_ROOM.x + HOUSE_ROOM.w * 0.18, y: HOUSE_ROOM.y + HOUSE_ROOM.h * 0.62 };
// Solid bed obstacle — same idea as OVEN.
export const BED = { x: BED_SPOT.x - 26, y: BED_SPOT.y - 30, w: 52, h: 36 };

// Fixed shelves/box/bag dressing scattered around the storage room.
export const STORAGE_PROPS = [
  { key: 'shelf', x: STORAGE_ROOM.x + 20, y: STORAGE_ROOM.y + 46 },
  { key: 'shelf', x: STORAGE_ROOM.x + 20, y: STORAGE_ROOM.y + 166 },
  { key: 'boxes', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.55, y: STORAGE_ROOM.y + STORAGE_ROOM.h - 30 },
  { key: 'boxes', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.78, y: STORAGE_ROOM.y + 120 },
  { key: 'bag', x: STORAGE_ROOM.x + STORAGE_ROOM.w * 0.4, y: STORAGE_ROOM.y + STORAGE_ROOM.h - 26 },
];
