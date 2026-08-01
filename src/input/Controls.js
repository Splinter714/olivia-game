// Unified input for KennelScene — keyboard, gamepad, and touch all feed the SAME
// per-frame movement vector, and mouse/touch taps feed the SAME "walk to this
// world point" request. Nothing in the scene's movement code should touch a raw
// key/pad/pointer directly; read it all through this module (same idea as the
// mech game's Controls.js, simplified: no aim stick, and two plain action
// buttons instead of weapons — this is a tap-to-move kennel game, not a
// twin-stick shooter).
//
// Devices are all first-class and interchangeable: whichever one the player
// touches next just works, no explicit mode switch needed.
import Phaser from 'phaser';
import { dprOf, worldUiOffset, logicalW, logicalH } from '../uiUtils.js';

const STICK_DEADZONE = 0.25;
// Issue #59: how long the handle button has to be held before it means "pick
// her up" instead of its normal tap action. Long enough that a kid's slightly
// slow press still reads as a tap, short enough that the hold doesn't feel
// like waiting. If this turns out to be fiddly in play, the fallback the owner
// can pick is a dedicated key for carrying instead.
const HOLD_MS = 500;
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
// ties broke by invisible registration order. #51 split that into three —
// carry, cage, act.
//
// Issue #58 revision (owner, 2026-07-31): three was one too many. Carry and
// cage are merged back into a single HANDLE button. Two buttons now,
// identical in meaning on all three devices:
//
//   action   keyboard   gamepad        touch
//   handle   E          X (button 2)   🤲 button   animals: open a cage, send a
//                                                  pet home, hold to pick up,
//                                                  put down what you're holding
//   act      Space      A (button 0)   ✨ button   everything else, incl. the scooper
//
// Owner (2026-07-31): swapped A/X back from the #58 mapping above.
//
// This is a partial walk-back of #51 for carry-vs-cage only — but not a return
// to the invisible tie-break that caused the original bugs: the two sets are
// disjoint by an animal's own location (a pet inside a cage is only ever a
// cage-opening target; a loose pet at reception or in the yard is only ever a
// pick-up target), so "standing at an occupied cage opens it" is a rule, not a
// registration-order accident. ACT stays fully separate, which was the
// important half of #51.
//
// Laid out side by side in the bottom-right corner (act in the corner where
// the thumb rests, handle to its left) — compact enough to stay clear of the
// floating joystick on a phone-sized screen.
const BTN = { r: 28, gap: 12, margin: 24 };
const BTN_DEFS = [
  // dx/dy are offsets from the corner anchor, in whole button pitches.
  { id: 'act', icon: '✨', color: 0x8a5a1e, dx: 0, dy: 0 },
  { id: 'handle', icon: '🤲', color: 0x1e4a7a, dx: -1, dy: 0 },
];

// Issue #58: what to CALL each button in the on-screen prompt, per device, so
// the prompt names the control the player is actually holding. See the table
// above.
const BUTTON_NAMES = {
  keyboard: { act: 'Space', handle: 'E' },
  gamepad: { act: 'A', handle: 'X' },
  touch: { act: '✨', handle: '🤲' },
};

