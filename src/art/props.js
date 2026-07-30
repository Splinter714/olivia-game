// Procedural textures for kennel furniture added by issues #6/#7/#8/#13/#14/
// #20: the turtle/snake tanks + individual islands/perches, litter box,
// scooper, food/water bowls, potty messes, the yard divider, the back-wing
// kitchen/storage dressing, and the small "needs attention" bubbles. Same
// gen()-into-a-texture pattern as art/kennel.js / art/animals.js.
import { gen } from './_gen.js';
import {
  TURTLE, SNAKE, LITTER_BOX, CAGES, OVEN, YARD_DIVIDER_X1, YARD_DIVIDER_X0,
} from '../data/props.js';

export const TANK_KEY = 'prop-tank';
export const SNAKE_TANK_KEY = 'prop-snake-tank';
export const LITTER_BOX_KEY = 'prop-litter-box';
export const SCOOPER_KEY = 'prop-scooper';
export const BOWL_KEY = 'prop-bowl';
export const MESS_KEY = 'prop-mess';
export const COMPUTER_KEY = 'prop-computer';
export const BLANKET_KEY = 'prop-blanket';
export const UPGRADE_KEY = 'prop-upgrade-star';
export const OVEN_KEY = 'prop-oven';
export const TREAT_TRAY_KEY = 'prop-treat-tray';
export const SHELF_KEY = 'prop-shelf';
export const BOX_KEY = 'prop-boxes';
export const BAG_KEY = 'prop-bag';
export const LETTUCE_KEY = 'prop-lettuce';
export const YARD_DIVIDER_POST_KEY = 'prop-yard-divider-post';
export const YARD_DIVIDER_LINE_KEY = 'prop-yard-divider-line';
export const NEED_KEY = { food: 'need-food', bathroom: 'need-bathroom', water: 'need-water', mail: 'need-mail', tuck: 'need-tuck', babies: 'need-babies' };

// One individual-cage texture key per section (issue #18, extended to
// turtle/snake by issue #20) — every cage in a section is the same size
// (data/props.js's CAGES grid), so one texture per section covers all 6.
// Used in normal ("By Type") mode, where each section keeps its own
// historical cell size.
export const CAGE_KEY = Object.fromEntries(Object.keys(CAGES).map((key) => [key, `prop-cage-${key}`]));

// Owner feedback after trying "Mix Cages" (2026-07-29): "cage sizes should
// all be the same" — one uniform cell size used for every species' cage art
// while generalized mode is on, instead of each section's own (very
// different) cell size. Picked small enough to fit inside the tightest
// slot in the building — the turtle/snake tank islands/perches (the
// per-section cageArea math in data/props.js works out to roughly 72x63 for
// those two) — so a uniform-sized cage never pokes outside its tank when
// centered in its slot. Every other section's slot is comfortably bigger
// than this, so the art just reads as a small, tidy, identical pen/tank/nest
// wherever it sits.
export const GENERALIZED_CAGE_W = 68;
export const GENERALIZED_CAGE_H = 58;

// One uniform-size texture per species, used only in generalized mode
// (KennelScene._refreshCageArt draws whichever species is actually settled
// in a cage at this size, centered in the cage's slot).
export const CAGE_KEY_UNIFORM = Object.fromEntries(Object.keys(CAGES).map((key) => [key, `prop-cage-uniform-${key}`]));

// Issue #27 ("generalized cages" toggle), simplified per the 2026-07-29 owner
// note ("they should all be the same type of cage at the beginning"): ONE
// shared neutral/empty-slot texture (uniform size, no per-section shape)
// shown for any cage with nobody currently assigned to it while generalized
// mode is on — there's no species pre-assigned to an empty cage anymore, so
// it gets a single plain, un-themed look everywhere instead of per-section
// empty art.
export const EMPTY_CAGE_KEY = 'prop-cage-empty';

