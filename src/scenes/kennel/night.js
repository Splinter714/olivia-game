// Nightfall, tucking in, and the sleep sequence (issues #11 / #45 / #46 / #58).
//
// Owns one mechanism end to end: the PHASE_CHANGE handler that starts and ends
// the night, the per-frame settle pass that walks stragglers home and puts
// them under their blankets, the "everyone's asleep" go-ahead, and the fade-to-
// black sleep sequence with its wake-ups.
//
// Deliberately NOT in here:
//  * The EVENT WIRING. KennelScene.create() still does
//    `this.game.events.on(EVENTS.PHASE_CHANGE, this._onPhaseChange, this)` and
//    the matching `off` in its shutdown handler. `_onPhaseChange` stays an
//    ordinary prototype method for exactly that reason — turning it into an
//    arrow/bound function here would stop the `off` from matching and leak a
//    handler on every scene restart.
//  * Going to bed. The bed's own prompt lives in KennelScene's `_resolveAct`/
//    `_checkAct`; it calls `_beginSleep()` here once the player acts.
//  * The fish's travel tank and the pond tally (`_refreshTravelTank`,
//    `_fishAtPondCount`). They sat physically next to this code in the old
//    file but have no night caller at all — they belong to carrying/fish
//    placement and stayed in KennelScene.
//
// Split out of KennelScene.js as a pure move (issue #83) — every method body
// below is byte-for-byte what it was in that file.
import Phaser from 'phaser';
import { CAGES } from '../../data/props.js';
import { DAY_START } from '../../data/clock.js';
import { EVENTS } from '../../data/events.js';
import { pickWakeEvent, WAKE_REASON } from '../../data/night.js';
import { LOCATION } from '../../data/roster.js';
import { BLANKET_KEY, WATERPROOF_COVER_KEY } from '../../art/props.js';
import { logicalW, logicalH } from '../../uiUtils.js';

// Night sequence timings (issue #11) — the screen fades to black once
// everyone's tucked in, fades back for each wake-up so the player can act,
// then fades out again to keep "sleeping" until morning.
const SLEEP_FADE_MS = 900;
const WAKE_FADE_MS = 500;
const RESOLVE_FADE_MS = 700;
const BAD_DREAM_MS = 2600; // flavor-only wake-up: no fix needed, just settles back down

