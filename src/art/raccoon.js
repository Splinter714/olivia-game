// The kitchen raccoon (issue #13) — a small, quick surprise, not a full
// kennel citizen: two hand-drawn running poses (not the full 6-frame
// idle/walk rig species get in art/animals.js) using the same
// layered-Graphics-into-a-texture technique, plus a tiny crumb dot she
// leaves behind while scampering off with the stolen treats.
import { gen } from './_gen.js';

export const RACCOON_KEYS = ['critter-raccoon-0', 'critter-raccoon-1'];
export const CRUMB_KEY = 'critter-crumb';

const RW = 24, RH = 16;

// A masked-face silhouette is the classic raccoon tell, so that's the one
// detail worth getting right; everything else is kept flat and simple.
// `legOffset` alternates the two running poses; `crumbs` dots a couple of
// stolen crumbs onto her back, since she's mid-heist.
function drawRaccoon(g, w, h, legOffset) {
  const body = 0x6b6459, dark = 0x3a352e, pale = 0xe8e4da;
  // Tail, streaked light/dark.
  g.fillStyle(dark, 1).fillEllipse(w * 0.16, h * 0.56, w * 0.32, h * 0.24);
  g.fillStyle(pale, 0.85).fillRect(w * 0.06, h * 0.48, w * 0.06, h * 0.18);
  g.fillStyle(dark, 0.85).fillRect(w * 0.15, h * 0.48, w * 0.06, h * 0.18);
  // Running legs.
  g.fillStyle(dark, 1);
  g.fillRect(w * 0.32 + legOffset, h * 0.76, w * 0.08, h * 0.22);
  g.fillRect(w * 0.6 - legOffset, h * 0.76, w * 0.08, h * 0.22);
  // Body.
  g.fillStyle(body, 1).fillEllipse(w * 0.52, h * 0.54, w * 0.52, h * 0.36);
  // Head + the tell-tale mask.
  g.fillStyle(body, 1).fillCircle(w * 0.82, h * 0.4, w * 0.16);
  g.fillStyle(pale, 1).fillCircle(w * 0.82, h * 0.44, w * 0.12);
  g.fillStyle(dark, 1).fillEllipse(w * 0.82, h * 0.38, w * 0.24, w * 0.1);
  g.fillStyle(0x1c1a16, 1).fillCircle(w * 0.87, h * 0.38, w * 0.018);
  g.fillStyle(dark, 1).fillCircle(w * 0.74, h * 0.28, w * 0.05).fillCircle(w * 0.9, h * 0.28, w * 0.05);
  // A couple of stolen crumbs stuck to her back.
  g.fillStyle(0xd9a45c, 1);
  g.fillCircle(w * 0.48, h * 0.44, w * 0.02);
  g.fillCircle(w * 0.58, h * 0.5, w * 0.016);
}

function drawCrumb(g, w, h) {
  g.fillStyle(0xd9a45c, 1).fillCircle(w / 2, h / 2, w * 0.4);
  g.fillStyle(0xb9803c, 0.7).fillCircle(w * 0.35, h * 0.4, w * 0.16);
}

export function buildRaccoonTextures(scene) {
  gen(scene, RACCOON_KEYS[0], RW, RH, (g) => drawRaccoon(g, RW, RH, 0));
  gen(scene, RACCOON_KEYS[1], RW, RH, (g) => drawRaccoon(g, RW, RH, 3));
  gen(scene, CRUMB_KEY, 6, 6, (g) => drawCrumb(g, 6, 6));
}
