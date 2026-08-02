// Procedural textures for kennel furniture added by issues #6/#7/#8/#13/#14/
// #20/#32: the single modular cage grid (with turtle/snake islands/perches
// and the secret dragon's castle as per-species cage looks), litter box,
// scooper, food/water bowls (cage + yard), potty messes, the back-wing
// kitchen/storage dressing/bed, and the small "needs attention" bubbles. Same gen()-into-a-texture pattern as art/kennel.js /
// art/animals.js.
import { gen } from './_gen.js';
import {
  LITTER_BOX_SIZE, CAGE_W, CAGE_H, OVEN, BED, YARD_DOOR, YARD_DOOR_LEAF, POND_SIZE,
  POND_WATER_FRAC,
} from '../data/props.js';
import { SPECIES_KEYS } from '../data/species.js';

// Issue #71: cage LOOKS are per species, but cages themselves no longer are —
// a cage is a position in a flat pool that anyone can occupy, so these are
// keyed off the species list directly rather than off the (previously
// species-keyed) CAGES structure. `dragon` is the secret bonus guest, who has
// no place in the regular species rotation but still needs her own cage art.
const CAGE_ART_KEYS = [...SPECIES_KEYS, 'dragon'];

export const LITTER_BOX_KEY = 'prop-litter-box';
export const BOWL_KEY = 'prop-bowl';
// Species-informed bowl variants (issue #22 #6 follow-up, owner note
// 2026-07-29: "the food bowls should be informed based on the animal that's
// placed"). A lightweight per-species reskin of the same bowl silhouette —
// hay-rack for guinea pig/bunny, seed dish for birds, a kibble mound for
// cats/dogs, a small plain dish for hamsters. Snake (and any species with no
// entry here, e.g. the secret dragon) keeps the original plain BOWL_KEY —
// see BOWL_KEY_BY_SPECIES below.
export const BOWL_HAY_KEY = 'prop-bowl-hay';
export const BOWL_SEED_KEY = 'prop-bowl-seed';
export const BOWL_KIBBLE_KEY = 'prop-bowl-kibble';
export const BOWL_SIMPLE_KEY = 'prop-bowl-simple';
// species key -> bowl texture key. KennelScene._refreshBowls looks up the
// stay actually settled in a cage and picks her bowl art from here, falling
// back to plain BOWL_KEY for anything not listed (snake, the secret dragon).
export const BOWL_KEY_BY_SPECIES = {
  guineaPig: BOWL_HAY_KEY,
  bunny: BOWL_HAY_KEY,
  bird: BOWL_SEED_KEY,
  cat: BOWL_KIBBLE_KEY,
  dog: BOWL_KIBBLE_KEY,
  hamster: BOWL_SIMPLE_KEY,
  // Issue #32 #4: turtles get a regular per-cage bowl now too (the old
  // shared-tank/lettuce mechanic is gone) — a small plain dish, same as
  // hamster, since no turtle-specific look was called out.
  turtle: BOWL_SIMPLE_KEY,
  // Issue #28: lizards get the same small plain dish (owner asked only for
  // "ordinary per-cage bowls" and "whatever fits the style" — a shallow dish
  // in a terrarium needs no new art).
  lizard: BOWL_SIMPLE_KEY,
  // Issue #77: fish reuse the generic feeding system as-is (#44) — same small
  // plain dish, no tank-specific feeding mechanic.
  fish: BOWL_SIMPLE_KEY,
};
// Empty counterparts of every food-bowl variant above (owner note 2026-07-29:
// "filling a bowl and an animal eating from it should be decoupled" — the
// bowl now needs to visibly read as full vs. empty). Same dish silhouette,
// just missing the food itself. KennelScene._refreshBowls picks full vs.
// empty per stay.bowl.food.
export const BOWL_EMPTY_KEY = 'prop-bowl-empty';
export const BOWL_HAY_EMPTY_KEY = 'prop-bowl-hay-empty';
export const BOWL_SEED_EMPTY_KEY = 'prop-bowl-seed-empty';
export const BOWL_KIBBLE_EMPTY_KEY = 'prop-bowl-kibble-empty';
export const BOWL_SIMPLE_EMPTY_KEY = 'prop-bowl-simple-empty';
export const BOWL_EMPTY_KEY_BY_SPECIES = {
  guineaPig: BOWL_HAY_EMPTY_KEY,
  bunny: BOWL_HAY_EMPTY_KEY,
  bird: BOWL_SEED_EMPTY_KEY,
  cat: BOWL_KIBBLE_EMPTY_KEY,
  dog: BOWL_KIBBLE_EMPTY_KEY,
  hamster: BOWL_SIMPLE_EMPTY_KEY,
  turtle: BOWL_SIMPLE_EMPTY_KEY,
  lizard: BOWL_SIMPLE_EMPTY_KEY,
  fish: BOWL_SIMPLE_EMPTY_KEY,
};
// Water bowl (owner note 2026-07-29: "same with water bowls") — one shared
// blue-tinted dish look, full/empty, for every bowl-eligible species (no
// per-species variation needed the way food gets — a water dish is a water
// dish).
export const WATER_BOWL_KEY = 'prop-bowl-water';
export const WATER_BOWL_EMPTY_KEY = 'prop-bowl-water-empty';
export const MESS_KEY = 'prop-mess';
export const COMPUTER_KEY = 'prop-computer';
export const BLANKET_KEY = 'prop-blanket';
export const UPGRADE_KEY = 'prop-upgrade-star';
export const OVEN_KEY = 'prop-oven';
export const BED_KEY = 'prop-bed';
// Issue #55: the closeable gate to the outside play area. Two looks, because
// its state has to read at a glance from across the room — shut, it's a
// planked leaf filling the whole doorway in the east wall; open, the same
// leaf is swung out into the grass off its north hinge.
export const YARD_DOOR_CLOSED_KEY = 'prop-yard-door-closed';
export const YARD_DOOR_OPEN_KEY = 'prop-yard-door-open';
export const TREAT_TRAY_KEY = 'prop-treat-tray';
export const SHELF_KEY = 'prop-shelf';
export const BOX_KEY = 'prop-boxes';
export const BAG_KEY = 'prop-bag';
// Issue #77 — fish. TRAVEL_TANK_KEY is the PERSISTENT resting prop (parked
// beside her home tank, or at the pond's edge while she's out playing —
// KennelScene._refreshTravelTank); it's a different, simpler (non-
// supersampled) texture from art/carry.js's CARRY_KEY.tank, which is what
// renders while she's actually being carried, same convention as every
// other prop-vs-carry-art split in this file. WATERPROOF_COVER_KEY stands in
// for BLANKET_KEY on a fish's cage at night — same "tucked in" beat, a
// fitted cover instead of draped fabric, since a blanket doesn't work over a
// tank of water. POND_KEY is the shared yard pond itself.
export const TRAVEL_TANK_KEY = 'prop-travel-tank';
export const WATERPROOF_COVER_KEY = 'prop-waterproof-cover';
export const POND_KEY = 'prop-pond';
// Issue #46: no `tuck` icon anymore — every occupied cage always has a
// blanket and the animal gets under it herself at night, so there's no
// "needs tucking in" chore to flag.
export const NEED_KEY = {
  food: 'need-food', bathroom: 'need-bathroom', water: 'need-water', mail: 'need-mail',
  babies: 'need-babies', checkout: 'need-checkout', photo: 'need-photo',
};

