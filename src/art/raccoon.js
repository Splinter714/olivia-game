// The kitchen raccoon (issue #13, redrawn per owner feedback 2026-07-29) — a
// small, quick surprise, not a full kennel citizen, but drawn with the SAME
// supersampled art machinery the six kennel species use (art/animals.js):
// ART_SCALE / scaledGraphics / gen from _frames.js, so she matches the rest
// of the game's art quality instead of standing out as a simpler one-off.
//
// The silhouette/detail level (masked face, ringed bushy tail, guard-hair
// flecks) is ported from the sibling horse game's ambient-wildlife raccoon
// (src/art/wildlifeArt.js drawRaccoon2/#181) — same character, redrawn on
// this project's own design-grid/ART_SCALE numbers rather than horse game's
// raw pixel values (which were tuned for horse game's own display scale).
//
// A real 4-frame running gait (not just two alternating poses), a distinct
// "startled" pose for the scare-off, a bigger/longer-lived crumb, and a small
// held-treat icon that rides along with her while she runs the getaway.
import { gen, ART_SCALE, scaledGraphics, makeLeg, DISPLAY_SCALE } from './_frames.js';

export const RACCOON_KEYS = [
  'critter-raccoon_run_0', 'critter-raccoon_run_1', 'critter-raccoon_run_2', 'critter-raccoon_run_3',
];
export const RACCOON_SCARED_KEY = 'critter-raccoon_scared';
export const CRUMB_KEY = 'critter-crumb';
export const HELD_TREAT_KEY = 'critter-held-treat';

// Same display scale the six kennel species use, so she reads as part of the
// same art system rather than an oddly-sized guest.
export const RACCOON_DISPLAY_SCALE = DISPLAY_SCALE;

// Design grid — same proportions as horse game's ambient raccoon (RACC_W/H
// in wildlifeArt.js), which is what the coordinates below are ported from.
const RW = 26, RH = 18;

const FUR = 0x8d8f94, LO = 0x686b71, HI = 0xb4b6bb, GUARD = 0x4a4d54, DARK = 0x2c2f35,
  MASK = 0x1c1d21, PALE = 0xdedfe1, PALE_LO = 0xb9bbbf, NOSE = 0x120f0c, EAR_PINK = 0xc59a9a,
  SHINE = 0xf2efe6, NEAR_LEG = 0x3d4047;

// Same shin+paw leg builder the six kennel species use.
const raccoonLeg = makeLeg({ topY: 13, w: 2, h: 4, pawColor: DARK, pawY: 16, pawW: 3, pawDX: -0.5, pawH: 1 });

// `legs` is [hindFar, hindNear, foreFar, foreNear] lift amounts (matches the
// walkCycle convention in _frames.js); `bob` is the per-frame body bounce.
function drawRaccoon(g, [lhf, lhn, lff, lfn], bob = 0) {
  const y = bob;
  // ── Ringed bushy tail (left) — the other classic bandit tell, along with
  // the mask below.
  g.fillStyle(MASK, 1);    g.fillRect(0, 11 + y, 3, 5);
  g.fillStyle(PALE, 1);    g.fillRect(2, 10 + y, 2, 6);
  g.fillStyle(DARK, 1);    g.fillRect(4, 10 + y, 2, 6);
  g.fillStyle(PALE_LO, 1); g.fillRect(5, 9 + y, 2, 7);
  g.fillStyle(FUR, 1);     g.fillRect(6, 9 + y, 3, 7);
  g.fillStyle(LO, 1);      g.fillRect(8, 10 + y, 1, 5);

  // ── Far legs (behind the body) ──
  raccoonLeg(g, 8, lhf, DARK, y);
  raccoonLeg(g, 17, lff, DARK, y);

  // ── Body ── sunlit back, shaded belly, a scatter of guard-hair flecks.
  g.fillStyle(FUR, 1); g.fillRect(6, 8 + y, 14, 6);
  g.fillStyle(HI, 1);  g.fillRect(6, 8 + y, 14, 2);
  g.fillStyle(LO, 1);  g.fillRect(6, 12 + y, 14, 2);
  g.fillStyle(GUARD, 1);
  g.fillRect(7, 8 + y, 11, 1);
  g.fillRect(10, 9 + y, 1, 1); g.fillRect(13, 9 + y, 1, 1); g.fillRect(15, 9 + y, 1, 1);

  // ── Neck ──
  g.fillStyle(FUR, 1); g.fillRect(18, 9 + y, 3, 4);
  g.fillStyle(HI, 1);  g.fillRect(18, 9 + y, 3, 1);
  g.fillStyle(LO, 1);  g.fillRect(18, 12 + y, 3, 1);

  // ── Near legs (over the body) ──
  raccoonLeg(g, 10, lhn, NEAR_LEG, y);
  raccoonLeg(g, 19, lfn, NEAR_LEG, y);

  // ── Head ──
  g.fillStyle(FUR, 1); g.fillRect(19, 6 + y, 5, 6); g.fillRect(20, 5 + y, 3, 1);
  g.fillStyle(HI, 1);  g.fillRect(20, 6 + y, 3, 1);

  // ── Pointed snout ──
  g.fillStyle(PALE_LO, 1); g.fillRect(24, 8 + y, 2, 2); g.fillRect(23, 9 + y, 3, 2);
  g.fillStyle(PALE, 1);    g.fillRect(23, 10 + y, 2, 1);
  g.fillStyle(NOSE, 1);    g.fillRect(25, 8 + y, 1, 1); g.fillRect(24, 9 + y, 1, 1);

  // ── Ears ──
  g.fillStyle(FUR, 1);
  g.fillRect(19, 4 + y, 2, 2); g.fillRect(18, 5 + y, 1, 1);
  g.fillRect(22, 4 + y, 2, 2); g.fillRect(24, 5 + y, 1, 1);
  g.fillStyle(EAR_PINK, 1); g.fillRect(19, 5 + y, 1, 1); g.fillRect(23, 5 + y, 1, 1);
  g.fillStyle(GUARD, 1);    g.fillRect(19, 4 + y, 1, 1); g.fillRect(23, 4 + y, 1, 1);

  // ── Bandit mask across the eyes, pale brow above ──
  g.fillStyle(PALE, 1);  g.fillRect(19, 6 + y, 6, 1);
  g.fillStyle(MASK, 1);  g.fillRect(20, 7 + y, 5, 2); g.fillRect(19, 8 + y, 1, 1); g.fillRect(24, 7 + y, 1, 1);
  g.fillStyle(SHINE, 1); g.fillRect(21, 7 + y, 1, 1); g.fillRect(23, 7 + y, 1, 1);
}

