// Pregnancy/egg birth-timer helpers — pure logic, no Phaser. A stay's primary
// animal (data/animal.js) can be `isPregnant` or a turtle mom `hasEggs`; this
// module is the one place that decides WHEN her babies/hatchlings arrive at
// the kennel, so issue #11's night rule ("an animal sitting alone at night is
// the secret sign she's going to have babies") can reuse the exact same
// `isExpecting()` check/flag instead of re-deriving it from isPregnant/hasEggs.
//
// Kept deliberately simple per DESIGN.md: no incubation-realism, just a timer
// set once at arrival and ticked while the stay is settled in its section
// (same pattern as data/needs.js's tickNeeds) — a few in-game hours, so it's a
// rare-ish but reachable event within a normal play session, never instant.
import { MS_PER_GAME_HOUR } from './clock.js';

const BIRTH_HOURS_MIN = 3;
const BIRTH_HOURS_MAX = 8;

export function birthDelay() {
  return (BIRTH_HOURS_MIN + Math.random() * (BIRTH_HOURS_MAX - BIRTH_HOURS_MIN)) * MS_PER_GAME_HOUR;
}

// True if this stay's primary animal is "expecting" — pregnant, or a turtle
// mom currently sitting on eggs — i.e. a birth/hatch event is still pending.
export function isExpecting(stay) {
  return stay.animal.isPregnant || stay.animal.hasEggs;
}

// Attaches a birth timer to a freshly-created stay if its primary is
// expecting. Call once, right after roster.js builds the stay object.
export function attachBirthTimer(stay) {
  if (isExpecting(stay)) stay.birthTimer = birthDelay();
}

// Advances a settled stay's birth timer by deltaMs; returns true the moment
// it fires (caller is responsible for clearing/handling the birth — this
// module doesn't know about animals or rendering).
export function tickBirth(stay, deltaMs) {
  if (stay.birthTimer == null) return false;
  stay.birthTimer -= deltaMs;
  return stay.birthTimer <= 0;
}
