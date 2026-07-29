// Kennel layout — pure data + geometry, no Phaser. Section positions live here
// (not in the scene) so later phases can attach cages, tanks, and playpens to
// the same rects. All coordinates are logical world px.

export const WALL = 24;    // outer wall thickness
export const PEN_T = 12;   // low pen-wall thickness
export const PEN_GAP = 90; // walk-in opening in each pen wall

// Issue #17 ("zoom" / bigger world): the animal-art rewrite already made
// animals render ~2x bigger on screen via supersampling + display-scale, so
// the camera itself stays untouched (see KennelScene — no zoom beyond DPR).
// This is the other half: the building grows enough for individual cages
// (issue #18) plus a little walking room, WITHOUT the large empty floor areas
// the original 1280x960 layout had — each section is sized to snugly fit its
// 6-cage grid (data/props.js), and sections are packed with just enough gap
// between them for a walkway/door, not open lawn. Revised after an owner note
// mid-build: prioritize a tight, walkable layout over generous open space —
// less trekking between chores, for a kid player.
export const ROOM = { w: 1440, h: 1000 };     // the kennel building interior
export const OUTSIDE = { x: ROOM.w, w: 700 }; // grass strip east of the building

// Back wing (issue #13): a two-room area behind (south of) the main kennel
// building — a supply-storage room and the player's house/kitchen. It shares
// ROOM's south wall as its own north wall (no separate wall drawn there),
// the same trick OUTSIDE uses for the east wall/BACK_DOOR gap — the wing
// simply begins where that wall's gap lets you through.
export const BACK_WING = { x: 0, y: ROOM.h, w: ROOM.w, h: 380 };

// Staff door: gap in ROOM's south wall leading down into the back wing.
// Sits under the open hallway south of the dog section (clear of every
// section's own footprint and of the reception desk/rug), well clear of the
// (still-solid, visual-only) FRONT_DOOR further west.
export const STAFF_DOOR = { x0: 1140, x1: 1280 };

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

export const WORLD = { w: ROOM.w + OUTSIDE.w, h: ROOM.h + BACK_WING.h };

// Fixed capacity of individual cages/tank-slots per section (issue #18) —
// once a section holds 6 settled stays, that species quietly stops arriving
// (data/roster.js's spawnArrival) until a cage frees up at checkout.
export const CAGES_PER_SECTION = 6;

// Gap in the east wall — the door to the outside grass (dog potty walks, issue #19).
// Centered on the dog section's y-range (see SECTIONS below).
export const BACK_DOOR = { y0: 415, y1: 575 };

// Front door on the south wall — visual only for now (the player can't leave
// through it); owners will arrive here in Phase B. Centered under the
// reception mat.
export const FRONT_DOOR = { x0: 575, x1: 715 };

// Reception / front-desk area, just inside the front door, in the open
// central hallway between the west (turtle/bunny/cat) and east
// (hamster/dog) section columns. The computer for baby announcements
// (Phase C+) sits on this desk.
export const RECEPTION = {
  desk: { x: 555, y: 750, w: 170, h: 64 },
  rug:  { x: 520, y: 830, w: 240, h: 110 },
  mat:  { x: 600, y: 936, w: 90,  h: 36 },
};

// Seven species sections, packed tightly (32px walkway gaps) instead of spread
// across a big open floor — turtle/guineaPig/hamster along the top, bunny/cat
// stacked in the west column below turtle, dog on the east column below
// hamster (flush against the back-door wall for potty trips). `opening` names
// the pen-wall side with the walk-in gap; sides flush against an outer wall
// get no pen wall (the room wall serves). floor/floorDark are the section's
// floor-tile colours (worldArt reads them). guineaPig/hamster/bunny/turtle
// are all sized to snugly fit a 3x2 cage grid (data/props.js); cat/dog are
// taller to also fit their shared playpen above their cage row.
//
// Issue #14: snakes were slotted into the top-right corner — the empty span
// of hallway east of the hamster section and north of the dog section —
// mirroring the turtle section's top-left corner placement (same size, same
// flush-to-outer-wall + 'south' opening), just reflected onto the opposite
// side of the room. This is a minimal fit, not the general layout tightening
// the owner deferred to his own guidance later.
export const SECTIONS = [
  // Will hold the water tank (glass cover + sand island) in a later phase.
  { key: 'turtle',    label: '🐢 Turtles',     floor: 0x9fd4c6, floorDark: 0x93c8ba, rect: { x: 24,   y: 24,  w: 304, h: 228 }, opening: 'south' },
  { key: 'guineaPig', label: '🐹 Guinea Pigs', floor: 0xeec08a, floorDark: 0xe2b47e, rect: { x: 360,  y: 24,  w: 304, h: 228 }, opening: 'south' },
  { key: 'hamster',   label: '🐹 Hamsters',    floor: 0xeedc9e, floorDark: 0xe2d092, rect: { x: 696,  y: 24,  w: 304, h: 228 }, opening: 'south' },
  // Top-right corner, flush against the north + east walls — mirrors turtle's
  // top-left corner placement (flush north + west) at the same size.
  { key: 'snake',     label: '🐍 Snakes',      floor: 0xc7cf8e, floorDark: 0xbac07f, rect: { x: 1112, y: 24,  w: 304, h: 228 }, opening: 'south' },
  { key: 'bunny',     label: '🐰 Bunnies',     floor: 0xf0c2cc, floorDark: 0xe4b6c0, rect: { x: 24,   y: 284, w: 304, h: 228 }, opening: 'east' },
  // Cat playpen attaches here in a later phase.
  { key: 'cat',       label: '🐱 Cats',        floor: 0xcfc0e8, floorDark: 0xc3b4dc, rect: { x: 24,   y: 544, w: 368, h: 422 }, opening: 'east' },
  // Dog playpen later; deliberately next to the back door for potty trips.
  { key: 'dog',       label: '🐶 Dogs',        floor: 0xaac8e6, floorDark: 0x9ebcda, rect: { x: 1048, y: 284, w: 368, h: 422 }, opening: 'west' },
];

