import Phaser from 'phaser';
import {
  WALL, ROOM, OUTSIDE, WORLD, BACK_DOOR, FRONT_DOOR, RECEPTION, SECTIONS,
  BACK_WING, STAFF_DOOR, WING_DOOR, STORAGE_ROOM, HOUSE_ROOM,
  penRects, wallRects, backWingWallRects, outsideFenceRects,
} from '../data/sections.js';
import {
  TURTLE, SNAKE, LITTER_BOX, SCOOPER_SPOT, BOWL_SPOTS, TURTLE_FEED_SPOT, COMPUTER_SPOT,
  OVEN, OVEN_SPOT, TREAT_TRAY_SPOT, STORAGE_PROPS,
  CAGES, cageAnimalSpot, YARD_DIVIDER_DEFAULT_Y, YARD_DIVIDER_X0, YARD_DIVIDER_X1,
} from '../data/props.js';
import { createClock, tintForHour, PHASE, DAY_START } from '../data/clock.js';
import { EVENTS } from '../data/events.js';
import { findPath } from '../data/path.js';
import { tickNeeds, clearNeed } from '../data/needs.js';
import { tickBirth } from '../data/births.js';
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
  buildPropTextures, TANK_KEY, SNAKE_TANK_KEY, LITTER_BOX_KEY,
  SCOOPER_KEY, BOWL_KEY, MESS_KEY, NEED_KEY, COMPUTER_KEY, BLANKET_KEY, UPGRADE_KEY, CAGE_KEY,
  OVEN_KEY, TREAT_TRAY_KEY, SHELF_KEY, BOX_KEY, BAG_KEY,
  LETTUCE_KEY, YARD_DIVIDER_POST_KEY, YARD_DIVIDER_LINE_KEY,
} from '../art/props.js';
import {
  buildRaccoonTextures, RACCOON_KEYS, RACCOON_SCARED_KEY, CRUMB_KEY, HELD_TREAT_KEY, RACCOON_DISPLAY_SCALE,
} from '../art/raccoon.js';
import { RACCOON_CHECK_INTERVAL, RACCOON_APPROACH_MS, RACCOON_SCAMPER_MS, RACCOON_SCARE_DASH_MS, randomTreat } from '../data/raccoon.js';
import { createRoster, LOCATION, CARRY_KIND, assignCageSlot } from '../data/roster.js';
import { applyDpr, logicalW, logicalH, worldUiOffset } from '../uiUtils.js';
import { WithDevDrag } from '../dev/dragTool.js';

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
const TANK_WATER_INTERVAL = () => 30_000 + Math.random() * 25_000; // turtles need "a lot of water"
const MAX_MESS_PER_SPOT = 2;

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
export default class KennelScene extends WithDevDrag(Phaser.Scene) {
  constructor() {
    super('Kennel');
  }

