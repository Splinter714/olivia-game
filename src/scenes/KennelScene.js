import Phaser from 'phaser';
import {
  WALL, ROOM, OUTSIDE, WORLD, BACK_DOOR, FRONT_DOOR, RECEPTION, SECTIONS,
  BACK_WING, STAFF_DOOR, WING_DOOR, STORAGE_ROOM, HOUSE_ROOM,
  wallRects, backWingWallRects, outsideFenceRects,
} from '../data/sections.js';
import {
  SCOOPER_SPOT, BOWL_SPOTS, WATER_BOWL_SPOTS, COMPUTER_SPOT,
  OVEN, OVEN_SPOT, TREAT_TRAY_SPOT, STORAGE_PROPS, BED, BED_SPOT,
  CAGES, LITTER_SPOTS, YARD_BOWL_SPOTS, YARD_RECT,
  cageAnimalSpot,
} from '../data/props.js';
import { createClock, tintForHour, PHASE, DAY_START } from '../data/clock.js';
import { EVENTS } from '../data/events.js';
import { findPath } from '../data/path.js';
import { tickNeeds, clearNeed, createBowlState } from '../data/needs.js';
import { tickBirth, attachBirthTimer } from '../data/births.js';
import { SPECIES, FAMILY } from '../data/species.js';
import { pickWakeEvent, WAKE_REASON } from '../data/night.js';
import { createAnimal } from '../data/animal.js';
import { randomName } from '../data/names.js';
import { createEconomy, computePayout, upgradeMessage } from '../data/economy.js';
import { pickWanderInterval, wanderAmplitude } from '../data/wander.js';
import { Controls } from '../input/Controls.js';
import { buildKennelTextures, buildFloorTile } from '../art/kennel.js';
import { buildPlayerTexture, PLAYER_W, PLAYER_H } from '../art/player.js';
import { buildOwnerTexture, OWNER_W } from '../art/owner.js';
import {
  buildAnimalTextures, ensureAnimalTextures, ANIMAL_DISPLAY_SCALE, EGG_KEY,
} from '../art/animals.js';
import { resolveTieBreakers, effectiveLook } from '../data/distinguish.js';
import { lookId } from '../data/coats.js';
import { buildCarryTextures, CARRY_KEY, CARRY_DISPLAY_SCALE } from '../art/carry.js';
import {
  buildPropTextures, LITTER_BOX_KEY,
  SCOOPER_KEY, BOWL_KEY, BOWL_KEY_BY_SPECIES, BOWL_EMPTY_KEY, BOWL_EMPTY_KEY_BY_SPECIES,
  WATER_BOWL_KEY, WATER_BOWL_EMPTY_KEY,
  MESS_KEY, NEED_KEY, COMPUTER_KEY, BLANKET_KEY, UPGRADE_KEY, CAGE_KEY, CAGE_FG_KEY, EMPTY_CAGE_KEY,
  OVEN_KEY, TREAT_TRAY_KEY, SHELF_KEY, BOX_KEY, BAG_KEY, BED_KEY,
} from '../art/props.js';
import {
  buildRaccoonTextures, RACCOON_KEYS, RACCOON_SCARED_KEY, CRUMB_KEY, HELD_TREAT_KEY, RACCOON_DISPLAY_SCALE,
} from '../art/raccoon.js';
import { RACCOON_CHECK_INTERVAL, RACCOON_APPROACH_MS, RACCOON_SCAMPER_MS, RACCOON_SCARE_DASH_MS, randomTreat } from '../data/raccoon.js';
import { createRoster, LOCATION, CARRY_KIND, assignCageSlot, isCageSlotOpen, anyOpenCageAnywhere, belongsToSection } from '../data/roster.js';
import { loadGame, saveGame, clearSave, seedGlobalNameState } from '../data/persistence.js';
import { applyDpr, logicalW, logicalH, worldUiOffset } from '../uiUtils.js';
import { WithDevDrag } from '../dev/dragTool.js';
import { WithSecretDragon } from '../dev/secretDragon.js';

// Placeholder name shown on a baby's tiny label until the owner names it via
// the reception computer (issue #10). Matches data/animal.js's opts.name
// override convention — createAnimal({ name: BABY_PLACEHOLDER }).
const BABY_PLACEHOLDER = '???';

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

// Night sequence timings (issue #11) — the screen fades to black once
// everyone's tucked in, fades back for each wake-up so the player can act,
// then fades out again to keep "sleeping" until morning.
const SLEEP_FADE_MS = 900;
const WAKE_FADE_MS = 500;
const RESOLVE_FADE_MS = 700;
const BAD_DREAM_MS = 2600; // flavor-only wake-up: no fix needed, just settles back down

// Issue #45: animals and owner NPCs get around under their own power now —
// an arriving owner walks her pet all the way out to the play yard, an
// opened cage's occupant walks herself out (or over to her waiting owner),
// and everyone walks back to her own cage at night. Both use the same
// waypoint walker (_startWalk/_updateWalkers) over data/path.js's findPath,
// so nobody ever walks through a wall. Animals amble; owners stride.
const ANIMAL_WALK_SPEED = 82;  // px/s, world units
const OWNER_WALK_SPEED = 150;  // px/s

// Circle-vs-axis-aligned-rect overlap test, used by findPath's `collides` callback.
function circleRectOverlap(cx, cy, r, rect) {
  const nx = Phaser.Math.Clamp(cx, rect.x, rect.x + rect.w);
  const ny = Phaser.Math.Clamp(cy, rect.y, rect.y + rect.h);
  return Phaser.Math.Distance.Between(cx, cy, nx, ny) < r;
}

// Main gameplay scene: draws the kennel building + outside strip from
// data/sections.js, and drives the player around it. Animals, arrivals, and
// carrying (issues #4/#5) hang off the same section rects; feeding/potty/
// playpens (issues #6/#7/#8) hang off data/props.js's furniture rects.
export default class KennelScene extends WithSecretDragon(WithDevDrag(Phaser.Scene)) {
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
    buildAnimalTextures(this);
    buildCarryTextures(this);
    buildPropTextures(this);
    buildRaccoonTextures(this);

    // (Issue #47: the movable yard divider is gone — the outside yard is one
    // single undivided play area, YARD_RECT in data/props.js.)

    // ── Feeding / potty (issues #6, #7, #22 #6) — scooperRestPos must exist
    // before _buildProps() below, which draws the resting scooper sprite there. ──
    this.hasScooper = false;
    this._scooperVisual = null;
    this._scooperRestSprite = null;
    this.scooperRestPos = { x: SCOOPER_SPOT.x, y: SCOOPER_SPOT.y };

    this._drawWorld();
    this._buildProps();
    this._buildCollision();
    this._buildPlayer();

    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.controls = new Controls(this);
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

    // ── Roster / arrivals / carrying (issues #4, #5, #20) ──────────────────
    this.roster = createRoster(this._save ? { stays: this._save.stays, pool: this._save.pool } : null);
    this._staySprites = new Map(); // stay -> { pos, sprite, tag:{container,width,height}, extras:[...], babyLabels:[...], needIcons:{}, wanderBounds }
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
    this._computerNeedIcon = null;
    this._computerBusy = false;

    // ── Economy: payouts + returning-guest upgrades (issue #12) ────────────
    this.economy = createEconomy(this._save?.economyTotal ?? 0);

