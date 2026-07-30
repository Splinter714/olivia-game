// Named, realistic coats + markings for the six kennel species (issue #16).
// Pure data/logic — no Phaser. Replaces the old hue wheel (data/looks.js +
// art/palette.js), which gave every animal a mathematically-unique but
// cartoonishly-arbitrary colour: a lilac dog, a teal hamster. Real pets come in
// a small set of recognisable coats, so an animal now picks a NAMED coat plus a
// NAMED pattern, and telling two look-alikes apart falls to collars and then a
// small ID tattoo (see distinguish.js) — the way a real kennel does it.
//
// Shape of a coat (modelled on the horse game's src/data/species/horse/coats.js):
// every colour group is a 3-tone ramp { hi, mid, lo } — highlight, base, shadow —
// which is what the art's layering reads (lo under the belly/haunch, mid across
// the body, hi along the sunlit back). Species-specific extras (ear inner, belly,
// cheek pouch, shell, nose, eye) sit alongside as flat colours, matching exactly
// what each draw function in art/animals.js asks for.

// ── Dogs ────────────────────────────────────────────────────────────────────
// `mark` is the colour used by the patches/spots patterns; `points` (when
// present) is a second ramp for tan legs/muzzle/brows — the black-and-tan gene.
const DOG_COATS = {
  golden: {
    label: 'Golden',
    body: { hi: 0xe8b054, mid: 0xd4943c, lo: 0xb07828 },
    ear: 0xa86e22, snout: 0xf0d898, nose: 0x2a1810, eye: 0x2a1808,
    mark: 0xa4661c,
  },
  black: {
    label: 'Black',
    body: { hi: 0x4a4750, mid: 0x312e36, lo: 0x1c1a20 },
    ear: 0x241f27, snout: 0x3c3942, nose: 0x14121a, eye: 0x0f0d12,
    mark: 0xf0ece4,
  },
  chocolate: {
    label: 'Chocolate',
    body: { hi: 0x8c5c36, mid: 0x6d4526, lo: 0x4e301a },
    ear: 0x452a16, snout: 0x8a6142, nose: 0x2a1a0e, eye: 0x2a1a0e,
    mark: 0xf0e6d4,
  },
  cream: {
    label: 'Cream',
    body: { hi: 0xf8efdb, mid: 0xe7d8b6, lo: 0xc8b48d },
    ear: 0xbca578, snout: 0xfaf3e2, nose: 0x4a3626, eye: 0x33261a,
    mark: 0xb98a55,
  },
  blackAndTan: {
    label: 'Black & Tan',
    body: { hi: 0x45424c, mid: 0x2c2932, lo: 0x1a181e },
    points: { hi: 0xc79352, mid: 0xa87433, lo: 0x835723 },
    ear: 0x22202a, snout: 0xa87433, nose: 0x14121a, eye: 0x0f0d12,
    mark: 0xa87433,
  },
};

