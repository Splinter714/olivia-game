// Kennel layout — pure data + geometry, no Phaser. Section positions live here
// (not in the scene) so later phases can attach cages, tanks, and playpens to
// the same rects. All coordinates are logical world px.

export const WALL = 20;    // outer wall thickness
export const PEN_T = 10;   // low pen-wall thickness
export const PEN_GAP = 80; // walk-in opening in each pen wall

export const ROOM = { w: 1280, h: 960 };      // the kennel building interior
export const OUTSIDE = { x: ROOM.w, w: 380 }; // grass strip east of the building
export const WORLD = { w: ROOM.w + OUTSIDE.w, h: ROOM.h };

// Gap in the east wall — the door to the outside grass (future dog potty trips).
export const BACK_DOOR = { y0: 660, y1: 740 };

// Front door on the south wall — visual only for now (the player can't leave
// through it); owners will arrive here in Phase B.
export const FRONT_DOOR = { x0: 555, x1: 725 };

// Reception / front-desk area, just inside the front door. The computer for
// baby announcements (Phase C+) will sit on this desk.
export const RECEPTION = {
  desk: { x: 560, y: 690, w: 140, h: 56 },
  rug:  { x: 550, y: 770, w: 180, h: 84 },
  mat:  { x: 605, y: 908, w: 70,  h: 26 },
};

// Six species sections. `opening` names the pen-wall side with the walk-in gap;
// sides flush against an outer wall get no pen wall (the room wall serves).
// floor/floorDark are the section's floor-tile colours (worldArt reads them).
export const SECTIONS = [
  // Will hold the water tank (glass cover + sand island) in a later phase.
  { key: 'turtle',    label: '🐢 Turtles',     floor: 0x9fd4c6, floorDark: 0x93c8ba, rect: { x: 20,  y: 20,  w: 300, h: 240 }, opening: 'south' },
  { key: 'guineaPig', label: '🐹 Guinea Pigs', floor: 0xeec08a, floorDark: 0xe2b47e, rect: { x: 380, y: 20,  w: 300, h: 240 }, opening: 'south' },
  { key: 'hamster',   label: '🐹 Hamsters',    floor: 0xeedc9e, floorDark: 0xe2d092, rect: { x: 740, y: 20,  w: 300, h: 240 }, opening: 'south' },
  { key: 'bunny',     label: '🐰 Bunnies',     floor: 0xf0c2cc, floorDark: 0xe4b6c0, rect: { x: 20,  y: 360, w: 280, h: 260 }, opening: 'east' },
  // Cat playpen attaches here in a later phase.
  { key: 'cat',       label: '🐱 Cats',        floor: 0xcfc0e8, floorDark: 0xc3b4dc, rect: { x: 20,  y: 680, w: 280, h: 260 }, opening: 'east' },
  // Dog playpen later; deliberately next to the back door for potty trips.
  { key: 'dog',       label: '🐶 Dogs',        floor: 0xaac8e6, floorDark: 0x9ebcda, rect: { x: 980, y: 360, w: 280, h: 260 }, opening: 'west' },
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

// Outer building walls; the east wall splits around the back-door gap.
export function wallRects() {
  return [
    { x: 0, y: 0, w: ROOM.w, h: WALL },                                          // north
    { x: 0, y: ROOM.h - WALL, w: ROOM.w, h: WALL },                              // south
    { x: 0, y: 0, w: WALL, h: ROOM.h },                                          // west
    { x: ROOM.w - WALL, y: 0, w: WALL, h: BACK_DOOR.y0 },                        // east (above door)
    { x: ROOM.w - WALL, y: BACK_DOOR.y1, w: WALL, h: ROOM.h - BACK_DOOR.y1 },    // east (below door)
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
