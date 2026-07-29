// Kid-friendly name pools per species, used by data/animal.js's createAnimal()
// to give every arrival "its own name — the owners name them" (DESIGN.md).
// Cupcake is DESIGN.md's own example dog name, so she's in the dog pool.
export const NAME_POOLS = {
  turtle: [
    'Shelly', 'Speedy', 'Sandy', 'Pebble', 'Myrtle', 'Sheldon',
    'Basil', 'Splash', 'Ziggy', 'Marbles',
  ],
  guineaPig: [
    'Peanut', 'Waffles', 'Popcorn', 'Biscuit', 'Squeaky', 'Marshmallow',
    'Nibbles', 'Pudding', 'Clover', 'Truffle',
  ],
  hamster: [
    'Pip', 'Nugget', 'Acorn', 'Button', 'Peewee', 'Cheeks',
    'Sprinkles', 'Tater', 'Chestnut', 'Bubbles',
  ],
  bunny: [
    'Thumper', 'Clover', 'Cottontail', 'Bramble', 'Snowball', 'Hazel',
    'Fluffy', 'Daisy', 'Buttercup', 'Willow',
  ],
  cat: [
    'Whiskers', 'Mittens', 'Shadow', 'Tiger', 'Luna', 'Oreo',
    'Patches', 'Biscuit', 'Marmalade', 'Pumpkin', 'Smokey', 'Clementine',
  ],
  dog: [
    'Cupcake', 'Buddy', 'Bella', 'Max', 'Daisy', 'Rex',
    'Luna', 'Charlie', 'Coco', 'Duke', 'Sadie', 'Biscuit',
  ],
};

// Picks a random name from a species' pool (falls back to a generic name for an
// unknown key). `rng` is injectable (defaults to Math.random) for future testing/
// determinism needs; dedup against already-used names isn't needed yet — there's
// no persistence until later phases (see the animal.js factory doc comment).
export function randomName(speciesKey, rng = Math.random) {
  const pool = NAME_POOLS[speciesKey] ?? ['Pal'];
  return pool[Math.floor(rng() * pool.length)];
}
