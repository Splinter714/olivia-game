// Kennel guest roster + arrival scheduling — pure logic, no Phaser. A "stay" wraps
// a data/animal.js animal instance with kennel-specific state: where it currently
// is, when it arrived, and when it's due to check out (DESIGN.md "sleeps over at
// least 2 nights"). KennelScene is the only Phaser-facing consumer — it renders
// whatever `roster.stays` currently holds and calls spawnArrival()/checkoutDue()
// off the game clock's HOUR_CHANGE event.
import { createAnimal } from './animal.js';
import { SPECIES_KEYS } from './species.js';

// Where a stay currently is. Any SECTIONS[].key (data/sections.js) is also a
// valid `location` once an animal has been carried to its section.
export const LOCATION = {
  RECEPTION: 'reception', // waiting at the front desk, not yet picked up
  CARRYING: 'carrying',   // in the player's hands, following them
};

// What the player carries an arrival in/as (DESIGN.md "Pets Checking In").
// Simplification: a turtle mom WITH eggs is modeled as arriving in the basket
// (the eggs are the notable cargo); a turtle mom with no eggs/live babies gets
// the box. Modeling mom-and-eggs as two separate carries wasn't worth the extra
// state for this pass.
export const CARRY_KIND = {
  LEASH: 'leash',
  CAGE: 'cage',
  BOX: 'box',
  BASKET: 'basket',
  NONE: 'none', // guinea pig / hamster / bunny — just gently picked up
};

const MIN_NIGHTS = 2; // DESIGN.md: "every pet sleeps over at least 2 nights"

// How many named individuals live in the "returning guest" pool per species —
// small on purpose so the same names come back around within a single session
// ("every animal always comes back again someday").
const RETURNING_POOL_SIZE = { turtle: 3, guineaPig: 2, hamster: 2, bunny: 2, cat: 3, dog: 3 };

function carryKindForSpecies(speciesKey) {
  if (speciesKey === 'dog') return CARRY_KIND.LEASH;
  if (speciesKey === 'cat') return CARRY_KIND.CAGE;
  if (speciesKey === 'turtle') return CARRY_KIND.BOX;
  return CARRY_KIND.NONE;
}

// Creates a fresh roster: an empty in-memory stay list plus a returning-guest
// pool of named animals generated once at game start (DESIGN.md's "old friends").
// Not persisted across page loads yet — see the report/follow-up note on
// localStorage persistence, which is out of scope for this pass.
export function createRoster() {
  const stays = [];
  const pool = [];
  for (const key of SPECIES_KEYS) {
    const n = RETURNING_POOL_SIZE[key] ?? 2;
    for (let i = 0; i < n; i++) pool.push({ animal: createAnimal(key), available: true });
  }

  function pickSpecies(rng) {
    return SPECIES_KEYS[Math.floor(rng() * SPECIES_KEYS.length)];
  }

  // Builds the group of animal instances that arrive together for `speciesKey`,
  // per DESIGN.md's "Moms and Babies": usually just a single adult, sometimes a
  // family. Returns [primary, ...companions] — companions are babies that travel
  // with the primary (mom); turtle eggs are tracked on the primary via
  // hasEggs/eggCount instead of as separate instances.
  function familyFor(speciesKey, rng) {
    if (speciesKey === 'turtle' && rng() < 0.35) {
      if (rng() < 0.5) {
        const mom = createAnimal('turtle', { hasEggs: true, eggCount: 1 + Math.floor(rng() * 3) });
        return [mom];
      }
      const mom = createAnimal('turtle');
      mom.babies = Array.from({ length: 1 + Math.floor(rng() * 2) }, () => createAnimal('turtle', { stage: 'baby' }));
      return [mom, ...mom.babies];
    }
    if ((speciesKey === 'cat' || speciesKey === 'dog') && rng() < 0.3) {
      if (rng() < 0.4) return [createAnimal(speciesKey, { isPregnant: true })]; // pregnant, no babies yet
      const mom = createAnimal(speciesKey);
      mom.babies = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => createAnimal(speciesKey, { stage: 'baby' }));
      return [mom, ...mom.babies];
    }
    return [createAnimal(speciesKey)];
  }

  // Spawns one new arrival (an owner dropping off a pet). ~40% of the time it's
  // a returning-pool animal (if one of that species is currently available),
  // otherwise a fresh family/individual. Adds a new stay to `stays` and returns it.
  function spawnArrival({ day, hour, rng = Math.random } = {}) {
    const speciesKey = pickSpecies(rng);
    let group = null;

    if (rng() < 0.4) {
      const candidates = pool.filter((p) => p.animal.species === speciesKey && p.available);
      if (candidates.length) {
        const entry = candidates[Math.floor(rng() * candidates.length)];
        entry.available = false;
        group = [entry.animal];
      }
    }
    if (!group) group = familyFor(speciesKey, rng);

    const primary = group[0];
    const stay = {
      animal: primary,
      companions: group.slice(1),
      arrivedHour: hour,
      arrivedDay: day,
      checkoutDay: day + MIN_NIGHTS + Math.floor(rng() * 2), // 2-3 nights
      location: LOCATION.RECEPTION,
      carryKind: primary.hasEggs ? CARRY_KIND.BASKET : carryKindForSpecies(speciesKey),
    };
    stays.push(stay);
    return stay;
  }

  // Removes and returns every stay whose checkout day has arrived. Skips stays
  // still at reception or mid-carry (they haven't settled into a section yet —
  // nothing to quietly send home). Recycles the departing animal back into the
  // returning-guest pool (or adds it fresh) so it's eligible to arrive again
  // later this session, matching DESIGN.md's "always comes back" without needing
  // cross-session persistence yet.
  function checkoutDue(day) {
    const due = [];
    for (let i = stays.length - 1; i >= 0; i--) {
      const stay = stays[i];
      if (stay.location === LOCATION.RECEPTION || stay.location === LOCATION.CARRYING) continue;
      if (day < stay.checkoutDay) continue;
      stays.splice(i, 1);
      due.push(stay);
      const existing = pool.find((p) => p.animal.id === stay.animal.id);
      if (existing) existing.available = true;
      else pool.push({ animal: stay.animal, available: true });
    }
    return due;
  }

  return { stays, pool, spawnArrival, checkoutDue };
}
