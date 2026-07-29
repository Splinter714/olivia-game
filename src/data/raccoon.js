// Pure data/logic for the house kitchen's baking + raccoon surprise (issue
// #13) — no Phaser here, same split as the rest of src/data/. KennelScene
// reads these for the treat labels/notification text and the "how often"
// random roll and scamper timings; all the actual art/animation lives in
// src/art/raccoon.js and src/scenes/KennelScene.js.

// "Not very often" per DESIGN.md — cookies/cakes/cupcakes players bake as
// they please, but the raccoon only rolls a chance to strike on this slow
// cadence, and even then only if a tray is actually sitting out.
export const RACCOON_CHECK_INTERVAL = () => 70_000 + Math.random() * 60_000;

// Owner feedback (2026-07-29): the old "sometimes visible" 55% roll meant
// most players never actually saw the theft happen. She's now ALWAYS visible
// — sneaking in, grabbing the tray, and scampering off with it — so there's
// no more "was she seen" chance to roll.

// Timings for the always-visible steal sequence: a short sneak-in the player
// can catch her during (interacting scares her off before she's grabbed
// anything), then a getaway scamper back out — deliberately slower than the
// getaway once startled (RACCOON_SCARE_DASH_MS), so a successful scare-off
// reads as her panicking and bolting rather than just leaving normally.
export const RACCOON_APPROACH_MS = 900;
export const RACCOON_SCAMPER_MS = 1400;
export const RACCOON_SCARE_DASH_MS = 700;

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
