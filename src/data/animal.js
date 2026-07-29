// Pure animal instance model — no Phaser. `createAnimal()` is the one factory
// issue #4 (arrivals) should call to spawn a real pet, and issue #9 (moms/babies/
// eggs) should extend the pregnancy/egg fields on rather than reshape the object.
import { SPECIES } from './species.js';
import { randomName } from './names.js';

let _nextId = 1;

// Stable, human-debuggable ids ("dog-3") — fine for a single in-memory session;
// persistence (if any) can swap this out without touching call sites.
function nextId(speciesKey) {
  return `${speciesKey}-${_nextId++}`;
}

// Creates a plain-object animal instance for `speciesKey` (must be a key in
// data/species.js's SPECIES). Options let callers pin any field (arrivals may
// want a specific name from the owner, a demo may want a fixed colorVariant);
// anything omitted is randomized/defaulted sensibly.
//
//   createAnimal('dog')
//   createAnimal('turtle', { name: 'Myrtle', hasEggs: true, eggCount: 2 })
//   createAnimal('cat', { stage: 'baby' })
//
// Shape:
//   id            stable unique string, e.g. "dog-3"
//   species       species key
//   name          kid-friendly name (from data/names.js unless overridden)
//   stage         'baby' | 'adult'
//   colorVariant  index into the species' art palette (data/species.js)
//   isPregnant    true if she's expecting but hasn't had babies/eggs yet
//   hasEggs       true for a turtle mom currently sitting on eggs
//   eggCount      number of eggs, when hasEggs
//   babies        array of child animal objects/ids (kittens/puppies/etc. that
//                 stay with mom) — empty unless a family instance sets it
//   upgrades      array of upgrade-kind strings (data/economy.js's
//                 UPGRADE_KINDS) this specific animal has earned across her
//                 repeat visits (issue #12, "Doing a Great Job") — empty for
//                 a brand-new arrival; roster.js grows this on the SAME
//                 animal instance as she cycles through the returning pool.
export function createAnimal(speciesKey, opts = {}) {
  const spec = SPECIES[speciesKey];
  if (!spec) throw new Error(`createAnimal: unknown species "${speciesKey}"`);

  const colorVariant = opts.colorVariant ?? Math.floor(Math.random() * spec.palette.length);

  return {
    id: opts.id ?? nextId(speciesKey),
    species: speciesKey,
    name: opts.name ?? randomName(speciesKey),
    stage: opts.stage ?? 'adult',
    colorVariant,
    isPregnant: opts.isPregnant ?? false,
    hasEggs: opts.hasEggs ?? false,
    eggCount: opts.eggCount ?? 0,
    babies: opts.babies ?? [],
    upgrades: opts.upgrades ?? [],
  };
}