    // ── Back wing: baking + the raccoon surprise (issue #13) ───────────────
    this.treatTray = null;                        // { treat, sprite } on the kitchen counter, or null
    this._raccoonTimer = RACCOON_CHECK_INTERVAL();
    this._raccoon = null;                          // active scamper visual, or null while she's mid-run

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
      this._restoreStaySprites();
      // HudScene/NotificationScene only update on these events firing — emit
      // once now so the HUD immediately reflects the resumed day/hour/money
      // instead of showing fresh-boot defaults until the next natural change.
      this.game.events.emit(EVENTS.HOUR_CHANGE, { hour: this.clock.hour, phase: this.clock.phase, day: this.clock.day, syncOnly: true });
      this.game.events.emit(EVENTS.PHASE_CHANGE, { phase: this.clock.phase, isNight: this.clock.phase === PHASE.NIGHT, syncOnly: true });
      this.game.events.emit(EVENTS.MONEY_CHANGE, { total: this.economy.total });
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
  // (_sectionSlot, _openYardSpot/_dropOffToYard) so a resumed stay ends
  // up in the same kind of spot a freshly-placed one would.
  //
  // `LOCATION.CARRYING` (mid-carry when the page was closed) has no
  // meaningful visual to resume — DESIGN.md's persistence goal is "the
  // kennel looks the same when you come back", not frame-accurate resume of
  // an in-progress pickup — so she's settled back wherever she last had a
  // real home: her cage if she had one (`cageSection`), reception otherwise.
  //
  // Issue #45: a stay caught mid-WALK (walking herself out to the yard, home
  // to her cage at night, or over to her waiting owner) needs no special
  // case here either, for the same reason — her saved `location` is always
  // one of the two ends of that walk (see _openCage/_startWalkHome), so she
  // simply settles at whichever end the save recorded.
  _restoreStaySprites() {
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    for (const stay of this.roster.stays) {
      if (stay.location === LOCATION.CARRYING) {
        stay.location = sectionKeys.has(stay.cageSection) ? stay.cageSection : LOCATION.RECEPTION;
      }
    }

    const { rug } = RECEPTION;
    let receptionIdx = 0;
    let yardIdx = 0;
    for (const stay of this.roster.stays) {
      if (stay.location === LOCATION.RECEPTION) {
        const idx = receptionIdx++;
        const x = rug.x + 30 + (idx % 3) * 55;
        const y = rug.y + 24 + Math.floor(idx / 3) * 42;
        this._renderStay(stay, x, y);
      } else if (stay.location === LOCATION.YARD) {
        const pos = this._gridSlot(YARD_RECT, yardIdx++, 20, 44, 52);
        this._renderStay(stay, pos.x, pos.y);
      } else if (sectionKeys.has(stay.location)) {
        const section = SECTIONS.find((s) => s.key === stay.location);
        const pos = this._sectionSlot(section, stay);
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

  // ── World geometry ──────────────────────────────────────────────────────

  _drawWorld() {
    // Base hallway floor + outside grass, under the section floors.
    this.add.tileSprite(0, ROOM.y, ROOM.w, ROOM.h, 'tile-wood').setOrigin(0, 0).setDepth(-3);
    this.add.tileSprite(OUTSIDE.x, ROOM.y, OUTSIDE.w, ROOM.h, 'tile-grass').setOrigin(0, 0).setDepth(-3);

    // Outer building walls (perimeter, back-wing, yard fence). Issue #32: the
    // old per-species walled rooms (and their internal pen walls) are gone
    // entirely — the main room is now one open floor with a single cage grid
    // in it (see _buildProps/_refreshCageArt), so there's nothing left here
    // but the building's own outer shell.
    for (const r of wallRects()) {
      this.add.tileSprite(r.x, r.y, r.w, r.h, 'tile-wall').setOrigin(0, 0).setDepth(0);
    }

    // Outside fence.
    for (const r of outsideFenceRects()) {
      this.add.tileSprite(r.x, r.y, r.w, r.h, 'tile-fence').setOrigin(0, 0).setDepth(0);
    }

    // Reception desk (solid obstacle), rug + mat (decorative, walkable).
    const deco = this.add.graphics().setDepth(-1);
    const { desk, rug, mat } = RECEPTION;
    deco.fillStyle(0xcf9a63, 1).fillRoundedRect(rug.x, rug.y, rug.w, rug.h, 10);
    deco.fillStyle(0xe8c68f, 1).fillRoundedRect(mat.x, mat.y, mat.w, mat.h, 6);
    deco.fillStyle(0x8a5a34, 1).fillRoundedRect(desk.x, desk.y, desk.w, desk.h, 4);
    deco.fillStyle(0x9c6a3e, 1).fillRect(desk.x, desk.y, desk.w, 8);

    // Front door — visual only this phase; the south wall behind it stays solid.
    const doorGfx = this.add.graphics().setDepth(1);
    const dw = FRONT_DOOR.x1 - FRONT_DOOR.x0;
    doorGfx.fillStyle(0x7a4a2a, 1).fillRect(FRONT_DOOR.x0, ROOM.y + ROOM.h - WALL, dw, WALL);
    doorGfx.fillStyle(0x5c3620, 1).fillRect(FRONT_DOOR.x0 + dw / 2 - 1, ROOM.y + ROOM.h - WALL, 2, WALL);

    // Back door — the east wall already has a gap here (see wallRects); mark the
    // threshold so it reads as a doorway rather than just an empty wall.
    doorGfx.fillStyle(0xe8c68f, 1).fillRect(ROOM.w - WALL, BACK_DOOR.y0, WALL, BACK_DOOR.y1 - BACK_DOOR.y0);

    // Staff door — the gap this same wall-split carved in the north wall,
    // leading up into the back wing (issue #13, repositioned north by #23).
    doorGfx.fillStyle(0xe8c68f, 1).fillRect(STAFF_DOOR.x0, ROOM.y, STAFF_DOOR.x1 - STAFF_DOOR.x0, WALL);

    this._drawBackWing(doorGfx);
  }

  // Back wing (issue #13): base hallway floor, the storage/house rooms' own
  // floors + labels, the wing's outer + dividing walls, and the internal
  // doorway between the two rooms. Same layered approach as the main
  // building above, just south of it.
  _drawBackWing(doorGfx) {
    this.add.tileSprite(BACK_WING.x, BACK_WING.y, BACK_WING.w, BACK_WING.h, 'tile-wood').setOrigin(0, 0).setDepth(-3);
    this.add.tileSprite(STORAGE_ROOM.x, STORAGE_ROOM.y, STORAGE_ROOM.w, STORAGE_ROOM.h, 'floor-storage').setOrigin(0, 0).setDepth(-2);
    this.add.tileSprite(HOUSE_ROOM.x, HOUSE_ROOM.y, HOUSE_ROOM.w, HOUSE_ROOM.h, 'floor-house').setOrigin(0, 0).setDepth(-2);

    const labelStyle = {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#2b2b2b',
      backgroundColor: '#ffffffcc', padding: { x: 6, y: 3 },
    };
    this.add.text(STORAGE_ROOM.x + STORAGE_ROOM.w / 2, STORAGE_ROOM.y + 10, '📦 Storage', labelStyle)
      .setOrigin(0.5, 0).setDepth(50);
    this.add.text(HOUSE_ROOM.x + HOUSE_ROOM.w / 2, HOUSE_ROOM.y + 10, '🏠 House', labelStyle)
      .setOrigin(0.5, 0).setDepth(50);

    for (const r of backWingWallRects()) {
      this.add.tileSprite(r.x, r.y, r.w, r.h, 'tile-wall').setOrigin(0, 0).setDepth(0);
    }

    // Doorway between storage and house.
    const divX = BACK_WING.x + BACK_WING.w / 2;
    doorGfx.fillStyle(0xe8c68f, 1).fillRect(divX - WALL / 2, WING_DOOR.y0, WALL, WING_DOOR.y1 - WING_DOOR.y0);
  }

  // Furniture added by issues #6/#7/#8/#13/#14/#18/#20 — turtle/snake tanks
  // with individual islands/perches per cage slot, litter box, scooper,
  // per-cage bowls, the yard's shared bowls, the reception computer and the
  // back wing (oven/storage dressing). All positions come from data/props.js
  // so interaction code below reads the exact same rects.
  _buildProps() {
    // Per-cage litter boxes (issue: "each cat cage should have a small
    // litter box, not a corner everyone litter box") — same occupancy-driven
    // create/destroy/reskin pattern as bowls below; no sprite exists here at
    // build time, _refreshLitterBoxes creates one only for a cage currently
    // holding a cat. Covers every species key (a cat can settle in any
    // open cage slot), not just 'cat'.
    this._litterImgs = {};
    const hallScene = this;
    for (const key of Object.keys(CAGES)) {
      this._litterImgs[key] = CAGES[key].map(() => null);
      CAGES[key].forEach((_, i) => {
        this._devRegistry.push({ name: `LITTER_SPOTS.${key}.${i}`, get obj() { return hallScene._litterImgs[key][i]; } });
      });
    }

    this._rebuildScooperRestSprite();
    // The scooper's rest sprite is destroyed/recreated whenever it's picked
    // up/set down (_pickUpScooper/_dropScooper), so the registry holds a
    // live getter rather than a fixed reference — the drag tool filters out
    // any entry whose obj is currently null (scooper in the player's hands).
    const scene = this;
    this._devRegistry.push({ name: 'SCOOPER_SPOT', get obj() { return scene._scooperRestSprite; } });

    // One bowl per individual cage slot (issue #22 #6), refined by owner note
    // 2026-07-29: bowls don't exist until an animal is actually settled in
    // that cage. No sprite is created here — this._bowlImgs just tracks the
    // (initially empty) per-slot sprite so _refreshBowls can create/destroy/
    // re-skin it as occupancy changes (see that method for the full story).
    // Issue #32 #4: turtles now get one too (BOWL_SPOTS covers every species
    // key, no exclusions).
    this._bowlImgs = {};
    this._waterBowlImgs = {};
    const scopedScene = this;
    for (const key of Object.keys(BOWL_SPOTS)) {
      this._bowlImgs[key] = BOWL_SPOTS[key].map(() => null);
      this._waterBowlImgs[key] = WATER_BOWL_SPOTS[key].map(() => null);
      BOWL_SPOTS[key].forEach((spot, i) => {
        // Live getter (same pattern as SCOOPER_SPOT above) since the actual
        // sprite is created/destroyed dynamically, not fixed at build time.
        this._devRegistry.push({ name: `BOWL_SPOTS.${key}.${i}`, get obj() { return scopedScene._bowlImgs[key][i]; } });
        this._devRegistry.push({ name: `WATER_BOWL_SPOTS.${key}.${i}`, get obj() { return scopedScene._waterBowlImgs[key][i]; } });
      });
    }
    // Not calling _refreshBowls() here: this.roster doesn't exist yet at this
    // point in create() — _refreshCageArt() calls _refreshBowls() itself, and
    // that first runs right after the roster is built (see create()'s own
    // comment).

    // Issue #32 follow-up, collapsed to ONE pair by issue #47: the outside
    // yard's single shared food+water bowl pair — always present (not
    // occupancy-gated like a cage bowl), starting empty. _refreshYardBowls
    // (called once the roster exists) sets their real full/empty textures.
    this._yardBowlImgs = {
      food: this.add.image(YARD_BOWL_SPOTS.food.x, YARD_BOWL_SPOTS.food.y, BOWL_EMPTY_KEY)
        .setOrigin(0.5, 1).setDepth(YARD_BOWL_SPOTS.food.y),
      water: this.add.image(YARD_BOWL_SPOTS.water.x, YARD_BOWL_SPOTS.water.y, WATER_BOWL_EMPTY_KEY)
        .setOrigin(0.5, 1).setDepth(YARD_BOWL_SPOTS.water.y),
    };
    this._devRegistry.push({ name: 'YARD_BOWL_SPOTS.food', obj: this._yardBowlImgs.food });
    this._devRegistry.push({ name: 'YARD_BOWL_SPOTS.water', obj: this._yardBowlImgs.water });

    // Reception computer (issue #10) — baby-announcement messages to owners.
    const computer = this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y, COMPUTER_KEY).setOrigin(0.5, 1).setDepth(COMPUTER_SPOT.y);
    this._devRegistry.push({ name: 'COMPUTER_SPOT', obj: computer });

    // Individual cages (issue #18, single grid as of issue #32) — 6 per
    // species, including turtles/snakes (issue #20 — styled as islands/
    // perches instead of wire pens) and the secret dragon (issue #32 #5 — a
    // little stone castle). Keep a handle on each cage's image
    // (this._cageImgs) so _refreshCageArt can re-texture it per-occupant
    // without touching its fixed position/size.
    //
    // Issue #43 (owner: "z order of cage bars should be above everything
    // else in the cage, including the animal") — TWO images per cage slot
    // now: the background half at the same low depth as before (behind the
    // animal), and a foreground half (this._cageFgImgs) at a depth ABOVE the
    // animal, her bowls (whose depth is cage.y + cage.h + 1, see
    // _refreshBowls), and her blanket — see the depth chosen below.
    this._cageImgs = {};
    this._cageFgImgs = {};
    for (const key of Object.keys(CAGES)) {
      this._cageImgs[key] = [];
      this._cageFgImgs[key] = [];
      CAGES[key].forEach((cage, i) => {
        const img = this.add.image(cage.x, cage.y, CAGE_KEY[key]).setOrigin(0, 0).setDepth(cage.y - 2);
        this._devRegistry.push({ name: `CAGES.${key}.${i}`, obj: img });
        this._cageImgs[key].push(img);
        // Foreground depth: cage.y + cage.h + 5 comfortably clears every
        // in-cage occupant depth (the animal's own wander-clamped depth tops
        // out at cage.y + cage.h - 4, her bowls sit at cage.y + cage.h + 1,
        // her blanket at that bowl-adjacent depth + 0.3) while staying well
        // below the next grid row's own contents (rows are cage.h + 12px
        // apart, i.e. +112, so +5 never bleeds into the row below).
        const fgImg = this.add.image(cage.x, cage.y, CAGE_FG_KEY[key]).setOrigin(0, 0).setDepth(cage.y + cage.h + 5);
        this._devRegistry.push({ name: `CAGES_FG.${key}.${i}`, obj: fgImg });
        this._cageFgImgs[key].push(fgImg);
      });
    }

    // Back wing furniture (issue #13): the kitchen's oven/counter (the one
    // interactive spot — baking lives at _bakeTreat) and the storage room's
    // purely-atmospheric shelves/boxes/bags.
    const oven = this.add.image(OVEN_SPOT.x, OVEN_SPOT.y, OVEN_KEY).setOrigin(0.5, 1).setDepth(OVEN_SPOT.y);
    this._devRegistry.push({ name: 'OVEN_SPOT', obj: oven });
    const bed = this.add.image(BED_SPOT.x, BED_SPOT.y, BED_KEY).setOrigin(0.5, 1).setDepth(BED_SPOT.y);
    this._devRegistry.push({ name: 'BED_SPOT', obj: bed });
    const dressingKey = { shelf: SHELF_KEY, boxes: BOX_KEY, bag: BAG_KEY };
    STORAGE_PROPS.forEach((p, i) => {
      const img = this.add.image(p.x, p.y, dressingKey[p.key]).setOrigin(0.5, 1).setDepth(p.y);
      this._devRegistry.push({ name: `STORAGE_PROPS.${i}`, obj: img });
    });

    // (Issue #47: the movable yard divider's fence line + post used to be
    // built here — the yard is one single undivided area now.)
  }

  // Dev tool (src/dev/dragTool.js): the ONE place that turns `_devRegistry`
  // (populated above, right where each object is actually placed) into the
  // drag tool's live target list. Filters out anything whose `obj` isn't
  // currently on screen (e.g. the scooper while it's in the player's hands).
  // `kind`/`rectSize` pass through for the section-area handles (see
  // _drawWorld) — dragTool.js draws/exports those differently from ordinary
  // furniture props.
  _devDragTargets() {
    return this._devRegistry
      .map((e) => ({ name: e.name, obj: e.obj, kind: e.kind, rectSize: e.rectSize }))
      .filter((e) => e.obj);
  }

  // (Re)creates the resting scooper sprite at its current rest spot — called
  // once at build time and again whenever the scooper is set back down
  // (issue #22 #5).
  _rebuildScooperRestSprite() {
    this._scooperRestSprite?.destroy();
    const { x, y } = this.scooperRestPos;
    this._scooperRestSprite = this.add.image(x, y, SCOOPER_KEY).setOrigin(0.5, 1).setDepth(y);
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

  // Re-textures every individual cage (no positioning left to do — the
  // single grid's cage positions are permanent, set once in _buildProps).
  // Whoever's actually settled there shows her OWN species' cage art (a
  // turtle always gets a little water-tank-with-sand island, a snake her
  // tank perch, the secret dragon her stone castle, etc. — see CAGE_KEY,
  // art/props.js) with a quick scale-pop tween the moment the art actually
  // changes; an empty slot gets the single shared neutral empty-cage look.
  //
  // Issue #43: each occupied slot is now TWO images (this._cageImgs — the
  // background floor/fill, unchanged depth/behavior — and this._cageFgImgs —
  // the bars/mesh/glass-rim/turrets, at a depth above the animal). An empty
  // slot has no foreground look of its own (EMPTY_CAGE_KEY has no `CAGE_FG_KEY`
  // counterpart — see that key's comment in art/props.js), so the foreground
  // image is simply hidden while the slot is unoccupied.
  _refreshCageArt() {
    if (!this._cageImgs) return;
    for (const key of Object.keys(this._cageImgs)) {
      this._cageImgs[key].forEach((img, slot) => {
        // Bug fix (owner note 2026-07-29: "keep it visually occupied if
        // it's occupied"): this used to check s.location === key, which
        // misses a stay currently out playing in the yard — her `location`
        // reads LOCATION.YARD while she's out there, even though the slot
        // is still hers (belongsToSection/assignCageSlot already treat a
        // yard trip as still occupying it). The cage visually flipped back
        // to "empty" the instant she went out to play, even though trying
        // to drop a new animal there correctly got rejected as full —
        // confusing since it LOOKED open. belongsToSection is the same
        // check the actual occupancy bookkeeping already uses.
        const occupant = this.roster.stays.find((s) => belongsToSection(s, key) && s.cageSlot === slot);
        const texKey = occupant ? (CAGE_KEY[occupant.animal.species] ?? CAGE_KEY[key]) : EMPTY_CAGE_KEY;
        const changed = img.texture.key !== texKey;
        if (changed) img.setTexture(texKey);
        if (changed) this._snapCagePop(img);

        const fgImg = this._cageFgImgs[key][slot];
        if (occupant) {
          const fgTexKey = CAGE_FG_KEY[occupant.animal.species] ?? CAGE_FG_KEY[key];
          const fgChanged = !fgImg.visible || fgImg.texture.key !== fgTexKey;
          if (fgChanged) fgImg.setTexture(fgTexKey).setVisible(true);
          if (fgChanged) this._snapCagePop(fgImg);
        } else if (fgImg.visible) {
          fgImg.setVisible(false);
        }
      });
    }
    this._refreshBowls();
    this._refreshLitterBoxes();
  }

  // Bowls only exist for an occupied cage (issue #22 #6, owner note
  // 2026-07-29: "don't need to be there BEFORE placing the animal") and are
  // styled per the species actually settled there ("informed based on the
  // animal that's placed" — see BOWL_KEY_BY_SPECIES in art/props.js). Mirrors
  // _refreshCageArt's occupancy-driven redraw: called from every site that
  // already calls _refreshCageArt (drop-off, checkout, yard recall) — that
  // covers every way a cage's occupant can change EXCEPT picking her back up
  // (_pickUp calls this directly too, since cage ART itself doesn't need
  // refreshing there, but her bowl does). Every species gets a bowl now,
  // including turtles (issue #32 #4 — the old shared-tank/lettuce mechanic
  // is gone; BOWL_SPOTS has no exclusions left).
  //
  // Owner note 2026-07-29: bowls now also track full-vs-empty stock
  // (stay.bowl.food/water, set by _fillBowl/consumed automatically by
  // _autoResolveBowlNeeds), so the texture picked here depends on that too,
  // not just occupancy/species. Water bowls (WATER_BOWL_SPOTS) get the exact
  // same create/destroy/reskin treatment as the food bowl, just with a
  // single shared texture instead of per-species art.
  //
  // Issue #32 #6 (owner: "I see the bowls for guinea pig and dog, but they
  // don't appear visible for some other animals — is it a z order issue?").
  // Two real bugs, both fixed here:
  //  1. A DEPTH bug: _updateWander lets a settled stay's sprite drift
  //     anywhere inside her own cage rect and re-sets her depth to her
  //     CURRENT y every frame, clamped as far down as cage.y + cage.h - 4
  //     (the cage's own bottom edge). The bowl's depth used to be derived
  //     from its own spot y (also anchored near that same bottom edge) minus
  //     1 — so the instant she wandered near the front of her cage, her
  //     depth caught up to and passed the bowl's, and she rendered in front
  //     of it. Fixed by anchoring the bowl's depth to the CAGE's bottom edge
  //     instead of the bowl's own spot, always exceeding the max depth her
  //     wander can reach.
  //  2. A COVERAGE bug (this is what was still hiding bird/bunny bowls after
  //     fix #1 shipped): a stay's `location` is which CAGE SLOT KEY she's
  //     nominally assigned to, not necessarily her own species — "any pet,
  //     any open cage" placement could put a bird in what used to be the
  //     'turtle' key's nominal slot, and the old BOWL_SPOTS/BOWL_ELIGIBLE_KEYS
  //     list excluded 'turtle' (turtles used to be fed via the shared tank
  //     instead). Since that key had no bowl bookkeeping AT ALL, whoever
  //     ended up nominally housed there — regardless of her real species —
  //     got no bowl sprite, not a mispositioned one. This is why it looked
  //     "random by species": guinea pig/dog happened to be tested while
  //     housed under a covered key, bird/bunny happened to land under the
  //     one uncovered key. Issue #32 folds turtles into the same single cage
  //     grid with their own regular per-cage bowl (item #4), so every key
  //     now has full bowl bookkeeping — this coverage gap can't recur.
  _refreshBowls() {
    if (!this._bowlImgs || !this.roster) return;
    const bowlSpots = BOWL_SPOTS;
    const waterSpots = WATER_BOWL_SPOTS;
    const cages = CAGES;
    for (const key of Object.keys(this._bowlImgs)) {
      this._bowlImgs[key].forEach((existing, slot) => {
        const occupant = this.roster.stays.find((s) => belongsToSection(s, key) && s.cageSlot === slot);
        if (!occupant) {
          existing?.destroy();
          this._bowlImgs[key][slot] = null;
          return;
        }
        const stocked = !!occupant.bowl?.food;
        const texKey = stocked
          ? (BOWL_KEY_BY_SPECIES[occupant.animal.species] ?? BOWL_KEY)
          : (BOWL_EMPTY_KEY_BY_SPECIES[occupant.animal.species] ?? BOWL_EMPTY_KEY);
        const { x, y } = bowlSpots[key][slot];
        const depth = cages[key][slot].y + cages[key][slot].h + 1;
        // Skip only if already showing the right bowl in the right place.
        if (existing && existing.texture.key === texKey && existing.x === x && existing.y === y) return;
        existing?.destroy();
        const bowl = this.add.image(x, y, texKey).setOrigin(0.5, 1).setDepth(depth);
        this._bowlImgs[key][slot] = bowl;
        this._snapCagePop(bowl);
      });
      this._waterBowlImgs[key].forEach((existing, slot) => {
        const occupant = this.roster.stays.find((s) => belongsToSection(s, key) && s.cageSlot === slot);
        if (!occupant) {
          existing?.destroy();
          this._waterBowlImgs[key][slot] = null;
          return;
        }
        const stocked = !!occupant.bowl?.water;
        const texKey = stocked ? WATER_BOWL_KEY : WATER_BOWL_EMPTY_KEY;
        const { x, y } = waterSpots[key][slot];
        const depth = cages[key][slot].y + cages[key][slot].h + 1;
        if (existing && existing.texture.key === texKey && existing.x === x && existing.y === y) return;
        existing?.destroy();
        const bowl = this.add.image(x, y, texKey).setOrigin(0.5, 1).setDepth(depth);
        this._waterBowlImgs[key][slot] = bowl;
        this._snapCagePop(bowl);
      });
    }
  }

  // Per-cage litter box (owner note 2026-07-29: "each cat cage should have a
  // small litter box, not a corner everyone litter box") — mirrors
  // _refreshBowls exactly: exists only while the cage is occupied, and only
  // when the occupant is specifically a cat (any other species in that slot
  // means no litter box there). Same species-check-not-key-check reasoning
  // as bowls: a cat can settle in ANY open cage slot, so every key is
  // checked, not just 'cat'.
  _refreshLitterBoxes() {
    if (!this._litterImgs || !this.roster) return;
    const spots = LITTER_SPOTS;
    for (const key of Object.keys(this._litterImgs)) {
      this._litterImgs[key].forEach((existing, slot) => {
        const occupant = this.roster.stays.find((s) => belongsToSection(s, key) && s.cageSlot === slot);
        const isCat = occupant?.animal.species === 'cat';
        if (!isCat) {
          existing?.destroy();
          this._litterImgs[key][slot] = null;
          return;
        }
        const { x, y } = spots[key][slot];
        if (existing && existing.x === x && existing.y === y) return;
        existing?.destroy();
        const box = this.add.image(x, y, LITTER_BOX_KEY).setOrigin(0.5, 1).setDepth(y - 1);
        this._litterImgs[key][slot] = box;
        this._snapCagePop(box);
      });
    }
  }

  // "Kinda snap to" beat (owner note 2026-07-29): a brief scale-pop when a
  // cage's art actually changes (an animal settles in, checks out, or a
  // different species takes over a freed slot) — not a full animation
  // system, just a quick in-then-settle tween so the texture swap reads as a
  // deliberate transition rather than a flat instant change.
  _snapCagePop(img) {
    img.setScale(0.55);
    this.tweens.add({
      targets: img, scale: 1.12, duration: 130, ease: 'Back.Out',
      onComplete: () => this.tweens.add({ targets: img, scale: 1, duration: 100, ease: 'Sine.easeOut' }),
    });
  }

  _buildCollision() {
    // Obstacles that block movement — the outer building walls, big
    // furniture, and outside fence. Issue #32: no more internal pen walls
    // (the old per-species walled rooms are gone), so this is the whole
    // list — nothing left to rebuild live.
    this._outerObstacleRects = [
      ...wallRects(),
      RECEPTION.desk,
      ...outsideFenceRects(),
      ...backWingWallRects(),
      OVEN,
      BED,
    ];

    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.walls = this.physics.add.staticGroup();
    for (const r of this._outerObstacleRects) this._addWallZone(r, this.walls);

    // Shared "what blocks a body" list used by both arcade physics and
    // findPath's routing.
    this.obstacleRects = [...this._outerObstacleRects];
    this._collides = (x, y, r) => this.obstacleRects.some((rect) => circleRectOverlap(x, y, r, rect));
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
    this._runOwnerDropOff(stay);
  }

  // Secret bonus guest (src/dev/secretDragon.js's "DRAGON" cheat code). She
  // has no species section of her own, so this only bails out if the whole
  // kennel is genuinely full — `anyOpenCageAnywhere` already answers exactly
  // that. She then arrives through the exact same owner-walks-her-in
  // sequence as any other guest, and settles into any open cage the moment
  // the player carries her in — see _checkDropoff, which treats every guest
  // this same "any pet, any open cage" way (issue #32).
  _triggerSecretDragon() {
    if (!anyOpenCageAnywhere(this.roster.stays)) {
      this.game.events.emit(EVENTS.NOTIFY, 'A mythical dragon wanted to visit, but the kennel is full right now!');
      return;
    }
    this.game.events.emit(EVENTS.NOTIFY, '✨ A baby dragon appeared!');
    const stay = this.roster.spawnDragon({ day: this.clock.day, hour: this.clock.hour });
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
  // in the yard until the PLAYER carries her in to a specific cage — that
  // carry is unchanged, and it's still what gives her a cage, a nameplate
  // and bowls of her own ("player still carries her in", owner's answer on
  // the issue).
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

    const spot = this._openYardSpot(stay);
    this._startWalk(owner, spot.x, spot.y, {
      speed: OWNER_WALK_SPEED,
      onStep: followOwner,
      onArrive: () => {
        carryProp.destroy();
        // Same "she's out of the box and settled now" beat a cage drop-off
        // used to get (issue #21), played right where she's set down.
        if (stay.carryKind !== CARRY_KIND.NONE) this._playUnboxing(spot.x, spot.y, stay.carryKind);
        stay.location = LOCATION.YARD;
        this._renderStay(stay, spot.x, spot.y);
        this._syncTieBreakers(); // a new guest may now match someone already here
        this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} arrived — she's out playing in the yard!`);
        this._walkOwnerOut(stay);
      },
    });
  }

  // The next free placement spot in the single play yard (issue #47 — one
  // undivided area now), laid out as a simple grid so simultaneous
  // occupants don't stack. A pet still being walked out by her owner
  // (`_lingeringOwners`) counts as already out there even though her
  // `location` still reads RECEPTION, so two arrivals mid-delivery at the
  // same time can't be handed the identical spot.
  _openYardSpot(stay = null) {
    const already = this.roster.stays.filter((s) => s !== stay
      && (s.location === LOCATION.YARD || this._lingeringOwners.has(s))).length;
    return this._gridSlot(YARD_RECT, already, 20, 44, 52);
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
      collides: this._collides, cell: 20, clearance: 9, planMargin: 5,
    }) || [{ x: tx, y: ty }]; // unreachable (shouldn't happen) — go straight there
    const walk = { sprite, path, speed, stay, onStep, onArrive };
    this._walkers.push(walk);
    return walk;
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
    // She's up and about — out from under her blanket (issue #46).
    this._untuck(stay);
    // Someone's out of her cage again, so the kennel isn't all settled for
    // the night anymore — the "head to bed" go-ahead re-arms once she's back.
    this.night.allSettled = false;

    const checkout = this._checkoutOwners.get(stay);
    if (stay.checkoutReady && checkout) {
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

    // Nobody waiting for her — she lets herself out to the play yard. Her
    // cage stays hers the whole time (belongsToSection already treats a
    // yard trip as still occupying the slot), so the nameplate, bowls and
    // blanket all stay put in it.
    const spot = this._openYardSpot(stay);
    stay.location = LOCATION.YARD;
    this._setStayMoving(rec, true);
    this._startWalk(rec.sprite, spot.x, spot.y, {
      stay,
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
  // _recallYardToCages did.
  _startWalkHome(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec || this._isWalking(stay)) return;
    let sectionKey = stay.cageSection;
    let slot = stay.cageSlot;
    // Confirmed edge case (issue #45): a pet who's been playing out in the
    // yard since her owner dropped her off, and was never carried in to a
    // cage, has no home to walk to — she picks any open cage herself rather
    // than being stranded outside all night.
    if (slot == null || !CAGES[sectionKey]?.[slot]) {
      const open = this._findAnyOpenCage();
      if (!open) {
        // Genuinely nowhere to put her (shouldn't happen — arrivals stop
        // once every cage is spoken for). She stays out; _checkAllSettled
        // ignores her so bedtime can't deadlock on it.
        stay.noCageAvailable = true;
        return;
      }
      sectionKey = open.key;
      slot = open.slot;
    }
    stay.noCageAvailable = false;
    stay.cageSection = sectionKey;
    stay.cageSlot = slot;
    this._refreshCageArt(); // a newly-claimed cage reads as hers right away

    const spot = cageAnimalSpot(CAGES[sectionKey][slot]);
    this._setStayMoving(rec, true);
    this._startWalk(rec.sprite, spot.x, spot.y, {
      stay,
      onArrive: () => {
        this._stopStayMoving(stay);
        this._settleInCage(stay, sectionKey, slot);
      },
    });
  }

  // Arrival end of a walk: she's standing where she was headed, so re-render
  // her there. A full re-render (rather than nudging the existing sprites) is
  // what re-derives everything positional in one place — cage-anchored
  // nameplate vs. floating one, wander bounds, her blanket's day/night
  // placement — with no chance of the two paths drifting apart.
  _settleInCage(stay, sectionKey, slot) {
    stay.location = sectionKey;
    stay.cageSection = sectionKey;
    stay.cageSlot = slot;
    const spot = cageAnimalSpot(CAGES[sectionKey][slot]);
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

  // First open cage slot anywhere in the kennel, or null if every one is
  // taken — the self-assign fallback for a yard pet with no cage of her own.
  _findAnyOpenCage() {
    for (const key of Object.keys(CAGES)) {
      for (let slot = 0; slot < CAGES[key].length; slot++) {
        if (isCageSlotOpen(this.roster.stays, key, slot)) return { key, slot };
      }
    }
    return null;
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
  // yard (_checkDropoff's fallback). Either way she's handed off (her
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
    this._carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    this._carryVisual = null;
    if (this.carrying === stay) this.carrying = null;

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
    const cage = CAGES[stay.location]?.[stay.cageSlot];

    // Nameplate anchor: a caged/tanked/nested stay (per issue #20's
    // unification, turtle islands/snake perches/bird nests all count) gets a
    // FIXED plate mounted top-center of her cage, independent of wherever she
    // currently wanders inside it (or whether she's even there at all right
    // now) — reads as a nameplate on the cage door, not a floating label.
    // (Briefly moved to just below the bowls, then reverted back up top per
    // owner note 2026-07-29.) Anyone without a cage (waiting at reception,
    // being carried) keeps the original behavior: the tag floats just above
    // her current position.
    //
    // Bug fix (owner note 2026-07-29: "for assigned cages when there's an
    // animal in the play-yard, the food/water bowls and name plate and all
    // of that should stay put"): this used to reuse `cage` above, which is
    // null the instant she's out playing (her `location` reads 'yard' then,
    // even though the cage is still hers) — the nameplate would fall back to
    // floating over her in the yard instead of staying on her cage. Looked
    // up via `cageSection` instead (her actual home cage, set at drop-off
    // and unchanged by a yard trip) so it stays put regardless of whether
    // she's actually standing there right now.
    const homeCage = CAGES[stay.cageSection]?.[stay.cageSlot];
    const cageNameAnchor = homeCage ? { x: homeCage.x + homeCage.w / 2, y: homeCage.y + 18 } : null;
    const tag = cageNameAnchor
      ? this._addNameTag(cageNameAnchor.x, cageNameAnchor.y, animal.name)
      : this._addNameTag(x, y - sprite.displayHeight - 6, animal.name);
    // Issue #47: one single undivided yard, so a yard-placed stay's bounds
    // are simply the whole play area — no per-zone lookup to lose track of
    // on a redraw (tie-breaker sync, a birth landing, the computer flow).
    const bounds = cage || (stay.location === LOCATION.YARD ? YARD_RECT : null);
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
    let cx = x + sprite.displayWidth * (sharesHome ? 0.4 : 0.55);
    if (animal.hasEggs) {
      for (let i = 0; i < animal.eggCount; i++) {
        const jitterY = (Math.random() - 0.5) * (sharesHome ? 10 : 14) * spread;
        const egg = this.add.image(cx, y - 1 + jitterY, EGG_KEY).setOrigin(0.5, 1).setDepth(y - 1);
        extras.push(egg);
        followers.push({ obj: egg, dx: cx - x, dy: -1 + jitterY, dz: -1 });
        cx += (sharesHome ? 10 : 16) * spread;
      }
    }

    // Companions (a mom's litter). Anyone whose coat+pattern is shared with
    // another animal currently in the kennel gets a coloured collar — and an
    // ID tattoo once the collars run out — drawn straight into their art by
    // the tie-breaker resolution above (data/distinguish.js).
    //
    // Issue #48 bug 2 ("we need to get babies to wander also, not just
    // adults"): each baby keeps a BASE OFFSET from mom, and drifts gently
    // around that offset on her own little timer (see _updateWander /
    // _updateStayVisuals). Because every position is expressed relative to
    // mom, the babies automatically stay with her when she wanders — or
    // walks across the whole kennel — and their distinct base offsets are
    // what keeps them from piling onto her or onto each other.
    const babies = [];
    const babyLabels = [];
    const babySprites = [];
    for (const baby of stay.companions) {
      const jitterY = (sharesHome ? (Math.random() - 0.5) * 10 : (Math.random() - 0.5) * 8) * spread;
      const babySprite = this._addAnimalSprite(cx, y + jitterY, baby, 'baby', tb);
      extras.push(babySprite);
      babySprites.push(babySprite);

      // Tiny label under each baby — "???" until the owner named it via the
      // reception computer (issue #10), then its real name. Proximity-gated
      // like every other name tag (issue #22 #2), and it follows its baby
      // around now (issue #48).
      const label = this.add.text(cx, y + jitterY + 2, baby.name || BABY_PLACEHOLDER, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#4a341c',
        backgroundColor: '#ffffffb0',
        padding: { x: 2, y: 0 },
      }).setOrigin(0.5, 0).setDepth(y + 0.2).setVisible(false);
      extras.push(label);
      babyLabels.push(label);

      const bx = cx - x, by = jitterY;
      babies.push({ sprite: babySprite, label, bx, by, ox: bx, oy: by, tx: bx, ty: by, t: pickWanderInterval(baby.species) });

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
      wanderBounds, wanderAnchor, wander: null,
      cageAnchored: !!cageNameAnchor,
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
    rec.tag.container.destroy();
    rec.extras.forEach((e) => e.destroy());
    Object.values(rec.needIcons).forEach((icon) => icon.destroy());
    rec.blanket?.destroy();
    this._staySprites.delete(stay);
  }

  // Small hanging name placard, sized to fit `name` (issue #22 #1 — long
  // names like "Snickerdoodle" must not clip), anchored so its bottom sits
  // at (x, y). Hidden by default; toggled per-frame by proximity to the
  // player (issue #22 #2 — see _updateNameTagVisibility). Returns
  // {container, width, height} so callers can destroy/reposition it.
  _addNameTag(x, y, name) {
    const text = this.add.text(0, 3, name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#4a341c',
    }).setOrigin(0.5, 0);
    const width = Math.max(34, Math.ceil(text.width) + 16);
    const height = 20;
    const bg = this.add.graphics();
    bg.fillStyle(0xead9b3, 1).fillRoundedRect(-width / 2, 0, width, height - 2, 4);
    bg.lineStyle(2, 0xa9824a, 1).strokeRoundedRect(-width / 2 + 1, 1, width - 2, height - 4, 4);
    bg.fillStyle(0x8a6a3e, 1);
    bg.fillCircle(-width / 2 + 6, 3, 2);
    bg.fillCircle(width / 2 - 6, 3, 2);
    const container = this.add.container(x, y - height, [bg, text]).setDepth(9000).setVisible(false);
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
    const px = this.player.x, py = this.player.y;
    for (const rec of this._staySprites.values()) {
      const near = Phaser.Math.Distance.Between(px, py, rec.sprite.x, rec.sprite.y) <= NAME_TAG_RADIUS;
      rec.tag.container.setVisible(rec.cageAnchored || near);
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
      for (const baby of rec.babies) {
        baby.ox += (baby.tx - baby.ox) * 0.04;
        baby.oy += (baby.ty - baby.oy) * 0.04;
        let bx = s.x + baby.ox, by = s.y + baby.oy;
        const b = rec.wanderBounds;
        if (b) {
          bx = Phaser.Math.Clamp(bx, b.x + 4, b.x + b.w - 4);
          by = Phaser.Math.Clamp(by, b.y + 4, b.y + b.h - 4);
        }
        baby.sprite.setPosition(bx, by).setDepth(by + 0.2);
        baby.label.setPosition(bx, by + 2).setDepth(by + 0.3);
      }
      this._layOutNeedIcons(rec);
      if (!rec.cageAnchored) {
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

  _pickUp(stay) {
    this._carryOrigin = stay.location;
    // Issue #25: this was the last waiting reception stay her owner was
    // lingering beside — now that the player's taking the pet, the owner
    // walks back out through the front door and despawns.
    if (this._carryOrigin === LOCATION.RECEPTION) this._walkOwnerOut(stay);
    this._destroyStaySprites(stay);
    stay.location = LOCATION.CARRYING;
    this.carrying = stay;
    // If she was settled in a cage, that cage's bowl/litter box (if any)
    // should disappear the instant she's picked back up (owner note
    // 2026-07-29) — _refreshCageArt isn't otherwise called on pickup (cage
    // ART itself only changes per-occupant in generalized mode, refreshed on
    // the next drop-off/checkout), so these need their own explicit refresh.
    this._refreshBowls();
    this._refreshLitterBoxes();
    // Arrivals with a carry prop (leash/cage/box/basket) ride in that prop,
    // composed with her own sprite the same "contained" way she showed at
    // reception (issue #21) — everything else (small pets, or any settled
    // animal taken out to play) is carried bare, so just its own animated
    // sprite rides along.
    const anchorX = this.player.x, anchorY = this.player.y;
    let sprite, extraObjs;
    if (this._carryOrigin === LOCATION.RECEPTION && stay.carryKind !== CARRY_KIND.NONE) {
      ({ sprite, extras: extraObjs } = this._addContainedAnimal(anchorX, anchorY, stay, this._tieBreakers()));
    } else {
      sprite = this._addAnimalSprite(anchorX, anchorY, stay.animal, stay.animal.stage, this._tieBreakers());
      extraObjs = [];
    }
    // Every part follows the player as one group — record each part's offset
    // from the shared anchor point at creation time so _followCarry can just
    // re-apply it every frame without needing to know per-container layout.
    const parts = [sprite, ...extraObjs].map((obj) => ({ obj, dx: obj.x - anchorX, dy: obj.y - anchorY }));
    parts.forEach(({ obj }) => obj.setDepth(9500));
    this._carryVisual = { parts };
  }

  _followCarry() {
    if (!this._carryVisual) return;
    const ax = this.player.x;
    const ay = this.player.y - PLAYER_H * 0.55;
    this._carryVisual.parts.forEach(({ obj, dx, dy }, i) => {
      obj.x = ax + dx;
      obj.y = ay + dy;
      obj.setDepth(this.player.y + 1 + i * 0.01);
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
  _checkDropoff(carryPressed) {
    const stay = this.carrying;
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
      if (rec?.arrived && carryPressed) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, rec.sprite.x, rec.sprite.y);
        if (d < PICKUP_RADIUS) this._completeCheckout(stay);
      }
      return;
    }
    if (this._carryOrigin === LOCATION.YARD) {
      // Picked up from the yard — she can go right back into the yard
      // (change your mind / move her to a different spot), OR come back
      // inside to any open cage.
      if (this.player.x >= OUTSIDE.x + 8) {
        if (!carryPressed) return;
        this._dropOffToYard(stay);
        this._carryOrigin = null;
        return;
      }
      const found = this._findOpenCageNear(this.player.x, this.player.y);
      if (!found || !carryPressed) return;
      if (this._dropOff(stay, found.section, { cageSlot: found.slot })) this._carryOrigin = null;
    } else if (this._carryOrigin === LOCATION.RECEPTION) {
      // Owner note 2026-07-29 ("why can't I take a pet directly to the play
      // yard?"): a fresh arrival can go straight to the yard instead of a
      // cage — checked FIRST, as an ADDITIONAL option alongside (not instead
      // of) cage placement below, same walk-up-and-it-happens feel as every
      // other yard drop-off (no interact needed).
      if (this.player.x >= OUTSIDE.x + 8) {
        this._dropOffToYard(stay);
        this._carryOrigin = null;
        return;
      }
      // A fresh arrival choosing a cage instead — walking up to ANY specific
      // currently-empty cage anywhere accepts the drop into THAT exact cage,
      // regardless of species (no clustering — this also covers the secret
      // bonus dragon, who has no species-matching cage art of her own until
      // she's actually settled somewhere).
      const found = this._findOpenCageNear(this.player.x, this.player.y);
      if (!found) return;
      if (!carryPressed) return;
      if (this._dropOff(stay, found.section, { fromReception: true, cageSlot: found.slot })) this._carryOrigin = null;
    } else {
      // Picked up from her own cage — she can go out to the yard to play, OR
      // right back into any open cage (change your mind / just put her back).
      if (this.player.x >= OUTSIDE.x + 8) {
        // Owner note 2026-07-29: being in the yard should only highlight/
        // enable setting her down there — an explicit interact press is
        // needed to actually place her, same as every other drop-off target,
        // rather than auto-placing the instant she crosses into the yard.
        if (!carryPressed) return;
        this._dropOffToYard(stay);
        this._carryOrigin = null;
        return;
      }
      const found = this._findOpenCageNear(this.player.x, this.player.y);
      if (!found || !carryPressed) return;
      if (this._dropOff(stay, found.section, { cageSlot: found.slot })) this._carryOrigin = null;
    }
  }

  // Returns true if the drop-off happened, false if it was declined (section
  // full — see below), so _checkDropoff knows whether to keep carrying her.
  //
  // Issue #27: `opts.cageSlot`, when given (generalized-mode reception
  // drop-off — see _findOpenCageNear), assigns her to THAT exact slot
  // instead of auto-picking the first open one in the section — she was
  // targeted at a specific empty cage, not "the section" in general.
  _dropOff(stay, section, opts = {}) {
    // Issue #18/#20: don't accept the drop if every one of this section's 6
    // cages is already taken by another stay — that used to fall through to
    // assignCageSlot returning null and _sectionSlot's generic grid fallback,
    // which doesn't know the section's actual cage/tank layout and could
    // place her overlapping another animal or the cage/tank furniture. This
    // can happen even though arrivals stop once a section is full, because
    // the player can still manually carry an already-settled animal back
    // in from the yard (or, rarely, a fresh reception arrival) into a
    // section that filled up in the meantime. Treat it like walking into
    // any other non-accepting spot: nothing happens, she stays in the
    // player's hands, and a light notification explains why.
    const cageSlot = opts.cageSlot != null ? opts.cageSlot : assignCageSlot(this.roster.stays, section.key);
    if (cageSlot == null) {
      const now = this.time.now;
      if (now - (this._fullSectionNotifyAt || 0) > 1500) {
        this._fullSectionNotifyAt = now;
        this.game.events.emit(EVENTS.NOTIFY, `${section.label} is full right now!`);
      }
      return false;
    }
    this._carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    this._carryVisual = null;
    this.carrying = null;
    stay.location = section.key;
    // A late dropoff during the night (rare — only if the player was still
    // mid-carry when night fell): she gets under her cage's blanket the same
    // automatic way as everyone else (issue #46) — see the _tuckIn below.
    // Issue #18: assign her into the open individual cage found above
    // (companions/babies share it, same as today's "near mom" render).
    stay.cageSlot = cageSlot;
    // Issue #27: remember which section her cage is actually in, so a later
    // yard trip (belongsToSection/_startWalkHome/_checkDropoff's yard
    // branch) still finds the right "home" section even if it doesn't match
    // her species — in normal mode this always equals her species anyway.
    stay.cageSection = section.key;
    this._refreshCageArt();
    const pos = this._sectionSlot(section, stay);
    // Issue #21: a fresh arrival (not a yard-return) resolves out of her
    // carry container right here — a quick fade+shrink "let out of the box/
    // carrier" beat — before _renderStay draws her bare-in-cage look (which
    // it does automatically now that her location is no longer 'reception').
    if (opts.fromReception && stay.carryKind !== CARRY_KIND.NONE) {
      this._playUnboxing(pos.x, pos.y, stay.carryKind);
    }
    this._renderStay(stay, pos.x, pos.y);
    // Issue #46: carried home after nightfall — straight under the blanket.
    if (this.night.active) this._tuckIn(stay);
    return true;
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
  // one single undivided play area now, so there's no zone to pick — she
  // just takes the next free spot in the yard's placement grid, and multiple
  // occupants spread out rather than stacking.
  _dropOffToYard(stay) {
    this._carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    this._carryVisual = null;
    this.carrying = null;
    stay.location = LOCATION.YARD;
    const pos = this._openYardSpot(stay);
    this._renderStay(stay, pos.x, pos.y);
  }

  // Placement spot for a stay settling into `section` — her assigned
  // individual cage (issue #18), including turtles/snakes as of issue #20
  // (their "cage" is a small island/perch) and the dragon (issue #32 #5, her
  // own little castle). Falls back to a plain grid spot near reception if
  // every cage is somehow taken — every call site above already checks
  // assignCageSlot/_findOpenCageNear before assigning a stay to a section,
  // so this should never actually trigger; it's just a safety net against a
  // crash instead of a misplacement.
  _sectionSlot(section, stay) {
    const cage = CAGES[section.key]?.[stay?.cageSlot];
    if (cage) return cageAnimalSpot(cage);
    const already = this.roster.stays.filter((s) => s !== stay && s.location === section.key).length;
    return this._gridSlot(RECEPTION.rug, already, 20, 30, 40);
  }

  // The closest currently-EMPTY cage slot, anywhere in the whole kennel (not
  // just the carried animal's own species), within pickup range of (px, py)
  // — or null if nothing open is close enough. Used by _checkDropoff so
  // walking up to any specific open cage targets THAT exact cage — any pet
  // can go in any open cage, no species clustering.
  //
  // Owner note 2026-07-29 ("interact... should accept the placement anywhere
  // within the cage, not just towards the bottom"): the acceptance test
  // covers the WHOLE cage rect (plus a small outward buffer), not just
  // proximity to cageAnimalSpot's bottom-anchored point — that point still
  // decides where she visually stands once placed (_sectionSlot), it just
  // shouldn't gate whether the placement itself is accepted.
  _findOpenCageNear(px, py) {
    let best = null, bestD = PICKUP_RADIUS;
    const cages = CAGES;
    for (const key of Object.keys(cages)) {
      cages[key].forEach((cage, slot) => {
        if (!isCageSlotOpen(this.roster.stays, key, slot)) return;
        const nx = Phaser.Math.Clamp(px, cage.x, cage.x + cage.w);
        const ny = Phaser.Math.Clamp(py, cage.y, cage.y + cage.h);
        const d = Phaser.Math.Distance.Between(px, py, nx, ny);
        if (d < bestD) {
          bestD = d;
          best = { section: SECTIONS.find((s) => s.key === key), slot };
        }
      });
    }
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
  _fillBowl(sectionKey, cageSlot, kind) {
    // belongsToSection, not location: the bowl is part of HER cage, so it's
    // still fillable while she's off playing in the yard (issue #45 makes
    // that common) — she'll eat from it when she gets back.
    const stay = this.roster.stays.find((s) => belongsToSection(s, sectionKey) && s.cageSlot === cageSlot);
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
    if (stay.location === sectionKey && stay.needs[kind]) {
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

  _refreshYardBowls() {
    this._yardBowlImgs.food.setTexture(this.yardBowls.food ? BOWL_KEY : BOWL_EMPTY_KEY);
    this._yardBowlImgs.water.setTexture(this.yardBowls.water ? WATER_BOWL_KEY : WATER_BOWL_EMPTY_KEY);
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
  // outside. Only the cat litter box still needs the scooper.

  _pickUpScooper() {
    this.hasScooper = true;
    this._scooperRestSprite?.destroy();
    this._scooperRestSprite = null;
    this.game.events.emit(EVENTS.NOTIFY, 'Got the scooper!');
  }

  // Sets the scooper back down at the player's current spot (issue #22 #5) —
  // triggered as a fallback when the player interacts with nothing else
  // nearby while holding it (see _checkCarry).
  _dropScooper() {
    this.hasScooper = false;
    this._scooperVisual?.destroy();
    this._scooperVisual = null;
    this.scooperRestPos = { x: this.player.x, y: this.player.y };
    this._rebuildScooperRestSprite();
    this.game.events.emit(EVENTS.NOTIFY, 'Set the scooper down!');
  }

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

  // ── Births: pregnancy/eggs → babies (issue #9) ───────────────────────────
  // Refinement: the timer expiring no longer completes the birth on its own —
  // it just flags the mom as ready and waiting on the player (a small heart
  // icon, same convention as the food/bathroom/tuck-in bubbles), and the
  // player has to walk over and interact to actually have the babies/hatch
  // the eggs (see _checkAct). Reception/carrying stays don't accrue
  // this — matches _updateNeeds' "only settled stays" rule.

  // Every stay considered "settled at the kennel" for need/birth ticking —
  // in a section OR out playing in the yard (issue #20); only reception and
  // mid-carry stays are excluded.
  _settledStays() {
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    return this.roster.stays.filter((s) => sectionKeys.has(s.location) || s.location === LOCATION.YARD);
  }

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

    if (stay.animal.hasEggs) {
      const count = stay.animal.eggCount;
      stay.animal.hasEggs = false;
      stay.animal.eggCount = 0;
      // "Then you take out the shells!" (DESIGN.md) — the egg extras are
      // simply gone once _renderStay redraws below; no separate pickup step.
      const babies = Array.from({ length: count }, () =>
        createAnimal(stay.animal.species, { stage: 'baby', name: BABY_PLACEHOLDER }));
      stay.companions = [...stay.companions, ...babies];
      stay.needsAnnouncement = true;
      stay.photoTaken = false; // issue #37: needs a photo taken before she can be announced
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name}'s eggs are hatching!`);
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

    // Snapshot mom + every baby's current sprite frame into a small
    // polaroid-style render texture — a real picture of exactly who's here.
    const sprites = [rec.sprite, ...(rec.babySprites || [])];
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

  // ── Night: tuck-in, staying awake, wake-ups (issue #11) ──────────────────
  // At NIGHT_START every present animal needs tucking in (DESIGN.md's small
  // fabric sheet); once the last one is tucked, the player "goes to sleep"
  // too — a fade to black, then either a wake-up (having babies / needs the
  // bathroom / bad dream / cold) that fades back in for the player to
  // handle, or a fade back to a fast-forwarded morning if nothing wakes her.

  _presentStays() {
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    return this.roster.stays.filter((s) => sectionKeys.has(s.location));
  }

  _onPhaseChange({ isNight, syncOnly }) {
    // Issue #34: see _onHourChange's syncOnly comment — a resumed-at-night
    // save shouldn't forcibly replay the whole tuck-in sequence on load.
    if (syncOnly) return;
    if (isNight) this._startNight();
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
      if (this.carrying === stay || this._isWalking(stay)) continue;
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
    const cage = CAGES[stay.cageSection]?.[stay.cageSlot];
    if (!cage) { // no cage of her own yet (fresh arrival out in the yard)
      rec.blanket?.destroy();
      rec.blanket = null;
      return;
    }
    if (!rec.blanket) rec.blanket = this.add.image(0, 0, BLANKET_KEY).setOrigin(0.5, 0.5);
    const img = rec.blanket;
    if (stay.tuckedIn && stay.location === stay.cageSection) {
      // Draped over her, wherever in her cage she actually settled — she
      // stops wandering the instant she's under it (_updateWander's tuckedIn
      // check), so this position stays right all night. One blanket covers
      // her companions too (eggs/babies "wrapped" with her, per DESIGN.md),
      // since they share her cage spot.
      img.setPosition(rec.sprite.x, rec.sprite.y - rec.sprite.displayHeight * 0.32);
      img.setDisplaySize(rec.sprite.displayWidth * 1.3, rec.sprite.displayHeight * 0.85);
      img.setDepth(rec.sprite.depth + 0.3);
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
  _checkAllSettled() {
    if (!this.night.active || this.night.allSettled) return;
    const stillOut = this.roster.stays.some((s) => !s.noCageAvailable && (
      s.location === LOCATION.YARD || s.location === LOCATION.CARRYING || this._isWalking(s)
    ));
    if (stillOut) return;
    if (!this._presentStays().every((s) => s.tuckedIn)) return;
    this.night.allSettled = true;
    this.game.events.emit(EVENTS.NOTIFY, "Everyone's asleep! Head to bed to end the night.");
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
          this.night.active = false;
          this.night.sleeping = false;
          this.night.allSettled = false;
          this.night.currentWake = null;
          // Issue #46: morning — everyone climbs back out from under her
          // blanket on her own, and it goes back to folded in the cage.
          for (const stay of this.roster.stays) this._untuck(stay);
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
      const sectionKeys = new Set(SECTIONS.map((s) => s.key));
      // Issue #27: a cat's litter box need is about her SPECIES, not which
      // cage she's actually in — in generalized mode she may be settled
      // somewhere other than the 'cat' section. Yard-playing cats are
      // skipped: she has no cage position to place a mess at while she's out.
      const cats = this._settledStays().filter((s) => s.animal.species === 'cat' && sectionKeys.has(s.location));
      if (!cats.length) return;
      const cat = cats[Math.floor(Math.random() * cats.length)];
      const alreadyDirty = this.messes.some((m) => m.kind === 'cat' && m.stay === cat);
      if (alreadyDirty) {
        this.game.events.emit(EVENTS.NOTIFY, `${cat.animal.name}'s litter box needs cleaning!`);
        return;
      }
      const spot = LITTER_SPOTS[cat.location]?.[cat.cageSlot];
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

  // Shared nearest-target picker — each button builds its own, so the classes
  // are resolved independently and can never out-compete each other.
  _resolver() {
    const px = this.player.x, py = this.player.y;
    let best = null, bestD = PICKUP_RADIUS;
    return {
      consider(x, y, action) {
        const d = Phaser.Math.Distance.Between(px, py, x, y);
        if (d < bestD) { bestD = d; best = action; }
      },
      run() {
        if (!best) return false;
        best();
        return true;
      },
    };
  }

  // CARRY — the pick-up/put-down button. Animals waiting at reception, animals
  // out in the play yard (picking one up is still how she gets a cage of her
  // own — nameplate + bowls), and the scooper. A pet out in the yard is
  // pickup-able at night too, so she can always be brought straight back in.
  // If nothing's in range and the scooper's in hand, this sets it back down
  // (issue #22 #5).
  _checkCarry(pressed) {
    if (!pressed) return;
    const r = this._resolver();

    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.RECEPTION) continue;
      const rec = this._staySprites.get(stay);
      if (rec) r.consider(rec.pos.x, rec.pos.y, () => this._pickUp(stay));
    }

    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.YARD) continue;
      // She's already on her way somewhere — leave her to it (issue #45: a
      // walking animal is a transient state, not something to grab at).
      if (this._isWalking(stay)) continue;
      // Owner note 2026-07-29: "the interact location for an animal that
      // is outside playing doesn't move with their visual... it should
      // move with them" — she wanders within her bounds (_updateWander), so
      // the target tracks her live sprite position, not her original spot.
      const rec = this._staySprites.get(stay);
      if (rec) r.consider(rec.sprite.x, rec.sprite.y, () => this._pickUp(stay));
    }

    if (!this.hasScooper) r.consider(this.scooperRestPos.x, this.scooperRestPos.y, () => this._pickUpScooper());

    if (!r.run() && this.hasScooper) this._dropScooper();
  }

  // CAGE — issue #45's one action at an occupied cage: open it and the
  // occupant takes herself out, to her waiting owner if one's here for her,
  // otherwise out to the play yard. It replaced both carrying a pet out to
  // play and carrying a checkout-ready pet over to her owner, and it's also
  // how a dog who needs the bathroom gets outside (issue #38 — she does her
  // business out there on her own; no separate leash minigame).
  _checkCage(pressed) {
    if (!pressed) return;
    const r = this._resolver();
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    for (const stay of this.roster.stays) {
      if (!sectionKeys.has(stay.location)) continue;
      if (this._isWalking(stay)) continue;
      // Cage-opening is skipped at night — everyone should be home asleep —
      // EXCEPT for a dog who currently needs the bathroom, the same exemption
      // the old leash flow had. (Real game logic, not a tie-break workaround:
      // it belongs to the cage action specifically, which is why it now lives
      // in the cage button's own loop.)
      const bathroomDog = stay.animal.species === 'dog' && stay.needs.bathroom;
      if (this.night.active && !bathroomDog) continue;
      const rec = this._staySprites.get(stay);
      if (rec) r.consider(rec.sprite.x, rec.sprite.y, () => this._openCage(stay));
    }
    r.run();
  }

  // ACT — everything that isn't carrying or opening a cage (issues #5, #6,
  // #7, #8, #13, #20, #22, #37): feeding, cleaning, births, photos, the
  // reception computer, treats, the raccoon, and turning in for the night.
  _checkAct(pressed) {
    if (!pressed) return;
    const r = this._resolver();
    const consider = r.consider;

    // Owner note 2026-07-29 (bowl decoupling): filling food vs. water now
    // resolves to whichever specific bowl sprite is closer — same
    // nearest-target `consider()` pattern as everything else here — rather
    // than the cage's own rect. Filling works regardless of hunger/thirst
    // (see _fillBowl); actually eating/drinking happens on its own
    // background tick (_autoResolveBowlNeeds), not through this interaction.
    for (const key of Object.keys(BOWL_SPOTS)) {
      BOWL_SPOTS[key].forEach((spot, slot) => {
        consider(spot.x, spot.y, () => this._fillBowl(key, slot, 'food'));
      });
      WATER_BOWL_SPOTS[key].forEach((spot, slot) => {
        consider(spot.x, spot.y, () => this._fillBowl(key, slot, 'water'));
      });
    }

    // Issue #32 follow-up, one pair as of issue #47: the outside yard's
    // shared food/water bowls — filling works the same way as a cage bowl
    // (any time, regardless of who's hungry); see _fillYardBowl.
    consider(YARD_BOWL_SPOTS.food.x, YARD_BOWL_SPOTS.food.y, () => this._fillYardBowl('food'));
    consider(YARD_BOWL_SPOTS.water.x, YARD_BOWL_SPOTS.water.y, () => this._fillYardBowl('water'));

    // (Picking the scooper up / setting it back down is the CARRY button's
    // job now — see _checkCarry. Cleaning a mess is still an act.)
    for (const mess of this.messes) {
      consider(mess.x, mess.y, () => this._cleanMess(mess));
    }

    // Issue #37: the computer's only for SENDING now — she needs her photo
    // taken first (see the photo consider() loop below).
    if (!this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement && s.photoTaken)) {
      consider(COMPUTER_SPOT.x, COMPUTER_SPOT.y, () => this._useComputer());
    }

    // Issue #9 refinement: a mom flagged ready-and-waiting needs the player
    // to walk over and act to actually have her babies/hatch her eggs. She's
    // usually standing inside her own cage, but that no longer shadows this —
    // her cage is on the cage button, the birth is on this one (issue #51).
    for (const stay of this.roster.stays) {
      if (!stay.birthReady) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.sprite.x, rec.sprite.y, () => this._triggerBirth(stay));
    }

    // Issue #37 ("can we add something where you actually get to take cute
    // pics of the babies before you send the email?"): a mom with new
    // babies/hatchlings not yet photographed needs the player to walk up and
    // snap her photo before the computer will let her be announced.
    for (const stay of this.roster.stays) {
      if (!stay.needsAnnouncement || stay.photoTaken) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.sprite.x, rec.sprite.y, () => this._takePhoto(stay));
    }

    // Issue #13: bake a treat at the kitchen oven — only while the counter's
    // clear, so there's always at most one tray out for the raccoon to steal.
    if (!this.treatTray) consider(OVEN_SPOT.x, OVEN_SPOT.y, () => this._bakeTreat());
    else consider(TREAT_TRAY_SPOT.x, TREAT_TRAY_SPOT.y, () => this._eatTreat());

    // Issue #13 follow-up: scare the raccoon off if she's around and the
    // player walks up and interacts — same proximity convention as
    // everything else here.
    if (this._raccoon && !this._raccoon.scared) {
      consider(this._raccoon.sprite.x, this._raccoon.sprite.y, () => this._scareRaccoon());
    }

    // (Issue #47 removed the movable yard divider's pick-up interaction, and
    // issue #46 removed the tuck-in one — blankets are automatic now.)

    // Owner note 2026-07-29: the player's own bed — once every pet is home
    // in her cage (issue #45), walk up and interact here to actually start
    // the sleep sequence (see _checkAllSettled/_beginSleep).
    if (this.night.active && this.night.allSettled && !this.night.sleeping) {
      consider(BED_SPOT.x, BED_SPOT.y, () => this._beginSleep());
    }

    r.run();
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

    this._updateMovement(delta);
    this._updateTint();
    this._updateSleepOverlay();
    this._updateNeeds(delta);
    this._updateMesses(delta);
    this._updateBirths(delta);
    this._updateComputerIcon();
    this._updateRaccoon(delta);
    this._updateWalkers(delta);      // issue #45: animals/owners walking themselves around
    this._updateWander(delta);
    this._updateStayVisuals();       // issue #48: bubbles/labels/babies follow their animal
    this._updateNightSettle();       // issue #45/#46: walk home, get under the blanket
    this._updateNameTagVisibility();
    this.player.setDepth(this.player.y);

    // The three action reads are stateful (edge-triggered) — read ALL of them
    // exactly once per frame, unconditionally, before branching, so a press
    // never survives into a later frame just because this frame's branch
    // wasn't interested in it.
    const carryPressed = this.controls.carryJustDown();
    const cagePressed = this.controls.cageJustDown();
    const actPressed = this.controls.actJustDown();
    if (this.carrying) {
      this._followCarry();
      // Hands are full: carry is the only button that does anything, and it's
      // what puts her down (issue #51 — this used to be the shared button).
      this._checkDropoff(carryPressed);
    } else {
      this._checkCarry(carryPressed);
      this._checkCage(cagePressed);
      this._checkAct(actPressed);
    }
    this._followScooper();
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
      const inYard = stay.location === LOCATION.YARD;
      const amp = wanderAmplitude(stay.animal.species, inYard);
      if (!rec.wander) {
        rec.wander = { tx: rec.sprite.x, ty: rec.sprite.y, t: pickWanderInterval(stay.animal.species) };
      }
      rec.wander.t -= delta;
      if (rec.wander.t <= 0) {
        if (inYard) {
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
      rec.sprite.x += (rec.wander.tx - rec.sprite.x) * 0.03;
      rec.sprite.y += (rec.wander.ty - rec.sprite.y) * 0.03;
      rec.sprite.setDepth(rec.sprite.y);

      // Babies: same idea one level down — each drifts around her OWN base
      // offset from mom (a gentle fraction of mom's amplitude), so the litter
      // mills about with her without piling onto her or onto each other. The
      // sprites themselves are positioned in _updateStayVisuals, which is
      // also what keeps them with her while she's walking.
      for (const baby of rec.babies) {
        baby.t -= delta;
        if (baby.t > 0) continue;
        const babyAmp = amp * 0.35;
        baby.tx = baby.bx + (Math.random() * 2 - 1) * babyAmp;
        baby.ty = baby.by + (Math.random() * 2 - 1) * babyAmp * 0.6;
        baby.t = pickWanderInterval(stay.animal.species) * 0.8;
      }
    }
  }

  _followScooper() {
    if (!this.hasScooper) return;
    if (!this._scooperVisual) {
      this._scooperVisual = this.add.image(this.player.x, this.player.y, SCOOPER_KEY).setOrigin(0.5, 1).setDepth(9499);
    }
    this._scooperVisual.x = this.player.x - PLAYER_W * 0.6;
    this._scooperVisual.y = this.player.y - 4;
    this._scooperVisual.setDepth(this.player.y);
  }

  _updateMovement(delta) {
    const move = this.controls.getMove();
    let moving = false;

    if (move.mag > 0.05) {
      // Direct steering always wins and cancels any in-progress tap-to-move walk.
      this.navPath = null;
      this.controls.clearTapTarget();
      this.player.body.setVelocity(move.x * SPEED, move.y * SPEED);
      moving = true;
    } else {
      // A fresh tap/click redirects (or starts) the walk, even mid-path.
      const target = this.controls.consumeTapTarget();
      if (target) {
        this.navPath = findPath(this.player.x, this.player.y, target.x, target.y, {
          minX: 0, minY: 0, maxX: WORLD.w, maxY: WORLD.h,
          collides: this._collides, cell: 20, clearance: 10, planMargin: 6,
        });
      }

      if (this.navPath && this.navPath.length) {
        const wp = this.navPath[0];
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wp.x, wp.y) < 4) {
          this.navPath.shift();
        }
      }
      if (this.navPath && this.navPath.length) {
        const wp = this.navPath[0];
        const ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, wp.x, wp.y);
        this.player.body.setVelocity(Math.cos(ang) * SPEED, Math.sin(ang) * SPEED);
        moving = true;
      } else {
        this.navPath = null;
        this.player.body.setVelocity(0, 0);
      }
    }

    this._updateWobble(delta, moving);
  }

  // Squash/stretch walk-cycle wobble — a cheap stand-in for a full frame animation.
  _updateWobble(delta, moving) {
    if (moving) {
      this._wobbleT = (this._wobbleT || 0) + delta;
      const s = Math.sin(this._wobbleT / 90) * 0.06;
      this.player.setScale(1 + s, 1 - s);
    } else {
      this._wobbleT = 0;
      this.player.setScale(1, 1);
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
