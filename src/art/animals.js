// Procedural sprites for the six kennel species (data/species.js) — simple flat
// shape language, kid-readable at a glance rather than photorealistic (mirrors
// the horse game's layered-Graphics technique, simplified: single static pose per
// stage/color-variant, no walk-cycle frames yet). Also builds the turtle-egg and
// floating name-tag textures shared by every cage/demo placement.
import { gen } from './_gen.js';
import { SPECIES, SPECIES_KEYS } from '../data/species.js';

export const EGG_KEY = 'animal-egg';
export const NAME_TAG_KEY = 'name-tag';

// Texture key for a given species/stage/color-variant, e.g. "animal-dog-adult-0".
// Issue #4 (arrivals) and #9 (families) should build sprite keys through this
// helper rather than hand-assembling the string.
export function animalTextureKey(speciesKey, stage, colorVariant) {
  return `animal-${speciesKey}-${stage}-${colorVariant}`;
}

// ── Per-species draw functions ──────────────────────────────────────────────
// Each draws into a Graphics sized to (w, h); `baby` nudges proportions (bigger
// head, shorter limbs) rather than just uniformly shrinking the adult drawing.

function drawTurtle(g, w, h, c, baby) {
  const bodyY = h * 0.62;
  g.fillStyle(c.skin, 1);
  g.fillEllipse(w * 0.26, h * 0.88, w * 0.16, h * 0.14);
  g.fillEllipse(w * 0.74, h * 0.88, w * 0.16, h * 0.14);
  g.fillCircle(w * 0.9, bodyY - h * 0.1, h * (baby ? 0.22 : 0.16));
  const shellW = w * (baby ? 0.66 : 0.74), shellH = h * (baby ? 0.6 : 0.66);
  g.fillStyle(c.shellDark, 1).fillEllipse(w * 0.46, bodyY, shellW, shellH);
  g.fillStyle(c.shell, 1).fillEllipse(w * 0.46, bodyY - h * 0.03, shellW * 0.86, shellH * 0.82);
  g.fillStyle(c.shellDark, 1).fillEllipse(w * 0.46, bodyY - h * 0.03, shellW * 0.32, shellH * 0.32);
}

function drawGuineaPig(g, w, h, c, baby) {
  g.fillStyle(c.bodyDark, 1).fillEllipse(w / 2, h * 0.6, w * 0.92, h * 0.7);
  g.fillStyle(c.body, 1).fillEllipse(w / 2, h * 0.55, w * 0.86, h * 0.62);
  g.fillStyle(c.belly, 1).fillEllipse(w / 2, h * 0.78, w * 0.5, h * 0.28);
  const earY = h * (baby ? 0.3 : 0.24);
  g.fillStyle(c.bodyDark, 1);
  g.fillCircle(w * 0.28, earY, w * 0.08);
  g.fillCircle(w * 0.72, earY, w * 0.08);
  g.fillStyle(0x2b2b2b, 1);
  g.fillCircle(w * 0.35, h * 0.44, 1.6);
  g.fillCircle(w * 0.65, h * 0.44, 1.6);
}

function drawHamster(g, w, h, c, baby) {
  g.fillStyle(c.bodyDark, 1).fillCircle(w / 2, h * 0.58, w * 0.46);
  g.fillStyle(c.body, 1).fillCircle(w / 2, h * 0.55, w * 0.42);
  g.fillStyle(c.cheek, 1);
  g.fillCircle(w * 0.26, h * 0.62, w * 0.16);
  g.fillCircle(w * 0.74, h * 0.62, w * 0.16);
  const earY = h * (baby ? 0.24 : 0.2);
  g.fillStyle(c.bodyDark, 1);
  g.fillCircle(w * 0.32, earY, w * 0.09);
  g.fillCircle(w * 0.68, earY, w * 0.09);
  g.fillStyle(0x2b2b2b, 1);
  g.fillCircle(w * 0.42, h * 0.52, 1.4);
  g.fillCircle(w * 0.58, h * 0.52, 1.4);
}

function drawBunny(g, w, h, c, baby) {
  const earH = h * (baby ? 0.34 : 0.44);
  g.fillStyle(c.body, 1);
  g.fillRoundedRect(w * 0.32, 0, w * 0.14, earH, 4);
  g.fillRoundedRect(w * 0.54, 0, w * 0.14, earH, 4);
  g.fillStyle(c.earInner, 1);
  g.fillRoundedRect(w * 0.35, earH * 0.15, w * 0.08, earH * 0.6, 3);
  g.fillRoundedRect(w * 0.57, earH * 0.15, w * 0.08, earH * 0.6, 3);
  g.fillStyle(c.bodyDark, 1).fillEllipse(w / 2, h * 0.72, w * 0.8, h * 0.48);
  g.fillStyle(c.body, 1).fillEllipse(w / 2, h * 0.68, w * 0.72, h * 0.4);
  g.fillStyle(0xffffff, 1).fillCircle(w * 0.14, h * 0.8, w * 0.09);
  const headCY = earH * 0.85;
  g.fillStyle(c.body, 1).fillCircle(w / 2, headCY, w * 0.26);
  g.fillStyle(0x2b2b2b, 1);
  g.fillCircle(w * 0.42, headCY, 1.4);
  g.fillCircle(w * 0.58, headCY, 1.4);
}

