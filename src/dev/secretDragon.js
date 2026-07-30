// Secret bonus guest: typing D-R-A-G-O-N anywhere while playing summons a
// one-time mythical baby dragon. Same "obscure input, not a dev-only flag"
// philosophy as dragTool.js's F9 toggle (see that file's own comment) — this
// works in the real, deployed game, not just a dev build; it's just not
// something a player would stumble onto by accident. A single obscure key
// was already spoken for (F9 is dragTool's own toggle), so this uses a typed
// word instead — genuinely unlikely for a kid to hit by chance, but a fun
// "cheat code" once someone (the owner) knows it.
//
// Deliberately simple, matching this being a hidden bonus and not a core
// feature: a rolling buffer of the last CODE.length letter keys typed, no
// modifiers/case-sensitivity to worry about. Owner note 2026-07-29: typing it
// again summons ANOTHER dragon — repeatable, not a one-time thing — so the
// buffer just resets after a hit rather than latching a "found" flag (no
// persistence either way — a page reload resets the buffer, same as
// dragTool's own session-only stance).
const CODE = 'DRAGON';

export const WithSecretDragon = (Base) => class extends Base {
  // Called once from create(), any time after this.input exists.
  buildSecretDragon() {
    this._dragonCodeBuf = '';
    this._onSecretDragonKeyBound = (event) => this._onSecretDragonKey(event);
    this.input.keyboard.on('keydown', this._onSecretDragonKeyBound);
    this.events.once('shutdown', () => this.destroySecretDragon());
  }

  _onSecretDragonKey(event) {
    const key = event.key;
    if (!key || key.length !== 1 || !/[a-zA-Z]/.test(key)) return;
    this._dragonCodeBuf = (this._dragonCodeBuf + key.toUpperCase()).slice(-CODE.length);
    if (this._dragonCodeBuf !== CODE) return;
    this._dragonCodeBuf = ''; // reset so the SAME code can be typed again for another dragon
    // this._triggerSecretDragon is defined on KennelScene itself — this mixin
    // only owns the input detection, not what happens once it fires.
    this._triggerSecretDragon?.();
  }

  destroySecretDragon() {
    if (this._onSecretDragonKeyBound) this.input.keyboard.off('keydown', this._onSecretDragonKeyBound);
    this._onSecretDragonKeyBound = null;
  }
};
