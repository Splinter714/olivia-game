// Drawing the world, placing every prop, and keeping the cage furniture in
// sync with who's actually living there.
//
// These belong together because `_buildProps()` is the ONLY place that creates
// this._cageImgs / _cageFgImgs / _bowlImgs / _waterBowlImgs / _litterImgs /
// _cagePlates / _cageEggs / _yardBowlImgs, and the refresh methods below are
// the only things that mutate them. Splitting the creator from the mutators
// would turn eight fields into a cross-file contract for no gain.
//
// Deliberately NOT in here — and this is the important part:
//  * There is NO buildWorld(). create() calls `_drawWorld()`, `_buildProps()`,
//    `_buildCollision()` and `_setYardDoor()` early, then builds this.roster
//    and this.night, and only THEN calls `_refreshCageArt()`. That ordering is
//    load-bearing (see _buildProps' own note about this.roster not existing
//    yet), so every call site stays exactly where it already was rather than
//    being batched behind one build method.
//  * Collision and the yard gate (`_buildCollision`, `_setYardDoor`,
//    `_toggleYardDoor`). The gate's IMAGE is created in _buildProps like any
//    other prop, but opening/closing it rewrites the obstacle list, which is
//    movement, not art.
//  * Filling bowls and resolving needs (`_fillBowl`, `_fillYardBowl`,
//    `_autoResolveYardBowls`). Those are needs/economy policy; only the
//    re-texturing that follows them lives here.
//
// Split out of KennelScene.js as a pure move (issue #83) — every method body
// below is byte-for-byte what it was in that file.
import {
  WALL, ROOM, OUTSIDE, BACK_DOOR, FRONT_DOOR, RECEPTION,
  BACK_WING, STAFF_DOOR, WING_DOOR, STORAGE_ROOM, HOUSE_ROOM,
  wallRects, backWingWallRects, outsideFenceRects,
} from '../../data/sections.js';
import {
  BOWL_SPOTS, WATER_BOWL_SPOTS, COMPUTER_SPOT,
  OVEN_SPOT, STORAGE_PROPS, BED_SPOT,
  CAGES, LITTER_SPOTS, YARD_BOWL_SPOTS,
  cageEggSpot, cagePlateSpot, CAGE_EGG_SPACING,
  YARD_DOOR, POND_SPOT, POND_RECT,
} from '../../data/props.js';
import { LOCATION } from '../../data/roster.js';
import { EGG_KEY } from '../../art/animals.js';
import {
  LITTER_BOX_KEY,
  BOWL_KEY, BOWL_KEY_BY_SPECIES, BOWL_EMPTY_KEY, BOWL_EMPTY_KEY_BY_SPECIES,
  WATER_BOWL_KEY, WATER_BOWL_EMPTY_KEY,
  NEED_KEY, COMPUTER_KEY, CAGE_KEY, CAGE_FG_KEY, EMPTY_CAGE_KEY,
  OVEN_KEY, SHELF_KEY, BOX_KEY, BAG_KEY, BED_KEY,
  YARD_DOOR_CLOSED_KEY, POND_KEY,
} from '../../art/props.js';

