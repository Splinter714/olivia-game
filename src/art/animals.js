// Procedural pixel-art for the six kennel species (issues #15/#16), rebuilt in
// the sibling horse game's style: art is authored in a small DESIGN GRID (see
// data/species.js `size`), drawn through a scaledGraphics wrapper onto an
// ART_SCALE× super-sampled texture, and displayed at ANIMAL_DISPLAY_SCALE.
//
// Every species is layered back-to-front — legs, tail, haunch, body, pattern
// overlay, neck, head, ears, face — and shaded from its coat's 3-tone ramp
// (`lo` under the belly and haunch, `mid` across the body, `hi` along the
// sunlit back). Colours come from data/coats.js: a named realistic coat plus a
// named pattern, never an arbitrary hue.
//
// Every species also gets the same 6-frame sheet — idle_0/1 + walk_0..3 — so a
// standing animal visibly breathes and a moving one has a real gait. Bunnies
// hop (the whole body leaves the ground) rather than walk; turtles waddle with
// almost no leg lift.
//
// All animals face RIGHT with origin (0.5, 1) — feet on the ground. Use
// setFlipX(true) to face left.

import { gen } from './_gen.js';
import {
  ART_SCALE, DISPLAY_SCALE, buildFrames, buildPoseFrames, idleWalkLegs, makeLeg,
} from './_frames.js';
import { SPECIES } from '../data/species.js';
import { coatDef, lookId } from '../data/coats.js';

export const EGG_KEY = 'animal-egg';

// Animal sprites are super-sampled, so scenes must scale them down by this much
// (each design-grid px becomes 2 logical px on screen). Anything measuring a
// sprite should read displayWidth/displayHeight, not width/height.
export const ANIMAL_DISPLAY_SCALE = DISPLAY_SCALE; // 0.5

const WHITE = 0xf7f4ee;

// ── Shared bits ─────────────────────────────────────────────────────────────

// Relative luminance of a packed 0xRRGGBB colour, 0-1. Used to pick a tattoo
// ink that stays legible on both a cream coat and a black one.
function lum(c) {
  const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// A tiny 3x5 micro-font, just the characters the ID tattoos use (coats.js
// TATTOO_IDS). Each row is 3 bits, top to bottom.
const GLYPHS = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  1: [0b010, 0b110, 0b010, 0b010, 0b111],
  2: [0b110, 0b001, 0b010, 0b100, 0b111],
  3: [0b110, 0b001, 0b010, 0b001, 0b110],
  4: [0b101, 0b101, 0b111, 0b001, 0b001],
  5: [0b111, 0b100, 0b110, 0b001, 0b110],
  6: [0b011, 0b100, 0b110, 0b101, 0b010],
  7: [0b111, 0b001, 0b010, 0b010, 0b010],
  8: [0b010, 0b101, 0b010, 0b101, 0b010],
};

// The kennel's last-resort tie-breaker (data/distinguish.js): a small ID mark
// inked on the flank, like the cruelty-free brand a real kennel uses so two
// identical guests can never be mixed up. Deliberately subtle — half-size cells
// on the super-sampled grid and a half-transparent ink, so it reads as a mark
// on the coat rather than a cartoon label.
function drawTattoo(g, x, y, id, ramp, cell = 0.5) {
  if (!id) return;
  const coatIsLight = lum(ramp.mid) > 0.45;
  g.fillStyle(coatIsLight ? 0x2a2118 : 0xf2efe8, 0.55);
  let ox = x;
  for (const ch of String(id)) {
    const rows = GLYPHS[ch];
    if (rows) {
      rows.forEach((bits, ry) => {
        for (let cx = 0; cx < 3; cx++) {
          if (bits & (1 << (2 - cx))) g.fillRect(ox + cx * cell, y + ry * cell, cell, cell);
        }
      });
    }
    ox += 4 * cell;
  }
}

// A collar band with a little hanging tag. Only drawn when the kennel actually
// needs it to tell two look-alikes apart (DESIGN.md's kitten example).
function drawCollar(g, r, color) {
  if (color == null || !r) return;
  g.fillStyle(color, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle(0xf3d878, 1);
  g.fillRect(r.x + r.w * 0.5, r.y + r.h, Math.max(0.5, r.w * 0.25), Math.max(0.5, r.h * 0.6));
}

// Turtles don't wear collars in a water tank — keepers dab a spot of coloured
// paint on the shell instead, which is what this draws.
function drawShellDot(g, r, color) {
  if (color == null || !r) return;
  g.fillStyle(0xffffff, 0.85); g.fillCircle(r.x, r.y, r.rad + 0.35);
  g.fillStyle(color, 1);       g.fillCircle(r.x, r.y, r.rad);
}

// ═══════════════════════════════════════════════════════════════════════════
// DOG — design grid 28x24 (puppy 17x15)
// ═══════════════════════════════════════════════════════════════════════════

const DOG_GEO = {
  adult: {
    W: 28, H: 24,
    leg: { topY: 17, w: 3, h: 6, pawY: 23, pawW: 5, pawDX: -1, pawH: 1 },
    hindX: [5, 8], foreX: [17, 20],
    body: { x: 4, y: 10, w: 20, h: 10 },
    neck: { x: 20, y: 8, w: 5, h: 6 },
    head: { x: 22, y: 4, w: 6, h: 7 },
    snout: { x: 25, y: 8, w: 3, h: 4 },
    ear: { x: 20, y: 5, w: 3, h: 7 },
    eye: { x: 23.8, y: 6.8, w: 1.6, h: 2 },
    tail: { x: 2, y: 7, w: 2, h: 7 },
    collar: { x: 21, y: 12, w: 5, h: 1.5 },
    tattoo: { x: 8, y: 14.5 },
  },
  // Puppy: same head size on a much shorter body and stubby legs.
  baby: {
    W: 17, H: 15,
    leg: { topY: 11, w: 2, h: 3, pawY: 14, pawW: 3, pawDX: -0.5, pawH: 1 },
    hindX: [3, 5], foreX: [10, 12],
    body: { x: 2, y: 7, w: 11, h: 6 },
    neck: { x: 11, y: 5.5, w: 3, h: 4 },
    head: { x: 11, y: 1, w: 6, h: 6 },
    snout: { x: 14, y: 4, w: 3, h: 3 },
    ear: { x: 9, y: 2, w: 2, h: 5 },
    eye: { x: 12.8, y: 3.4, w: 1.4, h: 1.6 },
    tail: { x: 1, y: 5.5, w: 1.5, h: 4 },
    collar: { x: 11, y: 8, w: 3, h: 1 },
    tattoo: { x: 3.5, y: 9 },
  },
};

function drawDog(g, bob, [lhf, lhn, lff, lfn], look, G) {
  const c = coatDef('dog', look);
  const { hi, mid, lo } = c.body;
  const pts = c.points || c.body; // black-and-tan gets tan legs/muzzle/brows
  const pat = look?.pattern || 'solid';
  const socks = pat === 'socksAndBlaze';
  const leg = makeLeg({ ...G.leg, pawColor: socks ? WHITE : 0x2a2018 });
  const b = G.body;

  // ── Legs ── far pair in the shadow tone, near pair in the leg/points tone.
  leg(g, G.hindX[0], lhf, socks ? WHITE : lo, bob);
  leg(g, G.foreX[0], lff, socks ? WHITE : lo, bob);
  leg(g, G.hindX[1], lhn, socks ? WHITE : pts.mid, bob);
  leg(g, G.foreX[1], lfn, socks ? WHITE : pts.mid, bob);

  // ── Tail ── carried up, wagging.
  g.fillStyle(mid, 1); g.fillRect(G.tail.x, G.tail.y + bob, G.tail.w, G.tail.h);
  g.fillStyle(hi, 1);  g.fillRect(G.tail.x - 0.5, G.tail.y + bob, G.tail.w * 0.5, G.tail.h * 0.7);

  // ── Body ── barrel with a sunlit back and a shaded belly.
  g.fillStyle(mid, 1); g.fillRect(b.x, b.y + bob, b.w, b.h);
  g.fillStyle(hi, 1);  g.fillRect(b.x, b.y + bob, b.w, b.h * 0.3);
  g.fillStyle(lo, 1);  g.fillRect(b.x, b.y + b.h * 0.7 + bob, b.w, b.h * 0.3);
  g.fillStyle(mid, 1); g.fillRect(b.x - 1, b.y + b.h * 0.2 + bob, 1, b.h * 0.6); // rump curve

  // ── Pattern overlay ──
  if (pat === 'patches') {
    g.fillStyle(c.mark, 1);
    g.fillRect(b.x + b.w * 0.06, b.y + b.h * 0.08 + bob, b.w * 0.30, b.h * 0.62);
    g.fillRect(b.x + b.w * 0.52, b.y + b.h * 0.30 + bob, b.w * 0.26, b.h * 0.52);
    g.fillRect(b.x + b.w * 0.40, b.y + b.h * 0.10 + bob, b.w * 0.12, b.h * 0.22);
  } else if (pat === 'spots') {
    const d = Math.max(0.75, b.h * 0.14);
    g.fillStyle(c.mark, 1);
    [[0.14, 0.22], [0.30, 0.58], [0.46, 0.30], [0.60, 0.66], [0.74, 0.24], [0.86, 0.52]]
      .forEach(([fx, fy]) => g.fillRect(b.x + b.w * fx, b.y + b.h * fy + bob, d, d));
  } else if (socks) {
    g.fillStyle(WHITE, 1);
    g.fillRect(b.x + b.w * 0.72, b.y + b.h * 0.55 + bob, b.w * 0.28, b.h * 0.45); // white chest
  } else if (c.points) {
    // Black-and-tan: a tan chest patch at the front, not a slab across the
    // whole belly (which merged with the tan legs into one solid block).
    g.fillStyle(pts.mid, 1);
    g.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.6 + bob, b.w * 0.38, b.h * 0.4);
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);

  // ── Neck ── slopes up from the shoulder to the head.
  g.fillStyle(mid, 1); g.fillRect(G.neck.x, G.neck.y + bob, G.neck.w, G.neck.h);
  g.fillStyle(hi, 1);  g.fillRect(G.neck.x, G.neck.y + bob, G.neck.w, G.neck.h * 0.35);

  drawCollar(g, { ...G.collar, y: G.collar.y + bob }, look?.collar);

  // ── Head ── domed skull above the back, snout poking forward-and-down.
  const h = G.head;
  g.fillStyle(mid, 1); g.fillRect(h.x, h.y + bob, h.w, h.h);
  g.fillStyle(hi, 1);  g.fillRect(h.x, h.y + bob, h.w, h.h * 0.28);
  g.fillStyle(lo, 1);  g.fillRect(h.x, h.y + h.h * 0.85 + bob, h.w * 0.65, h.h * 0.15);
  if (socks) { // blaze up the middle of the face
    g.fillStyle(WHITE, 1); g.fillRect(h.x + h.w * 0.42, h.y + bob, h.w * 0.28, h.h);
  } else if (pat === 'patches') {
    g.fillStyle(c.mark, 1); g.fillRect(h.x, h.y + h.h * 0.12 + bob, h.w * 0.42, h.h * 0.45);
  } else if (c.points) {
    g.fillStyle(pts.mid, 1); // tan eyebrow dot
    g.fillRect(h.x + h.w * 0.25, h.y + h.h * 0.3 + bob, h.w * 0.2, h.h * 0.12);
  }
  // Snout + nose
  const s = G.snout;
  g.fillStyle(c.snout, 1); g.fillRect(s.x, s.y + bob, s.w, s.h);
  g.fillStyle(c.nose, 1);  g.fillRect(s.x + s.w * 0.55, s.y + bob, s.w * 0.45, s.h * 0.45);

  // ── Ear ── floppy, draping the back of the skull.
  g.fillStyle(c.ear, 1); g.fillRect(G.ear.x, G.ear.y + bob, G.ear.w, G.ear.h);
  g.fillStyle(lo, 1);    g.fillRect(G.ear.x, G.ear.y + G.ear.h * 0.5 + bob, G.ear.w * 0.7, G.ear.h * 0.5);

  // ── Eye ── a pale socket behind the pupil, so it still reads on a black coat.
  g.fillStyle(0xe8e2d6, 0.9);  g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w, G.eye.h);
  g.fillStyle(c.eye, 1);       g.fillRect(G.eye.x + G.eye.w * 0.3, G.eye.y + bob, G.eye.w * 0.6, G.eye.h);
  g.fillStyle(0xffffff, 0.85); g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w * 0.35, G.eye.h * 0.35);
}