// Issue #32: one single cage grid now (the old per-section "By Type" layout
// and the later separate "Cage Hall" room are both gone) — every cage is the
// same uniform CAGE_W x CAGE_H size (100x100, data/props.js), so one texture
// per species covers all its cages. `CAGE_KEY` also includes an entry for
// the secret bonus dragon (src/dev/secretDragon.js), who has no species
// section of her own but still needs her own themed cage look (see
// drawDragonCastle below) — everyone else's key comes from CAGES' own
// species keys.
//
// Issue #43 (owner: "z order of cage bars should be above everything else in
// the cage, including the animal") — each species' cage art is now split into
// two textures/layers instead of one flat image: `CAGE_KEY` is the
// BACKGROUND half (floor pad / tank water / nest bedding / castle floor —
// stays behind the animal, same depth as before) and `CAGE_FG_KEY` is the
// FOREGROUND half (wire bars / wire mesh / glass-tank rim-and-highlight /
// castle turrets — rendered at a depth ABOVE the animal and her bowls/
// blanket/name-tag icons, so she reads as behind the enclosure looking out).
// See KennelScene._cageImgs/_cageFgImgs and _refreshCageArt for the two
// per-slot images this now produces.
export const CAGE_KEY = Object.fromEntries(
  CAGE_ART_KEYS.map((key) => [key, `prop-cage-${key}`]),
);
export const CAGE_FG_KEY = Object.fromEntries(
  CAGE_ART_KEYS.map((key) => [key, `prop-cage-fg-${key}`]),
);

// Issue #27 ("generalized cages" toggle) / issue #32: ONE shared neutral/
// empty-slot texture (uniform size, no per-species shape) shown for any cage
// with nobody currently assigned to it — there's no species pre-assigned to
// an empty cage, so it gets a single plain, un-themed look everywhere.
//
// Issue #43: the empty look is just a dashed neutral outline — there's no
// separate solid "floor" fill and "bars" element worth splitting the way the
// occupied per-species looks below are, so it stays a single flat texture
// (rendered at the old background depth) rather than getting its own
// foreground layer.
export const EMPTY_CAGE_KEY = 'prop-cage-empty';

// Which draw function renders a given species' cage BACKGROUND art (floor/
// fill/bedding — stays behind the animal, issue #43).
function cageBgDrawFn(key) {
  if (key === 'turtle') return drawIslandSlotBg;
  if (key === 'snake') return drawPerchSlotBg;
  if (key === 'bird') return drawNestSlotBg;
  if (key === 'lizard') return drawTerrariumSlotBg;
  if (key === 'dragon') return drawDragonCastleBg;
  if (key === 'fish') return drawFishTankSlotBg;
  return drawCagePenBg;
}

// Which draw function renders a given species' cage FOREGROUND art (wire
// bars/mesh, glass rim/highlight, castle turrets — renders above the animal,
// issue #43).
function cageFgDrawFn(key) {
  if (key === 'turtle') return drawIslandSlotFg;
  if (key === 'snake') return drawPerchSlotFg;
  if (key === 'bird') return drawNestSlotFg;
  if (key === 'lizard') return drawTerrariumSlotFg;
  if (key === 'dragon') return drawDragonCastleFg;
  if (key === 'fish') return drawFishTankSlotFg;
  return drawCagePenFg;
}

// A small individual water tank with a sand island (issue #20, extended per
// owner note 2026-07-29: "water needs to be added as part of turtle cage
// placement"). Self-contained — the water is baked right into this per-cage
// texture rather than a separate big shared tank background, since (issue
// #32) there's no dedicated turtle section/room left to anchor one to; a
// turtle's cage looks like her own little glass-rimmed pool no matter which
// grid slot she's settled in. Same soft-tan-ellipse island styling as before.
//
// Issue #43 split: the tank body/water fill/sand island/pebbles are the
// BACKGROUND (stays behind the turtle, same look as before); the glass-cover
// highlight rim is the FOREGROUND — "looking at her through glass" — so it
// now renders in front of her instead of being buried under the water fill.
function drawIslandSlotBg(g, w, h) {
  g.fillStyle(0x2d6f8e, 1).fillRoundedRect(0, 0, w, h, 8);
  g.fillStyle(0x4b9fc4, 0.85).fillRoundedRect(2, 2, w - 4, h - 4, 6);
  g.fillStyle(0xcfa15e, 1).fillEllipse(w / 2, h * 0.6, w * 0.7, h * 0.44);
  g.fillStyle(0xe0bd85, 1).fillEllipse(w / 2, h * 0.5, w * 0.56, h * 0.32);
  g.fillStyle(0xb9884b, 1);
  g.fillCircle(w * 0.4, h * 0.52, 1.1);
  g.fillCircle(w * 0.58, h * 0.6, 0.9);
}
function drawIslandSlotFg(g, w, h) {
  g.lineStyle(2, 0xcfe9f2, 0.7).strokeRoundedRect(1, 1, w - 2, h - 2, 7);
}

// A small individual fish tank (issue #77) — one per fish cage slot, directly
// extending the turtle tank treatment above: same glass-rimmed pool base, but
// fully submerged (no sand island to sun on — a fish never comes up for air)
// with a scattering of gravel, a couple of water plants, and rising bubbles
// instead. Same BACKGROUND/FOREGROUND split as every other cage look (issue
// #43): the water/gravel/plants/bubbles are BACKGROUND (behind the fish);
// the glass-cover rim is FOREGROUND, same "looking at her through glass" read
// the turtle tank uses.
function drawFishTankSlotBg(g, w, h) {
  g.fillStyle(0x1f5878, 1).fillRoundedRect(0, 0, w, h, 8);            // tank frame
  g.fillStyle(0x3f8fb8, 0.9).fillRoundedRect(2, 2, w - 4, h - 4, 6);   // deep water fill
  g.fillStyle(0x2a6d90, 0.6).fillRoundedRect(2, 2, w - 4, h * 0.4, 6); // darker band near the surface
  // Gravel bed along the floor.
  g.fillStyle(0xb9a97e, 1).fillRoundedRect(2, h * 0.82, w - 4, h * 0.16, 4);
  g.fillStyle(0x9c8c63, 1);
  for (let gx = w * 0.1; gx < w * 0.9; gx += w * 0.09) g.fillCircle(gx, h * 0.88 + (gx % 2), 1.1);
  // A couple of simple water plants swaying up from the gravel.
  g.fillStyle(0x3f7a3f, 1);
  g.fillRect(w * 0.18, h * 0.52, w * 0.04, h * 0.32);
  g.fillEllipse(w * 0.14, h * 0.54, w * 0.14, w * 0.07);
  g.fillEllipse(w * 0.24, h * 0.6, w * 0.14, w * 0.07);
  g.fillRect(w * 0.78, h * 0.58, w * 0.04, h * 0.26);
  g.fillEllipse(w * 0.82, h * 0.6, w * 0.12, w * 0.06);
  // Rising bubbles.
  g.fillStyle(0xdff5fa, 0.7);
  g.fillCircle(w * 0.42, h * 0.28, 1.3);
  g.fillCircle(w * 0.46, h * 0.18, 1.0);
  g.fillCircle(w * 0.6, h * 0.34, 1.1);
}
function drawFishTankSlotFg(g, w, h) {
  g.lineStyle(2, 0xcfe9f2, 0.7).strokeRoundedRect(1, 1, w - 2, h - 2, 7);
}

