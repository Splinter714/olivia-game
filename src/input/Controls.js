// Unified input for KennelScene — keyboard, gamepad, and touch all feed the SAME
// per-frame movement vector, and mouse/touch taps feed the SAME "walk to this
// world point" request. Nothing in the scene's movement code should touch a raw
// key/pad/pointer directly; read it all through this module (same idea as the
// mech game's Controls.js, simplified: no aim stick, no fire buttons — this is a
// tap-to-move kennel game, not a twin-stick shooter).
//
// Devices are all first-class and interchangeable: whichever one the player
// touches next just works, no explicit mode switch needed.
import Phaser from 'phaser';
import { dprOf, worldUiOffset, logicalW, logicalH } from '../uiUtils.js';

const STICK_DEADZONE = 0.25;
const DRAG_THRESHOLD = 12; // screen px of finger travel before a touch becomes a joystick, not a tap

// On-screen joystick feel — same shape as the mech game's TOUCH_STICK dials.
const JOY = { radius: 60, deadzone: 0.15, curve: 1.3 };

// Fixed bottom-right "interact" button — touch has no Space/E/pad-A equivalent
// otherwise, so without this touch-only players could never pick up/drop off/
// feed/tuck in anything. Always visible (not just mid-drag, unlike the joystick
// ring) whenever a touch device is detected.
const INTERACT_BTN = { r: 34, margin: 26 };

