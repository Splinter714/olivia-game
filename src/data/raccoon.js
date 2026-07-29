// Pure data/logic for the house kitchen's baking + raccoon surprise (issue
// #13) — no Phaser here, same split as the rest of src/data/. KennelScene
// reads these for the treat labels/notification text and the "how often" /
// "was she seen" random rolls; all the actual art/animation lives in
// src/art/raccoon.js and src/scenes/KennelScene.js.

// "Not very often" per DESIGN.md — cookies/cakes/cupcakes players bake as
// they please, but the raccoon only rolls a chance to strike on this slow
// cadence, and even then only if a tray is actually sitting out.
export const RACCOON_CHECK_INTERVAL = () => 70_000 + Math.random() * 60_000;

// Sometimes (not every time) the player actually sees her scampering away
// with a crumb trail — the rest of the time the tray's just quietly gone.
export const SCAMPER_VISIBLE_CHANCE = 0.55;

// "Cookies, cakes, cupcakes" (DESIGN.md) — a batch of whichever gets baked;
// the label is what's dropped straight into the "You baked ___!" notification.
export const TREATS = [
  { id: 'cookies', label: 'a batch of cookies' },
  { id: 'cake', label: 'a cake' },
  { id: 'cupcakes', label: 'a batch of cupcakes' },
];

export function randomTreat() {
  return TREATS[Math.floor(Math.random() * TREATS.length)];
}
