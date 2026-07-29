// Procedural textures for kennel furniture added by issues #6/#7/#8: the
// turtle tank + sand island, cat/dog playpen fences, litter box, scooper,
// food/water bowls, potty messes, and the small "needs attention" bubbles.
// Same gen()-into-a-texture pattern as art/kennel.js / art/animals.js.
import { gen } from './_gen.js';
import { TURTLE, CAT_PLAYPEN, LITTER_BOX } from '../data/props.js';

export const TANK_KEY = 'prop-tank';
export const ISLAND_KEY = 'prop-island';
export const PLAYPEN_FENCE_KEY = 'prop-playpen-fence';
export const LITTER_BOX_KEY = 'prop-litter-box';
export const SCOOPER_KEY = 'prop-scooper';
export const BOWL_KEY = 'prop-bowl';
export const MESS_KEY = 'prop-mess';
export const NEED_KEY = { food: 'need-food', bathroom: 'need-bathroom', water: 'need-water' };

// Water tank with a glass-cover highlight along the top rim.
function drawTank(g, w, h) {
  g.fillStyle(0x2d6f8e, 1).fillRoundedRect(0, 0, w, h, 10);
  g.fillStyle(0x4b9fc4, 0.85).fillRoundedRect(3, 3, w - 6, h - 6, 8);
  // Glass-cover highlight: a lighter streak across the top.
  g.fillStyle(0xdff3fb, 0.55).fillRoundedRect(6, 4, w - 12, h * 0.14, 6);
  g.lineStyle(3, 0xcfe9f2, 0.8).strokeRoundedRect(1.5, 1.5, w - 3, h - 3, 9);
}

// Sand island, sitting inside the tank — a soft tan ellipse with a darker
// outline and a couple of pebble specks.
function drawIsland(g, w, h) {
  g.fillStyle(0xcfa15e, 1).fillEllipse(w / 2, h / 2, w, h);
  g.fillStyle(0xe0bd85, 1).fillEllipse(w / 2, h * 0.44, w * 0.86, h * 0.8);
  g.fillStyle(0xb9884b, 1);
  g.fillCircle(w * 0.3, h * 0.4, 2);
  g.fillCircle(w * 0.68, h * 0.6, 1.6);
  g.fillCircle(w * 0.5, h * 0.7, 1.4);
}

// Low playpen corral — a friendlier, rounder fence than the section's own
// square pen walls, so it visually reads as "a play area" not "a room wall".
function drawPlaypenFence(g, w, h) {
  g.lineStyle(5, 0xe0a95e, 1).strokeRoundedRect(2.5, 2.5, w - 5, h - 5, 18);
  g.lineStyle(2, 0xf6cf9a, 0.9).strokeRoundedRect(2.5, 2.5, w - 5, h - 5, 18);
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

// Small brown "mess" blob — used for both dog-playpen messes and litter-box
// messes (the litter box's sandy background already tells them apart).
function drawMess(g, w, h) {
  g.fillStyle(0x6b4a2c, 1);
  g.fillEllipse(w * 0.5, h * 0.6, w * 0.7, h * 0.5);
  g.fillEllipse(w * 0.32, h * 0.42, w * 0.4, h * 0.32);
  g.fillEllipse(w * 0.65, h * 0.38, w * 0.36, h * 0.3);
}

// A tiny floating "needs attention" bubble — a bowl icon, a paw print, or a
// water droplet, each on a soft white speech-bubble backing so it's readable
// against any section floor color.
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
  } else { // water
    g.fillStyle(0x4b9fc4, 1);
    g.fillTriangle(w * 0.5, h * 0.24, w * 0.32, h * 0.62, w * 0.68, h * 0.62);
    g.fillCircle(w * 0.5, h * 0.62, w * 0.18);
  }
}

export function buildPropTextures(scene) {
  gen(scene, TANK_KEY, TURTLE.tank.w, TURTLE.tank.h, (g) => drawTank(g, TURTLE.tank.w, TURTLE.tank.h));
  gen(scene, ISLAND_KEY, TURTLE.island.w, TURTLE.island.h, (g) => drawIsland(g, TURTLE.island.w, TURTLE.island.h));
  gen(scene, PLAYPEN_FENCE_KEY, CAT_PLAYPEN.w, CAT_PLAYPEN.h, (g) => drawPlaypenFence(g, CAT_PLAYPEN.w, CAT_PLAYPEN.h));
  gen(scene, LITTER_BOX_KEY, LITTER_BOX.w, LITTER_BOX.h, (g) => drawLitterBox(g, LITTER_BOX.w, LITTER_BOX.h));
  gen(scene, SCOOPER_KEY, 26, 32, (g) => drawScooper(g, 26, 32));
  gen(scene, BOWL_KEY, 24, 18, (g) => drawBowl(g, 24, 18));
  gen(scene, MESS_KEY, 16, 12, (g) => drawMess(g, 16, 12));
  gen(scene, NEED_KEY.food, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'food'));
  gen(scene, NEED_KEY.bathroom, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'bathroom'));
  gen(scene, NEED_KEY.water, 18, 18, (g) => drawNeedBubble(g, 18, 18, 'water'));
}