// Colours the prompt lines use, one per action — deliberately the same values
// as the touch buttons above so a touch player can match "the blue one" in the
// prompt to the blue button under her thumb.
export const ACTION_COLORS = Object.fromEntries(BTN_DEFS.map((d) => [d.id, d.color]));

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
      handle: Phaser.Input.Keyboard.KeyCodes.E,
    });
    // Edge-detection state, one entry per action (see _justDown).
    this._prevDown = { act: false, handle: false };

    // Issue #58: which device the player last actually used, so the on-screen
    // prompt can name the right button ("Space" vs "A" vs "✨"). Devices stay
    // fully interchangeable — this only affects wording, never what works.
    // Seeded from "is this a touch device", then corrected the instant any
    // real input arrives.
    this.lastDevice = Controls.touchCapable() ? 'touch' : 'keyboard';

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
    this._touchPending = { act: false, handle: false };
    // Issue #59: the handle button distinguishes a tap from a hold, so a
    // finger resting on its on-screen button has to be tracked for as long as
    // it's down rather than fired once on contact. { id, pid, since, fired }.
    this._btnTouch = null;
    // A finished touch press whose verdict is waiting to be read next frame.
    // Needed because a quick tap can go down and up BETWEEN two update ticks —
    // without this the press would simply never be seen.
    this._touchEvent = { handle: null };
    // Key/pad press bookkeeping for _pressEvent (handle only, today).
    this._press = { handle: { down: false, since: 0, fired: false } };
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

  // One graphics object shared by both circles; one text label each.
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
      this._touchPending = { act: false, handle: false };
      this._btnTouch = null;
      this._touchEvent = { handle: null };
    }
  }

  _onPointerDown(p) {
    if (this._suspended) return;
    if (p.wasTouch) this.lastDevice = 'touch';
    const hitId = this._hitActionButton(p);
    if (hitId) {
      // Act fires the instant it goes down. Handle instead tracks the finger
      // staying on the button, because it distinguishes tap from hold
      // (issue #59) — see _pressEvent.
      if (hitId === 'handle') {
        this._btnTouch = { id: hitId, pid: p.id, since: this.scene.time.now, fired: false };
      } else {
        this._touchPending[hitId] = true;
      }
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
    if (this._btnTouch && this._btnTouch.pid === p.id) {
      const t = this._btnTouch;
      this._btnTouch = null;
      // If the hold already fired mid-press there's nothing left to report;
      // otherwise this release was a tap, queued for the next _pressEvent.
      if (!t.fired) this._touchEvent[t.id] = 'tap';
      return;
    }
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
    if (x || y) this.lastDevice = 'keyboard'; // issue #58: prompt wording only

    const pad = this._pad();
    if (pad) {
      const ls = pad.leftStick;
      if (ls && ls.length() > STICK_DEADZONE) {
        x = ls.x; y = ls.y;
        this.lastDevice = 'gamepad';
      } else {
        const dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        const dy = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
        if (dx || dy) { x = dx; y = dy; this.lastDevice = 'gamepad'; }
      }
    }

    if (this._touch?.dragging) {
      const s = this._readStick();
      this._drawRing(s);
      if (s.mag > 0) { x = s.x; y = s.y; this.lastDevice = 'touch'; }
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

  // ── The two one-shot action triggers (issue #51, revised by #58) ─────────
  // Each is edge-triggered and STATEFUL: calling it consumes the press, so the
  // scene must read each exactly once per frame (KennelScene.update does).
  //
  //   handle — animals only: open the cage you're standing at, send a yard pet
  //            home (hold to pick her up instead), put down what you're holding
  //   act    — everything else you're standing next to (feed, clean, help a
  //            birth, take a photo, use the computer, bake/eat, scare the
  //            raccoon, the scooper, going to bed)
  //
  // Each button resolves its OWN nearest target in the scene over only its own
  // class of actions, so the classes can never out-compete each other.
  actJustDown() { return this._justDown('act', 0); }

  // Issue #59: HANDLE is the one button with two meanings, so it reports a
  // TAP or a HOLD instead of a bare "just went down" —
  //   tap  → the default thing here (open this cage / send this pet home /
  //          put down whoever you're holding)
  //   hold → the secondary thing (physically pick a pet up and carry her)
  // Returns 'tap' | 'hold' | null, at most one per press. A tap necessarily
  // resolves on RELEASE (that's the only moment it's known not to be a hold);
  // a hold fires the moment the threshold passes, so it feels like the button
  // "catches" rather than waiting for the finger to come off.
  handleEvent() { return this._pressEvent('handle', 2); }

  _pressEvent(id, padIndex) {
    const now = this.scene.time.now;

    // ── Touch: driven by the pointer handlers, which know the exact moment a
    // finger lands and leaves (and can catch a tap shorter than one frame).
    const queued = this._touchEvent[id];
    if (queued) {
      this._touchEvent[id] = null;
      this.lastDevice = 'touch';
      return queued;
    }
    const bt = this._btnTouch;
    if (bt?.id === id) {
      if (!bt.fired && now - bt.since >= HOLD_MS) {
        bt.fired = true;
        this.lastDevice = 'touch';
        return 'hold';
      }
      return null; // finger still down, not long enough to be a hold yet
    }

    // ── Key / gamepad: polled, so the state machine lives here.
    const pad = this._pad();
    const keyDown = this.keys[id].isDown;
    const padDown = !!pad?.buttons[padIndex]?.pressed;
    const down = keyDown || padDown;
    const st = this._press[id];

    if (down && !st.down) {                       // pressed
      st.down = true;
      st.since = now;
      st.fired = false;
      this.lastDevice = keyDown ? 'keyboard' : 'gamepad';
      return null;
    }
    if (down && !st.fired && now - st.since >= HOLD_MS) { // held long enough
      st.fired = true;
      return 'hold';
    }
    if (!down && st.down) {                       // released
      st.down = false;
      return st.fired ? null : 'tap';             // a hold already fired; don't also tap
    }
    return null;
  }

  // padIndex is the standard-gamepad face button: 0=A, 1=B, 2=X.
  _justDown(id, padIndex) {
    const pad = this._pad();
    const keyDown = this.keys[id].isDown;
    const padDown = !!pad?.buttons[padIndex]?.pressed;
    const down = keyDown || padDown;
    const edge = down && !this._prevDown[id];
    this._prevDown[id] = down;
    const tapped = this._touchPending[id];
    this._touchPending[id] = false;
    // Issue #58: remember which device pressed, purely so the on-screen prompt
    // names the button the player is actually using.
    if (edge) this.lastDevice = keyDown ? 'keyboard' : 'gamepad';
    else if (tapped) this.lastDevice = 'touch';
    return edge || tapped;
  }

  // Issue #58: the on-screen name of one action's button on the device the
  // player last used — "Space"/"E", "X"/"A", or the touch icon.
  buttonName(id) {
    return (BUTTON_NAMES[this.lastDevice] ?? BUTTON_NAMES.keyboard)[id];
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
    this._btns?.[0]?.g.destroy(); // one shared graphics object for both
    this._btns?.forEach((b) => b.label.destroy());
  }
}