// Which draw function renders a given species' cage art — shared by the
// normal-mode (per-section-sized) and generalized-mode (uniform-sized)
// texture builds below so the two only ever differ in the w/h passed in.
function cageDrawFn(key) {
  if (key === 'turtle') return drawIslandSlot;
  if (key === 'snake') return drawPerchSlot;
  if (key === 'bird') return drawNestSlot;
  return drawCagePen;
}

// Water tank with a glass-cover highlight along the top rim.
function drawTank(g, w, h) {
  g.fillStyle(0x2d6f8e, 1).fillRoundedRect(0, 0, w, h, 10);
  g.fillStyle(0x4b9fc4, 0.85).fillRoundedRect(3, 3, w - 6, h - 6, 8);
  // Glass-cover highlight: a lighter streak across the top.
  g.fillStyle(0xdff3fb, 0.55).fillRoundedRect(6, 4, w - 12, h * 0.14, 6);
  g.lineStyle(3, 0xcfe9f2, 0.8).strokeRoundedRect(1.5, 1.5, w - 3, h - 3, 9);
}

// Snake tank (issue #14): same glass-covered-tank silhouette as the turtle
// tank, but drier — a sandy substrate instead of blue water, since a snake
// needs a solid resting surface, not "lots of water".
function drawSnakeTank(g, w, h) {
  g.fillStyle(0x8a6a3e, 1).fillRoundedRect(0, 0, w, h, 10);
  g.fillStyle(0xd9c9a0, 0.9).fillRoundedRect(3, 3, w - 6, h - 6, 8);
  g.fillStyle(0xeee6d0, 0.35).fillRoundedRect(6, 4, w - 12, h * 0.14, 6); // glass-cover highlight
  g.lineStyle(3, 0xcfe9f2, 0.55).strokeRoundedRect(1.5, 1.5, w - 3, h - 3, 9); // glass sheen
}

// A small individual water tank with a sand island (issue #20, extended per
// owner note 2026-07-29: "water needs to be added as part of turtle cage
// placement"). Self-contained now — the water is baked right into this
// per-cage texture rather than relying on the one big fixed TANK_KEY
// background drawn only at the turtle section's own location, which left a
// turtle looking waterless whenever Mix Cages placed her in any OTHER
// section's cage. Same soft-tan-ellipse island styling as before, just
// sitting in its own little glass-rimmed pool.
function drawIslandSlot(g, w, h) {
  g.fillStyle(0x2d6f8e, 1).fillRoundedRect(0, 0, w, h, 8);
  g.fillStyle(0x4b9fc4, 0.85).fillRoundedRect(2, 2, w - 4, h - 4, 6);
  g.lineStyle(2, 0xcfe9f2, 0.7).strokeRoundedRect(1, 1, w - 2, h - 2, 7);
  g.fillStyle(0xcfa15e, 1).fillEllipse(w / 2, h * 0.6, w * 0.7, h * 0.44);
  g.fillStyle(0xe0bd85, 1).fillEllipse(w / 2, h * 0.5, w * 0.56, h * 0.32);
  g.fillStyle(0xb9884b, 1);
  g.fillCircle(w * 0.4, h * 0.52, 1.1);
  g.fillCircle(w * 0.58, h * 0.6, 0.9);
}

// A small individual resting perch (issue #20) — one per snake cage slot, a
// short branch stub. Same self-containment fix as the turtle island above:
// bakes its own sandy-tank background in rather than relying on the one big
// fixed SNAKE_TANK_KEY background drawn only at the snake section's location.
function drawPerchSlot(g, w, h) {
  g.fillStyle(0x8a6a3e, 1).fillRoundedRect(0, 0, w, h, 8);
  g.fillStyle(0xd9c9a0, 0.9).fillRoundedRect(2, 2, w - 4, h - 4, 6);
  g.lineStyle(2, 0xcfe9f2, 0.55).strokeRoundedRect(1, 1, w - 2, h - 2, 7);
  g.fillStyle(0x6b4426, 1).fillRoundedRect(w * 0.08, h * 0.42, w * 0.84, h * 0.22, h * 0.1);
  g.fillStyle(0x4f3018, 1);
  g.fillCircle(w * 0.14, h * 0.53, h * 0.15);
  g.fillCircle(w * 0.86, h * 0.53, h * 0.13);
}

