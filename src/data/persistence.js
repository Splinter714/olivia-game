// localStorage persistence (issue #34) — plain-JSON save of everything needed
// to resume exactly where the player left off: every stay in the roster
// (animal instance, needs/timers, bowl stock, birth timer, companions/
// babies/eggs, cage location/slot, carry kind, arrival/checkout day),
// the returning-guest pool (so returning guests keep their identity/visit
// count), the running earnings total, the clock's day/hour, and the yard
// divider's current position.
//
// Deliberately simple: no versioning/migration machinery ("a personal kid's
// game", not a shipped product with real save compatibility needs) — if a
// saved blob doesn't parse cleanly against the shape we expect, loadGame()
// just returns null and the caller starts fresh rather than crashing.
//
// Pure data module, no Phaser — KennelScene assembles the plain snapshot
// object from its own roster/economy/clock/yardDividerY and hands it to
// saveGame(); on boot it calls loadGame() and, if non-null, uses it to
// rehydrate those same pieces (see createRoster's `saved` param, createClock's
// startDay/startHour, createEconomy's initialTotal).
import { registerName } from './names.js';
import { ensureNextId } from './animal.js';

const SAVE_KEY = 'kennelGame.save.v1';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable (private browsing, quota, etc.) — losing the
    // save is not worth crashing a kid's game over.
  }
}

// Returns the parsed save, or null if there's nothing there, it's corrupt, or
// it doesn't look like the shape we expect. Callers should treat null exactly
// like "no save yet" and start fresh — never throw on a bad/missing save.
export function loadGame() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.stays) || !Array.isArray(data.pool)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// Re-registers every restored animal's name (data/names.js's global
// uniqueness set) and bumps data/animal.js's id counter past the highest
// restored id, so a FRESH arrival after loading a save can never collide
// with a name or id a restored animal already holds. Call once, right after
// loadGame() returns non-null and before createRoster()/any new arrivals.
export function seedGlobalNameState(saved) {
  let maxNum = 0;
  const visit = (animal) => {
    if (!animal) return;
    if (animal.name) registerName(animal.name);
    const m = /-(\d+)$/.exec(animal.id || '');
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    (animal.babies || []).forEach(visit);
  };
  for (const stay of saved.stays || []) {
    visit(stay.animal);
    (stay.companions || []).forEach(visit);
  }
  for (const entry of saved.pool || []) visit(entry.animal);
  ensureNextId(maxNum + 1);
}
