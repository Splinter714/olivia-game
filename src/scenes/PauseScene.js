import Phaser from 'phaser';
import { applyDpr, logicalW, logicalH } from '../uiUtils.js';

// Pause overlay (issue #34). Launched by KennelScene's pause button via
// `this.scene.pause(); this.scene.launch('Pause');` — KennelScene is genuinely
// paused while this is up (Phaser simply stops calling its update(), which is
// where the clock/needs/birth timers/wandering all live), while THIS scene
// keeps running in parallel so its own Resume/Reset buttons stay clickable,
// same "always-on-top overlay scene" pattern as HudScene/NotificationScene.
export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create() {
    applyDpr(this, { topLeft: true });
    this._confirming = false;
    this._elements = [];
    this._render();
    this._onResize = () => this._render();
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this._onResize);
      this._clear();
    });
  }

  _clear() {
    this._elements.forEach((el) => el.destroy());
    this._elements = [];
  }

  _button(x, y, w, h, label, onClick) {
    const g = this.add.graphics().setScrollFactor(0).setDepth(20001);
    g.fillStyle(0x415a77, 0.95).fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    g.lineStyle(2, 0xffffff, 0.85).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    const text = this.add.text(x, y, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
    const zone = this.add.zone(x, y, w, h).setScrollFactor(0).setDepth(20002)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', onClick);
    this._elements.push(g, text, zone);
  }

  _render() {
    this._clear();
    const w = logicalW(this), h = logicalH(this);
    const cx = w / 2, cy = h / 2;

    const dim = this.add.graphics().setScrollFactor(0).setDepth(19999);
    dim.fillStyle(0x000000, 0.55).fillRect(0, 0, w, h);
    this._elements.push(dim);

    const panelW = Math.min(320, w - 32);
    const panelH = 240;
    const panel = this.add.graphics().setScrollFactor(0).setDepth(20000);
    panel.fillStyle(0x2a3648, 0.97).fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 14);
    panel.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 14);
    this._elements.push(panel);

    if (!this._confirming) {
      const title = this.add.text(cx, cy - panelH / 2 + 34, '⏸️ Paused', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
      this._elements.push(title);
      this._button(cx, cy - 4, Math.min(240, panelW - 40), 46, '▶️  Resume', () => this._resume());
      this._button(cx, cy + 62, Math.min(240, panelW - 40), 46, '🗑️  Reset Game', () => {
        this._confirming = true;
        this._render();
      });
    } else {
      const msg = this.add.text(cx, cy - panelH / 2 + 40,
        'Are you sure? This erases your\nwhole kennel and starts fresh!', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          align: 'center',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
      this._elements.push(msg);
      this._button(cx, cy + 20, Math.min(240, panelW - 40), 46, 'Yes, start over', () => this._doReset());
      this._button(cx, cy + 82, Math.min(240, panelW - 40), 46, 'Never mind', () => {
        this._confirming = false;
        this._render();
      });
    }
  }

  _resume() {
    this._clear();
    this.scene.resume('Kennel');
    this.scene.stop();
  }

  _doReset() {
    // Delegate to KennelScene._resetGame() rather than clearing the save and
    // reloading here directly — reload() fires 'beforeunload' first, which
    // would otherwise let KennelScene's own autosave handler immediately
    // re-write the save we just cleared (see that method's comment).
    this.scene.get('Kennel')._resetGame();
  }
}
