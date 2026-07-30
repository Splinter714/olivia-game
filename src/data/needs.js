// Per-stay "needs" — simple boolean flags that build up over real time while
// an animal is settled in its cage (DESIGN.md's feeding/potty chores).
// Deliberately tiny: everyone gets `food` and `water` (issue #32: turtles used
// to have a section-level shared-tank water resource instead of their own
// `water` need — that's gone now, turtles get the exact same per-cage bowl
// as everyone else); dogs additionally get `bathroom` (DESIGN.md's "Cupcake
// needs to go to the bathroom!" bottom-left call-out). Never punishing —
// timers are long and a need just sits there patiently (showing a small
// indicator) until it's resolved.
//
// This is the shape issue #11's night wake-up reasons (bathroom/cold/bad
// dream/having babies) should extend: add a new `needs.<key>`/`timers.<key>`
// pair and reuse tickNeeds()/clearNeed() rather than inventing new plumbing.
//
// Owner note 2026-07-29 (issue #30): "food and water bowls should only need
// filled maybe at MOST 3x per day" — food and water flip due TOGETHER, at
// three fixed times of the game-day (real feeding times), rather than each
// on its own random real-time countdown. `timers.nextFeedAt` is an absolute
// game hour (day*24 + hourFloat), compared against the clock every tick.
const FEED_HOURS = [7, 12, 17]; // owner-confirmed: 7am, 12pm, 5pm
const BATHROOM_INTERVAL = () => 35_000 + Math.random() * 30_000;  // dogs only, 35-65s

const absHour = (day, hour) => day * 24 + hour;

// Smallest absolute game hour, strictly after `afterAbs`, that lands on one
// of FEED_HOURS.
function nextFeedAbsHour(afterAbs) {
  const day = Math.floor(afterAbs / 24);
  const hourOfDay = afterAbs - day * 24;
  const next = FEED_HOURS.find((h) => h > hourOfDay);
  return next != null ? day * 24 + next : (day + 1) * 24 + FEED_HOURS[0];
}

export function createNeeds(speciesKey, day = 0, hour = 0) {
  const needs = { food: false, water: false };
  const timers = { nextFeedAt: nextFeedAbsHour(absHour(day, hour)) };
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
// needs refilling. Every settled stay has one now, including turtles (issue
// #32 — the old shared-tank/lettuce mechanic is gone).
export function createBowlState() {
  return { food: false, water: false };
}

// Advances a settled stay's need timers. `absHourNow` is the current
// absolute game hour (day*24 + hourFloat) — food/water are schedule-based,
// not real-time countdowns, so they need clock time, not deltaMs. Returns
// the need keys that just flipped true this call (e.g. ['food', 'water'])
// so the caller (KennelScene) can show an indicator / fire a notification
// once, not every frame.
export function tickNeeds(stay, deltaMs, absHourNow) {
  const flipped = [];
  if (absHourNow >= stay.timers.nextFeedAt) {
    if (!stay.needs.food) { stay.needs.food = true; flipped.push('food'); }
    if ('water' in stay.needs && !stay.needs.water) { stay.needs.water = true; flipped.push('water'); }
    stay.timers.nextFeedAt = nextFeedAbsHour(absHourNow);
  }
  if ('bathroom' in stay.timers && !stay.needs.bathroom) {
    stay.timers.bathroom -= deltaMs;
    if (stay.timers.bathroom <= 0) {
      stay.needs.bathroom = true;
      flipped.push('bathroom');
    }
  }
  return flipped;
}

// Clears a need (fed / taken outside). Food/water share one schedule (see
// tickNeeds) so there's no per-key timer to restart for them — only
// bathroom restarts its own countdown here.
export function clearNeed(stay, key) {
  if (!(key in stay.needs)) return;
  stay.needs[key] = false;
  if (key === 'bathroom') stay.timers.bathroom = BATHROOM_INTERVAL();
}
