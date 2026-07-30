// Kennel layout — pure data + geometry, no Phaser. Building/room positions
// live here (not in the scene) so later phases can attach furniture to the
// same rects. All coordinates are logical world px.

export const WALL = 24;    // outer wall thickness

// Issue #17 ("zoom" / bigger world): the animal-art rewrite already made
// animals render ~2x bigger on screen via supersampling + display-scale, so
// the camera itself stays untouched (see KennelScene — no zoom beyond DPR).
// This is the other half: the building grows enough for individual cages
// (issue #18) plus a little walking room, WITHOUT the large empty floor areas
// the original 1280x960 layout had. Revised after an owner note mid-build:
// prioritize a tight, walkable layout over generous open space — less
// trekking between chores, for a kid player.
// Issue #23: the back wing moved from south of the main room to the TOP of
// the screen (north of it). Rather than redesign the wing or ROOM's internal
// layout, ROOM.y is a real vertical offset — every coordinate below that used
// to be authored against an implicit y:0 at ROOM's own top wall now adds
// ROOM.y, and the wing itself sits at y:0..ROOM.y, right where ROOM's top
// wall used to be. Every rect's width/height/relative layout is unchanged —
// this is a pure block shift, not a re-layout.
export const ROOM = { y: 380, w: 1440, h: 1000 }; // the kennel building interior; y == the wing's height (BACK_WING.h below)

export const OUTSIDE = { x: ROOM.w, w: 700 }; // grass strip east of the building

// Back wing (issue #13, repositioned north by issue #23): a two-room area
// above the main kennel building — a supply-storage room and the player's
// house/kitchen. It shares ROOM's north wall as its own south wall (no
// separate wall drawn there), the same trick OUTSIDE uses for the east
// wall/BACK_DOOR gap — the wing simply ends where that wall's gap lets you
// through, at ROOM.y.
export const BACK_WING = { x: 0, y: 0, w: ROOM.w, h: ROOM.y };

// Staff door: gap in ROOM's north wall leading up into the back wing (still
// landing inside HOUSE_ROOM, the wing's east/kitchen side — see WING_DIVIDE_X
// below). Issue #23 moved this gap from ROOM's south wall to its north wall;
// the south wall had 274px of buffered hallway below the dog section there
// (clear of every section's footprint), but the same x-range on the north
// wall now runs directly behind the flush-north snake section (issue #14) —
// so unlike every other rect in this file, this one couldn't just carry its
// old numbers over. Re-homed to the 112px hallway between hamster (ends 1000)
// and snake (starts 1112), the only gap in the new top row wide enough for a
// walk-in doorway.
export const STAFF_DOOR = { x0: 1006, x1: 1106 };

// Internal wall splitting the wing into the storage room (west, entered via
// the house) and the house/kitchen (east, just inside the staff door), with
// its own doorway between the two.
const WING_DIVIDE_X = BACK_WING.x + BACK_WING.w / 2;
export const WING_DOOR = { y0: BACK_WING.y + 150, y1: BACK_WING.y + 270 };

export const STORAGE_ROOM = {
  x: WALL, y: BACK_WING.y + WALL,
  w: WING_DIVIDE_X - WALL - WALL / 2, h: BACK_WING.h - WALL * 2,
};
export const HOUSE_ROOM = {
  x: WING_DIVIDE_X + WALL / 2, y: BACK_WING.y + WALL,
  w: BACK_WING.x + BACK_WING.w - WALL - (WING_DIVIDE_X + WALL / 2), h: BACK_WING.h - WALL * 2,
};

export const WORLD = { w: ROOM.w + OUTSIDE.w, h: ROOM.y + ROOM.h };

// Fixed capacity of individual cages/tank-slots per species (issue #18) —
// once a species holds 6 settled stays, it quietly stops arriving
// (data/roster.js's spawnArrival) until a cage frees up at checkout.
export const CAGES_PER_SECTION = 6;

// Gap in the east wall — the door to the outside grass (dog potty walks, issue #19).
export const BACK_DOOR = { y0: ROOM.y + 415, y1: ROOM.y + 575 };

