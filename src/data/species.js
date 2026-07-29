// Species catalog for the kennel's six animals (see DESIGN.md "The Animals").
// Pure data, no Phaser — src/art/animals.js reads `size`/`babyScale` (plus
// src/art/palette.js's paletteForHue(), driven by each animal's own `hue` —
// see src/data/animal.js/src/data/looks.js — for its body colors) to draw
// textures; src/data/animal.js reads the species keys to build instances;
// src/scenes/KennelScene.js reads `size` to place/scale sprites.
//
// `family` says how this species' "mom + babies" pattern (DESIGN.md "Moms and
// Babies") is shaped — every species supports SOME family pattern, this just
// picks which: turtles are the only species that can have EGGS as well as live
// babies; cats/dogs have named baby forms (kittens/puppies) that stay with mom;
// the small pets just get a generic "baby" variant since DESIGN.md doesn't detail
// them further. Issue #9 (moms/babies/eggs) is expected to extend this, not
// reshape it.
export const FAMILY = {
  EGGS_OR_BABIES: 'eggsOrBabies', // turtle: mom arrives with eggs OR live babies
  NAMED_BABIES: 'namedBabies',    // cat/dog: kittens/puppies stay with mom
  GENERIC_BABY: 'genericBaby',    // guineaPig/hamster/bunny: simple baby variant
};

export const SPECIES = {
  turtle: {
    key: 'turtle',
    label: '🐢 Turtles',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 30, h: 22 },
    babyScale: 0.6,
  },
  guineaPig: {
    key: 'guineaPig',
    label: '🐹 Guinea Pigs',
    family: FAMILY.GENERIC_BABY,
    size: { w: 26, h: 20 },
    babyScale: 0.62,
  },
  hamster: {
    key: 'hamster',
    label: '🐹 Hamsters',
    family: FAMILY.GENERIC_BABY,
    size: { w: 20, h: 16 },
    babyScale: 0.65,
  },
  bunny: {
    key: 'bunny',
    label: '🐰 Bunnies',
    family: FAMILY.GENERIC_BABY,
    size: { w: 24, h: 26 },
    babyScale: 0.58,
  },
  cat: {
    key: 'cat',
    label: '🐱 Cats',
    family: FAMILY.NAMED_BABIES,
    size: { w: 28, h: 24 },
    babyScale: 0.55,
  },
  dog: {
    key: 'dog',
    label: '🐶 Dogs',
    family: FAMILY.NAMED_BABIES,
    size: { w: 32, h: 26 },
    babyScale: 0.55,
  },
};

export const SPECIES_LIST = Object.values(SPECIES);
export const SPECIES_KEYS = Object.keys(SPECIES);
