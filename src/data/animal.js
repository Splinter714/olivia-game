// Pure animal instance model — no Phaser. `createAnimal()` is the one factory
// issue #4 (arrivals) should call to spawn a real pet, and issue #9 (moms/babies/
// eggs) should extend the pregnancy/egg fields on rather than reshape the object.
import { SPECIES } from './species.js';
import { randomName, registerName } from './names.js';
import { randomLook } from './coats.js';

// Placeholder name shown on a baby's tiny label until the owner names it via
// the reception computer (issue #10). Lives here because it's an `opts.name`
// override for createAnimal below — createAnimal({ name: BABY_PLACEHOLDER }) —
// and because its readers straddle a file boundary (KennelScene's stay
// rendering and its births/computer flow). See issue #83. Deliberately NOT a
// default for `opts.name`: an unnamed baby is a distinct state the computer
// flow filters on, not the normal case.
export const BABY_PLACEHOLDER = '???';

let _nextId = 1;

// Stable, human-debuggable ids ("dog-3") — fine for a single in-memory session;
// persistence (if any) can swap this out without touching call sites.
function nextId(speciesKey) {
  return `${speciesKey}-${_nextId++}`;
}

// Bumps the module-private id counter so a fresh arrival after restoring a
// saved game (issue #34) never collides with a restored animal's own id —
// data/persistence.js calls this once at boot with one past the highest
// numeric suffix found in the save.
export function ensureNextId(minNext) {
  if (minNext > _nextId) _nextId = minNext;
}

// Creates a plain-object animal instance for `speciesKey` (must be a key in
// data/species.js's SPECIES). Options let callers pin any field (arrivals may
// want a specific name from the owner, a demo may want a fixed look);
// anything omitted is randomized/defaulted sensibly.
//
//   createAnimal('dog')
//   createAnimal('turtle', { name: 'Myrtle', hasEggs: true, eggCount: 2 })
//   createAnimal('cat', { stage: 'baby' })
//
// Shape:
//   id            stable unique string, e.g. "dog-3"
//   species       species key
//   name          kid-friendly name (from data/names.js unless overridden) —
//                 guaranteed unique across every animal (data/names.js)
//   stage         'baby' | 'adult'
//   look          { coat, pattern } — a NAMED realistic coat plus a named
//                 marking pattern (data/coats.js). Dealt from a shuffled deck
//                 of every valid combination for the species, so two animals
//                 of the same species can't look alike until the combinations
//                 are genuinely exhausted
//   collar        the collar color this animal falls back to if she DOES end
//                 up sharing a look with a kennel-mate (DESIGN.md's kitten
//                 example). Only actually drawn when needed — see
//                 data/distinguish.js
//   tattoo        the small ID mark she falls back to if the collars are
//                 exhausted too; likewise only drawn when needed
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

  const stage = opts.stage ?? 'adult';
  const dealt = randomLook(speciesKey);
  const look = opts.look ?? { coat: dealt.coat, pattern: dealt.pattern };
  // Adults are always girl names (every grown-up is a potential mom, per
  // DESIGN.md's family system); babies can be a girl or boy name.
  const name = opts.name ?? randomName(speciesKey, undefined, stage);
  // randomName() already registers/reserves names it generates itself —
  // only an explicitly-supplied opts.name still needs registering here.
  if (opts.name) registerName(name);

  return {
    id: opts.id ?? nextId(speciesKey),
    species: speciesKey,
    name,
    stage,
    look,
    collar: opts.collar ?? dealt.collar,
    tattoo: opts.tattoo ?? dealt.tattoo,
    isPregnant: opts.isPregnant ?? false,
    hasEggs: opts.hasEggs ?? false,
    eggCount: opts.eggCount ?? 0,
    babies: opts.babies ?? [],
    upgrades: opts.upgrades ?? [],
  };
}
