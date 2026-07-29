// Night tuck-in / wake-up state machine — pure logic, no Phaser. KennelScene
// owns the actual fade/fast-forward sequencing (issue #11); this module just
// answers "what wakes up, and why", per DESIGN.md's Night Time section: a
// wakeful animal is either having babies, needs the bathroom, had a bad
// dream, or is cold (fabric fell off) — weighted evenly across those four
// reasons, then a present stay that actually fits the chosen reason is
// picked at random.
import { isExpecting } from './births.js';

export const WAKE_REASON = {
  BABIES: 'babies',
  BATHROOM: 'bathroom',
  BAD_DREAM: 'badDream',
  COLD: 'cold',
};

const ALL_REASONS = Object.values(WAKE_REASON);

// Which of the four reasons could plausibly apply to this stay right now.
// A bad dream can happen to anyone; the other three each need matching state
// (expecting a birth, a bathroom need this species tracks, or currently
// tucked in so the fabric has something to fall off of).
export function candidateReasons(stay) {
  const out = [];
  if (isExpecting(stay)) out.push(WAKE_REASON.BABIES);
  if ('bathroom' in (stay.needs || {})) out.push(WAKE_REASON.BATHROOM);
  if (stay.tuckedIn) out.push(WAKE_REASON.COLD);
  out.push(WAKE_REASON.BAD_DREAM);
  return out;
}

// Picks one { stay, reason } wake-up from the present stays. Reasons are
// weighted evenly (not per-animal): shuffle the four reasons, then take the
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