// A small individual twig nest (issue #24) — one per bird cage slot, sitting
// in place of the wire pen every other land species gets. A loosely woven
// ring of twigs on the cage floor, just big enough to hold a bird and its
// eggs/chicks; no wire mesh — birds' cages read as a simple perch-and-nest
// setup rather than the same pen as guinea pigs/hamsters/bunnies/cats/dogs.
function drawNestSlot(g, w, h) {
  g.fillStyle(0xe8d9b0, 1).fillRoundedRect(2, h * 0.5, w - 4, h * 0.46, 4); // floor pad (matches drawCagePen)
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(w / 2 - 5, 0, 10, 6, 2);         // name-tag mount
  // Woven twig ring.
  g.fillStyle(0x8a6a3e, 1).fillEllipse(w * 0.5, h * 0.62, w * 0.66, h * 0.4);
  g.fillStyle(0xc79a63, 1).fillEllipse(w * 0.5, h * 0.58, w * 0.5, h * 0.3);
  g.lineStyle(1.4, 0x6b4a26, 0.8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.lineBetween(
      w * 0.5 + Math.cos(a) * w * 0.3, h * 0.62 + Math.sin(a) * h * 0.18,
      w * 0.5 - Math.cos(a) * w * 0.3, h * 0.62 - Math.sin(a) * h * 0.18,
    );
  }
  // Soft hollow in the middle where eggs/chicks sit.
  g.fillStyle(0xf2e6c8, 0.9).fillEllipse(w * 0.5, h * 0.56, w * 0.28, h * 0.16);
}

function drawLitterBox(g, w, h) {
  g.fillStyle(0x8a8a94, 1).fillRoundedRect(0, 0, w, h, 5);
  g.fillStyle(0xd9c9a0, 1).fillRoundedRect(3, 3, w - 6, h - 6, 3);
  g.fillStyle(0xc9b688, 1);
  g.fillCircle(w * 0.3, h * 0.5, 1.6);
  g.fillCircle(w * 0.55, h * 0.4, 1.4);
  g.fillCircle(w * 0.7, h * 0.6, 1.4);
}

function drawScooper(g, w, h) {
  g.lineStyle(4, 0x8a5a34, 1).lineBetween(w * 0.5, h * 0.98, w * 0.5, h * 0.4);
  g.fillStyle(0x6fa8d6, 1).fillRoundedRect(w * 0.12, h * 0.02, w * 0.76, h * 0.42, 6);
  g.fillStyle(0x4b86b8, 1).fillRoundedRect(w * 0.2, h * 0.1, w * 0.6, h * 0.26, 4);
}

function drawBowl(g, w, h) {
  g.fillStyle(0x9aa0ab, 1).fillEllipse(w / 2, h * 0.62, w, h * 0.7);
  g.fillStyle(0xd7dbe1, 1).fillEllipse(w / 2, h * 0.5, w * 0.86, h * 0.56);
  g.fillStyle(0xc08a3e, 1).fillEllipse(w / 2, h * 0.5, w * 0.6, h * 0.34);
}

