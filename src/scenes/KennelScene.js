import Phaser from 'phaser';
import {
  WALL, ROOM, OUTSIDE, WORLD, BACK_DOOR, FRONT_DOOR, RECEPTION, SECTIONS,
  penRects, wallRects, outsideFenceRects,
} from '../data/sections.js';
import { TURTLE, CAT_PLAYPEN, DOG_PLAYPEN, LITTER_BOX, SCOOPER_SPOT, BOWL_SPOT, COMPUTER_SPOT } from '../data/props.js';
import { createClock, tintForHour, PHASE, DAY_START } from '../data/clock.js';
import { EVENTS } from '../data/events.js';
import { findPath } from '../data/path.js';
import { tickNeeds, clearNeed } from '../data/needs.js';
import { tickBirth } from '../data/births.js';
import { pickWakeEvent, WAKE_REASON } from '../data/night.js';
import { createAnimal } from '../data/animal.js';
import { randomName } from '../data/names.js';
import { Controls } from '../input/Controls.js';
import { buildKennelTextures, buildFloorTile } from '../art/kennel.js';
import { buildPlayerTexture, PLAYER_W, PLAYER_H } from '../art/player.js';
import { buildAnimalTextures, animalTextureKey, EGG_KEY, NAME_TAG_KEY } from '../art/animals.js';
import { buildCarryTextures, CARRY_KEY } from '../art/carry.js';
import {
  buildPropTextures, TANK_KEY, ISLAND_KEY, PLAYPEN_FENCE_KEY, LITTER_BOX_KEY,
  SCOOPER_KEY, BOWL_KEY, MESS_KEY, NEED_KEY, COMPUTER_KEY, BLANKET_KEY,
} from '../art/props.js';
import { createRoster, LOCATION, CARRY_KIND } from '../data/roster.js';
import { applyDpr, logicalW, logicalH } from '../uiUtils.js';

// Placeholder name shown on a baby's tiny label until the owner names it via
// the reception computer (issue #10). Matches data/animal.js's opts.name
// override convention — createAnimal({ name: BABY_PLACEHOLDER }).
const BABY_PLACEHOLDER = '???';

// A handful of collar colors — cycled across siblings that share the SAME
// species + colorVariant (they "look the same", DESIGN.md's kitten example)
// so each one is still tellable apart at a glance.
const COLLAR_COLORS = [0xdd5555, 0x4b9fc4, 0xf2c96b, 0x6fae5a, 0x9a6fd6];

const SPEED = 160; // px/s, world (logical) units
const PICKUP_RADIUS = 50; // px, how close the player must be to interact with anything

// Sections that get their own smaller "corral" for placement instead of the
// full section rect (cat/dog playpens, turtle sand island). Anything else
// falls back to the plain section-rect grid.
const PLAYPEN_RECT = { cat: CAT_PLAYPEN, dog: DOG_PLAYPEN };

const DOG_MESS_INTERVAL = () => 25_000 + Math.random() * 25_000;
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
export default class KennelScene extends Phaser.Scene {
  constructor() {
    super('Kennel');
  }

