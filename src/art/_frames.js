// Shared creature-art machinery, ported from the sibling horse game's
// src/art/_frames.js (issue #15). Every animal sprite is drawn the same way:
// make an off-screen Graphics, draw into it, snapshot it to a texture, discard.
// All six kennel species also share one standard 6-frame idle/walk sheet.
//
// Non-creature art (kennel.js, props.js, carry.js, player.js) keeps using the
// plain `gen` from _gen.js — this module re-exports it so creature art has a
// single import site.

import { gen } from './_gen.js';

export { gen };

// ── Super-sampling ──────────────────────────────────────────────────────────
// The game renders at HiDPI, so a sprite drawn on a tiny grid and scaled up is
// sharp but coarse. Instead we draw the art on an R× grid and display the
// sprite at 1/R scale: identical on-screen size, R× the detail.
//
// Draw code stays written in the small "design grid" (see data/species.js
// `size`) — scaledGraphics multiplies every geometry argument by R on the way
// through, so a design-grid x of 0.25 lands exactly on the R=4 sub-pixel grid.
export const ART_SCALE = 4;

// World scale is 1 logical px per world unit and animals are authored to read
// at design-grid × 2 logical px, so a super-sampled animal sprite displays at
// 2 / ART_SCALE. Scenes should use art/animals.js's ANIMAL_DISPLAY_SCALE
// rather than reaching for this directly.
export const DISPLAY_SCALE = 2 / ART_SCALE; // 0.5

// Wrap a Phaser Graphics so draw code written in the design grid renders onto
// the R× texture transparently: geometry args are multiplied by R, colours and
// alpha pass through. `.raw` exposes the underlying Graphics for the rare
// detail that wants native R× coordinates.
export function scaledGraphics(g, r = ART_SCALE) {
  const s = (n) => n * r;
  return {
    raw: g,
    fillStyle: (c, a) => g.fillStyle(c, a),
    lineStyle: (w, c, a) => g.lineStyle(w * r, c, a),
    fillRect: (x, y, w, h) => g.fillRect(s(x), s(y), s(w), s(h)),
    fillRoundedRect: (x, y, w, h, rad) => g.fillRoundedRect(s(x), s(y), s(w), s(h), s(rad)),
    fillCircle: (x, y, rad) => g.fillCircle(s(x), s(y), s(rad)),
    fillEllipse: (x, y, w, h) => g.fillEllipse(s(x), s(y), s(w), s(h)),
    fillTriangle: (a, b, c, d, e, f) => g.fillTriangle(s(a), s(b), s(c), s(d), s(e), s(f)),
  };
}

// ── Frame sheets ────────────────────────────────────────────────────────────
// The standard sheet every species builds: two planted idle frames plus a
// four-frame gait. Frames are separate single-frame textures keyed
// `${baseKey}_${name}`; art/animals.js wires them into Phaser animations.
export const FRAME_NAMES = ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3'];

// Per-frame body bob (a 1px rise/fall) shared by every species that walks.
export const FRAME_BOBS = [0, 1, 0, 1, 0, 1];

// Standard 4-frame walk leg-lift cycle over [hindFar, hindNear, foreFar,
// foreNear]. `lift` is how far a stepping leg pulls up — bigger animals step
// higher, a turtle barely lifts at all.
export const walkCycle = (lift) => [[0, 0, 0, 0], [lift, 0, 0, lift], [0, 0, 0, 0], [0, lift, lift, 0]];

// The 6 legSets buildFrames expects: two planted idle stances + the walk cycle.
export const idleWalkLegs = (lift) => [[0, 0, 0, 0], [0, 0, 0, 0], ...walkCycle(lift)];

// Build the standard idle_0/1 + walk_0..3 sheet from a draw fn taking
// (g, bob, legs). `w`/`h` are DESIGN-GRID dimensions; the textures come out
// ART_SCALE× larger and the sprite displays at DISPLAY_SCALE.
export function buildFrames(scene, baseKey, w, h, drawFn, legSets, bobs = FRAME_BOBS) {
  legSets.forEach((legs, i) => {
    gen(scene, `${baseKey}_${FRAME_NAMES[i]}`, w * ART_SCALE, h * ART_SCALE,
      (g0) => drawFn(scaledGraphics(g0), bobs[i], legs));
  });
}

// Same sheet, but for species whose "walk" isn't a leg cycle (the bunny hops,
// so the whole body leaves the ground). `poses` is the 6-entry list of
// whatever per-frame state the draw fn wants; drawFn gets (g, pose).
export function buildPoseFrames(scene, baseKey, w, h, drawFn, poses) {
  poses.forEach((pose, i) => {
    gen(scene, `${baseKey}_${FRAME_NAMES[i]}`, w * ART_SCALE, h * ART_SCALE,
      (g0) => drawFn(scaledGraphics(g0), pose));
  });
}

// A simple two-rect leg (shin + paw) shared by the walking species. Returns a
// draw fn bound to one species' geometry; call it per leg with
// (g, x, lift, tone, bob, paw?) — `paw` overrides the bound paw colour, which
// is how white "socks" markings get painted on individual legs.
export function makeLeg({ topY, w, h, pawColor, pawY, pawW = w, pawDX = 0, pawH = 1 }) {
  return (g, x, lift, tone, bob = 0, paw = pawColor) => {
    g.fillStyle(tone, 1); g.fillRect(x, topY + bob, w, h - lift);
    g.fillStyle(paw, 1);  g.fillRect(x + pawDX, pawY + bob - lift, pawW, pawH);
  };
}