// A small individual resting perch (issue #20) — one per snake cage slot, a
// short branch stub. Same self-containment as the turtle island above: bakes
// its own sandy-tank background right in rather than relying on a separate
// shared tank background.
//
// Issue #43 split: same as the turtle tank above — tank body/sand fill/perch
// branch stay BACKGROUND; the glass-cover highlight rim is FOREGROUND.
function drawPerchSlotBg(g, w, h) {
  g.fillStyle(0x8a6a3e, 1).fillRoundedRect(0, 0, w, h, 8);
  g.fillStyle(0xd9c9a0, 0.9).fillRoundedRect(2, 2, w - 4, h - 4, 6);
  g.fillStyle(0x6b4426, 1).fillRoundedRect(w * 0.08, h * 0.42, w * 0.84, h * 0.22, h * 0.1);
  g.fillStyle(0x4f3018, 1);
  g.fillCircle(w * 0.14, h * 0.53, h * 0.15);
  g.fillCircle(w * 0.86, h * 0.53, h * 0.13);
}
function drawPerchSlotFg(g, w, h) {
  g.lineStyle(2, 0xcfe9f2, 0.55).strokeRoundedRect(1, 1, w - 2, h - 2, 7);
}

// A small individual desert terrarium (issue #28) — one per lizard cage slot.
// Same self-contained treatment as the turtle tank and the snake perch above
// (which this is deliberately modeled on): the whole vivarium is baked into
// the per-cage texture, so a lizard's cage looks like her own little glass box
// whichever grid slot she's settled in. Warm sand floor rather than the
// snake's paler tank sand, a flat basking rock to sun herself on, a small
// leafy plant in the corner, and a heat-lamp glow spilling down from the top.
//
// Issue #43 split: sand/rock/plant/lamp glow are BACKGROUND (what she stands
// on and among); the glass pane — its highlight rim plus a diagonal glare
// streak and the lamp fixture itself — is FOREGROUND, so she reads as being
// inside the tank looking out through the glass.
function drawTerrariumSlotBg(g, w, h) {
  g.fillStyle(0x8a7248, 1).fillRoundedRect(0, 0, w, h, 8);                  // tank frame
  g.fillStyle(0xe6c68c, 0.95).fillRoundedRect(2, 2, w - 4, h - 4, 6);       // warm sand fill
  // Heat-lamp glow spilling down from the top of the tank.
  g.fillStyle(0xffd89a, 0.35).fillEllipse(w * 0.5, h * 0.16, w * 0.62, h * 0.34);
  // Scattered grit on the sand.
  g.fillStyle(0xc9a468, 1);
  g.fillCircle(w * 0.22, h * 0.78, 1.2);
  g.fillCircle(w * 0.66, h * 0.86, 1.0);
  g.fillCircle(w * 0.44, h * 0.7, 0.9);
  // Flat basking rock, low and wide across the middle.
  g.fillStyle(0x8e8a82, 1).fillRoundedRect(w * 0.14, h * 0.5, w * 0.5, h * 0.2, h * 0.07);
  g.fillStyle(0xaeaaa0, 1).fillRoundedRect(w * 0.16, h * 0.5, w * 0.46, h * 0.09, h * 0.05); // sunlit top
  // Small leafy plant tucked into the right-hand corner.
  g.fillStyle(0x5e7a34, 1).fillRect(w * 0.79, h * 0.56, w * 0.03, h * 0.24); // stem
  g.fillStyle(0x6f9c3e, 1);
  g.fillEllipse(w * 0.74, h * 0.56, w * 0.16, h * 0.09);
  g.fillEllipse(w * 0.87, h * 0.6, w * 0.15, h * 0.08);
  g.fillEllipse(w * 0.8, h * 0.46, w * 0.13, h * 0.1);
}
function drawTerrariumSlotFg(g, w, h) {
  g.lineStyle(2, 0xcfe9f2, 0.6).strokeRoundedRect(1, 1, w - 2, h - 2, 7);   // glass rim
  g.lineStyle(3, 0xffffff, 0.16).lineBetween(w * 0.18, h * 0.92, w * 0.6, h * 0.1); // glass glare
  // Clamp heat lamp hanging over the tank, its hood doubling as the name-tag
  // mount every other cage look has at top-center.
  g.fillStyle(0x6b6b74, 1).fillRoundedRect(w / 2 - 7, 0, 14, 6, 2);
  g.fillStyle(0xffcf7a, 1).fillEllipse(w / 2, h * 0.07, w * 0.1, h * 0.05);
}

// A small individual twig nest (issue #24) — one per bird cage slot, sitting
// in place of the wire pen every other land species gets. A loosely woven
// ring of twigs on the cage floor, just big enough to hold a bird and its
// eggs/chicks; no wire mesh — birds' cages read as a simple perch-and-nest
// setup rather than the same pen as guinea pigs/hamsters/bunnies/cats/dogs.
//
// Issue #43 split: no wire mesh here, but the woven twig ring still reads as
// the nest's "front edge" once the bird is standing in the middle of it — the
// floor pad/name-tag mount/ring fill/egg hollow are BACKGROUND (the nest bed
// itself), while the crossing twig lines (the ring's visible weave) are
// FOREGROUND, so they read as twigs in front of her rather than a bird
// floating in front of solid ground.
function drawNestSlotBg(g, w, h) {
  g.fillStyle(0xe8d9b0, 1).fillRoundedRect(2, h * 0.5, w - 4, h * 0.46, 4); // floor pad (matches drawCagePen)
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(w / 2 - 5, 0, 10, 6, 2);         // name-tag mount
  // Woven twig ring (solid fill).
  g.fillStyle(0x8a6a3e, 1).fillEllipse(w * 0.5, h * 0.62, w * 0.66, h * 0.4);
  g.fillStyle(0xc79a63, 1).fillEllipse(w * 0.5, h * 0.58, w * 0.5, h * 0.3);
  // Soft hollow in the middle where eggs/chicks sit.
  g.fillStyle(0xf2e6c8, 0.9).fillEllipse(w * 0.5, h * 0.56, w * 0.28, h * 0.16);
}
function drawNestSlotFg(g, w, h) {
  g.lineStyle(1.4, 0x6b4a26, 0.8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.lineBetween(
      w * 0.5 + Math.cos(a) * w * 0.3, h * 0.62 + Math.sin(a) * h * 0.18,
      w * 0.5 - Math.cos(a) * w * 0.3, h * 0.62 - Math.sin(a) * h * 0.18,
    );
  }
}