  create() {
    applyDpr(this); // camera zoom = dpr; centred origin (startFollow needs it, see uiUtils.js)

    buildKennelTextures(this);
    for (const s of SECTIONS) buildFloorTile(this, `floor-${s.key}`, s.floor, s.floorDark);
    buildPlayerTexture(this);
    buildAnimalTextures(this);
    buildCarryTextures(this);
    buildPropTextures(this);

    this._drawWorld();
    this._buildProps();
    this._buildCollision();
    this._buildPlayer();

    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.controls = new Controls(this);

    this.clock = createClock();
    this._lastHour = this.clock.hour;
    this._lastPhase = this.clock.phase;

    // Full-screen ambient tint, redrawn each frame from tintForHour. Oversized so it
    // covers the visible area regardless of the centred camera's zoom origin (same
    // trick as the sibling games' screen-fixed overlays).
    this.tintGfx = this.add.graphics().setScrollFactor(0).setDepth(9999);

    this.navPath = null;

    // ── Roster / arrivals / carrying (issues #4, #5) ──────────────────────
    this.roster = createRoster();
    this._staySprites = new Map(); // stay -> { pos, sprite, tag:{bg,text}, extras:[...], needIcons:{} }
    this.carrying = null;          // the stay currently in the player's hands, or null
    this._carryVisual = null;      // { obj } following the player while carrying

    // ── Feeding / potty / playpens (issues #6, #7, #8) ─────────────────────
    this.hasScooper = false;
    this._scooperVisual = null;
    this.messes = [];              // { kind: 'dog'|'cat', x, y, sprite }
    this._dogMessTimer = DOG_MESS_INTERVAL();
    this._catLitterTimer = CAT_LITTER_INTERVAL();
    this.turtleTankNeedsWater = false;
    this._tankTimer = TANK_WATER_INTERVAL();
    this._tankNeedIcon = null;

    // ── Births / computer announcements (issues #9, #10) ──────────────────
    this._computerNeedIcon = null;
    this._computerBusy = false;

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
    this.add.tileSprite(0, 0, ROOM.w, ROOM.h, 'tile-wood').setOrigin(0, 0).setDepth(-3);
    this.add.tileSprite(OUTSIDE.x, 0, OUTSIDE.w, ROOM.h, 'tile-grass').setOrigin(0, 0).setDepth(-3);

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
    doorGfx.fillStyle(0x7a4a2a, 1).fillRect(FRONT_DOOR.x0, ROOM.h - WALL, dw, WALL);
    doorGfx.fillStyle(0x5c3620, 1).fillRect(FRONT_DOOR.x0 + dw / 2 - 1, ROOM.h - WALL, 2, WALL);

    // Back door — the east wall already has a gap here (see wallRects); mark the
    // threshold so it reads as a doorway rather than just an empty wall.
    doorGfx.fillStyle(0xe8c68f, 1).fillRect(ROOM.w - WALL, BACK_DOOR.y0, WALL, BACK_DOOR.y1 - BACK_DOOR.y0);
  }