function drawCat(g, w, h, c, baby) {
  g.fillStyle(c.body, 1);
  g.fillRect(w * 0.06, h * 0.32, w * 0.08, h * 0.4);
  g.fillCircle(w * 0.1, h * 0.3, w * 0.05);
  g.fillStyle(c.bodyDark, 1).fillEllipse(w * 0.5, h * 0.66, w * 0.6, h * 0.4);
  g.fillStyle(c.body, 1).fillEllipse(w * 0.52, h * 0.62, w * 0.54, h * 0.34);
  const headR = w * (baby ? 0.28 : 0.22);
  const hx = w * 0.72, hy = h * 0.38;
  g.fillStyle(c.body, 1);
  g.fillTriangle(hx - headR * 0.8, hy - headR * 0.4, hx - headR * 0.2, hy - headR * 1.3, hx - headR * 0.05, hy - headR * 0.5);
  g.fillTriangle(hx + headR * 0.05, hy - headR * 0.5, hx + headR * 0.5, hy - headR * 1.3, hx + headR * 0.9, hy - headR * 0.4);
  g.fillStyle(c.earInner, 1);
  g.fillTriangle(hx - headR * 0.55, hy - headR * 0.55, hx - headR * 0.28, hy - headR * 1.0, hx - headR * 0.12, hy - headR * 0.55);
  g.fillStyle(c.body, 1).fillCircle(hx, hy, headR);
  g.fillStyle(0x2b2b2b, 1);
  g.fillCircle(hx - headR * 0.3, hy, 1.5);
  g.fillCircle(hx + headR * 0.3, hy, 1.5);
  g.fillStyle(c.bodyDark, 1);
  g.fillRect(w * 0.34, h * 0.82, w * 0.07, h * 0.14);
  g.fillRect(w * 0.58, h * 0.82, w * 0.07, h * 0.14);
}

function drawDog(g, w, h, c, baby) {
  g.fillStyle(c.body, 1);
  g.fillCircle(w * 0.08, h * 0.32, w * 0.06);
  g.fillRect(w * 0.06, h * 0.32, w * 0.06, h * 0.3);
  g.fillStyle(c.bodyDark, 1).fillEllipse(w * 0.52, h * 0.66, w * 0.62, h * 0.4);
  g.fillStyle(c.body, 1).fillEllipse(w * 0.54, h * 0.62, w * 0.56, h * 0.34);
  const headR = w * (baby ? 0.26 : 0.2);
  const hx = w * 0.76, hy = h * 0.4;
  g.fillStyle(c.body, 1).fillCircle(hx, hy, headR);
  g.fillStyle(c.body, 1).fillEllipse(hx + headR * 0.7, hy + headR * 0.3, headR * 0.6, headR * 0.4);
  g.fillStyle(0x2b2b2b, 1).fillCircle(hx + headR * 1.05, hy + headR * 0.3, 1.4);
  g.fillStyle(c.earColor, 1);
  g.fillEllipse(hx - headR * 0.7, hy + headR * 0.2, headR * 0.4, headR * 0.9);
  g.fillEllipse(hx + headR * 0.2, hy - headR * 0.9, headR * 0.4, headR * 0.7);
  g.fillStyle(0x2b2b2b, 1);
  g.fillCircle(hx - headR * 0.15, hy - headR * 0.1, 1.5);
  g.fillStyle(c.bodyDark, 1);
  g.fillRect(w * 0.36, h * 0.82, w * 0.08, h * 0.16);
  g.fillRect(w * 0.62, h * 0.82, w * 0.08, h * 0.16);
}

const DRAW = {
  turtle: drawTurtle,
  guineaPig: drawGuineaPig,
  hamster: drawHamster,
  bunny: drawBunny,
  cat: drawCat,
  dog: drawDog,
};

// Small cream egg with a couple of faint speckles — turtle eggs sit on the sand
// island (DESIGN.md); the water tank/island prop itself is issue #6.
function drawEgg(g, w, h) {
  g.fillStyle(0xf3e6c8, 1).fillEllipse(w / 2, h / 2, w * 0.92, h * 0.96);
  g.fillStyle(0xe0cfa0, 1);
  g.fillEllipse(w * 0.4, h * 0.4, 1.4, 1.4);
  g.fillEllipse(w * 0.6, h * 0.58, 1.2, 1.2);
}

// Small hanging placard — "each cage has a name tag on top" (DESIGN.md). The
// scene draws the animal's name as text over this background.
function drawNameTag(g, w, h) {
  g.fillStyle(0xead9b3, 1).fillRoundedRect(0, 2, w, h - 2, 4);
  g.lineStyle(2, 0xa9824a, 1).strokeRoundedRect(1, 3, w - 2, h - 4, 4);
  g.fillStyle(0x8a6a3e, 1);
  g.fillCircle(6, 3, 2);
  g.fillCircle(w - 6, 3, 2);
}

// Builds every species/stage/color-variant texture, plus the egg and name-tag
// textures. Call once from KennelScene.create() before placing any animal art.
export function buildAnimalTextures(scene) {
  for (const key of SPECIES_KEYS) {
    const spec = SPECIES[key];
    const draw = DRAW[key];
    spec.palette.forEach((c, variant) => {
      gen(scene, animalTextureKey(key, 'adult', variant), spec.size.w, spec.size.h,
        (g) => draw(g, spec.size.w, spec.size.h, c, false));

      const bw = Math.max(8, Math.round(spec.size.w * spec.babyScale));
      const bh = Math.max(8, Math.round(spec.size.h * spec.babyScale));
      gen(scene, animalTextureKey(key, 'baby', variant), bw, bh,
        (g) => draw(g, bw, bh, c, true));
    });
  }

  gen(scene, EGG_KEY, 10, 8, (g) => drawEgg(g, 10, 8));
  gen(scene, NAME_TAG_KEY, 60, 20, (g) => drawNameTag(g, 60, 20));
}