// Issue #32 #5: the secret bonus dragon (src/dev/secretDragon.js) used to
// just borrow whichever species' cage art the cage she landed in already
// had — she gets her own proper look now, a small gray/stone castle (owner:
// "make the dragon cages like a little gray/stone castle") — a simple
// turret silhouette on a stone-block floor pad, same footprint as every
// other cage so she still fits her grid slot.
//
// Issue #43 split: the stone-block floor pad is BACKGROUND (what she stands
// on); the turret/keep silhouette (with its crenellations and window slits)
// plus the name-tag mount are FOREGROUND — she reads as standing inside a
// castle courtyard, behind its walls looking out.
function drawDragonCastleBg(g, w, h) {
  g.fillStyle(0xc7c7cf, 1).fillRoundedRect(2, h * 0.5, w - 4, h * 0.46, 4); // floor pad (matches drawCagePen)
  // Stone-block texture on the floor pad.
  g.lineStyle(1, 0xa8a8b2, 0.7);
  for (let ry = h * 0.54; ry < h * 0.94; ry += h * 0.14) {
    g.lineBetween(2, ry, w - 2, ry);
  }
  for (let bx = 6; bx < w - 4; bx += 14) g.lineBetween(bx, h * 0.5, bx, h * 0.96);
}
function drawDragonCastleFg(g, w, h) {
  // Turret silhouette: a central keep flanked by two shorter corner towers.
  const towerW = w * 0.2, keepW = w * 0.3;
  const drawTower = (cx, tw, th) => {
    g.fillStyle(0x9a9aa4, 1).fillRect(cx - tw / 2, h * 0.5 - th, tw, th);
    g.fillStyle(0x7c7c86, 1); // crenellations
    const merlon = tw / 4;
    for (let i = 0; i < 3; i++) g.fillRect(cx - tw / 2 + i * merlon * 1.3, h * 0.5 - th - merlon * 0.6, merlon, merlon * 0.6);
    g.fillStyle(0x4a4a54, 1).fillRect(cx - tw * 0.14, h * 0.5 - th * 0.55, tw * 0.28, th * 0.55); // doorway/window slit
  };
  drawTower(w * 0.22, towerW, h * 0.34);
  drawTower(w * 0.5, keepW, h * 0.5);
  drawTower(w * 0.78, towerW, h * 0.34);
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(w / 2 - 5, 0, 10, 6, 2); // name-tag mount
}

function drawLitterBox(g, w, h) {
  g.fillStyle(0x8a8a94, 1).fillRoundedRect(0, 0, w, h, 5);
  g.fillStyle(0xd9c9a0, 1).fillRoundedRect(3, 3, w - 6, h - 6, 3);
  g.fillStyle(0xc9b688, 1);
  g.fillCircle(w * 0.3, h * 0.5, 1.6);
  g.fillCircle(w * 0.55, h * 0.4, 1.4);
  g.fillCircle(w * 0.7, h * 0.6, 1.4);
}

// Every food-bowl variant below takes a `filled` flag (owner note 2026-07-29:
// bowls now need to visibly read as full vs. empty, since filling and eating
// are decoupled events) — `false` draws just the dish, `true` adds the food.

function drawBowl(g, w, h, filled = true) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.62, w, h * 0.7);
  g.fillStyle(0xd7dbe1, 1).fillEllipse(w / 2, h * 0.5, w * 0.86, h * 0.56);
  if (filled) g.fillStyle(0xc08a3e, 1).fillEllipse(w / 2, h * 0.5, w * 0.6, h * 0.34);
}

// Hay-rack look (guinea pig/bunny, issue #22 #6 follow-up) — same bowl
// silhouette as the plain dish, topped with a little tuft of hay instead of
// a food mound.
function drawHayBowl(g, w, h, filled = true) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.62, w, h * 0.7);
  g.fillStyle(0xd7dbe1, 1).fillEllipse(w / 2, h * 0.5, w * 0.86, h * 0.56);
  if (!filled) return;
  g.fillStyle(0xd9c07a, 1).fillEllipse(w / 2, h * 0.48, w * 0.62, h * 0.3);
  g.lineStyle(1.2, 0xb9954f, 0.9);
  for (let i = 0; i < 5; i++) {
    const x0 = w * (0.28 + i * 0.11);
    g.lineBetween(x0, h * 0.5, x0 + (i % 2 ? 3 : -3), h * 0.22);
  }
}

// Seed-dish look (bird): a shallow dish with a scatter of tiny seeds.
function drawSeedBowl(g, w, h, filled = true) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.62, w, h * 0.7);
  g.fillStyle(0xd7dbe1, 1).fillEllipse(w / 2, h * 0.5, w * 0.86, h * 0.56);
  if (!filled) return;
  g.fillStyle(0xdca25a, 1).fillEllipse(w / 2, h * 0.52, w * 0.5, h * 0.24);
  g.fillStyle(0x6b4a26, 1);
  g.fillCircle(w * 0.4, h * 0.5, 0.9);
  g.fillCircle(w * 0.5, h * 0.46, 0.9);
  g.fillCircle(w * 0.6, h * 0.52, 0.9);
}

// Kibble-mound look (cat/dog): a rounder, deeper bowl with a domed pile.
function drawKibbleBowl(g, w, h, filled = true) {
  g.fillStyle(0x8a8a94, 1).fillEllipse(w / 2, h * 0.66, w * 1.05, h * 0.76);
  g.fillStyle(0xc7c9d1, 1).fillEllipse(w / 2, h * 0.54, w * 0.9, h * 0.6);
  if (!filled) return;
  g.fillStyle(0x8a5a34, 1).fillEllipse(w / 2, h * 0.46, w * 0.62, h * 0.38);
  g.fillStyle(0xa9754a, 1);
  g.fillCircle(w * 0.4, h * 0.44, 1.4);
  g.fillCircle(w * 0.5, h * 0.38, 1.4);
  g.fillCircle(w * 0.6, h * 0.46, 1.4);
}

// Simple dish (hamster): smaller and plainer, no food mound at all.
function drawSimpleBowl(g, w, h, filled = true) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.62, w * 0.8, h * 0.6);
  g.fillStyle(0xd7dbe1, 1).fillEllipse(w / 2, h * 0.52, w * 0.64, h * 0.44);
  if (filled) g.fillStyle(0xc08a3e, 1).fillEllipse(w / 2, h * 0.52, w * 0.4, h * 0.2);
}

// Water bowl (owner note 2026-07-29): a plain dish with a blue-tinted water
// fill when stocked, shared across every bowl-eligible species.
function drawWaterBowl(g, w, h, filled = true) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.62, w, h * 0.7);
  g.fillStyle(0xd7dbe1, 1).fillEllipse(w / 2, h * 0.5, w * 0.86, h * 0.56);
  if (!filled) return;
  g.fillStyle(0x4b9fc4, 1).fillEllipse(w / 2, h * 0.5, w * 0.62, h * 0.34);
  g.fillStyle(0xbfe6f2, 0.7).fillEllipse(w * 0.42, h * 0.44, w * 0.2, h * 0.1); // water sheen
}

