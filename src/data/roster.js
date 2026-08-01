// Kennel guest roster + arrival scheduling — pure logic, no Phaser. A "stay" wraps
// a data/animal.js animal instance with kennel-specific state: where it currently
// is, when it arrived, and when it's due to check out (DESIGN.md "sleeps over at
// least 2 nights"). KennelScene is the only Phaser-facing consumer — it renders
// whatever `roster.stays` currently holds and calls spawnArrival()/flagCheckoutReady()/finalizeCheckout()
// off the game clock's HOUR_CHANGE event.
import { createAnimal } from './animal.js';
import { SPECIES, SPECIES_KEYS, FAMILY } from './species.js';
import { createNeeds, createBowlState } from './needs.js';
import { attachBirthTimer } from './births.js';
import { pickUpgradeKind } from './economy.js';
import { CAGE_ASSIGN_ORDER, CAGE_COUNT } from './props.js';

// Where a stay currently is.
//
// Issue #71: 'cage' used to be spelled as whichever SECTIONS[].key her cage
// nominally belonged to, back when cages were reserved six-per-species. Every
// cage is open to every species (issue #32) and the per-species reservation is
// gone, so which cage she's in is `stay.cageIndex` — a plain index into
// data/props.js's CAGES — and `location` only has to say WHICH KIND of place
// she's in.
export const LOCATION = {
  RECEPTION: 'reception', // waiting at the front desk, not yet picked up
  CARRYING: 'carrying',   // in the player's hands, following them
  YARD: 'yard',           // out playing in the outside yard (issue #20)
  CAGE: 'cage',           // settled in her own cage (issue #71)
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
  // Issue #77: fish — not just an arrival container, this is the ONLY way a
  // fish ever moves anywhere (no self-walk at all — see KennelScene's
  // travel-tank plumbing). A persistent per-fish prop, unlike every other
  // CARRY_KIND here which is a one-time reception hand-off container.
  TANK: 'tank',
};

const MIN_NIGHTS = 2; // DESIGN.md: "every pet sleeps over at least 2 nights"

// Is this exact cage free among `stays`?
//
// Issue #71 collapsed a small family of near-identical helpers into this one.
// There used to be `belongsToSection` (does this stay's cage live in section
// X?), `isCageSlotOpen` (is slot N of section X free?) and `assignCageSlot`
// (first free slot within section X) — three functions all working around the
// fact that a cage's bookkeeping identity, `(cageSection, slot)`, said nothing
// about which cage it actually was. With a flat pool the question is just
// "does anyone hold this index?".
//
// A stay counts as holding her cage wherever she physically is — out playing
// in the yard, mid-walk, or in the player's hands. That's deliberate and
// long-standing (issue #20): she kept the cage when she went out and she's
// coming back to it, so treating a yard trip as freeing it would let a new
// arrival take her cage and leave her with nowhere to sleep.
//
// `except` is the stay currently being placed, ignored when judging occupancy
// (issue #54): she holds a cage from check-in onward, so without this her OWN
// cage would read as taken — by her — and the player couldn't carry her back
// into it.
export function isCageOpen(stays, cageIndex, except = null) {
  return !stays.some((s) => s !== except && s.cageIndex === cageIndex);
}

// Issue #54 (owner: "when pets check in, they should get an assigned cage
// right away, and assignment order should be bottom row first, left to
// right"): the next cage to hand out, as a CAGES index, or null if every cage
// in the kennel is taken. CAGE_ASSIGN_ORDER is that physical order.
export function findOpenCage(stays, except = null) {
  for (const idx of CAGE_ASSIGN_ORDER) {
    if (isCageOpen(stays, idx, except)) return idx;
  }
  return null;
}

// True if ANY cage anywhere is currently open — the arrival gate. Since issue
// #32 there's no per-species territory, so a species keeps arriving as long as
// some cage is free. Also used by the secret bonus dragon trigger
// (KennelScene._triggerSecretDragon) to bail out gracefully when the kennel is
// genuinely full.
//
// Bug fix (owner note 2026-07-29: "if all cages are assigned, don't send any
// more customers") — the total-count check catches a stay who somehow holds no
// cage at all (a save written before check-in assignment, mid-restore), while
// findOpenCage catches the real grid. Requiring BOTH means an arrival can never
// be waved through into a kennel with no cage left to give it.
//
// Issue #71: capacity is simply how many cages exist now (CAGE_COUNT, 48),
// rather than SECTIONS.length * CAGES_PER_SECTION — an arithmetic identity
// that only held while cages were reserved per species.
export function anyOpenCageAnywhere(stays) {
  return stays.length < CAGE_COUNT && findOpenCage(stays) !== null;
}

