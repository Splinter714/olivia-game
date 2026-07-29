// Kid-friendly name pools per species, used by data/animal.js's createAnimal()
// to give every arrival "its own name — the owners name them" (DESIGN.md).
// Cupcake is DESIGN.md's own example dog name, so she's in the dog pool.
//
// Names must never repeat across the whole game ("no two animals should ever
// share a name") — see randomName()/registerName() below for how that's
// enforced, including once a species' whole pool has been used up.
// Jackson/Olivia occasionally suggest specific names to add to the pools
// (not tied to a species) — spread across all six so any of them can turn
// up on any kind of pet: "Eenie Beanie", "Jelly Bean", "Billie", "Jeanstew".
export const NAME_POOLS = {
  turtle: [
    'Shelly', 'Speedy', 'Sandy', 'Pebble', 'Myrtle', 'Sheldon',
    'Basil', 'Splash', 'Ziggy', 'Marbles', 'Tortellini', 'Sunny',
    'Turbo', 'Crush', 'Sheila', 'Gravel', 'Mossy', 'Finn',
    'Rocky', 'Coral', 'Slowpoke', 'Puddle', 'Terra', 'Flipper',
    'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
  ],
  guineaPig: [
    'Peanut', 'Waffles', 'Popcorn', 'Biscuit', 'Squeaky', 'Marshmallow',
    'Nibbles', 'Pudding', 'Clover', 'Truffle', 'Cinnamon', 'Muffin',
    'Cocoa', 'Ginger', 'Pretzel', 'Nutmeg', 'Honey', 'Pumpernickel',
    'Wiggles', 'Snickers', 'Butterscotch', 'Sprout', 'Dumpling', 'Chip',
    'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
  ],
  hamster: [
    'Pip', 'Nugget', 'Acorn', 'Button', 'Peewee', 'Cheeks',
    'Sprinkles', 'Tater', 'Chestnut', 'Bubbles', 'Squirt', 'Pretzel',
    'Bean', 'Scooter', 'Wobbles', 'Peanut', 'Gizmo', 'Nibbler',
    'Runt', 'Snickerdoodle', 'Tumbles', 'Cricket', 'Sesame', 'Whiskers',
    'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
  ],
  bunny: [
    'Thumper', 'Clover', 'Cottontail', 'Bramble', 'Snowball', 'Hazel',
    'Fluffy', 'Daisy', 'Buttercup', 'Willow', 'Dandelion', 'Marigold',
    'Rosie', 'Pepper', 'Clementine', 'Bramblewood', 'Fern', 'Juniper',
    'Bounce', 'Cotton', 'Poppy', 'Chestnut', 'Meadow', 'Honeybun',
    'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
  ],
  cat: [
    'Whiskers', 'Mittens', 'Shadow', 'Tiger', 'Luna', 'Oreo',
    'Patches', 'Biscuit', 'Marmalade', 'Pumpkin', 'Smokey', 'Clementine',
    'Jasper', 'Willow', 'Milo', 'Ziggy', 'Nutmeg', 'Salem',
    'Cleo', 'Boots', 'Tabitha', 'Peanut', 'Dusty', 'Marbles',
    'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
  ],
  dog: [
    'Cupcake', 'Buddy', 'Bella', 'Max', 'Daisy', 'Rex',
    'Luna', 'Charlie', 'Coco', 'Duke', 'Sadie', 'Biscuit',
    'Rosie', 'Winston', 'Peanut', 'Scout', 'Maple', 'Ranger',
    'Pepper', 'Waffles', 'Gus', 'Honey', 'Bear', 'Olive',
    'Eenie Beanie', 'Jelly Bean', 'Billie', 'Jeanstew',
  ],
};

// Small prefix bank used to synthesize a fresh unique name once a species'
// whole pool has been handed out (e.g. "Little Cupcake") — see randomName().
const PREFIXES = ['Little', 'Baby', 'Sir', 'Lady', 'Mini', 'Sweet', 'Fancy', 'Wild', 'Silly', 'Tiny'];

// Every name ever handed out (from a pool OR synthesized), across all
// species — names must be globally unique, not just unique per species.
const usedNames = new Set();

// Per-species shuffled queue drawn from NAME_POOLS, drained WITHOUT refilling
// — once a species' pool is exhausted, randomName() falls through to
// synthesizing new names instead of repeating the pool.
const queues = {};

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function queueFor(speciesKey, rng) {
  if (!queues[speciesKey]) {
    const pool = NAME_POOLS[speciesKey] ?? ['Pal'];
    queues[speciesKey] = shuffle(pool, rng);
  }
  return queues[speciesKey];
}

// Marks `name` as taken so it can never be handed out again — call this for
// any explicitly-supplied name (e.g. data/animal.js's opts.name) so manual
// names can't collide with a later random pick.
export function registerName(name) {
  usedNames.add(name);
}

// Synthesizes a fresh, never-used name once a species' pool is drained:
// tries "<prefix> <base>" combos drawn from that species' original pool,
// then falls back to "<base> <counter>" if every combo is somehow already
// taken (astronomically unlikely, but keeps this provably terminating).
function synthesizeName(speciesKey, rng) {
  const basePool = NAME_POOLS[speciesKey] ?? ['Pal'];
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
// pool for an unknown key). Draws from that species' shuffled pool first;
// once the pool is drained, synthesizes a fresh name instead of repeating.
// `rng` is injectable (defaults to Math.random) for future testing/
// determinism needs. Every name returned is registered before it's handed
// back, so it can never be picked again (by this call or a manual opts.name).
export function randomName(speciesKey, rng = Math.random) {
  const queue = queueFor(speciesKey, rng);
  while (queue.length) {
    const candidate = queue.pop();
    if (!usedNames.has(candidate)) {
      registerName(candidate);
      return candidate;
    }
    // else: this exact string was already registered (e.g. manually via
    // opts.name before any random draw) — skip it and keep draining.
  }
  const name = synthesizeName(speciesKey, rng);
  registerName(name);
  return name;
}
