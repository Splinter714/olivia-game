// Species catalog for the kennel's six animals (see DESIGN.md "The Animals").
// Pure data, no Phaser — src/data/animal.js reads the species keys to build
// instances; src/scenes/KennelScene.js reads `size` to place/space sprites.
//
// `size` is the DESIGN-GRID size src/art/animals.js authors this species at,
// NOT its on-screen size: the art is drawn on an ART_SCALE (4x) super-sampled
// texture and displayed at ANIMAL_DISPLAY_SCALE (0.5), so an animal occupies
// `size` x 2 LOGICAL pixels on screen (a dog is 28x24 design px = 56x48
// logical px). Anything measuring a live sprite must use displayWidth/
// displayHeight rather than width/height.
//
// `babyScale` is advisory only now — art/animals.js hand-authors a separate
// baby layout per species (bigger head, shorter limbs, shorter body) rather
// than uniformly shrinking the adult, so a baby is NOT simply size*babyScale.
// Colors come from a named coat + pattern per animal (src/data/coats.js).
//
// `family` says how this species' "mom + babies" pattern (DESIGN.md "Moms and
// Babies") is shaped — every species supports SOME family pattern, this just
// picks which: turtle/snake are the only species that can have EGGS as well as
// live babies; cats/dogs have named baby forms (kittens/puppies) that stay with
// mom; the small pets just get a generic "baby" variant since DESIGN.md doesn't
// detail them further. Issue #9 (moms/babies/eggs): every species (including
// the generic-baby ones) can also arrive `isPregnant` — that flag/the birth
// timer plumbing (data/births.js) was already generic, not gated by `family`,
// so no schema change was needed here to extend it.
export const FAMILY = {
  EGGS_OR_BABIES: 'eggsOrBabies', // turtle/snake: mom arrives with eggs OR live babies
  NAMED_BABIES: 'namedBabies',    // cat/dog: kittens/puppies stay with mom
  GENERIC_BABY: 'genericBaby',    // guineaPig/hamster/bunny: simple baby variant
};

export const SPECIES = {
  turtle: {
    key: 'turtle',
    label: '🐢 Turtles',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 20, h: 14 },
    babyScale: 0.6,
  },
  guineaPig: {
    key: 'guineaPig',
    label: '🐹 Guinea Pigs',
    family: FAMILY.GENERIC_BABY,
    size: { w: 18, h: 14 },
    babyScale: 0.62,
  },
  hamster: {
    key: 'hamster',
    label: '🐹 Hamsters',
    family: FAMILY.GENERIC_BABY,
    size: { w: 14, h: 12 },
    babyScale: 0.65,
  },
  bunny: {
    key: 'bunny',
    label: '🐰 Bunnies',
    family: FAMILY.GENERIC_BABY,
    size: { w: 20, h: 20 },
    babyScale: 0.58,
  },
  cat: {
    key: 'cat',
    label: '🐱 Cats',
    family: FAMILY.NAMED_BABIES,
    size: { w: 22, h: 20 },
    babyScale: 0.55,
  },
  dog: {
    key: 'dog',
    label: '🐶 Dogs',
    family: FAMILY.NAMED_BABIES,
    size: { w: 28, h: 24 },
    babyScale: 0.55,
  },
  snake: {
    key: 'snake',
    label: '🐍 Snakes',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 24, h: 10 },
    babyScale: 0.6,
  },
  // Issue #24: birds — like turtles/snakes, a bird mom can arrive with eggs
  // OR live chicks, hatching in a nest rather than sitting on a sand island
  // or perch (data/props.js/art/props.js's nest-styled cage slot).
  bird: {
    key: 'bird',
    label: '🐦 Birds',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 16, h: 14 },
    babyScale: 0.6,
  },
  // Issue #28: lizards — the owner asked for them as a regular 9th kennel
  // species ("Did we add lizards? We should."), with the same eggs-or-babies
  // family pattern as turtle/snake/bird ("Eggs, like turtles/snakes/birds")
  // and no specific look requested ("whatever fits the style") — see
  // art/animals.js LIZARD_GEO, whose adult grid this `size` must track.
  lizard: {
    key: 'lizard',
    label: '🦎 Lizards',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 26, h: 12 },
    babyScale: 0.6,
  },
  // Issue #77: fish — the 10th kennel species, and a genuinely different
  // interaction model from every other one: she has no legs, so she never
  // walks herself anywhere (no self-walk to the yard, no nightfall walk
  // home, no self-walk to a waiting owner at checkout). The player carries
  // her everywhere in her travel tank instead (see data/roster.js's
  // CARRY_KIND.TANK and KennelScene's travel-tank plumbing) — her home is a
  // fish-tank-styled cage (art/props.js's drawFishTankBg/Fg, extending the
  // turtle tank treatment) and her one destination out is the single shared
  // pond in the play yard (data/props.js's POND_SPOT/POND_RECT). Same
  // eggs-or-babies family pattern as turtle/snake/bird/lizard ("Eggs, like
  // turtles/snakes/birds/lizards" — owner). No bathroom need/mess at all
  // (excluded entirely, not just unlucky — see data/needs.js), and her cage
  // gets a fitted waterproof cover at night instead of the ordinary blanket.
  fish: {
    key: 'fish',
    label: '🐟 Fish',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 14, h: 10 },
    babyScale: 0.6,
  },
  // Secret bonus guest (src/dev/secretDragon.js's "DRAGON" cheat code) — a
  // SMALL baby dragon, not an imposing full-size one. Uses the same
  // eggs-or-babies family pattern as turtle/snake/bird (reuses data/births.js'
  // generic timer as-is), but she's never part of the regular hourly arrival
  // rotation: `secret: true` makes SPECIES_KEYS below skip her, so
  // roster.js's spawnArrival can never roll her, and she has no section of
  // her own in data/sections.js — see KennelScene._triggerSecretDragon for
  // how she's actually summoned and where she ends up living.
  dragon: {
    key: 'dragon',
    label: '🐉 Dragon',
    family: FAMILY.EGGS_OR_BABIES,
    // w widened 20->29 to match art/animals.js's DRAGON_GEO.adult design
    // grid, which grew for the longer S-curved tail (2026-07-29) — this
    // `size` is what KennelScene uses for placement/spacing math, so it has
    // to track the actual art grid or animals.js's buildAnimalTextures()
    // guard warns about the drift.
    size: { w: 29, h: 16 },
    babyScale: 0.6,
    secret: true,
  },
};

export const SPECIES_LIST = Object.values(SPECIES);
// Excludes any `secret: true` entry (currently just the bonus dragon) so the
// regular 9-species rotation (roster.js's pickSpecies/RETURNING_POOL_SIZE)
// never sees her — she's exclusively a secret-triggered guest.
export const SPECIES_KEYS = Object.keys(SPECIES).filter((k) => !SPECIES[k].secret);
