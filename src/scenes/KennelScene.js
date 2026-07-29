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
import { applyDpr, logicalW, logicalH } from '../uiUtils.js';

const SPEED = 160; // px/s, world (logical) units

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
