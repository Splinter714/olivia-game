// Species catalog for the kennel's six animals (see DESIGN.md "The Animals").
// Pure data, no Phaser — src/art/animals.js reads `palette`/`size`/`babyScale` to
// draw textures; src/data/animal.js reads the species keys to build instances;
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

// Each palette entry is a small set of body colors for that species' art function
// (src/art/animals.js) — 2 variants per species is enough for "two same-species
// animals can look different" without needing a full customizer yet.
export const SPECIES = {
  turtle: {
    key: 'turtle',
    label: '🐢 Turtles',
    family: FAMILY.EGGS_OR_BABIES,
    size: { w: 30, h: 22 },
    babyScale: 0.6,
    palette: [
      { shell: 0x4f8f5c, shellDark: 0x396b40, skin: 0x9dc978 },
      { shell: 0x86974a, shellDark: 0x647236, skin: 0xb8c47f },
    ],
  },
  guineaPig: {
    key: 'guineaPig',
    label: '🐹 Guinea Pigs',
    family: FAMILY.GENERIC_BABY,
    size: { w: 26, h: 20 },
    babyScale: 0.62,
    palette: [
      { body: 0xd99a5b, bodyDark: 0xb87b41, belly: 0xf1d9ab },
      { body: 0xede3d3, bodyDark: 0xd2c4ab, belly: 0xfbf6ec },
    ],
  },
  hamster: {
    key: 'hamster',
    label: '🐹 Hamsters',
    family: FAMILY.GENERIC_BABY,
    size: { w: 20, h: 16 },
    babyScale: 0.65,
    palette: [
      { body: 0xe0a95e, bodyDark: 0xc08a3e, cheek: 0xf6cf9a },
      { body: 0xa9763f, bodyDark: 0x8a5c2c, cheek: 0xd1a76b },
    ],
  },
  bunny: {
    key: 'bunny',
    label: '🐰 Bunnies',
    family: FAMILY.GENERIC_BABY,
    size: { w: 24, h: 26 },
    babyScale: 0.58,
    palette: [
      { body: 0xf3ece0, bodyDark: 0xd9cfbd, earInner: 0xf2a3ac },
      { body: 0x9a8873, bodyDark: 0x7a6a58, earInner: 0xe89aa4 },
    ],
  },
  cat: {
    key: 'cat',
    label: '🐱 Cats',
    family: FAMILY.NAMED_BABIES,
    size: { w: 28, h: 24 },
    babyScale: 0.55,
    palette: [
      { body: 0xe8943c, bodyDark: 0xc06c20, earInner: 0xf2a09a },
      { body: 0x3a3630, bodyDark: 0x201d18, earInner: 0xd68a86 },
    ],
  },
  dog: {
    key: 'dog',
    label: '🐶 Dogs',
    family: FAMILY.NAMED_BABIES,
    size: { w: 32, h: 26 },
    babyScale: 0.55,
    palette: [
      { body: 0xcf9a5e, bodyDark: 0xa8763e, earColor: 0x8a5a34 },
      { body: 0xf1ecdf, bodyDark: 0xd2cab6, earColor: 0xc2b294 },
    ],
  },
};

export const SPECIES_LIST = Object.values(SPECIES);
export const SPECIES_KEYS = Object.keys(SPECIES);
