import Phaser from 'phaser';
import { applyDpr, logicalW, logicalH } from '../uiUtils.js';

// Issue #80: a helper's own player-commanded task menu. Launched by
// KennelScene's _openHelperMenu the same way PauseScene is — KennelScene is
// genuinely paused underneath while this overlay scene runs on top, so its
// own buttons stay clickable (same "always-on-top overlay scene" pattern as
// HudScene/NotificationScene/PauseScene).
//
// Task categories: #80's original two (fill bowls, clean messes) — unchanged
// from #52's automatic behavior, just multi-select and per-helper now — plus
// #81's three-category expansion: opening cages (sending pets out to play or
// home), carrying animals (reception arrivals, checkout hand-offs), and
// births/baby photos/the computer.
const TASK_CATEGORIES = [
  { key: 'bowls', label: 'Fill bowls' },
  { key: 'cleaning', label: 'Clean up messes' },
  { key: 'cages', label: 'Open cages / send home' },
  { key: 'carrying', label: 'Carry animals' },
  { key: 'births', label: 'Births, photos & computer' },
];

// Issue #85 (owner: "make it so I can navigate the helper NPC menus with the
// controller") — mouse/touch already worked via each row's pointerdown zone;
// this adds gamepad AND keyboard navigation as one shared mechanism, since
// both boil down to the exact same thing: move a highlighted row index up
// or down, then confirm it. "Done" is just the last row in that same list —
// no separate button semantics needed for closing that way (owner: "to make
// her stop, you interact and un-select stuff" applies here too — Done is
// reached the same way as any toggle). A dedicated close button/key is ALSO
// wired as a shortcut (owner picked "both" when asked) — HANDLE (gamepad
// button 2, unused by any menu scene) and Escape on keyboard.
const STICK_DEADZONE = 0.4; // coarser than Controls.js's movement deadzone — this only steers a highlight, not a body
const REPEAT_MS = 220; // holding up/down repeats at this rate, so a long list doesn't need a button mash

export default class HelperMenuScene extends Phaser.Scene {
  constructor() {
    super('HelperMenu');
  }

  init(data) {
    this._helper = data.helper;
    // Whichever actor actually opened this (Player 1, or a claimed helper's
    // own player) — defaults to pad 0 if somehow not passed, matching
    // Controls.js's own Player-1 fallback.
    this._gamepadIndex = data.gamepadIndex ?? 0;
  }

  create() {
    applyDpr(this, { topLeft: true });
    this._elements = [];
    // Highlighted row index: 0..TASK_CATEGORIES.length-1 are the toggles,
    // TASK_CATEGORIES.length is "Done" — one flat list, one selection model.
    this._highlight = 0;
    this._repeatTimer = 0;
    this._prevPadDown = { up: false, down: false, confirm: false, close: false };

    this._keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      confirm: Phaser.Input.Keyboard.KeyCodes.ENTER,
      close: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this._render();
    this._onResize = () => this._render();
    this.scale.on('resize', this._onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this._onResize);
      this._clear();
    });
  }

  _pad() {
    const gp = this.input.gamepad;
    const p = gp && gp.total > 0 ? gp.getPad(this._gamepadIndex) : null;
    return p && p.connected ? p : null;
  }

  update(time, delta) {
    const rowCount = TASK_CATEGORIES.length + 1; // + Done
    const pad = this._pad();

    // Up/down: keyboard is edge-triggered per-press via JustDown; gamepad
    // (d-pad or stick) gets its own repeat timer so holding it scrolls
    // instead of requiring a press per row.
    let moveDir = 0;
    if (Phaser.Input.Keyboard.JustDown(this._keys.up)) moveDir = -1;
    else if (Phaser.Input.Keyboard.JustDown(this._keys.down)) moveDir = 1;

    if (pad) {
      const stickY = pad.leftStick?.y ?? 0;
      const padUp = pad.buttons[12]?.pressed || stickY < -STICK_DEADZONE;
      const padDown = pad.buttons[13]?.pressed || stickY > STICK_DEADZONE;
      const justUp = padUp && !this._prevPadDown.up;
      const justDown = padDown && !this._prevPadDown.down;
      if (justUp) { moveDir = -1; this._repeatTimer = REPEAT_MS; }
      else if (justDown) { moveDir = 1; this._repeatTimer = REPEAT_MS; }
      else if (padUp || padDown) {
        this._repeatTimer -= delta;
        if (this._repeatTimer <= 0) { moveDir = padUp ? -1 : 1; this._repeatTimer = REPEAT_MS; }
      } else {
        this._repeatTimer = 0;
      }
      this._prevPadDown.up = padUp;
      this._prevPadDown.down = padDown;
    }

    if (moveDir) {
      this._highlight = (this._highlight + moveDir + rowCount) % rowCount;
      this._render();
    }

    // Confirm: Enter (keyboard) or ACT (gamepad button 0 — issue #75's
    // mapping) on the currently-highlighted row.
    const padConfirmDown = !!pad?.buttons[0]?.pressed;
    const justConfirm = Phaser.Input.Keyboard.JustDown(this._keys.confirm)
      || (padConfirmDown && !this._prevPadDown.confirm);
    this._prevPadDown.confirm = padConfirmDown;
    if (justConfirm) this._activateHighlighted();

    // Dedicated close shortcut: Escape (keyboard) or HANDLE (gamepad button
    // 2) — closes from anywhere, no need to scroll down to Done first.
    const padCloseDown = !!pad?.buttons[2]?.pressed;
    const justClose = Phaser.Input.Keyboard.JustDown(this._keys.close)
      || (padCloseDown && !this._prevPadDown.close);
    this._prevPadDown.close = padCloseDown;
    if (justClose) this._close();
  }

  _activateHighlighted() {
    if (this._highlight === TASK_CATEGORIES.length) {
      this._close();
      return;
    }
    const cat = TASK_CATEGORIES[this._highlight];
    this.scene.get('Kennel')._toggleHelperTask(this._helper, cat.key);
    this._render();
  }

  _clear() {
    this._elements.forEach((el) => el.destroy());
    this._elements = [];
  }

  _button(x, y, w, h, label, onClick, fillColor = 0x415a77, highlighted = false) {
    const g = this.add.graphics().setScrollFactor(0).setDepth(20001);
    g.fillStyle(fillColor, 0.95).fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    // Issue #85: the highlighted row (keyboard/gamepad cursor) gets a bright
    // outline distinct from the ordinary border, so it's readable which row
    // a confirm press will land on — separate from the checked/unchecked
    // fill color, which keeps meaning "is this task on".
    g.lineStyle(highlighted ? 4 : 2, highlighted ? 0xffe066 : 0xffffff, highlighted ? 1 : 0.85)
      .strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);
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
    TASK_CATEGORIES.forEach((cat, i) => {
      const checked = helper.tasks.has(cat.key);
      const rowW = Math.min(272, panelW - 40);
      this._button(cx, y, rowW, rowH, `${checked ? '☑' : '☐'}  ${cat.label}`, () => {
        this.scene.get('Kennel')._toggleHelperTask(helper, cat.key);
        this._render();
      }, checked ? 0x3a6b4a : 0x415a77, this._highlight === i);
      y += rowH + rowGap;
    });

    this._button(cx, cy + panelH / 2 - 38, Math.min(180, panelW - 60), 42, 'Done', () => this._close(),
      0x415a77, this._highlight === TASK_CATEGORIES.length);
  }

  _close() {
    this._clear();
    this.scene.resume('Kennel');
    this.scene.stop();
  }
}