// Small brown "mess" blob — used for litter-box messes (the sandy background
// already tells it apart from anything else).
function drawMess(g, w, h) {
  g.fillStyle(0x6b4a2c, 1);
  g.fillEllipse(w * 0.5, h * 0.6, w * 0.7, h * 0.5);
  g.fillEllipse(w * 0.32, h * 0.42, w * 0.4, h * 0.32);
  g.fillEllipse(w * 0.65, h * 0.38, w * 0.36, h * 0.3);
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
    g.fillStyle(0x5b7fd6, 1);
    g.fillCircle(w * 0.5, h * 0.36, w * 0.1);
    g.fillCircle(w * 0.36, h * 0.5, w * 0.08);
    g.fillCircle(w * 0.64, h * 0.5, w * 0.08);
    g.fillEllipse(w * 0.5, h * 0.62, w * 0.28, w * 0.2);
  } else if (icon === 'mail') {
    // A tiny envelope — the reception computer's "needs attention" icon
    // (issue #10: an un-announced birth waiting to be sent to the owner).
    g.fillStyle(0xdd5555, 1).fillRoundedRect(w * 0.2, h * 0.34, w * 0.6, h * 0.4, 2);
    g.fillStyle(0xffe3e3, 1);
    g.fillTriangle(w * 0.2, h * 0.34, w * 0.5, h * 0.58, w * 0.8, h * 0.34);
  } else if (icon === 'tuck') {
    // A little folded blanket corner — issue #11's "needs tucking in" icon,
    // shown above any animal not yet under its fabric sheet for the night.
    g.fillStyle(0xe0a95e, 1).fillRoundedRect(w * 0.24, h * 0.36, w * 0.52, h * 0.34, 2);
    g.fillStyle(0xf6cf9a, 1).fillTriangle(w * 0.24, h * 0.36, w * 0.5, h * 0.36, w * 0.24, h * 0.62);
  } else if (icon === 'babies') {
    // A small pink heart — issue #9 refinement's "ready and needs your
    // help" icon, shown above a mom whose birth timer has expired (or who
    // was flagged during a night wake-up) until the player walks over and
    // interacts to actually have the babies/hatch the eggs.
    g.fillStyle(0xe8779c, 1);
    g.fillCircle(w * 0.38, h * 0.44, w * 0.15);
    g.fillCircle(w * 0.62, h * 0.44, w * 0.15);
    g.fillTriangle(w * 0.24, h * 0.48, w * 0.76, h * 0.48, w * 0.5, h * 0.74);
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
function drawCagePen(g, w, h) {
  g.fillStyle(0xe8d9b0, 1).fillRoundedRect(2, h * 0.5, w - 4, h * 0.46, 4); // floor pad
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

// A small floating lettuce leaf — dropped into the turtle tank as food
// (issue #20 follow-up: turtles can't reach a regular bowl on their island,
// so feeding them means tossing lettuce into the water instead).
function drawLettuce(g, w, h) {
  g.fillStyle(0x6fae4a, 1).fillEllipse(w / 2, h / 2, w, h);
  g.fillStyle(0x8bcf68, 1).fillEllipse(w * 0.42, h * 0.42, w * 0.6, h * 0.6);
  g.lineStyle(1, 0x4f8a34, 0.8).lineBetween(w * 0.2, h * 0.5, w * 0.8, h * 0.5);
}

// Yard divider post (issue #20): a small movable fence post the player can
// carry around and set back down to re-split the yard into zones.
function drawDividerPost(g, w, h) {
  g.fillStyle(0x8a5a34, 1).fillRoundedRect(w * 0.4, 0, w * 0.2, h, 3);
  g.fillStyle(0xc79a63, 1).fillRoundedRect(w * 0.08, h * 0.16, w * 0.84, h * 0.16, 2);
  g.fillStyle(0xc79a63, 1).fillRoundedRect(w * 0.08, h * 0.56, w * 0.84, h * 0.16, 2);
}

// The divider's full-width HORIZONTAL fence line, redrawn only when the
// divider moves (KennelScene just repositions this image's y — the line's
// own art never changes). A row of vertical picket panels running along x.
function drawDividerLine(g, w, h) {
  g.fillStyle(0xc79a63, 0.92);
  for (let x = 0; x < w; x += 26) g.fillRect(x, 0, 16, h);
  g.lineStyle(1.5, 0x8a5a34, 0.9);
  for (let x = 0; x < w; x += 26) g.strokeRect(x + 0.5, 0.5, 15, h - 1);
}

export function buildPropTextures(scene) {
  gen(scene, TANK_KEY, TURTLE.tank.w, TURTLE.tank.h, (g) => drawTank(g, TURTLE.tank.w, TURTLE.tank.h));
  gen(scene, SNAKE_TANK_KEY, SNAKE.tank.w, SNAKE.tank.h, (g) => drawSnakeTank(g, SNAKE.tank.w, SNAKE.tank.h));
  gen(scene, LITTER_BOX_KEY, LITTER_BOX.w, LITTER_BOX.h, (g) => drawLitterBox(g, LITTER_BOX.w, LITTER_BOX.h));
  gen(scene, SCOOPER_KEY, 26, 32, (g) => drawScooper(g, 26, 32));
  gen(scene, BOWL_KEY, 24, 18, (g) => drawBowl(g, 24, 18));
  gen(scene, MESS_KEY, 16, 12, (g) => drawMess(g, 16, 12));
  gen(scene, LETTUCE_KEY, 16, 12, (g) => drawLettuce(g, 16, 12));
  gen(scene, NEED_KEY.food, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'food'));
  gen(scene, NEED_KEY.bathroom, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'bathroom'));
  gen(scene, NEED_KEY.water, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'water'));
  gen(scene, NEED_KEY.mail, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'mail'));
  gen(scene, NEED_KEY.tuck, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'tuck'));
  gen(scene, NEED_KEY.babies, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'babies'));
  gen(scene, COMPUTER_KEY, 28, 34, (g) => drawComputer(g, 28, 34));
  gen(scene, BLANKET_KEY, 36, 26, (g) => drawBlanket(g, 36, 26));
  gen(scene, UPGRADE_KEY, 12, 12, (g) => drawUpgradeStar(g, 12, 12));
  gen(scene, OVEN_KEY, OVEN.w, OVEN.h, (g) => drawOven(g, OVEN.w, OVEN.h));
  gen(scene, TREAT_TRAY_KEY, 26, 16, (g) => drawTreatTray(g, 26, 16));
  gen(scene, SHELF_KEY, 40, 70, (g) => drawShelf(g, 40, 70));
  gen(scene, BOX_KEY, 34, 30, (g) => drawBoxStack(g, 34, 30));
  gen(scene, BAG_KEY, 22, 30, (g) => drawBag(g, 22, 30));
  gen(scene, YARD_DIVIDER_POST_KEY, 14, 28, (g) => drawDividerPost(g, 14, 28));
  gen(scene, YARD_DIVIDER_LINE_KEY, YARD_DIVIDER_X1 - YARD_DIVIDER_X0, 8, (g) => drawDividerLine(g, YARD_DIVIDER_X1 - YARD_DIVIDER_X0, 8));

  for (const key of Object.keys(CAGES)) {
    const { w, h } = CAGES[key][0]; // every cage in a section shares one size
    const draw = cageDrawFn(key);
    gen(scene, CAGE_KEY[key], w, h, (g) => draw(g, w, h));
    // Generalized-mode counterpart: same art, uniform size (owner note above).
    gen(scene, CAGE_KEY_UNIFORM[key], GENERALIZED_CAGE_W, GENERALIZED_CAGE_H,
      (g) => draw(g, GENERALIZED_CAGE_W, GENERALIZED_CAGE_H));
  }
  // One shared empty-slot texture (uniform size) for generalized mode.
  gen(scene, EMPTY_CAGE_KEY, GENERALIZED_CAGE_W, GENERALIZED_CAGE_H,
    (g) => drawEmptyCageSlot(g, GENERALIZED_CAGE_W, GENERALIZED_CAGE_H));
}