export class Controls {
  constructor(scene) {
    this.scene = scene;
    this.keys = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
      downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      interact: Phaser.Input.Keyboard.KeyCodes.SPACE,
      interact2: Phaser.Input.Keyboard.KeyCodes.E,
    });
    this._prevInteractDown = false;

    // Pending "walk here" request from a mouse click or a non-dragging touch tap.
    // The scene consumes it once per request via consumeTapTarget().
    this.tapTarget = null;

    // Live touch-drag state, only ever set on a real touch pointer (never mouse).
    this._touch = null; // { id, origin:{x,y} (logical), point:{x,y} (logical), dragging }
    this.touchStickVisible = Controls.touchCapable();

    // Only the on-screen joystick ring is touch-only; a floating stick appears
    // wherever the finger lands (mirrors the mech game's `floating` dial), so
    // there's no fixed on-screen real estate to reserve.
    this._ring = this.touchStickVisible ? scene.add.graphics().setScrollFactor(0).setDepth(9997) : null;

    // One-shot flag set by a tap/click landing on the interact button; consumed
    // by interactJustDown() alongside Space/E/pad-A.
    this._touchInteractPending = false;
    this._interactBtn = this.touchStickVisible ? this._buildInteractButton() : null;

    scene.input.on('pointerdown', this._onPointerDown, this);
    scene.input.on('pointermove', this._onPointerMove, this);
    scene.input.on('pointerup', this._onPointerUp, this);
    scene.input.on('pointerupoutside', this._onPointerUp, this);
    scene.events.once('shutdown', () => this.destroy());
  }

  static touchCapable() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  }

  _buildInteractButton() {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(9998);
    const label = this.scene.add.text(0, 0, '✋', { fontSize: '30px' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9999);
    return { g, label, x: 0, y: 0, r: INTERACT_BTN.r };
  }

  // Re-anchors the button to the bottom-right corner every frame (cheap, and
  // keeps it correct across a resize/DPR change without a separate listener).
  _layoutInteractButton() {
    const btn = this._interactBtn;
    if (!btn) return;
    const off = worldUiOffset(this.scene);
    btn.x = off.x + logicalW(this.scene) - INTERACT_BTN.margin;
    btn.y = off.y + logicalH(this.scene) - INTERACT_BTN.margin;
    btn.g.clear();
    btn.g.fillStyle(0x2a3648, 0.55).fillCircle(btn.x, btn.y, btn.r);
    btn.g.lineStyle(3, 0xffffff, 0.85).strokeCircle(btn.x, btn.y, btn.r);
    btn.label.setPosition(btn.x, btn.y);
  }

  // Same origin/off math as _drawRing's pointer→logical conversion, just
  // compared against the button's fixed centre instead of a drag origin.
  _hitInteractButton(p) {
    const btn = this._interactBtn;
    if (!btn) return false;
    const dpr = dprOf(this.scene);
    const off = worldUiOffset(this.scene);
    const px = p.x / dpr + off.x, py = p.y / dpr + off.y;
    return Math.hypot(px - btn.x, py - btn.y) <= btn.r * 1.3; // generous touch target
  }

  _onPointerDown(p) {
    if (this._hitInteractButton(p)) {
      this._touchInteractPending = true;
      return; // never let this also start a joystick drag or a tap-to-move
    }
    if (p.wasTouch) {
      if (this._touch) return; // one finger drives the stick at a time
      this._touch = { id: p.id, origin: { x: p.x, y: p.y }, point: { x: p.x, y: p.y }, dragging: false };
    } else {
      this._mouseDown = { x: p.x, y: p.y };
    }
  }

  _onPointerMove(p) {
    if (this._touch && this._touch.id === p.id) {
      this._touch.point = { x: p.x, y: p.y };
      const dist = Phaser.Math.Distance.Between(this._touch.origin.x, this._touch.origin.y, p.x, p.y);
      if (dist > DRAG_THRESHOLD) this._touch.dragging = true;
    }
  }

  _onPointerUp(p) {
    if (this._touch && this._touch.id === p.id) {
      if (!this._touch.dragging) this._setTapTarget(p.x, p.y); // quick tap, no drag → walk there
      this._touch = null;
      this._ring?.clear();
      return;
    }
    if (!p.wasTouch && this._mouseDown) {
      this._setTapTarget(p.x, p.y);
      this._mouseDown = null;
    }
  }

  _setTapTarget(screenX, screenY) {
    const world = this.scene.cameras.main.getWorldPoint(screenX, screenY);
    this.tapTarget = { x: world.x, y: world.y };
  }

  _pad() {
    const gp = this.scene.input.gamepad;
    const p = gp && gp.total > 0 ? gp.getPad(0) : null;
    return p && p.connected ? p : null;
  }

  // Continuous move vector this frame, magnitude <= 1. Combines keyboard, gamepad
  // (left stick, falling back to the d-pad), and an active touch-drag stick — any
  // nonzero source wins over "no input", and a direct steer cancels a pending
  // tap-to-move walk (handled by the scene reading mag > 0 to drop its nav path).
  getMove() {
    this._layoutInteractButton();
    const k = this.keys;
    let x = (k.right.isDown || k.rightArrow.isDown ? 1 : 0) - (k.left.isDown || k.leftArrow.isDown ? 1 : 0);
    let y = (k.down.isDown || k.downArrow.isDown ? 1 : 0) - (k.up.isDown || k.upArrow.isDown ? 1 : 0);

    const pad = this._pad();
    if (pad) {
      const ls = pad.leftStick;
      if (ls && ls.length() > STICK_DEADZONE) {
        x = ls.x; y = ls.y;
      } else {
        const dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        const dy = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
        if (dx || dy) { x = dx; y = dy; }
      }
    }

    if (this._touch?.dragging) {
      const s = this._readStick();
      this._drawRing(s);
      if (s.mag > 0) { x = s.x; y = s.y; }
    } else {
      this._ring?.clear();
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    return { x, y, mag: Math.min(mag, 1) };
  }

  _readStick() {
    const { origin, point } = this._touch;
    const dx = point.x - origin.x, dy = point.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: 0, y: 0, mag: 0 };
    const raw = Math.min(1, dist / JOY.radius);
    if (raw <= JOY.deadzone) return { x: 0, y: 0, mag: 0 };
    const t = (raw - JOY.deadzone) / (1 - JOY.deadzone);
    const mag = Math.pow(t, JOY.curve);
    const ux = dx / dist, uy = dy / dist;
    return { x: ux * mag, y: uy * mag, mag };
  }

  _drawRing(stick) {
    if (!this._ring) return;
    const dpr = dprOf(this.scene);
    const off = worldUiOffset(this.scene);
    const { origin, point } = this._touch;
    const ox = origin.x / dpr + off.x, oy = origin.y / dpr + off.y;
    const dx = (point.x - origin.x) / dpr, dy = (point.y - origin.y) / dpr;
    const dist = Math.hypot(dx, dy);
    const kr = JOY.radius / dpr;
    const clampK = dist > kr ? kr / dist : 1;
    this._ring.clear();
    this._ring.lineStyle(3, 0xffffff, 0.35).strokeCircle(ox, oy, kr);
    this._ring.fillStyle(0xffffff, stick.mag > 0 ? 0.55 : 0.3).fillCircle(ox + dx * clampK, oy + dy * clampK, kr * 0.45);
  }

  // One-shot "interact/confirm" trigger (kept simple — Phase B's feeding/tucking-in
  // interactions will read this). Space/E on keyboard, A on gamepad, or a tap on
  // the on-screen touch button.
  interactJustDown() {
    const pad = this._pad();
    const down = this.keys.interact.isDown || this.keys.interact2.isDown || !!pad?.buttons[0]?.pressed;
    const justDown = down && !this._prevInteractDown;
    this._prevInteractDown = down;
    const btnJustDown = this._touchInteractPending;
    this._touchInteractPending = false;
    return justDown || btnJustDown;
  }

  // Consumes and clears a pending mouse-click/touch-tap "walk here" request.
  consumeTapTarget() {
    const t = this.tapTarget;
    this.tapTarget = null;
    return t;
  }

  // Drop any in-progress touch drag / pending tap without acting on it — used
  // when the scene itself decides to cancel navigation (e.g. direct steer).
  clearTapTarget() {
    this.tapTarget = null;
  }

  destroy() {
    this.scene.input.off('pointerdown', this._onPointerDown, this);
    this.scene.input.off('pointermove', this._onPointerMove, this);
    this.scene.input.off('pointerup', this._onPointerUp, this);
    this.scene.input.off('pointerupoutside', this._onPointerUp, this);
    this._ring?.destroy();
    this._interactBtn?.g.destroy();
    this._interactBtn?.label.destroy();
  }
}