// ═══════════════════════════════════════════════════════════════════════════
// CAT — design grid 22x20 (kitten 13x12)
// ═══════════════════════════════════════════════════════════════════════════

const CAT_GEO = {
  adult: {
    W: 22, H: 20,
    leg: { topY: 16, w: 2, h: 3, pawY: 19, pawW: 4, pawDX: -1, pawH: 1 },
    hindX: [5, 7], foreX: [15, 17],
    body: { x: 5, y: 10, w: 13, h: 7 },
    back: { x: 6, y: 8, w: 9, h: 2 },
    haunch: { x: 7, y: 13, r: 4 },
    neck: { x: 15, y: 9, w: 4, h: 6 },
    head: { x: 15, y: 5, w: 7, h: 5 },
    ear: { far: 14, near: 19, y: 6, w: 3 },
    eye: { x1: 16, x2: 19, y: 6, w: 2, h: 2 },
    nose: { x: 20, y: 9 },
    tail: { x: 6, y: 12 },
    collar: { x: 15, y: 10.5, w: 4, h: 1.2 },
    tattoo: { x: 8, y: 11 },
  },
  // Kitten: proportionally huge head, stubby legs, short body.
  baby: {
    W: 13, H: 12,
    leg: { topY: 9, w: 1.5, h: 2, pawY: 11, pawW: 2.5, pawDX: -0.5, pawH: 1 },
    hindX: [2, 3.5], foreX: [8, 9.5],
    body: { x: 2, y: 6, w: 8, h: 5 },
    back: { x: 3, y: 5, w: 5, h: 1 },
    haunch: { x: 4, y: 8, r: 2.6 },
    neck: { x: 8, y: 5, w: 3, h: 4 },
    head: { x: 7, y: 1, w: 6, h: 4.5 },
    ear: { far: 6.4, near: 10.6, y: 2.4, w: 2.2 },
    eye: { x1: 8.2, x2: 10.6, y: 2.2, w: 1.6, h: 1.6 },
    nose: { x: 12, y: 4.6 },
    tail: { x: 3.2, y: 7 },
    collar: { x: 8, y: 5.4, w: 3, h: 1 },
    tattoo: { x: 3.6, y: 6.6 },
  },
};

// Tabby barring across the back + the forehead "M".
function catStripes(g, G, bob, color) {
  const b = G.body;
  g.fillStyle(color, 1);
  for (let i = 0; i < 4; i++) {
    const x = b.x + b.w * (0.15 + i * 0.19);
    g.fillRect(x, b.y - b.h * 0.25 + bob, Math.max(0.6, b.w * 0.06), b.h * 0.75);
  }
}

function catFaceStripes(g, G, bob, color) {
  const h = G.head;
  g.fillStyle(color, 1);
  g.fillRect(h.x + h.w * 0.18, h.y + bob, h.w * 0.1, h.h * 0.38);
  g.fillRect(h.x + h.w * 0.44, h.y + bob, h.w * 0.1, h.h * 0.28);
  g.fillRect(h.x + h.w * 0.7, h.y + bob, h.w * 0.1, h.h * 0.38);
}