// ── Cats ────────────────────────────────────────────────────────────────────
// Several of the owner's cat "coats" are really colour+pattern combinations
// (calico, tuxedo, the two tabbies), so a cat coat carries its own baked-in
// `mark` style — 'stripes' (tabby barring + tail rings + forehead M),
// 'patches' (calico blotches), 'bib' (tuxedo white chest/muzzle/paws), or none.
// The separate pattern axis is just white socks, which coats that are already
// white-footed opt out of via `patterns`.
const CAT_COATS = {
  orangeTabby: {
    label: 'Orange Tabby',
    body: { hi: 0xf3b661, mid: 0xdc9038, lo: 0xb56c22 },
    mark: 'stripes', markColor: 0x9e5a18,
    ear: 0xf0a89e, nose: 0xe08a76, eye: 0x8ec24a, belly: 0xf7dcae,
  },
  greyTabby: {
    label: 'Grey Tabby',
    body: { hi: 0xb7b8bf, mid: 0x93949c, lo: 0x6d6e77 },
    mark: 'stripes', markColor: 0x4d4e57,
    ear: 0xe6a3a8, nose: 0xd08d8d, eye: 0x9fc84e, belly: 0xd8d9de,
  },
  black: {
    label: 'Black',
    body: { hi: 0x453f48, mid: 0x2b262e, lo: 0x18151b },
    mark: null, markColor: 0x000000,
    ear: 0xc98f95, nose: 0x3a3238, eye: 0xe0c64a, belly: 0x3a3440,
  },
  white: {
    label: 'White',
    body: { hi: 0xffffff, mid: 0xf2eee7, lo: 0xd6cfc3 },
    mark: null, markColor: 0xd6cfc3,
    ear: 0xf2b3ba, nose: 0xe9a396, eye: 0x6fb6d8, belly: 0xffffff,
    patterns: ['solid'], // already white-footed
  },
  calico: {
    label: 'Calico',
    body: { hi: 0xffffff, mid: 0xf4efe6, lo: 0xddd2c4 },
    mark: 'patches', markColor: 0xe08a34, markColor2: 0x35312a,
    ear: 0xf2a09a, nose: 0xe69a86, eye: 0x74c24a, belly: 0xffffff,
    patterns: ['solid'],
  },
  tuxedo: {
    label: 'Tuxedo',
    body: { hi: 0x453f48, mid: 0x2b262e, lo: 0x18151b },
    mark: 'bib', markColor: 0xf7f4ee,
    ear: 0xc98f95, nose: 0xdba79c, eye: 0xe0c64a, belly: 0xf7f4ee,
    patterns: ['solid'],
  },
};

// ── Bunnies ─────────────────────────────────────────────────────────────────
const BUNNY_COATS = {
  white: {
    label: 'White',
    body: { hi: 0xffffff, mid: 0xf1eee9, lo: 0xd8d2c8 },
    ear: 0xf2b3ba, eye: 0xb04a52, belly: 0xffffff, mark: 0x8e8a84,
  },
  grey: {
    label: 'Grey',
    body: { hi: 0xc2c2cb, mid: 0x9a9aa2, lo: 0x6f6f78 },
    ear: 0xe8a7ad, eye: 0x2b2b30, belly: 0xcfcfd6, mark: 0xf3f1ec,
  },
  brown: {
    label: 'Brown',
    body: { hi: 0xc99a5f, mid: 0xa9773f, lo: 0x7f5628 },
    ear: 0xe1a49a, eye: 0x2a1c10, belly: 0xd9c0a0, mark: 0xf3ece0,
  },
  black: {
    label: 'Black',
    body: { hi: 0x565059, mid: 0x3b3740, lo: 0x241f27 },
    ear: 0xd7969c, eye: 0x120f14, belly: 0x6a636e, mark: 0xf1eee9,
  },
};

// ── Guinea pigs ─────────────────────────────────────────────────────────────
const GUINEA_PIG_COATS = {
  ginger: {
    label: 'Ginger',
    body: { hi: 0xe8a95c, mid: 0xcd8434, lo: 0xa4611f },
    ear: 0xdba08e, eye: 0x2a1808, belly: 0xf3d6a8, mark: 0x4d3a2c,
  },
  cream: {
    label: 'Cream',
    body: { hi: 0xfaf1dc, mid: 0xecdcb6, lo: 0xcbb98c },
    ear: 0xe9b3a6, eye: 0x513a26, belly: 0xfdf8ec, mark: 0x9a7442,
  },
  brown: {
    label: 'Brown',
    body: { hi: 0xa1774c, mid: 0x7d5732, lo: 0x593b1f },
    ear: 0xc99c8c, eye: 0x1e1408, belly: 0xc2a077, mark: 0xf2e7d3,
  },
};

// ── Hamsters ────────────────────────────────────────────────────────────────
const HAMSTER_COATS = {
  golden: {
    label: 'Golden',
    body: { hi: 0xf0c274, mid: 0xd79c46, lo: 0xb0762a },
    ear: 0xd6a394, eye: 0x2a1808, belly: 0xf9ebcd, cheek: 0xf6dcaa, mark: 0xf7f2e6,
  },
  cream: {
    label: 'Cream',
    body: { hi: 0xfbf2df, mid: 0xeddec0, lo: 0xccba97 },
    ear: 0xe8b6a8, eye: 0x4a3626, belly: 0xfffaf0, cheek: 0xfdf6e6, mark: 0xb08a55,
  },
  grey: {
    label: 'Grey',
    body: { hi: 0xc6c6cd, mid: 0xa0a0a9, lo: 0x777780 },
    ear: 0xd8a8ac, eye: 0x1e1c22, belly: 0xdedee4, cheek: 0xe4e4ea, mark: 0xf6f5f2,
  },
};

