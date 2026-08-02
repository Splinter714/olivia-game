import Phaser from 'phaser';
import {
  WALL, ROOM, OUTSIDE, WORLD, FRONT_DOOR, RECEPTION,
  wallRects, backWingWallRects, outsideFenceRects,
} from '../data/sections.js';
import {
  BOWL_SPOTS, WATER_BOWL_SPOTS, COMPUTER_SPOT,
  OVEN, OVEN_SPOT, TREAT_TRAY_SPOT, BED, BED_SPOT,
  CAGES, LITTER_SPOTS, YARD_BOWL_SPOTS, YARD_RECT,
  cageAnimalSpot, yardGateSpot, clampToYard,
  YARD_DOOR, YARD_DOOR_OPEN_POS,
  POND_RECT, pondSwimSpot, travelTankPondRestSpot, travelTankHomeSpot,
  clampToPondWater, randomPondWaterPoint, pondReachPoint,
} from '../data/props.js';
import { createClock, tintForHour, PHASE } from '../data/clock.js';
import { EVENTS } from '../data/events.js';
import { findPath } from '../data/path.js';
import { tickNeeds, clearNeed, createBowlState } from '../data/needs.js';
import { SPECIES, FAMILY } from '../data/species.js';
import { WAKE_REASON } from '../data/night.js';
import { BABY_PLACEHOLDER } from '../data/animal.js';
import { createEconomy, computePayout, upgradeMessage } from '../data/economy.js';
import {
  pickWanderInterval, wanderAmplitude, wanderSpeed,
  BABY_TETHER, BABY_TETHER_RELEASE, BABY_CATCHUP_SPEED, BABY_KEEP_RADIUS, babyWanderSpeed,
} from '../data/wander.js';
import { Controls } from '../input/Controls.js';
import { buildKennelTextures, buildFloorTile } from '../art/kennel.js';
import { buildPlayerTexture, PLAYER_W, PLAYER_H } from '../art/player.js';
import { buildOwnerTexture, OWNER_W } from '../art/owner.js';
import { buildHelperTexture } from '../art/helper.js';
import { HELPER_NAMES } from '../data/helpers.js';
import {
  buildAnimalTextures, ensureAnimalTextures, ANIMAL_DISPLAY_SCALE,
} from '../art/animals.js';
import { resolveTieBreakers, effectiveLook } from '../data/distinguish.js';
import { lookId } from '../data/coats.js';
import { buildCarryTextures, CARRY_KEY, CARRY_DISPLAY_SCALE } from '../art/carry.js';
import {
  buildPropTextures,
  MESS_KEY, NEED_KEY, UPGRADE_KEY,
  YARD_DOOR_OPEN_KEY, YARD_DOOR_CLOSED_KEY, TRAVEL_TANK_KEY,
} from '../art/props.js';
import { buildRaccoonTextures } from '../art/raccoon.js';
import { createRoster, LOCATION, CARRY_KIND, isCageOpen, anyOpenCageAnywhere, findOpenCage } from '../data/roster.js';
import { loadGame, saveGame, clearSave, seedGlobalNameState } from '../data/persistence.js';
import { circleRectOverlap } from '../data/geometry.js';
import { applyDpr, dprOf, logicalW, logicalH, worldUiOffset } from '../uiUtils.js';
import { WithDevDrag } from '../dev/dragTool.js';
import { WithSecretDragon } from '../dev/secretDragon.js';
import { WithRaccoon } from './kennel/raccoon.js';
import { WithNight } from './kennel/night.js';
import { WithBirths } from './kennel/births.js';
import { WithWorld } from './kennel/world.js';

const SPEED = 160; // px/s, world (logical) units
const PICKUP_RADIUS = 50; // px, how close the player must be to interact with anything
const NAME_TAG_RADIUS = 80; // px, how close the player must be to read a name tag (issue #22 #2)

// Issue #20: cats no longer have an indoor mess of their own — the litter
// box still spawns periodic messes.
const CAT_LITTER_INTERVAL = () => 25_000 + Math.random() * 25_000;
// Issue #38: a dog's only potty pathway is being out in the yard — no more
// dedicated leash-walk minigame ("taking a dog for a poop walk shouldn't be
// different from taking them out to play"). Any dog currently playing in
// the yard who needs the bathroom does her business right where she is
// after a short while, leaving a mess to scoop (same as cat litter), and
// her need clears — same interval family as the cat's litter timer.
const DOG_YARD_INTERVAL = () => 8_000 + Math.random() * 7_000;
// Issue #36 follow-up (owner note 2026-07-29: "don't have SO many owners
// come to pick-up at once") — mirrors the arrival cap on simultaneous
// lingering owners.
const CHECKOUT_OWNER_CAP = 2;

// Issue #45: animals and owner NPCs get around under their own power now —
// an arriving owner walks her pet all the way out to the play yard, an
// opened cage's occupant walks herself out (or over to her waiting owner),
// and everyone walks back to her own cage at night. Both use the same
// waypoint walker (_startWalk/_updateWalkers) over data/path.js's findPath,
// so nobody ever walks through a wall. Animals amble; owners stride.
const ANIMAL_WALK_SPEED = 82;  // px/s, world units
const OWNER_WALK_SPEED = 150;  // px/s

// Issue #65 (owner: "we should give pets collision on each other or some way
// of not just walking through each other" — "solid bump", applying
// "everywhere"): a pairwise separation push between animals' own sprites,
// run once per frame after every other movement system (wander, walkers,
// helpers) has already moved them. Not routed through data/path.js's
// findPath at all — findPath plans a route ONCE against static obstacles
// (walls/cages), which is the wrong tool for two things that are both
// moving; a simple "push apart if overlapping" each frame is enough to read
// as solid blocking without either animal ever needing to replan.
//
// Judgment call (flagged per the issue): a mom's own babies (rendered via
// rec.babies, tethered to her by _updateBabies) are deliberately EXCLUDED
// from this — issue #9's "near mom" litter rendering means a cramped cage
// with a litter packed in close to her is the intended look, and colliding
// them against each other/against her would fight that. Every cage only
// ever holds one PRIMARY stay (data/roster.js's findOpenCage guarantees
// unique cageIndex per stay), so this system's pairwise loop over primary
// stay sprites never fires between two "family" members sharing a cage in
// the first place — it only ever engages between different stays, i.e.
// exactly the "different animals from a different stay" case the issue's
// open question asked about.
const ANIMAL_COLLIDE_PAD = 4; // extra clearance beyond the two sprites' own half-widths

// Issue #53 (local multiplayer): shared-camera framing tuning. MIN_FRAME_ZOOM
// is the "sensible zoom-out limit" the owner asked for — the multiplier on
// top of the DPR baseline the camera will never go below, so the game never
// reads as unreadably tiny no matter how far apart four players spread.
// Beyond that limit the camera stops zooming out further and instead pans
// toward the group's average position, gently pulling a straggler back
// toward frame rather than fighting her movement outright (the owner's own
// stated preference among the two options put to him). CAMERA_FRAME_MARGIN
// is clearance around the tightest box that contains everyone, so a player
// at the edge of frame isn't glued to the literal screen edge.
const MIN_FRAME_ZOOM = 0.45;
const CAMERA_FRAME_MARGIN = 160;

// Main gameplay scene: draws the kennel building + outside strip from
// data/sections.js, and drives the player around it. Animals, arrivals, and
// carrying (issues #4/#5) hang off the same section rects; feeding/potty/
// playpens (issues #6/#7/#8) hang off data/props.js's furniture rects.
export default class KennelScene extends WithWorld(WithBirths(WithNight(WithRaccoon(WithSecretDragon(WithDevDrag(Phaser.Scene)))))) {
  constructor() {
    super('Kennel');
  }

  create() {
    applyDpr(this); // camera zoom = dpr; centred origin (startFollow needs it, see uiUtils.js)

    // Issue #34: resume a saved game if one exists (roster/economy/clock
    // state), instead of always starting fresh. loadGame()
    // never throws — a missing/corrupt save just comes back null and
    // everything below falls through to today's fresh-start behavior.
    // seedGlobalNameState re-registers every restored animal's name/id so a
    // brand-new arrival right after loading can't collide with one of them.
    this._save = loadGame();
    if (this._save) seedGlobalNameState(this._save);

    // Dev tool (src/dev/dragTool.js): a central registry of "things with a
    // hardcoded position a human might want to drag around" — every push
    // happens right where that thing is actually placed, in _buildProps()
    // below, so the registry can't drift from the real world.
    this._devRegistry = [];

    buildKennelTextures(this);
    buildFloorTile(this, 'floor-storage', 0xcbb994, 0xbfa987);
    buildFloorTile(this, 'floor-house', 0xf5ecd8, 0xe8dfc8);
    buildPlayerTexture(this);
    buildOwnerTexture(this);
    HELPER_NAMES.forEach((_, i) => buildHelperTexture(this, `helper-${i}`, i));
    buildAnimalTextures(this);
    buildCarryTextures(this);
    buildPropTextures(this);
    buildRaccoonTextures(this);

    // (Issue #47: the movable yard divider is gone — the outside yard is one
    // single undivided play area, YARD_RECT in data/props.js.)

    this._drawWorld();
    this._buildProps();
    this._buildCollision();
    // Issue #55: the yard gate starts however the player left it (an older
    // save, or a fresh game, starts open — the pre-#55 behavior). This has to
    // run after _buildCollision, which is what creates the gate's zone and
    // the obstacle list _setYardDoor rewrites.
    this._setYardDoor(this._save?.yardDoorOpen !== false);
    this._buildPlayer();
    this._buildHelpers();

    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);
    // Pre-#53 this came from startFollow(player, true, ...)'s `roundPixels`
    // argument — pixel-art crispness depends on it, so now that
    // _updateCameraFraming drives the camera manually it has to be set
    // explicitly instead of inherited as a side effect of startFollow.
    this.cameras.main.roundPixels = true;
    // Issue #53: a single shared camera has to keep EVERY active player in
    // frame (not just Player 1), so Phaser's built-in single-target
    // startFollow can't drive it any more — _updateCameraFraming (called from
    // update()) replaces it with a per-frame recompute. this._camCenter is
    // the lerped focus point it maintains; seeded at the player's own start
    // spot so the very first frame doesn't pop in from (0,0).
    this._camCenter = { x: this.player.x, y: this.player.y };

    this.controls = new Controls(this);

    // Issue #53: local multiplayer. `activePlayers[0]` is always Player 1 —
    // deliberately built as getters/setters onto the SAME fields the rest of
    // this file already reads/writes directly (this.player, this.controls,
    // this.carrying, this._carryOrigin, this._carryVisual, this.navPath), so
    // every existing single-player call site keeps working unchanged and
    // Player 1 solo play is byte-for-byte what it was before this issue.
    // Entries 1-3 are pushed/removed as helpers are claimed/dropped by
    // _claimHelper/_releaseHelper below — real objects, not aliases, since
    // there's no pre-existing single-player state for them to alias onto.
    const scene = this;
    this.activePlayers = [{
      id: 0,
      isPlayer1: true,
      helper: null,
      get sprite() { return scene.player; },
      get controls() { return scene.controls; },
      get carrying() { return scene.carrying; },
      set carrying(v) { scene.carrying = v; },
      get carryOrigin() { return scene._carryOrigin; },
      set carryOrigin(v) { scene._carryOrigin = v; },
      get carryVisual() { return scene._carryVisual; },
      set carryVisual(v) { scene._carryVisual = v; },
      get navPath() { return scene.navPath; },
      set navPath(v) { scene.navPath = v; },
      wobbleT: 0,
    }];

    // Issue #53: drop-in/drop-out. A fresh face-button press on a gamepad
    // that ISN'T bound to anyone yet claims the next free helper; her own
    // controller disconnecting reverts her to AI immediately, no restart
    // needed. Gamepad index 0 is always Player 1's own fallback pad (today's
    // single-player behavior — her Controls instance reads it directly), so
    // only indices 1+ are ever up for grabs here.
    this._unclaimedPadPrevDown = new Map(); // gamepad index -> was a face button down last frame
    this.input.gamepad?.on('disconnected', (pad) => {
      const actor = this.activePlayers.find((a) => !a.isPlayer1 && a.controls.gamepadIndex === pad.index);
      if (actor) this._releaseHelper(actor);
      this._unclaimedPadPrevDown.delete(pad.index);
    });

    this.buildDevDrag(); // F9 to toggle — see src/dev/dragTool.js
    this.buildSecretDragon(); // type "DRAGON" — see src/dev/secretDragon.js

    // Issue #34: pause menu button, top-right (clear of the top-left
    // clock/money HUD and the bottom-right touch interact button).
    this._buildPauseButton();

    this.clock = createClock(this._save
      ? { startDay: this._save.clockDay, startHour: this._save.clockHourFloat }
      : {});
    this._lastHour = this.clock.hour;
    this._lastPhase = this.clock.phase;

    // Full-screen ambient tint, redrawn each frame from tintForHour. Oversized so it
    // covers the visible area regardless of the centred camera's zoom origin (same
    // trick as the sibling games' screen-fixed overlays).
    this.tintGfx = this.add.graphics().setScrollFactor(0).setDepth(9999);

    this.navPath = null;

    // Issue #58: signature of the interaction prompt currently on screen, so
    // _updatePrompts only emits when it actually changes (not 60x a second).
    this._promptSig = null;

    // ── Roster / arrivals / carrying (issues #4, #5, #20) ──────────────────
    // Issue #79: loadGame() only guards the JSON shape (stays/pool are
    // arrays) — it can't know if a save's DEEPER field shape still matches
    // what today's game logic expects. This project changes that shape
    // often (e.g. #71 replaced the whole per-species cage bookkeeping), so a
    // save written a version or two ago can carry fields current code
    // doesn't know how to read. createRoster() below is the first place that
    // actually touches those fields, so it's wrapped: any throw here means
    // "this save doesn't fit anymore" exactly like a JSON parse failure
    // does, and gets treated the same way — discarded, fresh start, rather
    // than leaving the player on a permanently black/frozen screen with no
    // way to recover short of clearing storage by hand.
    try {
      this.roster = createRoster(this._save ? { stays: this._save.stays, pool: this._save.pool } : null);
    } catch (err) {
      console.error('Saved game no longer matches the current version — starting fresh instead.', err);
      clearSave();
      this._save = null;
      this.roster = createRoster(null);
    }
    this._staySprites = new Map(); // stay -> { pos, sprite, tag:{container,width,height}, extras:[...], babyLabels:[...], needIcons:{}, wanderBounds, inPond }
    this.carrying = null;          // the stay currently in the player's hands, or null
    this._carryOrigin = null;      // where `carrying` was picked up from: 'reception' | sectionKey | LOCATION.YARD
    this._carryVisual = null;      // { parts: [{obj, dx, dy}, ...] } following the player while carrying
    this._lingeringOwners = new Map(); // stay -> owner sprite, reserved from the moment a delivering owner starts walking in until she's walked back out again (issue #25, reworked by #45)
    this._checkoutOwners = new Map();  // stay -> { sprite, arrived } — a waiting checkout owner (issue #36), from the moment she starts walking in until her pet reaches her
    // Issue #45: every sprite currently walking somewhere under its own
    // power — animals AND owner NPCs, several at once (multiple opened
    // cages, a whole yard heading home at nightfall), so this is a
    // collection, not a single slot. See _startWalk/_updateWalkers.
    this._walkers = [];

    // ── Night: tuck-in / staying awake / wake-ups (issue #11) ──────────────
    // Issue #34 regression fix: this has to exist BEFORE _refreshCageArt()
    // below — with a restored save, that call already has settled stays to
    // render, and _renderStay reads this.night.active while restoring each
    // one's tuck-in indicator.
    this.buildNight();

    // Now that this.roster/this._staySprites exist, do the initial cage-art
    // pass (bowls/litter boxes are occupancy-driven, so they can't be drawn
    // any earlier than this — see _buildProps' own comment).
    this._refreshCageArt();

    // (the scooper-rest state is set earlier, above _buildProps() — see that
    // comment.)
    this.messes = [];              // { kind: 'cat'|'dog', x, y, sprite, icon, stay }
    this._catLitterTimer = CAT_LITTER_INTERVAL();
    this._dogYardTimer = DOG_YARD_INTERVAL(); // issue #38
    // Issue #32 follow-up, collapsed to ONE pair by issue #47 (no more yard
    // zones): the whole yard shares a single high-capacity food/water pair,
    // unlike a per-cage bowl (see _autoResolveYardBowls).
    this.yardBowls = createBowlState();
    this._refreshYardBowls();

    // ── Births / computer announcements (issues #9, #10) ──────────────────
    this.buildBirths();

    // ── Economy: payouts + returning-guest upgrades (issue #12) ────────────
    this.economy = createEconomy(this._save?.economyTotal ?? 0);

    // ── Back wing: baking + the raccoon surprise (issue #13) ───────────────
    this.buildRaccoon();

    this.game.events.on(EVENTS.HOUR_CHANGE, this._onHourChange, this);
    this.game.events.on(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);

    // Issue #34: autosave every few seconds and once more on page unload —
    // "a few seconds is fine, this is a kid's game, not high-stakes" (owner
    // note on the issue). Everything _saveGame needs (roster/economy/clock)
    // exists by this point in create().
    this._autosaveTimer = this.time.addEvent({ delay: 5000, loop: true, callback: () => this._saveGame() });
    this._onBeforeUnload = () => this._saveGame();
    window.addEventListener('beforeunload', this._onBeforeUnload);

    this.events.once('shutdown', () => {
      this.game.events.off(EVENTS.HOUR_CHANGE, this._onHourChange, this);
      this.game.events.off(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
      window.removeEventListener('beforeunload', this._onBeforeUnload);
    });

    if (this._save) {
      // Resuming: re-render every restored stay wherever she currently is
      // (reception/section/yard), rather than seeding a brand-new arrival.
      // Issue #79: same reasoning as the createRoster try/catch above — this
      // reads deep per-stay fields (cage identity, location, carry state)
      // that an older save's shape may not satisfy. Caught the same way.
      try {
        this._restoreStaySprites();
        // HudScene/NotificationScene only update on these events firing — emit
        // once now so the HUD immediately reflects the resumed day/hour/money
        // instead of showing fresh-boot defaults until the next natural change.
        this.game.events.emit(EVENTS.HOUR_CHANGE, { hour: this.clock.hour, phase: this.clock.phase, day: this.clock.day, syncOnly: true });
        this.game.events.emit(EVENTS.PHASE_CHANGE, { phase: this.clock.phase, isNight: this.clock.phase === PHASE.NIGHT, syncOnly: true });
        this.game.events.emit(EVENTS.MONEY_CHANGE, { total: this.economy.total });
      } catch (err) {
        console.error('Saved game no longer matches the current version — starting fresh instead.', err);
        clearSave();
        this._save = null;
        // Best-effort cleanup of whatever partial sprites got created before
        // the throw, then reset to the exact same empty state a no-save boot
        // starts from.
        this._staySprites.forEach((rec) => {
          rec.sprite?.destroy?.();
          rec.tag?.container?.destroy?.();
          rec.extras?.forEach((e) => e.destroy?.());
        });
        this._staySprites.clear();
        this.roster = createRoster(null);
        this.economy = createEconomy(0);
        this._spawnArrival(this.clock.day, this.clock.hour);
      }
    } else {
      // Don't start with an empty kennel — one arrival is already waiting at
      // reception when the shift begins.
      this._spawnArrival(this.clock.day, this.clock.hour);
    }
  }

  // Issue #34: plain-JSON snapshot of everything needed to resume exactly
  // where the player left off — see data/persistence.js for the save format
  // contract. Cheap enough to call on a timer; guarded in case it somehow
  // fires before roster/economy/clock exist yet.
  _saveGame() {
    if (this._resetting) return; // see _resetGame below
    if (!this.roster || !this.economy || !this.clock) return;
    saveGame({
      stays: this.roster.stays,
      pool: this.roster.pool,
      economyTotal: this.economy.total,
      clockDay: this.clock.day,
      clockHourFloat: this.clock.hourFloat,
      // Issue #55: the yard gate is a thing the player deliberately set, so
      // it should still be how she left it after a reload. An older save has
      // no field here and comes back open, which is the pre-#55 behavior.
      yardDoorOpen: this.yardDoorOpen,
    });
  }

  // Issue #34 follow-up fix: PauseScene's Reset Game calls this instead of
  // clearing the save itself — clearSave() + a bare window.location.reload()
  // looked right but didn't stick, because reload() fires 'beforeunload'
  // FIRST, and this scene's own beforeunload autosave handler (_onBeforeUnload
  // above) then immediately re-wrote the just-cleared save right back into
  // localStorage before the page actually unloaded. `_resetting` short-
  // circuits _saveGame so nothing can undo the clear once reset is underway.
  _resetGame() {
    this._resetting = true;
    clearSave();
    window.location.reload();
  }

  // Issue #34: re-renders every stay from a restored save wherever she
  // currently is, instead of the normal one-at-a-time arrival/dropoff flow
  // that builds sprites incrementally as things happen live. Mirrors the
  // exact position math each of those live call sites already uses
  // (_cageSpotFor, _openYardSpot/_dropOffToYard) so a resumed stay ends
  // up in the same kind of spot a freshly-placed one would.
  //
  // `LOCATION.CARRYING` (mid-carry when the page was closed) has no
  // meaningful visual to resume — DESIGN.md's persistence goal is "the
  // kennel looks the same when you come back", not frame-accurate resume of
  // an in-progress pickup — so she's settled back wherever she last had a
  // real home: her own cage if she had one, reception otherwise.
  //
  // Issue #45: a stay caught mid-WALK (walking herself out to the yard, home
  // to her cage at night, or over to her waiting owner) needs no special
  // case here either, for the same reason — her saved `location` is always
  // one of the two ends of that walk (see _openCage/_startWalkHome), so she
  // simply settles at whichever end the save recorded.
  _restoreStaySprites() {
    // Issue #54: a stay saved BEFORE cages were assigned at check-in can have
    // no cage at all (she was waiting at reception or out in the yard,
    // un-placed). Grant her one now, in the same order a fresh check-in would
    // use, so she isn't the one guest without a nameplate, bowls, or a home to
    // walk back to at night. Anyone whose saved cage is intact keeps it.
    //
    // Issue #71 folded save migration into this same loop rather than adding
    // versioning machinery the project deliberately doesn't have: a save
    // written against the old per-species `(cageSection, cageSlot)` identity
    // simply has no `cageIndex`, so it falls into exactly the branch that was
    // already here for a pre-#54 save and is handed a real cage from the flat
    // pool. Her old `location` (a species key) is no longer a cage, so the
    // location normalization below re-homes her too.
    for (const stay of this.roster.stays) {
      if (CAGES[stay.cageIndex]) continue;
      const open = this._findAnyOpenCage(stay);
      if (open == null) break; // nothing left to hand out (shouldn't happen)
      stay.cageIndex = open;
    }
    for (const stay of this.roster.stays) {
      // Mid-carry when the page closed, or restored from a save whose
      // `location` was a species key that means nothing now: settle her back
      // into her own cage if she has one, reception otherwise.
      const known = stay.location === LOCATION.RECEPTION || stay.location === LOCATION.YARD
        || stay.location === LOCATION.CAGE;
      if (!known || stay.location === LOCATION.CARRYING) {
        stay.location = CAGES[stay.cageIndex] ? LOCATION.CAGE : LOCATION.RECEPTION;
      }
    }

    const { rug } = RECEPTION;
    let receptionIdx = 0;
    let yardIdx = 0;
    let pondIdx = 0;
    for (const stay of this.roster.stays) {
      if (stay.location === LOCATION.RECEPTION) {
        const idx = receptionIdx++;
        const x = rug.x + 30 + (idx % 3) * 55;
        const y = rug.y + 24 + Math.floor(idx / 3) * 42;
        this._renderStay(stay, x, y);
      } else if (stay.location === LOCATION.YARD) {
        // Issue #84: a fish restored as "out in the yard" is out at the POND,
        // the only place in the yard she can be — the generic yard grid slot
        // put her up in the top-left corner of the grass, and the pond clamp
        // would then teleport her across the yard on the first frame.
        const pos = stay.animal.species === 'fish'
          ? pondSwimSpot(pondIdx++)
          : this._gridSlot(YARD_RECT, yardIdx++, 20, 44, 52);
        this._renderStay(stay, pos.x, pos.y);
      } else if (stay.location === LOCATION.CAGE) {
        const pos = this._cageSpotFor(stay);
        this._renderStay(stay, pos.x, pos.y);
      } else {
        // Unrecognized/corrupt location — safest fallback is reception
        // rather than dropping her sprite entirely.
        stay.location = LOCATION.RECEPTION;
        const idx = receptionIdx++;
        const x = rug.x + 30 + (idx % 3) * 55;
        const y = rug.y + 24 + Math.floor(idx / 3) * 42;
        this._renderStay(stay, x, y);
      }
    }
    // Bowl/litter-box/cage-art sprites are occupancy-driven and don't exist
    // yet for a stay that was just placed by the loop above — one refresh
    // catches every cage at once (same call _dropOff makes).
    this._refreshCageArt();

    // Issue #36: a restored stay's `checkoutReady` flag survives the save
    // (plain boolean), but her waiting owner is a live Phaser sprite and
    // doesn't — re-spawn one for her, already standing at reception (no
    // walk-in animation needed for a silent resume, unlike a fresh flag).
    const waitingBase = this._checkoutOwners.size;
    let waitingIdx = 0;
    for (const stay of this.roster.stays) {
      if (!stay.checkoutReady) continue;
      const { rug } = RECEPTION;
      const idx = waitingBase + waitingIdx++;
      const waitX = rug.x + rug.w + 40 + (idx % 3) * 40;
      const waitY = rug.y + 24 + Math.floor(idx / 3) * 42;
      const owner = this.add.sprite(waitX, waitY, 'owner-npc').setOrigin(0.5, 1).setDepth(waitY);
      const tag = this._addNameTag(owner.x, owner.y - OWNER_W * 1.1, stay.animal.name);
      tag.container.setVisible(true).setDepth(9000);
      this._checkoutOwners.set(stay, { sprite: owner, tag, arrived: true, waitX, waitY });
    }
  }