  // Furniture added by issues #6/#7/#8 — turtle tank + sand island, cat/dog
  // playpen fences, litter box, scooper, and one food/water bowl per section
  // (turtles get the tank instead). All positions come from data/props.js so
  // interaction code below reads the exact same rects.
  _buildProps() {
    this.add.image(TURTLE.tank.x, TURTLE.tank.y, TANK_KEY).setOrigin(0, 0).setDepth(-1.5);
    this.add.image(TURTLE.island.x, TURTLE.island.y, ISLAND_KEY).setOrigin(0, 0).setDepth(-1.2);
    this._tankMarker = { x: TURTLE.tank.x + TURTLE.tank.w / 2, y: TURTLE.tank.y + TURTLE.tank.h - 6 };

    this.add.image(CAT_PLAYPEN.x, CAT_PLAYPEN.y, PLAYPEN_FENCE_KEY).setOrigin(0, 0).setDepth(0.5);
    this.add.image(DOG_PLAYPEN.x, DOG_PLAYPEN.y, PLAYPEN_FENCE_KEY).setOrigin(0, 0).setDepth(0.5);

    this.add.image(LITTER_BOX.x, LITTER_BOX.y, LITTER_BOX_KEY).setOrigin(0, 0).setDepth(-1);

    this.add.image(SCOOPER_SPOT.x, SCOOPER_SPOT.y, SCOOPER_KEY).setOrigin(0.5, 1).setDepth(SCOOPER_SPOT.y);

    for (const key of Object.keys(BOWL_SPOT)) {
      const { x, y } = BOWL_SPOT[key];
      this.add.image(x, y, BOWL_KEY).setOrigin(0.5, 1).setDepth(y - 1);
    }

    // Reception computer (issue #10) — baby-announcement messages to owners.
    this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y, COMPUTER_KEY).setOrigin(0.5, 1).setDepth(COMPUTER_SPOT.y);
  }

  _buildCollision() {
    // Every rect a body can't walk through — feeds both the arcade static
    // colliders below and findPath's obstacle-aware routing. Playpen fences,
    // the litter box, scooper, and bowls stay non-solid on purpose — they're
    // small furniture, not walls, and keeping them out of pathfinding avoids
    // extra routing complexity for a first pass.
    this.obstacleRects = [
      ...wallRects(),
      ...SECTIONS.flatMap((s) => penRects(s)),
      RECEPTION.desk,
      TURTLE.tank,
      ...outsideFenceRects(),
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
    // Just off the reception desk — a natural place to start a shift.
    const startX = RECEPTION.desk.x + 40;
    const startY = RECEPTION.desk.y + 90;
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
    const stay = this.roster.spawnArrival({ day, hour });
    this._placeAtReception(stay);
    this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} arrived!`);
  }

  _placeAtReception(stay) {
    const waiting = this.roster.stays.filter((s) => s !== stay && s.location === LOCATION.RECEPTION).length;
    const { rug } = RECEPTION;
    const x = rug.x + 30 + (waiting % 3) * 55;
    const y = rug.y + 24 + Math.floor(waiting / 3) * 42;
    this._renderStay(stay, x, y);
  }

  _processCheckouts(day) {
    for (const stay of this.roster.checkoutDue(day)) {
      this._destroyStaySprites(stay);
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} went home!`);
    }
  }

  // Draws (or redraws) a stay's standing sprite + name tag + companions (baby
  // sprites, or eggs for a turtle mom with hasEggs) at a fixed world position —
  // used for both reception-waiting and section-placed stays.
  _renderStay(stay, x, y) {
    this._destroyStaySprites(stay);
    const { animal } = stay;
    const texKey = animalTextureKey(animal.species, animal.stage, animal.colorVariant);
    const sprite = this.add.image(x, y, texKey).setOrigin(0.5, 1).setDepth(y);
    const tag = this._addNameTag(x, y - sprite.height - 6, animal.name);

    // Turtle eggs/babies sit tucked close to mom on the sand island (small
    // island, plenty of animals to share it) — tighter spacing + a little
    // jitter instead of the wider spread used for cat/dog companions.
    const isTurtle = animal.species === 'turtle';
    const extras = [];
    let cx = x + sprite.width * (isTurtle ? 0.4 : 0.55);
    if (animal.hasEggs) {
      for (let i = 0; i < animal.eggCount; i++) {
        const jitterY = (Math.random() - 0.5) * 6;
        extras.push(this.add.image(cx, y - 1 + jitterY, EGG_KEY).setOrigin(0.5, 1).setDepth(y - 1));
        cx += isTurtle ? 7 : 10;
      }
    }
    // Siblings that share a species+colorVariant "look the same" (DESIGN.md's
    // kitten example) — give each of THOSE a small colored collar so they're
    // still tellable apart; a baby on its own doesn't need one.
    const variantCounts = {};
    for (const b of stay.companions) variantCounts[b.colorVariant] = (variantCounts[b.colorVariant] || 0) + 1;
    const variantSeen = {};

    for (const baby of stay.companions) {
      const babyKey = animalTextureKey(baby.species, 'baby', baby.colorVariant);
      const jitterY = isTurtle ? (Math.random() - 0.5) * 6 : 0;
      const babySprite = this.add.image(cx, y + jitterY, babyKey).setOrigin(0.5, 1).setDepth(y);
      extras.push(babySprite);

      if (variantCounts[baby.colorVariant] > 1) {
        const seen = variantSeen[baby.colorVariant] || 0;
        variantSeen[baby.colorVariant] = seen + 1;
        const collarColor = COLLAR_COLORS[seen % COLLAR_COLORS.length];
        extras.push(this.add.circle(cx, y + jitterY - babySprite.height * 0.5, 3, collarColor).setDepth(y + 0.1));
      }

      // Tiny label under each baby — "???" until the owner names it via the
      // reception computer (issue #10), then its real name.
      extras.push(this.add.text(cx, y + jitterY + 2, baby.name || BABY_PLACEHOLDER, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#4a341c',
        backgroundColor: '#ffffffb0',
        padding: { x: 2, y: 0 },
      }).setOrigin(0.5, 0).setDepth(y + 0.2));

      cx += isTurtle ? 9 : 14;
    }

    const rec = { pos: { x, y }, sprite, tag, extras, needIcons: {}, blanket: null };
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
  }

  _destroyStaySprites(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    rec.sprite.destroy();
    rec.tag.bg.destroy();
    rec.tag.text.destroy();
    rec.extras.forEach((e) => e.destroy());
    Object.values(rec.needIcons).forEach((icon) => icon.destroy());
    rec.blanket?.destroy();
    this._staySprites.delete(stay);
  }

  // Floating name-tag texture + centered text, anchored just above (x, y).
  // Returns the two display objects so callers can destroy them later.
  _addNameTag(x, y, name) {
    const bg = this.add.image(x, y, NAME_TAG_KEY).setOrigin(0.5, 1).setDepth(9000);
    const text = this.add.text(x, y - bg.height + 4, name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#4a341c',
    }).setOrigin(0.5, 0).setDepth(9001);
    return { bg, text };
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
      const y = rec.tag.bg.y - rec.tag.bg.height - 2;
      rec.needIcons[key] = this.add.image(x, y, NEED_KEY[key]).setOrigin(0.5, 1).setDepth(9002);
    } else if (rec.needIcons[key]) {
      rec.needIcons[key].destroy();
      delete rec.needIcons[key];
    }
  }

  // ── Carrying (issue #5) ──────────────────────────────────────────────────
  // Press interact near a waiting reception arrival to pick it up; the carry
  // prop (leash/cage/box/basket — or the bare animal for the small pets) then
  // follows the player. Walking into the animal's own section auto-drops it off
  // — simpler for a kid player than requiring a second interact press.

  _pickUp(stay) {
    this._destroyStaySprites(stay);
    stay.location = LOCATION.CARRYING;
    this.carrying = stay;
    const key = stay.carryKind === CARRY_KIND.NONE
      ? animalTextureKey(stay.animal.species, stay.animal.stage, stay.animal.colorVariant)
      : CARRY_KEY[stay.carryKind];
    const obj = this.add.image(this.player.x, this.player.y, key).setOrigin(0.5, 1).setDepth(9500);
    this._carryVisual = { obj };
  }

  _followCarry() {
    if (!this._carryVisual) return;
    const { obj } = this._carryVisual;
    obj.x = this.player.x;
    obj.y = this.player.y - PLAYER_H * 0.55;
    obj.setDepth(this.player.y + 1);
  }

  _checkDropoff() {
    const stay = this.carrying;
    const section = SECTIONS.find((s) => s.key === stay.animal.species);
    if (!section) return;
    const { x, y, w, h } = section.rect;
    if (this.player.x < x || this.player.x > x + w || this.player.y < y || this.player.y > y + h) return;
    this._dropOff(stay, section);
  }

  _dropOff(stay, section) {
    this._carryVisual?.obj.destroy();
    this._carryVisual = null;
    this.carrying = null;
    stay.location = section.key;
    // A late dropoff during the night (rare — only if the player was still
    // mid-carry when night fell) still needs tucking in, same as everyone
    // else (issue #11).
    if (this.night.active) stay.tuckedIn = stay.tuckedIn ?? false;
    const already = this.roster.stays.filter((s) => s !== stay && s.location === section.key).length;
    const pos = this._sectionSlot(section, already);
    this._renderStay(stay, pos.x, pos.y);
  }

  // Placement spot for the `index`-th stay already in a section. Cats/dogs
  // place inside their playpen; turtles place on the sand island (spread with
  // a golden-angle spiral so multiples don't stack exactly); everything else
  // uses the plain wrapping grid across the whole section rect.
  _sectionSlot(section, index) {
    if (section.key === 'turtle') return this._islandSlot(index);
    const playpen = PLAYPEN_RECT[section.key];
    if (playpen) return this._gridSlot(playpen, index, 20, 42, 56);
    return this._gridSlot(section.rect, index, 30, 46, 60);
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

  // Spreads points across the sand island using the golden angle, so
  // successive turtles/eggs land at visibly different spots rather than
  // clustering — "plenty of space for everyone" (DESIGN.md).
  _islandSlot(index) {
    const { x, y, w, h } = TURTLE.island;
    const cx = x + w / 2, cy = y + h / 2;
    const GOLDEN_ANGLE = 2.399963;
    const ring = Math.floor(Math.sqrt(index + 0.5));
    const angle = index * GOLDEN_ANGLE;
    const rx = (w / 2 - 6) * Math.min(1, (ring + 1) / 3);
    const ry = (h / 2 - 6) * Math.min(1, (ring + 1) / 3);
    return { x: cx + Math.cos(angle) * rx * 0.7, y: cy + Math.sin(angle) * ry * 0.7 };
  }

  // ── Feeding / water (issue #6) ────────────────────────────────────────────

  _feedSection(sectionKey) {
    let fedAny = false;
    for (const stay of this.roster.stays) {
      if (stay.location !== sectionKey) continue;
      if (!stay.needs.food) continue;
      clearNeed(stay, 'food');
      this._setNeedIcon(stay, 'food', false);
      this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} got fed!`);
      fedAny = true;
    }
    return fedAny;
  }

  _topOffTank() {
    this.turtleTankNeedsWater = false;
    this._tankTimer = TANK_WATER_INTERVAL();
    if (this._tankNeedIcon) { this._tankNeedIcon.destroy(); this._tankNeedIcon = null; }
    this.game.events.emit(EVENTS.NOTIFY, 'Topped off the turtle tank!');
  }

  // ── Potty: scooper / litter box / dogs outside (issue #7) ────────────────

  _pickUpScooper() {
    this.hasScooper = true;
    this.game.events.emit(EVENTS.NOTIFY, 'Got the scooper!');
  }

  _cleanMess(mess) {
    mess.sprite.destroy();
    this.messes = this.messes.filter((m) => m !== mess);
    this.game.events.emit(EVENTS.NOTIFY, mess.kind === 'cat' ? 'Litter box cleaned!' : 'All cleaned up!');
  }

  // Simplest read for a kid player: the dog sprite visibly walks off toward
  // the outside grass strip, pauses a moment, then walks back — no need for
  // the player to shepherd it there step by step.
  _takeDogOut(stay) {
    if (stay._onBathroomTrip) return;
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    stay._onBathroomTrip = true;
    const home = { ...rec.pos };
    const outsideX = OUTSIDE.x + OUTSIDE.w / 2;
    const outsideY = ROOM.h / 2;

    rec.tag.bg.setVisible(false);
    rec.tag.text.setVisible(false);
    rec.extras.forEach((e) => e.setVisible(false));
    this._setNeedIcon(stay, 'bathroom', false);

    this.tweens.add({
      targets: rec.sprite, x: outsideX, y: outsideY, duration: 900, ease: 'Sine.easeInOut',
      onComplete: () => {
        this.time.delayedCall(1400, () => {
          this.tweens.add({
            targets: rec.sprite, x: home.x, y: home.y, duration: 900, ease: 'Sine.easeInOut',
            onComplete: () => {
              stay._onBathroomTrip = false;
              clearNeed(stay, 'bathroom');
              this._renderStay(stay, home.x, home.y);
              this.game.events.emit(EVENTS.NOTIFY, `${stay.animal.name} feels much better!`);
              // If this was the night's current "needs the bathroom" wake-up
              // (issue #11), taking her outside resolves it — resume toward morning.
              if (this.night.currentWake?.stay === stay && this.night.currentWake.reason === WAKE_REASON.BATHROOM) {
                this._resolveWakeUp();
              }
            },
          });
        });
      },
    });
  }

  // ── Births: pregnancy/eggs → babies (issue #9) ───────────────────────────

  // Ticks every settled stay's birth timer (data/births.js); the moment one
  // fires, hands off to _triggerBirth. Reception/carrying stays don't accrue
  // this — matches _updateNeeds' "only settled stays" rule.
  _updateBirths(delta) {
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    for (const stay of this.roster.stays) {
      if (!sectionKeys.has(stay.location)) continue;
      if (stay.birthTimer == null) continue;
      if (tickBirth(stay, delta)) this._triggerBirth(stay);
    }
  }

  // Turns a turtle mom's eggs into hatchlings, or gives a pregnant mom (any
  // species) 1-2 babies — either way the new babies start unnamed
  // (BABY_PLACEHOLDER) until the player sends the owner an announcement via
  // the reception computer (issue #10), and the stay is flagged so the
  // computer's "needs attention" icon picks it up.
  _triggerBirth(stay) {
    stay.birthTimer = null;
    const rec = this._staySprites.get(stay);
    const pos = rec ? { ...rec.pos } : null;

    if (stay.animal.species === 'turtle' && stay.animal.hasEggs) {
      const count = stay.animal.eggCount;
      stay.animal.hasEggs = false;
      stay.animal.eggCount = 0;
      // "Then you take out the shells!" (DESIGN.md) — the egg extras are
      // simply gone once _renderStay redraws below; no separate pickup step.
      const babies = Array.from({ length: count }, () =>
        createAnimal('turtle', { stage: 'baby', name: BABY_PLACEHOLDER }));
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
    for (const stay of this._presentStays()) {
      stay.tuckedIn = false;
      this._setNeedIcon(stay, 'tuck', true);
    }
    this._checkAllTuckedIn(); // covers the (rare) empty-kennel case
  }

  // Lays (or removes) the small fabric sheet over a stay — one blanket per
  // stay covers her companions too (eggs/babies "wrapped" with her, per
  // DESIGN.md), since they share the same cage spot.
  _setBlanket(stay, show) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    if (show) {
      if (rec.blanket) return;
      const img = this.add.image(rec.pos.x, rec.pos.y - rec.sprite.height * 0.35, BLANKET_KEY)
        .setOrigin(0.5, 0.5).setDepth(rec.sprite.depth + 0.3);
      img.setDisplaySize(rec.sprite.displayWidth * 1.2, rec.sprite.displayHeight * 0.7);
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
      // Nudge her existing birth timer to fire almost immediately — the
      // normal birth flow (_updateBirths/_triggerBirth) takes it from here,
      // including its own "having babies!" notification.
      stay.birthTimer = 200;
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
    const sectionKeys = new Set(SECTIONS.map((s) => s.key));
    for (const stay of this.roster.stays) {
      if (!sectionKeys.has(stay.location)) continue; // only settled stays accrue needs
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

  _updateMesses(delta) {
    this._dogMessTimer -= delta;
    if (this._dogMessTimer <= 0) {
      this._dogMessTimer = DOG_MESS_INTERVAL();
      const dogsPresent = this.roster.stays.some((s) => s.location === 'dog');
      const count = this.messes.filter((m) => m.kind === 'dog').length;
      if (dogsPresent && count < MAX_MESS_PER_SPOT) this._spawnMess('dog', DOG_PLAYPEN);
    }

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

  // ── Unified interaction (issues #5, #6, #7, #8) ──────────────────────────
  // A single interact press resolves to whichever nearby thing makes sense —
  // picking up an arrival, feeding a section, topping off the tank, grabbing
  // the scooper, scooping a mess, or taking a dog out — whichever is closest,
  // so the same button works everywhere without stepping on itself.

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

    for (const key of Object.keys(BOWL_SPOT)) {
      const { x, y } = BOWL_SPOT[key];
      consider(x, y, () => this._feedSection(key));
    }

    consider(this._tankMarker.x, this._tankMarker.y, () => this._topOffTank());

    if (!this.hasScooper) consider(SCOOPER_SPOT.x, SCOOPER_SPOT.y, () => this._pickUpScooper());

    for (const mess of this.messes) {
      if (mess.kind === 'dog' && !this.hasScooper) continue; // dog messes need the scooper equipped
      consider(mess.x, mess.y, () => this._cleanMess(mess));
    }

    for (const stay of this.roster.stays) {
      if (stay.location !== 'dog' || !stay.needs.bathroom || stay._onBathroomTrip) continue;
      const rec = this._staySprites.get(stay);
      if (rec) consider(rec.pos.x, rec.pos.y, () => this._takeDogOut(stay));
    }

    if (!this._computerBusy && this.roster.stays.some((s) => s.needsAnnouncement)) {
      consider(COMPUTER_SPOT.x, COMPUTER_SPOT.y, () => this._useComputer());
    }

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
  }

  // ── Per-frame ────────────────────────────────────────────────────────────

  update(time, delta) {
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
    this.player.setDepth(this.player.y);

    // interactJustDown() is stateful (edge-triggered) — read it exactly once
    // per frame and route the single result to whichever action applies.
    const interactPressed = this.controls.interactJustDown();
    if (this.carrying) {
      this._followCarry();
      this._checkDropoff();
    } else {
      this._checkInteractions(interactPressed);
    }
    this._followScooper();
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
