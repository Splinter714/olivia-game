// Central catalog of cross-scene game-event names (passed through the GLOBAL
// emitter, `this.game.events`). Constants instead of bare strings so emit/on/off
// can't drift apart on a typo.
export const EVENTS = {
  // A new game hour began: payload { hour, phase, day }. Phase B arrival rolls
  // hang off this ("at least one animal arrives every hour", day+evening only).
  HOUR_CHANGE: 'hour-change',

  // Day phase changed: payload { phase, isNight }.
  PHASE_CHANGE: 'phase-change',

  // A short kid-readable line to show bottom-left for a few seconds, e.g.
  // "Cupcake arrived!" (DESIGN.md's recurring bottom-left message pattern —
  // arrivals/checkouts today, "having babies"/potty call-outs in later issues).
  // Payload: a plain string, the message text. Handled by NotificationScene.
  NOTIFY: 'notify',

  // The running kennel-earnings total changed (issue #12): payload
  // { total }. HudScene's coin readout listens for this the same way it
  // listens for HOUR_CHANGE.
  MONEY_CHANGE: 'money-change',

  // Issue #58: what each action button would do RIGHT NOW. Payload: an array
  // (possibly empty) of { action, button, label, hint, disabled } in a stable
  // act → handle order, emitted by KennelScene only when the set actually
  // changes, and rendered by HudScene under the clock. An action missing from
  // the array means "that button has nothing in range" — the difference
  // between "nothing here" and "you pressed the wrong button" is the whole
  // point, so never pad the list with placeholder entries.
  PROMPTS: 'prompts',
};
