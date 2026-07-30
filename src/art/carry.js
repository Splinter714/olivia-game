// Procedural textures for the carry props used when an arrival is dropped off
// and picked up (DESIGN.md "Pets Checking In" — leash/cage/box/basket), plus
// the data/roster.js CARRY_KIND -> texture key mapping KennelScene reads from.
//
// Issue #21: redrawn with the same supersampled technique art/animals.js uses
// (ART_SCALE/scaledGraphics/gen from _frames.js) so these props match the
// current animal-art quality instead of the original flat-Graphics pass.
// Static single-frame textures — these are props, not creatures, so no
// animation sheet.
//
// Owner note mid-build (2026-07-29): the turtle "box" and egg "basket" read
// wrong as a closed cardboard box / woven picnic basket — "maybe if we can
// still see the animal in its carrier its ok?" Both are now the SAME small
// open/see-through carrier (a mini terrarium: low glass-ish walls, an open
// top, no lid) so the turtle mom or her eggs are clearly visible sitting
// inside, same "see what's inside" principle as the cat carrier's peek-through
// door — just applied as a fully-open tray instead of a windowed door, since
// KennelScene composes this one BEHIND her rather than as an overlay.
import { ART_SCALE, DISPLAY_SCALE, gen, scaledGraphics } from './_frames.js';
import { CARRY_KIND } from '../data/roster.js';

export const CARRY_KEY = {
  [CARRY_KIND.LEASH]: 'carry-leash',
  [CARRY_KIND.CAGE]: 'carry-cage',
  [CARRY_KIND.BOX]: 'carry-box',
  [CARRY_KIND.BASKET]: 'carry-basket',
};

// Same net on-screen scale every animal sprite uses (design-grid px -> 2
// logical px) — apply this whenever a CARRY_KEY texture is added to the scene.
export const CARRY_DISPLAY_SCALE = DISPLAY_SCALE;

// ── Leash — a loop handle, a curved lead, and a little clip ────────────────
// Design grid ~17x15. The cord itself wants a real stroked polyline, which
// scaledGraphics doesn't expose (only fill helpers) — drop to `.raw` for that
// one detail and scale the coordinates by hand, same trick _frames.js's own
// doc comment calls out ("the rare detail that wants native R× coordinates").
function drawLeash(g, w, h) {
  const raw = g.raw;
  raw.lineStyle(1.3 * ART_SCALE, 0x8a5a34, 1);
  raw.beginPath();
  raw.moveTo(w * 0.22 * ART_SCALE, h * 0.1 * ART_SCALE);
  raw.lineTo(w * 0.52 * ART_SCALE, h * 0.6 * ART_SCALE);
  raw.lineTo(w * 0.8 * ART_SCALE, h * 0.16 * ART_SCALE);
  raw.strokePath();
  // Handle loop.
  g.fillStyle(0x6b4423, 1);
  g.fillCircle(w * 0.22, h * 0.1, w * 0.1);
  g.fillStyle(0xf7f4ee, 1);
  g.fillCircle(w * 0.22, h * 0.1, w * 0.05);
  // Clip + a small dangling collar tag at the far end.
  g.fillStyle(0xdd5555, 1).fillRoundedRect(w * 0.68, h * 0.55, w * 0.28, h * 0.4, 3);
  g.fillStyle(0xc94747, 1).fillCircle(w * 0.82, h * 0.55, w * 0.05);
  g.fillStyle(0xf3d878, 1).fillCircle(w * 0.82, h * 0.9, w * 0.06);
}

// ── Cage — a proper wire-door plastic pet carrier ──────────────────────────
// Design grid ~16x15. Drawn as an overlay IN FRONT of the carried cat's
// sprite (same anchor point) — the door area is left mostly see-through (a
// faint tint + wire bars, not solid), so her head/face reads through it while
// the solid shell hides the rest of her body, same "peeking out" look
// DESIGN.md wants.
function drawCage(g, w, h) {
  g.fillStyle(0xe7e2d8, 1).fillRoundedRect(0, h * 0.16, w, h * 0.84, 3);
  g.fillStyle(0xd3ccbd, 1).fillRect(0, h * 0.16, w, h * 0.1);
  const dx = w * 0.2, dy = h * 0.22, dw = w * 0.6, dh = h * 0.5;
  g.fillStyle(0x33302b, 0.22).fillRoundedRect(dx, dy, dw, dh, 2);
  g.fillStyle(0x6c665c, 0.85);
  for (let bx = dx + dw * 0.14; bx < dx + dw - 1; bx += dw * 0.22) g.fillRect(bx, dy, Math.max(0.4, w * 0.025), dh);
  g.fillRect(dx, dy + dh * 0.48, dw, Math.max(0.4, h * 0.03));
  g.fillStyle(0x8a8478, 1).fillRoundedRect(w * 0.36, h * 0.01, w * 0.28, h * 0.14, 3);
}

// ── Open carrier / mini-terrarium — shared by BOX (a solo turtle mom) and
// BASKET (any species' eggs) ────────────────────────────────────────────────
// A low open tray: glass-ish translucent walls, corner posts, an open top
// (no lid) and a small carry handle. KennelScene draws it BEHIND her/the
// eggs, so nothing needs cutting out — she's simply sitting inside a
// low-walled, see-through carrier.
function drawOpenCarrier(g, w, h) {
  const wallH = h * 0.56;
  const baseY = h * 0.9;
  g.fillStyle(0xb7c9c2, 1).fillRoundedRect(w * 0.04, baseY - h * 0.02, w * 0.92, h * 0.12, 2);
  g.fillStyle(0xe7f5f0, 0.22).fillRect(w * 0.1, baseY - wallH, w * 0.8, wallH);
  g.fillStyle(0x8fa39e, 1);
  g.fillRect(w * 0.08, baseY - wallH, w * 0.06, wallH);
  g.fillRect(w * 0.86, baseY - wallH, w * 0.06, wallH);
  g.fillStyle(0x8fa39e, 1).fillRoundedRect(w * 0.04, baseY - wallH - h * 0.06, w * 0.92, h * 0.07, 2);
  g.fillStyle(0x6e8781, 1).fillRoundedRect(w * 0.4, baseY - wallH - h * 0.2, w * 0.2, h * 0.16, 3);
}

export function buildCarryTextures(scene) {
  gen(scene, CARRY_KEY[CARRY_KIND.LEASH], 17 * ART_SCALE, 15 * ART_SCALE,
    (g0) => drawLeash(scaledGraphics(g0), 17, 15));
  gen(scene, CARRY_KEY[CARRY_KIND.CAGE], 16 * ART_SCALE, 15 * ART_SCALE,
    (g0) => drawCage(scaledGraphics(g0), 16, 15));
  gen(scene, CARRY_KEY[CARRY_KIND.BOX], 16 * ART_SCALE, 13 * ART_SCALE,
    (g0) => drawOpenCarrier(scaledGraphics(g0), 16, 13));
  gen(scene, CARRY_KEY[CARRY_KIND.BASKET], 15 * ART_SCALE, 11 * ART_SCALE,
    (g0) => drawOpenCarrier(scaledGraphics(g0), 15, 11));
}