  // ── Pause menu (issue #34) ────────────────────────────────────────────────
  // Top-right corner: clear of HudScene's top-left clock/money panel and
  // Controls' bottom-right touch interact button. Opening it actually pauses
  // KennelScene (this.scene.pause stops Phaser from calling update() at all
  // here, which is where the clock/needs/birth timers/wandering all live)
  // while PauseScene runs in parallel on top, same "always-on-top overlay
  // scene" pattern as HudScene/NotificationScene, so its own buttons stay
  // clickable.

  _buildPauseButton() {
    const g = this.add.graphics().setScrollFactor(0).setDepth(9998);
    const label = this.add.text(0, 0, '⏸️', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9999);
    const zone = this.add.zone(0, 0, 10, 10).setScrollFactor(0).setDepth(9999)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this._openPauseMenu());
    this._pauseButton = { g, label, zone, w: 44, h: 34 };
    this._layoutPauseButton();
    this.scale.on('resize', () => this._layoutPauseButton());
  }

  _layoutPauseButton() {
    const b = this._pauseButton;
    if (!b) return;
    const off = worldUiOffset(this);
    b.x = off.x + logicalW(this) - b.w / 2 - 16;
    b.y = off.y + 16 + b.h / 2;
    b.zone.setPosition(b.x, b.y).setSize(b.w, b.h);
    this._renderPauseButton();
  }

  _renderPauseButton() {
    const b = this._pauseButton;
    if (!b) return;
    b.g.clear();
    b.g.fillStyle(0x2a3648, 0.75).fillRoundedRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 8);
    b.g.lineStyle(2, 0xffffff, 0.85).strokeRoundedRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 8);
    b.label.setPosition(b.x, b.y);
  }

  _openPauseMenu() {
    this._saveGame(); // opening the menu is as good a checkpoint as any
    this.scene.pause();
    this.scene.launch('Pause');
  }

  _buildCollision() {
    // Obstacles that block movement — the outer building walls, big
    // furniture, the outside fence, and (since issue #71) the cages
    // themselves.
    //
    // Issue #71 (owner: "I DO want collision and pathfinding for all
    // characters including player and animals"): this ONE list is both the
    // arcade-physics wall set the player's body collides with AND the
    // `collides` callback findPath routes against — which the owner NPCs and
    // every self-walking animal (issue #45's walker) already share. So adding
    // the cage rects here is the whole change: everybody gets real collision
    // and real cage-aware routing at once, and they use the aisles
    // data/props.js sized for exactly this.
    this._outerObstacleRects = [
      ...wallRects(),
      RECEPTION.desk,
      ...outsideFenceRects(),
      ...backWingWallRects(),
      OVEN,
      BED,
      ...CAGES,
    ];

    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.walls = this.physics.add.staticGroup();
    for (const r of this._outerObstacleRects) this._addWallZone(r, this.walls);

    // Issue #55: the yard gate is the one obstacle that comes and goes. Its
    // zone is built once and its body simply enabled/disabled by
    // _setYardDoor, alongside adding/removing its rect from the routing list
    // below — a shut gate has to block BOTH the player's body and everyone's
    // pathfinding, or an owner NPC would happily route straight through it.
    this._yardDoorZone = this._addWallZone(YARD_DOOR, this.walls);

    // Shared "what blocks a body" list used by both arcade physics and
    // findPath's routing.
    this.obstacleRects = [...this._outerObstacleRects];
    this._collides = (x, y, r) => this.obstacleRects.some((rect) => circleRectOverlap(x, y, r, rect));
  }

  // ── The gate to the play yard (issue #55) ────────────────────────────────
  // Owner: "there should be a closeable door to the outside play area, and if
  // it is closed when someone drops off their pet, they instead drop their pet
  // off at the pet's assigned cage" — and, on what an opened cage does while
  // it's shut: "she stays in her cage." So it gates yard access for real:
  //
  //  - shut, it's a solid obstacle in the east wall for the player, the
  //    animals and the owner NPCs alike (routing AND physics);
  //  - a delivering owner takes her pet to its assigned cage instead of out
  //    to the grass (_runOwnerDropOff);
  //  - opening a cage doesn't send anyone outside (_considerCages).
  //
  // The one thing it must never do is strand a pet who was already out when
  // it shut. Rather than special-casing paths, anyone who needs to come back
  // IN nudges it open on her way (see _startWalkHome) — so nightfall's
  // walk-home works regardless of what state the player left it in, which is
  // the outcome the issue actually asks for.
  _setYardDoor(open, opts = {}) {
    const changed = this.yardDoorOpen !== open;
    this.yardDoorOpen = open;

    if (this._yardDoorZone?.body) this._yardDoorZone.body.enable = !open;
    this.obstacleRects = open
      ? [...this._outerObstacleRects]
      : [...this._outerObstacleRects, YARD_DOOR];

    // Issue #76: a walker's path is planned once, up front, and just stepped
    // along afterward (_updateWalkers) — it never re-checks obstacles. So
    // shutting the gate mid-walk left anyone already en route following a
    // route planned before the gate existed as an obstacle, straight through
    // it. Replan every active walk against the fresh obstacle set the instant
    // it closes, same endpoint-cage-ignoring rule ordinary walks use.
    //
    // `this._walkers` is guarded because create() calls this BEFORE the walker
    // list exists, to restore a save's gate state — and a save whose gate was
    // left SHUT takes the `changed && !open` branch on that very first call.
    // Nobody is walking yet at that point, so skipping is the correct no-op
    // rather than merely a crash guard.
    if (changed && !open && this._walkers) {
      for (const walk of this._walkers) {
        const target = walk.path[walk.path.length - 1];
        if (!target) continue;
        const replanned = findPath(walk.sprite.x, walk.sprite.y, target.x, target.y, {
          minX: 0, minY: 0, maxX: WORLD.w, maxY: WORLD.h,
          collides: this._walkCollides(walk.sprite.x, walk.sprite.y, target.x, target.y),
          cell: 20, clearance: 9, planMargin: 4,
        });
        if (replanned) walk.path = replanned;
      }
    }

    if (this._yardDoorImg) {
      if (open) {
        // Swung out into the grass: an ordinary y-sorted world object, so a
        // pet standing south of it passes in front and one north of it behind.
        this._yardDoorImg.setTexture(YARD_DOOR_OPEN_KEY)
          .setOrigin(0, 0)
          .setPosition(YARD_DOOR_OPEN_POS.x, YARD_DOOR_OPEN_POS.y)
          .setDepth(YARD_DOOR_OPEN_POS.y + 16);
      } else {
        // Shut, it's part of the WALL — flat-on, drawn just above the wall
        // tiles and the doorway threshold beneath it (depths 0 and 1 in
        // _drawWorld) and below everyone who walks up to it. Sorting it by y
        // like a free-standing object would hide the player behind it while
        // she stood at the door.
        this._yardDoorImg.setTexture(YARD_DOOR_CLOSED_KEY)
          .setOrigin(0, 0)
          .setPosition(YARD_DOOR.x, YARD_DOOR.y)
          .setDepth(3);
      }
    }
    if (changed && opts.notify) this.game.events.emit(EVENTS.NOTIFY, opts.notify);
  }

  // Opening/closing it is a player ACTION, so it gets no notification of its
  // own (owner note 2026-07-29: "we really only want notifications for animal
  // needs, not for actions we've taken") — the gate's own open/closed art is
  // the feedback, same convention as a filled bowl.
  _toggleYardDoor() {
    this._setYardDoor(!this.yardDoorOpen);
  }

  // The point on the gate nearest the player, so it's interactable from
  // anywhere along its height (and from either side) rather than only from
  // dead-center — same clamp-to-rect trick _findOpenCageNear uses.
  // `actor` is whichever active player's ACT button is asking (issue #53) —
  // each player reaches the gate from her own position, same as everything
  // else in _resolveAct.
  _yardDoorTarget(actor) {
    const rect = this.yardDoorOpen
      ? { x: YARD_DOOR.x, y: YARD_DOOR.y, w: YARD_DOOR.w + 8, h: YARD_DOOR.h }
      : YARD_DOOR;
    return {
      x: Phaser.Math.Clamp(actor.sprite.x, rect.x, rect.x + rect.w),
      y: Phaser.Math.Clamp(actor.sprite.y, rect.y, rect.y + rect.h),
    };
  }

  _addWallZone(r, group) {
    const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    this.physics.add.existing(zone, true);
    group.add(zone);
    return zone;
  }

  _buildPlayer() {
    // Just off the reception desk — a natural place to start a shift. Offset
    // from the desk's own bottom edge (not a magic constant) so this stays
    // correct regardless of the desk's size (issue #17 grew it along with
    // everything else).
    const startX = RECEPTION.desk.x + 40;
    const startY = RECEPTION.desk.y + RECEPTION.desk.h + 40;
    this.player = this.physics.add.sprite(startX, startY, 'player').setOrigin(0.5, 1);
    this.player.body.setSize(14, 12).setOffset((PLAYER_W - 14) / 2, PLAYER_H - 14);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(startY);

    this.physics.add.collider(this.player, this.walls);
  }

  // ── NPC helpers (issue #52, reworked player-commanded in issue #80) ──────
  // Owner: "NPC helper that help with chores (make 3 of them, and they can
  // then be controlled by local multiplayer once we implement that)." Built
  // structurally like the player (physics sprite, same body size/collision)
  // so issue #53 has as little to retrofit as possible when a real player
  // takes control of one.
  //
  // They're present from create() (not earned). Issue #52 had them roam and
  // self-direct bowl/mess upkeep automatically; issue #80 reversed that —
  // each helper now only works a task CATEGORY the player has explicitly
  // toggled on for her (walk up, interact, multi-select in her own menu — see
  // _openHelperMenu/_toggleHelperTask). With nothing toggled on she just
  // roams/idles. `tasks` is per-helper and independent, so one can be filling
  // bowls while another does nothing and a third does cleaning only. Issue
  // #81 expanded the assignable categories to five: bowls, cleaning, cages
  // (opening/sending pets out or home), carrying (reception arrivals,
  // stranded checkout hand-offs), and births (birth-ready moms, baby photos,
  // the computer) — see _resolveHelperTarget/_forEachChore/
  // _forEachHelperCageTask/_forEachHelperBirthTask/_tryStartHelperCarry.
  _buildHelpers() {
    const startX = RECEPTION.desk.x + 40;
    const startY = RECEPTION.desk.y + RECEPTION.desk.h + 40;
    this._claimedChores = new Set(); // chore keys currently walked-toward by a helper — see _resolveHelperTarget
    this.helpers = HELPER_NAMES.map((name, i) => {
      const key = `helper-${i}`;
      // Fanned out a little around the player's own start spot so the three
      // of them don't spawn stacked directly on top of her.
      const sprite = this.physics.add.sprite(startX + 26 + i * 22, startY + 10 - i * 8, key).setOrigin(0.5, 1);
      sprite.body.setSize(14, 12).setOffset((PLAYER_W - 14) / 2, PLAYER_H - 14);
      sprite.setCollideWorldBounds(true);
      sprite.setDepth(sprite.y);
      this.physics.add.collider(sprite, this.walls);
      // Issue #53: `playerControlled` is the drop-in/drop-out switch —
      // _updateHelpers skips her entirely while it's true, and her own
      // `actor` (in this.activePlayers) drives her instead. `choreKey` tracks
      // which _claimedChores entry (if any) is reserved for her mid-walk, so
      // a takeover mid-chore can release it instead of leaking a stuck claim
      // nobody will ever pick up again. So a helper is always in exactly one
      // of three states: human-controlled (`playerControlled`), AI working a
      // player-assigned task (`tasks` non-empty), or idle/roaming (`tasks`
      // empty) — never two of these at once.
      //
      // Issue #80: `tasks` is the player-assigned set of category strings
      // she's currently allowed to work ('bowls', 'cleaning', and — issue
      // #81 — 'cages', 'carrying', 'births') — starts empty, toggled via her
      // own menu (_openHelperMenu). `choreCategory` mirrors `choreKey` but
      // records WHICH category the in-progress chore belongs to, so toggling
      // that category off mid-walk can interrupt her immediately
      // (_stopHelperWalk) instead of letting her finish it.
      //
      // Issue #81: `carrying`/`carryOrigin`/`carryVisual` give a helper the
      // exact same shape `_pickUp`/`_dropOff`/`_dropOffToYard`/`_followCarry`
      // already expect from any actor (Player 1, a claimed helper) — so the
      // 'carrying' task can hand a helper an animal by calling those same
      // methods with the helper herself as the actor, no parallel carry
      // system needed. Only ever set while she's AI-driving her own
      // 'carrying' task (see _tryStartHelperCarry) — a claimed helper (issue
      // #53) carries through her own `actor` entry in activePlayers instead,
      // same as before.
      return {
        name, sprite, walking: false, roamTimer: 0,
        playerControlled: false, choreKey: null, choreCategory: null, actor: null,
        tasks: new Set(),
        carrying: null, carryOrigin: null, carryVisual: null,
      };
    });
  }

  // ── Roster rendering (issues #4 arrivals, #5 carrying) ──────────────────────
  //
  // A "stay" (data/roster.js) is the source of truth for where an animal is;
  // these methods are the only place that turns a stay into on-screen sprites.
  // Every render call destroys any previous sprites for that stay first, so a
  // stay can move between reception → carrying → a section without leaking art.

  _onHourChange({ hour, phase, day, syncOnly }) {
    // Issue #34: after loading a save, KennelScene re-emits HOUR_CHANGE/
    // PHASE_CHANGE with `syncOnly` set purely so HudScene picks up the
    // resumed day/hour immediately instead of showing fresh-boot defaults —
    // NOT a real tick, so skip the arrival/checkout/night side effects below.
    if (syncOnly) return;
    if (phase === PHASE.DAY || phase === PHASE.EVENING) {
      this._spawnArrival(day, hour);
      if (Math.random() < 0.25) this._spawnArrival(day, hour); // "occasionally two" for variety
      // Issue #36: checkout no longer happens overnight, same day/evening-
      // only rule as arrivals — an owner shouldn't show up to collect her
      // pet in the middle of the night.
      this._flagCheckoutsReady(day);
    }
  }

  _spawnArrival(day, hour) {
    // Issue #25: cap simultaneous waiting owner+pet pairs at 3. Reserve the
    // slot the instant an owner starts walking in (_lingeringOwners is set in
    // _runOwnerDropOff, before her walk-in tween even starts), not just once
    // she's reached the desk — otherwise the "occasionally two" double-spawn
    // roll below could let a 4th owner start walking in before the 3rd has
    // been counted.
    if (this._lingeringOwners.size >= 3) return;
    // Issue #32: any pet can go in any open cage, so a species keeps
    // arriving as long as ANY cage anywhere is open.
    const stay = this.roster.spawnArrival({ day, hour });
    // null means the whole kennel is full right now — quietly skip this
    // roll, no queue/penalty/notification.
    if (!stay) return;
    // Issue #54: she was handed a real cage at check-in, so that cage is hers
    // from this instant — one refresh makes it read as occupied (her species'
    // cage art, her food/water bowls, her litter box if she's a cat) while
    // her owner is still walking her in. Her nameplate comes with her sprite,
    // which _refreshCagePlates hangs on her cage on its own.
    this._refreshCageArt();
    this._runOwnerDropOff(stay);
  }

  // Secret bonus guest (src/dev/secretDragon.js's "DRAGON" cheat code). She
  // has no species section of her own, so this only bails out if the whole
  // kennel is genuinely full — `anyOpenCageAnywhere` already answers exactly
  // that. She then arrives through the exact same owner-walks-her-in
  // sequence as any other guest, and settles into any open cage the moment
  // the player carries her in — see _resolveDropoff, which treats every guest
  // this same "any pet, any open cage" way (issue #32).
  _triggerSecretDragon() {
    if (!anyOpenCageAnywhere(this.roster.stays)) {
      this.game.events.emit(EVENTS.NOTIFY, 'A mythical dragon wanted to visit, but the kennel is full right now!');
      return;
    }
    this.game.events.emit(EVENTS.NOTIFY, '✨ A dragon appeared!');
    const stay = this.roster.spawnDragon({ day: this.clock.day, hour: this.clock.hour });
    if (!stay) return; // no cage to give her (already ruled out above)
    this._refreshCageArt(); // her castle-cage is hers from check-in (issue #54)
    this._runOwnerDropOff(stay);
  }

  // Issue #21, reworked by issue #45 (owner: "when animals arrive with their
  // owners, they go immediately to the play pen, their owner takes them
  // there"): a simple owner NPC walks in through the front door carrying/
  // leading her pet (leash/carrier/box/basket, or just holding her for a
  // CARRY_KIND.NONE species), walks her all the way out to the play yard,
  // sets her down there, then walks back out the front door and despawns.
  //
  // Nobody lingers at reception to be collected anymore. The pet plays out
  // in the yard until she's brought in.
  //
  // Issue #54 (owner: "when pets check in, they should get an assigned cage
  // right away") supersedes this issue's earlier "player still carries her
  // in" answer as far as OWNERSHIP goes: roster.spawnArrival already gave her
  // a real cage before this ever runs, so her nameplate, bowls and cage art
  // are hers from check-in and she walks herself home at nightfall
  // (_startWalkHome) with no player action at all. Assignment and delivery
  // destination are separate things — her owner still walks her out to the
  // YARD here, and the player can still carry her into a different cage
  // whenever she likes; that carry just isn't what grants her a home anymore.
  _runOwnerDropOff(stay) {
    const doorX = (FRONT_DOOR.x0 + FRONT_DOOR.x1) / 2;
    const doorY = ROOM.y + ROOM.h - WALL - 2;

    const owner = this.add.sprite(doorX, doorY, 'owner-npc').setOrigin(0.5, 1).setDepth(doorY);
    // Issue #25: reserve her delivering-owner slot the instant she starts
    // walking in — see the cap check in _spawnArrival — held until she's
    // handed the pet over and started walking back out.
    this._lingeringOwners.set(stay, owner);

    // She visibly carries the container/animal the whole way, so the
    // hand-off reads as continuous rather than the pet popping into
    // existence out in the grass.
    let carryProp;
    if (stay.carryKind !== CARRY_KIND.NONE) {
      carryProp = this.add.image(owner.x, owner.y, CARRY_KEY[stay.carryKind])
        .setOrigin(0.5, 1).setScale(CARRY_DISPLAY_SCALE);
    } else {
      carryProp = this._addAnimalSprite(owner.x, owner.y, stay.animal, stay.animal.stage, this._tieBreakers());
    }
    const followOwner = () => {
      carryProp.x = owner.x + OWNER_W * 0.4;
      carryProp.y = owner.y;
      carryProp.setDepth(owner.depth + 1);
    };
    followOwner();

    // Issue #55 (owner: "if it is closed when someone drops off their pet,
    // they instead drop their pet off at the pet's assigned cage"). She's had
    // a real cage since check-in (issue #54), so with the gate shut her owner
    // simply walks her to it — which is also the only destination that's
    // actually reachable, since a shut gate blocks routing east.
    const cage = CAGES[stay.cageIndex];
    const toCage = !this.yardDoorOpen && !!cage;
    // Issue #77: a fish's owner still walks her IN (carrying the travel
    // tank — CARRY_KEY[CARRY_KIND.TANK] above), same as anyone else's
    // arrival — but her "out to the yard" destination is always the one
    // shared pond, never a spot fanned out around the gate.
    const isFish = stay.animal.species === 'fish';
    const spot = toCage ? cageAnimalSpot(cage)
      : (isFish ? pondSwimSpot(this._fishAtPondCount(stay)) : this._openYardSpot(stay));

    this._startWalk(owner, spot.x, spot.y, {
      speed: OWNER_WALK_SPEED,
      onStep: followOwner,
      onArrive: () => {
        carryProp.destroy();
        // Same "she's out of the box and settled now" beat a cage drop-off
        // used to get (issue #21), played right where she's set down.
        // Issue #77: skipped for a fish's travel tank — it doesn't fade away
        // like a one-time box/basket, it becomes the persistent resting prop
        // right here instead (_refreshTravelTank, wired into _renderStay/
        // _settleInCage below).
        if (stay.carryKind !== CARRY_KIND.NONE && stay.carryKind !== CARRY_KIND.TANK) {
          this._playUnboxing(spot.x, spot.y, stay.carryKind);
        }
        if (toCage) {
          this._settleInCage(stay, stay.cageIndex);
          this._syncTieBreakers();
          this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} arrived — she's settling into her cage!`);
        } else {
          stay.location = LOCATION.YARD;
          this._renderStay(stay, spot.x, spot.y);
          this._syncTieBreakers(); // a new guest may now match someone already here
          this.game.events.emit(EVENTS.NOTIFY, isFish
            ? `${stay.animal.name} arrived — she's swimming in the pond!`
            : `${stay.animal.name} arrived — she's out playing in the yard!`);
        }
        this._walkOwnerOut(stay);
      },
    });
  }

  // Where a pet is set down when she's brought out to play.
  //
  // Issue #61 (owner: "owners should drop off their pets right at the opening
  // of the playpen, not weirdly/unnecessarily top left"): just inside the
  // yard's gate — the BACK_DOOR gap in the building's east wall — instead of
  // the top-left corner of a placement grid laid over the whole yard, which
  // is what the old `_gridSlot(YARD_RECT, ...)` handed out. The count of who's
  // already out there is now only used to FAN simultaneous drops apart around
  // the gate (data/props.js's yardGateSpot), not to walk a grid.
  //
  // A pet still being walked out by her owner (`_lingeringOwners`) counts as
  // already out there even though her `location` still reads RECEPTION, so two
  // arrivals mid-delivery at the same time can't be handed the identical spot.
  _openYardSpot(stay = null) {
    const already = this.roster.stays.filter((s) => s !== stay
      && (s.location === LOCATION.YARD || this._lingeringOwners.has(s))).length;
    return yardGateSpot(already);
  }

  // Issue #25/#45: her delivering owner walks back out through the front
  // door from wherever she is (the yard, now) and despawns.
  _walkOwnerOut(stay) {
    const owner = this._lingeringOwners.get(stay);
    if (!owner) return;
    this._lingeringOwners.delete(stay);
    const doorX = (FRONT_DOOR.x0 + FRONT_DOOR.x1) / 2;
    const doorY = ROOM.y + ROOM.h - WALL - 2;
    this._startWalk(owner, doorX, doorY, {
      speed: OWNER_WALK_SPEED,
      onArrive: () => owner.destroy(),
    });
  }

  // ── Walking under their own power (issue #45) ────────────────────────────
  // One tiny waypoint-follower shared by owner NPCs and animals alike:
  // data/path.js's findPath routes around the building's walls/furniture
  // (the same `collides` list the player's own tap-to-move uses), then the
  // sprite is stepped along those waypoints each frame. Several walks can be
  // in flight at once — a couple of opened cages, a whole yard heading home
  // at nightfall — so this is a list, not a single slot.

  _startWalk(sprite, tx, ty, opts = {}) {
    const { speed = ANIMAL_WALK_SPEED, stay = null, onStep = null, onArrive = null } = opts;
    const path = findPath(sprite.x, sprite.y, tx, ty, {
      minX: 0, minY: 0, maxX: WORLD.w, maxY: WORLD.h,
      collides: this._walkCollides(sprite.x, sprite.y, tx, ty), cell: 20, clearance: 9, planMargin: 4,
    }) || [{ x: tx, y: ty }]; // unreachable (shouldn't happen) — go straight there
    const walk = { sprite, path, speed, stay, onStep, onArrive };
    this._walkers.push(walk);
    return walk;
  }

  // Issue #71 made cages solid, which creates one problem the walls never
  // had: a walk can legitimately START inside an obstacle (an opened cage's
  // occupant is standing in her cage) or END inside one (she's walking home
  // to hers, an owner is delivering a pet into hers). findPath would plan her
  // as trapped and drop her at the aisle outside — or, worse, refuse the
  // route and fall back to a straight line through the grid.
  //
  // So a walk ignores whichever cages contain its own two endpoints, and
  // only those: every other cage stays solid, so she still routes down the
  // aisles rather than over the block. Automatic from the endpoints rather
  // than a per-caller flag, so no call site can forget it.
  _walkCollides(fromX, fromY, toX, toY) {
    const inside = (rect, x, y) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    const ignore = CAGES.filter((c) => inside(c, fromX, fromY) || inside(c, toX, toY));
    if (!ignore.length) return this._collides;
    return (x, y, r) => this.obstacleRects.some(
      (rect) => !ignore.includes(rect) && circleRectOverlap(x, y, r, rect),
    );
  }

  _isWalking(stay) {
    return this._walkers.some((w) => w.stay === stay);
  }

  _updateWalkers(delta) {
    if (!this._walkers.length) return;
    const step = delta / 1000;
    for (const walk of [...this._walkers]) {
      const { sprite } = walk;
      if (!sprite.active) { // destroyed mid-walk (checkout, reset) — drop it
        this._walkers = this._walkers.filter((w) => w !== walk);
        continue;
      }
      let budget = walk.speed * step;
      while (budget > 0 && walk.path.length) {
        const wp = walk.path[0];
        const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, wp.x, wp.y);
        if (d <= budget || d < 0.001) {
          sprite.setPosition(wp.x, wp.y);
          budget -= d;
          walk.path.shift();
        } else {
          sprite.x += ((wp.x - sprite.x) / d) * budget;
          sprite.y += ((wp.y - sprite.y) / d) * budget;
          budget = 0;
        }
      }
      sprite.setDepth(sprite.y);
      walk.onStep?.();
      if (!walk.path.length) {
        this._walkers = this._walkers.filter((w) => w !== walk);
        walk.onArrive?.();
      }
    }
  }

  // ── Helper chore-picking + roaming (issue #52, gated per #80, expanded #81) ─
  // Helpers do routine upkeep (bowls, messes) plus, per #81, cage-opening and
  // births/photos/the computer — every one of these is a single-leg "walk to
  // a spot, then run a no-actor-needed function" job, so they all share this
  // one nearest-unclaimed-candidate picker. (Carrying is the one #81 category
  // that ISN'T single-leg — fetch her, THEN deliver her — so it's driven by
  // its own small state machine instead: see _tryStartHelperCarry.)
  //
  // Reuses _forEachChore's exact bowls/cleaning candidate list (so there's
  // one definition of "what counts as a chore", shared with the player's ACT
  // button), plus two #81 enumerators of the same shape for cages and
  // births — picks nearest to the HELPER's own position rather than the
  // player's, skips anything another helper has already claimed (see
  // _updateHelpers) so two helpers don't both set off for the same target,
  // AND skips any candidate whose category isn't currently toggled on for
  // THIS helper (`helper.tasks`). A target that becomes stale before she
  // arrives (the player, or another helper, beat her to it) is handled by
  // each run()'s own guards, not here — worst case she walks up to an
  // already-resolved spot and simply looks for something else next.
  _resolveHelperTarget(helper) {
    let best = null, bestD = Infinity;
    const consider = (key, x, y, run, category) => {
      if (!helper.tasks.has(category)) return;
      if (this._claimedChores.has(key)) return;
      const d = Phaser.Math.Distance.Between(helper.sprite.x, helper.sprite.y, x, y);
      if (d < bestD) { bestD = d; best = { key, x, y, run, category }; }
    };
    this._forEachChore((key, x, y, label, run, category) => consider(key, x, y, run, category));
    this._forEachHelperCageTask(consider);
    this._forEachHelperBirthTask(consider);
    return best;
  }

  // Issue #81, "open cages / send pets out or home" — mirrors the player's
  // own HANDLE-button cage actions (_considerCages's plain "let herself out
  // to play" branch — including the walk-to-her-waiting-owner outcome that
  // same _openCage call already produces for a checkout-ready pet — and
  // _considerLoosePets's "send her back to her cage" action), run
  // autonomously for a helper with 'cages' toggled on.
  //
  // Judgment call (flagged per the issue): skipped entirely at night, rather
  // than replicating the player's own "asleep, except a dog who needs the
  // bathroom" exception — waking a sleeping pet is exactly the kind of
  // judgment call the issue said was fine to leave out rather than force.
  _forEachHelperCageTask(consider) {
    if (this.night.active) return;
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.CAGE) continue;
      if (this._isWalking(stay)) continue;
      // Issue #77: a fish never opens her cage and walks herself anywhere —
      // skip her here the same way _considerCages does for the player, so a
      // "cages" helper doesn't waste a trip standing at her tank doing
      // nothing (_openCage itself already no-ops for her, but there's no
      // honest task to offer in the first place).
      if (stay.animal.species === 'fish') continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      const toOwner = stay.checkoutReady && this._checkoutOwners.get(stay)?.arrived;
      if (!toOwner && !this.yardDoorOpen) continue; // nowhere honest to send her — same guard _openCage itself has
      consider(stay, rec.sprite.x, rec.sprite.y, () => this._openCage(stay), 'cages');
    }
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.YARD) continue;
      if (this._isWalking(stay)) continue;
      // A checkout-ready yard pet already sent herself home the instant she
      // was flagged (_flagCheckoutsReady's own _startWalkHome call) — nothing
      // left here for a helper to do.
      if (stay.checkoutReady) continue;
      // Issue #77: a fish at the pond never sends herself home either — same
      // exclusion as _considerLoosePets, for the same reason (_startWalkHome
      // itself no-ops for her, but offering the task at all would read as a
      // helper doing something when nothing actually happens).
      if (stay.animal.species === 'fish') continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      const hasHome = !!CAGES[stay.cageIndex] || this._findAnyOpenCage(stay) != null;
      if (!hasHome) continue;
      // `reversible: true` — same tap-to-turn-around from issue #69 applies
      // whether it's the player or a helper who started this yard→cage trip;
      // no reason the player should lose the ability to redirect her mid-walk
      // just because a helper was the one who sent her home.
      consider(stay, rec.sprite.x, rec.sprite.y, () => this._startWalkHome(stay, { reversible: true }), 'cages');
    }
  }

  // Issue #81, "births / baby photos / computer" — the exact same three
  // player interactions _resolveAct already offers (help a birth-ready mom,
  // photograph un-announced babies, send the computer announcement), run
  // autonomously for a helper with 'births' toggled on. All three already
  // run with no player judgment/typing involved (the computer flow auto-
  // picks names from data/names.js, same as any other arrival) — so unlike
  // the issue's worry about "composing the announcement message" needing a
  // person, there's nothing here that doesn't translate directly.
  _forEachHelperBirthTask(consider) {
    for (const stay of this.roster.stays) {
      if (!stay.birthReady) continue;
      const eggs = this._eggCageSpot(stay);
      const rec = this._staySprites.get(stay);
      const at = eggs || (rec ? { x: rec.sprite.x, y: rec.sprite.y } : null);
      if (!at) continue;
      consider(`helper-birth-${stay.animal.id}`, at.x, at.y, () => this._triggerBirth(stay), 'births');
    }
    for (const stay of this.roster.stays) {
      if (!stay.needsAnnouncement || stay.photoTaken) continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      consider(`helper-photo-${stay.animal.id}`, rec.sprite.x, rec.sprite.y, () => this._takePhoto(stay), 'births');
    }
    if (!this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement && s.photoTaken)) {
      consider('helper-computer', COMPUTER_SPOT.x, COMPUTER_SPOT.y, () => this._useComputer(), 'births');
    }
  }

  // Issue #81, "carry animals" — the one new category that isn't a single
  // walk-then-run job: a helper has to reach the animal, pick her up
  // (_pickUp, same as the player's own HANDLE button — the helper herself is
  // the `actor`, see _buildHelpers), then walk her to wherever she's going
  // before setting her down. Two concrete, always-safe triggers (deliberately
  // narrower than every carry the player herself can do — flagged in the
  // report):
  //
  //  - A stay waiting at RECEPTION (only reachable today via a restored
  //    pre-#54 save with no cage assigned, or a kennel that was completely
  //    full at some point — every fresh arrival's own owner already delivers
  //    her straight to a cage or the yard, issue #54/#45) gets carried to an
  //    open cage if one exists, the yard otherwise.
  //  - A checkout-ready stay whose owner has arrived but who ISN'T in her
  //    cage (the rare case _resolveDropoff's own fallback comment describes:
  //    she was picked up/relocated after her checkout was flagged, so the
  //    normal "open her cage and she walks over" path can't reach her) gets
  //    carried directly to her waiting owner.
  //
  // The ordinary checkout hand-off — a checkout-ready CAGED pet walking
  // herself over once her cage is opened — doesn't need carrying at all
  // (that's the 'cages' category, above); this only covers the stranded
  // fallback.
  _findHelperCarryCandidate(helper) {
    let best = null, bestD = Infinity;
    for (const stay of this.roster.stays) {
      if (this._claimedChores.has(stay)) continue;
      if (this._isWalking(stay)) continue;
      const isReceptionArrival = stay.location === LOCATION.RECEPTION;
      const isCheckoutStranded = stay.checkoutReady && stay.location !== LOCATION.CAGE
        && !!this._checkoutOwners.get(stay)?.arrived;
      if (!isReceptionArrival && !isCheckoutStranded) continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      const d = Phaser.Math.Distance.Between(helper.sprite.x, helper.sprite.y, rec.sprite.x, rec.sprite.y);
      if (d < bestD) { bestD = d; best = stay; }
    }
    return best;
  }

  // Starts the two-leg carry job: walk to the candidate, pick her up, then
  // hand off to _beginHelperCarryDelivery for leg two. Claims `stay` in
  // `_claimedChores` (freed the instant she's reached — see below) and sets
  // `helper.choreKey`/`choreCategory` for the WHOLE job (both legs), so
  // toggling 'carrying' off mid-trip interrupts her immediately via the
  // normal _stopHelperWalk path, same "stops immediately" guarantee as every
  // other task category (issue #80) — _stopHelperWalk settles whoever she's
  // holding into a cage/the yard if it catches her mid-carry.
  _tryStartHelperCarry(helper) {
    const stay = this._findHelperCarryCandidate(helper);
    if (!stay) return false;
    this._claimedChores.add(stay);
    helper.choreKey = stay;
    helper.choreCategory = 'carrying';
    const rec = this._staySprites.get(stay);
    const tx = rec ? rec.sprite.x : helper.sprite.x;
    const ty = rec ? rec.sprite.y : helper.sprite.y;
    this._startHelperWalk(helper, tx, ty, () => {
      // She's reached the animal's spot — free the "go fetch her" claim
      // (nobody else needs to route here once she's arrived), but keep
      // choreKey/choreCategory alive through leg two below.
      this._claimedChores.delete(stay);
      // Stale by the time she arrived — claimed by the player, already
      // walking somewhere, or gone entirely. Bail cleanly.
      const stillValid = this._staySprites.has(stay) && !this._isWalking(stay) && (
        stay.location === LOCATION.RECEPTION
        || (stay.checkoutReady && stay.location !== LOCATION.CAGE && this._checkoutOwners.get(stay)?.arrived)
      );
      if (!stillValid) {
        helper.choreKey = null;
        helper.choreCategory = null;
        return;
      }
      this._pickUp(helper, stay);
      this._beginHelperCarryDelivery(helper, stay);
    });
    return true;
  }

  // Leg two of a helper carry: walk the animal to her destination and set
  // her down there, reusing the exact same drop calls the player's own
  // HANDLE button uses (_dropOff/_dropOffToYard/_completeCheckout) with the
  // helper as the actor.
  _beginHelperCarryDelivery(helper, stay) {
    const finish = () => { helper.choreKey = null; helper.choreCategory = null; };
    const co = stay.checkoutReady ? this._checkoutOwners.get(stay) : null;
    if (co) {
      this._startHelperWalk(helper, co.waitX, co.waitY + 14, () => {
        if (helper.carrying === stay) {
          if (this._checkoutOwners.has(stay)) this._completeCheckout(stay);
          else this._dropOffToYard(helper, stay); // her owner left in the meantime — settle her rather than strand her mid-air
        }
        finish();
      });
      return;
    }
    const cageIndex = this._findAnyOpenCage(stay);
    if (cageIndex != null) {
      const spot = cageAnimalSpot(CAGES[cageIndex]);
      this._startHelperWalk(helper, spot.x, spot.y, () => {
        this._dropOff(helper, stay, cageIndex, { fromReception: helper.carryOrigin === LOCATION.RECEPTION });
        finish();
      });
    } else {
      const spot = this._openYardSpot(stay);
      this._startHelperWalk(helper, spot.x, spot.y, () => {
        this._dropOffToYard(helper, stay);
        finish();
      });
    }
  }

  // A random reachable point to roam to when a helper has no chore — same
  // "periodic random target" idea _updateWander uses for animals, but
  // walked to with _startWalk/findPath (like everything else self-moving)
  // rather than an un-pathed drift, so she still respects walls/cages.
  // Split roughly 50/50 between the building floor and the play yard
  // (yard only offered while its gate is open, since a shut gate blocks
  // routing there same as for anyone else). Retries a handful of times
  // against a random point landing inside an obstacle (a cage, the desk,
  // the oven/bed) before giving up and just standing pat.
  _randomRoamPoint() {
    for (let i = 0; i < 12; i++) {
      const useYard = this.yardDoorOpen && Math.random() < 0.5;
      let x, y;
      if (useYard) {
        x = YARD_RECT.x + 20 + Math.random() * Math.max(1, YARD_RECT.w - 40);
        y = YARD_RECT.y + 20 + Math.random() * Math.max(1, YARD_RECT.h - 40);
      } else {
        x = WALL + 24 + Math.random() * Math.max(1, ROOM.w - 2 * (WALL + 24));
        y = ROOM.y + WALL + 24 + Math.random() * Math.max(1, ROOM.h - 2 * (WALL + 24));
      }
      if (!this._collides(x, y, 10)) return { x, y };
    }
    // Fallback: reception, an always-clear spot (shouldn't be reached in
    // practice — the floor is mostly open aisles).
    return { x: RECEPTION.desk.x + 40, y: RECEPTION.desk.y + RECEPTION.desk.h + 40 };
  }

  // Kicks off a walk for a helper (as opposed to an animal/owner, which go
  // through the bare _startWalk directly) — tracks her own `walking` flag so
  // _updateHelpers knows not to re-target her mid-journey, released the
  // instant she arrives (before `onArrive` runs) so a chore whose target
  // vanished mid-walk still frees her up to pick something else next frame.
  _startHelperWalk(helper, tx, ty, onArrive) {
    helper.walking = true;
    this._startWalk(helper.sprite, tx, ty, {
      speed: SPEED, // issue #52: normal walking pace, same as the player's own — not the slower ANIMAL_WALK_SPEED/OWNER_WALK_SPEED
      onArrive: () => {
        helper.walking = false;
        onArrive?.();
      },
    });
  }

  // Per-frame helper AI: each idle helper prefers the nearest unclaimed
  // chore from a category the player has toggled on for her (issue #80 —
  // with nothing toggled on, `_resolveHelperTarget` never returns a target
  // and she just roams); with nothing to do, she roams. Issue #81 added
  // cage-opening and births/photos/the computer to that same single-leg
  // resolver, plus 'carrying' as its own two-leg job (_tryStartHelperCarry),
  // tried first so a helper already mid-carry (still `walking`, so skipped by
  // the guard below) never gets double-booked onto a second task.
  _updateHelpers(delta) {
    if (!this.helpers) return;
    for (const helper of this.helpers) {
      if (helper.playerControlled) continue; // issue #53: a claimed helper is driven by her own player actor, not AI
      if (helper.carrying) this._followCarry(helper); // issue #81: keep the animal in her arms glued to her while she's walking
      if (helper.walking) continue; // _updateWalkers is already moving her toward her current target

      if (helper.tasks.has('carrying') && this._tryStartHelperCarry(helper)) continue;

      const target = this._resolveHelperTarget(helper);
      if (target) {
        this._claimedChores.add(target.key);
        helper.choreKey = target.key;
        helper.choreCategory = target.category;
        this._startHelperWalk(helper, target.x, target.y, () => {
          this._claimedChores.delete(target.key);
          helper.choreKey = null;
          helper.choreCategory = null;
          target.run();
        });
        continue;
      }

      // Nothing to do — roam, on the same periodic timer idea _updateWander
      // uses (pick a fresh point every several seconds, otherwise just
      // stand). Runs down only while she's genuinely idle (paused above
      // while she's mid-walk), so this fires once right when she settles.
      helper.roamTimer -= delta;
      if (helper.roamTimer <= 0) {
        helper.roamTimer = 4000 + Math.random() * 4000;
        const p = this._randomRoamPoint();
        this._startHelperWalk(helper, p.x, p.y, null);
      }
    }
  }

  // ── Local multiplayer drop-in / drop-out (issue #53) ─────────────────────
  // Every frame: any gamepad NOT already bound to an active player (index 0
  // is always Player 1's own fallback — see the Controls constructor) is
  // watched for a FRESH press of either face button used elsewhere in this
  // game (A/act or X/handle — whichever a new player happens to reach for
  // first works, so there's no separate "press THIS specific button to
  // join" button to discover). Edge-triggered against
  // `_unclaimedPadPrevDown` so a held button doesn't repeatedly re-claim.
  _updateGamepadDropIn() {
    const gp = this.input.gamepad;
    if (!gp) return;
    const claimedIndices = new Set(this.activePlayers.filter((a) => !a.isPlayer1).map((a) => a.controls.gamepadIndex));
    for (const pad of gp.getAll()) {
      if (!pad.connected || pad.index === 0 || claimedIndices.has(pad.index)) continue;
      const down = !!(pad.buttons[0]?.pressed || pad.buttons[2]?.pressed);
      const was = this._unclaimedPadPrevDown.get(pad.index) || false;
      this._unclaimedPadPrevDown.set(pad.index, down);
      if (down && !was) this._claimHelper(pad.index);
    }
  }

  // Hands one currently-AI helper over to a human on gamepad `padIndex` — she
  // stops being AI-driven immediately (mid-chore or mid-roam) and becomes a
  // full player-actor with her own Controls/carrying/navPath, using the same
  // movement + act/handle scheme as Player 1. Does nothing if every helper is
  // already claimed (kennel only has 3, so a 5th pad simply can't join).
  _claimHelper(padIndex) {
    const helper = this.helpers?.find((h) => !h.playerControlled);
    if (!helper) return;
    helper.playerControlled = true;
    // She may have been mid-walk (mid-chore or mid-roam) the instant she was
    // claimed — stop her dead and release any chore claim she was holding, or
    // it would sit in _claimedChores forever with nobody left to finish it.
    this._stopHelperWalk(helper);

    const actor = {
      id: this.activePlayers.length,
      isPlayer1: false,
      helper,
      sprite: helper.sprite,
      controls: new Controls(this, { gamepadIndex: padIndex }),
      carrying: null,
      carryOrigin: null,
      carryVisual: null,
      navPath: null,
      wobbleT: 0,
    };
    helper.actor = actor;
    this.activePlayers.push(actor);
  }

  // Reverts a player-controlled helper back to AI the instant her gamepad
  // disconnects — no restart needed. If she happened to be mid-carry (an
  // animal in her hands) when the controller dropped, settle the animal back
  // into the cage she already holds (issue #54: a stay keeps her assigned
  // cage the whole time she's carried) rather than leaving her stranded with
  // no sprite at all — this is a live-session-only handoff, not something
  // worth building real "drop it where you stand" placement for.
  _releaseHelper(actor) {
    if (!actor || actor.isPlayer1) return;
    if (actor.carrying) {
      const stay = actor.carrying;
      if (CAGES[stay.cageIndex]) this._dropOff(actor, stay, stay.cageIndex, {});
      else this._dropOffToYard(actor, stay);
    }
    actor.controls.destroy();
    this.activePlayers = this.activePlayers.filter((a) => a !== actor);
    const helper = actor.helper;
    if (helper) {
      helper.playerControlled = false;
      helper.actor = null;
      helper.walking = false; // resumes chore-picking/roaming fresh next _updateHelpers tick
      helper.roamTimer = 0;
      helper.sprite.setScale(1, 1); // clear any mid-wobble squash/stretch she was left in
      // Her `tasks` set is untouched — whatever the player had toggled on for
      // her stays on across a claim/release, same as it would for any other
      // idle stretch (issue #80).
    }
  }

  // Halts a helper wherever she is right now — mid-chore-walk or mid-roam —
  // and releases any chore claim she was holding so nobody else is stuck
  // waiting on a claim that will never resolve. Shared by _claimHelper
  // (issue #53, a human taking over) and _toggleHelperTask (issue #80, the
  // player un-toggling the category she's actively working — "stops
  // immediately" per the owner, not "finishes this one first").
  //
  // Issue #81: if this catches her mid-carry (task toggled off, or a human
  // claiming her, while she's holding an animal from her own 'carrying'
  // task), settle whoever she's holding into her own cage — or the yard, if
  // she has none — rather than leaving her frozen holding an animal nobody
  // can reach anymore. Same fallback _releaseHelper already uses for a
  // gamepad takeover mid-carry.
  _stopHelperWalk(helper) {
    helper.walking = false;
    this._walkers = this._walkers.filter((w) => w.sprite !== helper.sprite);
    if (helper.choreKey != null) { this._claimedChores.delete(helper.choreKey); helper.choreKey = null; }
    helper.choreCategory = null;
    helper.sprite.body.setVelocity(0, 0);
    if (helper.carrying) {
      const stay = helper.carrying;
      if (CAGES[stay.cageIndex]) this._dropOff(helper, stay, stay.cageIndex, {});
      else this._dropOffToYard(helper, stay);
    }
  }

  // ── Player-commanded helper tasks (issue #80) ────────────────────────────
  // Toggles one task category on/off for one specific helper — per-helper,
  // independent of the other two (owner: "Per-helper"). Turning a category
  // OFF while she's actively walking toward a chore in that exact category
  // interrupts her right where she stands (owner: "Stops immediately") —
  // _updateHelpers picks her back up fresh next frame, either onto another
  // still-toggled-on category or into idle roaming if nothing's left on.
  // Turning a category on has no immediate effect beyond making her eligible
  // — _updateHelpers's normal per-frame pass finds her the nearest chore in
  // it next time she's idle.
  _toggleHelperTask(helper, category) {
    if (helper.tasks.has(category)) {
      helper.tasks.delete(category);
      if (helper.choreCategory === category) this._stopHelperWalk(helper);
    } else {
      helper.tasks.add(category);
    }
  }

  // Opens helper's own task menu (HelperMenuScene) — the walk-up-and-
  // interact convention every other world interaction here uses (issue #58's
  // ACT button), same "pause the game underneath, overlay scene on top"
  // pattern as the pause menu. Interacting again while nothing changed just
  // re-opens the same menu showing her current toggles, so turning something
  // off is the same gesture as turning it on (owner: "to make her stop, you
  // interact and un-select stuff").
  // Issue #85: the menu needs to know WHICH controller/keyboard navigates
  // it — whichever actor actually walked up and pressed the button, not
  // always Player 1. `actor.controls.gamepadIndex` is set on every Controls
  // instance (Player 1 defaults to pad 0; a claimed helper's own actor reads
  // her own claimed pad — see Controls.js's constructor comment).
  _openHelperMenu(actor, helper) {
    this._saveGame(); // opening the menu is as good a checkpoint as any (same call as _openPauseMenu)
    this.scene.pause();
    this.scene.launch('HelperMenu', { helper, gamepadIndex: actor.controls.gamepadIndex });
  }

  // ── Shared camera framing (issue #53) ────────────────────────────────────
  // One camera for up to 4 players: it has to keep everyone in frame, so
  // Phaser's single-target startFollow (used pre-#53) can't drive it any
  // more. Zooms out as active players spread apart and back in as they
  // converge — bounded by MIN_FRAME_ZOOM so it never zooms out past
  // legibility — and pans to the centroid (the AVERAGE position, not the
  // bounding-box midpoint) of everyone active, which is what gives a player
  // near the min-zoom edge a gentle pull toward the group rather than a hard
  // stop (the owner's explicitly-flagged tradeoff — see #53's "known
  // constraint": "gently pulling stragglers along... rather than letting the
  // camera fight the players"). A LONE player (solo, or everyone else
  // clustered close by) always resolves to zoom factor 1 — i.e. today's
  // exact tight follow, unchanged.
  _updateCameraFraming(delta) {
    const players = this.activePlayers;
    const cam = this.cameras.main;
    const dpr = dprOf(this);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sx = 0, sy = 0;
    for (const p of players) {
      const { x, y } = p.sprite;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      sx += x; sy += y;
    }
    const centroid = { x: sx / players.length, y: sy / players.length };

    // How much room the spread actually needs, plus a fixed margin so nobody
    // is glued to the very edge of frame (her sprite/prompt bubble needs
    // clearance too).
    const boxW = (maxX - minX) + CAMERA_FRAME_MARGIN * 2;
    const boxH = (maxY - minY) + CAMERA_FRAME_MARGIN * 2;
    const fitW = logicalW(this) / Math.max(1, boxW);
    const fitH = logicalH(this) / Math.max(1, boxH);
    // Capped at 1 (never zoom in TIGHTER than the solo baseline) and floored
    // at MIN_FRAME_ZOOM (the owner's "sensible zoom-out limit" — beyond this
    // the game reads as unreadably small, so the centroid pull-along below
    // takes over instead of zooming out further).
    const targetFactor = Phaser.Math.Clamp(Math.min(fitW, fitH, 1), MIN_FRAME_ZOOM, 1);

    // Pan lerp factor matches the OLD startFollow(player, true, 0.15, 0.15)
    // exactly, so solo Player 1 follow feels identical to before this issue —
    // with only her in activePlayers, centroid === her own position every
    // frame, same as startFollow's single target. Zoom eases at the same
    // rate so neither snaps instantly when a helper's taken over/dropped.
    this._camFactor = this._camFactor == null ? targetFactor : Phaser.Math.Linear(this._camFactor, targetFactor, 0.15);
    this._camCenter.x = Phaser.Math.Linear(this._camCenter.x, centroid.x, 0.15);
    this._camCenter.y = Phaser.Math.Linear(this._camCenter.y, centroid.y, 0.15);

    cam.setZoom(dpr * this._camFactor);
    cam.centerOn(this._camCenter.x, this._camCenter.y);

    // worldUiOffset-based overlays (pause button, Player 1's touch cluster/
    // joystick) are normally only laid out once + on a real resize event —
    // but our zoom now changes every frame without a resize firing, so they
    // need their own re-layout call here or they'd drift the instant the
    // camera zooms away from bare dpr.
    this._layoutPauseButton();
  }

  // Swaps an animal sprite between its idle and walk animation (art/animals.js
  // builds both per look) — the same trick the old leash-walk follow visual
  // used, so a self-walking pet actually reads as walking.
  _setAnimalMoving(sprite, moving) {
    const cur = sprite.anims?.currentAnim?.key;
    if (!cur) return;
    const base = cur.replace(/_(idle|walk)$/, '');
    const want = `${base}_${moving ? 'walk' : 'idle'}`;
    if (cur !== want && this.anims.exists(want)) sprite.play(want);
  }

  // Mom and every baby travelling with her switch together.
  _setStayMoving(rec, moving) {
    rec.walking = moving;
    this._setAnimalMoving(rec.sprite, moving);
    for (const baby of rec.babies) this._setAnimalMoving(baby.sprite, moving);
  }

  // Issue #45 (owner: "when an animal is ready to leave, the player just
  // presses a button to open the cage, and the pet goes to their waiting
  // owner on its own" / "if a dog needs to go potty, or for ANY animal
  // who's owner isn't waiting to pick them up — if you open their cage,
  // they go outside on their own to play"): ONE interaction at an occupied
  // cage, replacing BOTH carrying a pet out for play and carrying a
  // checkout-ready pet over to her owner.
  _openCage(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec || this._isWalking(stay)) return;
    // Issue #77: a fish never opens her cage and walks herself out — she has
    // no legs, and her "cage" is a sealed tank besides. _considerCages never
    // wires this up for a fish in the first place (it offers hold-to-pick-up
    // her travel tank instead), so this is purely a defensive guard against
    // some other caller reaching her here.
    if (stay.animal.species === 'fish') return;
    // She's up and about — out from under her blanket (issue #46).
    this._untuck(stay);
    // Someone's out of her cage again, so the kennel isn't all settled for
    // the night anymore — the "head to bed" go-ahead re-arms once she's back.
    this.night.allSettled = false;

    const checkout = this._checkoutOwners.get(stay);
    if (stay.checkoutReady && checkout) {
      // Issue #93 (owner: "when a pet is sent to go home... immediately make
      // their previous cage available"): she's leaving for good the instant
      // this walk starts, not just stepping out to play — so unlike an
      // ordinary yard trip (which keeps the cage hers the whole time), her
      // cage lets go of her right now rather than staying reserved until she
      // actually reaches her owner. A full art refresh (not just furniture)
      // since occupancy itself changed here — the freed cage's own look
      // reverts to empty too, immediately available to a new arrival.
      stay.cageIndex = null;
      this._refreshCageArt();
      this._setStayMoving(rec, true);
      this._startWalk(rec.sprite, checkout.waitX, checkout.waitY + 14, {
        stay,
        onArrive: () => {
          this._stopStayMoving(stay);
          // Her owner is still there in every normal case; if she somehow
          // isn't, the pet just goes out to play rather than getting stuck.
          if (this._checkoutOwners.has(stay)) this._completeCheckout(stay);
          else this._settleInYard(stay);
        },
      });
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} is walking over to her owner!`);
      return;
    }

    // Issue #55 (owner, asked what an opened cage does with the gate shut:
    // "she stays in her cage"). Belt and braces with _considerCages, which
    // doesn't offer the action at all in that state — but _openCage is
    // reachable from elsewhere, and sending her to a yard she can't route to
    // would walk her straight through a closed gate.
    if (!this.yardDoorOpen) {
      this.game.events.emit(EVENTS.NOTIFY, `The gate to the play yard is closed — ${stay.animal.name} stays in her cage.`);
      return;
    }

    // Nobody waiting for her — she lets herself out to the play yard. Her
    // cage stays hers the whole time (a yard trip has always counted as
    // still occupying it), so the nameplate, bowls and
    // blanket all stay put in it.
    this._walkToYard(stay);
  }

  // The plain cage→yard half of "let herself out to play" — factored out of
  // _openCage so issue #69's _reverseWalk can also start this exact walk
  // (reversing a "send her home" trip back the other way) without
  // duplicating it. Marked `reversible`/`dir: 'toYard'` on the walk itself:
  // this is one of the two "plain cage↔yard trip" walks issue #69 scoped
  // "switch directions" to (see _reverseWalk's own comment for the other one
  // and the narrowing judgment call).
  _walkToYard(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    const spot = this._openYardSpot(stay);
    stay.location = LOCATION.YARD;
    this._setStayMoving(rec, true);
    this._startWalk(rec.sprite, spot.x, spot.y, {
      stay,
      reversible: true,
      dir: 'toYard',
      onArrive: () => {
        this._stopStayMoving(stay);
        this._settleInYard(stay);
      },
    });
  }

  // Looked up fresh rather than closed over: a walk can outlive the sprite
  // record it started with (a redraw mid-journey re-creates it — see the
  // walk re-attach at the end of _renderStay).
  _stopStayMoving(stay) {
    const rec = this._staySprites.get(stay);
    if (rec) this._setStayMoving(rec, false);
  }

  // Issue #45 #6 ("pets walk go back into their cages at night from the play
  // area on their own") — a real walk home, not the instant teleport the old
  // _recallYardToCages did. `reversible` (issue #69) tags the walk so
  // _reverseWalk can turn her back around mid-trip — ONLY set true by the
  // player's own "send her back to her cage" handle action
  // (_considerLoosePets below); every other caller (nightfall, a checkout
  // flagged while she's out, walking back after hatching away from mom)
  // leaves it false on purpose, so those trips can't be interrupted by a
  // stray tap (narrowing judgment call, flagged in the report).
  _startWalkHome(stay, opts = {}) {
    const { reversible = false } = opts;
    const rec = this._staySprites.get(stay);
    if (!rec || this._isWalking(stay)) return;
    // Issue #77: a fish never walks herself home — no self-walk exists for
    // her at all (no legs; the travel tank the player carries is the only
    // way she ever moves). A single guard here covers every call site
    // (nightfall's _updateNightSettle sweep included) rather than trusting
    // each one to remember the exception.
    if (stay.animal.species === 'fish') return;
    // Issue #55: "pets already outside when the door closes must still be
    // able to get back in — don't strand anyone; nightfall walk-home must
    // work regardless of door state." Coming IN through a shut gate nudges it
    // open, rather than the alternative of routing her through solid wood or
    // leaving her out in the grass all night. It stays open afterwards — she
    // has no hands to close it behind her, and leaving it swinging is the
    // honest, visible outcome.
    if (!this.yardDoorOpen && stay.location === LOCATION.YARD) {
      this._setYardDoor(true, { notify: `${stay.animal.name} nudged the gate open to come back inside!` });
    }
    let cageIndex = stay.cageIndex;
    // Confirmed edge case (issue #45): a pet with no home to walk to picks
    // any open cage herself rather than being stranded outside all night.
    // Issue #54 made this rare — every arrival is assigned a cage at check-in
    // now — but it still covers a stay restored from an older save.
    if (!CAGES[cageIndex]) {
      const open = this._findAnyOpenCage(stay);
      if (open == null) {
        // Genuinely nowhere to put her (shouldn't happen — arrivals stop
        // once every cage is spoken for). She stays out; _checkAllSettled
        // ignores her so bedtime can't deadlock on it.
        stay.noCageAvailable = true;
        return;
      }
      cageIndex = open;
    }
    stay.noCageAvailable = false;
    stay.cageIndex = cageIndex;
    this._refreshCageArt(); // a newly-claimed cage reads as hers right away

    const spot = cageAnimalSpot(CAGES[cageIndex]);
    this._setStayMoving(rec, true);
    this._startWalk(rec.sprite, spot.x, spot.y, {
      stay,
      reversible,
      dir: 'toCage',
      onArrive: () => {
        this._stopStayMoving(stay);
        this._settleInCage(stay, cageIndex);
      },
    });
  }

  // Issue #69 (owner: "Tapping 'animal' button on an animal that's heading
  // between cage and play area should make them switch directions and go to
  // the other place"): cancels stay's in-progress walk and starts a fresh one
  // back the way she came — but ONLY for a walk tagged `reversible` when it
  // started (see _walkToYard/_startWalkHome above). Scoped to the two plain
  // cage↔yard trips on purpose: a checkout walk to her waiting owner, the
  // nightfall walk-home, and the post-hatch walk back to mom's cage all start
  // non-reversible, so a tap on one of those does nothing here — same as
  // before this issue (judgment call: the issue's own suggested narrowing,
  // "seems safest", flagged in the report rather than silently applied to
  // every walk).
  _reverseWalk(stay) {
    const walk = this._walkers.find((w) => w.stay === stay);
    if (!walk || !walk.reversible) return;
    this._walkers = this._walkers.filter((w) => w !== walk);
    if (walk.dir === 'toYard') this._startWalkHome(stay, { reversible: true });
    else this._walkToYard(stay);
  }

  // Arrival end of a walk: she's standing where she was headed, so re-render
  // her there. A full re-render (rather than nudging the existing sprites) is
  // what re-derives everything positional in one place — cage-anchored
  // nameplate vs. floating one, wander bounds, her blanket's day/night
  // placement — with no chance of the two paths drifting apart.
  _settleInCage(stay, cageIndex) {
    stay.location = LOCATION.CAGE;
    stay.cageIndex = cageIndex;
    const spot = cageAnimalSpot(CAGES[cageIndex]);
    this._refreshCageArt();
    this._renderStay(stay, spot.x, spot.y);
    // Issue #46: home at night means straight under the blanket.
    if (this.night.active) this._tuckIn(stay);
  }

  _settleInYard(stay) {
    stay.location = LOCATION.YARD;
    const rec = this._staySprites.get(stay);
    this._renderStay(stay, rec ? rec.sprite.x : YARD_RECT.x, rec ? rec.sprite.y : YARD_RECT.y);
  }

  // Next open cage anywhere in the kennel, or null if every one is taken —
  // the self-assign fallback for a pet with no cage of her own (only reachable
  // now for a stay restored from a pre-#54 save). Issue #54: delegates to
  // roster.findOpenCage so it picks in the same bottom-row-first, left-to-right
  // PHYSICAL order as check-in, instead of the scattered sections-then-slots
  // order this used to walk.
  _findAnyOpenCage(except = null) {
    return findOpenCage(this.roster.stays, except);
  }

  // Issue #36 ("owners should actually walk in to pick them up", and no
  // checkouts overnight): a due stay is just FLAGGED ready here — she stays
  // right where she is, in her cage, with a small "ready to go home" icon —
  // and an owner NPC walks in and waits at reception, same convention as an
  // arriving owner. The actual checkout only happens once she reaches that
  // waiting owner — issue #45: the player opens her cage and she walks over
  // herself (_openCage / _completeCheckout below).
  _flagCheckoutsReady(day) {
    // Owner note 2026-07-29: "don't have SO many owners come to pick-up at
    // once" — cap simultaneous waiting checkout owners, same convention as
    // arrivals' `_lingeringOwners.size >= 3` cap. A stay whose checkout is
    // due but doesn't fit gets picked up again on a later hour tick once the
    // player's delivered someone else and freed up room.
    const room = Math.max(0, CHECKOUT_OWNER_CAP - this._checkoutOwners.size);
    if (room === 0) return;
    for (const stay of this.roster.flagCheckoutReady(day, room)) {
      this._setNeedIcon(stay, 'checkout', true);
      this._runOwnerCheckout(stay);
      // Issue #67 (owner): a pet out playing when her checkout day comes up
      // walks herself back to her own cage to wait, instead of being skipped
      // and deferred until she happened to come back in on her own. Same
      // walker nightfall uses (issue #45's _startWalkHome) — no second
      // implementation, and it already guards against starting a second walk
      // for someone who's mid-journey. Once she's home she's an ordinary
      // checkout-ready caged pet: the icon shows, and opening her cage sends
      // her to her waiting owner.
      //
      // Robustness: if the player interrupts the walk (picks her up, sets her
      // back down out in the yard), nothing here latches — she keeps
      // `checkoutReady`, and _resolveDropoff's existing carry-her-to-her-owner
      // fallback still completes the checkout from anywhere.
      //
      // Issue #77: a fish at the pond is the deliberate exception — she has
      // no legs to walk herself home with, so she just stays at the pond
      // with her "ready to go home" icon showing until the player physically
      // carries her travel tank to her waiting owner (_resolveDropoff's
      // carry-to-owner fallback above handles that from anywhere, pond
      // included, with no self-walk involved).
      if (stay.location === LOCATION.YARD && stay.animal.species !== 'fish') this._startWalkHome(stay);
    }
  }

  // Walks a collection owner in from the front door to wait at reception
  // (mirrors _runOwnerDropOff's walk-in, just with no pet in hand and no
  // container prop — she's here to collect, not deliver). Multiple waiting
  // checkout owners spread out in their own small grid, offset from the
  // arriving-owner reception area so the two waiting crowds don't overlap.
  _runOwnerCheckout(stay) {
    const doorX = (FRONT_DOOR.x0 + FRONT_DOOR.x1) / 2;
    const doorY = ROOM.y + ROOM.h - WALL - 2;
    const { rug } = RECEPTION;
    const waiting = this._checkoutOwners.size;
    const waitX = rug.x + rug.w + 40 + (waiting % 3) * 40;
    const waitY = rug.y + 24 + Math.floor(waiting / 3) * 42;

    const owner = this.add.sprite(doorX, doorY, 'owner-npc').setOrigin(0.5, 1).setDepth(doorY);
    // Owner note 2026-07-29: "can we put pet names above the heads of the
    // owners waiting to pick up their pets?" — so it's obvious at a glance
    // which owner goes with which cage/pet.
    const tag = this._addNameTag(owner.x, owner.y - OWNER_W * 1.1, stay.animal.name);
    tag.container.setVisible(true).setDepth(9000);
    // waitX/waitY is where she'll be standing — issue #45's opened-cage walk
    // targets that fixed spot rather than her live position mid-walk-in.
    const rec = { sprite: owner, tag, arrived: false, waitX, waitY };
    this._checkoutOwners.set(stay, rec);

    this.tweens.add({
      targets: owner, x: waitX, y: waitY, duration: 1500, ease: 'Sine.easeInOut',
      onUpdate: () => {
        owner.setDepth(owner.y);
        tag.container.setPosition(owner.x, owner.y - OWNER_W * 1.1 - tag.height);
      },
      onComplete: () => {
        rec.arrived = true;
        this.game.events.emit(EVENTS.NOTIFY, `It's time for ${stay.animal.name} to go home!`);
      },
    });
  }

  // Fires once the checkout-ready stay has actually reached her waiting
  // owner — normally by walking there herself the moment the player opens
  // her cage (issue #45's `_openCage`), or by being carried over from the
  // yard (_resolveDropoff's fallback). Either way she's handed off (her
  // sprites simply disappear, the same "carryProp.destroy()" beat
  // _runOwnerDropOff uses in reverse), the owner walks back out with her,
  // and the roster-side bookkeeping/payout runs exactly as before.
  _completeCheckout(stay) {
    const rec = this._checkoutOwners.get(stay);
    this._checkoutOwners.delete(stay);
    this._setNeedIcon(stay, 'checkout', false);
    // She walked over on her own two feet: her own sprites are what needs
    // clearing. (When she was carried instead, it's the carry visual.)
    this._destroyStaySprites(stay);
    // Issue #53: whoever's carrying her (any active player, not just Player
    // 1) has her carry visual cleared too — this fires both from a real
    // player-triggered drop-off AND from the automatic "she walked herself
    // over" path (_openCage), so it can't assume a specific actor.
    this._clearCarryingFor(stay);

    if (rec) {
      rec.tag?.container.destroy(); // the pet's gone now — no more name to show
      const doorX = (FRONT_DOOR.x0 + FRONT_DOOR.x1) / 2;
      const doorY = ROOM.y + ROOM.h - WALL - 2;
      this.tweens.add({
        targets: rec.sprite, x: doorX, y: doorY, duration: 1500, ease: 'Sine.easeInOut',
        onUpdate: () => rec.sprite.setDepth(rec.sprite.y),
        onComplete: () => rec.sprite.destroy(),
      });
    }

    this.roster.finalizeCheckout(stay);
    this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} went home!`);
    this._payOutForCheckout(stay);
    this._syncTieBreakers(); // whoever's left may no longer need a collar
    this._refreshCageArt(); // her cage may now read as empty (issue #27)
  }

  // Issue #53: clears `stay` out of whichever active player is holding her
  // (there's at most one, but which one varies with multiple players), or
  // does nothing if nobody currently is. Factored out so call sites that
  // don't know/care who's carrying — an automatic arrival, a checkout — don't
  // have to hunt through this.activePlayers themselves.
  //
  // Issue #81: an AI helper working her own 'carrying' task holds `carrying`/
  // `carryVisual` directly on her own helper object (not through an
  // activePlayers actor — see _buildHelpers) whenever she's not currently
  // player-controlled, so she has to be checked here too, or a checkout
  // completed while she's mid-hand-off would leave her stuck holding a
  // carryVisual pointing at now-destroyed sprites.
  _clearCarryingFor(stay) {
    const holders = this.helpers ? [...this.activePlayers, ...this.helpers] : this.activePlayers;
    for (const actor of holders) {
      if (actor.carrying !== stay) continue;
      actor.carryVisual?.parts.forEach(({ obj }) => obj.destroy());
      actor.carryVisual = null;
      actor.carrying = null;
    }
  }

  // Issue #12 ("Doing a Great Job"): the owner pays for the stay a moment
  // after she goes home, and — if roster.finalizeCheckout flagged her as a
  // returning guest earning new stuff this time — a follow-up flavor line
  // about the upgrade. Same delayed-notify chaining as the reception
  // computer's baby-announcement flow (_useComputer): no lock is needed here
  // since nothing else waits on this stay once she's checked out.
  _payOutForCheckout(stay) {
    const amount = computePayout(stay);
    const kind = stay.newUpgrade;
    this.time.delayedCall(1000, () => {
      this.economy.earn(amount);
      this.game.events.emit(EVENTS.MONEY_CHANGE, { total: this.economy.total });
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name}'s owner paid you $${amount}!`);
      if (kind) {
        this.time.delayedCall(1200, () => {
          this.game.events.emit(EVENTS.NOTIFY, upgradeMessage(stay.animal.name, kind));
        });
      }
    });
  }

  // ── Telling look-alikes apart (issue #16) ─────────────────────────────────
  // Coats are dealt from a shuffled deck of every coat×pattern combination, so
  // two same-species guests rarely match — but a litter of puppies, or a busy
  // day once a species' combinations are used up, will. data/distinguish.js
  // works out who then needs a coloured collar (and, if the collars run out
  // too, a small ID tattoo); both get drawn straight into the animal's art.

  // Every animal physically in the kennel right now — placed stays, arrivals
  // still waiting at reception, whatever's in the player's hands, and every
  // baby travelling with a mom.
  _presentAnimals() {
    const out = [];
    for (const stay of this.roster.stays) {
      out.push(stay.animal, ...stay.companions);
    }
    return out;
  }

  _tieBreakers() {
    return resolveTieBreakers(this._presentAnimals());
  }

  // Adds one animal sprite: builds its 6-frame sheet for the coat/pattern (plus
  // collar/tattoo if it needs one), scales the super-sampled art down, and
  // starts the idle bob so a standing animal is visibly alive.
  _addAnimalSprite(x, y, animal, stage, tieBreakers) {
    const look = effectiveLook(animal, tieBreakers);
    const base = ensureAnimalTextures(this, animal.species, stage, look);
    const sprite = this.add.sprite(x, y, `${base}_idle_0`)
      .setOrigin(0.5, 1)
      .setScale(ANIMAL_DISPLAY_SCALE)
      .setDepth(y);
    sprite.play(`${base}_idle`);
    return sprite;
  }

  // Issue #21: draws a stay's own animal sprite composed with her carry
  // container (leash/cage/box/basket) rather than standing bare — used
  // whenever she's still "arriving" (at reception) so she reads as freshly
  // dropped off, not already settled in. Returns the animal sprite (callers
  // hang name tags/companions off it same as any other render) plus every
  // extra display object the container art added, for the caller's own
  // cleanup list.
  //
  // LEASH: she stands beside her leash (no overlap needed). CAGE: the
  // carrier's solid shell is drawn IN FRONT of her (same anchor point) with a
  // see-through wire door, so she visibly peeks out rather than standing
  // free. BOX/BASKET: the open terrarium-style carrier sits BEHIND her (or
  // her eggs, drawn separately by the caller) — she's simply sitting inside
  // a low, see-through tray, nothing needs to occlude her.
  _addContainedAnimal(x, y, stay, tb) {
    const { animal, carryKind } = stay;
    const extras = [];
    if (carryKind === CARRY_KIND.LEASH) {
      const sprite = this._addAnimalSprite(x, y, animal, animal.stage, tb);
      const lx = x + sprite.displayWidth * 0.6;
      extras.push(this.add.image(lx, y, CARRY_KEY[carryKind]).setOrigin(0.5, 1).setScale(CARRY_DISPLAY_SCALE).setDepth(y - 0.5));
      return { sprite, extras };
    }
    if (carryKind === CARRY_KIND.CAGE) {
      const sprite = this._addAnimalSprite(x, y, animal, animal.stage, tb);
      extras.push(this.add.image(x, y, CARRY_KEY[carryKind]).setOrigin(0.5, 1).setScale(CARRY_DISPLAY_SCALE).setDepth(y + 0.5));
      return { sprite, extras };
    }
    // BOX / BASKET — open carrier drawn behind her (and behind the eggs the
    // caller adds separately for the basket case).
    extras.push(this.add.image(x, y, CARRY_KEY[carryKind]).setOrigin(0.5, 1).setScale(CARRY_DISPLAY_SCALE).setDepth(y - 0.5));
    const sprite = this._addAnimalSprite(x, y, animal, animal.stage, tb);
    return { sprite, extras };
  }

  // A cheap string capturing every look decision this stay's render depended
  // on, so a later arrival that changes them can trigger a redraw.
  _lookSignature(stay, tieBreakers) {
    return [stay.animal, ...stay.companions]
      .map((a) => lookId(effectiveLook(a, tieBreakers)))
      .join('|');
  }

  // An arrival or a checkout can create (or dissolve) a look-alike pair among
  // animals ALREADY on screen, so re-render any stay whose collars/tattoos have
  // just changed. Cheap: the signature check short-circuits the common case.
  _syncTieBreakers() {
    const tb = this._tieBreakers();
    for (const [stay, rec] of [...this._staySprites.entries()]) {
      if (this._lookSignature(stay, tb) !== rec.lookSig) {
        this._renderStay(stay, rec.pos.x, rec.pos.y);
      }
    }
  }

  // Draws (or redraws) a stay's standing sprite + name tag + companions (baby
  // sprites, or eggs for a turtle mom with hasEggs) at a fixed world position —
  // used for both reception-waiting and section-placed stays.
  _renderStay(stay, x, y, opts = {}) {
    // Issue #62: babies own a world position of their own now, so a redraw
    // must not silently re-form the litter into formation beside mom. Grab
    // where they actually were BEFORE the old record is torn down — the baby
    // loop below keeps any that are still plausibly around this anchor (see
    // BABY_KEEP_RADIUS) and only re-forms the ones that clearly aren't.
    const prevBabies = this._staySprites.get(stay)?.babies || [];
    this._destroyStaySprites(stay);
    const { animal } = stay;
    const tb = this._tieBreakers();
    // Issue #21: a fresh arrival still waiting at reception shows contained
    // in her leash/carrier/box/basket from the moment she appears, not as a
    // bare animal — she only "comes out" once dropped off into her section
    // (see _dropOff/_playUnboxing). CARRY_KIND.NONE species (guinea pig/
    // hamster/bunny/bird-without-eggs) are just gently held either way, per
    // DESIGN.md, so they always render bare.
    const contained = stay.location === LOCATION.RECEPTION && stay.carryKind !== CARRY_KIND.NONE;
    let sprite, containerExtras;
    if (contained) {
      ({ sprite, extras: containerExtras } = this._addContainedAnimal(x, y, stay, tb));
    } else {
      sprite = this._addAnimalSprite(x, y, animal, animal.stage, tb);
      containerExtras = [];
    }
    // Issue #22 #3: scale family spacing to the actual cage/island/yard
    // size available, so a family "reads as together but with breathing
    // room" without spilling out of a small individual cage. `spread` is a
    // multiplier around a ~90px baseline cage width. This one stays keyed
    // off stay.location on purpose — it's about where she's ACTUALLY
    // physically standing right now (a cage, or the yard), for wander/
    // spread bounds.
    const cage = stay.location === LOCATION.CAGE ? CAGES[stay.cageIndex] : null;

    // Nameplate: a stay with a cage of her own doesn't get one here AT ALL
    // anymore — issue #64 moved the door plate out to _refreshCagePlates,
    // where it's owned by the CAGE and lives and dies with the cage's
    // occupancy rather than with this sprite record. (Its position is
    // unchanged; issue #42 already mounted it top-center on her own cage.
    // What was wrong was its lifetime: picking her up destroys this
    // record, and the plate went with it.)
    //
    // A stay with no cage at all — waiting at reception, or restored from a
    // pre-#54 save — still gets the original floating tag just above her, kept
    // on her position by _updateStayVisuals and proximity-gated like before.
    const homeCage = CAGES[stay.cageIndex];
    const tag = homeCage ? null : this._addNameTag(x, y - sprite.displayHeight - 6, animal.name);
    // Issue #47: one single undivided yard, so a yard-placed stay's bounds
    // are simply the whole play area — no per-zone lookup to lose track of
    // on a redraw (tie-breaker sync, a birth landing, the computer flow).
    // Issue #77: a fish is the one exception — she lives at the shared pond,
    // not the whole yard (she has no legs to wander further than that), so
    // her bounds are the small POND_RECT instead. This is what keeps both her
    // own wander (_updateWander) and any hatchlings' wander (_updateBabies)
    // confined to the pond rather than roaming the grass around it.
    //
    // Issue #84: POND_RECT alone was NOT enough. It's the pond texture's
    // bounding square, and the water inside it is an ellipse — so the rect's
    // corners are grass, and that's where a drifting fish ended up ("they
    // look like they're on the grass sometimes"). `inPond` below flags her so
    // both wander loops swap the rect clamp for the real elliptical water
    // clamp (data/props.js's clampToPondWater); the rect stays as the coarse
    // "does she have bounds at all" record every other system reads.
    const inPond = !cage && stay.location === LOCATION.YARD && animal.species === 'fish';
    const bounds = cage || (stay.location === LOCATION.YARD
      ? (inPond ? POND_RECT : YARD_RECT)
      : null);
    const spread = Math.min(1.7, Math.max(0.9, (bounds?.w ?? 90) / 90));

    // Turtle/snake/bird/lizard eggs/babies sit tucked close to mom on her own
    // individual island/perch/nest/terrarium (small space, plenty of room to
    // share) — tighter spacing than the wider spread used for cat/dog
    // companions. Keyed off the eggs-or-babies family (data/species.js) rather
    // than a hand-maintained species list, so a new egg-laying species (issue
    // #28's lizards) can't be forgotten here; the secret dragon shares that
    // family too, which is exactly the behavior she already had.
    const sharesHome = SPECIES[animal.species]?.family === FAMILY.EGGS_OR_BABIES;
    const extras = [...containerExtras];
    // Issue #48: everything that belongs to the ANIMAL rather than to her
    // cage — her eggs, her little gold upgrade sparkles, an arrival's carry
    // container — rides along at a fixed offset from her sprite, so it
    // follows her while she wanders (and while she walks herself somewhere,
    // issue #45) instead of being left behind at her original placement.
    const followers = containerExtras.map((obj) => ({ obj, dx: obj.x - x, dy: obj.y - y, dz: obj.depth - y }));
    // Issue #57: a clutch that hatched while its mother was off in the yard
    // leaves the hatchlings at the CAGE (that's where the eggs were, and
    // that's where the owner asked them to end up) — so the litter is laid
    // out around the cage, not around her, until she gets home to them. The
    // flag clears itself the moment a render puts her back in her own cage.
    if (stay.babiesAtCage && (!homeCage || stay.location === LOCATION.CAGE)) stay.babiesAtCage = false;
    const babiesAtCage = !!stay.babiesAtCage;
    const babyBase = babiesAtCage ? cageAnimalSpot(homeCage) : { x, y };
    let cx = babyBase.x + sprite.displayWidth * (sharesHome ? 0.4 : 0.55);
    // (Issue #57: her eggs used to be drawn right here, as `extras` that rode
    // along at a fixed offset from her sprite — which is precisely what
    // carried the whole clutch out to the play yard when she went out to
    // play. Eggs belong to the CAGE now; see _refreshCageEggs. A mom with no
    // cage of her own can't have a clutch to leave behind, so there's no
    // fallback needed here.)

    // Companions (a mom's litter). Anyone whose coat+pattern is shared with
    // another animal currently in the kennel gets a coloured collar — and an
    // ID tattoo once the collars run out — drawn straight into their art by
    // the tie-breaker resolution above (data/distinguish.js).
    //
    // Issue #48 bug 2 ("we need to get babies to wander also, not just
    // adults") first gave each baby a drift of her own, but expressed as a
    // jitter around a FIXED offset from mom, with her screen position
    // re-derived from mom's sprite every frame — a litter welded to her in
    // formation, which reads worse and worse the further mom roams (#60).
    //
    // Issue #62 (owner: "baby animals should wander and play SEPARATELY from
    // their grownup", "let babies wander away from mom further, like a lot
    // further"): each baby carries her OWN world position and her own world
    // target instead, and only heads back toward mom once she's past her
    // tether — see _updateBabies. The offset computed here is still useful
    // twice over: it's her starting spot beside mom, and it's the spot she
    // aims for when she IS catching up, which keeps a scampering litter
    // spread out behind mom rather than converging on one point.
    const babies = [];
    const babyLabels = [];
    const babySprites = [];
    for (const baby of stay.companions) {
      const jitterY = (sharesHome ? (Math.random() - 0.5) * 10 : (Math.random() - 0.5) * 8) * spread;
      // Where she actually was a moment ago, if this redraw didn't move mom
      // far — otherwise the formation spot beside her.
      const prev = prevBabies[babies.length];
      const keep = prev && Phaser.Math.Distance.Between(prev.x, prev.y, babyBase.x, babyBase.y) < BABY_KEEP_RADIUS;
      const wx = keep ? prev.x : cx;
      const wy = keep ? prev.y : babyBase.y + jitterY;
      const babySprite = this._addAnimalSprite(wx, wy, baby, 'baby', tb);
      extras.push(babySprite);
      babySprites.push(babySprite);

      // Tiny label under each baby — "???" until the owner named it via the
      // reception computer (issue #10), then its real name. Proximity-gated
      // like every other name tag (issue #22 #2), and it follows its baby
      // around now (issue #48).
      const label = this.add.text(wx, wy + 2, baby.name || BABY_PLACEHOLDER, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#4a341c',
        backgroundColor: '#ffffffb0',
        padding: { x: 2, y: 0 },
      }).setOrigin(0.5, 0).setDepth(wy + 0.2).setVisible(false);
      extras.push(label);
      babyLabels.push(label);

      babies.push({
        sprite: babySprite,
        label,
        species: baby.species,
        bx: cx - x,        // her formation offset beside mom (catch-up target)
        by: jitterY,
        x: wx, y: wy,      // her own world position
        tx: keep ? prev.tx : wx,
        ty: keep ? prev.ty : wy,
        chasing: keep ? prev.chasing : false,
        t: keep ? prev.t : pickWanderInterval(baby.species),
      });

      cx += (sharesHome ? 13 : 20) * spread;
    }

    // Issue #12: a small gold sparkle per upgrade this specific animal has
    // earned across her repeat visits, stacked to the left of her sprite so
    // it doesn't collide with the name tag/need icons above or the
    // egg/baby companions to the right — a returning regular visibly has a
    // little more "stuff" each time she's back (DESIGN.md).
    (animal.upgrades || []).forEach((_kind, i) => {
      const dx = -sprite.displayWidth * 0.55 - 4;
      const dy = -sprite.displayHeight * 0.35 - i * 11;
      const star = this.add.image(x + dx, y + dy, UPGRADE_KEY).setOrigin(0.5, 0.5).setDepth(y + 0.1);
      extras.push(star);
      followers.push({ obj: star, dx, dy, dz: 0.1 });
    });

    // Issue #22 #4: a small periodic wander target within her cage/the yard —
    // reception/carrying stays get no bounds, so they simply don't wander.
    // In a cage she drifts around the middle of it, exactly as before. Out in
    // the yard she drifts around HER OWN placement spot instead (issue #47):
    // it's one big undivided area now, and a shared center-of-bounds anchor
    // would slowly gather everyone out there into a single heap.
    const wanderBounds = bounds ? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } : null;
    const wanderAnchor = cage
      ? { x: cage.x + cage.w / 2, y: cage.y + cage.h / 2 }
      : (wanderBounds ? { x, y } : null);

    const rec = {
      pos: { x, y }, sprite, tag, extras, followers, babies, babyLabels, babySprites,
      needIcons: {}, blanket: null, walking: false,
      wanderBounds, wanderAnchor, wander: null, inPond,
      // Issue #57: the clutch's fixed spot in her cage, when she has one —
      // where _layOutNeedIcons parks the "ready to hatch" heart, so it stays
      // with the eggs instead of floating over a mother who's out playing.
      eggCageSpot: this._eggCageSpot(stay),
      // Issue #57: a clutch that hatched while she was away leaves the
      // hatchlings AT the cage; they anchor there (not to her) until she gets
      // home — see _updateBabies.
      babyAnchor: babiesAtCage ? cageAnimalSpot(homeCage) : null,
      babyBounds: babiesAtCage ? homeCage : null,
      // What this render assumed about tie-breakers, so _syncTieBreakers can
      // tell when an arrival/checkout has changed who needs a collar.
      lookSig: this._lookSignature(stay, tb),
    };
    this._staySprites.set(stay, rec);
    // Re-show any indicator for a need the animal already had before this
    // (re-)render, e.g. after a section dropoff mid-need.
    for (const key of Object.keys(stay.needs || {})) {
      if (stay.needs[key]) this._setNeedIcon(stay, key, true);
    }
    // Issue #46: her cage's blanket survives a redraw the same way — folded
    // in the cage by day, draped over her once she's under it at night.
    this._refreshBlanket(stay);
    // Issue #77: a fish's persistent travel tank (resting beside her home
    // tank, or at the pond's edge while she's out playing) survives a
    // redraw the same way — no-op for every other species.
    this._refreshTravelTank(stay);
    // Issue #9 refinement: a mom flagged "ready, needs your help" keeps her
    // heart icon across a redraw too.
    if (stay.birthReady) this._setNeedIcon(stay, 'babies', true);
    // Issue #36: a stay flagged ready-for-checkout (waiting owner already
    // walked in) keeps her "ready to go home" icon across a redraw too.
    if (stay.checkoutReady) this._setNeedIcon(stay, 'checkout', true);
    // Issue #37: a mom with new babies/hatchlings not yet photographed keeps
    // her "take a picture" camera icon across a redraw too.
    if (stay.needsAnnouncement && !stay.photoTaken) this._setNeedIcon(stay, 'photo', true);

    // Issue #45: a redraw can land mid-WALK (a tie-breaker sync when someone
    // new arrives, a birth completing) — hand her in-flight walk the fresh
    // sprite so she carries on to where she was going, instead of being
    // stranded halfway with a destroyed one.
    const walk = this._walkers.find((w) => w.stay === stay);
    if (walk) {
      walk.sprite = sprite;
      this._setStayMoving(rec, true);
    }
  }

  _destroyStaySprites(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    rec.sprite.destroy();
    // Issue #64: `tag` is null for anyone with a cage of her own — her plate
    // is the CAGE's now (_refreshCagePlates), and must survive exactly the
    // teardown this method performs (picking her up, a redraw mid-walk).
    rec.tag?.container.destroy();
    rec.extras.forEach((e) => e.destroy());
    Object.values(rec.needIcons).forEach((icon) => icon.destroy());
    rec.blanket?.destroy();
    rec.travelTank?.destroy();
    this._staySprites.delete(stay);
  }

  // Small hanging name placard, sized to fit `name` (issue #22 #1 — long
  // names like "Snickerdoodle" must not clip), anchored so its bottom sits
  // at (x, y). Hidden by default; toggled per-frame by proximity to the
  // player (issue #22 #2 — see _updateNameTagVisibility). Returns
  // {container, width, height} so callers can destroy/reposition it.
  _addNameTag(x, y, name, opts = {}) {
    const text = this.add.text(0, 3, name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#4a341c',
    }).setOrigin(0.5, 0);
    const width = Math.max(34, Math.ceil(text.width) + 16);
    const height = 20;
    const parts = [];
    // Issue #73 (owner: "if you're holding a pet, there should be a slight
    // highlight of some kind on its cage nameplate"; revised same day — "needs
    // to change the background color of the plate, not do a glow like that")
    // — the plate's own fill swaps to a warmer gold and its border brightens,
    // so the cage a carried pet belongs to is findable at a glance. No glow
    // graphic, no tween.
    const bg = this.add.graphics();
    bg.fillStyle(opts.highlight ? 0xf5c95c : 0xead9b3, 1).fillRoundedRect(-width / 2, 0, width, height - 2, 4);
    bg.lineStyle(2, opts.highlight ? 0xd8a63c : 0xa9824a, 1).strokeRoundedRect(-width / 2 + 1, 1, width - 2, height - 4, 4);
    bg.fillStyle(0x8a6a3e, 1);
    bg.fillCircle(-width / 2 + 6, 3, 2);
    bg.fillCircle(width / 2 - 6, 3, 2);
    parts.push(bg, text);
    const container = this.add.container(x, y - height, parts).setDepth(9000).setVisible(false);
    return { container, width, height };
  }

  // Every frame: a tag fixed to a cage door is a permanent nameplate, always
  // visible — you can read who lives there from across the room, same as a
  // real kennel. Only a tag following an animal that's "out and about"
  // (reception, carrying, out playing in the yard) stays proximity-gated
  // (issue #22 #2), since those float in open space rather than being
  // mounted on fixed furniture. Baby under-labels stay proximity-gated
  // either way — they're a separate small detail, not the door nameplate.
  // Proximity is measured against where she actually IS (her live sprite),
  // not her original placement — issue #48.
  _updateNameTagVisibility() {
    // Issue #53: any active player standing close enough reveals a tag — not
    // just Player 1 — so a helper-controlled player reading a nameplate works
    // the same way solo play always has.
    for (const rec of this._staySprites.values()) {
      const near = this.activePlayers.some((a) =>
        Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, rec.sprite.x, rec.sprite.y) <= NAME_TAG_RADIUS);
      // Issue #64: a door plate isn't here anymore — it belongs to the cage
      // and is permanently visible (_refreshCagePlates). Only a tag FLOATING
      // over an animal with no cage of her own is proximity-gated.
      rec.tag?.container.setVisible(near);
      for (const label of rec.babyLabels) label.setVisible(near);
    }
  }

  // Small floating icon showing a stay needs food/water/a bathroom trip —
  // added/removed as the need flips, not recreated per frame. Its actual
  // position is (re)laid out every frame by _updateStayVisuals, since the
  // bubbles belong to the ANIMAL and have to follow her around (issue #48).
  _setNeedIcon(stay, key, show) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    // Issue #57 (owner's correction: "I meant she's allowed to go outside
    // still"): the "ready to hatch" heart belongs with the EGGS, and the eggs
    // stay at her cage — so for an egg mom this icon is drawn as part of the
    // clutch (_refreshCageEggs) instead of floating above her head. Otherwise
    // a clutch that came due while she was out playing would advertise itself
    // in the middle of the yard, nowhere near the eggs the player has to walk
    // up to. Any stray animal-anchored heart is cleared on the way through.
    if (key === 'babies' && rec.eggCageSpot) {
      if (rec.needIcons.babies) {
        rec.needIcons.babies.destroy();
        delete rec.needIcons.babies;
        this._layOutNeedIcons(rec);
      }
      this._refreshCageEggs();
      return;
    }
    if (show) {
      if (rec.needIcons[key]) return;
      rec.needIcons[key] = this.add.image(rec.sprite.x, rec.sprite.y, NEED_KEY[key]).setOrigin(0.5, 1).setDepth(9002);
      this._layOutNeedIcons(rec);
    } else if (rec.needIcons[key]) {
      rec.needIcons[key].destroy();
      delete rec.needIcons[key];
      this._layOutNeedIcons(rec);
    }
  }

  // Issue #48 bug 1 (owner: "the 'needs' for animals don't follow the
  // animal, especially in the play yard that's weird"): the bubbles sit in a
  // little row just above her head, wherever her head currently is. NOT the
  // same treatment as her cage nameplate, which is deliberately bolted to
  // the cage door (issues #39/#42) and must stay there even while she's out.
  _layOutNeedIcons(rec) {
    const keys = Object.keys(rec.needIcons);
    const s = rec.sprite;
    keys.forEach((key, i) => {
      rec.needIcons[key].setPosition(
        s.x - (keys.length - 1) * 8 + i * 16,
        s.y - s.displayHeight - 6,
      );
    });
  }

  // Every frame: keep everything that belongs to an animal pinned to that
  // animal — her need bubbles, her floating name tag (when she has one), her
  // eggs/upgrade sparkles, and her babies (who do their own gentle drifting
  // around her, see _updateWander). Cheap: a handful of stays, a couple of
  // objects each.
  _updateStayVisuals() {
    for (const rec of this._staySprites.values()) {
      const s = rec.sprite;
      // Her placement anchor tracks her, so any redraw (tie-breaker sync, a
      // birth landing) happens where she's actually standing.
      rec.pos.x = s.x;
      rec.pos.y = s.y;
      for (const f of rec.followers) {
        f.obj.setPosition(s.x + f.dx, s.y + f.dy).setDepth(s.y + f.dz);
      }
      // Issue #62: a baby's position is her OWN now (moved by _updateBabies,
      // in world space) rather than mom's position plus an offset — this just
      // paints her sprite and her little label wherever she's got to. Her
      // label following her is what the issue means by "her name label must
      // follow her"; it already worked, and still does, because it's derived
      // from the same one position.
      for (const baby of rec.babies) {
        baby.sprite.setPosition(baby.x, baby.y).setDepth(baby.y + 0.2);
        baby.label.setPosition(baby.x, baby.y + 2).setDepth(baby.y + 0.3);
      }
      this._layOutNeedIcons(rec);
      if (rec.tag) {
        rec.tag.container.setPosition(s.x, s.y - s.displayHeight - 6 - rec.tag.height);
      }
    }
  }

  // ── Carrying (issue #5, extended by issue #20, narrowed by issue #45) ────
  // Carrying is now specifically how a pet gets a CAGE: press interact near
  // an animal out in the play yard to pick her up (always carried bare) and
  // carry her in to any open cage, which is what gives her a nameplate and
  // bowls of her own. Taking a settled pet OUT is no longer a carry at all —
  // you open her cage and she walks out herself (_openCage, issue #45).
  // (A reception pickup is still supported for a stay restored from an
  // older save that was left waiting at the desk.)

  // `actor` is whichever active player (Player 1 or a claimed helper)
  // pressed handle (issue #53) — she's the one whose hands the pet rides in.
  _pickUp(actor, stay) {
    actor.carryOrigin = stay.location;
    // Issue #25: this was the last waiting reception stay her owner was
    // lingering beside — now that the player's taking the pet, the owner
    // walks back out through the front door and despawns.
    if (actor.carryOrigin === LOCATION.RECEPTION) this._walkOwnerOut(stay);
    this._destroyStaySprites(stay);
    stay.location = LOCATION.CARRYING;
    actor.carrying = stay;
    if (stay.checkoutReady) {
      // Issue #93 (owner: "when a pet is sent to go home or picked up to go
      // home, immediately make their previous cage available"): a
      // checkout-ready stay picked up directly (issue #82's hold-to-pick-up
      // straight out of her cage, or a helper's stranded-checkout carry) is
      // being carried out for GOOD here, not just taken out to play — she's
      // not coming back to this cage, so unlike the ordinary case below it
      // frees up right now instead of staying reserved for a hand-off that's
      // about to happen anyway. Full art refresh, not just furniture, since
      // occupancy itself changed — the freed cage's own look reverts to
      // empty too.
      stay.cageIndex = null;
      this._refreshCageArt();
    } else {
      // Keeps the cage's bowl/litter box in sync the instant she's picked back
      // up — _refreshCageArt isn't otherwise called on pickup (cage ART itself
      // only changes per-occupant in generalized mode, refreshed on the next
      // drop-off/checkout), so these need their own explicit refresh.
      // Issue #54: her cage stays HERS while she's in the player's hands (she
      // was assigned it at check-in, and only a drop-off elsewhere re-points
      // it), so these now leave her bowls/litter box in place rather than
      // clearing them — same as a yard trip already did. That supersedes the
      // owner's 2026-07-29 note about bowls disappearing on pickup, which was
      // written when being carried genuinely meant having no cage at all.
      // Issue #64 ("name tag should remain on an assigned cage no matter what.
      // Even if they just arrived or if they're currently held"): her door plate
      // is cage furniture now, so this refresh is what re-asserts it right after
      // _destroyStaySprites above tore her sprite record down — and
      // the occupancy rule still counts her as this cage's occupant while she's
      // in the player's hands, so the plate simply stays.
      this._refreshCageFurniture();
    }
    // Arrivals with a carry prop (leash/cage/box/basket) ride in that prop,
    // composed with her own sprite the same "contained" way she showed at
    // reception (issue #21) — everything else (small pets, or any settled
    // animal taken out to play) is carried bare, so just its own animated
    // sprite rides along.
    const anchorX = actor.sprite.x, anchorY = actor.sprite.y;
    let sprite, extraObjs;
    // Issue #77: a fish rides in her travel tank EVERY time she's picked up,
    // not just on her first arrival from reception — it's the only way she
    // ever moves, so unlike a settled cat/dog taken out for a yard trip
    // (carried bare), she's never without it.
    const alwaysContained = stay.carryKind === CARRY_KIND.TANK;
    if (alwaysContained || (actor.carryOrigin === LOCATION.RECEPTION && stay.carryKind !== CARRY_KIND.NONE)) {
      ({ sprite, extras: extraObjs } = this._addContainedAnimal(anchorX, anchorY, stay, this._tieBreakers()));
    } else {
      sprite = this._addAnimalSprite(anchorX, anchorY, stay.animal, stay.animal.stage, this._tieBreakers());
      extraObjs = [];
    }
    // Every part follows the carrying player as one group — record each
    // part's offset from the shared anchor point at creation time so
    // _followCarry can just re-apply it every frame without needing to know
    // per-container layout.
    const parts = [sprite, ...extraObjs].map((obj) => ({ obj, dx: obj.x - anchorX, dy: obj.y - anchorY }));
    parts.forEach(({ obj }) => obj.setDepth(9500));
    actor.carryVisual = { parts };
  }

  _followCarry(actor) {
    if (!actor.carryVisual) return;
    const ax = actor.sprite.x;
    const ay = actor.sprite.y - PLAYER_H * 0.55;
    actor.carryVisual.parts.forEach(({ obj, dx, dy }, i) => {
      obj.x = ax + dx;
      obj.y = ay + dy;
      obj.setDepth(actor.sprite.y + 1 + i * 0.01);
    });
  }

  // Issue #32: "By Type" mode is gone — there's only one cage layout now, so
  // every drop-off path uses the same "any pet, any open cage" placement:
  // walking up to a specific empty cage anywhere targets THAT exact cage
  // (_findOpenCageNear), and an explicit interact press is required to
  // actually place her there (proximity alone only highlights the target) —
  // same convention as every other interaction in the game. The one
  // exception is bringing her back in from the yard, which keeps its
  // original walk-up-and-it-happens feel (no interact needed), same as
  // before.
  // Issue #58: same resolve-then-run split as everything else — this returns
  // what the HANDLE button would do with whoever's in the player's hands right
  // now (and what to call it on screen), without doing it. An
  // `auto: true` target is one that has always fired on proximity alone, with
  // no press (see the reception → yard case below).
  // `actor` is whichever active player is holding `actor.carrying` (issue
  // #53) — every position check below is against HER position, not
  // necessarily Player 1's.
  _resolveDropoff(actor) {
    const stay = actor.carrying;
    if (!stay) return null;
    const name = stay.animal.name;
    // Issue #36: a checkout-ready stay goes home, not back into a cage —
    // regardless of where she was picked up from, walking her over to her
    // waiting owner (once actually arrived at reception) and interacting
    // completes the checkout. She can't be placed in a cage or the yard
    // while in this state.
    //
    // Issue #45 moved the NORMAL checkout hand-off to "open her cage and she
    // walks over herself" — this branch survives as the fallback for the one
    // case that can't use it: she was already out in the yard (so there's no
    // cage to open) when her checkout came due.
    if (stay.checkoutReady) {
      const rec = this._checkoutOwners.get(stay);
      if (!rec?.arrived) return null;
      if (!this._inRange(actor, rec.sprite.x, rec.sprite.y)) return null;
      return { label: `Give ${name} back to her owner`, run: () => this._completeCheckout(stay) };
    }
    // Issue #77: a fish has no legs — she never walks herself anywhere, so
    // wherever she goes is wherever the player physically carries her travel
    // tank. Setting her "down to play" only makes sense at the ONE shared
    // pond (there's nowhere else for her to swim), so unlike every other
    // species — who can be set down anywhere in the yard — she's gated on
    // being right at the pond, not just generally out in the grass.
    //
    // Issue #84: measured against the NEAREST BIT of the pond, not its
    // centre. At #77's 130x90 those were near enough the same thing; at
    // 260x180 a player standing right at the water's edge is 130px from the
    // middle and would have been told she wasn't at the pond at all.
    const isFish = stay.animal.species === 'fish';
    const pondReach = pondReachPoint(actor.sprite.x, actor.sprite.y);
    const inYard = isFish
      ? this._inRange(actor, pondReach.x, pondReach.y)
      : actor.sprite.x >= OUTSIDE.x + 8;
    const toYard = () => (isFish ? {
      label: `Set ${name}'s travel tank down at the pond`,
      run: () => { this._dropFishAtPond(actor, stay); actor.carryOrigin = null; },
    } : {
      label: `Put ${name} down to play`,
      run: () => { this._dropOffToYard(actor, stay); actor.carryOrigin = null; },
    });
    const toCage = (fromReception) => {
      // Walking up to ANY specific currently-empty cage anywhere accepts the
      // drop into THAT exact cage, regardless of species (no clustering —
      // this also covers the secret bonus dragon, who has no species-matching
      // cage art of her own until she's actually settled somewhere).
      // Issue #54: `stay` is passed so the cage she already holds isn't
      // counted against her — she's about to release it by taking this one.
      const found = this._findOpenCageNear(actor.sprite.x, actor.sprite.y, stay);
      if (found == null) return null;
      return {
        label: isFish ? `Set ${name}'s travel tank back by her cage` : `Put ${name} in this cage`,
        run: () => { this._dropOff(actor, stay, found, { fromReception }); actor.carryOrigin = null; },
      };
    };

    if (actor.carryOrigin === LOCATION.YARD) {
      // Picked up from the yard — she can go right back into the yard
      // (change your mind / move her to a different spot), OR come back
      // inside to any open cage.
      return inYard ? toYard() : toCage(false);
    }
    if (actor.carryOrigin === LOCATION.RECEPTION) {
      // Owner note 2026-07-29 ("why can't I take a pet directly to the play
      // yard?"): a fresh arrival can go straight to the yard instead of a
      // cage — checked FIRST, as an ADDITIONAL option alongside (not instead
      // of) cage placement below, same walk-up-and-it-happens feel as every
      // other yard drop-off (no interact needed).
      if (inYard) return { ...toYard(), auto: true };
      return toCage(true);
    }
    // Picked up from her own cage — she can go out to the yard to play, OR
    // right back into any open cage (change your mind / just put her back).
    //
    // Owner note 2026-07-29: being in the yard should only highlight/enable
    // setting her down there — an explicit interact press is needed to
    // actually place her, same as every other drop-off target, rather than
    // auto-placing the instant she crosses into the yard.
    return inYard ? toYard() : toCage(false);
  }


  // Settles the carried stay into cage `cageIndex`, which the caller has
  // already established is free and within reach (_findOpenCageNear).
  //
  // Issue #71 simplified this a great deal. It used to take a SECTION and
  // either an explicit slot within it or an auto-picked one, and had to
  // handle "that section's six cages are all taken" as a declined drop — a
  // whole failure path that existed only because a cage's identity was a
  // (species, slot) pair. A cage is a single free-or-not index now, checked
  // before this is ever called, so the drop always succeeds.
  _dropOff(actor, stay, cageIndex, opts = {}) {
    actor.carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    actor.carryVisual = null;
    actor.carrying = null;
    stay.location = LOCATION.CAGE;
    // A late dropoff during the night (rare — only if the player was still
    // mid-carry when night fell): she gets under her cage's blanket the same
    // automatic way as everyone else (issue #46) — see the _tuckIn below.
    // Her companions/babies share the cage, same "near mom" render as always.
    stay.cageIndex = cageIndex;
    this._refreshCageArt();
    const pos = this._cageSpotFor(stay);
    // Issue #21: a fresh arrival (not a yard-return) resolves out of her
    // carry container right here — a quick fade+shrink "let out of the box/
    // carrier" beat — before _renderStay draws her bare-in-cage look (which
    // it does automatically now that her location is no longer 'reception').
    // Issue #77: a fish's travel tank never fades away like this — it's a
    // PERSISTENT prop (_refreshTravelTank, called from _renderStay below),
    // not a one-time reception hand-off container.
    if (opts.fromReception && stay.carryKind !== CARRY_KIND.NONE && stay.carryKind !== CARRY_KIND.TANK) {
      this._playUnboxing(pos.x, pos.y, stay.carryKind);
    }
    this._renderStay(stay, pos.x, pos.y);
    // Issue #46: carried home after nightfall — straight under the blanket.
    if (this.night.active) this._tuckIn(stay);
  }

  // The container art fades and shrinks away at the drop-off spot — a small,
  // simple "she's out and settled now" beat, not required to be elaborate.
  _playUnboxing(x, y, carryKind) {
    const img = this.add.image(x, y, CARRY_KEY[carryKind])
      .setOrigin(0.5, 1).setScale(CARRY_DISPLAY_SCALE).setDepth(y + 0.5);
    this.tweens.add({
      targets: img, alpha: 0, scale: CARRY_DISPLAY_SCALE * 0.6, duration: 420, ease: 'Sine.easeIn',
      onComplete: () => img.destroy(),
    });
  }

  // Places a carried stay out in the yard to play (issue #20). Issue #47:
  // one single undivided play area now, so there's no zone to pick.
  //
  // Issue #61 ("same applies to the player setting a pet down in the yard:
  // near where it makes sense, not a fixed corner slot"): she's set down right
  // where the PLAYER is standing, just nudged clear of her so they don't
  // overlap and clamped inside the fence — the player walked her here, so here
  // is where she goes. (An owner NPC's delivery drops at the gate instead —
  // _openYardSpot — because the owner isn't the one choosing the spot.)
  _dropOffToYard(actor, stay) {
    actor.carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    actor.carryVisual = null;
    actor.carrying = null;
    stay.location = LOCATION.YARD;
    const pos = clampToYard(actor.sprite.x + 26, actor.sprite.y + 6);
    this._renderStay(stay, pos.x, pos.y);
    // Issue #73: she's out of the player's hands, so her cage's nameplate
    // stops being highlighted. (The cage drop-off paths get this via
    // _dropOff/_completeCheckout's own _refreshCageArt; this one didn't
    // refresh cage furniture at all before.)
    this._refreshCageFurniture();
  }

  // Issue #77 — the fish-specific yard drop-off. She doesn't land wherever
  // the player happens to be standing (_dropOffToYard's "nudged clear of
  // you" placement): there's exactly one shared pond, so setting her travel
  // tank down (anywhere within reach of it — see _resolveDropoff's inYard
  // check) always puts her at that same spot, fanned a little from any other
  // fish already there (_fishAtPondCount).
  _dropFishAtPond(actor, stay) {
    actor.carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    actor.carryVisual = null;
    actor.carrying = null;
    stay.location = LOCATION.YARD;
    const pos = pondSwimSpot(this._fishAtPondCount(stay));
    this._renderStay(stay, pos.x, pos.y);
    this._refreshCageFurniture();
  }

  // Where a stay settled in her own cage physically stands — including
  // turtles/snakes, whose "cage" is a small island/perch (issue #20), and the
  // dragon's little castle (issue #32 #5). Falls back to a plain grid spot
  // near reception if she somehow holds no cage at all; every call site has
  // already established she does, so this is a safety net against a crash
  // rather than a real placement.
  _cageSpotFor(stay) {
    const cage = CAGES[stay?.cageIndex];
    if (cage) return cageAnimalSpot(cage);
    const already = this.roster.stays.filter((s) => s !== stay && s.location === LOCATION.CAGE).length;
    return this._gridSlot(RECEPTION.rug, already, 20, 30, 40);
  }

  // The closest currently-EMPTY cage anywhere in the kennel, within pickup
  // range of (px, py), as a CAGES index — or null if nothing open is close
  // enough. Used by _resolveDropoff so walking up to any specific open cage
  // targets THAT exact cage; any pet can go in any cage, no clustering.
  //
  // Owner note 2026-07-29 ("interact... should accept the placement anywhere
  // within the cage, not just towards the bottom"): the acceptance test
  // covers the WHOLE cage rect (plus a small outward buffer), not just
  // proximity to cageAnimalSpot's bottom-anchored point — that point still
  // decides where she visually stands once placed (_cageSpotFor), it just
  // shouldn't gate whether the placement itself is accepted.
  //
  // Issue #54: `except` is the stay being carried — she holds a cage from
  // check-in now, so without this her OWN cage reads as occupied (by her) and
  // walking her up to it wouldn't accept the drop.
  _findOpenCageNear(px, py, except = null) {
    let best = null, bestD = PICKUP_RADIUS;
    CAGES.forEach((cage, i) => {
      if (!isCageOpen(this.roster.stays, i, except)) return;
      const nx = Phaser.Math.Clamp(px, cage.x, cage.x + cage.w);
      const ny = Phaser.Math.Clamp(py, cage.y, cage.y + cage.h);
      const d = Phaser.Math.Distance.Between(px, py, nx, ny);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  _gridSlot(rect, index, margin, rowH, colW) {
    const { x, y, w, h } = rect;
    const cols = Math.max(1, Math.floor((w - margin * 2) / colW));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: x + margin + col * colW,
      y: Math.min(y + h - margin, y + margin + 30 + row * rowH),
    };
  }

  // (Issue #47: the movable yard divider — pick it up, carry it, set it back
  // down to re-split the yard — is gone entirely. The yard is one area.)

  // ── Feeding / water (issue #6, extended by #20 and #22 #6) ──────────────

  // Fills the food or water bowl in this cage slot (owner note 2026-07-29:
  // "you should be able to fill food bowls asynchronously from the pets
  // eating the food" — filling works any time, regardless of whether she's
  // currently hungry/thirsty, so the player can stock up ahead of time).
  // Eating/drinking from a bowl stocked IN ADVANCE still happens
  // automatically on its own tick — see _autoResolveBowlNeeds. `kind` is
  // 'food' or 'water'.
  //
  // Issue #49 (owner: "if an animal is hungry when you fill the bowl,
  // filling the bowl should immediately sate the need AND leave the bowl
  // full in one action"): filling for an animal who's ALREADY hungry is one
  // satisfying beat — her need clears right now and the bowl stays visibly
  // full, instead of the background tick immediately draining it again a
  // frame later. The pre-stock ordering is untouched, which is what keeps
  // filling ahead of time worthwhile.
  _fillBowl(cageIndex, kind) {
    // Whoever the cage BELONGS to, not who's standing in it: the bowl is part
    // of her cage, so it's still fillable while she's off playing in the yard
    // (issue #45 makes that common) — she'll eat from it when she gets back.
    const stay = this._cageOccupant(cageIndex);
    if (!stay || !stay.bowl) return false;
    // Owner note 2026-07-29: "we really only want notifications for animal
    // needs, not for actions we've taken" — filling (whether it worked or the
    // bowl was already full) is a player action, not a need, so no
    // notification either way; the bowl's own full/empty art is the feedback.
    if (stay.bowl[kind]) return true;
    stay.bowl[kind] = true;
    // Issue #49: she's here and she's hungry — she tucks straight in, and
    // the bowl she was just given stays full. (Not while she's out in the
    // yard: she isn't at the bowl to eat from it.)
    if (stay.location === LOCATION.CAGE && stay.needs[kind]) {
      clearNeed(stay, kind);
      this._setNeedIcon(stay, kind, false);
    }
    this._refreshBowls();
    return true;
  }

  // ── Outside yard bowls (issue #32 follow-up, one pair as of #47) ─────────
  // High-capacity and shared by the WHOLE yard — unlike a per-cage bowl
  // (single-serve, consumed by whichever one occupant eats), a yard bowl
  // fill resolves EVERY currently hungry/thirsty animal out there at once
  // (see _autoResolveYardBowls), mirroring the old turtle-shared-tank
  // precedent this replaces — "one fill event satisfies every current
  // occupant". Issue #47 collapsed the old top/bottom pair-per-zone into
  // this single pair, keeping that behavior exactly.
  _fillYardBowl(kind) {
    if (this.yardBowls[kind]) return true;
    this.yardBowls[kind] = true;
    // Issue #49, yard half: filling while animals are already hungry sates
    // every one of them right now, and the bowl stays full.
    const hungry = this.roster.stays.filter((s) => s.location === LOCATION.YARD && s.needs[kind]);
    for (const s of hungry) { clearNeed(s, kind); this._setNeedIcon(s, kind, false); }
    this._refreshYardBowls();
    return true;
  }

  // Mirrors _autoResolveBowlNeeds, but for the yard's shared pair: an animal
  // who gets hungry while a yard bowl is already stocked eats from it, and
  // that one fill satisfies every current occupant in the same tick before
  // emptying again — not a single-serve per-animal drain like a cage bowl.
  _autoResolveYardBowls() {
    let changed = false;
    const bowl = this.yardBowls;
    if (!bowl.food && !bowl.water) return false;
    const occupants = this.roster.stays.filter((s) => s.location === LOCATION.YARD);
    for (const kind of ['food', 'water']) {
      if (!bowl[kind]) continue;
      const wanting = occupants.filter((s) => s.needs[kind]);
      if (!wanting.length) continue;
      for (const s of wanting) { clearNeed(s, kind); this._setNeedIcon(s, kind, false); }
      bowl[kind] = false;
      changed = true;
    }
    return changed;
  }

  // ── Potty: scooper / litter box / dogs outside (issue #7, #20, #22 #5) ──
  // Issue #20: dogs no longer have an indoor mess of their own — the leash
  // walk (needs.bathroom, below) is their only potty pathway now, entirely
  // outside.
  //
  // Owner note 2026-07-31: "Get rid of the separate scoop tool, we can just
  // pick up without it as it works now" — cleaning a litter-box mess
  // (_cleanMess, below) never actually required holding the scooper (see
  // its unconditional consider() in _resolveAct), so the whole pick-up-a-
  // scooper-first step was pure overhead with no gameplay purpose. Removed
  // entirely: hasScooper/_scooperVisual/_scooperRestSprite/scooperRestPos,
  // _pickUpScooper/_dropScooper/_rebuildScooperRestSprite/_followScooper,
  // and the SCOOPER_SPOT/SCOOPER_KEY prop. Walking up and acting on a mess
  // just cleans it, no tool required.

  // Owner note 2026-07-29: "'litter box cleaned' is an unnecessary
  // notification" — that's an action-confirmation for something the player
  // just did, not an animal need, same principle already applied everywhere
  // else in this file (no NOTIFY for routine player-initiated upkeep). The
  // worth-flagging moment is the OPPOSITE one — a cat trying to use an
  // already-dirty box — handled in _updateMesses below instead.
  _cleanMess(mess) {
    mess.sprite.destroy();
    mess.icon?.destroy(); // issue #50: the "needs cleaning" bubble goes with it
    this.messes = this.messes.filter((m) => m !== mess);
  }

  // Every stay considered "settled at the kennel" for need/birth ticking —
  // in a section OR out playing in the yard (issue #20); only reception and
  // mid-carry stays are excluded.
  _settledStays() {
    return this.roster.stays.filter((s) => s.location === LOCATION.CAGE || s.location === LOCATION.YARD);
  }

  // Issue #77 — the fish's travel tank, RESTING (i.e. not currently in the
  // player's hands — while she's actually being carried this same tank is
  // the carryVisual container built in _pickUp instead, and no resting prop
  // exists at all). A no-op for every other species.
  //
  // She's home: the tank sits empty next to her own tank cage
  // (travelTankHomeSpot) — she's already visible swimming in her home tank's
  // own cage art, so the travel tank itself never contains her here.
  // She's at the pond: same idea, sitting at the pond's edge
  // (travelTankPondRestSpot) while she swims free in the pond itself.
  // Anywhere else (reception, or no cage yet): no sensible rest spot, so it's
  // simply hidden until she has one.
  _refreshTravelTank(stay) {
    if (stay.animal.species !== 'fish') return;
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    if (!rec.travelTank) rec.travelTank = this.add.image(0, 0, TRAVEL_TANK_KEY).setOrigin(0.5, 1);
    const img = rec.travelTank;
    const cage = CAGES[stay.cageIndex];
    if (stay.location === LOCATION.CAGE && cage) {
      const spot = travelTankHomeSpot(cage);
      img.setPosition(spot.x, spot.y).setDisplaySize(20, 16).setDepth(cage.y + 1).setVisible(true);
    } else if (stay.location === LOCATION.YARD) {
      const spot = travelTankPondRestSpot(this._fishAtPondCount(stay));
      img.setPosition(spot.x, spot.y).setDisplaySize(20, 16).setDepth(spot.y).setVisible(true);
    } else {
      img.setVisible(false);
    }
  }

  // How many OTHER fish are currently out at the shared pond — used to fan
  // both her swim spot (pondSwimSpot) and her travel tank's resting spot
  // (travelTankPondRestSpot) so simultaneous fish guests don't stack on the
  // exact same point. `except` is the stay being placed, same convention as
  // isCageOpen's — she shouldn't count against her own slot.
  _fishAtPondCount(except = null) {
    return this.roster.stays.filter((s) => s !== except
      && s.animal.species === 'fish' && s.location === LOCATION.YARD).length;
  }

  // ── Per-frame need/mess ticking ──────────────────────────────────────────

  _updateNeeds(delta) {
    let bowlsChanged = false;
    const absHourNow = this.clock.day * 24 + this.clock.hourFloat;
    for (const stay of this._settledStays()) { // only settled stays accrue needs
      const flipped = tickNeeds(stay, delta, absHourNow);
      for (const key of flipped) {
        this._setNeedIcon(stay, key, true);
        if (key === 'bathroom') {
          this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} needs to go to the bathroom!`);
        } else if (key === 'food' || key === 'water') {
          // Owner note 2026-07-29: "we don't need notifications every time an
          // animal eats or drinks, only if they are thirsty or hungry and
          // their bowl is empty" — only worth a heads-up when there's
          // actually nothing there for her; if a stocked bowl is available
          // she resolves it silently the same tick (_autoResolveBowlNeeds /
          // _autoResolveYardBowls). A yard-placed stay checks her current
          // zone's shared bowl instead of her own personal cage bowl.
          const stocked = stay.location === LOCATION.YARD
            ? !!this.yardBowls[key]
            : !!stay.bowl?.[key];
          if (!stocked) {
            this.game.events.emit(EVENTS.NOTIFY,
              key === 'food' ? `${stay.animal.name} is hungry — her bowl is empty!` : `${stay.animal.name} is thirsty — her bowl is empty!`);
          }
        }
      }
      // Owner note 2026-07-29: eating/drinking is decoupled from filling —
      // she resolves her own hunger/thirst here, automatically, the instant
      // a stocked bowl is available, with no player proximity/interaction
      // required (see _autoResolveBowlNeeds). Yard-placed stays resolve
      // against the yard's shared bowls instead (_autoResolveYardBowls,
      // called once below, not per-stay — one fill can satisfy everyone out
      // there at once).
      if (stay.location !== LOCATION.YARD && this._autoResolveBowlNeeds(stay)) bowlsChanged = true;
    }
    if (bowlsChanged) this._refreshBowls();
    if (this._autoResolveYardBowls()) this._refreshYardBowls();
  }

  // Owner note 2026-07-29 ("you should be able to fill food bowls
  // asynchronously from the pets eating the food. Same with water bowls"):
  // whenever a settled stay is hungry/thirsty AND her bowl is currently
  // stocked, she resolves it herself — no player proximity or interaction
  // needed, exactly like the owner described. Empties the bowl again so the
  // next fill is a fresh player action. Returns true if a bowl was consumed,
  // so the caller can batch the sprite refresh instead of doing it per-stay.
  _autoResolveBowlNeeds(stay) {
    if (!stay.bowl) return false;
    let changed = false;
    // Owner note 2026-07-29: "we don't need notifications every time an
    // animal eats or drinks" — this happens silently and often (it's a
    // background tick, not a player action); the only thing worth a
    // notification is the "hungry AND bowl empty" case above, in _updateNeeds.
    if (stay.needs.food && stay.bowl.food) {
      clearNeed(stay, 'food');
      stay.bowl.food = false;
      this._setNeedIcon(stay, 'food', false);
      changed = true;
    }
    if (stay.needs.water && stay.bowl.water) {
      clearNeed(stay, 'water');
      stay.bowl.water = false;
      this._setNeedIcon(stay, 'water', false);
      changed = true;
    }
    return changed;
  }

  // Issue #20: dogs have no indoor mess of their own anymore — their potty
  // pathway is entirely the outside leash walk (needs.bathroom). Only the
  // cat litter box still spawns a periodic indoor mess.
  //
  // Issue #5 (per-cage litter box): a mess now targets a SPECIFIC settled
  // cat's own litter box (data/props.js's LITTER_SPOTS) instead of the old
  // single shared section-wide spot. Owner note 2026-07-29: "'litter
  // box cleaned' is an unnecessary notification; but maybe we should add
  // '...'s litter box needs cleaned' if they try to go potty and it's dirty
  // still" — each tick picks one settled cat at random; if HER box already
  // has an uncleaned mess, that's the notify-worthy moment (she tried to use
  // it and couldn't); otherwise a fresh mess appears there quietly, same as
  // before (no notification for a routine new mess).
  _updateMesses(delta) {
    // Issue #38: any dog currently playing in the yard who needs the
    // bathroom does her business right where she's playing after a short
    // while — leaves a mess to scoop (same as cat litter) and clears her
    // need, replacing the old dedicated leash-walk minigame. Resolved ALL
    // qualifying dogs at once rather than picking one at random (unlike the
    // cat timer below) since there's rarely more than one at a time, and we
    // don't want her stuck waiting on bad luck for something she was
    // specifically brought outside to do.
    this._dogYardTimer -= delta;
    if (this._dogYardTimer <= 0) {
      this._dogYardTimer = DOG_YARD_INTERVAL();
      // Issue #45: skip a dog still walking out there (or walking home) —
      // her `location` already reads YARD the moment she leaves her cage, and
      // a mess dropped mid-corridor on the way would be nonsense.
      const dogs = this.roster.stays.filter((s) => s.animal.species === 'dog'
        && s.location === LOCATION.YARD && s.needs.bathroom && !this._isWalking(s));
      for (const dog of dogs) {
        const rec = this._staySprites.get(dog);
        if (!rec) continue;
        this._spawnMess('dog', { x: rec.sprite.x, y: rec.sprite.y }, dog);
        clearNeed(dog, 'bathroom');
        this._setNeedIcon(dog, 'bathroom', false);
        this.game.events.emit(EVENTS.NOTIFY, `${dog.animal.name} did her business!`);
        // If this was the night's current "needs the bathroom" wake-up
        // (issue #11), doing her business resolves it — resume toward
        // morning, same as the old leash walk used to.
        if (this.night.currentWake?.stay === dog && this.night.currentWake.reason === WAKE_REASON.BATHROOM) {
          this._resolveWakeUp();
        }
      }
    }

    this._catLitterTimer -= delta;
    if (this._catLitterTimer <= 0) {
      this._catLitterTimer = CAT_LITTER_INTERVAL();
      // Only a cat actually IN her cage: a yard-playing cat has no cage
      // position to put a mess at while she's out.
      // Issue #27: a cat's litter box need is about her SPECIES, not which
      // cage she's actually in — in generalized mode she may be settled
      // somewhere other than the 'cat' section. Yard-playing cats are
      // skipped: she has no cage position to place a mess at while she's out.
      const cats = this._settledStays().filter((s) => s.animal.species === 'cat' && s.location === LOCATION.CAGE);
      if (!cats.length) return;
      const cat = cats[Math.floor(Math.random() * cats.length)];
      const alreadyDirty = this.messes.some((m) => m.kind === 'cat' && m.stay === cat);
      if (alreadyDirty) {
        this.game.events.emit(EVENTS.NOTIFY, `${cat.animal.name}'s litter box needs cleaning!`);
        return;
      }
      const spot = LITTER_SPOTS[cat.cageIndex];
      if (spot) this._spawnMess('cat', spot, cat);
    }
  }

  _spawnMess(kind, point, stay = null) {
    const x = point.x + (Math.random() - 0.5) * 10;
    const y = point.y + (Math.random() - 0.5) * 10;
    const sprite = this.add.image(x, y, MESS_KEY).setOrigin(0.5, 0.5).setDepth(y - 0.5);
    // Issue #50 follow-up (owner: "add a poop icon for if a litter box needs
    // cleaning", "same icon as for a dog needing to poop") — a dirty litter
    // box used to have no standing signal at all, just a one-off
    // notification that's easy to miss. Reuses the bathroom need bubble, at
    // need-icon depth so it clears the cage's foreground bars (issue #43).
    // Litter boxes only: a dog's mess out on the open grass is plainly
    // visible where it lands.
    const icon = kind === 'cat'
      ? this.add.image(x, y - 20, NEED_KEY.bathroom).setOrigin(0.5, 1).setDepth(9002)
      : null;
    this.messes.push({ kind, x, y, sprite, icon, stay });
  }

  // ── Interaction: three buttons (issue #51) ───────────────────────────────
  // Everything used to funnel through ONE button and one nearest-target
  // resolver, so every action in the game competed with every other action by
  // raw distance — and near-ties broke by registration order, which is
  // invisible to the player and was wrong four separate times in one session
  // (birth, checkout, take-photo, leash), each patched with a one-off
  // `if (someFlag) continue;` in the pickup loop. Owner 2026-07-30: "we need
  // to audit controls and what competes with what... separate some things
  // into separate controls" → "Three: carry / cage / act."
  //
  // So there are three buttons now, each running its OWN resolution over only
  // its own class of actions (see Controls.js for the key/pad/touch mapping):
  //   carry — pick up / put down an animal; pick up / set down the scooper
  //   cage  — open a cage and let the occupant take herself out
  //   act   — everything else (feed, clean, help a birth, take a photo, the
  //           computer, treats, the raccoon, going to bed)
  // Two things at the same spot can no longer shadow each other, so the
  // per-flag workaround guards are gone.

  // Issue #58: each button's target is now RESOLVED and RUN as two separate
  // steps. `_resolveHandle`/`_resolveAct`/`_resolveDropoff` are pure — they pick the
  // nearest target and hand back `{ label, run }` without doing anything — and
  // the `_check*` wrappers below are all that ever fire it. The on-screen
  // prompt (_interactionPrompts) calls the SAME resolvers every frame, so what
  // it promises and what a press actually does are the same code path and
  // cannot disagree. Nothing may re-implement the target picking.
  //
  // Shared nearest-target picker — each button builds its own, so the classes
  // are resolved independently and can never out-compete each other. `actor`
  // is whichever active player is asking (issue #53) — every other active
  // player is irrelevant to THIS resolve, same as the single-player original.
  _resolver(actor) {
    const px = actor.sprite.x, py = actor.sprite.y;
    const reach = (x, y) => this._cageReach(actor, x, y);
    let best = null, bestD = PICKUP_RADIUS;
    return {
      // `label` is the kid-facing sentence for the prompt ("Fill Biscuit's
      // water bowl") — it names the actual thing, not a bare verb. `extra` can
      // carry a secondary `hold` action and the `hint` line describing it
      // (issue #59's hold-to-pick-up).
      consider(x, y, label, action, extra) {
        const at = reach(x, y);
        const d = Phaser.Math.Distance.Between(px, py, at.x, at.y);
        if (d < bestD) { bestD = d; best = { label, run: action, ...extra }; }
      },
      get best() { return best; },
    };
  }

  // Issue #71 made cages solid, and that quietly broke reaching INTO one. The
  // player used to be able to stand on top of a cage, so measuring to a thing's
  // exact position was fine; now she stands in the aisle, up to a whole cage
  // height away from an animal who's wandered to the back of hers, from a
  // clutch of eggs, or from a dirty litter box — all comfortably outside
  // PICKUP_RADIUS. Anything inside a cage is therefore measured to the nearest
  // point of that CAGE, not to itself: walk up to the cage and you can reach
  // everything in it, which is the same rule the owner already asked for when
  // placing a pet ("interact should accept the placement anywhere within the
  // cage, not just towards the bottom", 2026-07-29). A no-op for anything not
  // in a cage, so it's applied to every target rather than a chosen few.
  _cageReach(actor, x, y) {
    const cage = CAGES.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
    if (!cage) return { x, y };
    return {
      x: Phaser.Math.Clamp(actor.sprite.x, cage.x, cage.x + cage.w),
      y: Phaser.Math.Clamp(actor.sprite.y, cage.y, cage.y + cage.h),
    };
  }

  // True if (x, y) is close enough to `actor` to interact with — same radius
  // and same reach-into-a-cage rule the resolver uses, for the couple of
  // places that need the test without a competition.
  _inRange(actor, x, y) {
    const at = this._cageReach(actor, x, y);
    return Phaser.Math.Distance.Between(actor.sprite.x, actor.sprite.y, at.x, at.y) < PICKUP_RADIUS;
  }

  // Whose cage this is — the single occupancy rule every piece of cage
  // furniture and every cage-targeted interaction shares. Deliberately counts
  // her while she's out in the yard, mid-walk, or in the player's hands: the
  // cage is hers for the whole stay, not just while she's standing in it.
  _cageOccupant(cageIndex) {
    return this.roster.stays.find((s) => s.cageIndex === cageIndex) || null;
  }

  // HANDLE — the one "hands on an animal" button (issue #58 merged #51's
  // separate carry and cage buttons back into this one, owner's call). What it
  // means is decided by WHERE the animal is, which makes the cases disjoint
  // rather than competing:
  //
  //   in a cage        → open the cage, she walks herself out (issue #45)
  //   in the yard      → tap: send her home; hold: pick her up (issue #59)
  //   at reception     → pick her up (she has no cage to be sent to yet)
  //   in your hands    → put her down (see _resolveDropoff)
  //
  // Owner 2026-07-31, on what the button should do standing at an occupied
  // cage: "Open the cage." So lifting a pet straight out of her cage isn't a
  // thing — you open it, she comes out, and you can pick her up out there.
  // Owner 2026-07-31, again: "picking up the scooper should be the Act button,
  // not this one" — so this button is purely about animals, and the scooper
  // lives with the rest of the chores on ACT.

  // Every animal currently inside a cage — issue #45's one action there: open
  // it and the occupant takes herself out, to her waiting owner if one's here
  // for her, otherwise out to the play yard. It replaced both carrying a pet
  // out to play and carrying a checkout-ready pet over to her owner, and it's
  // also how a dog who needs the bathroom gets outside (issue #38 — she does
  // her business out there on her own; no separate leash minigame).
  // Issue #82 ("long-press a cage to grab her straight out, same as the
  // yard's tap-sends-home/hold-picks-up-directly pattern in
  // _considerLoosePets"): `actor` is threaded through here now purely to
  // hand off to _pickUp — she's the one whose hands end up full.
  _considerCages(actor, r) {
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.CAGE) continue;
      if (this._isWalking(stay)) continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      // Issue #77: a fish never "opens her cage and walks herself out" — she
      // has no legs, and it's a sealed tank besides. HANDLE here is ALWAYS
      // just "hold to pick up her travel tank" (day or night, gate open or
      // shut — none of that matters to her since she's never self-walking
      // anywhere regardless), same hold-to-pick-up convention every other
      // species' disabled-tap branches already use.
      if (stay.animal.species === 'fish') {
        r.consider(rec.sprite.x, rec.sprite.y,
          `${stay.animal.name} can't walk herself anywhere`,
          () => {}, { disabled: true, hint: 'hold to pick up her travel tank', hold: () => this._pickUp(actor, stay) });
        continue;
      }
      // Cage-opening (i.e. SENDING her outside) is skipped at night —
      // everyone should be home asleep — EXCEPT for a dog who currently
      // needs the bathroom, the same exemption the old leash flow had. (Real
      // game logic, not a tie-break workaround.) That's specifically about
      // sending her out though: picking her straight up isn't "sending her
      // anywhere", so issue #82 keeps that available even while she's
      // asleep — same as a yard pet already stays handle-able at night
      // (_considerLoosePets). Tap still does nothing at night (there's
      // nowhere honest to send her), so it's shown disabled with the reason.
      const bathroomDog = stay.animal.species === 'dog' && stay.needs.bathroom;
      if (this.night.active && !bathroomDog) {
        r.consider(rec.sprite.x, rec.sprite.y,
          `${stay.animal.name} is asleep for the night`,
          () => {}, { disabled: true, hint: 'hold to pick her up instead', hold: () => this._pickUp(actor, stay) });
        continue;
      }
      // Say where she's headed — a checkout-ready pet walks to her owner, a
      // dog who needs to go (and everyone else) heads out to the yard.
      const toOwner = stay.checkoutReady && this._checkoutOwners.get(stay)?.arrived;
      // Issue #55: with the gate shut she stays in her cage ("she stays in
      // her cage" — owner), so the only honest thing the button can say is
      // why. Shown greyed rather than hidden: a silent dead press at her cage
      // is exactly what issue #58's prompts exist to prevent, and the reason
      // is a thing the player can go and fix. That's about SENDING her
      // outside though — a long-press pickup still works here (issue #82),
      // so `hold` rides along on this disabled branch instead of being
      // skipped alongside the disabled tap.
      if (!toOwner && !this.yardDoorOpen) {
        r.consider(rec.sprite.x, rec.sprite.y,
          `${stay.animal.name} can't go out — the gate to the play yard is closed`,
          () => {}, {
            disabled: true,
            hint: 'hold to pick her up instead',
            hold: () => this._pickUp(actor, stay),
          });
        continue;
      }
      const where = toOwner
        ? `Open ${stay.animal.name}'s cage — she'll go to her owner`
        : `Open ${stay.animal.name}'s cage — she'll go out to play`;
      r.consider(rec.sprite.x, rec.sprite.y, where, () => this._openCage(stay), {
        hint: 'hold to pick her up instead',
        hold: () => this._pickUp(actor, stay),
      });
    }
  }

  // Every animal NOT in a cage and not in the player's hands — waiting at
  // reception, or out in the play yard.
  //
  // Issue #59 (owner: "when a pet is in the play yard, instead of picking them
  // up, if you ask them to go back to their cage, they should go back on their
  // own"): a TAP at a yard pet sends her home under her own power — the same
  // walk-home that already runs at nightfall (issue #45's _startWalkHome), not
  // a second implementation of it. Carrying survives as the HOLD ("keep
  // carrying as a second option"), for when the player wants to place her
  // somewhere specific. A pet out in the yard is still handle-able at night,
  // so she can always be sent (or brought) straight back in.
  // `actor` is whichever active player pressed handle (issue #53) — she's
  // the one who'll end up carrying whoever gets picked up here.
  _considerLoosePets(actor, r) {
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.RECEPTION) continue;
      // A fresh arrival has no cage of her own yet, so there's nowhere to send
      // her — picking her up is how she gets one (nameplate + bowls).
      const rec = this._staySprites.get(stay);
      if (rec) r.consider(rec.pos.x, rec.pos.y, `Pick up ${stay.animal.name}`, () => this._pickUp(actor, stay));
    }

    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.YARD) continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      // She's already on her way somewhere — issue #45's original rule was
      // "leave her to it", a walking animal being a transient state, not
      // something to grab at. Issue #69 carves out exactly one exception:
      // a walk tagged `reversible` (a plain cage↔yard trip — see
      // _walkToYard/_startWalkHome) offers "turn her around" instead of
      // nothing. Every other in-progress walk (checkout, nightfall, post-
      // hatch) still falls through to the plain `continue` below untouched.
      if (this._isWalking(stay)) {
        const walk = this._walkers.find((w) => w.stay === stay);
        if (walk?.reversible) {
          const label = walk.dir === 'toYard'
            ? `Call ${stay.animal.name} back to her cage`
            : `Send ${stay.animal.name} back out to play`;
          r.consider(rec.sprite.x, rec.sprite.y, label, () => this._reverseWalk(stay));
        }
        continue;
      }
      // Owner note 2026-07-29: "the interact location for an animal that
      // is outside playing doesn't move with their visual... it should
      // move with them" — she wanders within her bounds (_updateWander), so
      // the target tracks her live sprite position, not her original spot.
      // Issue #77: a fish at the pond never "sends herself home" (there's no
      // self-walk to send — see _startWalkHome's species guard and
      // _flagCheckoutsReady above). HANDLE here is always just hold-to-pick-
      // up-her-travel-tank, the only way she ever leaves the pond.
      if (stay.animal.species === 'fish') {
        r.consider(rec.sprite.x, rec.sprite.y,
          `${stay.animal.name} can't walk herself anywhere`,
          () => {}, { disabled: true, hint: 'hold to pick up her travel tank', hold: () => this._pickUp(actor, stay) });
        continue;
      }
      // Since issue #54 she's assigned a cage at check-in, so this is almost
      // always the first clause; _startWalkHome's claim-any-free-cage fallback
      // (and so this second, pricier check) only matters for a pre-#54 save,
      // and short-circuits away in the normal case.
      const hasHome = !!CAGES[stay.cageIndex] || this._findAnyOpenCage(stay) != null;
      if (hasHome) {
        r.consider(rec.sprite.x, rec.sprite.y, `Send ${stay.animal.name} back to her cage`, () => this._startWalkHome(stay, { reversible: true }), {
          hint: 'hold to pick her up instead',
          hold: () => this._pickUp(actor, stay),
        });
      } else {
        // Every cage is spoken for — there's no home to send her to, so the
        // only honest offer is carrying her.
        r.consider(rec.sprite.x, rec.sprite.y, `Pick up ${stay.animal.name}`, () => this._pickUp(actor, stay));
      }
    }
  }

  _resolveHandle(actor) {
    // Hands full — the only thing this button can do is put her down.
    if (actor.carrying) return this._resolveDropoff(actor);

    const r = this._resolver(actor);
    this._considerCages(actor, r);
    this._considerLoosePets(actor, r);
    return r.best;
  }

  // `event` is Controls.handleEvent()'s 'tap' | 'hold' | null (issue #59).
  _checkHandle(actor, event) {
    const target = this._resolveHandle(actor);
    if (!target) return;
    // `auto` targets (only the reception → yard drop-off) have always fired on
    // proximity alone, with no press — see _resolveDropoff.
    if (target.auto) { target.run(); return; }
    if (!event) return;
    // Holding where there's no separate hold action just does the normal
    // thing, so a long press is never a dead press.
    if (event === 'hold') (target.hold ?? target.run)();
    else target.run();
  }

  // Shared "what upkeep chores are outstanding right now" enumerator (issue
  // #52) — the bowl/mess portion of _resolveAct's candidate list, factored
  // out so the helpers' chore-picker (_resolveHelperTarget) can run the
  // exact same candidate logic from a DIFFERENT position without
  // duplicating the BOWL_SPOTS/WATER_BOWL_SPOTS/yardBowls/messes iteration
  // verbatim in two places. `consider` is called once per outstanding chore
  // as (key, x, y, label, run, category); `key` exists purely so a caller can
  // dedupe/claim a target (see _resolveHelperTarget) — _resolveAct itself
  // ignores both `key` and `category`. `category` (issue #80) is one of
  // 'bowls' or 'cleaning' — the same two task categories a helper's own menu
  // toggles, so _resolveHelperTarget can gate each chore by whether the
  // helper considering it has that category turned on.
  //
  // Owner note 2026-07-29 (bowl decoupling): filling food vs. water resolves
  // to whichever specific bowl sprite is closer rather than the cage's own
  // rect. Filling works regardless of hunger/thirst (see _fillBowl);
  // actually eating/drinking happens on its own background tick
  // (_autoResolveBowlNeeds), not through this interaction.
  //
  // Issue #58: only an occupied cage whose bowl is actually EMPTY is a
  // target. An empty cage's bowl spot, or one that's already full, used to
  // be considered too — _fillBowl then quietly did nothing, which is
  // exactly the "I pressed the button and nothing happened" the prompt
  // exists to eliminate. Skipping them also frees the press (or a helper's
  // pick) for whatever else is nearby instead of swallowing it.
  _forEachChore(consider) {
    BOWL_SPOTS.forEach((spot, i) => {
      const who = this._cageOccupant(i);
      if (!who?.bowl || who.bowl.food) return;
      consider(`bowl-food-${i}`, spot.x, spot.y, `Fill ${who.animal.name}'s food bowl`, () => this._fillBowl(i, 'food'), 'bowls');
    });
    WATER_BOWL_SPOTS.forEach((spot, i) => {
      const who = this._cageOccupant(i);
      if (!who?.bowl || who.bowl.water) return;
      consider(`bowl-water-${i}`, spot.x, spot.y, `Fill ${who.animal.name}'s water bowl`, () => this._fillBowl(i, 'water'), 'bowls');
    });

    // Issue #32 follow-up, one pair as of issue #47: the outside yard's
    // shared food/water bowls — filling works the same way as a cage bowl
    // (any time, regardless of who's hungry); see _fillYardBowl. Same
    // already-full skip as the cage bowls above (issue #58).
    if (!this.yardBowls.food) {
      consider('yard-food', YARD_BOWL_SPOTS.food.x, YARD_BOWL_SPOTS.food.y, 'Fill the playground food bowl', () => this._fillYardBowl('food'), 'bowls');
    }
    if (!this.yardBowls.water) {
      consider('yard-water', YARD_BOWL_SPOTS.water.x, YARD_BOWL_SPOTS.water.y, 'Fill the playground water bowl', () => this._fillYardBowl('water'), 'bowls');
    }

    // `mess` itself is a stable object reference, so it doubles as its own
    // dedupe key. Guarded against running twice (a helper walking toward a
    // mess the player — or another helper — already cleaned): _cleanMess
    // assumes the mess is still live, so re-check membership rather than
    // relying on it to no-op.
    for (const mess of this.messes) {
      consider(mess, mess.x, mess.y, 'Clean up the mess', () => {
        if (this.messes.includes(mess)) this._cleanMess(mess);
      }, 'cleaning');
    }
  }

  // ACT — everything that isn't handling an animal (issues #5, #6,
  // #7, #8, #13, #20, #22, #37): feeding, cleaning, births, photos, the
  // reception computer, treats, the raccoon, and turning in for the night.
  // `actor` is whichever active player pressed act (issue #53).
  _resolveAct(actor) {
    const r = this._resolver(actor);
    const consider = r.consider;

    this._forEachChore((key, x, y, label, run) => consider(x, y, label, run));

    // Issue #80: walking up to a helper and interacting opens HER OWN task
    // menu (multi-select bowls/cleaning) rather than anything happening on
    // its own — #52's automatic default is gone. Skipped for a helper who's
    // currently a live second player (issue #53's gamepad takeover) — there's
    // no AI task list to manage while a human's driving her.
    if (this.helpers) {
      for (const helper of this.helpers) {
        if (helper.playerControlled) continue;
        consider(helper.sprite.x, helper.sprite.y, `Open ${helper.name}'s tasks`, () => this._openHelperMenu(actor, helper));
      }
    }

    // Issue #55: the gate to the play yard. It's a world object rather than an
    // animal, so it belongs on ACT alongside the other walk-up-and-use things,
    // not on the handle button. Targeted at the nearest point along its whole
    // height (_yardDoorTarget), so it works from anywhere in the doorway and
    // from either side of the wall — including from the grass, which is what
    // stops the player shutting herself out.
    {
      const at = this._yardDoorTarget(actor);
      consider(at.x, at.y,
        this.yardDoorOpen ? 'Close the gate to the play yard' : 'Open the gate to the play yard',
        () => this._toggleYardDoor());
    }

    // Issue #37: the computer's only for SENDING now — she needs her photo
    // taken first (see the photo consider() loop below).
    if (!this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement && s.photoTaken)) {
      consider(COMPUTER_SPOT.x, COMPUTER_SPOT.y, 'Email the photos to the owner', () => this._useComputer());
    }

    // Issue #9 refinement: a mom flagged ready-and-waiting needs the player
    // to walk over and act to actually have her babies/hatch her eggs. She's
    // usually standing inside her own cage, but that no longer shadows this —
    // her cage is on the cage button, the birth is on this one (issue #51).
    //
    // Issue #57: for a mom sitting on EGGS the interaction is at the eggs, not
    // at her. Her clutch stays in her cage while she's free to go out and play
    // ("I meant she's allowed to go outside still"), so anchoring the hatch to
    // her body would put it out in the grass — and a clutch whose mother
    // wandered off would be unhatchable. _eggCageSpot is the same point the
    // eggs and their heart icon are actually drawn at (_refreshCageEggs).
    for (const stay of this.roster.stays) {
      if (!stay.birthReady) continue;
      const eggs = this._eggCageSpot(stay);
      const rec = this._staySprites.get(stay);
      const at = eggs || (rec ? { x: rec.sprite.x, y: rec.sprite.y } : null);
      if (!at) continue;
      const label = stay.animal.hasEggs
        ? `Help ${stay.animal.name}'s eggs hatch`
        : `Help ${stay.animal.name} have her babies`;
      consider(at.x, at.y, label, () => this._triggerBirth(stay));
    }

    // Issue #37 ("can we add something where you actually get to take cute
    // pics of the babies before you send the email?"): a mom with new
    // babies/hatchlings not yet photographed needs the player to walk up and
    // snap her photo before the computer will let her be announced.
    for (const stay of this.roster.stays) {
      if (!stay.needsAnnouncement || stay.photoTaken) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.sprite.x, rec.sprite.y, `Take a photo of ${stay.animal.name}'s babies`, () => this._takePhoto(stay));
    }

    // Issue #13: bake a treat at the kitchen oven — only while the counter's
    // clear, so there's always at most one tray out for the raccoon to steal.
    if (!this.treatTray) consider(OVEN_SPOT.x, OVEN_SPOT.y, 'Bake a treat', () => this._bakeTreat());
    else consider(TREAT_TRAY_SPOT.x, TREAT_TRAY_SPOT.y, `Eat ${this.treatTray.treat.label}`, () => this._eatTreat());

    // Issue #13 follow-up: scare the raccoon off if she's around and the
    // player walks up and interacts — same proximity convention as
    // everything else here.
    if (this._raccoon && !this._raccoon.scared) {
      consider(this._raccoon.sprite.x, this._raccoon.sprite.y, 'Shoo the raccoon away!', () => this._scareRaccoon());
    }

    // (Issue #47 removed the movable yard divider's pick-up interaction, and
    // issue #46 removed the tuck-in one — blankets are automatic now.)

    // Owner note 2026-07-29: the player's own bed — once every pet is home
    // in her cage (issue #45), walk up and interact here to actually start
    // the sleep sequence (see _checkAllSettled/_beginSleep).
    if (this.night.active && this.night.allSettled && !this.night.sleeping) {
      consider(BED_SPOT.x, BED_SPOT.y, 'Go to bed', () => this._beginSleep());
    }

    if (r.best) return r.best;

    // Issue #58, the owner's actual complaint ("got the prompt to go to bed,
    // but can't figure out how to go to bed"): standing at the bed while it
    // ISN'T usable yet should say why, instead of reading as a broken button.
    // Added only when nothing else resolved, so a real nearby action can never
    // be shadowed by an explanation. `disabled` targets are never run.
    if (this.night.active && !this.night.sleeping && !this.night.allSettled
        && this._inRange(actor, BED_SPOT.x, BED_SPOT.y)) {
      return { label: 'Go to bed — every pet has to be in her cage first', disabled: true, run: () => {} };
    }
    return null;
  }

  _checkAct(actor, pressed) {
    if (!pressed) return;
    const target = this._resolveAct(actor);
    if (target && !target.disabled) target.run();
  }

  // ── The on-screen prompt (issue #58) ─────────────────────────────────────
  // Owner, blocked mid-playtest: "got the prompt to go to bed, but can't
  // figure out how to go to bed." Issue #51 gave each class of interaction its
  // own button; this says, live, what each of those buttons would do right
  // now — by asking the SAME resolvers a press asks, so it can't promise
  // something a press wouldn't deliver. A button with nothing in range
  // contributes no line at all, so an absent prompt means "there's nothing
  // here", never "you pressed the wrong one". That matters more than ever now
  // that HANDLE has several meanings depending on where the animal is.
  //
  // Issue #53 design call: this stays PLAYER-1-ONLY rather than growing a
  // multi-player prompt UI. The issue doesn't spec one, HudScene's single
  // prompt strip has nowhere obvious to put up to 4 independent lines without
  // its own redesign, and a claimed helper still gets fully working act/
  // handle regardless (only the on-screen TEXT is Player-1-only) — flagged in
  // the report as a judgment call the owner may want to revisit.
  //
  // Emitted (to HudScene) only when the visible set actually changes, not
  // every frame.
  _updatePrompts(actor) {
    const prompts = [];
    // `blockedBy` is the reason this button won't fire even though there IS
    // something in range — shown greyed out rather than hidden, because
    // silence here would wrongly read as "nothing to do here".
    const push = (action, target, blockedBy) => {
      if (!target) return;
      const label = target.disabled || !blockedBy ? target.label : `${target.label} — ${blockedBy}`;
      prompts.push({
        action,
        button: actor.controls.buttonName(action),
        label,
        // Issue #59: the secondary hold action has to be SHOWN or nobody will
        // ever find it — one button meaning four things is only workable if
        // the screen keeps saying which.
        hint: blockedBy ? null : (target.hint || null),
        disabled: !!target.disabled || !!blockedBy,
      });
    };

    // Nothing to prompt while the screen's black mid-sleep.
    if (!this.night.sleeping) {
      // Hands full: handle is the only button that fires (see update), so act
      // says what it WOULD do and why it won't — the silent version of this is
      // what left the player standing at the bed with an animal in her arms
      // wondering why nothing happened.
      const blocked = actor.carrying ? `put ${actor.carrying.animal.name} down first` : null;
      push('act', this._resolveAct(actor), blocked);
      push('handle', this._resolveHandle(actor));
    }

    const sig = prompts.map((p) => `${p.action}|${p.button}|${p.label}|${p.hint}|${p.disabled}`).join('\n');
    if (sig === this._promptSig) return;
    this._promptSig = sig;
    this.game.events.emit(EVENTS.PROMPTS, prompts);
  }

  // ── Per-frame ────────────────────────────────────────────────────────────

  update(time, delta) {
    this._updateDevDragToggle(); // F9 — works regardless of anything else going on

    this.clock.advance(delta);
    const hour = this.clock.hour, phase = this.clock.phase;
    if (hour !== this._lastHour) {
      this._lastHour = hour;
      this.game.events.emit(EVENTS.HOUR_CHANGE, { hour, phase, day: this.clock.day });
    }
    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      this.game.events.emit(EVENTS.PHASE_CHANGE, { phase, isNight: phase === PHASE.NIGHT });
    }

    // Issue #53: watch for a fresh press on any not-yet-claimed gamepad
    // (drop-in) before anything else reads input this frame.
    this._updateGamepadDropIn();

    for (const actor of this.activePlayers) this._updateMovement(actor, delta);
    this._updateTint();
    this._updateSleepOverlay();
    this._updateNeeds(delta);
    this._updateMesses(delta);
    this._updateBirths(delta);
    this._updateComputerIcon();
    this._updateRaccoon(delta);
    this._updateWalkers(delta);      // issue #45: animals/owners walking themselves around
    this._updateHelpers(delta);      // issue #52: helper NPCs picking/walking to/doing chores
    this._updateWander(delta);
    this._updateBabies(delta);       // issue #62: babies wander on their own, loosely tethered to mom
    this._updateAnimalCollisions();  // issue #65: pets solid-bump each other instead of overlapping
    this._updateStayVisuals();       // issue #48: bubbles/labels/babies follow their animal
    this._updateNightSettle(delta);  // issue #45/#46/#87: walk home, get under the blanket
    this._updateNameTagVisibility();
    for (const actor of this.activePlayers) actor.sprite.setDepth(actor.sprite.y);

    // Both action reads are stateful (edge-triggered) — read BOTH of them
    // exactly once per frame, unconditionally, before branching, so a press
    // never survives into a later frame just because this frame's branch
    // wasn't interested in it. Issue #53: every active player (Player 1 and
    // any claimed helper) gets her own independent pass over her own Controls
    // instance — none of this competes across players, each actor only ever
    // reads/writes her own carrying/navPath/carryVisual.
    for (const actor of this.activePlayers) {
      const handleEvent = actor.controls.handleEvent(); // 'tap' | 'hold' | null
      const actPressed = actor.controls.actJustDown();
      // Handle works the same whether her hands are full or empty — _resolveHandle
      // is what knows the difference (put down vs. send home vs. open a cage).
      this._checkHandle(actor, handleEvent);
      if (actor.carrying) {
        this._followCarry(actor);
        // Hands are full: act is disabled, and the on-screen prompt says so
        // rather than leaving the player pressing a dead button (issue #58).
      } else {
        this._checkAct(actor, actPressed);
      }
    }
    this._updatePrompts(this.activePlayers[0]); // issue #58: what each button would do right now (Player-1-only prompt UI — see _updatePrompts)

    // Issue #53: one shared camera keeping everyone in frame, replacing the
    // old single-target startFollow.
    this._updateCameraFraming(delta);
  }

  // ── Wander (issue #22 #4, extended by issue #48) ──────────────────────────
  // Every settled/yard-placed stay's sprite drifts toward a small periodic
  // target point near where she was placed, clamped to her cage (or the
  // yard) — species-tuned interval/amplitude from data/wander.js. Her babies
  // drift too, around their own offsets from mom (issue #48: "we need to get
  // babies to wander also, not just adults"). Paused while she's tucked in
  // (asleep), while she's walking somewhere under her own power (issue #45),
  // or while the screen is asleep.
  _updateWander(delta) {
    if (this.night.sleeping && !this.night.currentWake) return;
    for (const [stay, rec] of this._staySprites) {
      if (!rec.wanderBounds || stay.tuckedIn || this._isWalking(stay)) continue;
      const b = rec.wanderBounds;
      // Issue #77: a fish never gets the "roam the whole yard" treatment
      // below, even while her `location` reads YARD — she's confined to the
      // pond either way.
      const inYard = stay.location === LOCATION.YARD && !rec.inPond;
      const amp = wanderAmplitude(stay.animal.species, inYard);
      if (!rec.wander) {
        rec.wander = { tx: rec.sprite.x, ty: rec.sprite.y, t: pickWanderInterval(stay.animal.species) };
      }
      rec.wander.t -= delta;
      if (rec.wander.t <= 0) {
        if (rec.inPond) {
          // Issue #84: she swims the pond the way a yard animal roams the
          // yard — a fresh target anywhere in the WATER — rather than the
          // tiny anchored jiggle #77 gave her. That jiggle was sized for a
          // 130x90 puddle and would leave her nearly motionless in a pond
          // twice that size; her species amp (5, the smallest there is) keeps
          // the actual pace to a slow ~21px/s glide either way.
          const p = randomPondWaterPoint(rec.sprite.displayWidth, rec.sprite.displayHeight);
          rec.wander.tx = p.x;
          rec.wander.ty = p.y;
        } else if (inYard) {
          // Owner note 2026-07-30: "Animals aren't wandering in the full play
          // area, they should." Out in the yard she roams the WHOLE space —
          // a fresh target anywhere in it, not a small box around wherever
          // she happened to be set down. (Her old anchored behavior kept her
          // within roughly amp*2 px of her drop-off spot: ~48px for a cat, in
          // a yard hundreds of px across.)
          //
          // Picking uniformly across the bounds is also what avoids the pile-
          // up the anchored version was guarding against: a shared CENTER
          // anchor with a big amplitude would gather everyone into the middle,
          // but a uniform random point has no center bias at all.
          rec.wander.tx = b.x + 4 + Math.random() * Math.max(1, b.w - 8);
          rec.wander.ty = b.y + 4 + Math.random() * Math.max(1, b.h - 8);
        } else {
          // In her cage: unchanged — a small drift around her own placement
          // anchor, NOT the middle of the bounds (see _renderStay).
          const a = rec.wanderAnchor;
          rec.wander.tx = Phaser.Math.Clamp(a.x + (Math.random() * 2 - 1) * amp, b.x + 4, b.x + b.w - 4);
          rec.wander.ty = Phaser.Math.Clamp(a.y + (Math.random() * 2 - 1) * amp, b.y + 4, b.y + b.h - 4);
        }
        rec.wander.t = pickWanderInterval(stay.animal.species);
      }
      // Owner note 2026-07-30: "the animals are zipping around extremely
      // fast... slow them down appropriately." This used to be a proportional
      // lerp (`+= (target - pos) * 0.03`), whose speed scales with DISTANCE —
      // fine when a target was always ~24px away (the old anchored box), but
      // once #60 let her target anywhere in the yard, a 500px hop started at
      // 0.03*500 = 15px/frame ≈ 900px/s. Now she moves at a constant, capped
      // speed toward the target instead, so distance no longer sets pace.
      // Also delta-based, so it no longer runs faster on a high-refresh
      // display the way the per-frame lerp did.
      const wdx = rec.wander.tx - rec.sprite.x;
      const wdy = rec.wander.ty - rec.sprite.y;
      const wdist = Math.hypot(wdx, wdy);
      if (wdist > 0.5) {
        const step = Math.min(wdist, wanderSpeed(stay.animal.species) * (delta / 1000));
        rec.sprite.x += (wdx / wdist) * step;
        rec.sprite.y += (wdy / wdist) * step;
      }
      // Issue #84: the water's edge is a hard boundary, not just a hint about
      // where to aim — she could still be OUTSIDE it here (dropped at the
      // pond's rim, or shoved by a neighbour in _updateAnimalCollisions), and
      // walking her back only on the next re-target would show her on the
      // grass for seconds at a time. So the clamp is applied to her position
      // every frame, not just to her target.
      if (rec.inPond) {
        const p = clampToPondWater(rec.sprite.x, rec.sprite.y, rec.sprite.displayWidth, rec.sprite.displayHeight);
        rec.sprite.x = p.x;
        rec.sprite.y = p.y;
      }
      rec.sprite.setDepth(rec.sprite.y);
    }
  }

  // ── Babies wandering on their own (issue #62) ─────────────────────────────
  // Owner: "baby animals should wander and play SEPARATELY from their
  // grownup, not linked exactly together" — and, on how far: "let babies
  // wander away from mom further, like a lot further."
  //
  // So this is deliberately NOT a slice of _updateWander: a baby is not
  // drifting inside mom's box, she's going where she likes and coming back
  // when she's gone too far. Two things follow from that:
  //
  //  - It runs even while mom is WALKING somewhere (_updateWander skips
  //    those). Under the old welded rendering the litter came along for free;
  //    now they have to actually follow her, which they do by scampering at
  //    BABY_CATCHUP_SPEED — a shade over her own walking speed, so they close
  //    the gap instead of stringing out behind her across the kennel.
  //  - Her cage/yard bounds are ignored WHILE she's walking. This is issue
  //    #66 (owner: "babies are getting stuck in the cage or in playpen when
  //    their mom is in location transition; they should follow their mother
  //    when they're transitioning"): `rec.wanderBounds` is only ever set by
  //    _renderStay, for wherever she was last DRAWN, and a walk (#45's
  //    _startWalk/_updateWalkers) moves her sprite without redrawing her — so
  //    mid-journey those bounds are the cage she's leaving or the yard she
  //    hasn't reached yet. Clamping to them pinned the babies against an
  //    invisible wall in the old location while their mother walked off
  //    without them. Bounds re-apply the moment she arrives and is redrawn.
  //
  // Movement is a constant capped px/sec (data/wander.js's babyWanderSpeed),
  // never a distance-scaled lerp — issue #63's lesson, which matters more
  // here than anywhere since the yard tether is deliberately enormous.
  _updateBabies(delta) {
    if (this.night.sleeping && !this.night.currentWake) return;
    const step = delta / 1000;
    for (const [stay, rec] of this._staySprites) {
      if (!rec.babies.length) continue;
      // Tucked in under her blanket, or waiting at reception / in the
      // player's hands (no bounds at all) — the litter is one bundle with her
      // then, positioned by the render, and nobody wanders.
      if (stay.tuckedIn || (!rec.wanderBounds && !rec.babyAnchor)) continue;

      // Issue #57: hatchlings that came out of the clutch while their mother
      // was elsewhere mill about at HER CAGE (where the eggs were) instead of
      // homing on her — they'd have to cross the building to reach her, and
      // babies don't path. She's already walking back to them (_triggerBirth),
      // and the render that settles her in the cage re-forms the litter at her
      // feet, so this only holds for the length of that walk.
      const anchored = !!rec.babyAnchor;
      const travelling = !anchored && this._isWalking(stay);
      // Issue #84: hatchlings swimming at the pond with their mother get the
      // pond tether, not the yard's — see BABY_TETHER in data/wander.js — and
      // the elliptical water clamp below instead of the rect one.
      const inPond = !anchored && !travelling && rec.inPond;
      const tether = anchored ? BABY_TETHER.cage
        : (inPond ? BABY_TETHER.pond
          : (stay.location === LOCATION.YARD ? BABY_TETHER.yard : BABY_TETHER.cage));
      const b = anchored ? rec.babyBounds : (travelling ? null : rec.wanderBounds);
      const mx = anchored ? rec.babyAnchor.x : rec.sprite.x;
      const my = anchored ? rec.babyAnchor.y : rec.sprite.y;

      for (const baby of rec.babies) {
        const dm = Phaser.Math.Distance.Between(baby.x, baby.y, mx, my);
        if (travelling || dm > tether) baby.chasing = true;
        else if (dm < tether * BABY_TETHER_RELEASE) baby.chasing = false;

        if (baby.chasing) {
          // Back to her own spot beside mom, re-aimed every frame since mom
          // may still be moving. Per-baby offsets keep the litter from all
          // converging on the same point.
          baby.tx = mx + baby.bx;
          baby.ty = my + baby.by;
          baby.t = pickWanderInterval(baby.species) * 0.8;
        } else {
          baby.t -= delta;
          if (baby.t <= 0) {
            // Somewhere new within the tether, measured from wherever mom is
            // right now — an ellipse rather than a circle, since the floor
            // reads much wider than it is deep.
            const ang = Math.random() * Math.PI * 2;
            const r = tether * (0.15 + Math.random() * 0.85);
            baby.tx = mx + Math.cos(ang) * r;
            baby.ty = my + Math.sin(ang) * r * 0.7;
            baby.t = pickWanderInterval(baby.species) * 0.8;
          }
        }
        if (inPond) {
          const p = clampToPondWater(baby.tx, baby.ty, baby.sprite.displayWidth, baby.sprite.displayHeight);
          baby.tx = p.x;
          baby.ty = p.y;
        } else if (b) {
          baby.tx = Phaser.Math.Clamp(baby.tx, b.x + 4, b.x + b.w - 4);
          baby.ty = Phaser.Math.Clamp(baby.ty, b.y + 4, b.y + b.h - 4);
        }

        const dx = baby.tx - baby.x, dy = baby.ty - baby.y;
        const d = Math.hypot(dx, dy);
        let moved = 0;
        if (d > 0.5) {
          const speed = baby.chasing ? BABY_CATCHUP_SPEED : babyWanderSpeed(baby.species);
          moved = Math.min(d, speed * step);
          baby.x += (dx / d) * moved;
          baby.y += (dy / d) * moved;
        }
        if (inPond) {
          const p = clampToPondWater(baby.x, baby.y, baby.sprite.displayWidth, baby.sprite.displayHeight);
          baby.x = p.x;
          baby.y = p.y;
        } else if (b) {
          baby.x = Phaser.Math.Clamp(baby.x, b.x + 4, b.x + b.w - 4);
          baby.y = Phaser.Math.Clamp(baby.y, b.y + 4, b.y + b.h - 4);
        }
        // She reads as walking when she's actually going somewhere, on her
        // own legs — not just because her mother happens to be on the move.
        this._setAnimalMoving(baby.sprite, moved > 0.2);
      }
    }
  }

  // Issue #65: "solid bump" collision between animals (see the constant
  // comment above `ANIMAL_COLLIDE_PAD`). Runs after every other per-frame
  // movement system that can move a stay's own sprite (_updateWalkers,
  // _updateHelpers only moves helpers not stays, _updateWander) so it always
  // has this frame's final positions to separate — the push itself is just a
  // plain position nudge, so a walker mid-path simply resumes toward her next
  // waypoint from wherever this shoved her, which is what makes the walk read
  // as routing around a blocking neighbor instead of overlapping her.
  //
  // Excludes anyone tucked in for the night (settled under her cage blanket —
  // nothing to bump into once she's there) — everyone else (cage, yard,
  // reception, mid-walk) is fair game, matching the owner's "everywhere".
  _updateAnimalCollisions() {
    const entries = [];
    for (const [stay, rec] of this._staySprites) {
      if (stay.tuckedIn) continue;
      entries.push(rec.sprite);
    }
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      const ra = (a.displayWidth || 24) / 2;
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        const rb = (b.displayWidth || 24) / 2;
        const minD = ra + rb - ANIMAL_COLLIDE_PAD;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; } // exactly stacked — nudge apart along an arbitrary axis
        const push = (minD - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        a.setDepth(a.y);
        b.setDepth(b.y);
      }
    }
    // Issue #84: this pass runs AFTER _updateWander, so a bumped fish would
    // otherwise be shoved straight out of the pond and stay there until her
    // next wander frame. Two fish sharing the pond do exactly that. Put any
    // swimmer back in the water as the last thing that touches her position.
    for (const [, rec] of this._staySprites) {
      if (!rec.inPond) continue;
      const p = clampToPondWater(rec.sprite.x, rec.sprite.y, rec.sprite.displayWidth, rec.sprite.displayHeight);
      rec.sprite.x = p.x;
      rec.sprite.y = p.y;
      rec.sprite.setDepth(rec.sprite.y);
    }
  }

  // `actor` is one entry of this.activePlayers — Player 1 or a claimed helper
  // (issue #53). Reads/writes only HER OWN sprite/controls/navPath, so
  // multiple actors calling this in the same frame never step on each other.
  _updateMovement(actor, delta) {
    const move = actor.controls.getMove();
    let moving = false;

    if (move.mag > 0.05) {
      // Direct steering always wins and cancels any in-progress tap-to-move walk.
      actor.navPath = null;
      actor.controls.clearTapTarget();
      actor.sprite.body.setVelocity(move.x * SPEED, move.y * SPEED);
      moving = true;
    } else {
      // A fresh tap/click redirects (or starts) the walk, even mid-path.
      // (Tap-to-move only ever comes from actor.controls.consumeTapTarget(),
      // which is null for a gamepad-only Controls instance — see Controls.js
      // — so a claimed helper simply never gets a tap target, no extra guard
      // needed here.)
      const target = actor.controls.consumeTapTarget();
      if (target) {
        // planMargin trimmed from 6 to 4 by issue #71: the planner refuses a
        // corridor narrower than 2*(clearance + planMargin) plus its own 20px
        // sampling step, and the cage aisles are sized against exactly this
        // number (see data/props.js). At 6 the player would have planned the
        // aisles as solid and walked all the way around the block, which is
        // the decorative-aisle outcome #71 exists to avoid. Her actual body is
        // 14x12, so 4 is still generous padding.
        actor.navPath = findPath(actor.sprite.x, actor.sprite.y, target.x, target.y, {
          minX: 0, minY: 0, maxX: WORLD.w, maxY: WORLD.h,
          collides: this._collides, cell: 20, clearance: 10, planMargin: 4,
        });
      }

      if (actor.navPath && actor.navPath.length) {
        const wp = actor.navPath[0];
        if (Phaser.Math.Distance.Between(actor.sprite.x, actor.sprite.y, wp.x, wp.y) < 4) {
          actor.navPath.shift();
        }
      }
      if (actor.navPath && actor.navPath.length) {
        const wp = actor.navPath[0];
        const ang = Phaser.Math.Angle.Between(actor.sprite.x, actor.sprite.y, wp.x, wp.y);
        actor.sprite.body.setVelocity(Math.cos(ang) * SPEED, Math.sin(ang) * SPEED);
        moving = true;
      } else {
        actor.navPath = null;
        actor.sprite.body.setVelocity(0, 0);
      }
    }

    this._updateWobble(actor, delta, moving);
  }

  // Squash/stretch walk-cycle wobble — a cheap stand-in for a full frame
  // animation. Issue #53: `actor.wobbleT` instead of a single scene-level
  // timer, so up to 4 simultaneously-moving actors each wobble on their own
  // clock instead of all sharing (and fighting over) one.
  _updateWobble(actor, delta, moving) {
    if (moving) {
      actor.wobbleT = (actor.wobbleT || 0) + delta;
      const s = Math.sin(actor.wobbleT / 90) * 0.06;
      actor.sprite.setScale(1 + s, 1 - s);
    } else {
      actor.wobbleT = 0;
      actor.sprite.setScale(1, 1);
    }
  }

  _updateTint() {
    const { color, alpha } = tintForHour(this.clock.hourFloat);
    this.tintGfx.clear();
    if (alpha <= 0.002) return;
    const sw = logicalW(this), sh = logicalH(this);
    // Oversized rect centred near the origin so it covers the screen regardless
    // of the centred camera's zoom-about-centre origin (see uiUtils.js).
    this.tintGfx.fillStyle(color, alpha).fillRect(-sw, -sh, sw * 3, sh * 3);
  }
}