// The classic soft-serve poop swirl — three stacked, tapering brown ellipses
// with a little curl on top and a highlight down the left for a 3-D read.
// Shared by the "needs to poop" bubble (NEED_KEY.bathroom, issue #50) and,
// per owner note 2026-07-30 ("The poop on the ground and in the cat box
// should be the same icon as the needs to poop icon. The needs to poop icon
// is the better looking one."), the actual ground/litter-box mess sprite
// below — one shape, drawn once, instead of two different blobs.
function drawPoopSwirl(g, w, h) {
  g.fillStyle(0x6b4a2c, 1);
  g.fillEllipse(w * 0.5, h * 0.68, w * 0.62, h * 0.2);  // wide base
  g.fillEllipse(w * 0.5, h * 0.53, w * 0.46, h * 0.18); // middle
  g.fillEllipse(w * 0.5, h * 0.4, w * 0.3, h * 0.15);   // top
  g.fillStyle(0x8a5f38, 1);
  g.fillEllipse(w * 0.5, h * 0.31, w * 0.13, h * 0.1);  // little curl tip
  g.fillStyle(0x8f6540, 0.85);
  g.fillEllipse(w * 0.36, h * 0.66, w * 0.16, h * 0.09);
  g.fillEllipse(w * 0.4, h * 0.51, w * 0.12, h * 0.08);
}

// The ground/litter-box mess sprite — same swirl as the "needs to poop"
// bubble, just without its white speech-bubble backing (this one sits
// directly on the floor/sand, not floating as an indicator).
function drawMess(g, w, h) {
  drawPoopSwirl(g, w, h);
}

// A tiny floating "needs attention" bubble — a bowl icon, a paw print, a
// water droplet, or a little envelope, each on a soft white speech-bubble
// backing so it's readable against any section floor color.
function drawNeedBubble(g, w, h, icon) {
  g.fillStyle(0xffffff, 0.92).fillCircle(w / 2, h / 2 - 1, w / 2 - 1);
  g.lineStyle(1.5, 0x333333, 0.5).strokeCircle(w / 2, h / 2 - 1, w / 2 - 1);
  if (icon === 'food') {
    g.fillStyle(0xc08a3e, 1).fillEllipse(w / 2, h * 0.55, w * 0.5, h * 0.36);
    g.fillStyle(0xe8c68f, 1).fillEllipse(w / 2, h * 0.48, w * 0.36, h * 0.22);
  } else if (icon === 'bathroom') {
    // Issue #50 (owner: "the 'dog needs to poop' icon should be a poop icon
    // instead of whatever it is now") — the classic soft-serve swirl, shared
    // with the actual ground/litter-box mess sprite (drawMess) since issue
    // #68 made them the same icon; see drawPoopSwirl above.
    drawPoopSwirl(g, w, h);
  } else if (icon === 'mail') {
    // A tiny envelope — the reception computer's "needs attention" icon
    // (issue #10: an un-announced birth waiting to be sent to the owner).
    g.fillStyle(0xdd5555, 1).fillRoundedRect(w * 0.2, h * 0.34, w * 0.6, h * 0.4, 2);
    g.fillStyle(0xffe3e3, 1);
    g.fillTriangle(w * 0.2, h * 0.34, w * 0.5, h * 0.58, w * 0.8, h * 0.34);
  } else if (icon === 'babies') {
    // A small pink heart — issue #9 refinement's "ready and needs your
    // help" icon, shown above a mom whose birth timer has expired (or who
    // was flagged during a night wake-up) until the player walks over and
    // interacts to actually have the babies/hatch the eggs.
    g.fillStyle(0xe8779c, 1);
    g.fillCircle(w * 0.38, h * 0.44, w * 0.15);
    g.fillCircle(w * 0.62, h * 0.44, w * 0.15);
    g.fillTriangle(w * 0.24, h * 0.48, w * 0.76, h * 0.48, w * 0.5, h * 0.74);
  } else if (icon === 'checkout') {
    // A tiny house — "ready to go home" icon (issue #36), shown above a
    // settled stay once her checkout is due and a waiting owner has walked
    // in, until the player carries her over to complete the handoff.
    g.fillStyle(0xe0a95e, 1).fillRect(w * 0.28, h * 0.5, w * 0.44, h * 0.32);
    g.fillTriangle(w * 0.22, h * 0.5, w * 0.5, h * 0.26, w * 0.78, h * 0.5);
    g.fillStyle(0x8a5a34, 1).fillRect(w * 0.46, h * 0.62, w * 0.12, h * 0.2);
  } else if (icon === 'photo') {
    // A tiny camera — "take a picture of the babies" icon (issue #37),
    // shown above a mom with new babies/hatchlings until the player walks
    // up and snaps their photo (see KennelScene._takePhoto).
    g.fillStyle(0x4a4a52, 1).fillRoundedRect(w * 0.2, h * 0.4, w * 0.6, h * 0.34, 3);
    g.fillStyle(0x2a2a30, 1).fillRoundedRect(w * 0.34, h * 0.32, w * 0.18, h * 0.1, 2);
    g.fillStyle(0xaee0f0, 1).fillCircle(w * 0.5, h * 0.57, w * 0.14);
    g.fillStyle(0x4a4a52, 1).fillCircle(w * 0.5, h * 0.57, w * 0.08);
  } else { // water
    g.fillStyle(0x4b9fc4, 1);
    g.fillTriangle(w * 0.5, h * 0.24, w * 0.32, h * 0.62, w * 0.68, h * 0.62);
    g.fillCircle(w * 0.5, h * 0.62, w * 0.18);
  }
}

// Simple desk computer — a monitor with a glowing screen and a small stand,
// sitting at the reception desk (issue #10: sending baby-picture messages to
// owners). Deliberately toylike/flat, not a real device.
function drawComputer(g, w, h) {
  g.fillStyle(0x5b5b63, 1).fillRoundedRect(w * 0.4, h * 0.7, w * 0.2, h * 0.26, 2); // stand
  g.fillStyle(0x6b6b76, 1).fillRoundedRect(w * 0.22, h * 0.92, w * 0.56, h * 0.08, 2); // base
  g.fillStyle(0x3a3f52, 1).fillRoundedRect(w * 0.04, h * 0.02, w * 0.92, h * 0.64, 4); // bezel
  g.fillStyle(0x8fd6f2, 1).fillRoundedRect(w * 0.11, h * 0.09, w * 0.78, h * 0.48, 2); // screen
  g.fillStyle(0xffffff, 0.5).fillRect(w * 0.16, h * 0.14, w * 0.3, h * 0.07); // glare
}

