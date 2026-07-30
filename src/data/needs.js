// Per-stay "needs" — simple boolean flags that build up over real time while
// an animal is settled in its section (DESIGN.md's feeding/potty chores).
// Deliberately tiny: everyone gets `food` and `water` (except turtles, whose
// water is a section-level tank resource — see below); dogs additionally get
// `bathroom` (DESIGN.md's "Cupcake needs to go to the bathroom!" bottom-left
// call-out). Never punishing — timers are long and a need just sits there
// patiently (showing a small indicator) until it's resolved.
//
// This is the shape issue #11's night wake-up reasons (bathroom/cold/bad
// dream/having babies) should extend: add a new `needs.<key>`/`timers.<key>`
// pair and reuse tickNeeds()/clearNeed() rather than inventing new plumbing.
// (Turtles' tank water level is deliberately NOT modeled here — it's a
// section-level resource, not a per-animal need; see KennelScene's
// turtleTankNeedsWater.)
const FOOD_INTERVAL = () => 20_000 + Math.random() * 20_000;      // 20-40s
const WATER_INTERVAL = () => 20_000 + Math.random() * 20_000;     // 20-40s, same kid-gentle pacing as food
const BATHROOM_INTERVAL = () => 35_000 + Math.random() * 30_000;  // dogs only, 35-65s

export function createNeeds(speciesKey) {
  const needs = { food: false };
  const timers = { food: FOOD_INTERVAL() };
  if (speciesKey !== 'turtle') {
    needs.water = false;
    timers.water = WATER_INTERVAL();
  }
  if (speciesKey === 'dog') {
    needs.bathroom = false;
    timers.bathroom = BATHROOM_INTERVAL();
  }
  return { needs, timers };
}

// Owner note 2026-07-29: "you should be able to fill food bowls
// asynchronously from the pets eating the food" — filling a bowl (player
// action, any time) and eating from it (automatic, whenever she's hungry AND
// it's stocked) are two decoupled events. `stay.bowl` tracks whether each
// bowl is currently stocked; `true` means full, `false` means empty and
// needs refilling. Same species exclusion as `needs.water` above — turtles
// have no bowl at all (fed via lettuce dropped in the tank instead).
export function createBowlState() {
  return { food: false, water: false };
}

// Advances a settled stay's need timers by deltaMs. Returns the need keys
// that just flipped true this call (e.g. ['food']) so the caller (KennelScene)
// can show an indicator / fire a notification once, not every frame.
export function tickNeeds(stay, deltaMs) {
  const flipped = [];
  for (const key of Object.keys(stay.timers)) {
    if (stay.needs[key]) continue; // already waiting on the player, don't re-fire
    stay.timers[key] -= deltaMs;
    if (stay.timers[key] <= 0) {
      stay.needs[key] = true;
      flipped.push(key);
    }
  }
  return flipped;
}

// Clears a need (fed / taken outside) and restarts its timer for next time.
export function clearNeed(stay, key) {
  if (!(key in stay.needs)) return;
  stay.needs[key] = false;
  stay.timers[key] = key === 'bathroom' ? BATHROOM_INTERVAL() : key === 'water' ? WATER_INTERVAL() : FOOD_INTERVAL();
}
