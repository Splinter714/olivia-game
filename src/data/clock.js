// Pure game clock — no Phaser. Game hours tick at msPerHour real ms each.
// Phases: day 7:00–17:00, evening 17:00–21:00, night 21:00–7:00. Phase B hangs
// arrivals off day+evening; night is the tuck-in phase.

export const MS_PER_GAME_HOUR = 45_000; // 45s per game hour → a full day ≈ 18 min

export const DAY_START = 7;
export const EVENING_START = 17;
export const NIGHT_START = 21;

export const PHASE = { DAY: 'day', EVENING: 'evening', NIGHT: 'night' };

const wrap24 = (h) => ((h % 24) + 24) % 24;

export function phaseForHour(hour) {
  const h = wrap24(hour);
  if (h >= DAY_START && h < EVENING_START) return PHASE.DAY;
  if (h >= EVENING_START && h < NIGHT_START) return PHASE.EVENING;
  return PHASE.NIGHT;
}

// Kid-readable 12-hour label ("8 o'clock"); the HUD's sun/moon icon carries am/pm.
export const formatHour = (hour) => `${((wrap24(Math.floor(hour)) + 11) % 12) + 1} o'clock`;

// Ambient light per phase. Held steady through the phase, crossfaded over the
// hour before each boundary (same hold-then-blend feel as the horse game).
const TINTS = {
  [PHASE.DAY]:     { color: 0xffffff, alpha: 0 },
  [PHASE.EVENING]: { color: 0xff7722, alpha: 0.20 },
  [PHASE.NIGHT]:   { color: 0x1a2255, alpha: 0.42 },
};
const BLEND_HOURS = 1;
const BOUNDARIES = [DAY_START, EVENING_START, NIGHT_START];

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function tintForHour(hourFloat) {
  const h = wrap24(hourFloat);
  const cur = TINTS[phaseForHour(h)];
  let dist = Infinity, next = 0;
  for (const b of BOUNDARIES) {
    const d = (b - h + 24) % 24;
    if (d > 0 && d < dist) { dist = d; next = b; }
  }
  if (dist >= BLEND_HOURS) return { ...cur };
  const target = TINTS[phaseForHour(next)];
  const t = 1 - dist;
  return {
    color: lerpColor(cur.color, target.color, t),
    alpha: cur.alpha + (target.alpha - cur.alpha) * t,
  };
}

// `startDay`/`startHour` let a caller resume a saved game exactly where it
// left off (issue #34's localStorage persistence) instead of always
// beginning at day 1, 8 o'clock.
export function createClock({ msPerHour = MS_PER_GAME_HOUR, startHour = 8, startDay = 1 } = {}) {
  let hourFloat = wrap24(startHour);
  let day = startDay;
  const rollover = () => { while (hourFloat >= 24) { hourFloat -= 24; day += 1; } };
  return {
    get hourFloat() { return hourFloat; },
    get hour() { return Math.floor(hourFloat); },
    get phase() { return phaseForHour(hourFloat); },
    get day() { return day; },
    advance(deltaMs) {
      hourFloat += deltaMs / msPerHour;
      rollover();
    },
    // Jump to the top of the next hour (the HUD clock's tap-to-skip).
    skipToNextHour() {
      hourFloat = Math.floor(hourFloat) + 1;
      rollover();
    },
    // Jump straight to `hour` — the night sequence's morning fast-forward
    // (issue #11) uses this instead of ticking through every intervening
    // hour. Always moves forward: if `hour` isn't later than right now in
    // the current day, it lands on that hour tomorrow instead.
    setHour(hour) {
      const target = wrap24(hour);
      if (target <= hourFloat) day += 1;
      hourFloat = target;
    },
  };
}
