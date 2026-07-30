import Phaser from 'phaser';
import {
  WALL, ROOM, OUTSIDE, WORLD, BACK_DOOR, FRONT_DOOR, RECEPTION, SECTIONS,
  BACK_WING, STAFF_DOOR, WING_DOOR, STORAGE_ROOM, HOUSE_ROOM,
  wallRects, backWingWallRects, outsideFenceRects,
} from '../data/sections.js';
import {
  SCOOPER_SPOT, BOWL_SPOTS, WATER_BOWL_SPOTS, COMPUTER_SPOT,
  OVEN, OVEN_SPOT, TREAT_TRAY_SPOT, STORAGE_PROPS, BED, BED_SPOT,
  CAGES, LITTER_SPOTS, YARD_BOWL_SPOTS,
  cageAnimalSpot, YARD_DIVIDER_DEFAULT_Y, YARD_DIVIDER_X0, YARD_DIVIDER_X1,
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
  MESS_KEY, NEED_KEY, COMPUTER_KEY, BLANKET_KEY, UPGRADE_KEY, CAGE_KEY, EMPTY_CAGE_KEY,
  OVEN_KEY, TREAT_TRAY_KEY, SHELF_KEY, BOX_KEY, BAG_KEY, BED_KEY,
  YARD_DIVIDER_POST_KEY, YARD_DIVIDER_LINE_KEY,
} from '../art/props.js';
import {
  buildRaccoonTextures, RACCOON_KEYS, RACCOON_SCARED_KEY, CRUMB_KEY, HELD_TREAT_KEY, RACCOON_DISPLAY_SCALE,
} from '../art/raccoon.js';
import { RACCOON_CHECK_INTERVAL, RACCOON_APPROACH_MS, RACCOON_SCAMPER_MS, RACCOON_SCARE_DASH_MS, randomTreat } from '../data/raccoon.js';
import { createRoster, LOCATION, CARRY_KIND, assignCageSlot, isCageSlotOpen, anyOpenCageAnywhere } from '../data/roster.js';
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

// Issue #20: cats/dogs no longer have an indoor mess of their own — their
// only potty pathway is the leash walk outside (needs.bathroom). Only the
// cat litter box still spawns periodic messes indoors.
const CAT_LITTER_INTERVAL = () => 25_000 + Math.random() * 25_000;

