import Phaser from 'phaser';
import { applyDpr } from '../uiUtils.js';
import { EVENTS } from '../data/events.js';
import { formatHour, PHASE } from '../data/clock.js';
import { ACTION_COLORS } from '../input/Controls.js';

// Issue #58's interaction prompt, stacked directly under the clock/money
// panel. Top-left was picked over "floating next to the player" deliberately:
// it's always in the same place (a kid learns where to look), it can't drift
// over an animal, a cage or a bowl, and it stays clear of the bottom-left
// notifications, the bottom-right touch buttons and the top-right pause
// button on a phone-sized screen.
const PROMPT_TOP = 58;        // just below the clock panel
const PROMPT_STEP = 34;       // pitch after a full button line
const PROMPT_HINT_STEP = 28;  // pitch after a smaller "hold to..." hint line
// Each line wears its own button's colour (Controls.js owns the values), so a
// touch player can match the line to the button under her thumb.
const hexOf = (action) => `#${(ACTION_COLORS[action] ?? 0x1c1f2e).toString(16).padStart(6, '0')}`;

// Always-on-top HUD, running in parallel with KennelScene. Pinned top-left in
// LOGICAL px (topLeft: true) so it isn't scaled by the world camera's DPR zoom
// — see uiUtils.js's applyDpr for how that's done.
export default class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    applyDpr(this, { topLeft: true });

    this.panel = this.add.text(16, 16, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#1c1f2ecc',
      padding: { x: 12, y: 8 },
    }).setScrollFactor(0).setDepth(9999);

    this._hour = 8; // matches createClock()'s default startHour in KennelScene
    this._phase = PHASE.DAY;
    this._money = 0; // issue #12's running kennel-earnings total, session-only
    this._promptTexts = []; // issue #58: one text object per live prompt line
    this._render();

    this.game.events.on(EVENTS.HOUR_CHANGE, this._onHourChange, this);
    this.game.events.on(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
    this.game.events.on(EVENTS.MONEY_CHANGE, this._onMoneyChange, this);
    this.game.events.on(EVENTS.PROMPTS, this._onPrompts, this);
    this.events.once('shutdown', () => {
      this.game.events.off(EVENTS.HOUR_CHANGE, this._onHourChange, this);
      this.game.events.off(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
      this.game.events.off(EVENTS.MONEY_CHANGE, this._onMoneyChange, this);
      this.game.events.off(EVENTS.PROMPTS, this._onPrompts, this);
    });

    // Re-anchor the top-left zoom whenever the physical/logical size changes.
    this.scale.on('resize', () => applyDpr(this, { topLeft: true }));
  }

  _onHourChange({ hour, phase }) {
    this._hour = hour;
    this._phase = phase;
    this._render();
  }

  _onPhaseChange({ phase }) {
    this._phase = phase;
    this._render();
  }

  _onMoneyChange({ total }) {
    this._money = total;
    this._render();
  }

  // Issue #58: KennelScene sends the whole (short) list whenever it changes —
  // never every frame — so simply rebuilding the lines here is cheap and keeps
  // this scene free of any interaction knowledge of its own. An empty list
  // means no button has anything in range right now, and the area goes blank,
  // which is the intended "there's nothing here" signal.
  _onPrompts(prompts) {
    this._promptTexts.forEach((t) => t.destroy());
    this._promptTexts = [];
    let y = PROMPT_TOP;
    for (const p of prompts || []) {
      this._promptTexts.push(this.add.text(16, y, `${p.button}  ${p.label}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        // Greyed out = "this is what the button is for, but it won't work yet,
        // and the label says why" — distinct from the line being absent.
        color: p.disabled ? '#c9ccd6' : '#ffffff',
        backgroundColor: p.disabled ? '#3a3f52cc' : `${hexOf(p.action)}e6`,
        padding: { x: 12, y: 6 },
      }).setScrollFactor(0).setDepth(9998));
      y += PROMPT_STEP;
      // Issue #59's secondary "hold to pick her up instead" affordance — a
      // smaller, quieter second line under its own button's line, so it reads
      // as extra rather than as another button.
      if (p.hint) {
        this._promptTexts.push(this.add.text(30, y, p.hint, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#dfe3ec',
          backgroundColor: '#1c1f2ecc',
          padding: { x: 10, y: 4 },
        }).setScrollFactor(0).setDepth(9998));
        y += PROMPT_HINT_STEP;
      }
    }
  }

  _render() {
    const icon = this._phase === PHASE.NIGHT ? '🌙' : this._phase === PHASE.EVENING ? '🌇' : '☀️';
    this.panel.setText(`${icon}  ${formatHour(this._hour)}   🪙 ${this._money}`);
  }
}