function drawCat(g, bob, [lhf, lhn, lff, lfn], tailTip, look, G) {
  const c = coatDef('cat', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'solid';
  const bib = c.mark === 'bib';
  const whiteFeet = pat === 'socks' || bib;
  const leg = makeLeg({ ...G.leg, pawColor: whiteFeet ? WHITE : lo });
  const b = G.body;

  // ── Legs ── cats creep: barely any lift, no body bounce.
  leg(g, G.hindX[0], lhf, whiteFeet ? WHITE : lo, bob);
  leg(g, G.foreX[0], lff, whiteFeet ? WHITE : lo, bob);
  leg(g, G.hindX[1], lhn, whiteFeet ? WHITE : mid, bob);
  leg(g, G.foreX[1], lfn, whiteFeet ? WHITE : mid, bob);

  // ── Haunch ── rounded rear thigh, the cat's crouched silhouette.
  g.fillStyle(mid, 1); g.fillCircle(G.haunch.x, G.haunch.y + bob, G.haunch.r);
  g.fillStyle(lo, 1);  g.fillCircle(G.haunch.x, G.haunch.y + G.haunch.r * 0.5 + bob, G.haunch.r * 0.75);

  // ── Body ── low and sleek with a gently arched back.
  g.fillStyle(mid, 1); g.fillRect(b.x, b.y + bob, b.w, b.h);
  g.fillRect(G.back.x, G.back.y + bob, G.back.w, G.back.h);
  g.fillStyle(hi, 1);  g.fillRect(G.back.x, G.back.y + bob, G.back.w, G.back.h * 0.5);
  g.fillStyle(lo, 1);  g.fillRect(b.x, b.y + b.h * 0.82 + bob, b.w, b.h * 0.18);

  // ── Markings baked into the coat name (tabby / calico / tuxedo) ──
  if (c.mark === 'stripes') catStripes(g, G, bob, c.markColor);
  else if (c.mark === 'patches') {
    g.fillStyle(c.markColor, 1); // ginger over the rump
    g.fillRect(b.x, b.y - b.h * 0.2 + bob, b.w * 0.36, b.h * 0.95);
    g.fillRect(b.x + b.w * 0.16, b.y - b.h * 0.42 + bob, b.w * 0.16, b.h * 0.28);
    g.fillStyle(c.markColor2, 1); // black saddle over the shoulders
    g.fillRect(b.x + b.w * 0.46, b.y - b.h * 0.15 + bob, b.w * 0.38, b.h * 0.85);
    g.fillRect(b.x + b.w * 0.55, b.y - b.h * 0.38 + bob, b.w * 0.22, b.h * 0.25);
    g.fillStyle(mid, 1); // white notch bitten back in, so the edges look organic
    g.fillRect(b.x + b.w * 0.36, b.y + b.h * 0.5 + bob, b.w * 0.09, b.h * 0.4);
  } else if (bib) {
    g.fillStyle(c.markColor, 1); // white chest/belly flash
    g.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.35 + bob, b.w * 0.38, b.h * 0.65);
    g.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.75 + bob, b.w * 0.35, b.h * 0.25);
  }

  // ── Tail ── overlapping segments sweeping up-and-back from the rump, so it
  // reads as one continuous curve rather than a detached chimney. Drawn ON TOP
  // of the haunch/body on purpose: tucked behind them, the big haunch circle ate
  // the root and left the tail floating. Only the tip flicks (tailTip).
  const t = G.tail, seg = Math.max(0.8, b.w * 0.14);
  g.fillStyle(mid, 1);
  // The two lower segments are deliberately wide so the base merges into the
  // rump instead of leaving a notch of background between tail and body.
  g.fillRect(t.x - seg * 1.0, t.y - seg * 0.2 + bob, seg * 2.0, seg * 1.3);  // root at the rump
  g.fillRect(t.x - seg * 1.9, t.y - seg * 1.4 + bob, seg * 2.6, seg * 1.7);
  g.fillRect(t.x - seg * 2.5, t.y - seg * 2.8 + bob, seg * 2.0, seg * 1.9);
  g.fillRect(t.x - seg * 2.8, t.y - seg * 4.0 + bob, seg * 1.2, seg * 1.7);
  g.fillRect(t.x - seg * 2.7 - tailTip * 0.4, t.y - seg * 5.2 + bob, seg * 1.2, seg * 1.4); // tip
  g.fillStyle(hi, 1);
  g.fillRect(t.x - seg * 2.5, t.y - seg * 2.6 + bob, seg * 0.4, seg * 1.7);
  if (c.mark === 'stripes') {
    g.fillStyle(c.markColor, 1);
    g.fillRect(t.x - seg * 1.9, t.y - seg * 0.9 + bob, seg * 1.3, seg * 0.5);
    g.fillRect(t.x - seg * 2.7, t.y - seg * 3.5 + bob, seg * 1.2, seg * 0.5);
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);

  // ── Neck / chest ──
  g.fillStyle(mid, 1); g.fillRect(G.neck.x, G.neck.y + bob, G.neck.w, G.neck.h);
  if (bib) {
    g.fillStyle(c.markColor, 1);
    g.fillRect(G.neck.x, G.neck.y + G.neck.h * 0.55 + bob, G.neck.w, G.neck.h * 0.45);
  }

  drawCollar(g, { ...G.collar, y: G.collar.y + bob }, look?.collar);

  // ── Ears ── sharp triangles tapering to a point, drawn behind the skull.
  const e = G.ear;
  g.fillStyle(mid, 1);
  g.fillTriangle(e.far, e.y + bob, e.far + e.w, e.y + bob, e.far + e.w * 0.35, e.y - e.w + bob);
  g.fillStyle(c.mark === 'patches' ? c.markColor2 : mid, 1);
  g.fillTriangle(e.near, e.y + bob, e.near + e.w, e.y + bob, e.near + e.w * 0.65, e.y - e.w + bob);
  g.fillStyle(c.ear, 1);
  g.fillTriangle(e.near + e.w * 0.25, e.y + bob, e.near + e.w * 0.75, e.y + bob,
    e.near + e.w * 0.6, e.y - e.w * 0.55 + bob);

  // ── Head ── small, round, flat-faced (no dog snout).
  const h = G.head;
  g.fillStyle(mid, 1); g.fillRect(h.x, h.y + bob, h.w, h.h);
  g.fillStyle(hi, 1);  g.fillRect(h.x + h.w * 0.12, h.y + bob, h.w * 0.7, h.h * 0.2);
  if (c.mark === 'stripes') catFaceStripes(g, G, bob, c.markColor);
  else if (c.mark === 'patches') {
    g.fillStyle(c.markColor, 1); g.fillRect(h.x, h.y + bob, h.w * 0.42, h.h * 0.5);
  } else if (bib) {
    g.fillStyle(c.markColor, 1); g.fillRect(h.x + h.w * 0.55, h.y + h.h * 0.55 + bob, h.w * 0.45, h.h * 0.45);
  }

  // ── Eyes ── big, set high and forward, with a catchlight.
  const ey = G.eye;
  g.fillStyle(c.eye, 1);
  g.fillRect(ey.x1, ey.y + bob, ey.w, ey.h); g.fillRect(ey.x2, ey.y + bob, ey.w, ey.h);
  g.fillStyle(0x14260a, 1);
  g.fillRect(ey.x1 + ey.w * 0.45, ey.y + bob, ey.w * 0.35, ey.h);
  g.fillRect(ey.x2 + ey.w * 0.45, ey.y + bob, ey.w * 0.35, ey.h);
  g.fillStyle(0xffffff, 0.9);
  g.fillRect(ey.x1, ey.y + bob, ey.w * 0.4, ey.h * 0.4);
  g.fillRect(ey.x2, ey.y + bob, ey.w * 0.4, ey.h * 0.4);

  // ── Nose + whisker hint ──
  g.fillStyle(c.nose, 1);     g.fillRect(G.nose.x, G.nose.y + bob, 1, 1);
  g.fillStyle(0xffffff, 0.5); g.fillRect(G.nose.x + 1, G.nose.y - 0.5 + bob, 1, 0.5);
}

// ═══════════════════════════════════════════════════════════════════════════
// BUNNY — design grid 20x20 (kit 12x12). Hops instead of walking.
// ═══════════════════════════════════════════════════════════════════════════

const BUNNY_GEO = {
  adult: {
    W: 20, H: 20, hopMax: 4,
    foot: { x: 3, y: 17, w: 6, h: 2 }, paw: { x: 13, y: 17, w: 3, h: 2 },
    tail: { x: 3, y: 12, r: 2.6 },
    haunch: { x: 7, y: 12, r: 4.5 },
    body: { cx: 11, cy: 12, w: 12, h: 8 },
    belly: { cx: 11, cy: 15, w: 8, h: 2 },
    neck: { x: 14, y: 8, w: 4, h: 6 },
    head: { cx: 17, cy: 8, r: 3.4 },
    earFar: { x: 16, y: 1, w: 2, h: 5 }, earNear: { x: 18, y: 0, w: 2, h: 6 },
    eye: { x: 17, y: 7, w: 2, h: 2 },
    nose: { x: 19.2, y: 8 },
    collar: { x: 14, y: 11.5, w: 4, h: 1.2 },
    tattoo: { x: 7.5, y: 11.5 },
  },
  baby: {
    W: 12, H: 12, hopMax: 2.5,
    foot: { x: 2, y: 10, w: 4, h: 1.5 }, paw: { x: 8, y: 10, w: 2, h: 1.5 },
    tail: { x: 2, y: 7.5, r: 1.6 },
    haunch: { x: 4, y: 7.5, r: 2.7 },
    body: { cx: 6.5, cy: 7.5, w: 7, h: 5 },
    belly: { cx: 6.5, cy: 9.4, w: 5, h: 1.4 },
    neck: { x: 8, y: 5, w: 2.5, h: 3.5 },
    head: { cx: 9.6, cy: 4.6, r: 2.4 },
    earFar: { x: 8.6, y: 0.6, w: 1.4, h: 3 }, earNear: { x: 10, y: 0.2, w: 1.4, h: 3.4 },
    eye: { x: 9.6, y: 4, w: 1.4, h: 1.4 },
    nose: { x: 11.2, y: 4.8 },
    collar: { x: 8, y: 6.8, w: 2.5, h: 1 },
    tattoo: { x: 3.8, y: 7 },
  },
};