// Night sequence timings (issue #11) — the screen fades to black once
// everyone's tucked in, fades back for each wake-up so the player can act,
// then fades out again to keep "sleeping" until morning.
const SLEEP_FADE_MS = 900;
const WAKE_FADE_MS = 500;
const RESOLVE_FADE_MS = 700;
const BAD_DREAM_MS = 2600; // flavor-only wake-up: no fix needed, just settles back down

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

    // Issue #34: resume a saved game if one exists (roster/economy/clock/
    // yard-divider state), instead of always starting fresh. loadGame()
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

    // ── Yard divider (issue #20) — one movable HORIZONTAL fence line
    // splitting the outside yard into a top/bottom zone at its current y.
    // Set before _buildProps() below, which places the divider sprite here. ──
    this.yardDividerY = this._save?.yardDividerY ?? YARD_DIVIDER_DEFAULT_Y;
    this.carryingDivider = false;
    this._dividerVisual = null;

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
    this.leashedDog = null;        // the dog stay currently being walked outside (issue #19), or null
    this._walkVisual = null;       // { sprite, tag, base, ... } following the player while walking a dog
    this._lingeringOwners = new Map(); // stay -> owner sprite, reserved from the moment she starts walking in until her pet is picked up (issue #25)

    // ── Night: tuck-in / staying awake / wake-ups (issue #11) ──────────────
    // Issue #34 regression fix: this has to exist BEFORE _refreshCageArt()
    // below — with a restored save, that call already has settled stays to
    // render, and _renderStay reads this.night.active while restoring each
    // one's tuck-in indicator.
    this.night = {
      active: false,       // true from NIGHT phase start until morning resumes
      allTucked: false,    // fires the "Everyone's asleep!" transition once
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

    // (yardDividerY/carryingDivider/_dividerVisual and the scooper-rest state
    // are set earlier, above _buildProps() — see that comment.)
    this.messes = [];              // { kind: 'cat', x, y, sprite } — issue #20: dogs no longer mess indoors
    this._catLitterTimer = CAT_LITTER_INTERVAL();
    // Issue #32 follow-up: shared per-zone yard bowls (top/bottom) — high
    // capacity, unlike a per-cage bowl (see _autoResolveYardBowls).
    this.yardBowls = { top: createBowlState(), bottom: createBowlState() };
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
      yardDividerY: this.yardDividerY,
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
  // (_placeAtReception, _sectionSlot, _dropOffToYard) so a resumed stay ends
  // up in the same kind of spot a freshly-placed one would.
  //
  // `LOCATION.CARRYING` (mid-carry when the page was closed) has no
  // meaningful visual to resume — DESIGN.md's persistence goal is "the
  // kennel looks the same when you come back", not frame-accurate resume of
  // an in-progress pickup — so she's settled back wherever she last had a
  // real home: her cage if she had one (`cageSection`), reception otherwise.
  _restoreStaySprites() {
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    for (const stay of this.roster.stays) {
      if (stay.location === LOCATION.CARRYING) {
        stay.location = sectionKeys.has(stay.cageSection) ? stay.cageSection : LOCATION.RECEPTION;
      }
    }

    const { rug } = RECEPTION;
    let receptionIdx = 0;
    const yardIdx = {};
    for (const stay of this.roster.stays) {
      if (stay.location === LOCATION.RECEPTION) {
        const idx = receptionIdx++;
        const x = rug.x + 30 + (idx % 3) * 55;
        const y = rug.y + 24 + Math.floor(idx / 3) * 42;
        this._renderStay(stay, x, y);
      } else if (stay.location === LOCATION.YARD) {
        const zoneKey = stay.yardZone || 'top';
        const idx = yardIdx[zoneKey] || 0;
        yardIdx[zoneKey] = idx + 1;
        const rect = this._yardZoneRect(zoneKey);
        const pos = this._gridSlot(rect, idx, 20, 44, 52);
        this._renderStay(stay, pos.x, pos.y, { yardBounds: rect });
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
  // per-cage bowls, the reception computer, the back wing (oven/storage
  // dressing), and the yard divider. All positions come from data/props.js
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

    // Issue #32 follow-up: the outside yard's shared food+water bowl pair per
    // zone (top/bottom) — always present (not occupancy-gated like a cage
    // bowl), starting empty. _refreshYardBowls (called once the roster
    // exists) sets their real full/empty textures.
    this._yardBowlImgs = {
      top: {
        food: this.add.image(YARD_BOWL_SPOTS.top.food.x, YARD_BOWL_SPOTS.top.food.y, BOWL_EMPTY_KEY)
          .setOrigin(0.5, 1).setDepth(YARD_BOWL_SPOTS.top.food.y),
        water: this.add.image(YARD_BOWL_SPOTS.top.water.x, YARD_BOWL_SPOTS.top.water.y, WATER_BOWL_EMPTY_KEY)
          .setOrigin(0.5, 1).setDepth(YARD_BOWL_SPOTS.top.water.y),
      },
      bottom: {
        food: this.add.image(YARD_BOWL_SPOTS.bottom.food.x, YARD_BOWL_SPOTS.bottom.food.y, BOWL_EMPTY_KEY)
          .setOrigin(0.5, 1).setDepth(YARD_BOWL_SPOTS.bottom.food.y),
        water: this.add.image(YARD_BOWL_SPOTS.bottom.water.x, YARD_BOWL_SPOTS.bottom.water.y, WATER_BOWL_EMPTY_KEY)
          .setOrigin(0.5, 1).setDepth(YARD_BOWL_SPOTS.bottom.water.y),
      },
    };
    for (const zoneKey of ['top', 'bottom']) {
      this._devRegistry.push({ name: `YARD_BOWL_SPOTS.${zoneKey}.food`, obj: this._yardBowlImgs[zoneKey].food });
      this._devRegistry.push({ name: `YARD_BOWL_SPOTS.${zoneKey}.water`, obj: this._yardBowlImgs[zoneKey].water });
    }

    // Reception computer (issue #10) — baby-announcement messages to owners.
    const computer = this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y, COMPUTER_KEY).setOrigin(0.5, 1).setDepth(COMPUTER_SPOT.y);
    this._devRegistry.push({ name: 'COMPUTER_SPOT', obj: computer });

    // Individual cages (issue #18, single grid as of issue #32) — 6 per
    // species, including turtles/snakes (issue #20 — styled as islands/
    // perches instead of wire pens) and the secret dragon (issue #32 #5 — a
    // little stone castle). Keep a handle on each cage's image
    // (this._cageImgs) so _refreshCageArt can re-texture it per-occupant
    // without touching its fixed position/size.
    this._cageImgs = {};
    for (const key of Object.keys(CAGES)) {
      this._cageImgs[key] = [];
      CAGES[key].forEach((cage, i) => {
        const img = this.add.image(cage.x, cage.y, CAGE_KEY[key]).setOrigin(0, 0).setDepth(cage.y - 2);
        this._devRegistry.push({ name: `CAGES.${key}.${i}`, obj: img });
        this._cageImgs[key].push(img);
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

    // Yard divider (issue #20) — a movable HORIZONTAL fence line + post
    // splitting the outside yard into a top/bottom zone. Registered so its
    // DEFAULT position (YARD_DIVIDER_DEFAULT_Y) can be tuned like anything
    // else — the player can still pick it up and move it during normal play
    // regardless (that's a keyboard-interact mechanic, not a pointer drag,
    // so the two never conflict).
    this.dividerLineImg = this.add.image(YARD_DIVIDER_X0, this.yardDividerY, YARD_DIVIDER_LINE_KEY)
      .setOrigin(0, 0.5).setDepth(this.yardDividerY);
    this.dividerPostImg = this.add.image((YARD_DIVIDER_X0 + YARD_DIVIDER_X1) / 2, this.yardDividerY, YARD_DIVIDER_POST_KEY)
      .setOrigin(0.5, 0.5).setDepth(this.yardDividerY + 0.1);
    this._devRegistry.push({ name: 'YARD_DIVIDER_DEFAULT_Y', obj: this.dividerPostImg });
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
  _refreshCageArt() {
    if (!this._cageImgs) return;
    for (const key of Object.keys(this._cageImgs)) {
      this._cageImgs[key].forEach((img, slot) => {
        const occupant = this.roster.stays.find((s) => s.location === key && s.cageSlot === slot);
        const texKey = occupant ? (CAGE_KEY[occupant.animal.species] ?? CAGE_KEY[key]) : EMPTY_CAGE_KEY;
        const changed = img.texture.key !== texKey;
        if (changed) img.setTexture(texKey);
        if (changed) this._snapCagePop(img);
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
        const occupant = this.roster.stays.find((s) => s.location === key && s.cageSlot === slot);
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
        const occupant = this.roster.stays.find((s) => s.location === key && s.cageSlot === slot);
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
        const occupant = this.roster.stays.find((s) => s.location === key && s.cageSlot === slot);
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
    }
    this._processCheckouts(day);
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

  // Issue #21: a new arrival isn't just placed at reception out of thin air —
  // a simple owner NPC walks her in through the front door, carrying/leading
  // her (leash/carrier/box/basket, or just holding her for a CARRY_KIND.NONE
  // species), sets her down at reception, then walks back out and despawns.
  // The NOTIFY (and the real reception render) fire once she's actually
  // there, same timing the old instant-placement had — just after a short
  // walk instead of immediately.
  _runOwnerDropOff(stay) {
    const doorX = (FRONT_DOOR.x0 + FRONT_DOOR.x1) / 2;
    const doorY = ROOM.y + ROOM.h - WALL - 2;
    const { rug } = RECEPTION;
    const deskX = rug.x + rug.w / 2;
    const deskY = rug.y + rug.h * 0.3;

    const owner = this.add.sprite(doorX, doorY, 'owner-npc').setOrigin(0.5, 1).setDepth(doorY);
    // Issue #25: reserve her waiting-owner slot the instant she starts
    // walking in — see the cap check in _spawnArrival — not just once she's
    // actually placed at reception.
    this._lingeringOwners.set(stay, owner);

    // She visibly carries the container/animal in with her — the same prop
    // that will sit at reception once she sets it down, so the hand-off
    // reads as continuous rather than the pet just popping into existence.
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

    this.tweens.add({
      targets: owner, x: deskX, y: deskY, duration: 1500, ease: 'Sine.easeInOut',
      onUpdate: () => { owner.setDepth(owner.y); followOwner(); },
      onComplete: () => {
        carryProp.destroy();
        this._placeAtReception(stay);
        this._syncTieBreakers(); // a new guest may now match someone already here
        this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} arrived!`);

        // Issue #25: she no longer walks straight back out — she lingers
        // beside her pet (positioned in _placeAtReception) until the player
        // picks the pet up; see _pickUp / _walkOwnerOut for the walk-out.
      },
    });
  }

  _placeAtReception(stay) {
    // Count only ALREADY-RENDERED reception stays (i.e. she has a sprite in
    // _staySprites), not every stay whose `location` merely reads RECEPTION —
    // roster.js sets that the instant a stay is created, well before her
    // owner's ~1.5s walk-in animation finishes and _placeAtReception actually
    // runs for her. Without this, two arrivals spawned back-to-back (the
    // "occasionally two" roll in _onHourChange) each counted the OTHER
    // still-mid-walk stay as "already waiting" and computed the identical
    // grid slot, landing both pets on top of each other.
    const waiting = this.roster.stays.filter((s) => s !== stay && s.location === LOCATION.RECEPTION && this._staySprites.has(s)).length;
    const { rug } = RECEPTION;
    const x = rug.x + 30 + (waiting % 3) * 55;
    const y = rug.y + 24 + Math.floor(waiting / 3) * 42;
    this._renderStay(stay, x, y);
    this._settleLingeringOwner(stay, x, y);
  }

  // Issue #25: once her pet is placed in its reception grid slot, move her
  // lingering owner NPC to stand just behind/beside it (smaller y = further
  // back, since depth here tracks y) — offset from the same grid slot so
  // multiple simultaneously-waiting owner+pet pairs don't overlap each other.
  _settleLingeringOwner(stay, petX, petY) {
    const owner = this._lingeringOwners.get(stay);
    if (!owner) return;
    const x = petX + 18;
    const y = petY - 30;
    this.tweens.add({
      targets: owner, x, y, duration: 300, ease: 'Sine.easeOut',
      onUpdate: () => owner.setDepth(owner.y),
    });
  }

  // Issue #25: fires when the player finally picks up a stay that had been
  // waiting at reception — her owner, who's been lingering beside her, walks
  // back out through the front door and despawns (same tween/easing/depth
  // the old immediate walk-out used).
  _walkOwnerOut(stay) {
    const owner = this._lingeringOwners.get(stay);
    if (!owner) return;
    this._lingeringOwners.delete(stay);
    const doorX = (FRONT_DOOR.x0 + FRONT_DOOR.x1) / 2;
    const doorY = ROOM.y + ROOM.h - WALL - 2;
    this.tweens.add({
      targets: owner, x: doorX, y: doorY, duration: 1500, ease: 'Sine.easeInOut',
      onUpdate: () => owner.setDepth(owner.y),
      onComplete: () => owner.destroy(),
    });
  }

  _processCheckouts(day) {
    for (const stay of this.roster.checkoutDue(day)) {
      this._destroyStaySprites(stay);
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} went home!`);
      this._payOutForCheckout(stay);
    }
    this._syncTieBreakers(); // whoever's left may no longer need a collar
    this._refreshCageArt(); // a checked-out stay's cage may now read as empty (issue #27)
  }

  // Issue #12 ("Doing a Great Job"): the owner pays for the stay a moment
  // after she goes home, and — if roster.checkoutDue flagged her as a
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
    // Issue #22 #3: scale family spacing to the actual cage/island/yard-zone
    // size available, so a family "reads as together but with breathing
    // room" without spilling out of a small individual cage. `spread` is a
    // multiplier around a ~90px baseline cage width; opts.yardBounds covers
    // the yard-play case (no cage lookup, but still bounded).
    const cage = CAGES[stay.location]?.[stay.cageSlot];

    // Nameplate anchor: a caged/tanked/nested stay (per issue #20's
    // unification, turtle islands/snake perches/bird nests all count) gets a
    // FIXED plate mounted top-center of her specific cage rect, independent
    // of wherever she currently wanders inside it — reads as a nameplate on
    // the cage door, not a floating label. Anyone without a cage (waiting at
    // reception, being carried, out playing in the yard) keeps the original
    // behavior: the tag floats just above her current position.
    const cageNameAnchor = cage ? { x: cage.x + cage.w / 2, y: cage.y + 18 } : null;
    const tag = cageNameAnchor
      ? this._addNameTag(cageNameAnchor.x, cageNameAnchor.y, animal.name)
      : this._addNameTag(x, y - sprite.displayHeight - 6, animal.name);
    // A yard-placed stay can be redrawn (tie-breaker sync, a birth landing,
    // the computer flow) without going through _dropOffToYard again — derive
    // her zone rect from stay.yardZone whenever opts.yardBounds isn't passed,
    // so she doesn't silently lose her wander/spread bounds on a redraw.
    const yardBounds = stay.location === LOCATION.YARD ? (opts.yardBounds || this._yardZoneRect(stay.yardZone || 'top')) : null;
    const bounds = cage || yardBounds || null;
    const spread = Math.min(1.7, Math.max(0.9, (bounds?.w ?? 90) / 90));

    // Turtle/snake/bird eggs/babies sit tucked close to mom on her own
    // individual island/perch/nest (small space, plenty of room to share) —
    // tighter spacing than the wider spread used for cat/dog companions.
    const sharesHome = animal.species === 'turtle' || animal.species === 'snake' || animal.species === 'bird' || animal.species === 'dragon';
    const extras = [...containerExtras];
    const babyLabels = [];
    let cx = x + sprite.displayWidth * (sharesHome ? 0.4 : 0.55);
    if (animal.hasEggs) {
      for (let i = 0; i < animal.eggCount; i++) {
        const jitterY = (Math.random() - 0.5) * (sharesHome ? 10 : 14) * spread;
        extras.push(this.add.image(cx, y - 1 + jitterY, EGG_KEY).setOrigin(0.5, 1).setDepth(y - 1));
        cx += (sharesHome ? 10 : 16) * spread;
      }
    }

    // Companions (a mom's litter). Anyone whose coat+pattern is shared with
    // another animal currently in the kennel gets a coloured collar — and an
    // ID tattoo once the collars run out — drawn straight into their art by
    // the tie-breaker resolution above (data/distinguish.js).
    for (const baby of stay.companions) {
      const jitterY = (sharesHome ? (Math.random() - 0.5) * 10 : (Math.random() - 0.5) * 8) * spread;
      extras.push(this._addAnimalSprite(cx, y + jitterY, baby, 'baby', tb));

      // Tiny label under each baby — "???" until the owner names it via the
      // reception computer (issue #10), then its real name. Proximity-gated
      // like every other name tag (issue #22 #2).
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

      cx += (sharesHome ? 13 : 20) * spread;
    }

    // Issue #12: a small gold sparkle per upgrade this specific animal has
    // earned across her repeat visits, stacked to the left of her sprite so
    // it doesn't collide with the name tag/need icons above or the
    // egg/baby companions to the right — a returning regular visibly has a
    // little more "stuff" each time she's back (DESIGN.md).
    (animal.upgrades || []).forEach((_kind, i) => {
      const sx = x - sprite.displayWidth * 0.55 - 4;
      const sy = y - sprite.displayHeight * 0.35 - i * 11;
      extras.push(this.add.image(sx, sy, UPGRADE_KEY).setOrigin(0.5, 0.5).setDepth(y + 0.1));
    });

    // Issue #22 #4: a small periodic wander target within the cage/island
    // (or yard zone, while out playing) — reception/carrying stays get no
    // bounds, so they simply don't wander.
    const wanderBounds = bounds ? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } : null;

    const rec = {
      pos: { x, y }, sprite, tag, extras, babyLabels, needIcons: {}, blanket: null,
      wanderBounds, wander: null, cageAnchored: !!cageNameAnchor,
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
    // Night tuck-in (issue #11) survives a redraw the same way: restore the
    // blanket if she's already tucked in, otherwise the "needs tucking" icon
    // if it's night and she isn't.
    if (stay.tuckedIn) this._setBlanket(stay, true);
    else if (this.night.active) this._setNeedIcon(stay, 'tuck', true);
    // Issue #9 refinement: a mom flagged "ready, needs your help" keeps her
    // heart icon across a redraw too.
    if (stay.birthReady) this._setNeedIcon(stay, 'babies', true);
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
  _updateNameTagVisibility() {
    const px = this.player.x, py = this.player.y;
    for (const rec of this._staySprites.values()) {
      const within = rec.cageAnchored
        || Phaser.Math.Distance.Between(px, py, rec.pos.x, rec.pos.y) <= NAME_TAG_RADIUS;
      rec.tag.container.setVisible(within);
      const babiesWithin = Phaser.Math.Distance.Between(px, py, rec.pos.x, rec.pos.y) <= NAME_TAG_RADIUS;
      for (const label of rec.babyLabels) label.setVisible(babiesWithin);
    }
    if (this._walkVisual) {
      const wv = this._walkVisual;
      const within = Phaser.Math.Distance.Between(px, py, wv.sprite.x, wv.sprite.y) <= NAME_TAG_RADIUS;
      wv.tag.container.setVisible(within);
    }
  }

  // Small floating icon above a stay's name tag showing it needs food/water/
  // a bathroom trip — added/removed as the need flips, not recreated per frame.
  _setNeedIcon(stay, key, show) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    if (show) {
      if (rec.needIcons[key]) return;
      const already = Object.keys(rec.needIcons).length;
      const x = rec.pos.x - 10 + already * 16;
      const y = rec.tag.container.y - 2;
      rec.needIcons[key] = this.add.image(x, y, NEED_KEY[key]).setOrigin(0.5, 1).setDepth(9002);
    } else if (rec.needIcons[key]) {
      rec.needIcons[key].destroy();
      delete rec.needIcons[key];
    }
  }

  // ── Carrying (issue #5, extended by issue #20) ───────────────────────────
  // Press interact near a waiting reception arrival to pick it up (the carry
  // prop — leash/cage/box/basket, or the bare animal for the small pets —
  // then follows the player), OR near any settled/yard animal to pick her up
  // for play (always carried bare — this is a casual take-out, not the
  // formal arrival). Where she can be dropped off depends on where she was
  // picked up from (_carryOrigin): a reception pickup drops into her section
  // (cage assignment, as before); a cage pickup can only be dropped in the
  // yard; a yard pickup can only be dropped back into her section.

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
  _checkDropoff(interactPressed) {
    const stay = this.carrying;
    if (this._carryOrigin === LOCATION.YARD) {
      // Picked up from the yard — she can go right back into the yard
      // (change your mind / move her to a different spot), OR come back
      // inside to any open cage.
      if (this.player.x >= OUTSIDE.x + 8) {
        if (!interactPressed) return;
        this._dropOffToYard(stay);
        this._carryOrigin = null;
        return;
      }
      const found = this._findOpenCageNear(this.player.x, this.player.y);
      if (!found || !interactPressed) return;
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
      if (!interactPressed) return;
      if (this._dropOff(stay, found.section, { fromReception: true, cageSlot: found.slot })) this._carryOrigin = null;
    } else {
      // Picked up from her own cage — she can go out to the yard to play, OR
      // right back into any open cage (change your mind / just put her back).
      if (this.player.x >= OUTSIDE.x + 8) {
        // Owner note 2026-07-29: being in the yard should only highlight/
        // enable setting her down there — an explicit interact press is
        // needed to actually place her, same as every other drop-off target,
        // rather than auto-placing the instant she crosses into the yard.
        if (!interactPressed) return;
        this._dropOffToYard(stay);
        this._carryOrigin = null;
        return;
      }
      const found = this._findOpenCageNear(this.player.x, this.player.y);
      if (!found || !interactPressed) return;
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
    // mid-carry when night fell) still needs tucking in, same as everyone
    // else (issue #11).
    if (this.night.active) stay.tuckedIn = stay.tuckedIn ?? false;
    // Issue #18: assign her into the open individual cage found above
    // (companions/babies share it, same as today's "near mom" render).
    stay.cageSlot = cageSlot;
    // Issue #27: remember which section her cage is actually in, so a later
    // yard trip (belongsToSection/_recallYardToCages/_checkDropoff's yard
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

  // Places a carried stay out in the yard to play (issue #20). Zone is
  // decided by which side of the movable HORIZONTAL divider the player is
  // standing on when they drop her off (top vs. bottom, not left/right);
  // multiple occupants of the same zone are spread in a simple grid so they
  // don't stack.
  _dropOffToYard(stay) {
    this._carryVisual?.parts.forEach(({ obj }) => obj.destroy());
    this._carryVisual = null;
    this.carrying = null;
    stay.location = LOCATION.YARD;
    const zoneKey = this.player.y < this.yardDividerY ? 'top' : 'bottom';
    stay.yardZone = zoneKey;
    const rect = this._yardZoneRect(zoneKey);
    const already = this.roster.stays.filter((s) => s !== stay && s.location === LOCATION.YARD && s.yardZone === zoneKey).length;
    const pos = this._gridSlot(rect, already, 20, 44, 52);
    this._renderStay(stay, pos.x, pos.y, { yardBounds: rect });
  }

  // Top/bottom yard rect split at the divider's current y, with a little
  // margin on either side of the fence line itself.
  _yardZoneRect(zoneKey) {
    const left = YARD_DIVIDER_X0, right = YARD_DIVIDER_X1;
    const top = ROOM.y + 14, bottom = ROOM.y + ROOM.h - 14;
    if (zoneKey === 'top') return { x: left, y: top, w: right - left, h: Math.max(40, this.yardDividerY - 10 - top) };
    return { x: left, y: this.yardDividerY + 10, w: right - left, h: Math.max(40, bottom - (this.yardDividerY + 10)) };
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

  // ── Yard divider (issue #20) ─────────────────────────────────────────────
  // A single movable HORIZONTAL fence the player can carry and set back down
  // anywhere in the yard to re-split it into two zones (top/bottom) at its
  // new y.

  _pickUpDivider() {
    this.carryingDivider = true;
    this.dividerPostImg.setVisible(false);
    this._dividerVisual = this.add.image(this.player.x, this.player.y, YARD_DIVIDER_POST_KEY)
      .setOrigin(0.5, 1).setDepth(9500);
    this.game.events.emit(EVENTS.NOTIFY, 'Picked up the fence!');
  }

  _followDividerCarry() {
    if (!this._dividerVisual) return;
    this._dividerVisual.x = this.player.x;
    this._dividerVisual.y = this.player.y;
    this._dividerVisual.setDepth(this.player.y + 1);
  }

  _dropDivider() {
    this.carryingDivider = false;
    this._dividerVisual?.destroy();
    this._dividerVisual = null;
    // Clamped to ROOM.y+64 / ROOM.y+ROOM.h-64, not +40/-40: _yardZoneRect
    // below enforces a 40px-tall minimum per zone, and with only a 40px
    // clamp margin the divider could sit close enough to the top/bottom
    // wall that the true available space for that zone was LESS than 40px
    // (as little as 16px at the old clamp) — the enforced minimum then made
    // the zone rect extend past the fence line into the other zone, so a
    // dropped-off animal could land overlapping the fence or the far zone's
    // occupants. +64/-64 leaves at least 50px of real space on the tight
    // side (after _yardZoneRect's own 10px fence margin), so the max(40, …)
    // floor never has to override the real geometry.
    this.yardDividerY = Phaser.Math.Clamp(this.player.y, ROOM.y + 64, ROOM.y + ROOM.h - 64);
    this.dividerLineImg.setY(this.yardDividerY).setDepth(this.yardDividerY);
    this.dividerPostImg.setPosition((YARD_DIVIDER_X0 + YARD_DIVIDER_X1) / 2, this.yardDividerY)
      .setDepth(this.yardDividerY + 0.1).setVisible(true);
    this.game.events.emit(EVENTS.NOTIFY, 'Moved the yard fence!');
  }

  // ── Feeding / water (issue #6, extended by #20 and #22 #6) ──────────────

  // Fills the food or water bowl in this cage slot (owner note 2026-07-29:
  // "you should be able to fill food bowls asynchronously from the pets
  // eating the food" — filling works any time, regardless of whether she's
  // currently hungry/thirsty, so the player can stock up ahead of time).
  // Eating/drinking from a stocked bowl happens automatically, on its own
  // tick — see _autoResolveBowlNeeds. `kind` is 'food' or 'water'.
  _fillBowl(sectionKey, cageSlot, kind) {
    const stay = this.roster.stays.find((s) => s.location === sectionKey && s.cageSlot === cageSlot);
    if (!stay || !stay.bowl) return false;
    // Owner note 2026-07-29: "we really only want notifications for animal
    // needs, not for actions we've taken" — filling (whether it worked or the
    // bowl was already full) is a player action, not a need, so no
    // notification either way; the bowl's own full/empty art is the feedback.
    if (stay.bowl[kind]) return true;
    stay.bowl[kind] = true;
    this._refreshBowls();
    return true;
  }

  // ── Outside yard bowls (issue #32 follow-up) ─────────────────────────────
  // High-capacity, shared per zone — unlike a per-cage bowl (single-serve,
  // consumed by whichever one occupant eats), a yard bowl fill resolves
  // EVERY currently hungry/thirsty animal settled in that zone at once (see
  // _autoResolveYardBowls), mirroring the old turtle-shared-tank precedent
  // this replaces — "one fill event satisfies every current occupant", just
  // reapplied to the yard instead of a tank. Filling itself works exactly
  // like _fillBowl: a player action, any time, regardless of who's hungry.
  _fillYardBowl(zoneKey, kind) {
    const bowl = this.yardBowls[zoneKey];
    if (bowl[kind]) return true;
    bowl[kind] = true;
    this._refreshYardBowls();
    return true;
  }

  _refreshYardBowls() {
    for (const zoneKey of ['top', 'bottom']) {
      const bowl = this.yardBowls[zoneKey];
      const imgs = this._yardBowlImgs[zoneKey];
      imgs.food.setTexture(bowl.food ? BOWL_KEY : BOWL_EMPTY_KEY);
      imgs.water.setTexture(bowl.water ? WATER_BOWL_KEY : WATER_BOWL_EMPTY_KEY);
    }
  }

  // Mirrors _autoResolveBowlNeeds, but scoped per yard zone instead of per
  // cage: every settled-in-yard stay's food/water need resolves against
  // whichever zone she's CURRENTLY in (top or bottom of the movable divider
  // — same zone test _dropOffToYard/stay.yardZone already uses), and a fill
  // satisfies every current occupant of that zone in the same tick before
  // emptying again — not a single-serve per-animal drain like a cage bowl.
  _autoResolveYardBowls() {
    let changed = false;
    for (const zoneKey of ['top', 'bottom']) {
      const bowl = this.yardBowls[zoneKey];
      if (!bowl.food && !bowl.water) continue;
      const occupants = this.roster.stays.filter(
        (s) => s.location === LOCATION.YARD && (s.yardZone || 'top') === zoneKey,
      );
      if (bowl.food) {
        const hungry = occupants.filter((s) => s.needs.food);
        if (hungry.length) {
          for (const s of hungry) { clearNeed(s, 'food'); this._setNeedIcon(s, 'food', false); }
          bowl.food = false;
          changed = true;
        }
      }
      if (bowl.water) {
        const thirsty = occupants.filter((s) => s.needs.water);
        if (thirsty.length) {
          for (const s of thirsty) { clearNeed(s, 'water'); this._setNeedIcon(s, 'water', false); }
          bowl.water = false;
          changed = true;
        }
      }
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
  // nearby while holding it (see _checkInteractions).
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
    this.messes = this.messes.filter((m) => m !== mess);
  }

  // ── Leashed dog walks (issue #19) ─────────────────────────────────────────
  // A dog who "needs to go" (data/needs.js's bathroom need) has to be walked
  // outside for real: the player grabs her leash, she follows at the player's
  // side (not carried above the head, like an arrival), out through the back
  // door onto the grass, does her business, and gets walked back in — no
  // accidents, no time pressure; if the player doesn't grab the leash right
  // away, she just keeps waiting (the need icon stays showing).

  // Picks up a dog's leash: hides her stationary sprite and starts a small
  // follow-visual with her own walk animation (from the art rewrite).
  _grabLeash(stay) {
    if (this.leashedDog) return;
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    this._destroyStaySprites(stay);

    const look = effectiveLook(stay.animal, this._tieBreakers());
    const base = ensureAnimalTextures(this, stay.animal.species, stay.animal.stage, look);
    const sprite = this.add.sprite(this.player.x, this.player.y, `${base}_idle_0`)
      .setOrigin(0.5, 1).setScale(ANIMAL_DISPLAY_SCALE).setDepth(this.player.y);
    sprite.play(`${base}_idle`);
    const tag = this._addNameTag(sprite.x, sprite.y - sprite.displayHeight - 6, stay.animal.name);

    this.leashedDog = stay;
    this._walkVisual = { sprite, tag, base, wentOutside: false, pausing: false, businessDone: false };
    this.game.events.emit(EVENTS.NOTIFY, `Taking ${stay.animal.name} for a walk!`);
  }

  // Per-frame follow (same beside-the-player idea as _followCarry, but at
  // ground level and with a real walk/idle animation instead of riding above
  // the player's head) plus the outside/business/back-inside phase machine.
  _updateLeashedDog() {
    if (!this.leashedDog || !this._walkVisual) return;
    const wv = this._walkVisual;

    const targetX = this.player.x - PLAYER_W * 0.7;
    const targetY = this.player.y + 4;
    wv.sprite.x += (targetX - wv.sprite.x) * 0.25;
    wv.sprite.y += (targetY - wv.sprite.y) * 0.25;
    wv.sprite.setDepth(wv.sprite.y);
    wv.tag.container.setPosition(wv.sprite.x, wv.sprite.y - wv.sprite.displayHeight - 6 - wv.tag.height);

    const moving = this.player.body.velocity.length() > 5;
    const animKey = moving ? `${wv.base}_walk` : `${wv.base}_idle`;
    if (wv.sprite.anims.currentAnim?.key !== animKey) wv.sprite.play(animKey);

    // Outside the back door → pause → does her business, once.
    if (!wv.wentOutside && this.player.x > ROOM.w + 30) {
      wv.wentOutside = true;
    }
    if (wv.wentOutside && !wv.businessDone && !wv.pausing) {
      wv.pausing = true;
      this.time.delayedCall(1200, () => {
        wv.businessDone = true;
        this.game.events.emit(EVENTS.NOTIFY, `${this.leashedDog.animal.name} did her business!`);
      });
    }
    // Back inside, past the door, and done → unleash and settle back in.
    if (wv.wentOutside && wv.businessDone && this.player.x < ROOM.w - 30) {
      this._finishWalk();
    }
  }

  // Ends the walk: unleashes the dog and settles her back into her own cage,
  // clearing the bathroom need.
  _finishWalk() {
    const stay = this.leashedDog;
    this._walkVisual.sprite.destroy();
    this._walkVisual.tag.container.destroy();
    this._walkVisual = null;
    this.leashedDog = null;

    clearNeed(stay, 'bathroom');
    // Issue #27: she's leashed straight from wherever her cage actually is —
    // stay.location/cageSection never change during the walk itself (only
    // the visuals swap to the leash follow-visual) — so use that instead of
    // hardcoding 'dog', which would send her to the wrong cage in
    // generalized mode if she'd been kenneled somewhere else.
    const section = SECTIONS.find((s) => s.key === (stay.cageSection || stay.location || 'dog'));
    const pos = this._sectionSlot(section, stay);
    // Bug fix: a dog can now be leash-grabbed straight out of the yard (her
    // bathroom need no longer requires stay.location === 'dog' — see the
    // matching fix in _checkInteractions). Restore her bookkeeping location
    // back to her actual cage, not just her visual position — otherwise
    // she'd render in her cage but still read as LOCATION.YARD everywhere
    // else (_settledStays, section-full counts, cage art refresh, etc.).
    stay.location = section.key;
    this._renderStay(stay, pos.x, pos.y);
    this._refreshCageArt();
    this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} feels much better!`);
    // If this was the night's current "needs the bathroom" wake-up (issue
    // #11), the walk resolves it — resume toward morning.
    if (this.night.currentWake?.stay === stay && this.night.currentWake.reason === WAKE_REASON.BATHROOM) {
      this._resolveWakeUp();
    }
  }

  // ── Births: pregnancy/eggs → babies (issue #9) ───────────────────────────
  // Refinement: the timer expiring no longer completes the birth on its own —
  // it just flags the mom as ready and waiting on the player (a small heart
  // icon, same convention as the food/bathroom/tuck-in bubbles), and the
  // player has to walk over and interact to actually have the babies/hatch
  // the eggs (see _checkInteractions). Reception/carrying stays don't accrue
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
  // _checkInteractions once the player walks up to a birth-ready stay and
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

  // ── The computer: baby announcements (issue #10) ─────────────────────────
  // A simple scripted flow, not a real chat client: interact near the
  // computer while a stay has un-announced babies to send a picture, then a
  // moment later the owner "writes back" with names — auto-picked from
  // data/names.js same as any other arrival — which get applied for real.

  _updateComputerIcon() {
    const anyPending = !this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement);
    if (anyPending && !this._computerNeedIcon) {
      this._computerNeedIcon = this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y - 40, NEED_KEY.mail).setDepth(9002);
    } else if (!anyPending && this._computerNeedIcon) {
      this._computerNeedIcon.destroy();
      this._computerNeedIcon = null;
    }
  }

  _useComputer() {
    if (this._computerBusy) return;
    const stay = this.roster.stays.find((s) => s.needsAnnouncement);
    if (!stay) return;
    this._computerBusy = true;
    this._updateComputerIcon(); // hide the icon immediately — it's being handled

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
  // player interacts near her during this window (_checkInteractions),
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

  // Issue #13 follow-up: scare her off. Called from _checkInteractions when
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
    this.night.allTucked = false;
    this.night.sleeping = false;
    this.night.wakeUpsRemaining = 0;
    this.night.currentWake = null;
    // Issue #20: cats/dogs already live in their own individual cage full
    // time now (no more playpen↔cage toggle) — the only thing that still
    // needs recalling before tuck-in is anyone currently out playing in the
    // yard, regardless of species.
    this._recallYardToCages();
    for (const stay of this._presentStays()) {
      stay.tuckedIn = false;
      this._setNeedIcon(stay, 'tuck', true);
    }
    this._checkAllTuckedIn(); // covers the (rare) empty-kennel case
  }

  // Brings anyone still out in the yard back inside to her own cage before
  // tuck-in starts (issue #20) — "you stay awake until every single animal
  // is asleep" (DESIGN.md) applies to yard playtime too. Unlike a player-
  // initiated drop-off (_dropOff), this recall is forced — she can't stay in
  // the yard just because her cage is "full" — but that shouldn't actually
  // happen: data/roster.js's assignCageSlot/isSectionFull now count a yard
  // stay against her own section's capacity the whole time she's out, so a
  // section can no longer fill up behind her back while she's playing.
  // _sectionSlot's generic-grid fallback (see its own comment) stays in
  // place as a last-resort safety net in case that invariant is ever violated.
  _recallYardToCages() {
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.YARD) continue;
      // Issue #27: her actual "home" section is wherever her cage really is
      // (stay.cageSection), not necessarily her species' section — those can
      // differ once generalized mode has placed her somewhere else (or she's
      // the secret bonus dragon, who never has a species-matching section at
      // all). Falls back to species for safety (shouldn't be needed — she
      // can't be in the yard without a cageSection already set by a prior
      // drop-off).
      const section = SECTIONS.find((s) => s.key === (stay.cageSection || stay.animal.species));
      if (!section) continue;
      stay.cageSlot = assignCageSlot(this.roster.stays, section.key);
      stay.cageSection = section.key;
      stay.location = section.key;
      const pos = this._sectionSlot(section, stay);
      this._renderStay(stay, pos.x, pos.y);
    }
    this._refreshCageArt();
  }

  // Lays (or removes) the small fabric sheet over a stay — one blanket per
  // stay covers her companions too (eggs/babies "wrapped" with her, per
  // DESIGN.md), since they share the same cage spot. Sized to drape fairly
  // fully over her body so it reads as a cozy cover, not a small patch.
  _setBlanket(stay, show) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    if (show) {
      if (rec.blanket) return;
      const img = this.add.image(rec.pos.x, rec.pos.y - rec.sprite.displayHeight * 0.32, BLANKET_KEY)
        .setOrigin(0.5, 0.5).setDepth(rec.sprite.depth + 0.3);
      img.setDisplaySize(rec.sprite.displayWidth * 1.3, rec.sprite.displayHeight * 0.85);
      rec.blanket = img;
    } else if (rec.blanket) {
      rec.blanket.destroy();
      rec.blanket = null;
    }
  }

  _tuckIn(stay) {
    if (stay.tuckedIn) return;
    stay.tuckedIn = true;
    this._setNeedIcon(stay, 'tuck', false);
    this._setBlanket(stay, true);
    if (this.night.currentWake?.stay === stay && this.night.currentWake.reason === WAKE_REASON.COLD) {
      this._resolveWakeUp();
    }
    this._checkAllTuckedIn();
  }

  // Owner note 2026-07-29: "is there a way to initiate sleep for the player
  // character? there should be" — once every present animal is tucked in,
  // sleep no longer starts on its own; the player has to walk to her own bed
  // (BED_SPOT) and interact (see _checkInteractions), same "walk up and it
  // happens" convention as everything else in this file.
  _checkAllTuckedIn() {
    if (!this.night.active || this.night.allTucked) return;
    if (!this._presentStays().every((s) => s.tuckedIn)) return;
    this.night.allTucked = true;
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
          this.night.allTucked = false;
          this.night.currentWake = null;
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
    if (reason === WAKE_REASON.COLD) {
      stay.tuckedIn = false;
      this._setBlanket(stay, false); // fabric slides off
      this._setNeedIcon(stay, 'tuck', true);
      this.game.events.emit(EVENTS.NOTIFY, `${name} is cold!`);
    } else if (reason === WAKE_REASON.BATHROOM) {
      stay.needs.bathroom = true;
      this._setNeedIcon(stay, 'bathroom', true);
      this.game.events.emit(EVENTS.NOTIFY, `${name} needs to go to the bathroom!`);
    } else if (reason === WAKE_REASON.BABIES) {
      // Refinement: flags her ready-and-waiting the same as a daytime timer
      // expiry — the player resolves this wake-up the same way as any
      // other, by walking over and interacting (_checkInteractions calls
      // _triggerBirth, which resolves the current wake). If morning comes
      // first, that's fine — no forced auto-resolution, she just stays
      // flagged into the next day.
      this._markBirthReady(stay);
    } else { // bad dream — flavor only, nothing to fix, settles on its own
      this.game.events.emit(EVENTS.NOTIFY, `${name} had a bad dream!`);
      this.time.delayedCall(BAD_DREAM_MS, () => this._resolveWakeUp());
    }
  }

  // Called once a wake-up's cause has actually been addressed (re-tucked,
  // taken outside, or the birth landed) — fades back to black and continues
  // toward morning.
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
            ? !!this.yardBowls[stay.yardZone || 'top'][key]
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
      // against their zone's shared bowl instead (_autoResolveYardBowls,
      // called once below, not per-stay — one fill can satisfy everyone in
      // the zone at once).
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
    this.messes.push({ kind, x, y, sprite, stay });
  }

  // ── Unified interaction (issues #5, #6, #7, #8, #20, #22) ────────────────
  // A single interact press resolves to whichever nearby thing makes sense —
  // picking up an arrival, taking a settled animal out to play, feeding a
  // cage, topping off the tank, feeding the turtles, grabbing/dropping the
  // scooper, scooping a mess, taking a dog out, baking a treat, or moving
  // the yard divider — whichever is closest, so the same button works
  // everywhere without stepping on itself. If nothing is in range and the
  // scooper is equipped, interacting just sets it back down (issue #22 #5).

  _checkInteractions(interactPressed) {
    if (!interactPressed) return;
    const px = this.player.x, py = this.player.y;
    const dist = (x, y) => Phaser.Math.Distance.Between(px, py, x, y);

    let best = null, bestD = PICKUP_RADIUS;
    const consider = (x, y, action) => {
      const d = dist(x, y);
      if (d < bestD) { bestD = d; best = action; }
    };

    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.RECEPTION) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.pos.x, rec.pos.y, () => this._pickUp(stay));
    }

    // Issue #20: pick up any settled or yard-placed animal to take her out
    // to play (or bring her back in). Skipped at night (everyone should be
    // in her cage for tuck-in) and for a dog currently needing the bathroom
    // (the dedicated leash flow below takes priority for her).
    if (!this.night.active) {
      const sectionKeys = new Set(SECTIONS.map((s) => s.key));
      for (const stay of this.roster.stays) {
        const settled = sectionKeys.has(stay.location) || stay.location === LOCATION.YARD;
        if (!settled) continue;
        // Bug fix: this used to check stay.location === 'dog', which broke
        // the instant a dog could end up anywhere OTHER than a nominally
        // "dog" cage slot or her actual species — i.e. any dog out in the
        // yard (location === 'yard'), or one settled in a cage nominally
        // keyed to a different species under "any pet, any cage" mixing.
        // Her real species lives on the animal instance, not the slot.
        if (stay.animal.species === 'dog' && stay.needs.bathroom) continue;
        // A mom flagged ready-and-waiting (birthReady, below) sits at this
        // same sprite position — without this guard, the tie in consider()
        // always resolves to whichever action was registered first (this
        // pickup, registered earlier in the loop), so interacting with her
        // silently picked her up instead of ever triggering the birth.
        if (stay.birthReady) continue;
        // Owner note 2026-07-29: "the interact location for an animal that
        // is outside playing doesn't move with their visual... it should
        // move with them" — she wanders within her bounds (_updateWander),
        // so the pickup target must track her live sprite position, not her
        // original fixed drop-off spot (rec.pos).
        const rec = this._staySprites.get(stay);
        if (rec) consider(rec.sprite.x, rec.sprite.y, () => this._pickUp(stay));
      }
    }

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

    // Issue #32 follow-up: the outside yard's shared food/water bowl pair
    // per zone — filling works the same way as a cage bowl (any time,
    // regardless of who's hungry); see _fillYardBowl/_autoResolveYardBowls.
    for (const zoneKey of ['top', 'bottom']) {
      const spots = YARD_BOWL_SPOTS[zoneKey];
      consider(spots.food.x, spots.food.y, () => this._fillYardBowl(zoneKey, 'food'));
      consider(spots.water.x, spots.water.y, () => this._fillYardBowl(zoneKey, 'water'));
    }

    if (!this.hasScooper) consider(this.scooperRestPos.x, this.scooperRestPos.y, () => this._pickUpScooper());

    for (const mess of this.messes) {
      consider(mess.x, mess.y, () => this._cleanMess(mess));
    }

    // Issue #19: a dog who needs to go out gets her leash grabbed, not
    // whisked away automatically — walking her out is the player's job.
    // Bug fix: check her real species (stay.animal.species), not
    // stay.location — see the matching fix/comment above.
    for (const stay of this.roster.stays) {
      if (stay.animal.species !== 'dog' || !stay.needs.bathroom) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.sprite.x, rec.sprite.y, () => this._grabLeash(stay));
    }

    if (!this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement)) {
      consider(COMPUTER_SPOT.x, COMPUTER_SPOT.y, () => this._useComputer());
    }

    // Issue #9 refinement: a mom flagged ready-and-waiting needs the player
    // to walk over and interact to actually have her babies/hatch her eggs —
    // same pattern as grabbing a dog's leash for a bathroom need.
    for (const stay of this.roster.stays) {
      if (!stay.birthReady) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.sprite.x, rec.sprite.y, () => this._triggerBirth(stay));
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

    // Yard divider (issue #20) — pick it up from its current post position.
    consider((YARD_DIVIDER_X0 + YARD_DIVIDER_X1) / 2, this.yardDividerY, () => this._pickUpDivider());

    // Tucking animals in for the night (issue #11) — walk up to anyone not
    // yet under their blanket and interact.
    if (this.night.active) {
      for (const stay of this._presentStays()) {
        if (stay.tuckedIn) continue;
        const rec = this._staySprites.get(stay);
        if (rec) consider(rec.sprite.x, rec.sprite.y, () => this._tuckIn(stay));
      }
    }

    // Owner note 2026-07-29: the player's own bed — once everyone's tucked
    // in, walk up and interact here to actually start the sleep sequence
    // (see _checkAllTuckedIn/_beginSleep).
    if (this.night.active && this.night.allTucked && !this.night.sleeping) {
      consider(BED_SPOT.x, BED_SPOT.y, () => this._beginSleep());
    }

    if (best) best();
    else if (this.hasScooper) this._dropScooper(); // nothing nearby — set it down (issue #22 #5)
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
    this._updateWander(delta);
    this._updateNameTagVisibility();
    this.player.setDepth(this.player.y);

    // interactJustDown() is stateful (edge-triggered) — read it exactly once
    // per frame and route the single result to whichever action applies.
    const interactPressed = this.controls.interactJustDown();
    if (this.carrying) {
      this._followCarry();
      this._checkDropoff(interactPressed);
    } else if (this.leashedDog) {
      this._updateLeashedDog();
    } else if (this.carryingDivider) {
      this._followDividerCarry();
      if (interactPressed) this._dropDivider();
    } else {
      this._checkInteractions(interactPressed);
    }
    this._followScooper();
  }

  // ── Wander (issue #22 #4) ─────────────────────────────────────────────────
  // Every settled/yard-placed stay's sprite drifts toward a small periodic
  // target point within its cage/island (or yard zone) bounds — species-tuned
  // interval/amplitude from data/wander.js. Paused while she's tucked in
  // (asleep) or the screen is asleep, so nobody wanders under their blanket.
  _updateWander(delta) {
    if (this.night.sleeping) return;
    for (const [stay, rec] of this._staySprites) {
      if (!rec.wanderBounds || stay.tuckedIn) continue;
      if (!rec.wander) {
        rec.wander = { tx: rec.sprite.x, ty: rec.sprite.y, t: pickWanderInterval(stay.animal.species) };
      }
      rec.wander.t -= delta;
      if (rec.wander.t <= 0) {
        const b = rec.wanderBounds;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const inYard = stay.location === LOCATION.YARD;
        const amp = wanderAmplitude(stay.animal.species, inYard);
        const maxX = Math.max(2, Math.min(amp, b.w / 2 - 6));
        const maxY = Math.max(2, Math.min(amp, b.h / 2 - 6));
        rec.wander.tx = Phaser.Math.Clamp(cx + (Math.random() * 2 - 1) * maxX, b.x + 4, b.x + b.w - 4);
        rec.wander.ty = Phaser.Math.Clamp(cy + (Math.random() * 2 - 1) * maxY, b.y + 4, b.y + b.h - 4);
        rec.wander.t = pickWanderInterval(stay.animal.species);
      }
      rec.sprite.x += (rec.wander.tx - rec.sprite.x) * 0.03;
      rec.sprite.y += (rec.wander.ty - rec.sprite.y) * 0.03;
      rec.sprite.setDepth(rec.sprite.y);
      // The name tag rides along just above her current (wandering) position
      // — UNLESS it's mounted fixed on her cage door (cageAnchored), in which
      // case it stays put regardless of where she wanders inside the cage.
      if (!rec.cageAnchored) {
        rec.tag.container.setPosition(rec.sprite.x, rec.sprite.y - rec.sprite.displayHeight - 6 - rec.tag.height);
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
