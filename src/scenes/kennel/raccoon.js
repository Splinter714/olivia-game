// The kitchen's treat tray and the raccoon who comes for it (issue #13).
//
// Owns exactly one mechanism: a tray baked at the oven, the periodic "does a
// raccoon show up?" roll, and the whole sneak-in / grab / scamper-out / get-
// scared-off sequence including her crumb trail and the "Nooooooooooo!" pop.
//
// Deliberately NOT in here:
//  * The raccoon's TEXTURES. `buildRaccoonTextures(this)` stays with the rest
//    of the one-shot texture building in KennelScene.create() — that block is
//    kept whole on purpose, so nothing can end up half-built.
//  * The interaction prompts that call in here. `_resolveAct`/`_checkAct` on
//    KennelScene decide when the player can bake, eat a treat, or startle
//    her; this mixin only supplies what happens once they do.
//
// Split out of KennelScene.js as a pure move (issue #83) — every method body
// below is byte-for-byte what it was in that file.
import {
  BACK_WING, WING_DOOR,
} from '../../data/sections.js';
import { TREAT_TRAY_SPOT } from '../../data/props.js';
import { EVENTS } from '../../data/events.js';
import { TREAT_TRAY_KEY } from '../../art/props.js';
import {
  RACCOON_KEYS, RACCOON_SCARED_KEY, CRUMB_KEY, HELD_TREAT_KEY, RACCOON_DISPLAY_SCALE,
} from '../../art/raccoon.js';
import {
  RACCOON_CHECK_INTERVAL, RACCOON_APPROACH_MS, RACCOON_SCAMPER_MS, RACCOON_SCARE_DASH_MS, randomTreat,
} from '../../data/raccoon.js';
import { logicalW, logicalH, worldUiOffset } from '../../uiUtils.js';