// A distinct startled pose for the scare-off (issue #13 follow-up): braced
// legs, head thrown back a touch, and wide white eyes overdrawn on the mask —
// reads at a glance as "she just noticed you," instead of just cutting the
// run animation short.
function drawRaccoonScared(g) {
  drawRaccoon(g, [1, 1, 1, 1], -1);
  g.fillStyle(SHINE, 1);
  g.fillRect(20.3, 6.7, 1.4, 1.4);
  g.fillRect(22.6, 6.7, 1.4, 1.4);
  g.fillStyle(0x0c0c0d, 1);
  g.fillRect(20.7, 7.0, 0.7, 0.9);
  g.fillRect(23.0, 7.0, 0.7, 0.9);
}

// Owner feedback (2026-07-29): make the crumb trail read clearly — bigger
// and a touch more detailed than the old flat dot, drawn plain (unscaled,
// like the old crumb) since it's tiny background flavor, not a hero sprite.
function drawCrumb(g, w, h) {
  g.fillStyle(0xd9a45c, 1).fillCircle(w / 2, h / 2, w * 0.42);
  g.fillStyle(0xb9803c, 0.8).fillCircle(w * 0.36, h * 0.4, w * 0.18);
  g.fillStyle(0xf0c98a, 0.7).fillCircle(w * 0.62, h * 0.58, w * 0.12);
}

// The stolen treat itself, small enough to ride along on her back as she
// runs — same cookie silhouette as the tray on the counter (art/props.js
// drawTreatTray), one cookie's worth.
function drawHeldTreat(g, w, h) {
  g.fillStyle(0xd9a45c, 1).fillCircle(w / 2, h / 2, w * 0.42);
  g.fillStyle(0xb9803c, 0.7).fillCircle(w * 0.4, h * 0.4, w * 0.14);
}

// She's always mid-motion when visible (no idle pose needed), so a 4-frame
// diagonal-pair gait with a 1px bounce is all she needs — twice the frames
// of the old 2-pose sprite.
const RUN_FRAMES = [
  [1.5, 0, 0, 1.5],
  [0, 0, 0, 0],
  [0, 1.5, 1.5, 0],
  [0, 0, 0, 0],
];
const RUN_BOBS = [0, 1, 0, 1];

export function buildRaccoonTextures(scene) {
  RUN_FRAMES.forEach((legs, i) => {
    gen(scene, RACCOON_KEYS[i], RW * ART_SCALE, RH * ART_SCALE,
      (g) => drawRaccoon(scaledGraphics(g), legs, RUN_BOBS[i]));
  });
  gen(scene, RACCOON_SCARED_KEY, RW * ART_SCALE, RH * ART_SCALE, (g) => drawRaccoonScared(scaledGraphics(g)));
  gen(scene, CRUMB_KEY, 10, 10, (g) => drawCrumb(g, 10, 10));
  gen(scene, HELD_TREAT_KEY, 8, 8, (g) => drawHeldTreat(g, 8, 8));
}