// How many named individuals live in the "returning guest" pool per species —
// small on purpose so the same names come back around within a single session
// ("every animal always comes back again someday").
const RETURNING_POOL_SIZE = { turtle: 3, guineaPig: 2, hamster: 2, bunny: 2, cat: 3, dog: 3, snake: 2, bird: 2, lizard: 2, fish: 2 };

function carryKindForSpecies(speciesKey) {
  if (speciesKey === 'dog') return CARRY_KIND.LEASH;
  if (speciesKey === 'cat') return CARRY_KIND.CAGE;
  if (speciesKey === 'turtle') return CARRY_KIND.BOX;
  // Issue #77: always her travel tank, never the generic eggs-basket — see
  // the hasEggs override in spawnArrival below.
  if (speciesKey === 'fish') return CARRY_KIND.TANK;
  return CARRY_KIND.NONE;
}

// ── Family state (issue #9: "every animal should be pregnant or come with
// eggs or babies or pregnant... usually, not guaranteed") ───────────────────
//
// FAMILY_CHANCE is the odds ANY arrival (fresh or returning) lands in some
// family state at all, applied uniformly across every species: turtle/snake
// choose between eggs, live babies, or pregnant; every other species (cat/
// dog/guineaPig/hamster/bunny) chooses between pregnant or live babies. The
// remaining ~15% arrive as a plain solo adult — "usually, not guaranteed".
const FAMILY_CHANCE = 0.85;
// A returning pool member who was already expecting last visit is weighted
// hard toward resolving that into "arrives with the babies/hatchlings this
// time" rather than being re-rolled like a stranger — DESIGN.md's "when they
// go home they'll come back with babies in the future".
const RETURNING_RESOLVES_CHANCE = 0.85;

const FAMILY_STATE = { EGGS: 'eggs', PREGNANT: 'pregnant', BABIES: 'babies', SOLO: 'solo' };

function rollFamilyState(speciesKey, rng) {
  if (rng() >= FAMILY_CHANCE) return FAMILY_STATE.SOLO;
  // Which species can arrive with EGGS as well as live babies. This used to be
  // a hardcoded turtle/snake/bird list that had to be remembered every time a
  // new egg-laying species landed (issue #24's birds, then issue #28's
  // lizards); species.js's `family` field already says exactly this, so read
  // it from there instead and the list can't drift again.
  const eggSpecies = SPECIES[speciesKey]?.family === FAMILY.EGGS_OR_BABIES;
  const roll = rng();
  if (eggSpecies) {
    if (roll < 0.34) return FAMILY_STATE.EGGS;
    if (roll < 0.67) return FAMILY_STATE.BABIES;
    return FAMILY_STATE.PREGNANT;
  }
  return roll < 0.5 ? FAMILY_STATE.PREGNANT : FAMILY_STATE.BABIES;
}

// Cat/dog litters can run a bit bigger than everyone else's, matching the
// counts this file already used before issue #9's probability bump.
function babyCountFor(speciesKey, rng) {
  const maxExtra = (speciesKey === 'cat' || speciesKey === 'dog') ? 3 : 2;
  return 1 + Math.floor(rng() * maxExtra);
}