// Small soft-fabric sheet — issue #11's tuck-in cover, laid over an animal
// (or wrapped around its eggs/babies, which share the same stay) at night.
// Redrawn per an owner note mid-build to actually read as a cozy draped
// blanket rather than a flat tinted overlay: a rounded cloth body, a
// contrasting trim band along the top hem, a couple of soft fold/wrinkle
// highlights, a shadowed center crease, and a scalloped bottom edge. Scaled
// per-animal at placement time (KennelScene), so one plain blanket shape
// covers every species instead of needing per-species art.
function drawBlanket(g, w, h) {
  // Base cloth body.
  g.fillStyle(0xf2d9a8, 0.97).fillRoundedRect(0, h * 0.14, w, h * 0.72, h * 0.26);
  // Trim band along the top hem.
  g.fillStyle(0xdca25a, 1).fillRoundedRect(0, h * 0.14, w, h * 0.16, h * 0.14);
  // Soft fold/wrinkle highlights.
  g.fillStyle(0xffe9c2, 0.55);
  g.fillRoundedRect(w * 0.1, h * 0.4, w * 0.3, h * 0.14, h * 0.07);
  g.fillRoundedRect(w * 0.56, h * 0.5, w * 0.32, h * 0.14, h * 0.07);
  // Shadowed center crease.
  g.fillStyle(0xc9a15f, 0.55).fillRoundedRect(w * 0.47, h * 0.32, w * 0.05, h * 0.5, h * 0.05);
  // Scalloped bottom hem.
  g.fillStyle(0xf2d9a8, 0.97);
  const scallops = 5;
  for (let i = 0; i < scallops; i++) {
    const cx = (w / scallops) * (i + 0.5);
    g.fillCircle(cx, h * 0.86, w / scallops / 2 + 1);
  }
  g.lineStyle(1.4, 0xc9a15f, 0.9).strokeRoundedRect(1, h * 0.14, w - 2, h * 0.72, h * 0.24);
}

// Issue #77's stand-in for the blanket above, ONLY ever used on a fish's
// cage: a fitted waterproof sheet stretched taut over the tank rather than
// draped fabric (owner: "a piece of waterproof fabric") — a flat taut panel
// with a shiny plastic sheen and elastic-strap corners holding it down, doing
// the exact same job (KennelScene._refreshBlanket's tuckedIn day/night swap)
// with a completely different silhouette.
function drawWaterproofCover(g, w, h) {
  g.fillStyle(0x4a6a78, 0.95).fillRoundedRect(0, 0, w, h, 4);           // taut panel
  g.fillStyle(0x6f97a6, 0.6).fillRoundedRect(2, 2, w - 4, h * 0.42, 3); // plastic sheen near the top
  g.lineStyle(1, 0x33505c, 0.7);
  for (let x = w * 0.18; x < w; x += w * 0.28) g.lineBetween(x, 2, x, h - 2); // taut seam lines
  // Elastic-strap corners.
  g.fillStyle(0x2e454e, 1);
  [[0, 0], [w, 0], [0, h], [w, h]].forEach(([cx, cy]) => g.fillCircle(cx, cy, Math.min(w, h) * 0.12));
}

// Small gold sparkle/star — issue #12's "she's a well-cared-for regular"
// badge. One is rendered per upgrade a returning animal has earned, so they
// visibly stack up next to her sprite across repeat visits (DESIGN.md's
// "every time an animal comes back, their stay gets even better").
function drawUpgradeStar(g, w, h) {
  const cx = w / 2, cy = h / 2;
  g.fillStyle(0xf2c96b, 1);
  g.fillTriangle(cx, 0, cx - w * 0.16, cy, cx + w * 0.16, cy);
  g.fillTriangle(cx, h, cx - w * 0.16, cy, cx + w * 0.16, cy);
  g.fillTriangle(0, cy, cx, cy - h * 0.16, cx, cy + h * 0.16);
  g.fillTriangle(w, cy, cx, cy - h * 0.16, cx, cy + h * 0.16);
  g.fillStyle(0xfff3c9, 1).fillCircle(cx, cy, w * 0.2);
}

// A small, readable wire pen — a floor pad, a wire-mesh frame, and a little
// mount nub at the top center where the animal's name tag hangs (issue #18:
// "a small wire/wood pen shape sized to fit one animal + a name tag mount").
// Deliberately plain/flat so it reads clearly at a glance for a kid player.
//
// Issue #43 split: the floor pad is BACKGROUND (stays behind the animal); the
// wire-mesh frame + bars + name-tag mount are FOREGROUND (the pen's own wire
// boundary, now rendered in front of whoever's inside it).
function drawCagePenBg(g, w, h) {
  g.fillStyle(0xe8d9b0, 1).fillRoundedRect(2, h * 0.5, w - 4, h * 0.46, 4); // floor pad
}
function drawCagePenFg(g, w, h) {
  g.lineStyle(3, 0x8a8a94, 1).strokeRoundedRect(2, 7, w - 4, h - 9, 6);     // wire frame
  g.lineStyle(1.2, 0xb7b7c0, 0.8);
  for (let x = 7; x < w - 5; x += 8) g.lineBetween(x, 9, x, h * 0.5);       // wire bars
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(w / 2 - 5, 0, 10, 6, 2);         // name-tag mount
}

// The house kitchen's one interactive prop (issue #13) — a simple counter
// with an oven built into it; interacting here bakes a treat.
function drawOven(g, w, h) {
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(0, h * 0.55, w, h * 0.45, 4);      // counter base
  g.fillStyle(0xc79a63, 1).fillRoundedRect(0, h * 0.5, w, h * 0.12, 3);       // countertop
  g.fillStyle(0x4a4a52, 1).fillRoundedRect(w * 0.1, 0, w * 0.8, h * 0.52, 4); // oven body
  g.fillStyle(0x2a2a30, 1).fillRoundedRect(w * 0.18, h * 0.14, w * 0.64, h * 0.3, 3); // window
  g.fillStyle(0xe8955a, 0.6).fillRoundedRect(w * 0.22, h * 0.18, w * 0.56, h * 0.22, 3); // warm glow
  g.fillStyle(0xd9d9de, 1);
  g.fillCircle(w * 0.28, h * 0.46, 2).fillCircle(w * 0.5, h * 0.46, 2).fillCircle(w * 0.72, h * 0.46, 2); // knobs
}

// The player's own bed (owner note 2026-07-29: "is there a way to initiate
// sleep for the player character? there should be") — simple flat headboard
// + mattress + pillow + blanket stripe, same plain/flat kid-legible style as
// drawOven above.
function drawBed(g, w, h) {
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(0, h * 0.1, w * 0.14, h * 0.9, 3);       // headboard
  g.fillStyle(0xe8d9b0, 1).fillRoundedRect(w * 0.1, h * 0.28, w * 0.9, h * 0.6, 6); // mattress
  g.fillStyle(0x6a8fd8, 1).fillRoundedRect(w * 0.1, h * 0.58, w * 0.9, h * 0.3, 6); // blanket
  g.fillStyle(0xffffff, 1).fillRoundedRect(w * 0.14, h * 0.32, w * 0.28, h * 0.22, 4); // pillow
}