  create() {
    applyDpr(this); // camera zoom = dpr; centred origin (startFollow needs it, see uiUtils.js)

    // Dev tool (src/dev/dragTool.js): a central registry of "things with a
    // hardcoded position a human might want to drag around" — every push
    // happens right where that thing is actually placed, in _buildProps()
    // below, so the registry can't drift from the real world.
    this._devRegistry = [];

    buildKennelTextures(this);
    for (const s of SECTIONS) buildFloorTile(this, `floor-${s.key}`, s.floor, s.floorDark);
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
    this.yardDividerY = YARD_DIVIDER_DEFAULT_Y;
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

    this.clock = createClock();
    this._lastHour = this.clock.hour;
    this._lastPhase = this.clock.phase;

    // Full-screen ambient tint, redrawn each frame from tintForHour. Oversized so it
    // covers the visible area regardless of the centred camera's zoom origin (same
    // trick as the sibling games' screen-fixed overlays).
    this.tintGfx = this.add.graphics().setScrollFactor(0).setDepth(9999);

    this.navPath = null;

    // ── Roster / arrivals / carrying (issues #4, #5, #20) ──────────────────
    this.roster = createRoster();
    this._staySprites = new Map(); // stay -> { pos, sprite, tag:{container,width,height}, extras:[...], babyLabels:[...], needIcons:{}, wanderBounds }
    this.carrying = null;          // the stay currently in the player's hands, or null
    this._carryOrigin = null;      // where `carrying` was picked up from: 'reception' | sectionKey | LOCATION.YARD
    this._carryVisual = null;      // { parts: [{obj, dx, dy}, ...] } following the player while carrying
    this.leashedDog = null;        // the dog stay currently being walked outside (issue #19), or null
    this._walkVisual = null;       // { sprite, tag, base, ... } following the player while walking a dog
    this._lingeringOwners = new Map(); // stay -> owner sprite, reserved from the moment she starts walking in until her pet is picked up (issue #25)

    // (yardDividerY/carryingDivider/_dividerVisual and the scooper-rest state
    // are set earlier, above _buildProps() — see that comment.)
    this.messes = [];              // { kind: 'cat', x, y, sprite } — issue #20: dogs no longer mess indoors
    this._catLitterTimer = CAT_LITTER_INTERVAL();
    this.turtleTankNeedsWater = false;
    this._tankTimer = TANK_WATER_INTERVAL();
    this._tankNeedIcon = null;
    this._turtleFeeding = false;   // mid lettuce-feeding animation (issue #20 follow-up)

    // ── Births / computer announcements (issues #9, #10) ──────────────────
    this._computerNeedIcon = null;
    this._computerBusy = false;

    // ── Economy: payouts + returning-guest upgrades (issue #12) ────────────
    this.economy = createEconomy();

    // ── Back wing: baking + the raccoon surprise (issue #13) ───────────────
    this.treatTray = null;                        // { treat, sprite } on the kitchen counter, or null
    this._raccoonTimer = RACCOON_CHECK_INTERVAL();
    this._raccoon = null;                          // active scamper visual, or null while she's mid-run

    // ── Night: tuck-in / staying awake / wake-ups (issue #11) ──────────────
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

    this.game.events.on(EVENTS.HOUR_CHANGE, this._onHourChange, this);
    this.game.events.on(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
    this.events.once('shutdown', () => {
      this.game.events.off(EVENTS.HOUR_CHANGE, this._onHourChange, this);
      this.game.events.off(EVENTS.PHASE_CHANGE, this._onPhaseChange, this);
    });

    // Don't start with an empty kennel — one arrival is already waiting at
    // reception when the shift begins.
    this._spawnArrival(this.clock.day, this.clock.hour);
  }

  // ── World geometry ──────────────────────────────────────────────────────

  _drawWorld() {
    // Base hallway floor + outside grass, under the section floors.
    this.add.tileSprite(0, ROOM.y, ROOM.w, ROOM.h, 'tile-wood').setOrigin(0, 0).setDepth(-3);
    this.add.tileSprite(OUTSIDE.x, ROOM.y, OUTSIDE.w, ROOM.h, 'tile-grass').setOrigin(0, 0).setDepth(-3);

    for (const s of SECTIONS) {
      const { x, y, w, h } = s.rect;
      this.add.tileSprite(x, y, w, h, `floor-${s.key}`).setOrigin(0, 0).setDepth(-2);
      this.add.text(x + w / 2, y + 10, s.label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#2b2b2b',
        backgroundColor: '#ffffffcc',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 0).setDepth(50);
    }

    // Outer walls + every section's pen walls, tiled with the same wall texture.
    const wallLike = [...wallRects(), ...SECTIONS.flatMap((s) => penRects(s))];
    for (const r of wallLike) {
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
    const turtleTank = this.add.image(TURTLE.tank.x, TURTLE.tank.y, TANK_KEY).setOrigin(0, 0).setDepth(-1.5);
    this._devRegistry.push({ name: 'TURTLE.tank', obj: turtleTank });
    // Water-topping marker (section-level resource) stays separate from the
    // lettuce-feeding marker below — different chores, different spots.
    this._tankMarker = { x: TURTLE.tank.x + TURTLE.tank.w / 2, y: TURTLE.tank.y + TURTLE.tank.h - 6 };

    // Snake tank (issue #14) — same tank silhouette as the turtle's, no
    // water-topping chore. Both tanks' individual islands/perches are drawn
    // below alongside every other section's cage grid (CAGE_KEY covers all
    // three art styles now — see art/props.js).
    const snakeTank = this.add.image(SNAKE.tank.x, SNAKE.tank.y, SNAKE_TANK_KEY).setOrigin(0, 0).setDepth(-1.5);
    this._devRegistry.push({ name: 'SNAKE.tank', obj: snakeTank });

    const litterBox = this.add.image(LITTER_BOX.x, LITTER_BOX.y, LITTER_BOX_KEY).setOrigin(0, 0).setDepth(-1);
    this._devRegistry.push({ name: 'LITTER_BOX', obj: litterBox });

    this._rebuildScooperRestSprite();
    // The scooper's rest sprite is destroyed/recreated whenever it's picked
    // up/set down (_pickUpScooper/_dropScooper), so the registry holds a
    // live getter rather than a fixed reference — the drag tool filters out
    // any entry whose obj is currently null (scooper in the player's hands).
    const scene = this;
    this._devRegistry.push({ name: 'SCOOPER_SPOT', get obj() { return scene._scooperRestSprite; } });

    // One bowl per individual cage slot (issue #22 #6) — turtles are fed via
    // lettuce dropped in the tank instead (see TURTLE_FEED_SPOT below).
    for (const key of Object.keys(BOWL_SPOTS)) {
      BOWL_SPOTS[key].forEach(({ x, y }, i) => {
        const bowl = this.add.image(x, y, BOWL_KEY).setOrigin(0.5, 1).setDepth(y - 1);
        this._devRegistry.push({ name: `BOWL_SPOTS.${key}.${i}`, obj: bowl });
      });
    }

    // Turtle lettuce-feeding marker (issue #20 follow-up).
    const feedSpot = this.add.image(TURTLE_FEED_SPOT.x, TURTLE_FEED_SPOT.y, LETTUCE_KEY).setOrigin(0.5, 0.5).setDepth(TURTLE.tank.y - 1);
    this._devRegistry.push({ name: 'TURTLE_FEED_SPOT', obj: feedSpot });

    // Reception computer (issue #10) — baby-announcement messages to owners.
    const computer = this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y, COMPUTER_KEY).setOrigin(0.5, 1).setDepth(COMPUTER_SPOT.y);
    this._devRegistry.push({ name: 'COMPUTER_SPOT', obj: computer });

    // Individual cages (issue #18) — 6 per section, including turtles/snakes
    // as of issue #20 (styled as islands/perches instead of wire pens).
    for (const key of Object.keys(CAGES)) {
      CAGES[key].forEach((cage, i) => {
        const img = this.add.image(cage.x, cage.y, CAGE_KEY[key]).setOrigin(0, 0).setDepth(cage.y - 2);
        this._devRegistry.push({ name: `CAGES.${key}.${i}`, obj: img });
      });
    }

    // Back wing furniture (issue #13): the kitchen's oven/counter (the one
    // interactive spot — baking lives at _bakeTreat) and the storage room's
    // purely-atmospheric shelves/boxes/bags.
    const oven = this.add.image(OVEN_SPOT.x, OVEN_SPOT.y, OVEN_KEY).setOrigin(0.5, 1).setDepth(OVEN_SPOT.y);
    this._devRegistry.push({ name: 'OVEN_SPOT', obj: oven });
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
  _devDragTargets() {
    return this._devRegistry.map((e) => ({ name: e.name, obj: e.obj })).filter((e) => e.obj);
  }

  // (Re)creates the resting scooper sprite at its current rest spot — called
  // once at build time and again whenever the scooper is set back down
  // (issue #22 #5).
  _rebuildScooperRestSprite() {
    this._scooperRestSprite?.destroy();
    const { x, y } = this.scooperRestPos;
    this._scooperRestSprite = this.add.image(x, y, SCOOPER_KEY).setOrigin(0.5, 1).setDepth(y);
  }

  _buildCollision() {
    // Every rect a body can't walk through — feeds both the arcade static
    // colliders below and findPath's obstacle-aware routing. The litter box,
    // scooper, and bowls stay non-solid on purpose — they're small
    // furniture, not walls, and keeping them out of pathfinding avoids extra
    // routing complexity for a first pass.
    this.obstacleRects = [
      ...wallRects(),
      ...SECTIONS.flatMap((s) => penRects(s)),
      RECEPTION.desk,
      TURTLE.tank,
      SNAKE.tank,
      ...outsideFenceRects(),
      ...backWingWallRects(),
      OVEN,
    ];

    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.walls = this.physics.add.staticGroup();
    for (const r of this.obstacleRects) {
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(zone, true);
      this.walls.add(zone);
    }

    this._collides = (x, y, r) => this.obstacleRects.some((rect) => circleRectOverlap(x, y, r, rect));
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

  _onHourChange({ hour, phase, day }) {
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
    const stay = this.roster.spawnArrival({ day, hour });
    // Issue #18: null means that species' section is full (all 6 cages
    // taken) — quietly skip this roll, no queue/penalty/notification.
    if (!stay) return;
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
    const waiting = this.roster.stays.filter((s) => s !== stay && s.location === LOCATION.RECEPTION).length;
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
    const sharesHome = animal.species === 'turtle' || animal.species === 'snake' || animal.species === 'bird';
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

  // Every frame: shows a name tag only while the player is close enough to
  // read it (issue #22 #2), and hides it again otherwise. Applies to every
  // stay's tag + baby labels, and the leashed-dog walk tag.
  _updateNameTagVisibility() {
    const px = this.player.x, py = this.player.y;
    for (const rec of this._staySprites.values()) {
      const within = Phaser.Math.Distance.Between(px, py, rec.pos.x, rec.pos.y) <= NAME_TAG_RADIUS;
      rec.tag.container.setVisible(within);
      for (const label of rec.babyLabels) label.setVisible(within);
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

  _checkDropoff() {
    const stay = this.carrying;
    if (this._carryOrigin === LOCATION.YARD) {
      // Bringing her back inside — only her own section (cage) will accept her.
      const section = SECTIONS.find((s) => s.key === stay.animal.species);
      if (!section) return;
      const { x, y, w, h } = section.rect;
      if (this.player.x < x || this.player.x > x + w || this.player.y < y || this.player.y > y + h) return;
      // _dropOff returns false (and leaves her in the player's hands) if the
      // section's 6 cages are all already taken — see its own comment.
      if (this._dropOff(stay, section)) this._carryOrigin = null;
    } else if (this._carryOrigin === LOCATION.RECEPTION) {
      // A fresh arrival — walking into her own section settles her into a cage.
      const section = SECTIONS.find((s) => s.key === stay.animal.species);
      if (!section) return;
      const { x, y, w, h } = section.rect;
      if (this.player.x < x || this.player.x > x + w || this.player.y < y || this.player.y > y + h) return;
      if (this._dropOff(stay, section, { fromReception: true })) this._carryOrigin = null;
    } else {
      // Picked up from her own cage to take out to play — only the yard
      // will accept her (so picking her up doesn't instantly re-drop her
      // right back where she stood).
      if (this.player.x < OUTSIDE.x + 8) return;
      this._dropOffToYard(stay);
      this._carryOrigin = null;
    }
  }

  // Returns true if the drop-off happened, false if it was declined (section
  // full — see below), so _checkDropoff knows whether to keep carrying her.
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
    const cageSlot = assignCageSlot(this.roster.stays, section.key);
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
  // (their "cage" is a small island/perch inside the shared tank). Falls
  // back to a plain grid spot if every cage is somehow taken.
  _sectionSlot(section, stay) {
    const cage = CAGES[section.key]?.[stay?.cageSlot];
    if (cage) return cageAnimalSpot(cage);
    const already = this.roster.stays.filter((s) => s !== stay && s.location === section.key).length;
    return this._gridSlot(section.rect, already, 30, 46, 60);
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

  // Feeds the one stay in this cage slot, if she's hungry (issue #22 #6 —
  // one bowl per cage instead of one shared bowl per section).
  _feedCage(sectionKey, cageSlot) {
    const stay = this.roster.stays.find((s) => s.location === sectionKey && s.cageSlot === cageSlot);
    if (!stay || !stay.needs.food) return false;
    clearNeed(stay, 'food');
    this._setNeedIcon(stay, 'food', false);
    this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} got fed!`);
    return true;
  }

  // Turtles can't reach a regular bowl from their water-tank island, so
  // feeding them means dropping a piece of lettuce into the tank instead
  // (issue #20 follow-up): every hungry turtle in the section drifts toward
  // it, "eats", and the need clears — one lettuce feeds the whole tank, same
  // as any other multi-occupant cage.
  _feedTurtleTank() {
    if (this._turtleFeeding) return false;
    const hungry = this.roster.stays.filter((s) => s.location === 'turtle' && s.needs.food);
    if (!hungry.length) return false;
    this._turtleFeeding = true;
    const { x, y } = TURTLE_FEED_SPOT;
    const lettuce = this.add.image(x, y, LETTUCE_KEY).setDepth(9001);
    for (const stay of hungry) {
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      this.tweens.add({
        targets: rec.sprite, x, y: y + 6, duration: 500, hold: 300, yoyo: true, ease: 'Sine.easeInOut',
      });
    }
    this.time.delayedCall(1400, () => {
      lettuce.destroy();
      for (const stay of hungry) {
        clearNeed(stay, 'food');
        this._setNeedIcon(stay, 'food', false);
      }
      this._turtleFeeding = false;
      this.game.events.emit(EVENTS.NOTIFY, hungry.length > 1 ? 'The turtles got fed!' : `${hungry[0].animal.name} got fed!`);
    });
    return true;
  }

  _topOffTank() {
    this.turtleTankNeedsWater = false;
    this._tankTimer = TANK_WATER_INTERVAL();
    if (this._tankNeedIcon) { this._tankNeedIcon.destroy(); this._tankNeedIcon = null; }
    this.game.events.emit(EVENTS.NOTIFY, 'Topped off the turtle tank!');
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

  _cleanMess(mess) {
    mess.sprite.destroy();
    this.messes = this.messes.filter((m) => m !== mess);
    this.game.events.emit(EVENTS.NOTIFY, 'Litter box cleaned!');
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
    const section = SECTIONS.find((s) => s.key === 'dog');
    const pos = this._sectionSlot(section, stay);
    this._renderStay(stay, pos.x, pos.y);
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

  _onPhaseChange({ isNight }) {
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
      const section = SECTIONS.find((s) => s.key === stay.animal.species);
      if (!section) continue;
      stay.cageSlot = assignCageSlot(this.roster.stays, section.key);
      stay.location = section.key;
      const pos = this._sectionSlot(section, stay);
      this._renderStay(stay, pos.x, pos.y);
    }
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

  _checkAllTuckedIn() {
    if (!this.night.active || this.night.allTucked) return;
    if (!this._presentStays().every((s) => s.tuckedIn)) return;
    this.night.allTucked = true;
    this.game.events.emit(EVENTS.NOTIFY, "Everyone's asleep!");
    this._beginSleep();
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
    for (const stay of this._settledStays()) { // only settled stays accrue needs
      const flipped = tickNeeds(stay, delta);
      for (const key of flipped) {
        this._setNeedIcon(stay, key, true);
        if (key === 'bathroom') {
          this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} needs to go to the bathroom!`);
        }
      }
    }

    this._tankTimer -= delta;
    if (this._tankTimer <= 0 && !this.turtleTankNeedsWater) {
      this.turtleTankNeedsWater = true;
      this._tankNeedIcon = this.add.image(this._tankMarker.x, this._tankMarker.y - 30, NEED_KEY.water)
        .setDepth(9002);
    }
  }

  // Issue #20: dogs have no indoor mess of their own anymore — their potty
  // pathway is entirely the outside leash walk (needs.bathroom). Only the
  // cat litter box still spawns a periodic indoor mess.
  _updateMesses(delta) {
    this._catLitterTimer -= delta;
    if (this._catLitterTimer <= 0) {
      this._catLitterTimer = CAT_LITTER_INTERVAL();
      const catsPresent = this.roster.stays.some((s) => s.location === 'cat');
      const count = this.messes.filter((m) => m.kind === 'cat').length;
      if (catsPresent && count < MAX_MESS_PER_SPOT) this._spawnMess('cat', LITTER_BOX);
    }
  }

  _spawnMess(kind, rect) {
    const x = rect.x + 10 + Math.random() * Math.max(1, rect.w - 20);
    const y = rect.y + 10 + Math.random() * Math.max(1, rect.h - 20);
    const sprite = this.add.image(x, y, MESS_KEY).setOrigin(0.5, 0.5).setDepth(y - 0.5);
    this.messes.push({ kind, x, y, sprite });
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
        if (stay.location === 'dog' && stay.needs.bathroom) continue;
        const rec = this._staySprites.get(stay);
        if (rec) consider(rec.pos.x, rec.pos.y, () => this._pickUp(stay));
      }
    }

    for (const key of Object.keys(BOWL_SPOTS)) {
      BOWL_SPOTS[key].forEach((spot, slot) => {
        consider(spot.x, spot.y, () => this._feedCage(key, slot));
      });
    }

    consider(this._tankMarker.x, this._tankMarker.y, () => this._topOffTank());
    consider(TURTLE_FEED_SPOT.x, TURTLE_FEED_SPOT.y, () => this._feedTurtleTank());

    if (!this.hasScooper) consider(this.scooperRestPos.x, this.scooperRestPos.y, () => this._pickUpScooper());

    for (const mess of this.messes) {
      consider(mess.x, mess.y, () => this._cleanMess(mess));
    }

    // Issue #19: a dog who needs to go out gets her leash grabbed, not
    // whisked away automatically — walking her out is the player's job.
    for (const stay of this.roster.stays) {
      if (stay.location !== 'dog' || !stay.needs.bathroom) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.pos.x, rec.pos.y, () => this._grabLeash(stay));
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
      if (rec) consider(rec.pos.x, rec.pos.y, () => this._triggerBirth(stay));
    }

    // Issue #13: bake a treat at the kitchen oven — only while the counter's
    // clear, so there's always at most one tray out for the raccoon to steal.
    if (!this.treatTray) consider(OVEN_SPOT.x, OVEN_SPOT.y, () => this._bakeTreat());

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
        if (rec) consider(rec.pos.x, rec.pos.y, () => this._tuckIn(stay));
      }
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
      this._checkDropoff();
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
