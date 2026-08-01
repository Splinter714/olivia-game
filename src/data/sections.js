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
//
// Issue #71 grew ROOM.h from 1000 to 1220. The owner asked for a horizontal
// aisle between EVERY row of cages plus a vertical one down the middle, and
// for those aisles to be genuinely walkable — wide enough for a dog, not just
// decorative. Six rows of 100px cages plus five 52px aisles is 860px of grid,
// and the old room only had 726px of clear floor above the reception desk, so
// it simply did not fit: keeping the cages at the 100x100 the owner asked for
// (issue #32) meant the building had to grow. Everything below that's
// expressed as an offset from ROOM.y (the reception cluster) moved down with
// it; everything expressed in terms of ROOM.h (the walls, the outside fence,
// the yard) followed automatically.
export const ROOM = { y: 380, w: 1440, h: 1220 }; // the kennel building interior; y == the wing's height (BACK_WING.h below)

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

// (Issue #71 removed CAGES_PER_SECTION. Cages were a per-species reservation
// — six slots nominally belonging to each species — which stopped meaning
// anything the moment issue #32 let any pet take any open cage, and the owner
// finished the job here: "we don't need a per-species cap, just random
// whatever, and yes fewer total guests." Capacity is now simply how many
// physical cages exist, data/props.js's CAGE_COUNT.)

// Gap in the east wall — the door to the outside grass (dog potty walks, issue
// #19), with a closeable gate across it as of issue #55. Centered on the
// building's height so it stays put in the middle of the east wall regardless
// of how tall the room is (issue #71 made it taller).
export const BACK_DOOR = { y0: ROOM.y + ROOM.h / 2 - 80, y1: ROOM.y + ROOM.h / 2 + 80 };

// Front door on the south wall — visual only for now (the player can't leave
// through it); owners will arrive here in Phase B. Centered under the
// reception mat. (x-only, unaffected by the vertical shift.)
export const FRONT_DOOR = { x0: 575, x1: 715 };

// Reception / front-desk area, just inside the front door, in the open
// central hallway. The computer for baby announcements (Phase C+) sits on
// this desk.
// Issue #71: the whole cluster shifted 218px down (750 -> 968 and friends),
// keeping its internal spacing exactly as it was, to clear the taller cage
// grid above it — the aisle layout pushed the grid's bottom edge from 1088 to
// 1288, and the desk used to start at 1130.
export const RECEPTION = {
  desk: { x: 555, y: ROOM.y + 968, w: 170, h: 64 },
  rug:  { x: 520, y: ROOM.y + 1048, w: 240, h: 110 },
  mat:  { x: 600, y: ROOM.y + 1154, w: 90,  h: 36 },
};

// (Issue #71 removed SECTIONS entirely. Issue #32 had already stripped it to
// species metadata — the per-species walled rooms, floor tints and pen walls
// were long gone — leaving a key/label list that survived only because a
// cage's bookkeeping identity was still `(species, slot)`. With cages a flat
// pool that anyone can take, nothing consults it: species rolls read
// data/species.js's SPECIES_KEYS, which is the real list, and there is no
// per-species capacity left to message about.)

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