export const WithNight = (Base) => class extends Base {
  // Called from create() at exactly the point these assignments used to sit —
  // BEFORE _refreshCageArt(), which needs this.night to already exist (see
  // create()'s own comment there).
  buildNight() {
    this.night = {
      active: false,       // true from NIGHT phase start until morning resumes
      allSettled: false,   // fires the "Everyone's asleep!" transition once (issue #45: every pet home in her cage)
      sleeping: false,     // mid fade-to-black / wake-up / fade-back sequence
      wakeUpsRemaining: 0,
      currentWake: null,   // { stay, reason } awaiting player resolution, or null
    };
    // Full-screen "asleep" overlay, same oversized-rect trick as tintGfx;
    // sleepAlpha is a plain tweened number, not a Phaser property, so any
    // tween can drive it directly.
    this.sleepGfx = this.add.graphics().setScrollFactor(0).setDepth(10000);
    this.sleepAlpha = 0;
  }

  // ── Night: tuck-in, staying awake, wake-ups (issue #11) ──────────────────
  // At NIGHT_START every present animal needs tucking in (DESIGN.md's small
  // fabric sheet); once the last one is tucked, the player "goes to sleep"
  // too — a fade to black, then either a wake-up (having babies / needs the
  // bathroom / bad dream / cold) that fades back in for the player to
  // handle, or a fade back to a fast-forwarded morning if nothing wakes her.

  _presentStays() {
    return this.roster.stays.filter((s) => s.location === LOCATION.CAGE);
  }

  // Issue #58: the phase is now AUTHORITATIVE in both directions, on a real
  // tick and on a resumed save alike. It used to handle only the way in
  // (`if (syncOnly) return; if (isNight) this._startNight();`), which left two
  // real holes:
  //
  //  * Sunrise did nothing. `night.active` was cleared in exactly ONE place —
  //    the end of the sleep sequence — so a player who never went to bed (or
  //    couldn't; see _checkAllSettled and the bed prompt) kept `night.active`
  //    forever. _updateNightSettle then re-tucked every pet every frame, in
  //    broad daylight, and nothing could untuck them. Owner, 2026-07-31: "it
  //    seems like pets are still stuck under their blankets in the morning."
  //  * A save resumed AT NIGHT never started the night at all (the syncOnly
  //    bail), so nobody tucked in, "Everyone's asleep!" never fired, and the
  //    bed was never interactable — the night could only be waited out. And a
  //    save resumed in DAYLIGHT that was written at night still carried
  //    `stay.tuckedIn` (it's plain JSON on the stay), so those pets stayed
  //    under their blankets forever too.
  //
  // The syncOnly bail is gone: syncing the night to the phase is exactly what
  // a resume wants now that tucking in is automatic and instant (issue #46
  // removed the player-driven tuck-in sequence the bail was protecting).
  // Going to bed remains the way to SKIP AHEAD to morning, not the only way
  // morning can happen.
  _onPhaseChange({ isNight }) {
    if (isNight) this._startNight();
    else this._endNight();
  }

  _startNight() {
    this.night.active = true;
    this.night.allSettled = false;
    this.night.sleeping = false;
    this.night.wakeUpsRemaining = 0;
    this.night.currentWake = null;
    // Issue #45: nobody gets teleported indoors anymore — anyone still out
    // in the yard walks herself back to her own cage, and issue #46's
    // blanket goes over her automatically once she's home. Both are driven
    // per frame by _updateNightSettle, so a pet let out AFTER nightfall (a
    // dog who needs the bathroom) also walks herself home again when she's
    // done, rather than being stuck outside.
    this._updateNightSettle();
  }

  // Morning, however it arrives (issue #58): the clock simply reaching 7 is
  // enough — going to bed is a shortcut TO here, not a prerequisite FOR it.
  // Everyone climbs back out from under her blanket on her own (issue #46) and
  // the night's bookkeeping resets, so nothing can keep re-tucking pets in
  // daylight or leave a stale "it's night" flag behind.
  _endNight() {
    // The sleep sequence sets the clock to morning itself and finishes its own
    // fade (see _nightTick) — don't yank the state out from under it mid-fade.
    if (this.night.sleeping) return;
    this.night.active = false;
    this.night.allSettled = false;
    this.night.wakeUpsRemaining = 0;
    this.night.currentWake = null;
    // Unconditional, not gated on night.active: a save written at night and
    // resumed in daylight restores `stay.tuckedIn` straight out of the JSON
    // with no night in progress at all, and those pets still need waking up.
    for (const stay of this.roster.stays) this._untuck(stay);
  }

  // Per-frame night housekeeping (issue #45 #6 + issue #46): walk stragglers
  // home, put everyone who's home under her blanket, and work out whether
  // the player can go to bed yet.
  _updateNightSettle() {
    if (!this.night.active) return;
    // Deliberately runs even while the screen is black: a dog let out during
    // a wake-up still needs to walk herself home and get back under her
    // blanket before morning, and the player can't see her do it anyway.
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.YARD) continue;
      if (this.activePlayers.some((a) => a.carrying === stay) || this._isWalking(stay)) continue;
      // Issue #77: a fish at the pond never walks herself home (_startWalkHome
      // itself no-ops for her too, but skip her with `continue` rather than
      // `break` here — otherwise she'd be re-picked as "this frame's
      // candidate" every single frame forever, silently starving every OTHER
      // yard animal behind her in the list from ever getting walked home).
      // She just waits, awake, at the pond until the player carries her
      // travel tank back — see _checkAllSettled's matching exemption (she's
      // never in _presentStays(), which is cage-only, so she's simply not
      // part of the "everyone tucked in" tally either).
      if (stay.animal.species === 'fish') continue;
      // A dog who still needs to go finishes her business first (issue #38 —
      // she does it right where she's playing after a short while); she
      // heads home on a later pass, once her need has cleared.
      if (stay.needs.bathroom) continue;
      this._startWalkHome(stay);
      // One per frame: routing a walk runs a grid A* (data/path.js), and
      // kicking off a yard-full of them in the same frame would hitch. They
      // trickle in over the next few frames instead, which also reads better
      // than the whole yard turning for the door in lockstep.
      break;
    }
    for (const stay of this._presentStays()) {
      if (this._isWalking(stay)) continue;
      this._tuckIn(stay);
    }
    this._checkAllSettled();
  }

  // Issue #46 (owner: "have there always be a blanket available in the cage
  // and the animal automatically gets under it at night and out of it in the
  // morning on its own"): every occupied cage always shows a blanket —
  // folded on the cage floor by day, draped over her once she's under it at
  // night. There's no tuck-in interaction and no "needs tucking" bubble
  // anymore; `stay.tuckedIn` now just means "she's under it right now", set
  // automatically at nightfall and cleared in the morning.
  _refreshBlanket(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    const cage = CAGES[stay.cageIndex];
    if (!cage) { // no cage of her own yet (fresh arrival out in the yard)
      rec.blanket?.destroy();
      rec.blanket = null;
      return;
    }
    // Issue #77 (owner: "a piece of waterproof fabric"): a fish's cage gets a
    // FITTED cover instead of the ordinary draped blanket every other
    // species gets — a blanket doesn't work over a tank of water. Same
    // tuckedIn state/beat, same day-folded/night-covering swap below, just a
    // different texture and (since it has to fit the TANK, not drape over
    // however big she is) a fixed size/position keyed off the cage rather
    // than her sprite.
    const isFish = stay.animal.species === 'fish';
    const key = isFish ? WATERPROOF_COVER_KEY : BLANKET_KEY;
    if (!rec.blanket) rec.blanket = this.add.image(0, 0, key).setOrigin(0.5, 0.5);
    const img = rec.blanket;
    if (stay.tuckedIn && stay.location === LOCATION.CAGE) {
      if (isFish) {
        // Stretched flat over the whole tank footprint, above even the
        // glass-cover foreground rim (CAGE_FG depth, cage.y + cage.h + 5 —
        // see _refreshCageArt) so it reads as covering the tank completely.
        img.setPosition(cage.x + cage.w / 2, cage.y + cage.h * 0.6);
        img.setDisplaySize(cage.w * 0.72, cage.h * 0.5);
        img.setDepth(cage.y + cage.h + 6);
      } else {
        // Draped over her, wherever in her cage she actually settled — she
        // stops wandering the instant she's under it (_updateWander's tuckedIn
        // check), so this position stays right all night. One blanket covers
        // her companions too (eggs/babies "wrapped" with her, per DESIGN.md),
        // since they share her cage spot.
        img.setPosition(rec.sprite.x, rec.sprite.y - rec.sprite.displayHeight * 0.32);
        img.setDisplaySize(rec.sprite.displayWidth * 1.3, rec.sprite.displayHeight * 0.85);
        img.setDepth(rec.sprite.depth + 0.3);
      }
    } else if (isFish) {
      // Folded aside at the tank's near-left corner by day, clear of her
      // travel tank's own resting spot (bottom-right — travelTankHomeSpot).
      img.setPosition(cage.x + cage.w * 0.16, cage.y + cage.h * 0.34);
      img.setDisplaySize(22, 15);
      img.setDepth(cage.y + 1);
    } else {
      // Folded up at the back-right of her cage, waiting for her — clear of
      // the bowls (bottom-center) and the litter box (mid-left), and low
      // enough in depth to sit behind whoever's standing in the cage.
      img.setPosition(cage.x + cage.w * 0.74, cage.y + cage.h * 0.36);
      img.setDisplaySize(30, 20);
      img.setDepth(cage.y + 1);
    }
  }

  // Issue #46: no player action involved anymore — she simply gets under the
  // blanket that's already in her cage.
  _tuckIn(stay) {
    if (stay.tuckedIn) return;
    stay.tuckedIn = true;
    this._refreshBlanket(stay);
  }

  // ...and back out from under it: at sunrise, or the moment the player
  // opens her cage to let her out.
  _untuck(stay) {
    if (!stay.tuckedIn) return;
    stay.tuckedIn = false;
    this._refreshBlanket(stay);
  }
  // Owner note 2026-07-29: "is there a way to initiate sleep for the player
  // character? there should be" — sleep doesn't start on its own; the player
  // walks to her own bed (BED_SPOT) and acts (see _checkAct),
  // same "walk up and it happens" convention as everything else in this file.
  //
  // Issue #45 (owner, on what now ends the night): "wait until all pets are
  // in cages" — with blankets automatic (issue #46) there's no tuck-in chore
  // left to gate on, so the gate is simply that nobody's still out in the
  // yard, walking home, or in the player's hands.
  // Issue #58: this RE-EVALUATES every frame now, in both directions. It used
  // to latch — `if (... || this.night.allSettled) return;` — so once the
  // go-ahead fired, only _openCage ever took it back. Picking a pet UP did
  // not, which meant the player could hear "Everyone's asleep! Head to bed",
  // pick up any animal for any reason, and find the bed silently dead with the
  // go-ahead still standing and nothing saying the animal in her hands was the
  // blocker. (Both halves of that are fixed: the state below is live, and the
  // act prompt at the bed now says why it isn't available — see _resolveAct.)
  _checkAllSettled() {
    if (!this.night.active) return;
    // Issue #77 edge case: a fish left at the pond overnight never walks
    // herself home (no self-walk exists for her at all — _updateNightSettle
    // skips her the same way), so treating her being out in the yard as
    // "still out" would block bedtime forever unless the player remembers to
    // fetch her first. She's still carrying-gated and walking-gated like
    // anyone else (those DO mean "not resolved yet"); only the plain
    // "parked at the pond" case is exempt. (_presentStays() below is
    // cage-only, so she's not part of the "everyone tucked in" tally either
    // — there's nothing left gating bedtime on a fish who's simply still out
    // at the pond.)
    const stillOut = this.roster.stays.some((s) => {
      if (s.noCageAvailable) return false;
      if (s.animal.species === 'fish' && s.location === LOCATION.YARD) return false;
      return s.location === LOCATION.YARD || s.location === LOCATION.CARRYING || this._isWalking(s);
    });
    const settled = !stillOut && this._presentStays().every((s) => s.tuckedIn);
    if (settled === this.night.allSettled) return;
    this.night.allSettled = settled;
    // Only announce the go-ahead, not the withdrawal — putting the pet back
    // re-announces it, which is the moment worth calling out.
    if (settled) this.game.events.emit(EVENTS.NOTIFY, "Everyone's asleep! Head to bed to end the night.");
  }

  _beginSleep() {
    this.night.sleeping = true;
    this.tweens.add({
      targets: this, sleepAlpha: 1, duration: SLEEP_FADE_MS, ease: 'Sine.easeIn',
      onComplete: () => {
        // 0-2 wake-ups before morning — plenty for a kid's game (DESIGN.md
        // doesn't promise one every night).
        this.night.wakeUpsRemaining = Phaser.Math.Between(0, 2);
        this._nightTick();
      },
    });
  }

  // Advances the sleep sequence one step: either wraps up to morning, or
  // rolls + surfaces the next wake-up. Called while the screen is black.
  _nightTick() {
    if (this.night.wakeUpsRemaining <= 0) {
      this.clock.setHour(DAY_START); // the simple "fast-forward" — jump straight there
      this.tweens.add({
        targets: this, sleepAlpha: 0, duration: SLEEP_FADE_MS, ease: 'Sine.easeOut',
        onComplete: () => {
          // Issue #58: one shared way out of the night (_endNight also runs on
          // a plain sunrise, and untucks everyone per issue #46). Clearing
          // `sleeping` first is what hands control back to it.
          this.night.sleeping = false;
          this._endNight();
        },
      });
      return;
    }
    this.night.wakeUpsRemaining -= 1;
    const event = pickWakeEvent(this._presentStays());
    if (!event) { this._nightTick(); return; } // nobody present — nothing to wake up
    this.tweens.add({
      targets: this, sleepAlpha: 0, duration: WAKE_FADE_MS, ease: 'Sine.easeOut',
      onComplete: () => this._triggerWakeUp(event),
    });
  }

  _triggerWakeUp({ stay, reason }) {
    this.night.currentWake = { stay, reason };
    const name = stay.animal.name;
    // (Issue #46 removed the "she's cold, the fabric fell off" wake-up — a
    // blanket can't fall off anymore, so there'd be nothing to resolve.)
    if (reason === WAKE_REASON.BATHROOM) {
      stay.needs.bathroom = true;
      this._setNeedIcon(stay, 'bathroom', true);
      // Issue #45: the fix is to open her cage — she walks herself out to
      // the yard, does her business, and walks back home again.
      this.game.events.emit(EVENTS.NOTIFY, `${name} needs to go to the bathroom!`);
    } else if (reason === WAKE_REASON.BABIES) {
      // Refinement: flags her ready-and-waiting the same as a daytime timer
      // expiry — the player resolves this wake-up the same way as any
      // other, by walking over and acting (_checkAct calls
      // _triggerBirth, which resolves the current wake). If morning comes
      // first, that's fine — no forced auto-resolution, she just stays
      // flagged into the next day.
      this._markBirthReady(stay);
    } else { // bad dream — flavor only, nothing to fix, settles on its own
      this.game.events.emit(EVENTS.NOTIFY, `${name} had a bad dream!`);
      this.time.delayedCall(BAD_DREAM_MS, () => this._resolveWakeUp());
    }
  }

  // Called once a wake-up's cause has actually been addressed (she's been
  // let out and done her business, or the birth landed) — fades back to
  // black and continues toward morning.
  _resolveWakeUp() {
    if (!this.night.currentWake) return;
    this.night.currentWake = null;
    this.tweens.add({
      targets: this, sleepAlpha: 1, duration: RESOLVE_FADE_MS, ease: 'Sine.easeIn',
      onComplete: () => this._nightTick(),
    });
  }

  _updateSleepOverlay() {
    this.sleepGfx.clear();
    if (this.sleepAlpha <= 0.002) return;
    const sw = logicalW(this), sh = logicalH(this);
    this.sleepGfx.fillStyle(0x000000, this.sleepAlpha).fillRect(-sw, -sh, sw * 3, sh * 3);
  }
}
