// Kennel furniture layout — pure geometry, no Phaser. Derived from
// data/sections.js the same way wallRects()/backWingWallRects() are: plain
// rects that both KennelScene's rendering and its interaction/collision code
// can share, so the numbers only live in one place.
import {
  RECEPTION, CAGES_PER_SECTION, STORAGE_ROOM, HOUSE_ROOM, ROOM, OUTSIDE, SECTIONS, WALL,
  BACK_DOOR,
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
// SECTIONS.length species x CAGES_PER_SECTION(6) = one cage per (species,
// slot) pair, laid out as a flat grid of exactly that many cells, each cell a
// clean uniform 100x100 (owner: "the kennels themselves need to be smaller...
// like 100x100"), with a consistent gap between cells, centered in the room's
// open floor north of the reception desk, spanning roughly the same overall
// area the old per-species sections used to occupy.
//
// Issue #28 (adding lizards as a 9th species): these used to be the hardcoded
// literals 8 and 6, which exactly covered the then-8 species' 48 cages — a 9th
// species' extra 6 cages would have silently overflowed past the last row the
// arithmetic allocated. They're derived from the real species list now — one
// column per SPECIES, one row per CAGE SLOT — so COLS*ROWS always equals
// SECTIONS.length * CAGES_PER_SECTION exactly, for any species count, and
// nobody's cages can fall off the end. (The flat index below still fills the
// grid row-major, so a given species' six cages are NOT a single column and
// aren't clustered — issue #32 made any pet placeable in any open cage, so
// where a slot physically sits carries no species meaning.)
//
// Room fit, 9 species (checked explicitly rather than eyeballed):
//   interior width  = ROOM.w - 2*WALL = 1440 - 48 = 1392
//   grid width      = 9*100 + 8*12 = 996  ->  198px clear on each side
//   grid height     = 6*100 + 5*12 = 660  (unchanged by the extra column)
//   grid top        = ROOM.y + 48 = 428   (24px below the north wall's inner
//                                          face at ROOM.y + WALL = 404)
//   grid bottom     = 428 + 660 = 1088    (42px above the reception desk's top
//                                          edge at ROOM.y + 750 = 1130; the rug
//                                          starts at 1210, the mat at 1316)
// So the 9x6 grid clears the north wall, both side walls and the whole
// reception cluster. Headroom for later species: a 13th column would need
// 1444 > 1392 and would have to shrink CAGE_GAP or CAGE_W instead.
const CAGE_COLS = SECTIONS.length;
const CAGE_ROWS = CAGES_PER_SECTION;
export const CAGE_W = 100;
export const CAGE_H = 100;
const CAGE_GAP = 12;
const CAGE_GRID_W = CAGE_COLS * CAGE_W + (CAGE_COLS - 1) * CAGE_GAP;
const CAGE_GRID_H = CAGE_ROWS * CAGE_H + (CAGE_ROWS - 1) * CAGE_GAP;
// Centered horizontally in the room's interior; vertically just below the
// north wall, ending well clear of the reception desk/rug below it. The
// max() is a floor, not a layout choice: at today's 9 columns the centered
// origin (222) is far clear of the west wall's inner face (WALL = 24), but if
// a future species count ever pushed the grid wider than the interior, this
// keeps its left edge out of the wall instead of drawing cages inside it.
const CAGE_ORIGIN_X = Math.max(WALL + 4, ROOM.w / 2 - CAGE_GRID_W / 2);
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

// Issue #57 (owner: "mamas with eggs — the eggs should not move with them to
// the play area, they should stay in their cage"): where a clutch sits inside
// its cage. Eggs used to be drawn as part of the MOTHER (KennelScene's
// _renderStay `extras`), which meant they travelled out to the yard with her.
// They're cage furniture now, like the bowls and the litter box, so this is
// their fixed home: nestled toward the middle-right of the cage floor, clear
// of the two bowls along the bottom edge (cage.w/2 ± 12, cage.h - 8) and the
// litter box over at 0.26w/0.46h.
export function cageEggSpot(cage) {
  return { x: cage.x + cage.w * 0.64, y: cage.y + cage.h * 0.58 };
}
// Horizontal spacing between eggs in a clutch laid out around that spot.
export const CAGE_EGG_SPACING = 10;

// Where the nameplate hangs on a cage (issue #42: mounted top-center, reading
// as a plate on the cage door). Issue #64 (owner: "name tag should remain on
// an assigned cage no matter what — even if they just arrived or if they're
// currently held") makes it cage furniture rather than part of the animal's
// own sprite record, so it stays put while she's out in the yard, mid-walk,
// or in the player's hands.
export function cagePlateSpot(cage) {
  return { x: cage.x + cage.w / 2, y: cage.y + 18 };
}

// Issue #54 (owner: "assignment order should be bottom row first, left to
// right"): the order cages get handed out in, as a flat list of
// `{ sectionKey, slot }` identities — the BOTTOM row of the grid (the one
// nearest the reception desk, i.e. visually lowest / highest y) first, filled
// left to right, then the row above it, and so on upward.
//
// This has to live here, next to the layout it inverts. A cage's bookkeeping
// identity is still the `(sectionKey, slot)` pair data/roster.js and
// KennelScene use everywhere else, but that pair says NOTHING about where the
// cage physically sits: CAGES above flattens (speciesIndex, slot) to
// `idx = speciesIndex * CAGES_PER_SECTION + slot` and then lays idx out
// row-major, so a single species' six cages are scattered across the grid and
// iterating sections-then-slots visits physical positions in a jumbled order.
// Inverting that flattening (`si = floor(idx / CAGES_PER_SECTION)`,
// `slot = idx % CAGES_PER_SECTION`) is exact for any species count, since
// CAGE_COLS * CAGE_ROWS === SECTIONS.length * CAGES_PER_SECTION by
// construction — nothing here assumes today's 9x6.
export const CAGE_ASSIGN_ORDER = (() => {
  const order = [];
  for (let row = CAGE_ROWS - 1; row >= 0; row--) {
    for (let col = 0; col < CAGE_COLS; col++) {
      const idx = row * CAGE_COLS + col;
      order.push({
        sectionKey: SECTIONS[Math.floor(idx / CAGES_PER_SECTION)].key,
        slot: idx % CAGES_PER_SECTION,
      });
    }
  }
  return order;
})();

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
// Every cage-slot key gets bowl bookkeeping — a stay's slot key is only her
// NOMINAL cage, not her species (issue #32: any pet, any open cage), so a key
// missing from this list means whoever lands there gets no bowl sprite at all
// (the coverage bug written up in KennelScene._refreshBowls). Issue #28's
// lizard is here for exactly that reason as much as for lizards themselves.
const BOWL_ELIGIBLE_KEYS = ['turtle', 'guineaPig', 'hamster', 'bunny', 'snake', 'cat', 'dog', 'bird', 'lizard'];
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
// space for any species.
//
// Issue #47 (owner: "remove the horizontal line splitting the play area, all
// 1 area"): the movable horizontal divider prop that used to split this into
// a top/bottom zone pair is gone entirely — no divider position, no per-zone
// rects, no per-zone bowls. YARD_RECT below is the whole play area, one
// undivided space every yard-placed animal shares.
export const YARD_MARGIN = 40;
export const YARD_X0 = OUTSIDE.x + YARD_MARGIN;
export const YARD_X1 = OUTSIDE.x + OUTSIDE.w - YARD_MARGIN;

// The single play area: the full grass strip inset by the fence margin, used
// for placement grid slots and wander bounds alike (KennelScene).
export const YARD_RECT = {
  x: YARD_X0,
  y: ROOM.y + 14,
  w: YARD_X1 - YARD_X0,
  h: ROOM.h - 28,
};

// ── The gate itself (issue #55) ────────────────────────────────────────────
// Owner: "there should be a closeable door to the outside play area, and if
// it is closed when someone drops off their pet, they instead drop their pet
// off at the pet's assigned cage." Asked what happens if you then open a
// pet's cage: "she stays in her cage" — so this is a real gate on yard
// access, not just a check-in routing flag.
//
// The leaf exactly fills the BACK_DOOR gap in the east wall when it's shut,
// which is what lets KennelScene drop it straight into the collision/routing
// obstacle list alongside the wall segments either side of it.
export const YARD_DOOR = {
  x: ROOM.w - WALL,
  y: BACK_DOOR.y0,
  w: WALL,
  h: BACK_DOOR.y1 - BACK_DOOR.y0,
};

// Where the leaf sits once it's swung open: hinged on the gap's north post
// and standing out into the grass, so "open" reads at a glance from across
// the room rather than being the mere absence of a door. Decorative only —
// nothing collides with it.
export const YARD_DOOR_LEAF = { w: 60, h: 16 };
export const YARD_DOOR_OPEN_POS = { x: ROOM.w + 1, y: BACK_DOOR.y0 - 1 };

// ── The yard's gate (issue #61) ───────────────────────────────────────────
// Owner: "owners should drop off their pets right at the opening of the
// playpen, not weirdly/unnecessarily top left."
//
// The yard's one and only entrance is the BACK_DOOR gap in the building's
// east wall (data/sections.js), so that's where a pet is actually let go when
// she's brought out — by her arriving owner (KennelScene._runOwnerDropOff),
// or by letting herself out of an opened cage (_openCage). The old behavior
// filled a placement grid over YARD_RECT in index order, which put the first
// arrivals in the yard's far TOP-LEFT corner regardless of where the door is:
// the owner visibly walked past the gate and trudged up to a corner.
//
// `index` fans simultaneous arrivals out over a handful of offsets around the
// gate so two pets delivered at the same moment don't stack on one another.
// Once she's down she wanders the whole yard on her own anyway (issue #60),
// so this only has to read as "let go just outside the gate".
const YARD_GATE_Y = (BACK_DOOR.y0 + BACK_DOOR.y1) / 2;
const YARD_GATE_FAN = [
  { dx: 8, dy: 0 },
  { dx: 34, dy: -36 },
  { dx: 34, dy: 36 },
  { dx: 66, dy: -12 },
  { dx: 66, dy: 18 },
  { dx: 14, dy: -68 },
  { dx: 14, dy: 68 },
  { dx: 98, dy: -44 },
  { dx: 98, dy: 44 },
];

export function yardGateSpot(index = 0) {
  const fan = YARD_GATE_FAN[index % YARD_GATE_FAN.length];
  const wrap = Math.floor(index / YARD_GATE_FAN.length) * 30;
  return clampToYard(
    YARD_RECT.x + fan.dx + wrap + (Math.random() - 0.5) * 10,
    YARD_GATE_Y + fan.dy + (Math.random() - 0.5) * 10,
  );
}

// Keeps any yard placement (a gate drop, or the player setting a pet down
// wherever she's standing) inside the fenced play area.
export function clampToYard(x, y) {
  return {
    x: Math.min(Math.max(x, YARD_RECT.x + 6), YARD_RECT.x + YARD_RECT.w - 6),
    y: Math.min(Math.max(y, YARD_RECT.y + 6), YARD_RECT.y + YARD_RECT.h - 6),
  };
}

// Issue #32 follow-up ("in the outdoor play area, there should be food and
// water bowls available for general animal use"), collapsed to ONE pair by
// issue #47 now that there are no zones: a single high-capacity food+water
// pair for the whole yard, keeping the "one fill satisfies every hungry
// animal out there" behavior (KennelScene._autoResolveYardBowls).
//
// Parked down at the yard's bottom-left corner, well clear of the gate
// (YARD_GATE_Y, roughly the yard's vertical middle) where pets are set down
// — a bowl within interact range of a just-delivered animal would make "fill
// the bowl" and "pick her up" fight over the same button press. (Issue #61
// moved the drop point from the yard's top row to the gate; this pair stays
// where it was, which is still the furthest corner from it.)
export const YARD_BOWL_SPOTS = {
  food:  { x: YARD_X0 + 40, y: ROOM.y + ROOM.h - 60 },
  water: { x: YARD_X0 + 70, y: ROOM.y + ROOM.h - 60 },
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
// of the house room from the oven. Once every pet is back home in her cage
// for the night (issue #45), interacting here is what actually starts the
// sleep sequence (see KennelScene._checkAllSettled/_beginSleep).
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