function drawBunny(g, pose, look, G) {
  const c = coatDef('bunny', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'solid';
  const lift = pose.hop;
  const stretch = lift > 0 ? G.body.w * 0.08 : 0;
  const b = G.body;

  // ── Feet ── long hind foot flat when grounded, tucked back mid-hop.
  if (lift > 0) {
    g.fillStyle(lo, 1);  g.fillRect(G.foot.x, G.foot.y - lift - 1, G.foot.w * 0.7, G.foot.h);
    g.fillStyle(mid, 1); g.fillRect(G.paw.x + 1, G.paw.y - lift, G.paw.w, G.paw.h);
  } else {
    g.fillStyle(lo, 1);  g.fillRect(G.foot.x, G.foot.y, G.foot.w, G.foot.h);
    g.fillStyle(pat === 'dutch' ? WHITE : mid, 1); g.fillRect(G.paw.x, G.paw.y, G.paw.w, G.paw.h);
  }

  // ── Cotton tail ──
  g.fillStyle(pat === 'dutch' ? WHITE : mid, 1); g.fillCircle(G.tail.x, G.tail.y - lift, G.tail.r);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(G.tail.x - G.tail.r * 0.3, G.tail.y - lift - G.tail.r * 0.4, G.tail.r * 0.45);

  // ── Haunch ── the big rounded rear thigh.
  g.fillStyle(mid, 1); g.fillCircle(G.haunch.x, G.haunch.y - lift, G.haunch.r);
  g.fillStyle(lo, 1);  g.fillCircle(G.haunch.x, G.haunch.y - lift + G.haunch.r * 0.45, G.haunch.r * 0.78);
  g.fillStyle(hi, 1);  g.fillCircle(G.haunch.x - G.haunch.r * 0.25, G.haunch.y - lift - G.haunch.r * 0.45, G.haunch.r * 0.42);

  // ── Body ── low rounded loaf; stretches forward a touch mid-hop.
  g.fillStyle(mid, 1);     g.fillEllipse(b.cx, b.cy - lift, b.w + stretch, b.h);
  g.fillStyle(hi, 1);      g.fillEllipse(b.cx, b.cy - lift - b.h * 0.25, b.w * 0.75, b.h * 0.35);
  g.fillStyle(c.belly, 1); g.fillEllipse(G.belly.cx, G.belly.cy - lift, G.belly.w, G.belly.h);

  // ── Pattern overlay ──
  if (pat === 'dutch') {
    // Classic Dutch: a clean white band around the middle of the body.
    g.fillStyle(WHITE, 1);
    g.fillRect(b.cx - b.w * 0.12, b.cy - lift - b.h * 0.52, b.w * 0.3, b.h);
  } else if (pat === 'spotted') {
    const d = Math.max(0.7, b.h * 0.16);
    g.fillStyle(c.mark, 1);
    [[-0.3, -0.2], [-0.05, 0.12], [0.18, -0.3], [0.3, 0.15], [-0.42, 0.2]]
      .forEach(([fx, fy]) => g.fillRect(b.cx + b.w * fx, b.cy - lift + b.h * fy, d, d));
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y - lift, look?.tattoo, c.body);

  // ── Neck / chest ──
  g.fillStyle(mid, 1);     g.fillRect(G.neck.x, G.neck.y - lift, G.neck.w, G.neck.h);
  g.fillStyle(c.belly, 1); g.fillRect(G.neck.x, G.neck.y - lift + G.neck.h * 0.78, G.neck.w, G.neck.h * 0.22);

  drawCollar(g, { x: G.collar.x, y: G.collar.y - lift, w: G.collar.w, h: G.collar.h }, look?.collar);

  // ── Head ──
  const hd = G.head;
  g.fillStyle(mid, 1); g.fillCircle(hd.cx, hd.cy - lift, hd.r);
  g.fillStyle(hi, 1);  g.fillCircle(hd.cx - hd.r * 0.3, hd.cy - lift - hd.r * 0.5, hd.r * 0.42);
  if (pat === 'dutch') { // white blaze up the middle of the face
    g.fillStyle(WHITE, 1); g.fillRect(hd.cx - hd.r * 0.2, hd.cy - lift - hd.r, hd.r * 0.55, hd.r * 2);
  } else if (pat === 'spotted') {
    g.fillStyle(c.mark, 1); g.fillRect(hd.cx - hd.r * 0.9, hd.cy - lift - hd.r * 0.5, hd.r * 0.6, hd.r * 0.6);
  }

  // ── Ears ── tall and upright; trail back a little mid-hop.
  const back = lift > 0 ? 1 : 0;
  g.fillStyle(mid, 1);
  g.fillRect(G.earFar.x - back, G.earFar.y - lift, G.earFar.w, G.earFar.h);
  g.fillRect(G.earNear.x - back, G.earNear.y - lift, G.earNear.w, G.earNear.h);
  g.fillStyle(c.ear, 1);
  g.fillRect(G.earNear.x - back + G.earNear.w * 0.2, G.earNear.y - lift + G.earNear.h * 0.15,
    G.earNear.w * 0.5, G.earNear.h * 0.7);
  g.fillStyle(hi, 1);
  g.fillRect(G.earFar.x - back, G.earFar.y - lift, G.earFar.w * 0.4, G.earFar.h * 0.4);

  // ── Eye + nose (the idle wiggle twitches just the nose) ──
  g.fillStyle(c.eye, 1);      g.fillRect(G.eye.x, G.eye.y - lift, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.9); g.fillRect(G.eye.x, G.eye.y - lift, G.eye.w * 0.45, G.eye.h * 0.45);
  g.fillStyle(0xd76b76, 1);   g.fillRect(G.nose.x, G.nose.y - lift + pose.wiggle * 0.4, 0.8, 0.8);
  g.fillStyle(0xffffff, 0.4); g.fillRect(G.nose.x - 1, G.nose.y - lift + 1, 1, 0.5);
}

// ═══════════════════════════════════════════════════════════════════════════
// GUINEA PIG — design grid 18x14 (pup 11x9). Long slipper body, no neck.
// ═══════════════════════════════════════════════════════════════════════════

const GUINEA_PIG_GEO = {
  adult: {
    W: 18, H: 14,
    leg: { topY: 10.5, w: 2, h: 3.5, pawY: 13.4, pawW: 2.6, pawDX: -0.3, pawH: 0.6 },
    hindX: [3, 5.5], foreX: [11, 13.5],
    body: { cx: 8.5, cy: 8, w: 16, h: 9 },
    rump: { x: 4, y: 8, r: 4 },
    belly: { cx: 8.5, cy: 10.6, w: 11, h: 2.4 },
    head: { cx: 14.5, cy: 7, r: 3.4 },
    ear: { x: 12.6, y: 4.2, w: 2.4, h: 1.6 },
    eye: { x: 15.2, y: 5.8, w: 1.2, h: 1.2 },
    nose: { x: 17, y: 7.6 },
    collar: { x: 11.6, y: 9.2, w: 3, h: 1.1 },
    tattoo: { x: 5.5, y: 7.5 },
  },
  baby: {
    W: 11, H: 9,
    leg: { topY: 6.8, w: 1.4, h: 2.2, pawY: 8.5, pawW: 1.8, pawDX: -0.2, pawH: 0.5 },
    hindX: [1.8, 3.4], foreX: [6.6, 8.2],
    body: { cx: 5.2, cy: 5, w: 10, h: 5.6 },
    rump: { x: 2.6, y: 5, r: 2.5 },
    belly: { cx: 5.2, cy: 6.6, w: 7, h: 1.6 },
    head: { cx: 8.8, cy: 4, r: 2.4 },
    ear: { x: 7.6, y: 2.2, w: 1.6, h: 1.1 },
    eye: { x: 9.2, y: 3.2, w: 0.9, h: 0.9 },
    nose: { x: 10.3, y: 4.6 },
    collar: { x: 7.2, y: 5.6, w: 2, h: 0.9 },
    tattoo: { x: 3.2, y: 4.6 },
  },
};

function drawGuineaPig(g, bob, [lhf, lhn, lff, lfn], look, G) {
  const c = coatDef('guineaPig', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'solid';
  const leg = makeLeg({ ...G.leg, pawColor: lo });
  const b = G.body;

  // ── Little feet, mostly hidden under the body ──
  leg(g, G.hindX[0], lhf, lo, bob); leg(g, G.foreX[0], lff, lo, bob);
  leg(g, G.hindX[1], lhn, mid, bob); leg(g, G.foreX[1], lfn, mid, bob);

  // ── Rump + body ── one continuous slipper shape, no visible neck.
  g.fillStyle(mid, 1); g.fillCircle(G.rump.x, G.rump.y + bob, G.rump.r);
  g.fillStyle(mid, 1); g.fillEllipse(b.cx, b.cy + bob, b.w, b.h);
  g.fillStyle(hi, 1);  g.fillEllipse(b.cx, b.cy + bob - b.h * 0.26, b.w * 0.78, b.h * 0.34);
  g.fillStyle(lo, 1);  g.fillEllipse(b.cx - b.w * 0.18, b.cy + bob + b.h * 0.22, b.w * 0.5, b.h * 0.3);
  g.fillStyle(c.belly, 1); g.fillEllipse(G.belly.cx, G.belly.cy + bob, G.belly.w, G.belly.h);

  // ── Pattern overlay ──
  if (pat === 'triColor') {
    // Classic tri-colour: a dark saddle over the rear, a white band across the
    // middle, the base coat left showing at the head end.
    g.fillStyle(c.mark, 1);
    g.fillEllipse(b.cx - b.w * 0.28, b.cy + bob, b.w * 0.42, b.h * 0.92);
    g.fillStyle(WHITE, 1);
    g.fillRect(b.cx - b.w * 0.06, b.cy + bob - b.h * 0.45, b.w * 0.2, b.h * 0.9);
  } else if (pat === 'crested') {
    // A soft whorl rosette on the rump to match the forehead crest below —
    // a highlight ring only, no dark centre (which read as a hole).
    g.fillStyle(hi, 0.8); g.fillCircle(G.rump.x, G.rump.y + bob - G.rump.r * 0.15, G.rump.r * 0.55);
    g.fillStyle(mid, 1);  g.fillCircle(G.rump.x, G.rump.y + bob - G.rump.r * 0.15, G.rump.r * 0.3);
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);
  drawCollar(g, { ...G.collar, y: G.collar.y + bob }, look?.collar);

  // ── Ear ── small petal flap set just behind the eye.
  g.fillStyle(c.ear, 1);
  g.fillEllipse(G.ear.x + G.ear.w / 2, G.ear.y + bob + G.ear.h / 2, G.ear.w, G.ear.h);

  // ── Head ── blunt, barely separate from the body.
  const hd = G.head;
  g.fillStyle(mid, 1); g.fillCircle(hd.cx, hd.cy + bob, hd.r);
  g.fillStyle(hi, 1);  g.fillCircle(hd.cx - hd.r * 0.2, hd.cy + bob - hd.r * 0.5, hd.r * 0.45);
  if (pat === 'crested') {
    // Crest whorl ON the forehead (a pom-pom perched above the skull read as
    // a horn), tucked inside the head circle.
    g.fillStyle(WHITE, 1); g.fillCircle(hd.cx - hd.r * 0.2, hd.cy + bob - hd.r * 0.42, hd.r * 0.38);
  } else if (pat === 'triColor') {
    g.fillStyle(c.mark, 1); g.fillRect(hd.cx - hd.r * 0.95, hd.cy + bob - hd.r * 0.6, hd.r * 0.7, hd.r * 0.8);
  }

  // ── Eye + nose ──
  g.fillStyle(c.eye, 1);       g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.8);  g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w * 0.5, G.eye.h * 0.5);
  g.fillStyle(c.ear, 1);       g.fillRect(G.nose.x, G.nose.y + bob, 0.8, 0.6);
  g.fillStyle(0xffffff, 0.35); g.fillRect(G.nose.x - 1, G.nose.y + bob + 0.8, 1, 0.4);
}

// ═══════════════════════════════════════════════════════════════════════════
// HAMSTER — design grid 14x12 (pup 9x8). Round, cheek-pouched, tiny feet.
// ═══════════════════════════════════════════════════════════════════════════

