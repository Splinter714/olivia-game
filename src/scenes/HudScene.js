import Phaser from 'phaser';
import { applyDpr } from '../uiUtils.js';
import { EVENTS } from '../data/events.js';
import { formatHour, PHASE } from '../data/clock.js';

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
    this._render(this._hour, PHASE.DAY);

    this.game.events.on(EVENTS.HOUR_CHANGE, this._onHourChange, this);
    this.game.events.on(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
    this.events.once('shutdown', () => {
      this.game.events.off(EVENTS.HOUR_CHANGE, this._onHourChange, this);
      this.game.events.off(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
    });

    // Re-anchor the top-left zoom whenever the physical/logical size changes.
    this.scale.on('resize', () => applyDpr(this, { topLeft: true }));
  }

  _onHourChange({ hour, phase }) {
    this._render(hour, phase);
  }

  _onPhaseChange({ phase }) {
    this._render(this._hour, phase);
  }

  _render(hour, phase) {
    this._hour = hour;
    const icon = phase === PHASE.NIGHT ? '🌙' : phase === PHASE.EVENING ? '🌇' : '☀️';
    this.panel.setText(`${icon}  ${formatHour(hour)}`);
  }
}