// ── Turtles ─────────────────────────────────────────────────────────────────
// Turtles have no fur, so their variation lives entirely in the shell: a natural
// carapace colour ramp (plus the skin tone showing at head/legs/tail), and one
// of the named shell markings below.
const TURTLE_COATS = {
  olive: {
    label: 'Olive',
    body: { hi: 0x7d9a4c, mid: 0x5f7a34, lo: 0x435822 },
    skin: { hi: 0x9fb06a, mid: 0x7f9050, lo: 0x5e6c38 },
    eye: 0x140f08, mark: 0xd8c470, beak: 0xd9cf9a,
  },
  brown: {
    label: 'Brown',
    body: { hi: 0x936a3d, mid: 0x714d27, lo: 0x503416 },
    skin: { hi: 0xa8894f, mid: 0x86693a, lo: 0x624b28 },
    eye: 0x150d06, mark: 0xe2c98a, beak: 0xdccca0,
  },
  mossGreen: {
    label: 'Moss Green',
    body: { hi: 0x5e8460, mid: 0x436345, lo: 0x2c452e },
    skin: { hi: 0x86a074, mid: 0x66805a, lo: 0x4a6040 },
    eye: 0x0f1408, mark: 0xcfd98c, beak: 0xd2d5a4,
  },
};

// ── Snakes (issue #14) ──────────────────────────────────────────────────────
// Two plain solid colours plus two named banded morphs — the banded ones bake
// their band colour in as `mark` and restrict themselves to the 'banded'
// pattern via `patterns` below (the same trick CAT_COATS' calico/tuxedo use),
// so a black-and-white snake is always drawn banded and a green/brown one is
// always drawn solid.
const SNAKE_COATS = {
  green: {
    label: 'Green',
    body: { hi: 0x8fbf5a, mid: 0x6a9c3e, lo: 0x486e29 },
    belly: 0xdadfb2, eye: 0x140f08, mark: 0x486e29,
    patterns: ['solid'],
  },
  brownTan: {
    label: 'Brown & Tan',
    body: { hi: 0xc9a15f, mid: 0xa17a3f, lo: 0x785929 },
    belly: 0xe9d9b1, eye: 0x140f08, mark: 0x785929,
    patterns: ['solid'],
  },
  blackWhiteBanded: {
    label: 'Black & White Banded',
    body: { hi: 0x4a4750, mid: 0x312e36, lo: 0x1c1a20 },
    belly: 0xf0ece4, eye: 0xe0c64a, mark: 0xf0ece4,
    patterns: ['banded'],
  },
  orangeBlackBanded: {
    label: 'Orange & Black Banded',
    body: { hi: 0xe8862c, mid: 0xd06a18, lo: 0x9c4c10 },
    belly: 0xf3d6a8, eye: 0x140f08, mark: 0x241f20,
    patterns: ['banded'],
  },
};

// ── Birds (issue #24) ───────────────────────────────────────────────────────
// Four cheerful pet-bird looks: a plain-blue budgie/parakeet, a red cardinal,
// a yellow canary, and a brown speckled sparrow. `wing`/`beak` are flat
// colours the art asks for directly; `mark` (speckled sparrow only) is the
// darker speckle colour scattered over the body/wing.
const BIRD_COATS = {
  blue: {
    label: 'Blue',
    body: { hi: 0x7ec4e8, mid: 0x4f9fd6, lo: 0x3679ac },
    wing: 0x2e5f8a, belly: 0xdff0f7, beak: 0xe8b34a, eye: 0x1c1410,
  },
  cardinal: {
    label: 'Red',
    body: { hi: 0xf16f5c, mid: 0xd9432c, lo: 0xac2e1c },
    wing: 0x8a2418, belly: 0xf7c8a8, beak: 0xe8622a, eye: 0x1c1410,
  },
  canary: {
    label: 'Yellow',
    body: { hi: 0xf9e675, mid: 0xf0cf3e, lo: 0xc7a323 },
    wing: 0xb08a1e, belly: 0xfdf6cf, beak: 0xe8862c, eye: 0x1c1410,
  },
  sparrow: {
    label: 'Brown & Speckled',
    body: { hi: 0xc7a473, mid: 0xa17e4d, lo: 0x785c34 },
    wing: 0x5c4526, belly: 0xe9dcc0, beak: 0x8a6a3e, eye: 0x1c1410,
    mark: 0x4a3620,
    patterns: ['speckled'],
  },
};

