import Phaser from 'phaser';
import { applyDpr, logicalW, logicalH } from '../uiUtils.js';

// Issue #80: a helper's own player-commanded task menu. Launched by
// KennelScene's _openHelperMenu the same way PauseScene is — KennelScene is
// genuinely paused underneath while this overlay scene runs on top, so its
// own buttons stay clickable (same "always-on-top overlay scene" pattern as
// HudScene/NotificationScene/PauseScene).
//
// Task categories are unchanged from #52's automatic behavior — fill bowls
// (cage + yard) and clean messes — just multi-select and per-helper now
// instead of always-on. Opening cages, carrying, births/photos/the computer
// are deliberately NOT here; those are issue #81, which depends on this one.
const TASK_CATEGORIES = [
  { key: 'bowls', label: 'Fill bowls' },
  { key: 'cleaning', label: 'Clean up messes' },
];

export default class HelperMenuScene extends Phaser.Scene {
  constructor() {
    super('HelperMenu');
  }

  init(data) {
    this._helper = data.helper;
  }

  create() {
    applyDpr(this, { topLeft: true });
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

  _button(x, y, w, h, label, onClick, fillColor = 0x415a77) {
    const g = this.add.graphics().setScrollFactor(0).setDepth(20001);
    g.fillStyle(fillColor, 0.95).fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);
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
    const helper = this._helper;

    const dim = this.add.graphics().setScrollFactor(0).setDepth(19999);
    dim.fillStyle(0x000000, 0.55).fillRect(0, 0, w, h);
    this._elements.push(dim);

    const rowH = 50, rowGap = 12;
    const panelW = Math.min(320, w - 32);
    const panelH = 96 + TASK_CATEGORIES.length * (rowH + rowGap) + 56;
    const panel = this.add.graphics().setScrollFactor(0).setDepth(20000);
    panel.fillStyle(0x2a3648, 0.97).fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 14);
    panel.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 14);
    this._elements.push(panel);

    const title = this.add.text(cx, cy - panelH / 2 + 34, `${helper.name}'s Tasks`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
    this._elements.push(title);

    const hint = this.add.text(cx, cy - panelH / 2 + 58, 'Pick any — she only does what you turn on', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#c9d4e3',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
    this._elements.push(hint);

    let y = cy - panelH / 2 + 34 + 58;
    for (const cat of TASK_CATEGORIES) {
      const checked = helper.tasks.has(cat.key);
      const rowW = Math.min(272, panelW - 40);
      this._button(cx, y, rowW, rowH, `${checked ? '☑' : '☐'}  ${cat.label}`, () => {
        this.scene.get('Kennel')._toggleHelperTask(helper, cat.key);
        this._render();
      }, checked ? 0x3a6b4a : 0x415a77);
      y += rowH + rowGap;
    }

    this._button(cx, cy + panelH / 2 - 38, Math.min(180, panelW - 60), 42, 'Done', () => this._close());
  }

  _close() {
    this._clear();
    this.scene.resume('Kennel');
    this.scene.stop();
  }
}