export const WithWorld = (Base) => class extends Base {
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
    this._litterImgs = CAGES.map(() => null);
    const hallScene = this;
    CAGES.forEach((_, i) => {
      this._devRegistry.push({ name: `LITTER_SPOTS.${i}`, get obj() { return hallScene._litterImgs[i]; } });
    });

    // Cage-owned nameplates (issue #64) and clutches of eggs (issue #57).
    // Both used to be drawn as part of the ANIMAL — created inside
    // _renderStay and stored on her sprite record — which is exactly why the
    // plate vanished the moment she was picked up (_destroyStaySprites tears
    // that record down) and why a mom's eggs travelled out to the play yard
    // with her. They're cage FURNITURE now, on the same occupancy-driven
    // create/destroy pattern as the bowls and litter boxes above: keyed by
    // cage index and refreshed from _cageOccupant, the same occupancy rule
    // the rest of the cage furniture already uses — which
    // deliberately still counts a stay who's out in the yard, mid-walk, or in
    // the player's hands as this cage's occupant.
    this._cagePlates = CAGES.map(() => null);
    this._cageEggs = CAGES.map(() => null);

    // One bowl per individual cage slot (issue #22 #6), refined by owner note
    // 2026-07-29: bowls don't exist until an animal is actually settled in
    // that cage. No sprite is created here — this._bowlImgs just tracks the
    // (initially empty) per-slot sprite so _refreshBowls can create/destroy/
    // re-skin it as occupancy changes (see that method for the full story).
    // Issue #71: one entry per physical cage, no per-species key list.
    this._bowlImgs = BOWL_SPOTS.map(() => null);
    this._waterBowlImgs = WATER_BOWL_SPOTS.map(() => null);
    const scopedScene = this;
    BOWL_SPOTS.forEach((spot, i) => {
      // Live getter since the actual sprite is created/destroyed
      // dynamically, not fixed at build time.
      this._devRegistry.push({ name: `BOWL_SPOTS.${i}`, get obj() { return scopedScene._bowlImgs[i]; } });
      this._devRegistry.push({ name: `WATER_BOWL_SPOTS.${i}`, get obj() { return scopedScene._waterBowlImgs[i]; } });
    });
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

    // Issue #77: the yard's one shared pond — a fixed, always-there piece of
    // ground art (like the yard bowls above), not occupancy-gated. Every
    // fish "out playing" lives somewhere on/around this same spot; see
    // POND_SPOT/POND_RECT (data/props.js) and _refreshTravelTank below.
    this.add.image(POND_SPOT.x, POND_SPOT.y, POND_KEY).setOrigin(0.5, 0.5).setDepth(POND_RECT.y);

    // Issue #55: the gate in the east wall's BACK_DOOR gap. One image whose
    // texture/position/depth are swapped by _setYardDoor (called from create()
    // once the saved state is known), so its open/closed state reads at a
    // glance without a second sprite to keep in sync.
    this._yardDoorImg = this.add.image(YARD_DOOR.x, YARD_DOOR.y, YARD_DOOR_CLOSED_KEY)
      .setOrigin(0, 0).setDepth(YARD_DOOR.y + YARD_DOOR.h + 4);
    this._devRegistry.push({ name: 'YARD_DOOR', obj: this._yardDoorImg });

    // Reception computer (issue #10) — baby-announcement messages to owners.
    const computer = this.add.image(COMPUTER_SPOT.x, COMPUTER_SPOT.y, COMPUTER_KEY).setOrigin(0.5, 1).setDepth(COMPUTER_SPOT.y);
    this._devRegistry.push({ name: 'COMPUTER_SPOT', obj: computer });

    // Individual cages (issue #18, single grid as of issue #32, a flat pool
    // of 48 as of issue #71). Keep a handle on each cage's image
    // (this._cageImgs) so _refreshCageArt can re-texture it per-occupant —
    // turtles/snakes as islands/perches (issue #20), the secret dragon's
    // little stone castle (issue #32 #5) — without touching its position.
    //
    // Issue #43 (owner: "z order of cage bars should be above everything
    // else in the cage, including the animal") — TWO images per cage slot
    // now: the background half at the same low depth as before (behind the
    // animal), and a foreground half (this._cageFgImgs) at a depth ABOVE the
    // animal, her bowls (whose depth is cage.y + cage.h + 1, see
    // _refreshBowls), and her blanket — see the depth chosen below.
    this._cageImgs = [];
    this._cageFgImgs = [];
    CAGES.forEach((cage, i) => {
      // An empty cage has no occupant to take a look from, so it starts on
      // the shared empty-slot texture; _refreshCageArt swaps in the
      // occupant's own species look the moment someone is assigned here.
      const img = this.add.image(cage.x, cage.y, EMPTY_CAGE_KEY).setOrigin(0, 0).setDepth(cage.y - 2);
      this._devRegistry.push({ name: `CAGES.${i}`, obj: img });
      this._cageImgs.push(img);
      // Foreground depth: cage.y + cage.h + 5 comfortably clears every
      // in-cage occupant depth (the animal's own wander-clamped depth tops
      // out at cage.y + cage.h - 4, her bowls sit at cage.y + cage.h + 1,
      // her blanket at that bowl-adjacent depth + 0.3) while staying well
      // below the next grid row's own contents (issue #71 put a 52px aisle
      // between rows, i.e. +152, so +5 never bleeds into the row below).
      // Starts hidden — an empty cage has no foreground look at all (see
      // EMPTY_CAGE_KEY's comment in art/props.js).
      const fgImg = this.add.image(cage.x, cage.y, EMPTY_CAGE_KEY).setOrigin(0, 0)
        .setDepth(cage.y + cage.h + 5).setVisible(false);
      this._devRegistry.push({ name: `CAGES_FG.${i}`, obj: fgImg });
      this._cageFgImgs.push(fgImg);
    });

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
    this._cageImgs.forEach((img, i) => {
      // Bug fix (owner note 2026-07-29: "keep it visually occupied if it's
      // occupied"): occupancy deliberately still counts a stay who's out
      // playing in the yard, mid-walk, or in the player's hands — the cage is
      // hers the whole time. It used to flip back to "empty" the instant she
      // went out to play, even though dropping a new animal there was
      // correctly rejected as full, which is confusing when it LOOKS open.
      // _cageOccupant is the one occupancy rule everything here shares.
      const occupant = this._cageOccupant(i);
      const texKey = occupant ? (CAGE_KEY[occupant.animal.species] ?? EMPTY_CAGE_KEY) : EMPTY_CAGE_KEY;
      const changed = img.texture.key !== texKey;
      if (changed) img.setTexture(texKey);
      if (changed) this._snapCagePop(img);

      const fgImg = this._cageFgImgs[i];
      const fgTexKey = occupant ? CAGE_FG_KEY[occupant.animal.species] : null;
      if (fgTexKey) {
        const fgChanged = !fgImg.visible || fgImg.texture.key !== fgTexKey;
        if (fgChanged) fgImg.setTexture(fgTexKey).setVisible(true);
        if (fgChanged) this._snapCagePop(fgImg);
      } else if (fgImg.visible) {
        fgImg.setVisible(false);
      }
    });
    this._refreshCageFurniture();
  }

  // Everything a cage owns that depends on WHO lives there rather than on
  // where that animal happens to be standing right now: her bowls, her litter
  // box, her nameplate (issue #64) and her clutch of eggs (issue #57).
  _refreshCageFurniture() {
    this._refreshBowls();
    this._refreshLitterBoxes();
    this._refreshCagePlates();
    this._refreshCageEggs();
  }

  // Issue #64 (owner: "name tag should remain on an assigned cage no matter
  // what. Even if they just arrived or if they're currently held").
  //
  // The plate was already anchored to the right place — issue #42 mounts it
  // top-center on her own cage rather than over her body — but it was created
  // inside _renderStay and stored on her sprite record, so its LIFETIME was
  // the animal's, not the cage's: _pickUp calls _destroyStaySprites, and the
  // plate went with it. Same occupancy-refresh treatment as the bowls/litter
  // box fixes that at the root, and the occupancy rule (_cageOccupant) is what
  // makes it survive every state the issue names — freshly checked in and
  // still being walked over by her owner, out playing in the yard, walking
  // somewhere, or held.
  _refreshCagePlates() {
    if (!this._cagePlates || !this.roster) return;
    this._cagePlates.forEach((existing, i) => {
      const occupant = this._cageOccupant(i);
      if (!occupant) {
        existing?.container.destroy();
        this._cagePlates[i] = null;
        return;
      }
      // Issue #73: the plate of a pet currently in the player's hands is
      // highlighted, so "which cage does this one live in?" is answerable at
      // a glance while carrying her across the room.
      const held = occupant.location === LOCATION.CARRYING;
      // Names can change under us (a baby named via the reception computer
      // never owns a cage, but a returning guest's record is reused), so
      // the plate is rebuilt only when what it shows is actually stale.
      if (existing && existing.shownName === occupant.animal.name && existing.held === held) return;
      existing?.container.destroy();
      const spot = cagePlateSpot(CAGES[i]);
      const plate = this._addNameTag(spot.x, spot.y, occupant.animal.name, { highlight: held });
      plate.shownName = occupant.animal.name;
      plate.held = held;
      // A door plate is always readable — the proximity gate
      // (_updateNameTagVisibility) only ever applied to a tag floating
      // above an animal out in the open.
      plate.container.setVisible(true);
      this._cagePlates[i] = plate;
    });
  }

  // Issue #57 (owner: "mamas with eggs — the eggs should not move with them
  // to the play area, they should stay in their cage"), plus the owner's
  // correction on the open question: "I meant she's allowed to go outside
  // still." So she CAN go out; the clutch simply waits at home.
  //
  // That has a consequence the correction spells out: the "ready to hatch"
  // heart and the hatch interaction have to live with the EGGS, not with
  // mom — otherwise a clutch that came due while she was out in the yard
  // would show its icon out there in the grass, and hatching would happen
  // nowhere near the eggs. So the heart is drawn here too, as part of the
  // clutch, and _resolveAct targets this same spot (see _eggCageSpot).
  _refreshCageEggs() {
    if (!this._cageEggs || !this.roster) return;
    this._cageEggs.forEach((existing, i) => {
      const occupant = this._cageOccupant(i);
      const count = occupant?.animal.hasEggs ? (occupant.animal.eggCount || 0) : 0;
      const heart = !!(count && occupant.birthReady);
      if (existing && existing.count === count && existing.heart === heart) return;
      existing?.objs.forEach((o) => o.destroy());
      if (!count) {
        this._cageEggs[i] = null;
        return;
      }
      const spot = cageEggSpot(CAGES[i]);
      const objs = [];
      const startX = spot.x - ((count - 1) * CAGE_EGG_SPACING) / 2;
      for (let e = 0; e < count; e++) {
        const ex = startX + e * CAGE_EGG_SPACING;
        const ey = spot.y + (e % 2 ? 3 : -3); // a slightly uneven nest, not a straight line
        objs.push(this.add.image(ex, ey, EGG_KEY).setOrigin(0.5, 1).setDepth(ey));
      }
      if (heart) {
        objs.push(this.add.image(spot.x, spot.y - 16, NEED_KEY.babies).setOrigin(0.5, 1).setDepth(9002));
      }
      this._cageEggs[i] = { count, heart, objs };
      objs.forEach((o) => this._snapCagePop(o));
    });
  }

  // The clutch's world spot for a stay whose eggs live in a cage, or null if
  // she has no eggs / no cage of her own (a pre-#54 restored save). This is
  // both where _refreshCageEggs drew them and where the hatch interaction and
  // its heart icon belong — see _resolveAct / _setNeedIcon.
  _eggCageSpot(stay) {
    if (!stay.animal.hasEggs) return null;
    const cage = CAGES[stay.cageIndex];
    return cage ? cageEggSpot(cage) : null;
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
  //     fix #1 shipped): bowl bookkeeping was a hand-kept list of species
  //     keys, and a stay's nominal cage key had nothing to do with her real
  //     species — "any pet, any open cage" placement could put a bird in what
  //     used to be the 'turtle' key's slot, and 'turtle' was missing from the
  //     list (turtles were fed via a shared tank back then). Whoever landed
  //     there got no bowl sprite AT ALL, which is why it looked random by
  //     species. Issue #71 removed the per-species cage identity entirely, so
  //     there is no list left to forget: one bowl per physical cage.
  _refreshBowls() {
    if (!this._bowlImgs || !this.roster) return;
    this._bowlImgs.forEach((existing, i) => {
      const occupant = this._cageOccupant(i);
      if (!occupant) {
        existing?.destroy();
        this._bowlImgs[i] = null;
        return;
      }
      const stocked = !!occupant.bowl?.food;
      const texKey = stocked
        ? (BOWL_KEY_BY_SPECIES[occupant.animal.species] ?? BOWL_KEY)
        : (BOWL_EMPTY_KEY_BY_SPECIES[occupant.animal.species] ?? BOWL_EMPTY_KEY);
      const { x, y } = BOWL_SPOTS[i];
      const depth = CAGES[i].y + CAGES[i].h + 1;
      // Skip only if already showing the right bowl in the right place.
      if (existing && existing.texture.key === texKey && existing.x === x && existing.y === y) return;
      existing?.destroy();
      const bowl = this.add.image(x, y, texKey).setOrigin(0.5, 1).setDepth(depth);
      this._bowlImgs[i] = bowl;
      this._snapCagePop(bowl);
    });
    this._waterBowlImgs.forEach((existing, i) => {
      const occupant = this._cageOccupant(i);
      if (!occupant) {
        existing?.destroy();
        this._waterBowlImgs[i] = null;
        return;
      }
      const stocked = !!occupant.bowl?.water;
      const texKey = stocked ? WATER_BOWL_KEY : WATER_BOWL_EMPTY_KEY;
      const { x, y } = WATER_BOWL_SPOTS[i];
      const depth = CAGES[i].y + CAGES[i].h + 1;
      if (existing && existing.texture.key === texKey && existing.x === x && existing.y === y) return;
      existing?.destroy();
      const bowl = this.add.image(x, y, texKey).setOrigin(0.5, 1).setDepth(depth);
      this._waterBowlImgs[i] = bowl;
      this._snapCagePop(bowl);
    });
  }

  // Per-cage litter box (owner note 2026-07-29: "each cat cage should have a
  // small litter box, not a corner everyone litter box") — mirrors
  // _refreshBowls exactly: exists only while the cage is occupied, and only
  // when the occupant is specifically a cat (any other species in that cage
  // means no litter box there). A cat can settle in ANY cage, so every cage
  // is checked.
  _refreshLitterBoxes() {
    if (!this._litterImgs || !this.roster) return;
    this._litterImgs.forEach((existing, i) => {
      const occupant = this._cageOccupant(i);
      if (occupant?.animal.species !== 'cat') {
        existing?.destroy();
        this._litterImgs[i] = null;
        return;
      }
      const { x, y } = LITTER_SPOTS[i];
      if (existing && existing.x === x && existing.y === y) return;
      existing?.destroy();
      const box = this.add.image(x, y, LITTER_BOX_KEY).setOrigin(0.5, 1).setDepth(y - 1);
      this._litterImgs[i] = box;
      this._snapCagePop(box);
    });
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

  _refreshYardBowls() {
    this._yardBowlImgs.food.setTexture(this.yardBowls.food ? BOWL_KEY : BOWL_EMPTY_KEY);
    this._yardBowlImgs.water.setTexture(this.yardBowls.water ? WATER_BOWL_KEY : WATER_BOWL_EMPTY_KEY);
  }
}