// Issue #55's yard gate, shut: a tall planked garden gate filling the
// doorway, hinged at the top (north) post, with a little latch on the
// kennel-side edge. Drawn "as seen from inside", i.e. the same top-down-ish
// flat-on treatment the walls use.
function drawYardDoorClosed(g, w, h) {
  g.fillStyle(0x8a5a34, 1).fillRect(0, 0, w, h);                 // leaf
  g.fillStyle(0x6d4526, 1);
  for (let y = 6; y < h - 4; y += 14) g.fillRect(1, y, w - 2, 2); // plank seams
  g.fillStyle(0xa9743f, 1).fillRect(0, 0, 2, h);                 // lit outer edge
  g.fillStyle(0x5c3620, 1).fillRect(w - 2, 0, 2, h);             // shaded inner edge
  // Hinges top and bottom, latch in the middle of the kennel-side edge.
  g.fillStyle(0x9aa0ab, 1);
  g.fillRect(1, 5, w - 2, 3);
  g.fillRect(1, h - 8, w - 2, 3);
  g.fillStyle(0xd8c26a, 1).fillRect(w - 6, h / 2 - 4, 5, 8);
}

// ...and swung open, standing out into the grass off its north hinge: the
// same planked leaf seen end-on, plus the hinge post it pivots around.
function drawYardDoorOpen(g, w, h) {
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(0, 0, w, h, 2);
  g.fillStyle(0x6d4526, 1);
  for (let x = 8; x < w - 4; x += 13) g.fillRect(x, 1, 2, h - 2); // plank seams
  g.fillStyle(0xa9743f, 1).fillRect(0, 0, w, 2);                  // lit top edge
  g.fillStyle(0x5c3620, 1).fillRect(0, h - 2, w, 2);              // shaded bottom
  g.fillStyle(0x9aa0ab, 1).fillCircle(3, h / 2, 3);               // hinge pin
  g.fillStyle(0xd8c26a, 1).fillCircle(w - 4, h / 2, 2);           // latch
}

// A tray of whatever just got baked — one silhouette covers cookies, cake, or
// cupcakes alike (the flavor is only in the notification text). Appears on
// the counter after baking; disappears again if the raccoon steals it.
function drawTreatTray(g, w, h) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.86, w, h * 0.28); // tray
  g.fillStyle(0xd9a45c, 1);
  g.fillCircle(w * 0.32, h * 0.6, w * 0.16);
  g.fillCircle(w * 0.55, h * 0.5, w * 0.18);
  g.fillCircle(w * 0.75, h * 0.62, w * 0.15);
  g.fillStyle(0xb9803c, 0.7);
  g.fillCircle(w * 0.32, h * 0.6, w * 0.06);
  g.fillCircle(w * 0.55, h * 0.5, w * 0.06);
  g.fillCircle(w * 0.75, h * 0.62, w * 0.06);
}

// Storage-room dressing (issue #13, purely atmospheric this pass): plain wire
// shelving with a few labeled supply bins, and loose box/bag piles.
function drawShelf(g, w, h) {
  g.fillStyle(0x8a5a34, 1).fillRect(0, 0, w * 0.08, h).fillRect(w - w * 0.08, 0, w * 0.08, h);
  g.fillStyle(0xb08a5a, 1);
  for (let i = 0; i < 3; i++) g.fillRect(0, h * (0.15 + i * 0.3), w, h * 0.06);
  g.fillStyle(0x6fa8d6, 1).fillRect(w * 0.14, h * 0.02, w * 0.28, h * 0.12);
  g.fillStyle(0xe0a95e, 1).fillRect(w * 0.5, h * 0.02, w * 0.3, h * 0.12);
  g.fillStyle(0xcf6f6f, 1).fillRect(w * 0.14, h * 0.32, w * 0.3, h * 0.12);
  g.fillStyle(0xd9c9a0, 1).fillRect(w * 0.5, h * 0.32, w * 0.32, h * 0.12);
}

function drawBoxStack(g, w, h) {
  g.fillStyle(0xc79a63, 1).fillRect(w * 0.1, h * 0.4, w * 0.8, h * 0.32);
  g.fillStyle(0xb8875a, 1).fillRect(w * 0.02, h * 0.72, w * 0.96, h * 0.26);
  g.lineStyle(1.5, 0x8a5a34, 0.8)
    .strokeRect(w * 0.1, h * 0.4, w * 0.8, h * 0.32)
    .strokeRect(w * 0.02, h * 0.72, w * 0.96, h * 0.26);
}

// Issue #27: a plain dashed-outline empty slot — no species theming, just
// "there's a free cage here" in generalized mode.
function drawEmptyCageSlot(g, w, h) {
  g.fillStyle(0xe4e0d6, 0.45).fillRoundedRect(2, 2, w - 4, h - 4, 8);
  g.lineStyle(2, 0xa8a296, 0.9);
  const dash = 8, gap = 5;
  for (let x = 2; x < w - 2; x += dash + gap) g.lineBetween(x, 2, Math.min(x + dash, w - 2), 2);
  for (let x = 2; x < w - 2; x += dash + gap) g.lineBetween(x, h - 2, Math.min(x + dash, w - 2), h - 2);
  for (let y = 2; y < h - 2; y += dash + gap) g.lineBetween(2, y, 2, Math.min(y + dash, h - 2));
  for (let y = 2; y < h - 2; y += dash + gap) g.lineBetween(w - 2, y, w - 2, Math.min(y + dash, h - 2));
}

function drawBag(g, w, h) {
  g.fillStyle(0xd9c9a0, 1).fillRoundedRect(w * 0.1, h * 0.2, w * 0.8, h * 0.78, 6);
  g.fillStyle(0xb9a678, 1).fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.14);
  g.fillStyle(0x8a5a34, 1).fillCircle(w * 0.5, h * 0.44, w * 0.18);
}

// (Issue #47: the yard divider's post/fence-line art is gone along with the
// divider itself — the play yard is one single undivided area now.)

// Issue #77 — the travel tank's PERSISTENT resting look (parked beside a
// fish's home tank by default, or at the pond's edge while she's out
// playing — KennelScene._refreshTravelTank). Same small glass-tank-with-
// handle silhouette as art/carry.js's supersampled CARRY_KEY.tank (used only
// while she's actually being carried), just drawn with this file's plain,
// non-supersampled technique — the same prop-vs-carry-art split every other
// furniture item in this file already has (e.g. BLANKET_KEY here vs.
// CARRY_KEY.leash/cage/box/basket in carry.js).
function drawTravelTankRest(g, w, h) {
  const waterH = h * 0.6;
  const baseY = h * 0.94;
  g.fillStyle(0x8fa39e, 1).fillRoundedRect(w * 0.06, baseY - h * 0.72, w * 0.88, h * 0.72, 3);
  g.fillStyle(0xbfe6f2, 0.55).fillRoundedRect(w * 0.1, baseY - waterH, w * 0.8, waterH, 2);
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(w * 0.34, baseY - waterH * 0.5, w * 0.04);
  g.fillCircle(w * 0.6, baseY - waterH * 0.72, w * 0.03);
  g.lineStyle(1.6, 0x6b6b76, 1).strokeEllipse(w * 0.5, baseY - h * 0.72, w * 0.7, h * 0.3);
}

