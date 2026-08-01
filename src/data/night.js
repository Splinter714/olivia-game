// Night tuck-in / wake-up state machine — pure logic, no Phaser. KennelScene
// owns the actual fade/fast-forward sequencing (issue #11); this module just
// answers "what wakes up, and why", per DESIGN.md's Night Time section: a
// wakeful animal is either having babies, needs the bathroom, or had a bad
// dream — weighted evenly across those three reasons, then a present stay
// that actually fits the chosen reason is picked at random.
//
// Issue #46: "she's cold (the fabric fell off)" is gone. Every occupied cage
// now always has a blanket and the animal gets under it herself at night, so
// a blanket can't fall off and there'd be nothing for the player to resolve.
import { isExpecting } from './births.js';

export const WAKE_REASON = {
  BABIES: 'babies',
  BATHROOM: 'bathroom',
  BAD_DREAM: 'badDream',
};

const ALL_REASONS = Object.values(WAKE_REASON);

// Which of the three reasons could plausibly apply to this stay right now.
// A bad dream can happen to anyone; the other two each need matching state
// (expecting a birth, or a bathroom need this species tracks).
export function candidateReasons(stay) {
  const out = [];
  // A mom already flagged as "ready and needing the player's help" (issue
  // #9 refinement) doesn't need a fresh wake-up for it — she just waits,
  // no-failure-state style, until the player gets to her.
  if (isExpecting(stay) && !stay.birthReady) out.push(WAKE_REASON.BABIES);
  if ('bathroom' in (stay.needs || {})) out.push(WAKE_REASON.BATHROOM);
  out.push(WAKE_REASON.BAD_DREAM);
  return out;
}

// Picks one { stay, reason } wake-up from the present stays. Reasons are
// weighted evenly (not per-animal): shuffle the three reasons, then take the
// first one that has at least one eligible stay. Returns null only when no
// stay is present at all.
export function pickWakeEvent(presentStays, rng = Math.random) {
  if (!presentStays.length) return null;
  const reasons = [...ALL_REASONS].sort(() => rng() - 0.5);
  for (const reason of reasons) {
    const eligible = presentStays.filter((stay) => candidateReasons(stay).includes(reason));
    if (eligible.length) {
      return { stay: eligible[Math.floor(rng() * eligible.length)], reason };
    }
  }
  return null; // shouldn't happen — a bad dream is always eligible for any present stay
}
