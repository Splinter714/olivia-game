import Phaser from 'phaser';
import { applyDpr, logicalH } from '../uiUtils.js';
import { EVENTS } from '../data/events.js';

const DURATION_MS = 3200;
const LINE_GAP = 6;
const LINE_H = 34;

// Shared bottom-left notification queue (DESIGN.md's recurring "Cupcake
// arrived!" / "Cupcake is having babies!" / "Cupcake needs to go to the
// bathroom!" bottom-left message pattern). Any scene fires one by emitting
// `EVENTS.NOTIFY` on the GLOBAL emitter with a plain string:
//
//   this.game.events.emit(EVENTS.NOTIFY, 'Cupcake arrived!');
//
// Lines stack upward from the bottom-left and fade out after a few seconds.
// Runs as its own always-on-top scene (parallel to HudScene) so future issues
// (#7 potty, #9 births, #13 …) can reuse it without threading it through
// KennelScene/HudScene state.
export default class NotificationScene extends Phaser.Scene {
  constructor() {
    super('Notification');
  }

  create() {
    applyDpr(this, { topLeft: true });
    this._lines = []; // { obj, timer }

    this.game.events.on(EVENTS.NOTIFY, this._onNotify, this);
    this.events.once('shutdown', () => this.game.events.off(EVENTS.NOTIFY, this._onNotify, this));

    this.scale.on('resize', () => {
      applyDpr(this, { topLeft: true });
      this._relayout();
    });
  }

  _onNotify(text) {
    if (typeof text !== 'string' || !text) return;
    const obj = this.add.text(16, 0, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#1c1f2ecc',
      padding: { x: 12, y: 7 },
    }).setScrollFactor(0).setDepth(9999);

    const entry = { obj };
    entry.timer = this.time.delayedCall(DURATION_MS, () => {
      obj.destroy();
      this._lines = this._lines.filter((e) => e !== entry);
      this._relayout();
    });
    this._lines.push(entry);
    this._relayout();
  }

  _relayout() {
    const baseY = logicalH(this) - 24;
    // Newest line lowest, older lines stack upward above it.
    this._lines.forEach((entry, i) => {
      const fromBottom = this._lines.length - 1 - i;
      entry.obj.y = baseY - fromBottom * (LINE_H + LINE_GAP) - LINE_H;
    });
  }
}
