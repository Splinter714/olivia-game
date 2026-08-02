// Lightweight per-species "wander" tuning (issue #22 #4) — pure data, no
// Phaser. KennelScene drives the actual drift: each present stay gets a
// small periodic target point within its cage/island (or its yard zone,
// while out playing) that its sprite drifts toward; when it arrives (or its
// timer runs out) a new target is picked. Amplitude/interval per species
// give each one a distinct feel without needing separate animation code —
// a hamster re-targets often and can range further inside its small cage
// ("bounces around"), a turtle barely moves at all, a bunny re-targets in
// bursts ("hops"), cats/dogs drift slowly and widely ("pace").
export const WANDER = {
  turtle:     { interval: [4500, 8000], amp: 5 },  // barely shifts on its island
  snake:      { interval: [3500, 7000], amp: 7 },  // slow coil-and-shift along the perch
  guineaPig:  { interval: [1800, 3200], amp: 9 },
  hamster:    { interval: [700, 1600], amp: 13 },  // bounces around the most
  bunny:      { interval: [2200, 4200], amp: 12 }, // hops in bursts
  cat:        { interval: [3000, 5500], amp: 10 }, // slow pacing
  dog:        { interval: [2600, 5000], amp: 11 }, // slow pacing
  bird:       { interval: [900, 2000], amp: 10 },  // quick hops around the nest
  lizard:     { interval: [1100, 3400], amp: 12 }, // darts, then basks a while
  dragon:     { interval: [2400, 4800], amp: 9 },  // secret bonus guest — a calm little waddle
  // Issue #77: a fish never wanders far — she's confined to her home tank or
  // the shared pond either way (KennelScene forces her into the small
  // anchored-drift branch even while "in the yard" — see _updateWander),
  // so a gentle in-place swim reads better than a big roam.
  fish:       { interval: [2000, 4200], amp: 5 },
};

// Yard play reads more energetic/larger-range than in-cage wander (DESIGN.md
// "they play and play") — same per-species shape, just scaled up.
export const YARD_WANDER_MULT = 2.4;

export function pickWanderInterval(speciesKey) {
  const [a, b] = (WANDER[speciesKey] || WANDER.cat).interval;
  return a + Math.random() * (b - a);
}

export function wanderAmplitude(speciesKey, inYard) {
  const amp = (WANDER[speciesKey] || WANDER.cat).amp;
  return inYard ? amp * YARD_WANDER_MULT : amp;
}

// How fast a wandering animal actually MOVES toward her current target, in
// logical px/sec (owner note 2026-07-30: "the animals are zipping around
// extremely fast... slow them down appropriately").
//
// KennelScene used to drift sprites with a proportional lerp, whose speed
// scales with how far away the target is. That read fine while targets were
// always a couple of dozen px away, but once issue #60 let a yard animal
// target anywhere in the play area, a long hop launched her across it at
// roughly 900 px/s. Speed is now constant and capped, derived from the same
// per-species `amp` that already encodes liveliness — a hamster scurries, a
// turtle plods — and deliberately well under the ~82 px/s a pet walks at
// when she's actually going somewhere (KennelScene's walker), since
// wandering should read as pottering about, not commuting.
export function wanderSpeed(speciesKey) {
  const amp = (WANDER[speciesKey] || WANDER.cat).amp;
  return 10 + amp * 2.2; // turtle ~21 px/s, cat ~32, hamster ~39
}

// ── Babies (issue #62) ─────────────────────────────────────────────────────
// Owner: "baby animals should wander and play SEPARATELY from their grownup,
// not linked exactly together." Asked how far a baby may get from mom out in
// the yard he first said "loosely near mom", then revised it the same day:
// "let babies wander away from mom further, like a lot further."
//
// Issue #48 gave each baby a FIXED offset from mom plus a jitter of amp*0.35
// around it, and re-derived her screen position from mom's sprite every
// frame — so the litter was welded to her in formation and got dragged around
// the yard behind her once #60 let her roam all of it.
//
// Now a baby owns a WORLD-space position and target of her own. She potters
// off wherever she likes; the tether below is only the leash length at which
// she gives up and heads back toward mom. In a cage it barely matters (the
// cage is 100px across, so the walls are the real limit); out in the yard
// it's most of the play area, which is what "a lot further" buys — a litter
// scattered across the grass playing, still recognisably mom's.
//
// Issue #84 adds a third: a fish's hatchlings out at the shared pond. They
// are "in the yard" as far as `stay.location` is concerned, but the yard
// tether is several times the whole pond — every target it picked landed on
// the grass and got clamped back to the water's edge, so the litter hugged
// the rim instead of swimming about, which is exactly the "they look like
// they're on the grass" the owner reported. This one is sized to the pond
// (see data/props.js's pondSwimArea: roughly 100x65 of usable water for a
// hatchling), so most targets land in open water and the clamp is a backstop
// rather than the thing doing the steering.
export const BABY_TETHER = { cage: 30, yard: 300, pond: 80 };

// Hysteresis, so a baby sitting right on the tether doesn't flicker between
// "off playing" and "heading back" every frame: she starts heading back at
// the full tether, and only resumes her own business once she's back inside
// this fraction of it.
export const BABY_TETHER_RELEASE = 0.55;

// Issue #63's rule applied at baby scale: a constant capped px/sec, never a
// distance-scaled lerp, so a much wider tether can't turn into a baby flung
// across the yard the way mom used to be. A shade quicker than her mother —
// small legs, more energy.
export function babyWanderSpeed(speciesKey) {
  return wanderSpeed(speciesKey) * 1.2; // turtle ~25 px/s, cat ~38, hamster ~47
}

// The scamper she uses when she's past her tether, or when mom is actually
// walking somewhere: a shade over KennelScene's ANIMAL_WALK_SPEED (82 px/s)
// so she can genuinely close the gap on a mother who's on the move, rather
// than trailing further and further behind her.
export const BABY_CATCHUP_SPEED = 95;

// How far a baby's remembered position may be from a fresh render anchor
// before we give up on it and re-form the litter beside mom. A redraw happens
// for reasons that have nothing to do with the babies (a tie-breaker sync
// when someone new checks in, a birth landing), and snapping the whole litter
// back into formation every time one of those fires would undo the wandering;
// but a redraw that MOVED mom (she settled into her cage after a yard trip)
// genuinely should re-form them at her feet.
export const BABY_KEEP_RADIUS = BABY_TETHER.yard + 40;