// The shared yard pond (issue #77) — a simple round pool with a sandy-stone
// rim, deep-blue water, and a couple of lily pads, same flat/legible style as
// every other yard prop.
// The pond. Issue #84 grew it (POND_SIZE) and made the water an exact,
// enforced boundary rather than decoration — the deep-water ellipse below is
// drawn at data/props.js's POND_WATER_FRAC, which is the SAME number the
// wander clamp (pondSwimArea/clampToPondWater) uses, so what's painted as
// water and what a fish is allowed to swim in can't drift apart.
function drawPond(g, w, h) {
  const ww = w * POND_WATER_FRAC.w;
  const wh = h * POND_WATER_FRAC.h;
  g.fillStyle(0xcbb888, 1).fillEllipse(w / 2, h / 2, w, h);   // stone/sand rim
  g.fillStyle(0x2d6f8e, 1).fillEllipse(w / 2, h / 2, ww, wh); // deep water
  g.fillStyle(0x4b9fc4, 0.7).fillEllipse(w * 0.44, h * 0.42, w * 0.5, h * 0.34); // sheen
  // Lily pads, kept just inside the water's own edge.
  g.fillStyle(0x3f8a4a, 1);
  g.fillEllipse(w * 0.28, h * 0.62, w * 0.16, h * 0.1);
  g.fillEllipse(w * 0.68, h * 0.3, w * 0.14, h * 0.09);
  g.fillStyle(0x2f6b38, 1);
  g.fillEllipse(w * 0.28, h * 0.62, w * 0.05, h * 0.03);
  g.fillEllipse(w * 0.68, h * 0.3, w * 0.045, h * 0.03);
}

export function buildPropTextures(scene) {
  gen(scene, LITTER_BOX_KEY, LITTER_BOX_SIZE.w, LITTER_BOX_SIZE.h, (g) => drawLitterBox(g, LITTER_BOX_SIZE.w, LITTER_BOX_SIZE.h));
  gen(scene, BOWL_KEY, 24, 18, (g) => drawBowl(g, 24, 18, true));
  gen(scene, BOWL_HAY_KEY, 24, 18, (g) => drawHayBowl(g, 24, 18, true));
  gen(scene, BOWL_SEED_KEY, 24, 18, (g) => drawSeedBowl(g, 24, 18, true));
  gen(scene, BOWL_KIBBLE_KEY, 24, 18, (g) => drawKibbleBowl(g, 24, 18, true));
  gen(scene, BOWL_SIMPLE_KEY, 24, 18, (g) => drawSimpleBowl(g, 24, 18, true));
  gen(scene, BOWL_EMPTY_KEY, 24, 18, (g) => drawBowl(g, 24, 18, false));
  gen(scene, BOWL_HAY_EMPTY_KEY, 24, 18, (g) => drawHayBowl(g, 24, 18, false));
  gen(scene, BOWL_SEED_EMPTY_KEY, 24, 18, (g) => drawSeedBowl(g, 24, 18, false));
  gen(scene, BOWL_KIBBLE_EMPTY_KEY, 24, 18, (g) => drawKibbleBowl(g, 24, 18, false));
  gen(scene, BOWL_SIMPLE_EMPTY_KEY, 24, 18, (g) => drawSimpleBowl(g, 24, 18, false));
  gen(scene, WATER_BOWL_KEY, 24, 18, (g) => drawWaterBowl(g, 24, 18, true));
  gen(scene, WATER_BOWL_EMPTY_KEY, 24, 18, (g) => drawWaterBowl(g, 24, 18, false));
  gen(scene, MESS_KEY, 16, 12, (g) => drawMess(g, 16, 12));
  gen(scene, NEED_KEY.food, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'food'));
  gen(scene, NEED_KEY.bathroom, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'bathroom'));
  gen(scene, NEED_KEY.water, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'water'));
  gen(scene, NEED_KEY.mail, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'mail'));
  gen(scene, NEED_KEY.babies, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'babies'));
  gen(scene, NEED_KEY.checkout, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'checkout'));
  gen(scene, NEED_KEY.photo, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'photo'));
  gen(scene, COMPUTER_KEY, 28, 34, (g) => drawComputer(g, 28, 34));
  gen(scene, BLANKET_KEY, 36, 26, (g) => drawBlanket(g, 36, 26));
  gen(scene, WATERPROOF_COVER_KEY, 40, 30, (g) => drawWaterproofCover(g, 40, 30));
  gen(scene, TRAVEL_TANK_KEY, 24, 20, (g) => drawTravelTankRest(g, 24, 20));
  gen(scene, POND_KEY, POND_SIZE.w, POND_SIZE.h, (g) => drawPond(g, POND_SIZE.w, POND_SIZE.h));
  gen(scene, UPGRADE_KEY, 12, 12, (g) => drawUpgradeStar(g, 12, 12));
  gen(scene, OVEN_KEY, OVEN.w, OVEN.h, (g) => drawOven(g, OVEN.w, OVEN.h));
  gen(scene, BED_KEY, BED.w, BED.h, (g) => drawBed(g, BED.w, BED.h));
  gen(scene, YARD_DOOR_CLOSED_KEY, YARD_DOOR.w, YARD_DOOR.h, (g) => drawYardDoorClosed(g, YARD_DOOR.w, YARD_DOOR.h));
  gen(scene, YARD_DOOR_OPEN_KEY, YARD_DOOR_LEAF.w, YARD_DOOR_LEAF.h, (g) => drawYardDoorOpen(g, YARD_DOOR_LEAF.w, YARD_DOOR_LEAF.h));
  gen(scene, TREAT_TRAY_KEY, 26, 16, (g) => drawTreatTray(g, 26, 16));
  gen(scene, SHELF_KEY, 40, 70, (g) => drawShelf(g, 40, 70));
  gen(scene, BOX_KEY, 34, 30, (g) => drawBoxStack(g, 34, 30));
  gen(scene, BAG_KEY, 22, 30, (g) => drawBag(g, 22, 30));

  // Every regular species' cage texture, uniform CAGE_W x CAGE_H (100x100).
  // Issue #43: two textures per species now — a background (floor/fill,
  // stays behind the animal) and a foreground (bars/mesh/glass-rim/turrets,
  // rendered above her — see KennelScene._refreshCageArt).
  for (const key of CAGE_ART_KEYS) {
    const drawBg = cageBgDrawFn(key);
    const drawFg = cageFgDrawFn(key);
    gen(scene, CAGE_KEY[key], CAGE_W, CAGE_H, (g) => drawBg(g, CAGE_W, CAGE_H));
    gen(scene, CAGE_FG_KEY[key], CAGE_W, CAGE_H, (g) => drawFg(g, CAGE_W, CAGE_H));
  }
  // One shared empty-slot texture (uniform size) for any unoccupied cage —
  // no foreground split (see EMPTY_CAGE_KEY comment above).
  gen(scene, EMPTY_CAGE_KEY, CAGE_W, CAGE_H, (g) => drawEmptyCageSlot(g, CAGE_W, CAGE_H));
}