export const WithRaccoon = (Base) => class extends Base {
  // Called once from create(), where these three fields used to be assigned
  // inline. Nothing here needs the roster or the world to exist yet.
  buildRaccoon() {
    this.treatTray = null;                        // { treat, sprite } on the kitchen counter, or null
    this._raccoonTimer = RACCOON_CHECK_INTERVAL();
    this._raccoon = null;                          // active scamper visual, or null while she's mid-run
  }

  // ── The kitchen: baking + the raccoon surprise (issue #13) ───────────────
  // Interact at the oven to bake a random treat — no ingredients/recipe, just
  // a satisfying "you baked ___!" and a tray on the counter. Every so often,
  // "not very often" per DESIGN.md, a raccoon check rolls; if a tray is
  // actually out when it fires, she sneaks in to steal it.
  //
  // Owner feedback (2026-07-29), two changes from the original #13 build:
  //  1. She's now ALWAYS visible sneaking in, grabbing the tray, and
  //     scampering off with it (no more 55% "was she seen" roll) — always
  //     carrying the treat and leaving a clear crumb trail.
  //  2. She CAN be scared off now (reversing the original "purely a
  //     surprise, unstoppable" call) — interacting while she's nearby
  //     startles her into fleeing immediately. Catch her before she's grabbed
  //     the tray and the treats are saved outright; scare her mid-getaway and
  //     she drops what she stole.

  _bakeTreat() {
    const treat = randomTreat();
    const sprite = this.add.image(TREAT_TRAY_SPOT.x, TREAT_TRAY_SPOT.y, TREAT_TRAY_KEY)
      .setOrigin(0.5, 1).setDepth(TREAT_TRAY_SPOT.y);
    this.treatTray = { treat, sprite };
    this.game.events.emit(EVENTS.NOTIFY, `You baked ${treat.label}!`);
  }

  // Owner note 2026-07-29: "you should be able to pick them up and eat them,
  // not just have them sit on the floor forever" — the counter's only other
  // fate for a tray was the raccoon stealing it. Eating clears the counter
  // (so a fresh batch can be baked) and is purely a fun flavor beat.
  _eatTreat() {
    const tray = this.treatTray;
    if (!tray) return;
    tray.sprite.destroy();
    this.treatTray = null;
    this.game.events.emit(EVENTS.NOTIFY, `Yum! You ate ${tray.treat.label}!`);
  }

  _updateRaccoon(delta) {
    this._raccoonTimer -= delta;
    if (this._raccoonTimer > 0) return;
    this._raccoonTimer = RACCOON_CHECK_INTERVAL();
    if (this.treatTray && !this._raccoon) this._triggerRaccoon();
  }

  // Where she sneaks in from and flees back out to — the storage-room
  // doorway, same "her way out" point the old scamper used.
  _raccoonExitPoint() {
    const divX = BACK_WING.x + BACK_WING.w / 2;
    return { x: divX, y: (WING_DOOR.y0 + WING_DOOR.y1) / 2 };
  }

  // Phase 1: she sneaks in toward the tray. Nothing's stolen yet — if the
  // player interacts near her during this window (_checkAct),
  // _scareRaccoon() cancels the theft outright.
  _triggerRaccoon() {
    const from = this._raccoonExitPoint();
    const to = { x: TREAT_TRAY_SPOT.x, y: TREAT_TRAY_SPOT.y };

    const sprite = this.add.sprite(from.x, from.y, RACCOON_KEYS[0])
      .setOrigin(0.5, 1).setScale(RACCOON_DISPLAY_SCALE).setDepth(20001).setFlipX(to.x < from.x);
    const raccoon = { sprite, phase: 'approach', scared: false, frame: 0, treatIcon: null };
    this._raccoon = raccoon;
    raccoon.frameTimer = this.time.addEvent({
      delay: 110, loop: true,
      callback: () => {
        raccoon.frame = (raccoon.frame + 1) % RACCOON_KEYS.length;
        sprite.setTexture(RACCOON_KEYS[raccoon.frame]);
        if (raccoon.treatIcon) this._positionHeldTreat(raccoon);
      },
    });

    raccoon.moveTween = this.tweens.add({
      targets: sprite, x: to.x, y: to.y, duration: RACCOON_APPROACH_MS, ease: 'Sine.easeIn',
      onComplete: () => { if (!raccoon.scared) this._raccoonGrabsTreat(raccoon); },
    });
  }

  // Phase 2: she reaches the tray, actually takes it, and scampers back out
  // — always visibly, holding the treat and dropping crumbs the whole way.
  _raccoonGrabsTreat(raccoon) {
    const tray = this.treatTray;
    if (!tray) {
      // The player ate the treats before she reached the counter — she just
      // finds an empty tray and leaves without a scamper/steal beat.
      raccoon.frameTimer?.remove();
      raccoon.sprite.destroy();
      this._raccoon = null;
      return;
    }
    this.treatTray = null;
    tray.sprite.destroy();

    this.game.events.emit(EVENTS.NOTIFY, 'A raccoon stole your treats!');
    this._showNooo();

    raccoon.phase = 'scamper';
    raccoon.treatIcon = this.add.image(raccoon.sprite.x, raccoon.sprite.y, HELD_TREAT_KEY)
      .setScale(2).setDepth(raccoon.sprite.depth + 1);
    this._positionHeldTreat(raccoon);

    const exit = this._raccoonExitPoint();
    raccoon.sprite.setFlipX(exit.x < raccoon.sprite.x);
    raccoon.crumbTimer = this.time.addEvent({ delay: 120, loop: true, callback: () => this._dropCrumb(raccoon) });

    raccoon.moveTween = this.tweens.add({
      targets: raccoon.sprite, x: exit.x, y: exit.y, duration: RACCOON_SCAMPER_MS, ease: 'Sine.easeIn',
      onUpdate: () => { if (raccoon.treatIcon) this._positionHeldTreat(raccoon); },
      onComplete: () => this._cleanupRaccoon(raccoon),
    });
  }

  // Issue #13 follow-up: scare her off. Called from _checkAct when
  // the player is near her and interacts, at any point while she's present.
  _scareRaccoon() {
    const raccoon = this._raccoon;
    if (!raccoon || raccoon.scared) return;
    raccoon.scared = true;
    raccoon.moveTween?.stop();

    const treatsSaved = raccoon.phase === 'approach';
    const sprite = raccoon.sprite;

    // A quick startled flash — the wide-eyed pose with a little pop — before
    // she bolts, so the "you scared her" beat actually reads.
    sprite.setTexture(RACCOON_SCARED_KEY);
    this.tweens.add({ targets: sprite, scale: sprite.scale * 1.25, duration: 90, yoyo: true, ease: 'Quad.easeOut' });

    if (!treatsSaved) this._dropHeldTreat(raccoon);

    this.game.events.emit(EVENTS.NOTIFY,
      treatsSaved ? 'You scared the raccoon away — the treats are safe!' : 'You scared the raccoon away!');

    const exit = this._raccoonExitPoint();
    sprite.setFlipX(exit.x < sprite.x);
    this.time.delayedCall(140, () => {
      if (!this._raccoon) return;
      raccoon.moveTween = this.tweens.add({
        targets: sprite, x: exit.x, y: exit.y, duration: RACCOON_SCARE_DASH_MS, ease: 'Sine.easeIn',
        onComplete: () => this._cleanupRaccoon(raccoon),
      });
    });
  }

  // She drops what she'd already grabbed mid-getaway — it tumbles out of her
  // paws and settles where she was standing, visible proof the player caught
  // her, then fades.
  _dropHeldTreat(raccoon) {
    const icon = raccoon.treatIcon;
    if (!icon) return;
    raccoon.treatIcon = null;
    this.tweens.add({
      targets: icon, y: icon.y + 14, duration: 320, ease: 'Bounce.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: icon, alpha: 0, delay: 500, duration: 500, onComplete: () => icon.destroy() });
      },
    });
  }

  _positionHeldTreat(raccoon) {
    const s = raccoon.sprite;
    const dx = s.flipX ? -1 : 1;
    raccoon.treatIcon.setPosition(s.x + dx * 9, s.y - s.displayHeight * 0.55).setFlipX(s.flipX);
  }

  // Owner feedback (2026-07-29): make the crumb trail read clearly — bigger,
  // more numerous (a shorter drop interval than before), and slower to fade.
  _dropCrumb(raccoon) {
    const s = raccoon.sprite;
    const c = this.add.image(s.x + (Math.random() - 0.5) * 10, s.y - 2, CRUMB_KEY)
      .setScale(0.9 + Math.random() * 0.5).setDepth(s.depth - 1);
    this.tweens.add({ targets: c, alpha: 0, duration: 1400, delay: 500, onComplete: () => c.destroy() });
  }

  _cleanupRaccoon(raccoon) {
    raccoon.frameTimer?.remove();
    raccoon.crumbTimer?.remove();
    raccoon.sprite.destroy();
    raccoon.treatIcon?.destroy();
    if (this._raccoon === raccoon) this._raccoon = null;
  }

  // A big, silly, brief center-screen pop — deliberately more dramatic than
  // the normal bottom-left notification line (DESIGN.md explicitly calls for
  // "a big Nooooooooooo!"). Pure flavor: it fades itself out and never blocks
  // input.
  _showNooo() {
    const off = worldUiOffset(this);
    const cx = off.x + logicalW(this) / 2;
    const cy = off.y + logicalH(this) / 2;
    const text = this.add.text(cx, cy, 'Nooooooooooo!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#ff5544',
      stroke: '#3a1200',
      strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20000).setScale(0.4).setAlpha(0);

    this.tweens.add({
      targets: text, scale: 1.15, alpha: 1, duration: 220, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text, scale: 1.35, alpha: 0, duration: 900, delay: 450, ease: 'Sine.easeIn',
          onComplete: () => text.destroy(),
        });
      },
    });
  }
}
