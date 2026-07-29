// Kennel earnings + "doing a great job" upgrades — pure logic, no Phaser.
// DESIGN.md's "Doing a Great Job": owners pay a little money when their pet
// checks out, and a returning guest's owner gives you new stuff (a toy, a
// blanket, favorite treats) so her next stay is visibly nicer than the last.
// Deliberately simple v1: no shop/spending screen — the running total and the
// upgrade flourishes ARE the "you're doing a good job and it shows" feeling
// for this pass; see KennelScene's checkout flow for how these get surfaced
// (reuses the same flag → notify → notify again pattern as the reception
// computer's baby-announcement flow, issue #10's _useComputer).

const BASE_PAYOUT_MIN = 2;
const BASE_PAYOUT_MAX = 4;
const GREAT_CARE_BONUS = 2; // a little extra when nothing was left unmet at checkout

// True if a stay has no lingering unmet need (food/bathroom flags all false)
// at the moment it checks out — DESIGN.md's "took really good care" case.
export function hadGreatCare(stay) {
  return Object.values(stay.needs || {}).every((flag) => !flag);
}

// How much a stay's owner pays on checkout: a small randomized base amount,
// plus a flat bonus for great care. Flavor-weight only, not a real economy.
export function computePayout(stay, rng = Math.random) {
  const base = BASE_PAYOUT_MIN + Math.floor(rng() * (BASE_PAYOUT_MAX - BASE_PAYOUT_MIN + 1));
  return base + (hadGreatCare(stay) ? GREAT_CARE_BONUS : 0);
}

// Session-scoped running total. Not persisted across reloads — nothing else
// in the game survives a reload yet either (see roster.js's pool note).
export function createEconomy() {
  let total = 0;
  return {
    get total() { return total; },
    earn(amount) { total += amount; return total; },
  };
}

// The kinds of "new stuff" a returning guest's owner can give (DESIGN.md:
// "tools, a pet's favorite food, toys, and more"). Kept to a small, kid-legible
// set — each renders as the same small star/sparkle icon in KennelScene, one
// per upgrade earned, so a well-cared-for regular visibly accumulates more of
// them across her repeat visits.
export const UPGRADE_KINDS = ['toy', 'blanket', 'treats'];

const UPGRADE_PHRASE = {
  toy: 'their favorite toy',
  blanket: 'an extra-soft blanket',
  treats: 'their favorite treats',
};

// Picks a new upgrade kind for a returning guest's animal, preferring one she
// doesn't already have (falls back to repeating once she's collected them
// all — a single session realistically won't reach that).
export function pickUpgradeKind(animal, rng = Math.random) {
  const have = new Set(animal.upgrades || []);
  const remaining = UPGRADE_KINDS.filter((k) => !have.has(k));
  const pool = remaining.length ? remaining : UPGRADE_KINDS;
  return pool[Math.floor(rng() * pool.length)];
}

// Kid-readable flavor line for a granted upgrade, following the same plain-
// string NOTIFY convention as every other bottom-left message.
export function upgradeMessage(name, kind) {
  return `${name}'s owner gave you ${UPGRADE_PHRASE[kind] ?? 'something nice'}!`;
}