// Pen-wall rects for a section: thin walls on every side not flush with an
// outer room wall, with a PEN_GAP opening centered on the `opening` side.
export function penRects({ rect, opening }) {
  const { x, y, w, h } = rect;
  const out = [];
  const touching = {
    north: y <= WALL,
    south: y + h >= ROOM.h - WALL,
    west:  x <= WALL,
    east:  x + w >= ROOM.w - WALL,
  };
  const side = (name, rx, ry, rw, rh, horizontal) => {
    if (touching[name]) return;
    if (opening !== name) { out.push({ x: rx, y: ry, w: rw, h: rh }); return; }
    if (horizontal) {
      const gx = x + w / 2 - PEN_GAP / 2;
      out.push({ x: rx, y: ry, w: gx - rx, h: rh });
      out.push({ x: gx + PEN_GAP, y: ry, w: rx + rw - (gx + PEN_GAP), h: rh });
    } else {
      const gy = y + h / 2 - PEN_GAP / 2;
      out.push({ x: rx, y: ry, w: rw, h: gy - ry });
      out.push({ x: rx, y: gy + PEN_GAP, w: rw, h: ry + rh - (gy + PEN_GAP) });
    }
  };
  side('north', x, y, w, PEN_T, true);
  side('south', x, y + h - PEN_T, w, PEN_T, true);
  side('west', x, y, PEN_T, h, false);
  side('east', x + w - PEN_T, y, PEN_T, h, false);
  return out;
}

// Outer building walls; the east wall splits around the back-door gap, the
// south wall splits around the staff-door gap into the back wing (issue #13).
export function wallRects() {
  return [
    { x: 0, y: 0, w: ROOM.w, h: WALL },                                          // north
    { x: 0, y: ROOM.h - WALL, w: STAFF_DOOR.x0, h: WALL },                       // south (west of staff door)
    { x: STAFF_DOOR.x1, y: ROOM.h - WALL, w: ROOM.w - STAFF_DOOR.x1, h: WALL },  // south (east of staff door)
    { x: 0, y: 0, w: WALL, h: ROOM.h },                                          // west
    { x: ROOM.w - WALL, y: 0, w: WALL, h: BACK_DOOR.y0 },                        // east (above door)
    { x: ROOM.w - WALL, y: BACK_DOOR.y1, w: WALL, h: ROOM.h - BACK_DOOR.y1 },    // east (below door)
  ];
}

// Back wing's own outer walls (south/west/east) plus the storage/house
// dividing wall — same split-around-a-gap pattern as wallRects' door
// segments. The wing's north side is ROOM's own south wall above (with the
// STAFF_DOOR gap already carved there), so no separate wall is drawn here.
export function backWingWallRects() {
  const { x, y, w, h } = BACK_WING;
  const divX = x + w / 2;
  return [
    { x, y: y + h - WALL, w, h: WALL },                                    // south
    { x, y, w: WALL, h },                                                  // west
    { x: x + w - WALL, y, w: WALL, h },                                    // east
    { x: divX - WALL / 2, y, w: WALL, h: WING_DOOR.y0 - y },               // divider (above door)
    { x: divX - WALL / 2, y: WING_DOOR.y1, w: WALL, h: y + h - WING_DOOR.y1 }, // divider (below door)
  ];
}

// Fence around the outside grass strip (the building wall closes its west side).
export function outsideFenceRects() {
  return [
    { x: OUTSIDE.x, y: 0, w: OUTSIDE.w, h: 12 },
    { x: OUTSIDE.x, y: ROOM.h - 12, w: OUTSIDE.w, h: 12 },
    { x: WORLD.w - 12, y: 0, w: 12, h: ROOM.h },
  ];
}
