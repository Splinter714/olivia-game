// Unified input for KennelScene — keyboard, gamepad, and touch all feed the SAME
// per-frame movement vector, and mouse/touch taps feed the SAME "walk to this
// world point" request. Nothing in the scene's movement code should touch a raw
// key/pad/pointer directly; read it all through this module (same idea as the
// mech game's Controls.js, simplified: no aim stick, and three plain action
// buttons instead of weapons — this is a tap-to-move kennel game, not a
// twin-stick shooter).
//
// Devices are all first-class and interchangeable: whichever one the player
// touches next just works, no explicit mode switch needed.
import Phaser from 'phaser';
import { dprOf, worldUiOffset, logicalW, logicalH } from '../uiUtils.js';

const STICK_DEADZONE = 0.25;
const DRAG_THRESHOLD = 12; // screen px of finger travel before a touch becomes a joystick, not a tap

// On-screen joystick feel — same shape as the mech game's TOUCH_STICK dials.
const JOY = { radius: 60, deadzone: 0.15, curve: 1.3 };

// Fixed bottom-right action cluster — touch has no keyboard/gamepad equivalent
// otherwise, so without these touch-only players could never pick up/drop off/
// feed/open a cage. Always visible (not just mid-drag, unlike the joystick
// ring) whenever a touch device is detected.
//
// Issue #51: there used to be ONE button here (and one `interactJustDown()`),
// which meant every interaction in the game competed for the same press and
// ties broke by invisible registration order. There are three now — carry,
// cage, act — identical in meaning on all three input devices:
//
//   action   keyboard   gamepad        touch
//   act      Space      A (button 0)   ✨ button
//   carry    E          X (button 2)   🤲 button
//   cage     Q          B (button 1)   🚪 button
//
// Laid out as an L-cluster anchored to the bottom-right corner (act in the
// corner where the thumb rests, carry to its left, cage above it) — compact
// enough to stay clear of the floating joystick on a phone-sized screen.
const BTN = { r: 28, gap: 12, margin: 24 };
const BTN_DEFS = [
  // dx/dy are offsets from the corner anchor, in whole button pitches.
  { id: 'act', icon: '✨', color: 0x8a5a1e, dx: 0, dy: 0 },
  { id: 'carry', icon: '🤲', color: 0x1e4a7a, dx: -1, dy: 0 },
  { id: 'cage', icon: '🚪', color: 0x1e5a34, dx: 0, dy: -1 },
];

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
      act: Phaser.Input.Keyboard.KeyCodes.SPACE,
      carry: Phaser.Input.Keyboard.KeyCodes.E,
      cage: Phaser.Input.Keyboard.KeyCodes.Q,
    });
    // Edge-detection state, one entry per action (see _justDown).
    this._prevDown = { act: false, carry: false, cage: false };

    // Known Phaser gamepad quirk (already hit and fixed in the sibling mech game,
    // its input/Controls.js #122/#524): each Scene gets its own GamepadPlugin, and
    // a freshly-created pad wrapper stamps `_created` at "now". Gamepad.update()
    // then refuses to sync button/axis state until the NATIVE pad's timestamp
    // moves past that cutoff — which only happens on a genuinely new hardware
    // state change. A controller that was already connected (very common for
    // Bluetooth/USB pads on iPad — often paired before the page even loads) and
    // is then held steady reads as permanently all-zero, i.e. "not working".
    // Force an unconditional resync for every pad already known at construction,
    // and for any pad that connects mid-scene.
    for (const pad of scene.input.gamepad?.getAll?.() ?? []) pad._created = 0;
    scene.input.gamepad?.on?.('connected', (pad) => { pad._created = 0; });

    // Pending "walk here" request from a mouse click or a non-dragging touch tap.
    // The scene consumes it once per request via consumeTapTarget().
    this.tapTarget = null;

    // Dev-drag tool (src/dev/dragTool.js): while suspended, pointer-driven
    // tap-to-move/touch-stick input is ignored so a drag on a draggable prop
    // can't also walk the player — keyboard/gamepad movement (getMove()) is
    // untouched, since it never reads pointer state.
    this._suspended = false;

    // Live touch-drag state, only ever set on a real touch pointer (never mouse).
    this._touch = null; // { id, origin:{x,y} (logical), point:{x,y} (logical), dragging }
    this.touchStickVisible = Controls.touchCapable();

    // Only the on-screen joystick ring is touch-only; a floating stick appears
    // wherever the finger lands (mirrors the mech game's `floating` dial), so
    // there's no fixed on-screen real estate to reserve.
    this._ring = this.touchStickVisible ? scene.add.graphics().setScrollFactor(0).setDepth(9997) : null;

    // One-shot flags set by a tap/click landing on an action button; each is
    // consumed by its own *JustDown() alongside that action's key/pad button.
    this._touchPending = { act: false, carry: false, cage: false };
    this._btns = this.touchStickVisible ? this._buildActionButtons() : null;

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

  // One graphics object shared by all three circles; one text label each.
  _buildActionButtons() {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(9998);
    return BTN_DEFS.map((def) => ({
      ...def,
      label: this.scene.add.text(0, 0, def.icon, { fontSize: '26px' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(9999),
      x: 0,
      y: 0,
      r: BTN.r,
      g,
    }));
  }

  // Re-anchors the cluster to the bottom-right corner every frame (cheap, and
  // keeps it correct across a resize/DPR change without a separate listener).
  _layoutActionButtons() {
    const btns = this._btns;
    if (!btns) return;
    const off = worldUiOffset(this.scene);
    const ax = off.x + logicalW(this.scene) - BTN.margin - BTN.r;
    const ay = off.y + logicalH(this.scene) - BTN.margin - BTN.r;
    const pitch = BTN.r * 2 + BTN.gap;
    const g = btns[0].g;
    g.clear();
    for (const btn of btns) {
      btn.x = ax + btn.dx * pitch;
      btn.y = ay + btn.dy * pitch;
      g.fillStyle(btn.color, 0.6).fillCircle(btn.x, btn.y, btn.r);
      g.lineStyle(3, 0xffffff, 0.85).strokeCircle(btn.x, btn.y, btn.r);
      btn.label.setPosition(btn.x, btn.y);
    }
  }

  // Same origin/off math as _drawRing's pointer→logical conversion, just
  // compared against each button's fixed centre instead of a drag origin.
  // Returns the action id that was hit, or null. Touch targets are grown a
  // little, so the nearest centre wins rather than letting two overlap.
  _hitActionButton(p) {
    if (!this._btns) return null;
    const dpr = dprOf(this.scene);
    const off = worldUiOffset(this.scene);
    const px = p.x / dpr + off.x, py = p.y / dpr + off.y;
    let hit = null, bestD = Infinity;
    for (const btn of this._btns) {
      const d = Math.hypot(px - btn.x, py - btn.y);
      if (d <= btn.r * 1.25 && d < bestD) { bestD = d; hit = btn.id; }
    }
    return hit;
  }

  // See _suspended above. Called by the dev-drag tool when it toggles on/off.
  setSuspended(v) {
    this._suspended = v;
    if (v) {
      this._touch = null;
      this._mouseDown = null;
      this.tapTarget = null;
      this._ring?.clear();
      this._touchPending = { act: false, carry: false, cage: false };
    }
  }

  _onPointerDown(p) {
    if (this._suspended) return;
    const hitId = this._hitActionButton(p);
    if (hitId) {
      this._touchPending[hitId] = true;
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
    if (this._suspended) return;
    if (this._touch && this._touch.id === p.id) {
      this._touch.point = { x: p.x, y: p.y };
      const dist = Phaser.Math.Distance.Between(this._touch.origin.x, this._touch.origin.y, p.x, p.y);
      if (dist > DRAG_THRESHOLD) this._touch.dragging = true;
    }
  }

  _onPointerUp(p) {
    if (this._suspended) return;
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
    this._layoutActionButtons();
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

  // ── The three one-shot action triggers (issue #51) ───────────────────────
  // Each is edge-triggered and STATEFUL: calling it consumes the press, so the
  // scene must read each exactly once per frame (KennelScene.update does).
  //
  //   act   — do the thing you're standing next to (feed, clean, help a birth,
  //           take a photo, use the computer, bake/eat, scare the raccoon, bed)
  //   carry — pick up / put down an animal, pick up / set down the scooper
  //   cage  — open a cage and let its occupant take herself out
  //
  // Each button resolves its OWN nearest target in the scene over only its own
  // class of actions, so the classes can never out-compete each other.
  actJustDown() { return this._justDown('act', 0); }
  carryJustDown() { return this._justDown('carry', 2); }
  cageJustDown() { return this._justDown('cage', 1); }

  // padIndex is the standard-gamepad face button: 0=A, 1=B, 2=X.
  _justDown(id, padIndex) {
    const pad = this._pad();
    const down = this.keys[id].isDown || !!pad?.buttons[padIndex]?.pressed;
    const edge = down && !this._prevDown[id];
    this._prevDown[id] = down;
    const tapped = this._touchPending[id];
    this._touchPending[id] = false;
    return edge || tapped;
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
    this._btns?.[0]?.g.destroy(); // one shared graphics object for all three
    this._btns?.forEach((b) => b.label.destroy());
  }
}