// ── Dragon (secret bonus guest) ─────────────────────────────────────────────
// A small, fun set for a hidden extra, not a fully-fleshed 9th species: four
// storybook-dragon colours plus a light 'scaled'/'smooth' pattern axis (a
// dusting of diamond scale-highlights across the back, or none).
const DRAGON_COATS = {
  emerald: {
    label: 'Emerald',
    body: { hi: 0x6fe0a0, mid: 0x2fae6e, lo: 0x1c7048 },
    belly: 0xcdf2d8, wing: 0x1c7048, horn: 0xf3e6c8, eye: 0xffd54a,
    mark: 0x175c3a,
  },
  ember: {
    label: 'Ember',
    body: { hi: 0xff9a5c, mid: 0xe8622a, lo: 0xac3e14 },
    belly: 0xffe0c0, wing: 0x8a2a10, horn: 0x3a241a, eye: 0xffe066,
    mark: 0x7a2a0e,
  },
  midnight: {
    label: 'Midnight Purple',
    body: { hi: 0x9a7fd6, mid: 0x5f469e, lo: 0x362a68 },
    belly: 0xd8cdf0, wing: 0x2c2050, horn: 0xe8dcc0, eye: 0x9be8ff,
    mark: 0x241a48,
  },
  gold: {
    label: 'Gold',
    body: { hi: 0xffe08a, mid: 0xf0c245, lo: 0xbf8f1e },
    belly: 0xfff3cf, wing: 0x9c6a14, horn: 0xffffff, eye: 0x2a5a3a,
    mark: 0x8a5e10,
  },
  sky: {
    label: 'Sky',
    body: { hi: 0x9adcff, mid: 0x4fa8e0, lo: 0x2c6ea8 },
    belly: 0xd8f0ff, wing: 0x24507a, horn: 0xffffff, eye: 0xffe066,
    mark: 0x1c3f5c,
  },
  rose: {
    label: 'Rose',
    body: { hi: 0xffb8d9, mid: 0xe8639f, lo: 0xb03d74 },
    belly: 0xffe0ee, wing: 0x7a2850, horn: 0xfff3cf, eye: 0x6fe0a0,
    mark: 0x8a2a56,
  },
  silver: {
    label: 'Silver',
    body: { hi: 0xf0f0f5, mid: 0xb8bcc8, lo: 0x7c8090 },
    belly: 0xffffff, wing: 0x565a68, horn: 0xffe066, eye: 0x4fa8e0,
    mark: 0x454858,
  },
  moss: {
    label: 'Moss',
    body: { hi: 0xc8e07a, mid: 0x8fae3e, lo: 0x5c7228 },
    belly: 0xeaf2c8, wing: 0x3c4a1a, horn: 0xe8dcc0, eye: 0xff9a5c,
    mark: 0x2c3814,
  },
};

export const COATS = {
  dog: DOG_COATS,
  cat: CAT_COATS,
  bunny: BUNNY_COATS,
  guineaPig: GUINEA_PIG_COATS,
  hamster: HAMSTER_COATS,
  turtle: TURTLE_COATS,
  snake: SNAKE_COATS,
  bird: BIRD_COATS,
  dragon: DRAGON_COATS,
};