const HAMSTER_GEO = {
  adult: {
    W: 14, H: 12,
    leg: { topY: 9.5, w: 1.6, h: 2.5, pawY: 11.5, pawW: 2, pawDX: -0.2, pawH: 0.5 },
    hindX: [2.6, 4.6], foreX: [8.2, 10],
    body: { cx: 6.5, cy: 7, w: 12, h: 9 },
    belly: { cx: 6.5, cy: 9.6, w: 8, h: 2.4 },
    head: { cx: 10.5, cy: 6, r: 3.2 },
    cheek: { cx: 11, cy: 7.6, r: 2 },
    earFar: { cx: 9, cy: 3.2, r: 1.3 }, earNear: { cx: 11.6, cy: 3, r: 1.4 },
    eye: { x: 10.8, y: 5, w: 1.2, h: 1.2 },
    nose: { x: 12.8, y: 6.6 },
    collar: { x: 8.4, y: 8.2, w: 2.6, h: 1 },
    tattoo: { x: 3.4, y: 6.6 },
  },
  baby: {
    W: 9, H: 8,
    leg: { topY: 6.4, w: 1.1, h: 1.6, pawY: 7.6, pawW: 1.4, pawDX: -0.15, pawH: 0.4 },
    hindX: [1.6, 3], foreX: [5.4, 6.6],
    body: { cx: 4.2, cy: 4.6, w: 8, h: 6 },
    belly: { cx: 4.2, cy: 6.3, w: 5.2, h: 1.6 },
    head: { cx: 6.8, cy: 3.6, r: 2.4 },
    cheek: { cx: 7.1, cy: 4.8, r: 1.4 },
    earFar: { cx: 5.8, cy: 1.6, r: 1 }, earNear: { cx: 7.5, cy: 1.5, r: 1.05 },
    eye: { x: 7, y: 3, w: 0.9, h: 0.9 },
    nose: { x: 8.3, y: 4.2 },
    collar: { x: 5.4, y: 5.2, w: 1.8, h: 0.8 },
    tattoo: { x: 2, y: 4.4 },
  },
};

function drawHamster(g, bob, [lhf, lhn, lff, lfn], look, G) {
  const c = coatDef('hamster', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'solid';
  const leg = makeLeg({ ...G.leg, pawColor: c.ear });
  const b = G.body;

  leg(g, G.hindX[0], lhf, lo, bob); leg(g, G.foreX[0], lff, lo, bob);
  leg(g, G.hindX[1], lhn, mid, bob); leg(g, G.foreX[1], lfn, mid, bob);

  // ── Ears ── small rounded discs, drawn behind the head.
  g.fillStyle(lo, 1);    g.fillCircle(G.earFar.cx, G.earFar.cy + bob, G.earFar.r);
  g.fillStyle(mid, 1);   g.fillCircle(G.earNear.cx, G.earNear.cy + bob, G.earNear.r);
  g.fillStyle(c.ear, 1); g.fillCircle(G.earNear.cx, G.earNear.cy + bob + G.earNear.r * 0.15, G.earNear.r * 0.5);

  // ── Body ── a round little loaf; the head is barely separate from it.
  g.fillStyle(mid, 1);     g.fillEllipse(b.cx, b.cy + bob, b.w, b.h);
  g.fillStyle(hi, 1);      g.fillEllipse(b.cx, b.cy + bob - b.h * 0.26, b.w * 0.72, b.h * 0.34);
  g.fillStyle(lo, 1);      g.fillEllipse(b.cx - b.w * 0.14, b.cy + bob + b.h * 0.24, b.w * 0.55, b.h * 0.3);
  g.fillStyle(c.belly, 1); g.fillEllipse(G.belly.cx, G.belly.cy + bob, G.belly.w, G.belly.h);

  // ── Pattern overlay ── the banded hamster's pale ring round the middle.
  if (pat === 'banded') {
    g.fillStyle(c.mark, 1);
    g.fillRect(b.cx - b.w * 0.1, b.cy + bob - b.h * 0.48, b.w * 0.22, b.h * 0.96);
    g.fillStyle(lo, 1);
    g.fillRect(b.cx - b.w * 0.26, b.cy + bob - b.h * 0.42, b.w * 0.07, b.h * 0.6); // dorsal stripe
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);
  drawCollar(g, { ...G.collar, y: G.collar.y + bob }, look?.collar);

  // ── Head + cheek pouch ──
  const hd = G.head;
  g.fillStyle(mid, 1);     g.fillCircle(hd.cx, hd.cy + bob, hd.r);
  g.fillStyle(hi, 1);      g.fillCircle(hd.cx - hd.r * 0.2, hd.cy + bob - hd.r * 0.5, hd.r * 0.45);
  g.fillStyle(c.cheek, 1); g.fillCircle(G.cheek.cx, G.cheek.cy + bob, G.cheek.r);

  // ── Eye + nose ──
  g.fillStyle(c.eye, 1);       g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.8);  g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w * 0.5, G.eye.h * 0.5);
  g.fillStyle(c.ear, 1);       g.fillRect(G.nose.x, G.nose.y + bob, 0.8, 0.6);
  g.fillStyle(0xffffff, 0.35); g.fillRect(G.nose.x - 1, G.nose.y + bob + 0.8, 1, 0.4);
}

// ═══════════════════════════════════════════════════════════════════════════
// TURTLE — design grid 20x14 (hatchling 12x9). Slow, low-lift waddle.
// ═══════════════════════════════════════════════════════════════════════════

const TURTLE_GEO = {
  adult: {
    W: 20, H: 14,
    leg: { topY: 10.5, w: 3, h: 3.5, pawY: 13.4, pawW: 3.4, pawDX: -0.3, pawH: 0.6 },
    hindX: [3, 6], foreX: [11, 14],
    tail: { x: 0.6, y: 9, w: 2.4, h: 1.6 },
    shell: { cx: 9.5, cy: 8, w: 16, h: 10 },
    rim: { cx: 9.5, cy: 10, w: 16.6, h: 4 },
    neck: { x: 14.5, y: 7.4, w: 3, h: 2.8 },
    head: { cx: 17.2, cy: 8.4, r: 2.3 },
    eye: { x: 17.4, y: 7.6, w: 0.9, h: 0.9 },
    dot: { x: 6.5, y: 5.6, rad: 1.1 },
    tattoo: { x: 4.5, y: 10.4 },
  },
  baby: {
    W: 12, H: 9,
    leg: { topY: 6.6, w: 2, h: 2.4, pawY: 8.5, pawW: 2.2, pawDX: -0.2, pawH: 0.5 },
    hindX: [1.8, 3.6], foreX: [6.4, 8.2],
    tail: { x: 0.3, y: 5.6, w: 1.5, h: 1 },
    shell: { cx: 5.6, cy: 5, w: 10, h: 6.4 },
    rim: { cx: 5.6, cy: 6.3, w: 10.4, h: 2.5 },
    neck: { x: 8.5, y: 4.6, w: 2, h: 1.8 },
    head: { cx: 10.2, cy: 5.3, r: 1.6 },
    eye: { x: 10.3, y: 4.8, w: 0.7, h: 0.7 },
    dot: { x: 3.8, y: 3.6, rad: 0.8 },
    tattoo: { x: 2.6, y: 6.6 },
  },
};

function drawTurtle(g, bob, [lhf, lhn, lff, lfn], look, G) {
  const c = coatDef('turtle', look);
  const { hi, mid, lo } = c.body;
  const sk = c.skin;
  const pat = look?.pattern || 'plain';
  const leg = makeLeg({ ...G.leg, pawColor: sk.lo });
  const s = G.shell;

  // ── Flippers/legs ── stubby, barely lifting (turtles waddle).
  leg(g, G.hindX[0], lhf, sk.lo, bob);  leg(g, G.foreX[0], lff, sk.lo, bob);
  leg(g, G.hindX[1], lhn, sk.mid, bob); leg(g, G.foreX[1], lfn, sk.mid, bob);

  // ── Tail ──
  g.fillStyle(sk.lo, 1); g.fillRect(G.tail.x, G.tail.y + bob, G.tail.w, G.tail.h);

  // ── Neck + head ── poking out to the right, under the shell's front lip.
  g.fillStyle(sk.mid, 1); g.fillRect(G.neck.x, G.neck.y + bob, G.neck.w, G.neck.h);
  g.fillStyle(sk.mid, 1); g.fillCircle(G.head.cx, G.head.cy + bob, G.head.r);
  g.fillStyle(sk.hi, 1);  g.fillCircle(G.head.cx - G.head.r * 0.25, G.head.cy + bob - G.head.r * 0.45, G.head.r * 0.45);
  g.fillStyle(c.beak, 1); g.fillRect(G.head.cx + G.head.r * 0.5, G.head.cy + bob + G.head.r * 0.1, G.head.r * 0.6, G.head.r * 0.4);
  g.fillStyle(c.eye, 1);  g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.7); g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w * 0.5, G.eye.h * 0.5);

  // ── Shell ── domed carapace with a marginal rim below it.
  g.fillStyle(lo, 1);  g.fillEllipse(G.rim.cx, G.rim.cy + bob, G.rim.w, G.rim.h);
  g.fillStyle(mid, 1); g.fillEllipse(s.cx, s.cy + bob, s.w, s.h);
  g.fillStyle(hi, 1);  g.fillEllipse(s.cx - s.w * 0.06, s.cy + bob - s.h * 0.24, s.w * 0.66, s.h * 0.4);
  g.fillStyle(lo, 1);  g.fillEllipse(s.cx, s.cy + bob + s.h * 0.34, s.w * 0.9, s.h * 0.24);

  // ── Shell markings ── the turtle's whole look lives here.
  const dot = (fx, fy, kw, kh) => g.fillRect(s.cx + s.w * fx, s.cy + bob + s.h * fy,
    Math.max(0.5, s.w * kw), Math.max(0.5, s.h * kh));
  if (pat === 'starburst') {
    g.fillStyle(c.mark, 0.85);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      dot(Math.cos(a) * 0.2 - 0.03, Math.sin(a) * 0.2 - 0.03, 0.06, 0.06);
      dot(Math.cos(a) * 0.33 - 0.025, Math.sin(a) * 0.33 - 0.025, 0.05, 0.05);
    }
  } else if (pat === 'rings') {
    g.fillStyle(c.mark, 0.75); g.fillEllipse(s.cx, s.cy + bob, s.w * 0.62, s.h * 0.58);
    g.fillStyle(mid, 1);       g.fillEllipse(s.cx, s.cy + bob, s.w * 0.5, s.h * 0.46);
    g.fillStyle(c.mark, 0.75); g.fillEllipse(s.cx, s.cy + bob, s.w * 0.24, s.h * 0.22);
  } else if (pat === 'speckled') {
    g.fillStyle(c.mark, 0.8);
    [[-0.28, -0.1], [-0.1, 0.12], [0.06, -0.16], [0.2, 0.06], [-0.18, 0.2], [0.3, -0.1], [0, -0.02]]
      .forEach(([fx, fy]) => dot(fx, fy, 0.07, 0.07));
  } else {
    // Plain: just the scute seams, so the shell still reads as segmented.
    g.fillStyle(lo, 0.55);
    for (let i = -1; i <= 1; i++) g.fillRect(s.cx + s.w * i * 0.2, s.cy + bob - s.h * 0.32, 0.4, s.h * 0.62);
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);
  drawShellDot(g, { x: G.dot.x, y: G.dot.y + bob, rad: G.dot.rad }, look?.collar);
}

