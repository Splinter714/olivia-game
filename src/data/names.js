// Kid-friendly name pools per species, used by data/animal.js's createAnimal()
// to give every arrival "its own name — the owners name them" (DESIGN.md).
// Cupcake is DESIGN.md's own example dog name, so she's in the dog pool.
//
// Owner's rule: every grown-up is a mom (DESIGN.md's whole family/babies system
// is mom-centered), so adults always get a girl name; babies can be a girl OR a
// boy name — see randomName()'s `stage` param.
//
// Jackson/Olivia occasionally suggest specific names to add to the pools (not
// tied to a species or gender) — added to the girl side (so they're available
// to adults too) on every species: "Eenie Beanie", "Jelly Bean", "Billie",
// "Jeanstew".
//
// Names must never repeat across the whole game ("no two animals should ever
// share a name") — see randomName()/registerName() below for how that's
// enforced, including once a pool has been used up.
export const NAME_POOLS = {
  turtle: {
    girl: [
      'Shelly', 'Myrtle', 'Sheila', 'Coral', 'Terra', 'Sandy',
      'Pebble', 'Sunny', 'Marbles', 'Mossy', 'Puddle', 'Splash',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Speedy', 'Sheldon', 'Basil', 'Ziggy', 'Tortellini', 'Turbo',
      'Crush', 'Finn', 'Rocky', 'Slowpoke', 'Flipper', 'Gravel',
    ],
  },
  guineaPig: {
    girl: [
      'Marshmallow', 'Pudding', 'Clover', 'Cinnamon', 'Muffin', 'Cocoa',
      'Ginger', 'Nutmeg', 'Honey', 'Butterscotch', 'Truffle', 'Dumpling',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Peanut', 'Waffles', 'Popcorn', 'Biscuit', 'Squeaky', 'Nibbles',
      'Pretzel', 'Pumpernickel', 'Wiggles', 'Snickers', 'Sprout', 'Chip',
    ],
  },
  hamster: {
    girl: [
      'Sprinkles', 'Bubbles', 'Chestnut', 'Bean', 'Wobbles', 'Cricket',
      'Sesame', 'Button', 'Cheeks', 'Snickerdoodle', 'Tumbles', 'Pip',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Nugget', 'Acorn', 'Peewee', 'Tater', 'Squirt', 'Pretzel',
      'Scooter', 'Peanut', 'Gizmo', 'Nibbler', 'Runt', 'Whiskers',
    ],
  },
  bunny: {
    girl: [
      'Clover', 'Hazel', 'Fluffy', 'Daisy', 'Buttercup', 'Willow',
      'Dandelion', 'Marigold', 'Rosie', 'Clementine', 'Fern', 'Juniper',
      'Poppy', 'Meadow', 'Honeybun', 'Cottontail',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Thumper', 'Bramble', 'Snowball', 'Pepper', 'Bramblewood', 'Bounce',
      'Cotton', 'Chestnut',
    ],
  },
  cat: {
    girl: [
      'Mittens', 'Luna', 'Marmalade', 'Pumpkin', 'Clementine', 'Willow',
      'Salem', 'Cleo', 'Tabitha', 'Nutmeg', 'Boots', 'Dusty',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Whiskers', 'Shadow', 'Tiger', 'Oreo', 'Patches', 'Biscuit',
      'Smokey', 'Jasper', 'Milo', 'Ziggy', 'Peanut', 'Marbles',
    ],
  },
  dog: {
    girl: [
      'Cupcake', 'Bella', 'Daisy', 'Luna', 'Coco', 'Sadie',
      'Rosie', 'Maple', 'Honey', 'Olive', 'Pepper',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Buddy', 'Max', 'Rex', 'Charlie', 'Duke', 'Biscuit',
      'Winston', 'Peanut', 'Scout', 'Ranger', 'Waffles', 'Gus', 'Bear',
    ],
  },
  snake: {
    girl: [
      'Noodle', 'Ribbon', 'Sable', 'Jade', 'Autumn', 'Sassy',
      'Kiwi', 'Mocha', 'Ember', 'Sierra', 'Cinder', 'Onyx',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Slinky', 'Fang', 'Rusty', 'Monty', 'Gordon',
      'Zippy', 'Rope', 'Cobra', 'Diesel', 'Loki',
    ],
  },
  bird: {
    girl: [
      'Sunny', 'Skye', 'Robin', 'Piper', 'Sparrow', 'Feather',
      'Chirpy', 'Daisy', 'Coco', 'Marigold', 'Breezy',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Pip', 'Sky', 'Tweety', 'Rio', 'Peep', 'Kiwi',
      'Blue', 'Sunshine', 'Percy',
    ],
  },
  // Issue #28: lizards — sunny, scaly, snack-shaped names in the same
  // kid-friendly register as everyone else's.
  lizard: {
    girl: [
      'Emerald', 'Lizzie', 'Amber', 'Mango', 'Dottie', 'Pesto',
      'Zuzu', 'Tangerine', 'Pebbles', 'Sunbeam', 'Twiggy', 'Lime',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Iggy', 'Spike', 'Chomper', 'Newt', 'Scales',
      'Rango', 'Pancake', 'Mochi', 'Dash', 'Sprig',
    ],
  },
  // Secret bonus guest (src/dev/secretDragon.js) — playful storybook-dragon
  // names, same girl/boy shape as every other species.
  dragon: {
    girl: [
      'Ember', 'Sparkle', 'Opal', 'Jade', 'Ruby', 'Marigold', 'Nova', 'Saffron',
      'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
    ],
    boy: [
      'Blaze', 'Cinder', 'Wisp', 'Rumble', 'Ash', 'Flicker', 'Storm', 'Ziggy', 'Sparky', 'Cobalt',
    ],
  },
};

