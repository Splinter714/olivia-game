// Births, the babies' photo, and the reception computer (issues #9, #10, #37).
//
// One chain of events, kept together because each step gates the next: a birth
// timer runs down and flags the mom, the player walks over and interacts to
// actually have the babies/hatch the eggs, photographs them, and only then can
// the computer send the owner the announcement that names them.
//
// Deliberately NOT in here:
//  * `_settledStays()`. It sat right next to this code and reads like birth
//    bookkeeping, but need-ticking and mess-spawning call it too, so it stayed
//    in KennelScene.
//  * The interaction prompts. `_resolveAct`/`_checkAct` and the helper-chore
//    scan on KennelScene decide when the player (or a helper) can trigger a
//    birth, take the photo, or use the computer; this mixin supplies what
//    happens once they do.
//  * The baby sprites themselves — rendering and herding them is
//    `_renderStay`/`_updateBabies`, still in KennelScene.
//
// Split out of KennelScene.js as a pure move (issue #83) — every method body
// below is byte-for-byte what it was in that file.
import Phaser from 'phaser';
import { CAGES, COMPUTER_SPOT } from '../../data/props.js';
import { EVENTS } from '../../data/events.js';
import { tickBirth, attachBirthTimer } from '../../data/births.js';
import { SPECIES, FAMILY } from '../../data/species.js';
import { WAKE_REASON } from '../../data/night.js';
import { createAnimal, BABY_PLACEHOLDER } from '../../data/animal.js';
import { randomName } from '../../data/names.js';
import { LOCATION } from '../../data/roster.js';
import { NEED_KEY } from '../../art/props.js';
import { logicalW, logicalH } from '../../uiUtils.js';