// ═══════════════════════════════════════════════════════════════════════════
// SNAKE — design grid 24x10 (hatchling 15x7). No legs — an S-curve chain of
// overlapping segments that undulates to slither, modeled on the turtle's
// slow low-lift gait but with a wave instead of a leg cycle.
// ═══════════════════════════════════════════════════════════════════════════

const SNAKE_GEO = {
  adult: {
    W: 24, H: 10, segs: 6, segR: 2.1, ampY: 2.6, headR: 2.6,
    head: { cx: 21, cy: 5 },
    eye: { dx: 0.9, dy: -0.7, w: 0.9, h: 0.9 },
    tongue: { len: 2.4 },
    dot: { x: 12, y: 4, rad: 1.0 },
    tattoo: { x: 5, y: 7 },
  },
  baby: {
    W: 15, H: 7, segs: 5, segR: 1.3, ampY: 1.7, headR: 1.6,
    head: { cx: 13, cy: 3.4 },
    eye: { dx: 0.6, dy: -0.4, w: 0.6, h: 0.6 },
    tongue: { len: 1.5 },
    dot: { x: 7.5, y: 2.6, rad: 0.65 },
    tattoo: { x: 3, y: 4.6 },
  },
};

// `pose` is { phase, bob, tongue } — `phase` shifts the sine wave the body
// segments trace, so cycling it across frames reads as a slither; `tongue`
// flicks a little forked tongue out on the frames that want it.
function drawSnake(g, pose, look, G) {
  const c = coatDef('snake', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'solid';
  const { segs, segR, ampY, headR } = G;
  const bob = pose.bob || 0;
  const phase = pose.phase || 0;
  const waveAt = (t) => Math.sin(t * Math.PI * 1.6 + phase) * ampY * (0.4 + 0.6 * t);

  // ── Body ── a chain of overlapping circles tracing an S-curve from the
  // tail (left) to the head (right), thickening toward the head.
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const x = 2 + t * (G.head.cx - headR * 0.6 - 2);
    pts.push({ x, y: G.head.cy + bob + waveAt(t), r: segR * (0.55 + 0.45 * t) });
  }
  g.fillStyle(lo, 1);
  pts.forEach((p) => g.fillCircle(p.x, p.y + 0.6, p.r));
  g.fillStyle(mid, 1);
  pts.forEach((p) => g.fillCircle(p.x, p.y, p.r));
  g.fillStyle(c.belly, 1);
  pts.forEach((p) => g.fillCircle(p.x, p.y + p.r * 0.35, p.r * 0.55));
  g.fillStyle(hi, 1);
  pts.forEach((p) => g.fillCircle(p.x - p.r * 0.2, p.y - p.r * 0.4, p.r * 0.5));

  if (pat === 'banded') {
    g.fillStyle(c.mark, 1);
    pts.forEach((p, i) => { if (i % 2 === 0) g.fillCircle(p.x, p.y, p.r * 0.8); });
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);
  // Snakes don't wear collars in a tank — a dab of coloured paint on the
  // scales does the same job as the turtle's shell dot.
  drawShellDot(g, { x: G.dot.x, y: G.dot.y + bob, rad: G.dot.rad }, look?.collar);

  // ── Head ── a slightly bigger circle at the end, with an eye and a
  // flicking tongue on frames that want one.
  const hx = G.head.cx;
  const hy = G.head.cy + bob + waveAt(1);
  g.fillStyle(mid, 1); g.fillCircle(hx, hy, headR);
  g.fillStyle(hi, 1);  g.fillCircle(hx - headR * 0.25, hy - headR * 0.35, headR * 0.45);
  g.fillStyle(c.eye, 1);       g.fillRect(hx + G.eye.dx, hy + G.eye.dy, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.7);  g.fillRect(hx + G.eye.dx, hy + G.eye.dy, G.eye.w * 0.5, G.eye.h * 0.5);
  if (pose.tongue) {
    g.fillStyle(0xd94f4f, 1);
    const tx = hx + headR + G.tongue.len;
    g.fillTriangle(hx + headR * 0.9, hy, tx, hy - 0.6, hx + headR + G.tongue.len * 0.6, hy);
    g.fillTriangle(hx + headR * 0.9, hy, tx, hy + 0.6, hx + headR + G.tongue.len * 0.6, hy);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BIRD (issue #24) — design grid 16x14 (chick 10x9). Hops instead of walking,
// like the bunny, plus a little wing flutter on the idle/mid-hop frames.
// ═══════════════════════════════════════════════════════════════════════════

const BIRD_GEO = {
  adult: {
    W: 16, H: 14, hopMax: 3,
    leg: { cx: 7.4, spread: 1.2, topY: 10.4, w: 1, h: 2.6, pawW: 2.2, pawH: 0.8 },
    tail: { x: 0.4, y: 6.2, w: 3.2, h: 2.6 },
    body: { cx: 7.6, cy: 7.8, w: 9.6, h: 7.4 },
    belly: { cx: 7.8, cy: 9.6, w: 6, h: 2.2 },
    wing: { cx: 6.6, cy: 7.4, w: 5.6, h: 4.4 },
    neck: { x: 11, y: 4.6, w: 2.2, h: 3 },
    head: { cx: 13, cy: 4.6, r: 2.6 },
    beak: { x: 15.2, y: 4.2, w: 2.2, h: 1.5 },
    eye: { x: 13.6, y: 3.5, w: 1, h: 1 },
    dot: { x: 4.4, y: 5.4, rad: 1 },
    tattoo: { x: 2.4, y: 9 },
  },
  baby: {
    W: 10, H: 9, hopMax: 2,
    leg: { cx: 4.6, spread: 0.8, topY: 6.6, w: 0.7, h: 1.7, pawW: 1.4, pawH: 0.5 },
    tail: { x: 0.2, y: 4, w: 2, h: 1.7 },
    body: { cx: 4.8, cy: 5, w: 6.2, h: 4.8 },
    belly: { cx: 4.9, cy: 6.2, w: 3.8, h: 1.4 },
    wing: { cx: 4.2, cy: 4.8, w: 3.6, h: 2.9 },
    neck: { x: 6.8, y: 3, w: 1.4, h: 1.9 },
    head: { cx: 8, cy: 3, r: 1.7 },
    beak: { x: 9.4, y: 2.7, w: 1.4, h: 1 },
    eye: { x: 8.4, y: 2.3, w: 0.65, h: 0.65 },
    dot: { x: 2.8, y: 3.5, rad: 0.65 },
    tattoo: { x: 1.5, y: 5.8 },
  },
};

// `pose` is { hop, flap } — `hop` lifts the whole body (birds hop, not walk,
// same idea as the bunny); `flap` raises the wing a touch on the frames that
// want a flutter (idle and mid-hop).
function drawBird(g, pose, look, G) {
  const c = coatDef('bird', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'solid';
  const lift = pose.hop || 0;
  const flap = pose.flap || 0;
  const b = G.body;
  const L = G.leg;

  // ── Legs + feet ── thin stalks, tucked up together mid-hop.
  g.fillStyle(c.beak, 1);
  g.fillRect(L.cx - L.spread - L.w / 2, L.topY - lift, L.w, L.h);
  g.fillRect(L.cx + L.spread - L.w / 2, L.topY - lift, L.w, L.h);
  g.fillRect(L.cx - L.spread - L.pawW * 0.4, L.topY + L.h - lift, L.pawW, L.pawH);
  g.fillRect(L.cx + L.spread - L.pawW * 0.4, L.topY + L.h - lift, L.pawW, L.pawH);

  // ── Tail ── short, fanned feathers pointing back-and-down.
  g.fillStyle(lo, 1);  g.fillRect(G.tail.x, G.tail.y - lift, G.tail.w, G.tail.h);
  g.fillStyle(mid, 1); g.fillRect(G.tail.x + G.tail.w * 0.3, G.tail.y - lift, G.tail.w * 0.5, G.tail.h * 0.7);

  // ── Body ── round little puff.
  g.fillStyle(mid, 1);     g.fillEllipse(b.cx, b.cy - lift, b.w, b.h);
  g.fillStyle(hi, 1);      g.fillEllipse(b.cx, b.cy - lift - b.h * 0.26, b.w * 0.68, b.h * 0.32);
  g.fillStyle(c.belly, 1); g.fillEllipse(G.belly.cx, G.belly.cy - lift, G.belly.w, G.belly.h);

  // ── Pattern overlay ── sparrow speckling.
  if (pat === 'speckled') {
    const d = Math.max(0.5, b.h * 0.12);
    g.fillStyle(c.mark, 0.85);
    [[-0.22, -0.12], [-0.02, 0.1], [0.16, -0.18], [0.24, 0.08], [-0.1, 0.2], [0.05, -0.24]]
      .forEach(([fx, fy]) => g.fillRect(b.cx + b.w * fx, b.cy - lift + b.h * fy, d, d));
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y - lift, look?.tattoo, c.body);

  // ── Wing ── overlaps the body, tip lifting a little on a flutter frame.
  g.fillStyle(lo, 1);
  g.fillEllipse(G.wing.cx, G.wing.cy - lift - flap, G.wing.w, G.wing.h);
  g.fillStyle(c.wing, 1);
  g.fillEllipse(G.wing.cx - G.wing.w * 0.1, G.wing.cy - lift - flap - G.wing.h * 0.06, G.wing.w * 0.68, G.wing.h * 0.58);

  // Birds don't wear a collar — a small dab of coloured paint on the wing
  // does the same tie-breaking job (same trick as the turtle/snake dot).
  drawShellDot(g, { x: G.dot.x, y: G.dot.y - lift, rad: G.dot.rad }, look?.collar);

  // ── Neck + head ──
  g.fillStyle(mid, 1); g.fillRect(G.neck.x, G.neck.y - lift, G.neck.w, G.neck.h);
  const hd = G.head;
  g.fillStyle(mid, 1); g.fillCircle(hd.cx, hd.cy - lift, hd.r);
  g.fillStyle(hi, 1);  g.fillCircle(hd.cx - hd.r * 0.3, hd.cy - lift - hd.r * 0.4, hd.r * 0.42);
  if (pat === 'speckled') {
    g.fillStyle(c.mark, 0.7);
    g.fillRect(hd.cx - hd.r * 0.5, hd.cy - lift - hd.r * 0.2, hd.r * 0.5, hd.r * 0.4);
  }

  // ── Beak ──
  g.fillStyle(c.beak, 1);
  g.fillTriangle(
    G.beak.x, G.beak.y - lift,
    G.beak.x + G.beak.w, G.beak.y - lift + G.beak.h * 0.4,
    G.beak.x, G.beak.y - lift + G.beak.h,
  );

  // ── Eye ──
  g.fillStyle(c.eye, 1);      g.fillRect(G.eye.x, G.eye.y - lift, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.85); g.fillRect(G.eye.x, G.eye.y - lift, G.eye.w * 0.4, G.eye.h * 0.4);
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAGON (secret bonus guest, src/dev/secretDragon.js) — design grid 20x16
// (hatchling 12x10). A small reptilian quadruped, closest to the turtle's
// waddling gait (low-lift legs, no proper walk cycle needed), plus a pair of
// small folded wings and two tiny brow horns — charming and readable at this
// scale rather than fearsome, per the owner's "kid's game" note. Not a fully
// fleshed 9th species: kept as simple as the other land animals to draw.
// ═══════════════════════════════════════════════════════════════════════════

// Canvas widened on the LEFT (by DELTA units, adult 9 / baby 6) versus the
// original stubby-tail geo so a proper long tail has room to sweep out to the
// left of the haunch — every other element below is the original geo shifted
// right by that same DELTA, so the body/head/wings/etc. sit exactly where
// they always did relative to each other. Only `tail` uses the freed space.
const DRAGON_GEO = {
  adult: {
    W: 29, H: 16,
    leg: { topY: 11, w: 2, h: 4, pawY: 15, pawW: 3, pawDX: -0.5, pawH: 1 },
    hindX: [13, 15.5], foreX: [21, 23.5],
    body: { cx: 18, cy: 9, w: 13, h: 7 },
    // Long S-curved tail: overlapping ellipses tapering from a thick base at
    // the haunch down to a slender tip, with a gentle up/down wave so it
    // reads as a sweeping curve rather than a straight stick.
    tail: {
      points: [
        { x: 12.5, y: 9.0, w: 6.0, h: 3.0 },
        { x: 8.5, y: 8.3, w: 5.0, h: 2.4 },
        { x: 5.0, y: 9.0, w: 3.6, h: 1.8 },
        { x: 1.8, y: 8.4, w: 2.0, h: 1.1 },
      ],
    },
    neck: { x: 23, y: 5.5, w: 3, h: 4 },
    head: { cx: 25.5, cy: 5, r: 2.6 },
    snout: { x: 27.4, y: 4.4, w: 2, h: 2 },
    horn: { x1: 24.4, x2: 25.6, y: 2.2, w: 0.9, h: 1.8 },
    eye: { x: 25.9, y: 4.1, w: 1, h: 1 },
    wing: { x: 15.4, y: 3.2, w: 9.5, h: 7.4 },
    collar: { x: 23.4, y: 7.8, w: 3, h: 1.4 },
    tattoo: { x: 12, y: 11.4 },
  },
  baby: {
    W: 18, H: 10,
    leg: { topY: 6.8, w: 1.3, h: 2.4, pawY: 9.2, pawW: 1.8, pawDX: -0.3, pawH: 0.6 },
    hindX: [8.4, 10], foreX: [13.2, 14.8],
    body: { cx: 11.4, cy: 5.6, w: 8, h: 4.4 },
    tail: {
      points: [
        { x: 7.5, y: 5.7, w: 3.6, h: 1.8 },
        { x: 5.0, y: 5.3, w: 3.0, h: 1.4 },
        { x: 2.8, y: 5.7, w: 2.1, h: 1.05 },
        { x: 0.9, y: 5.35, w: 1.15, h: 0.65 },
      ],
    },
    neck: { x: 14.4, y: 3.4, w: 1.8, h: 2.4 },
    head: { cx: 16, cy: 3.1, r: 1.6 },
    snout: { x: 17.2, y: 2.7, w: 1.2, h: 1.2 },
    horn: { x1: 15.3, x2: 16.1, y: 1.3, w: 0.55, h: 1.1 },
    eye: { x: 16.2, y: 2.5, w: 0.6, h: 0.6 },
    wing: { x: 9.8, y: 1.9, w: 5.7, h: 4.4 },
    collar: { x: 14.6, y: 4.7, w: 1.8, h: 0.85 },
    tattoo: { x: 7.8, y: 7.1 },
  },
};

function drawDragon(g, bob, [lhf, lhn, lff, lfn], look, G) {
  const c = coatDef('dragon', look);
  const { hi, mid, lo } = c.body;
  const pat = look?.pattern || 'smooth';
  const leg = makeLeg({ ...G.leg, pawColor: lo });
  const b = G.body;

  // ── Legs ── stubby, barely lifting — same low-key waddle as the turtle.
  leg(g, G.hindX[0], lhf, lo, bob);  leg(g, G.foreX[0], lff, lo, bob);
  leg(g, G.hindX[1], lhn, mid, bob); leg(g, G.foreX[1], lfn, mid, bob);

  // ── Tail ── long S-curve sweeping out from the haunch: several overlapping
  // ellipses tapering down to a slender tip, each with a lighter highlight
  // riding its upper edge so the whole sweep still reads with body/shadow
  // contrast instead of flattening into a silhouette.
  for (const seg of G.tail.points) {
    g.fillStyle(lo, 1);  g.fillEllipse(seg.x, seg.y + bob, seg.w, seg.h);
    g.fillStyle(mid, 1); g.fillEllipse(seg.x + seg.w * 0.15, seg.y + bob - seg.h * 0.18, seg.w * 0.55, seg.h * 0.6);
  }

  // ── Body ── low, rounded barrel.
  g.fillStyle(mid, 1); g.fillEllipse(b.cx, b.cy + bob, b.w, b.h);
  g.fillStyle(hi, 1);  g.fillEllipse(b.cx - b.w * 0.05, b.cy + bob - b.h * 0.28, b.w * 0.62, b.h * 0.36);
  g.fillStyle(c.belly, 1); g.fillEllipse(b.cx, b.cy + bob + b.h * 0.3, b.w * 0.7, b.h * 0.32);

  // ── Pattern overlay ── a light dusting of diamond scale-highlights.
  if (pat === 'scaled') {
    g.fillStyle(c.mark, 0.6);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        g.fillRect(b.cx + i * b.w * 0.18 - 0.4, b.cy + bob - b.h * 0.1 + j * b.h * 0.22 - 0.4, 0.8, 0.8);
      }
    }
  }

  drawTattoo(g, G.tattoo.x, G.tattoo.y + bob, look?.tattoo, c.body);

  // ── Wings ── folded against the back at rest; a light flap tied to the
  // same per-frame bob that drives every species' idle/walk cycle, so they
  // visibly lift a touch on each "up" frame without needing their own
  // animation track.
  const flap = bob * 1.4;
  g.fillStyle(lo, 1);
  g.fillTriangle(
    G.wing.x, G.wing.y + bob - flap,
    G.wing.x + G.wing.w, G.wing.y + bob * 0.4 - flap * 0.6,
    G.wing.x + G.wing.w * 0.3, G.wing.y + G.wing.h + bob,
  );
  g.fillStyle(c.wing, 1);
  g.fillTriangle(
    G.wing.x + G.wing.w * 0.15, G.wing.y + bob - flap * 0.9,
    G.wing.x + G.wing.w * 0.85, G.wing.y + bob * 0.5 - flap * 0.5,
    G.wing.x + G.wing.w * 0.35, G.wing.y + G.wing.h * 0.78 + bob,
  );

  // ── Neck + head ──
  g.fillStyle(mid, 1); g.fillRect(G.neck.x, G.neck.y + bob, G.neck.w, G.neck.h);
  g.fillStyle(mid, 1); g.fillCircle(G.head.cx, G.head.cy + bob, G.head.r);
  g.fillStyle(hi, 1);  g.fillCircle(G.head.cx - G.head.r * 0.3, G.head.cy + bob - G.head.r * 0.4, G.head.r * 0.42);
  g.fillStyle(mid, 1); g.fillRect(G.snout.x, G.snout.y + bob, G.snout.w, G.snout.h);

  // ── Horns ── two tiny nubs on the brow.
  g.fillStyle(c.horn, 1);
  g.fillTriangle(G.horn.x1, G.horn.y + bob + G.horn.h, G.horn.x1 + G.horn.w, G.horn.y + bob + G.horn.h, G.horn.x1 + G.horn.w * 0.5, G.horn.y + bob);
  g.fillTriangle(G.horn.x2, G.horn.y + bob + G.horn.h, G.horn.x2 + G.horn.w, G.horn.y + bob + G.horn.h, G.horn.x2 + G.horn.w * 0.5, G.horn.y + bob);

  // ── Eye ──
  g.fillStyle(c.eye, 1);      g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w, G.eye.h);
  g.fillStyle(0xffffff, 0.7); g.fillRect(G.eye.x, G.eye.y + bob, G.eye.w * 0.5, G.eye.h * 0.5);

  drawCollar(g, { ...G.collar, y: G.collar.y + bob }, look?.collar);
}

// ═══════════════════════════════════════════════════════════════════════════
// Species registry + texture building
// ═══════════════════════════════════════════════════════════════════════════

// Per-species build recipe. `walkFps` sets the gait's tempo — a turtle waddles
// slowly, a hamster scurries.
const BUILDERS = {
  dog: {
    geo: DOG_GEO, walkFps: 8,
    build: (scene, key, G, look) =>
      buildFrames(scene, key, G.W, G.H, (g, bob, legs) => drawDog(g, bob, legs, look, G), idleWalkLegs(2)),
  },
  cat: {
    geo: CAT_GEO, walkFps: 8,
    build: (scene, key, G, look) => {
      // Cats pad smoothly: no body bob, one paw at a time, tail tip flicking.
      const frames = [
        { bob: 0, legs: [0, 0, 0, 0], tail: 0 },
        { bob: 0, legs: [0, 0, 0, 0], tail: 1 }, // idle tail-tip flick
        { bob: 0, legs: [0, 0, 0, 0], tail: 0 },
        { bob: 0, legs: [1, 0, 0, 0], tail: 0 },
        { bob: 0, legs: [0, 0, 1, 0], tail: 1 },
        { bob: 0, legs: [0, 0, 0, 1], tail: 0 },
      ];
      buildPoseFrames(scene, key, G.W, G.H, (g, f) => drawCat(g, f.bob, f.legs, f.tail, look, G), frames);
    },
  },
  bunny: {
    geo: BUNNY_GEO, walkFps: 7,
    build: (scene, key, G, look) => {
      // Bunnies HOP: the walk frames lift the whole body off the ground rather
      // than cycling legs, so movement reads as a bounce.
      const m = G.hopMax;
      const poses = [
        { hop: 0, wiggle: 0 },
        { hop: 0, wiggle: 1 },        // idle nose twitch
        { hop: 0, wiggle: 0 },        // touch down
        { hop: m * 0.75, wiggle: 0 }, // mid-hop
        { hop: 0, wiggle: 0 },        // touch down
        { hop: m, wiggle: 0 },        // peak hop
      ];
      buildPoseFrames(scene, key, G.W, G.H, (g, p) => drawBunny(g, p, look, G), poses);
    },
  },
  guineaPig: {
    geo: GUINEA_PIG_GEO, walkFps: 9,
    build: (scene, key, G, look) =>
      buildFrames(scene, key, G.W, G.H, (g, bob, legs) => drawGuineaPig(g, bob, legs, look, G), idleWalkLegs(1)),
  },
  hamster: {
    geo: HAMSTER_GEO, walkFps: 11,
    build: (scene, key, G, look) =>
      buildFrames(scene, key, G.W, G.H, (g, bob, legs) => drawHamster(g, bob, legs, look, G), idleWalkLegs(1)),
  },
  turtle: {
    geo: TURTLE_GEO, walkFps: 4, // slow, low-lift waddle
    build: (scene, key, G, look) =>
      buildFrames(scene, key, G.W, G.H, (g, bob, legs) => drawTurtle(g, bob, legs, look, G),
        idleWalkLegs(0.75), [0, 0.5, 0, 0.5, 0, 0.5]),
  },
  snake: {
    geo: SNAKE_GEO, walkFps: 5, // slow slither
    build: (scene, key, G, look) => {
      const poses = [
        { phase: 0, bob: 0, tongue: false },
        { phase: 0.3, bob: 0, tongue: true }, // idle tongue flick
        { phase: 0, bob: 0, tongue: false },
        { phase: Math.PI * 0.5, bob: 0.4, tongue: false },
        { phase: Math.PI, bob: 0, tongue: false },
        { phase: Math.PI * 1.5, bob: 0.4, tongue: false },
      ];
      buildPoseFrames(scene, key, G.W, G.H, (g, p) => drawSnake(g, p, look, G), poses);
    },
  },
  bird: {
    geo: BIRD_GEO, walkFps: 9,
    build: (scene, key, G, look) => {
      // Birds HOP, same idea as the bunny, plus a wing flutter on the idle
      // and mid-hop frames.
      const m = G.hopMax;
      const poses = [
        { hop: 0, flap: 0 },
        { hop: 0, flap: 1.2 },        // idle wing flutter
        { hop: 0, flap: 0 },          // touch down
        { hop: m * 0.75, flap: 0.7 }, // mid-hop
        { hop: 0, flap: 0 },          // touch down
        { hop: m, flap: 0.9 },        // peak hop
      ];
      buildPoseFrames(scene, key, G.W, G.H, (g, p) => drawBird(g, p, look, G), poses);
    },
  },
  dragon: {
    geo: DRAGON_GEO, walkFps: 6, // slow, low-lift waddle, same tempo family as the turtle
    build: (scene, key, G, look) =>
      buildFrames(scene, key, G.W, G.H, (g, bob, legs) => drawDragon(g, bob, legs, look, G), idleWalkLegs(1.2)),
  },
};

// Base texture key for a species/stage/look, e.g.
// "animal-dog-adult-golden-patches". Individual frames are `${base}_idle_0` etc.
export function animalTextureKey(speciesKey, stage, look) {
  return `animal-${speciesKey}-${stage}-${lookId(look)}`;
}

// The design-grid dimensions this species/stage is drawn at — the on-screen
// size is these × 2 logical px (ART_SCALE up, ANIMAL_DISPLAY_SCALE back down).
export function animalDesignSize(speciesKey, stage) {
  const G = BUILDERS[speciesKey].geo[stage === 'baby' ? 'baby' : 'adult'];
  return { w: G.W, h: G.H };
}

// Lazily builds the full 6-frame sheet AND the idle/walk animations for
// `speciesKey`/`stage`/`look`, returning the base key either way. Callers do:
//
//   const base = ensureAnimalTextures(this, a.species, a.stage, look);
//   const s = this.add.sprite(x, y, `${base}_idle_0`)
//     .setOrigin(0.5, 1).setScale(ANIMAL_DISPLAY_SCALE);
//   s.play(`${base}_idle`);          // or `${base}_walk` when moving
export function ensureAnimalTextures(scene, speciesKey, stage, look) {
  const spec = BUILDERS[speciesKey];
  if (!spec) throw new Error(`ensureAnimalTextures: unknown species "${speciesKey}"`);
  const key = animalTextureKey(speciesKey, stage, look);

  if (!scene.textures.exists(`${key}_idle_0`)) {
    spec.build(scene, key, spec.geo[stage === 'baby' ? 'baby' : 'adult'], look);
  }
  if (!scene.anims.exists(`${key}_idle`)) {
    scene.anims.create({
      key: `${key}_idle`,
      frames: [{ key: `${key}_idle_0` }, { key: `${key}_idle_1` }],
      frameRate: 1.6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}_walk`,
      frames: [0, 1, 2, 3].map((i) => ({ key: `${key}_walk_${i}` })),
      frameRate: spec.walkFps,
      repeat: -1,
    });
  }
  return key;
}

// ── Shared props ────────────────────────────────────────────────────────────

// Small cream egg with a couple of faint speckles — turtle eggs sit on the sand
// island (DESIGN.md).
function drawEgg(g, w, h) {
  g.fillStyle(0xf3e6c8, 1); g.fillEllipse(w / 2, h / 2, w * 0.92, h * 0.96);
  g.fillStyle(0xfffaf0, 0.7); g.fillEllipse(w * 0.4, h * 0.36, w * 0.4, h * 0.34);
  g.fillStyle(0xe0cfa0, 1);
  g.fillEllipse(w * 0.42, h * 0.46, 1.4, 1.4);
  g.fillEllipse(w * 0.62, h * 0.6, 1.2, 1.2);
}

// Builds the egg texture shared by every placement. Name tags (issue #22 #1)
// are now sized procedurally per-name at render time in KennelScene, rather
// than stamped from a fixed-size texture — see KennelScene._addNameTag.
// Animal sheets themselves are built lazily per species/stage/look — see
// ensureAnimalTextures(). Call once from KennelScene.create().
export function buildAnimalTextures(scene) {
  gen(scene, EGG_KEY, 10, 8, (g) => drawEgg(g, 10, 8));

  // Cheap guard: data/species.js `size` is the design grid the art is authored
  // at, and KennelScene uses it for placement maths — warn loudly if they drift.
  for (const [k, spec] of Object.entries(SPECIES)) {
    const G = BUILDERS[k]?.geo.adult;
    if (G && (spec.size.w !== G.W || spec.size.h !== G.H)) {
      console.warn(`[animals] species.js size for ${k} (${spec.size.w}x${spec.size.h}) != art grid ${G.W}x${G.H}`);
    }
  }
}

export { ART_SCALE };