const FALLBACK_POOL = { girl: ['Pal'], boy: ['Pal'] };

// Small prefix bank used to synthesize a fresh unique name once a pool's
// whole set has been handed out (e.g. "Little Cupcake") — see randomName().
const PREFIXES = ['Little', 'Baby', 'Sir', 'Lady', 'Mini', 'Sweet', 'Fancy', 'Wild', 'Silly', 'Tiny'];

// Every name ever handed out (from a pool OR synthesized), across all
// species — names must be globally unique, not just unique per species.
const usedNames = new Set();

// Per-species-per-stage shuffled queue, drained WITHOUT refilling — once a
// pool is exhausted, randomName() falls through to synthesizing new names
// instead of repeating it. Adults draw only from `girl`; babies draw from
// `girl` + `boy` combined (a baby can be either).
const queues = {};

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The raw name list a given species/stage draws from — adults are always
// girl names (every grown-up is a potential mom, per DESIGN.md's family
// system); babies can be a girl or boy name.
function poolFor(speciesKey, stage) {
  const entry = NAME_POOLS[speciesKey] ?? FALLBACK_POOL;
  return stage === 'baby' ? [...entry.girl, ...entry.boy] : entry.girl;
}

function queueFor(speciesKey, stage, rng) {
  const qkey = `${speciesKey}:${stage === 'baby' ? 'baby' : 'adult'}`;
  if (!queues[qkey]) queues[qkey] = shuffle(poolFor(speciesKey, stage), rng);
  return queues[qkey];
}

// Marks `name` as taken so it can never be handed out again — call this for
// any explicitly-supplied name (e.g. data/animal.js's opts.name) so manual
// names can't collide with a later random pick.
export function registerName(name) {
  usedNames.add(name);
}

// Synthesizes a fresh, never-used name once a pool is drained: tries
// "<prefix> <base>" combos drawn from that species/stage's own pool, then
// falls back to "<base> <counter>" if every combo is somehow already taken
// (astronomically unlikely, but keeps this provably terminating).
function synthesizeName(speciesKey, stage, rng) {
  const basePool = poolFor(speciesKey, stage);
  for (let attempt = 0; attempt < 200; attempt++) {
    const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    const base = basePool[Math.floor(rng() * basePool.length)];
    const candidate = `${prefix} ${base}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  const base = basePool[Math.floor(rng() * basePool.length)];
  let counter = 2;
  let candidate = `${base} ${counter}`;
  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${base} ${counter}`;
  }
  return candidate;
}

// Picks a never-before-used name for `speciesKey` (falls back to a generic
// pool for an unknown key). `stage` picks the pool: 'adult' (default) draws
// girl names only; 'baby' draws from girl + boy names combined. Draws from
// the species/stage's shuffled pool first; once drained, synthesizes a fresh
// name instead of repeating. `rng` is injectable (defaults to Math.random)
// for future testing/determinism needs. Every name returned is registered
// before it's handed back, so it can never be picked again (by this call, a
// different stage's queue, or a manual opts.name).
export function randomName(speciesKey, rng = Math.random, stage = 'adult') {
  const queue = queueFor(speciesKey, stage, rng);
  while (queue.length) {
    const candidate = queue.pop();
    if (!usedNames.has(candidate)) {
      registerName(candidate);
      return candidate;
    }
    // else: this exact string was already registered (e.g. by the other
    // stage's queue, or manually via opts.name) — skip it and keep draining.
  }
  const name = synthesizeName(speciesKey, stage, rng);
  registerName(name);
  return name;
}