// Species-wide pattern lists. A coat may narrow this via its own `patterns`
// field (e.g. a tuxedo cat already has white feet, so 'socks' would be a
// duplicate look).
export const PATTERNS = {
  dog: ['solid', 'patches', 'spots', 'socksAndBlaze'],
  cat: ['solid', 'socks'],
  bunny: ['solid', 'dutch', 'spotted'],
  guineaPig: ['solid', 'triColor', 'crested'],
  hamster: ['solid', 'banded'],
  turtle: ['plain', 'starburst', 'rings', 'speckled'], // shell markings
  snake: ['solid', 'banded'],
  bird: ['solid', 'speckled'],
  dragon: ['smooth', 'scaled'],
};

// Collar colours, in the order they're handed out to look-alikes. Kept few and
// strongly distinct — a kid has to tell them apart across the room.
export const COLLAR_COLORS = [0xdd5555, 0x4b9fc4, 0xf2c96b, 0x6fae5a, 0x9a6fd6, 0xe2872f];

// Last-resort tie-breakers: the small ID marks a real kennel tattoos onto an
// animal so two identical guests can never be mixed up. Two characters, drawn
// as a subtle 3x5-ish glyph pair on the flank (see art/animals.js drawTattoo).
export const TATTOO_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8'];

export function coatsFor(speciesKey) {
  const c = COATS[speciesKey];
  if (!c) throw new Error(`coatsFor: unknown species "${speciesKey}"`);
  return c;
}

// The coat definition an art draw fn should use for `look`. Falls back to the
// species' first coat so stale/unset looks never blank the sprite.
export function coatDef(speciesKey, look) {
  const coats = coatsFor(speciesKey);
  return coats[look?.coat] ?? coats[Object.keys(coats)[0]];
}

export function patternsFor(speciesKey, coatKey) {
  const coat = coatsFor(speciesKey)[coatKey];
  return coat?.patterns ?? PATTERNS[speciesKey];
}

// Every valid coat×pattern combination for a species, in declaration order.
export function combosFor(speciesKey) {
  const out = [];
  for (const coat of Object.keys(coatsFor(speciesKey))) {
    for (const pattern of patternsFor(speciesKey, coat)) out.push({ coat, pattern });
  }
  return out;
}

// How many genuinely distinct looks a species has before collars are needed.
export function distinctLookCount(speciesKey) {
  return combosFor(speciesKey).length;
}

// Stable id for a look, safe to embed in a texture key. Collar/tattoo are only
// included when actually assigned, so an animal that needs no tie-breaker keeps
// the plain "golden-patches" form.
export function lookId(look) {
  if (!look) return 'default-solid';
  let id = `${look.coat}-${look.pattern}`;
  if (look.collar != null) id += `-c${look.collar.toString(16)}`;
  if (look.tattoo) id += `-t${look.tattoo}`;
  return id;
}

// ── Look deck ───────────────────────────────────────────────────────────────
// Same shuffled-deck idea the old hue wheel used, now over coat×pattern
// combinations: every combination is dealt once before any repeats, so two
// animals of the same species can't look alike until the combinations are
// genuinely exhausted. Collars and tattoos are dealt from their own rotating
// decks so a repeat pairing still lands on different tie-breakers.
const state = {}; // speciesKey -> { combos: [], collars: [], tattooAt: number }

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deck(speciesKey) {
  return state[speciesKey] ?? (state[speciesKey] = { combos: [], collars: [], tattooAt: 0 });
}

// Picks this animal's look: a coat + pattern from the species' un-dealt
// combinations, plus the collar colour and ID tattoo it will fall back to if it
// still ends up sharing a look with a kennel-mate (see distinguish.js — these
// are only DRAWN when a tie actually needs breaking).
export function randomLook(speciesKey, rng = Math.random) {
  const s = deck(speciesKey);
  if (s.combos.length === 0) s.combos = shuffle(combosFor(speciesKey), rng);
  if (s.collars.length === 0) s.collars = shuffle(COLLAR_COLORS, rng);
  const { coat, pattern } = s.combos.pop();
  const collar = s.collars.pop();
  const tattoo = TATTOO_IDS[s.tattooAt++ % TATTOO_IDS.length];
  return { coat, pattern, collar, tattoo };
}

// Test/debug hook — forget every dealt combination (a fresh game session).
export function resetLookDecks() {
  for (const k of Object.keys(state)) delete state[k];
}