// Creates a roster: an in-memory stay list plus a returning-guest pool of
// named animals (DESIGN.md's "old friends"). With no `saved` argument, starts
// fresh — an empty stay list and a freshly-generated pool, exactly like
// before. Issue #34 (localStorage persistence): pass `{ stays, pool }` (the
// plain-data arrays data/persistence.js parsed back out of a save) to resume
// with those exact stays/pool instead — every closure below (spawnArrival,
// flagCheckoutReady, finalizeCheckout, spawnDragon) reads/mutates whichever `stays`/`pool` arrays it
// closed over, so handing it the restored arrays is enough to make the whole
// roster behave as if it had been running the whole time.
export function createRoster(saved = null) {
  const stays = saved?.stays ?? [];
  const pool = saved?.pool ?? [];
  if (!saved) {
    for (const key of SPECIES_KEYS) {
      const n = RETURNING_POOL_SIZE[key] ?? 2;
      for (let i = 0; i < n; i++) pool.push({ animal: createAnimal(key), available: true, visits: 0 });
    }
  } else {
    // In a live (never-reloaded) session, a checked-in returning guest's
    // `stay.animal` and her pool entry's `.animal` are the exact SAME object
    // (spawnArrival above reuses `entry.animal` directly as the mom) — so any
    // mutation (e.g. finalizeCheckout awarding a new upgrade) lands on both at
    // once. A plain JSON save/load necessarily produces two separate-but-
    // equal copies instead; re-link them here so that invariant holds again
    // once restored, same as if the session had never reloaded.
    for (const stay of stays) {
      const entry = pool.find((p) => p.animal.id === stay.animal.id);
      if (entry) entry.animal = stay.animal;
    }
  }

  // Owner note 2026-07-31: "Every new guest should be weighted random with
  // weighting based on current guests of that type to try to even it out
  // while keeping randomization." Plain uniform picking let the kennel drift
  // lopsided (e.g. six dogs and zero lizards) purely by chance. Inverse-count
  // weighting biases toward whichever species currently has the fewest guests
  // — a species with 0 stays is `SPECIES_KEYS.length` times likelier than one
  // already at 5+ — while every species keeps SOME chance regardless of how
  // crowded it already is, so it still reads as random, not a strict
  // round-robin.
  function pickSpecies(rng) {
    const weights = SPECIES_KEYS.map((key) => {
      const count = stays.filter((s) => s.animal.species === key).length;
      return 1 / (count + 1);
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = rng() * total;
    for (let i = 0; i < SPECIES_KEYS.length; i++) {
      r -= weights[i];
      if (r <= 0) return SPECIES_KEYS[i];
    }
    return SPECIES_KEYS[SPECIES_KEYS.length - 1]; // floating-point rounding fallback
  }

  // Builds the group of animal instances that arrive together for `speciesKey`,
  // per DESIGN.md's "Moms and Babies": usually a family (pregnant / eggs /
  // babies — see rollFamilyState), sometimes a plain solo adult. Returns
  // [primary, ...companions] — companions are babies that travel with the
  // primary (mom); turtle/snake eggs are tracked on the primary via
  // hasEggs/eggCount instead of as separate instances.
  //
  // `mom` lets a returning pool member (spawnArrival below) reuse her own
  // animal instance instead of getting a freshly created one, so she keeps
  // her name/look/upgrades across the roll.
  function familyFor(speciesKey, rng, mom = null) {
    const state = rollFamilyState(speciesKey, rng);
    const primary = mom ?? createAnimal(speciesKey);
    if (state === FAMILY_STATE.EGGS) {
      primary.hasEggs = true;
      primary.eggCount = 1 + Math.floor(rng() * 3);
      return [primary];
    }
    if (state === FAMILY_STATE.PREGNANT) {
      primary.isPregnant = true;
      return [primary];
    }
    if (state === FAMILY_STATE.BABIES) {
      primary.babies = Array.from({ length: babyCountFor(speciesKey, rng) }, () => createAnimal(speciesKey, { stage: 'baby' }));
      return [primary, ...primary.babies];
    }
    return [primary]; // solo
  }

  // Spawns one new arrival (an owner dropping off a pet). ~40% of the time it's
  // a returning-pool animal (if one of that species is currently available),
  // otherwise a fresh family/individual. Adds a new stay to `stays` and returns
  // it — or returns null if the whole kennel is full right now (issue #18,
  // generalized by issue #32: since any pet can go in any open cage, there's
  // no more per-species territory — a species keeps arriving as long as ANY
  // cage anywhere is open, not just one nominally "hers"); the caller
  // (KennelScene) just skips that particular roll, quietly.
  function spawnArrival({ day, hour, rng = Math.random } = {}) {
    const speciesKey = pickSpecies(rng);
    // Issue #54: reserve her actual cage right here, at check-in — this
    // doubles as the "is the kennel full?" gate it replaces (a null means
    // there is genuinely no cage left, so the arrival is refused cleanly
    // exactly as before, rather than being admitted with a null slot or
    // handed a slot someone else already holds).
    const cage = findOpenCage(stays);
    if (cage == null || stays.length >= CAGE_COUNT) return null;
    let group = null;

    if (rng() < 0.4) {
      const candidates = pool.filter((p) => p.animal.species === speciesKey && p.available);
      if (candidates.length) {
        const entry = candidates[Math.floor(rng() * candidates.length)];
        entry.available = false;
        const mom = entry.animal;
        const wasExpecting = mom.isPregnant || mom.hasEggs;
        if (wasExpecting && rng() < RETURNING_RESOLVES_CHANCE) {
          // She was already expecting when she last left — resolve that into
          // babies/hatchlings now rather than simulating the wait, per
          // DESIGN.md's "when they go home they'll come back with babies".
          mom.isPregnant = false;
          mom.hasEggs = false;
          mom.eggCount = 0;
          mom.babies = Array.from({ length: babyCountFor(speciesKey, rng) }, () => createAnimal(speciesKey, { stage: 'baby' }));
          group = [mom, ...mom.babies];
        } else {
          if (wasExpecting) { mom.isPregnant = false; mom.hasEggs = false; mom.eggCount = 0; }
          group = familyFor(speciesKey, rng, mom);
        }
      }
    }
    if (!group) group = familyFor(speciesKey, rng);

    const primary = group[0];
    const { needs, timers } = createNeeds(speciesKey, day, hour);
    const stay = {
      animal: primary,
      companions: group.slice(1),
      arrivedHour: hour,
      arrivedDay: day,
      checkoutDay: day + MIN_NIGHTS + Math.floor(rng() * 2), // 2-3 nights
      location: LOCATION.RECEPTION,
      // Issue #54: hers from check-in onward, wherever she physically is —
      // her nameplate and bowls show at this cage immediately, and she has a
      // home to walk back to at nightfall (KennelScene._startWalkHome)
      // without the player ever having to place her. Carrying her into a
      // (different) cage later just overwrites these two fields, same as it
      // always set them.
      cageIndex: cage,
      // Issue #77: a fish with eggs still arrives in her own travel tank, not
      // the generic eggs-basket every other egg-layer gets — the tank is her
      // ONLY hand-off object, eggs or not (she has no other way to move).
      carryKind: (primary.hasEggs && speciesKey !== 'fish') ? CARRY_KIND.BASKET : carryKindForSpecies(speciesKey),
      // Feeding/potty chores (issues #6/#7) — see data/needs.js for the shape.
      // Timers only actually count down once the stay has settled into its
      // section; KennelScene ticks them.
      needs,
      timers,
      // Owner note 2026-07-29: bowl stock is tracked separately from need
      // state — filling (player action) and eating/drinking (automatic once
      // hungry/thirsty AND stocked) are decoupled events. See data/needs.js.
      bowl: createBowlState(),
      // Births (issue #9) — set below if the primary is pregnant/has eggs.
      // Announcement (issue #10) — flips true the moment babies/hatchlings
      // appear, until the player uses the reception computer to tell the
      // owner; KennelScene shows a "needs attention" icon there while true.
      needsAnnouncement: false,
    };
    attachBirthTimer(stay);
    stays.push(stay);
    return stay;
  }

  // Removes and returns every stay whose checkout day has arrived. Skips stays
  // still at reception or mid-carry (they haven't settled into a section yet —
  // nothing to quietly send home). Recycles the departing animal back into the
  // returning-guest pool (or adds it fresh) so it's eligible to arrive again
  // later this session, matching DESIGN.md's "always comes back" without needing
  // cross-session persistence yet.
  //
  // Issue #12 ("Doing a Great Job"): a pool entry's `visits` counts how many
  // times THIS animal has checked out before. From her second checkout on,
  // she's a genuine returning guest, so her owner gives her a bit of new
  // stuff — pushed onto `stay.animal.upgrades` (the same object the pool and
  // any future stay for her share, so it accumulates correctly across
  // repeat visits) and flagged as `stay.newUpgrade` for this checkout so
  // KennelScene can flavor-announce it. Money payout itself is computed by
  // KennelScene from data/economy.js at checkout time, not here — it doesn't
  // need any roster-side bookkeeping.
  // Issue #36: checkout is no longer instant — a due stay just gets FLAGGED
  // ready (`stay.checkoutReady`), and KennelScene spawns a waiting owner for
  // her; the player has to actually carry her over to that owner to complete
  // the checkout (finalizeCheckout, below). This only flags; it doesn't touch
  // `stays`/`pool` at all. Idempotent — a stay already flagged is skipped, so
  // repeat hourly ticks can't re-flag/re-spawn an owner for her.
  // `limit` caps how many NEW stays get flagged this call (owner note
  // 2026-07-29: "don't have SO many owners come to pick-up at once") — a stay
  // whose checkout is due but who doesn't fit under the limit is simply left
  // unflagged and picked up again on a later hour tick once room frees up
  // (KennelScene passes room based on how many checkout owners are currently
  // waiting), same idea as the arrival cap on simultaneous lingering owners.
  function flagCheckoutReady(day, limit = Infinity) {
    const flagged = [];
    for (const stay of stays) {
      if (flagged.length >= limit) break;
      if (stay.checkoutReady) continue;
      // A stay still at reception or mid-carry has no settled home to be
      // collected from — skip until she has one (issue #20).
      //
      // Issue #67 (owner's decision): a stay out playing in the YARD is no
      // longer skipped. She used to be silently deferred until she happened
      // to come back inside, which in practice meant nightfall — her owner
      // just never showed up. She's flagged like anyone else now, and
      // KennelScene walks her back to her own cage to wait (reusing issue
      // #45's walker, the same one nightfall uses) — see
      // _flagCheckoutsReady. Once she's home she behaves exactly like any
      // other checkout-ready caged pet.
      if (stay.location === LOCATION.RECEPTION || stay.location === LOCATION.CARRYING) continue;
      if (day < stay.checkoutDay) continue;
      stay.checkoutReady = true;
      flagged.push(stay);
    }
    return flagged;
  }

  // Finalizes a checkout once the player has actually delivered `stay` to
  // her waiting owner (KennelScene._completeCheckout) — removes her from
  // `stays` and updates the returning-guest pool (visit count / upgrade),
  // exactly the bookkeeping the old instant checkoutDue used to do inline.
  function finalizeCheckout(stay) {
    const i = stays.indexOf(stay);
    if (i !== -1) stays.splice(i, 1);
    const existing = pool.find((p) => p.animal.id === stay.animal.id);
    if (existing) {
      if (existing.visits >= 1) {
        const kind = pickUpgradeKind(stay.animal);
        stay.animal.upgrades = [...(stay.animal.upgrades || []), kind];
        stay.newUpgrade = kind;
      }
      existing.visits += 1;
      existing.available = true;
    } else {
      pool.push({ animal: stay.animal, available: true, visits: 1 });
    }
  }

  // Secret bonus guest (src/dev/secretDragon.js's "DRAGON" cheat code) — the
  // ONE other way a stay enters `stays`, called directly by KennelScene once
  // the player types the secret code. Deliberately simpler than
  // spawnArrival's family/returning-pool machinery: a solo baby dragon, no
  // eggs/pregnancy roll, no returning-pool tracking — she's a one-time
  // bonus, not part of the regular rotation (species.js's SPECIES_KEYS
  // excludes 'dragon' entirely, so she never enters the normal arrival
  // roll). She has no section of her own, but needs none: she arrives at
  // reception exactly like any other guest, and KennelScene's issue #27
  // "any open cage anywhere" placement path (normally generalized-mode-only)
  // also applies to her specifically regardless of mode, since she has no
  // species-matching section to walk into — see KennelScene._resolveDropoff.
  // Issue #54: she's assigned her `cageIndex` at check-in exactly like any
  // other stay, so findOpenCage above needs no special case for her.
  function spawnDragon({ day, hour, rng = Math.random } = {}) {
    // Issue #54: she checks in with a real assigned cage like everyone else.
    // She has no species section of her own and needs none — a cage is just a
    // position in the grid now (issue #71). Null (kennel genuinely full) is
    // already ruled out by KennelScene._triggerSecretDragon's
    // anyOpenCageAnywhere check before it ever calls this; guarded here anyway
    // so she can't end up with a bogus cage if that ever changes.
    const cage = findOpenCage(stays);
    if (cage == null) return null;
    // stage: 'baby' — the smaller hatchling art/name pool (draws from both
    // girl and boy dragon names), matching "a small baby dragon" rather than
    // a grown mom.
    const primary = createAnimal('dragon', { stage: 'baby' });
    const { needs, timers } = createNeeds('dragon', day, hour);
    const stay = {
      animal: primary,
      companions: [],
      arrivedHour: hour,
      arrivedDay: day,
      checkoutDay: day + MIN_NIGHTS + Math.floor(rng() * 2),
      location: LOCATION.RECEPTION,
      cageIndex: cage,
      carryKind: carryKindForSpecies('dragon'),
      needs,
      timers,
      bowl: createBowlState(),
      needsAnnouncement: false,
    };
    attachBirthTimer(stay); // no-op: she never arrives pregnant/with eggs
    stays.push(stay);
    return stay;
  }

  return { stays, pool, spawnArrival, flagCheckoutReady, finalizeCheckout, spawnDragon };
}