// Front door on the south wall — visual only for now (the player can't leave
// through it); owners will arrive here in Phase B. Centered under the
// reception mat. (x-only, unaffected by the vertical shift.)
export const FRONT_DOOR = { x0: 575, x1: 715 };

// Reception / front-desk area, just inside the front door, in the open
// central hallway. The computer for baby announcements (Phase C+) sits on
// this desk.
export const RECEPTION = {
  desk: { x: 555, y: ROOM.y + 750, w: 170, h: 64 },
  rug:  { x: 520, y: ROOM.y + 830, w: 240, h: 110 },
  mat:  { x: 600, y: ROOM.y + 936, w: 90,  h: 36 },
};

// Issue #32: species metadata only — the old per-species walled rooms (each
// with its own floor tint, pen walls, and label) are gone entirely, replaced
// by one single modular cage grid (data/props.js's CAGES) that any species
// can occupy in any open slot. `SECTIONS` now exists purely so roster.js
// (arrival rolls, per-species cage-capacity bookkeeping) and KennelScene
// (messaging like "{label} is full") have a species key/label list — no
// geometry left here at all.
export const SECTIONS = [
  { key: 'turtle',    label: '🐢 Turtles' },
  { key: 'guineaPig', label: '🐹 Guinea Pigs' },
  { key: 'hamster',   label: '🐹 Hamsters' },
  { key: 'snake',     label: '🐍 Snakes' },
  { key: 'bunny',     label: '🐰 Bunnies' },
  { key: 'bird',      label: '🐦 Birds' },
  { key: 'cat',       label: '🐱 Cats' },
  { key: 'dog',       label: '🐶 Dogs' },
];

// Outer building walls; the east wall splits around the back-door gap, the
// north wall splits around the staff-door gap up into the back wing (issue
// #13, repositioned north by issue #23) — FRONT_DOOR stays purely
// visual/solid, unaffected.
export function wallRects() {
  return [
    { x: 0, y: ROOM.y, w: STAFF_DOOR.x0, h: WALL },                                    // north (west of staff door)
    { x: STAFF_DOOR.x1, y: ROOM.y, w: ROOM.w - STAFF_DOOR.x1, h: WALL },                // north (east of staff door)
    { x: 0, y: ROOM.y + ROOM.h - WALL, w: ROOM.w, h: WALL },                            // south
    { x: 0, y: ROOM.y, w: WALL, h: ROOM.h },                                            // west
    { x: ROOM.w - WALL, y: ROOM.y, w: WALL, h: BACK_DOOR.y0 - ROOM.y },                 // east (above door)
    { x: ROOM.w - WALL, y: BACK_DOOR.y1, w: WALL, h: ROOM.y + ROOM.h - BACK_DOOR.y1 },  // east (below door)
  ];
}

// Back wing's own outer walls (north/west/east) plus the storage/house
// dividing wall — same split-around-a-gap pattern as wallRects' door
// segments. The wing's south side is ROOM's own north wall below (with the
// STAFF_DOOR gap already carved there), so no separate wall is drawn here.
export function backWingWallRects() {
  const { x, y, w, h } = BACK_WING;
  const divX = x + w / 2;
  return [
    { x, y, w, h: WALL },                                                     // north (wing's own outer wall)
    { x, y, w: WALL, h },                                                     // west
    { x: x + w - WALL, y, w: WALL, h },                                       // east
    { x: divX - WALL / 2, y, w: WALL, h: WING_DOOR.y0 - y },                  // divider (above door)
    { x: divX - WALL / 2, y: WING_DOOR.y1, w: WALL, h: y + h - WING_DOOR.y1 }, // divider (below door)
  ];
}

// Fence around the outside grass strip (the building wall closes its west side).
export function outsideFenceRects() {
  return [
    { x: OUTSIDE.x, y: ROOM.y, w: OUTSIDE.w, h: 12 },
    { x: OUTSIDE.x, y: ROOM.y + ROOM.h - 12, w: OUTSIDE.w, h: 12 },
    { x: WORLD.w - 12, y: ROOM.y, w: 12, h: ROOM.h },
  ];
}
