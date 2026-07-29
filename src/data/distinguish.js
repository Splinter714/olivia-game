// Telling look-alikes apart (issue #16). Pure logic, no Phaser.
//
// DESIGN.md: "even if two dogs look exactly the same" — each cage has a name
// tag, "and if two kittens look the same, they get colored collars to tell them
// apart." Coats are dealt from a shuffled deck (data/coats.js) so same-species
// look-alikes are rare, but once a species' combinations are exhausted they do
// recur — and a mom's litter is the common case, since several babies can be in
// the kennel at once.
//
// Escalation, in order:
//   1. nothing — the animal's coat+pattern is already unique in the kennel
//   2. a coloured collar, distinct within the group of look-alikes
//   3. a small ID tattoo (the cruelty-free brand mark real kennels use on large
//      animals; the owner wants it available for the small pets too), on top of
//      the collar, once the collar colours are used up
import { COLLAR_COLORS, TATTOO_IDS, lookId } from './coats.js';

// Given every animal currently present in the kennel, work out who needs a
// tie-breaker. Returns a Map of animal.id -> { collar, tattoo }, where either
// field is null when that animal doesn't need it. Animals whose look is already
// unique get { collar: null, tattoo: null }.
//
// Assignment is stable: within a look-alike group the animals are ordered by
// id, and each takes its own preferred collar (animal.collar, dealt by
// coats.js randomLook) if it's still free, otherwise the next unused colour.
// So adding a new guest never reshuffles the collars already on show.
export function resolveTieBreakers(animals) {
  const groups = new Map(); // `${species}|${lookId}` -> animal[]
  for (const a of animals) {
    if (!a) continue;
    const k = `${a.species}|${lookId(a.look)}`;
    const list = groups.get(k) ?? groups.set(k, []).get(k);
    list.push(a);
  }

  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) {
      for (const a of list) out.set(a.id, { collar: null, tattoo: null });
      continue;
    }
    const ordered = list.slice().sort((p, q) => String(p.id).localeCompare(String(q.id)));
    const usedCollars = new Set();
    // First pass: everyone who can keep their own preferred collar does.
    const collarOf = new Map();
    for (const a of ordered) {
      if (a.collar != null && !usedCollars.has(a.collar) && usedCollars.size < COLLAR_COLORS.length) {
        usedCollars.add(a.collar);
        collarOf.set(a.id, a.collar);
      }
    }
    // Second pass: anyone left takes the next unused colour; once the colours
    // run out we start reusing them and add a tattoo as the real distinguisher.
    const spare = COLLAR_COLORS.filter((c) => !usedCollars.has(c));
    const usedTattoos = new Set();
    let overflow = 0;
    for (const a of ordered) {
      let collar = collarOf.get(a.id) ?? null;
      let tattoo = null;
      if (collar == null) {
        if (spare.length) collar = spare.shift();
        else {
          // Collars exhausted: reuse a colour but add an ID tattoo, which is
          // what actually distinguishes this one. Her own registered ident is
          // used unless a group-mate already has it.
          collar = COLLAR_COLORS[overflow % COLLAR_COLORS.length];
          tattoo = a.tattoo && !usedTattoos.has(a.tattoo)
            ? a.tattoo
            : TATTOO_IDS.find((t) => !usedTattoos.has(t)) ?? TATTOO_IDS[overflow % TATTOO_IDS.length];
          usedTattoos.add(tattoo);
          overflow += 1;
        }
      }
      out.set(a.id, { collar, tattoo });
    }
  }
  return out;
}

// The look object the art should actually draw for `animal`, given the
// tie-breaker map above: her coat/pattern plus a collar and/or tattoo only when
// she needs one. Feeds straight into art/animals.js ensureAnimalTextures().
export function effectiveLook(animal, tieBreakers) {
  const tb = tieBreakers?.get(animal.id);
  return {
    coat: animal.look?.coat,
    pattern: animal.look?.pattern,
    collar: tb?.collar ?? null,
    tattoo: tb?.tattoo ?? null,
  };
}
