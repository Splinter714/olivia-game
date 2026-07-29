import Phaser from 'phaser';
import {
  WALL, ROOM, OUTSIDE, WORLD, BACK_DOOR, FRONT_DOOR, RECEPTION, SECTIONS,
  penRects, wallRects, outsideFenceRects,
} from '../data/sections.js';
import { createClock, tintForHour, PHASE } from '../data/clock.js';
import { EVENTS } from '../data/events.js';
import { findPath } from '../data/path.js';
import { Controls } from '../input/Controls.js';
import { buildKennelTextures, buildFloorTile } from '../art/kennel.js';
import { buildPlayerTexture, PLAYER_W, PLAYER_H } from '../art/player.js';
import { buildAnimalTextures, animalTextureKey, EGG_KEY, NAME_TAG_KEY } from '../art/animals.js';
import { buildCarryTextures, CARRY_KEY } from '../art/carry.js';
import { createRoster, LOCATION, CARRY_KIND } from '../data/roster.js';
import { applyDpr, logicalW, logicalH } from '../uiUtils.js';

const SPEED = 160; // px/s, world (logical) units
const PICKUP_RADIUS = 50; // px, how close the player must be to interact-pick-up a waiting arrival

// Circle-vs-axis-aligned-rect overlap test, used by findPath's `collides` callback.
function circleRectOverlap(cx, cy, r, rect) {
  const nx = Phaser.Math.Clamp(cx, rect.x, rect.x + rect.w);
  const ny = Phaser.Math.Clamp(cy, rect.y, rect.y + rect.h);
  return Phaser.Math.Distance.Between(cx, cy, nx, ny) < r;
}

// Main gameplay scene: draws the kennel building + outside strip from
// data/sections.js, and drives the player around it. Phase B (animals,
// arrivals, cages) hangs off the same section rects — nothing here is
// hardcoded beyond them.
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

    this._drawWorld();
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
    this._staySprites = new Map(); // stay -> { sprite, tag:{bg,text}, extras:[...] }
    this.carrying = null;          // the stay currently in the player's hands, or null
    this._carryVisual = null;      // { obj } following the player while carrying

    this.game.events.on(EVENTS.HOUR_CHANGE, this._onHourChange, this);
    this.events.once('shutdown', () => this.game.events.off(EVENTS.HOUR_CHANGE, this._onHourChange, this));

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

  _buildCollision() {
    // Every rect a body can't walk through — feeds both the arcade static
    // colliders below and findPath's obstacle-aware routing.
    this.obstacleRects = [
      ...wallRects(),
      ...SECTIONS.flatMap((s) => penRects(s)),
      RECEPTION.desk,
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

    const extras = [];
    let cx = x + sprite.width * 0.55;
    if (animal.hasEggs) {
      for (let i = 0; i < animal.eggCount; i++) {
        extras.push(this.add.image(cx, y - 1, EGG_KEY).setOrigin(0.5, 1).setDepth(y - 1));
        cx += 10;
      }
    }
    for (const baby of stay.companions) {
      const babyKey = animalTextureKey(baby.species, 'baby', baby.colorVariant);
      extras.push(this.add.image(cx, y, babyKey).setOrigin(0.5, 1).setDepth(y));
      cx += 14;
    }

    this._staySprites.set(stay, { pos: { x, y }, sprite, tag, extras });
  }

  _destroyStaySprites(stay) {
    const rec = this._staySprites.get(stay);
    if (!rec) return;
    rec.sprite.destroy();
    rec.tag.bg.destroy();
    rec.tag.text.destroy();
    rec.extras.forEach((e) => e.destroy());
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

  // ── Carrying (issue #5) ──────────────────────────────────────────────────
  // Press interact near a waiting reception arrival to pick it up; the carry
  // prop (leash/cage/box/basket — or the bare animal for the small pets) then
  // follows the player. Walking into the animal's own section auto-drops it off
  // — simpler for a kid player than requiring a second interact press.

  _checkPickup() {
    if (!this.controls.interactJustDown()) return;
    let nearest = null, nearestD = Infinity;
    for (const stay of this.roster.stays) {
      if (stay.location !== LOCATION.RECEPTION) continue;
      const rec = this._staySprites.get(stay);
      if (!rec) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, rec.pos.x, rec.pos.y);
      if (d < PICKUP_RADIUS && d < nearestD) { nearest = stay; nearestD = d; }
    }
    if (nearest) this._pickUp(nearest);
  }

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
    const already = this.roster.stays.filter((s) => s !== stay && s.location === section.key).length;
    const pos = this._sectionSlot(section, already);
    this._renderStay(stay, pos.x, pos.y);
  }

  // Simple wrapping grid of standing spots inside a section's rect, indexed by
  // how many other stays are already placed there — good enough for a handful
  // of animals per section without needing real cage furniture yet.
  _sectionSlot(section, index) {
    const { x, y, w, h } = section.rect;
    const margin = 30;
    const cols = Math.max(1, Math.floor((w - margin * 2) / 60));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: x + margin + col * 60,
      y: Math.min(y + h - margin, y + margin + 40 + row * 46),
    };
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
    this.player.setDepth(this.player.y);

    if (this.carrying) {
      this._followCarry();
      this._checkDropoff();
    } else {
      this._checkPickup();
    }
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