export const WithBirths = (Base) => class extends Base {
  // Called once from create(), where these two fields used to be assigned
  // inline. Nothing here needs the roster or the world to exist yet.
  buildBirths() {
    this._computerNeedIcon = null;
    this._computerBusy = false;
  }

  // ── Births: pregnancy/eggs → babies (issue #9) ───────────────────────────
  // Refinement: the timer expiring no longer completes the birth on its own —
  // it just flags the mom as ready and waiting on the player (a small heart
  // icon, same convention as the food/bathroom/tuck-in bubbles), and the
  // player has to walk over and interact to actually have the babies/hatch
  // the eggs (see _checkAct). Reception/carrying stays don't accrue
  // this — matches _updateNeeds' "only settled stays" rule.

  _updateBirths(delta) {
    for (const stay of this._settledStays()) {
      if (stay.birthTimer == null) continue;
      if (tickBirth(stay, delta)) this._markBirthReady(stay);
    }
  }

  // Flags a stay as ready-and-waiting: her birth timer is done (or a night
  // "having babies" wake-up flagged her early, per DESIGN.md's "sitting
  // alone at night is the secret sign"), but nothing happens until the
  // player walks over and interacts. Idempotent — calling it again while
  // she's already flagged is a no-op, so a repeat night wake-up pick can't
  // re-notify/re-icon her.
  _markBirthReady(stay) {
    if (stay.birthReady) return;
    stay.birthTimer = null;
    stay.birthReady = true;
    this._setNeedIcon(stay, 'babies', true);
    const msg = stay.animal.hasEggs
      ? `${stay.animal.name}'s eggs need your help hatching!`
      : `${stay.animal.name} needs your help — her babies are on the way!`;
    this.game.events.emit(EVENTS.NOTIFY, msg);
  }

  // Turns a turtle/snake mom's eggs into hatchlings, or gives a pregnant mom
  // (any species) 1-2 babies — either way the new babies start unnamed
  // (BABY_PLACEHOLDER) until the player sends the owner an announcement via
  // the reception computer (issue #10), and the stay is flagged so the
  // computer's "needs attention" icon picks it up. Called from
  // _checkAct once the player walks up to a birth-ready stay and
  // interacts — no longer automatic.
  _triggerBirth(stay) {
    if (!stay.birthReady) return;
    stay.birthReady = false;
    stay.birthTimer = null;
    this._setNeedIcon(stay, 'babies', false);
    const rec = this._staySprites.get(stay);
    const pos = rec ? { ...rec.pos } : null;

    let hatchedAway = false;
    if (stay.animal.hasEggs) {
      const count = stay.animal.eggCount;
      // Issue #57: the clutch is in her cage and she may well be off in the
      // yard — the hatchlings belong where the EGGS were, not at her feet
      // wherever she happens to be standing. `babiesAtCage` is what tells
      // _renderStay/_updateBabies to keep the new litter at the cage; it
      // clears itself the moment she's back in it.
      hatchedAway = !!(CAGES[stay.cageIndex] && stay.location !== LOCATION.CAGE);
      stay.babiesAtCage = hatchedAway;
      stay.animal.hasEggs = false;
      stay.animal.eggCount = 0;
      // "Then you take out the shells!" (DESIGN.md) — the cage's egg sprites
      // are simply gone on the next furniture refresh below; no pickup step.
      const babies = Array.from({ length: count }, () =>
        createAnimal(stay.animal.species, { stage: 'baby', name: BABY_PLACEHOLDER }));
      stay.companions = [...stay.companions, ...babies];
      stay.needsAnnouncement = true;
      stay.photoTaken = false; // issue #37: needs a photo taken before she can be announced
      this.game.events.emit(EVENTS.NOTIFY, hatchedAway
        ? `${stay.animal.name}'s eggs are hatching — she's coming back to her cage!`
        : `${stay.animal.name}'s eggs are hatching!`);
    } else if (stay.animal.isPregnant && SPECIES[stay.animal.species].family === FAMILY.EGGS_OR_BABIES) {
      // Owner note 2026-07-29 (issue #31): for an egg-laying species, the
      // next phase after "pregnant" is laying eggs, not live babies
      // appearing immediately — she sits on the eggs and hatching is its
      // own later birth-ready event (the hasEggs branch above). No
      // announcement yet; that's for when babies/hatchlings actually appear.
      stay.animal.isPregnant = false;
      stay.animal.hasEggs = true;
      stay.animal.eggCount = 1 + Math.floor(Math.random() * 3);
      attachBirthTimer(stay); // re-arm for the hatching event
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} laid her eggs!`);
    } else if (stay.animal.isPregnant) {
      stay.animal.isPregnant = false;
      const n = 1 + Math.floor(Math.random() * 2); // 1-2 babies
      const babies = Array.from({ length: n }, () =>
        createAnimal(stay.animal.species, { stage: 'baby', name: BABY_PLACEHOLDER }));
      stay.companions = [...stay.companions, ...babies];
      stay.needsAnnouncement = true;
      stay.photoTaken = false; // issue #37: needs a photo taken before she can be announced
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} is having babies!`);
    } else {
      return; // shouldn't happen — birthTimer only attaches when expecting
    }

    if (pos) this._renderStay(stay, pos.x, pos.y);
    // The clutch just appeared or just vanished — the cage's own egg sprites
    // (and the plate, bowls, litter box) are refreshed from the roster, not
    // from her sprite record, so they need telling.
    this._refreshCageFurniture();

    // Issue #57: her eggs hatched at home while she was out. The hatchlings
    // are waiting in her cage, so she walks back to them under her own power
    // — the same #45 walker nightfall uses. (Without this the litter would
    // sit in an empty cage indefinitely, since a baby can't path through the
    // building on her own.) Skipped if she's already mid-journey somewhere.
    //
    // Issue #77: also skipped for a fish — she has no legs to walk back with.
    // Her hatchlings still wait at her home tank (babiesAtCage above handles
    // that generically), but SHE stays at the pond until the player
    // physically carries her travel tank home; a real, deliberate difference
    // from every other egg-laying species, flagged per the confirmed plan.
    if (hatchedAway && !this._isWalking(stay) && stay.animal.species !== 'fish') this._startWalkHome(stay);

    // If this birth was the night's current "having babies" wake-up (issue
    // #11), it's now resolved on its own — resume toward morning.
    if (this.night.currentWake?.stay === stay && this.night.currentWake.reason === WAKE_REASON.BABIES) {
      this._resolveWakeUp();
    }
  }

  // ── Taking the babies' photo (issue #37) ─────────────────────────────────
  // Owner note 2026-07-29: "can we add something where you actually get to
  // take cute pics of the babies before you send the email?" — walking up to
  // a mom with new babies/hatchlings and interacting snaps a real little
  // photo (a render-texture snapshot of her and her babies' ACTUAL current
  // sprites — coats/collars/tattoos and all, not a generic graphic), with a
  // camera-flash moment for feedback. Only once she's been photographed can
  // the computer actually send her announcement (see _useComputer/
  // _updateComputerIcon's photoTaken gate).
  _takePhoto(stay) {
    if (!stay.needsAnnouncement || stay.photoTaken) return;
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    stay.photoTaken = true;
    this._setNeedIcon(stay, 'photo', false);
    this._updateComputerIcon(); // she may now be the reason the mail icon appears
    this.game.events.emit(EVENTS.NOTIFY, `📸 Snap! Got a great picture of ${stay.animal.name}'s babies!`);

    // Camera flash — a quick full-screen white fade, same oversized-rect
    // trick sleepGfx/tintGfx use for a screen-covering overlay.
    const sw = logicalW(this), sh = logicalH(this);
    const flash = this.add.graphics().setScrollFactor(0).setDepth(10500);
    flash.fillStyle(0xffffff, 1).fillRect(-sw, -sh, sw * 3, sh * 3);
    this.tweens.add({ targets: flash, alpha: 0, duration: 350, ease: 'Sine.easeOut', onComplete: () => flash.destroy() });

    // Snapshot mom + her babies' current sprite frames into a small
    // polaroid-style render texture — a real picture of exactly who's here.
    //
    // Issue #62 gave babies a much longer leash, so "every baby" is no longer
    // safe to frame: the texture is sized to the bounding box of whatever it
    // draws and then shown at scale 1 beside the computer (_useComputer), and
    // a baby off across the yard would blow that polaroid up to yard-sized.
    // Frame whoever's actually gathered round her, and if they're ALL off
    // playing, at least get the nearest one in shot rather than a picture of
    // mom on her own.
    const PHOTO_RADIUS = 150;
    const inShot = (rec.babySprites || [])
      .map((s) => ({ s, d: Phaser.Math.Distance.Between(s.x, s.y, rec.sprite.x, rec.sprite.y) }))
      .sort((a, b) => a.d - b.d);
    const near = inShot.filter(({ d }) => d <= PHOTO_RADIUS).map(({ s }) => s);
    const sprites = [rec.sprite, ...(near.length ? near : inShot.slice(0, 1).map(({ s }) => s))];
    const pad = 12;
    const minX = Math.min(...sprites.map((s) => s.x - s.displayWidth / 2)) - pad;
    const maxX = Math.max(...sprites.map((s) => s.x + s.displayWidth / 2)) + pad;
    const minY = Math.min(...sprites.map((s) => s.y - s.displayHeight)) - pad;
    const maxY = Math.max(...sprites.map((s) => s.y)) + pad * 0.6;
    const w = Math.max(40, maxX - minX), h = Math.max(32, maxY - minY);
    const rt = this.add.renderTexture(0, 0, w, h).setVisible(false);
    rt.fill(0xffffff, 1, 0, 0, w, h); // white polaroid backing
    for (const s of sprites) rt.draw(s, s.x - minX, s.y - minY);
    stay.photoKey = `photo-${stay.animal.id}-${this.time.now}`;
    rt.saveTexture(stay.photoKey);
    rt.destroy();
  }

  // ── The computer: baby announcements (issue #10) ─────────────────────────
  // A simple scripted flow, not a real chat client: interact near the
  // computer while a stay has un-announced babies to send a picture, then a
  // moment later the owner "writes back" with names — auto-picked from
  // data/names.js same as any other arrival — which get applied for real.

  _updateComputerIcon() {
    // Issue #37: only counts as "pending" once her photo's actually taken —
    // otherwise the mail icon would invite a send before there's a picture.
    const anyPending = !this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement && s.photoTaken);
    if (anyPending && !this._computerNeedIcon) {
      this._computerNeedIcon = this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y - 40, NEED_KEY.mail).setDepth(9002);
    } else if (!anyPending && this._computerNeedIcon) {
      this._computerNeedIcon.destroy();
      this._computerNeedIcon = null;
    }
  }

  _useComputer() {
    if (this._computerBusy) return;
    const stay = this.roster.stays.find((s) => s.needsAnnouncement && s.photoTaken);
    if (!stay) return;
    this._computerBusy = true;
    this._updateComputerIcon(); // hide the icon immediately — it's being handled

    // Issue #37: show the actual photo taken at her cage (if the texture's
    // still around — a page reload doesn't persist Phaser textures, only the
    // stay.photoKey string, so this quietly no-ops if it's gone) as a little
    // polaroid popping up beside the monitor while it "sends".
    if (stay.photoKey && this.textures.exists(stay.photoKey)) {
      const img = this.add.image(COMPUTER_SPOT.x - 6, COMPUTER_SPOT.y - 30, stay.photoKey)
        .setOrigin(0.5, 1).setDepth(9600).setScale(0);
      this.tweens.add({
        targets: img, scale: 1, duration: 300, ease: 'Back.easeOut',
        onComplete: () => {
          this.time.delayedCall(1400, () => {
            this.tweens.add({ targets: img, alpha: 0, y: img.y - 16, duration: 400, onComplete: () => img.destroy() });
          });
        },
      });
    }

    this.game.events.emit(EVENTS.NOTIFY, `📷 Sent a picture of the babies to ${stay.animal.name}'s owner!`);
    this.time.delayedCall(1800, () => {
      const unnamed = stay.companions.filter((b) => b.name === BABY_PLACEHOLDER);
      const names = unnamed.map((baby) => {
        baby.name = randomName(baby.species);
        return baby.name;
      });
      stay.needsAnnouncement = false;
      this._computerBusy = false;

      const rec = this._staySprites.get(stay);
      if (rec) this._renderStay(stay, rec.pos.x, rec.pos.y); // redraw with real names + collars

      if (names.length) {
        const list = names.length > 1
          ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
          : names[0];
        this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name}'s owner named the babies: ${list}!`);
      }
    });
  }
}
