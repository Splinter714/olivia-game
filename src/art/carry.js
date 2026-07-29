// Procedural textures for the carry props used when the player picks up an
// arrival (DESIGN.md "Pets Checking In" — leash/cage/box/basket), plus the
// data/roster.js CARRY_KIND -> texture key mapping KennelScene reads from.
import { gen } from './_gen.js';
import { CARRY_KIND } from '../data/roster.js';

export const CARRY_KEY = {
  [CARRY_KIND.LEASH]: 'carry-leash',
  [CARRY_KIND.CAGE]: 'carry-cage',
  [CARRY_KIND.BOX]: 'carry-box',
  [CARRY_KIND.BASKET]: 'carry-basket',
};

function drawLeash(g, w, h) {
  g.lineStyle(3, 0x8a5a34, 1);
  g.beginPath();
  g.moveTo(w * 0.2, h * 0.08);
  g.lineTo(w * 0.5, h * 0.55);
  g.lineTo(w * 0.78, h * 0.12);
  g.strokePath();
  g.fillStyle(0xdd5555, 1).fillRoundedRect(w * 0.34, h * 0.5, w * 0.32, h * 0.4, 4);
  g.fillStyle(0xc94747, 1).fillCircle(w * 0.5, h * 0.5, 2.5);
}

function drawCage(g, w, h) {
  g.fillStyle(0x5b5b63, 1).fillRoundedRect(w * 0.28, h * 0.02, w * 0.44, h * 0.14, 3);
  g.fillStyle(0xcfcfd6, 1).fillRoundedRect(w * 0.08, h * 0.16, w * 0.84, h * 0.78, 4);
  g.fillStyle(0x8a8a94, 1);
  for (let x = w * 0.16; x < w * 0.86; x += w * 0.12) g.fillRect(x, h * 0.2, 2, h * 0.7);
  g.fillStyle(0xa9a9b2, 1).fillRect(w * 0.08, h * 0.5, w * 0.84, 2);
}

function drawBox(g, w, h) {
  g.fillStyle(0xc79a63, 1).fillRoundedRect(w * 0.06, h * 0.24, w * 0.88, h * 0.72, 3);
  g.fillStyle(0xb98950, 1).fillRect(w * 0.06, h * 0.24, w * 0.88, h * 0.14);
  g.lineStyle(2, 0x8a6a3e, 1).strokeRect(w * 0.06, h * 0.24, w * 0.88, h * 0.72);
  g.fillStyle(0x8a6a3e, 1).fillRect(w * 0.46, h * 0.24, w * 0.08, h * 0.72);
}

function drawBasket(g, w, h) {
  g.fillStyle(0xd9a566, 1).fillEllipse(w / 2, h * 0.62, w * 0.86, h * 0.58);
  g.fillStyle(0xc0894c, 1);
  for (let y = h * 0.42; y < h * 0.86; y += h * 0.13) g.fillRect(w * 0.1, y, w * 0.8, 2);
  g.lineStyle(2, 0x8a6a3e, 1).strokeEllipse(w / 2, h * 0.36, w * 0.5, h * 0.18);
}

export function buildCarryTextures(scene) {
  gen(scene, CARRY_KEY[CARRY_KIND.LEASH], 34, 30, (g) => drawLeash(g, 34, 30));
  gen(scene, CARRY_KEY[CARRY_KIND.CAGE], 32, 30, (g) => drawCage(g, 32, 30));
  gen(scene, CARRY_KEY[CARRY_KIND.BOX], 30, 26, (g) => drawBox(g, 30, 26));
  gen(scene, CARRY_KEY[CARRY_KIND.BASKET], 30, 22, (g) => drawBasket(g, 30, 22));
}
