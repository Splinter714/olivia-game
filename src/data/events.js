// Central catalog of cross-scene game-event names (passed through the GLOBAL
// emitter, `this.game.events`). Constants instead of bare strings so emit/on/off
// can't drift apart on a typo.
export const EVENTS = {
  // A new game hour began: payload { hour, phase, day }. Phase B arrival rolls
  // hang off this ("at least one animal arrives every hour", day+evening only).
  HOUR_CHANGE: 'hour-change',

  // Day phase changed: payload { phase, isNight }.
  PHASE_CHANGE: 'phase-change',
};
