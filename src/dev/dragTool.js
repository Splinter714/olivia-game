// Dev tool: drag placed world objects live, then export their new coordinates.
//
// Ported from the horse game's src/scenes/paddock/devDrag.js, trimmed way down
// for this project's current scale (no fences/splines). The owner's own
// description of the workflow: toggle it on, drag placed objects around by
// hand until they look right, read the {x, y} off the export panel, hand-
// paste it into the real source data files (src/data/props.js / sections.js).
// This tool never edits those files itself.
//
// Two deliberate constraints, same spirit as the horse game's version:
//
//   1. SESSION-ONLY. Nothing here writes to localStorage. A page reload puts
//      every object back exactly where the source code says it goes — this is
//      a ruler, not a level editor. Named GROUPS (see devGroups.js) are the
//      one thing that survives an F9 toggle off/on, but even those live only
//      in memory for the current page load.
//   2. The draggable-object list is NOT hand-maintained here. It comes from
//      `scene._devDragTargets()` (defined on KennelScene, populated once from
//      `_buildProps()`/`_drawWorld()`), so this tool and the world's actual
//      prop-placement code can never drift apart.
//
// Two kinds of registry entry:
//   - 'prop' (the default): a real placed Phaser Image/Sprite — bowls, tanks,
//     cages, etc. Dragging it visibly moves the actual gameplay object.
//   - 'area': a per-SECTION handle standing in for `SECTIONS[i].rect`, which
//     is drawn as Graphics fills (not a movable Image), so there's nothing to
//     literally drag. The handle's `obj` here is a plain `{x, y}` — no
//     texture, no visible footprint of its own when the tool is off — and its
//     moved position exports the same way as everything else: a new
//     rect.x/rect.y to hand-paste into sections.js. While it's being dragged,
//     a translucent preview rect (sized to the section's real w/h) is drawn
//     so the owner can see where the area WOULD land, without this tool
//     actually re-rendering the real floor/wall Graphics live (more work than
//     a ruler needs — see constraint 1 above).
//
// Multi-select + grouping (devGroups.js's WithDevGroups, mixed in below):
// tapping an object toggles it into a session-only multi-select; dragging any
// selected member moves the whole selection together, preserving relative
// offsets. A selection can be promoted into a named group (⛓ Group) so e.g.
// "these three bowls plus their section's area handle" is one handle for the
// rest of the session, without re-selecting them every time.
//
// Toggle: F9 (see _updateDevDragToggle, polled once per frame from update()).
// While on, mouse/touch tap-to-move is suspended (Controls.setSuspended) so a
// pointer drag here can't also walk the player around; keyboard/gamepad
// movement keeps working. Turning it off restores normal pointer controls.
//
// Export goes to three places at once, same as the horse game: console.log,
// clipboard (best-effort), and an on-screen text panel — the panel matters
// most since the owner sometimes plays on an iPad with no devtools console.
import Phaser from 'phaser';
import { dprOf, logicalW, logicalH, worldUiOffset } from '../uiUtils.js';
import { EVENTS } from '../data/events.js';
import { WithDevGroups } from './devGroups.js';

const PICK_R = 40;    // world px: how close a tap must be to grab an object
const TAP_SLOP = 6;   // world px of travel before a press counts as a drag, not a tap
const MARK_DEPTH = 10010;
const UI_DEPTH = 10020; // above tintGfx (9999) / sleepGfx (10000) so it reads at any time of day
const BTN_X = 8;
const BTN_Y = 64;
const BTN_H = 30;
const N_BTNS = 4; // export, reset, group, clear — used to place the panel below all of them

export const WithDevDrag = (Base) => class extends WithDevGroups(Base) {
  // Called once from create(), after this.controls exists.
  buildDevDrag() {
    this._dragOn = false;
    this._dragEntries = null;  // [{ name, obj, ox, oy, kind, rectSize }] snapshot, mount-time
    this._dragHeld = null;     // the entry currently under the finger, or null
    this._dragMoveSet = null;  // every entry moving together with _dragHeld this drag (group/multi-select)
    this._dragMoved = false;   // has this press travelled past TAP_SLOP?
    this._dragMarks = null;
    this._dragBtns = [];
    this._dragHud = null;
    this._dragPanel = null;
    this._devKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F9);
  }

  // Poll once per frame from update() — works regardless of whatever else is
  // going on (carrying an animal, night, etc.), since it's just a key edge.
  _updateDevDragToggle() {
    if (Phaser.Input.Keyboard.JustDown(this._devKey)) this.toggleDevDrag();
  }

  toggleDevDrag() {
    this._dragOn = !this._dragOn;
    if (this._dragOn) this._mountDevDrag();
    else this._clearDevDrag();
  }

  _mountDevDrag() {
    this._snapshotDragEntries();
    this.initDevSelection(); // devGroups.js — resets the multi-select; groups carry over across F9 toggles

    this._dragMarks = this.add.graphics().setScrollFactor(1).setDepth(MARK_DEPTH);
    this._drawDevDragMarks();

    const o = worldUiOffset(this);
    this._dragHud = this.add.text(BTN_X + o.x, BTN_Y - 18 + o.y,
      'Dev drag ON — tap to select, drag to move (F9 to exit)', {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '11px', color: '#bfe4ff', backgroundColor: '#0d1020cc',
        padding: { x: 4, y: 2 },
      }).setOrigin(0, 1).setScrollFactor(0).setDepth(UI_DEPTH).setResolution(dprOf(this));

    this._addDevDragBtn('export', '📋 Export positions', BTN_Y);
    this._addDevDragBtn('reset', '↺ Reset to source', BTN_Y + BTN_H + 6);
    this._addDevDragBtn('group', '⛓ Group', BTN_Y + (BTN_H + 6) * 2);
    this._addDevDragBtn('clear', '✖ Clear selection', BTN_Y + (BTN_H + 6) * 3);
    this._devDragSyncBtns();

    this.input.on('pointerdown', this._devDragTap, this);
    this.input.on('pointermove', this._devDragMove, this);
    this.input.on('pointerup', this._devDragDrop, this);
    this.input.on('pointerupoutside', this._devDragDrop, this);

    // Suspend normal tap-to-move/touch-stick input so a drag here can't also
    // walk the player; keyboard/gamepad movement (read directly in getMove())
    // is untouched.
    this.controls?.setSuspended?.(true);
    this.game.events.emit(EVENTS.NOTIFY, 'Dev drag mode ON (F9 to exit)');
  }

  _clearDevDrag() {
    this.input.off('pointerdown', this._devDragTap, this);
    this.input.off('pointermove', this._devDragMove, this);
    this.input.off('pointerup', this._devDragDrop, this);
    this.input.off('pointerupoutside', this._devDragDrop, this);
    this._dragMarks?.destroy();
    this._dragHud?.destroy();
    this._dragPanel?.destroy();
    for (const b of this._dragBtns) b.txt.destroy();
    this._dragMarks = null;
    this._dragHud = null;
    this._dragPanel = null;
    this._dragBtns = [];
    this._dragEntries = null;
    this._dragHeld = null;
    this._dragMoveSet = null;
    this._dragMoved = false;
    this._dragSel = null;
    // `_dragGroups` deliberately NOT cleared here — groups persist across an
    // F9 off/on within the same page load (see file header + devGroups.js).
    this.controls?.setSuspended?.(false);
    this.game.events.emit(EVENTS.NOTIFY, 'Dev drag mode OFF');
  }

  // Snapshot every registered object AND where it started, so "moved" is
  // knowable and a reset is possible without reloading. `kind`/`rectSize`
  // carry through from `_devDragTargets()` for the area handles (devGroups.js
  // and the marker/preview drawing below don't otherwise touch Phaser).
  _snapshotDragEntries() {
    this._dragEntries = (this._devDragTargets?.() ?? [])
      .filter((t) => t.obj)
      .map((t) => ({
        name: t.name, obj: t.obj, ox: t.obj.x, oy: t.obj.y,
        kind: t.kind ?? 'prop', rectSize: t.rectSize ?? null,
      }));
  }

  _addDevDragBtn(id, label, y) {
    const o = worldUiOffset(this);
    const txt = this.add.text(BTN_X + o.x, y + o.y, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px', color: '#ffe9a8', backgroundColor: '#242a44ee',
      padding: { x: 8, y: 6 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH).setResolution(dprOf(this));
    this._dragBtns.push({ id, txt, x: BTN_X, y, w: txt.width, h: txt.height });
  }

  // The group/clear buttons re-label themselves from the current selection,
  // so one button covers both "make a group of these" and "dissolve this
  // group" (the latter only offered when the selection IS exactly an
  // existing group — otherwise it'd be ambiguous what's being dissolved).
  _devDragSyncBtns() {
    const n = this._dragSel?.size ?? 0;
    const grp = this._devSelGroup?.() ?? null;
    for (const b of this._dragBtns) {
      const label =
        b.id === 'group' ? (grp ? `✂ Ungroup ${grp.name}` : n >= 2 ? `⛓ Group these ${n}` : '⛓ Group (select 2+)')
        : b.id === 'clear' ? (n ? `✖ Clear selection (${n})` : '✖ Clear selection')
        : null;
      if (label === null || b.txt.text === label) continue;
      b.txt.setText(label);
      b.w = b.txt.width; b.h = b.txt.height;
    }
  }

  _devDragHitBtn(lpx, lpy) {
    for (const b of this._dragBtns) {
      if (lpx >= b.x && lpx <= b.x + b.w && lpy >= b.y && lpy <= b.y + b.h) return b.id;
    }
    return null;
  }

  // ─── Picking / dragging ────────────────────────────────────────────────
  _devDragTap(pointer) {
    if (!this._dragEntries || pointer.button !== 0) return;
    const dpr = dprOf(this);
    const lpx = pointer.x / dpr, lpy = pointer.y / dpr;

    const btn = this._devDragHitBtn(lpx, lpy);
    if (btn === 'export') { this.exportDevPositions(); return; }
    if (btn === 'reset') { this.resetDevPositions(); return; }
    if (btn === 'group') { this.toggleDevGroup(); return; }
    if (btn === 'clear') { this.clearDevSelection(); return; }
    if (this._dragPanel) { this._dragPanel.destroy(); this._dragPanel = null; }

    const w = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let best = null, bestD = PICK_R;
    for (const e of this._dragEntries) {
      const d = Math.hypot(e.obj.x - w.x, e.obj.y - w.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    this._dragHeld = best;
    // devGroups.js: a group (or the current selection, if `best` is part of
    // it) moves as one rigid set; otherwise just `best` itself.
    this._dragMoveSet = best ? this._devDragSet(best) : null;
    this._dragMoved = false;
    this._dragPressX = w.x;
    this._dragPressY = w.y;
    if (best) {
      best.gx = w.x - best.obj.x;
      best.gy = w.y - best.obj.y;
    }
    this._devDragHud(best);
  }

  _devDragMove(pointer) {
    const e = this._dragHeld;
    if (!e || !pointer.isDown) return;
    const w = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (!this._dragMoved) {
      if (Math.hypot(w.x - this._dragPressX, w.y - this._dragPressY) < TAP_SLOP) return;
      this._dragMoved = true;
    }
    // Same delta applied to every member of the moving set — a rigid
    // translation, so a group/multi-select keeps its shape.
    const dx = (w.x - e.gx) - e.obj.x, dy = (w.y - e.gy) - e.obj.y;
    for (const m of this._dragMoveSet ?? [e]) this._devDragSetPos(m, m.obj.x + dx, m.obj.y + dy);
    this._devDragHud(e);
    this._drawDevDragMarks();
  }

  _devDragDrop() {
    const e = this._dragHeld;
    if (!e) return;
    // A press that never became a drag is a tap: toggle this object's (or its
    // group's) selection.
    if (!this._dragMoved) this._devSelToggle(e);
    this._dragHeld = null;
    this._dragMoveSet = null;
    this._dragMoved = false;
    this._devDragHud(e);
    this._devDragSyncBtns();
    this._drawDevDragMarks();
  }

  // Moves the object's position, keeping its depth tracking y if it looked
  // like it was doing that already (most props are `.setDepth(y ± const)`).
  // Area handles are plain `{x, y}` objects with no `setPosition`/`setDepth`
  // — this falls through to the plain-property branch for those.
  _devDragSetPos(e, x, y) {
    const obj = e.obj;
    const wasSorted = typeof obj.depth === 'number' && Math.abs(obj.depth - obj.y) < 6;
    if (typeof obj.setPosition === 'function') obj.setPosition(x, y);
    else { obj.x = x; obj.y = y; }
    if (wasSorted && typeof obj.setDepth === 'function') obj.setDepth(y);
  }

  _devDragHud(e) {
    const sel = this._devSelSummary?.() ?? '';
    this._dragHud?.setText(e
      ? `${e.name}  (${Math.round(e.obj.x)}, ${Math.round(e.obj.y)})${sel}`
      : `Dev drag ON — tap to select, drag to move (F9 to exit)${sel}`);
  }

  // Small hollow marker per draggable object — amber untouched, green once
  // moved this session; a cyan ring around whatever's currently selected
  // (multi-select or the one thing mid-drag). Area handles (SECTIONS.*.rect)
  // draw as a hollow diamond instead of the furniture crosshair, so they read
  // as "the whole area" rather than one prop — and while one is part of the
  // active drag, a translucent rect previews where the section would land.
  _drawDevDragMarks() {
    const g = this._dragMarks;
    if (!g || !this._dragEntries) return;
    g.clear();
    const activeSet = this._dragMoved ? (this._dragMoveSet ?? []) : [];
    for (const e of this._dragEntries) {
      const selected = this._dragSel?.has(e) || this._dragHeld === e;
      const moved = Math.round(e.obj.x) !== Math.round(e.ox) || Math.round(e.obj.y) !== Math.round(e.oy);
      const cx = Math.round(e.obj.x), cy = Math.round(e.obj.y);

      if (e.kind === 'area') {
        const R = 13;
        g.lineStyle(2, moved ? 0x7fe08a : 0xff7fd0, e === this._dragHeld ? 1 : 0.85);
        g.beginPath();
        g.moveTo(cx, cy - R); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R); g.lineTo(cx - R, cy);
        g.closePath();
        g.strokePath();
        if (selected) {
          g.lineStyle(1, 0x6fd3ff, 0.95);
          g.strokeRect(cx - R - 5, cy - R - 5, (R + 5) * 2, (R + 5) * 2);
        }
        // Live preview outline, sized to the section's real rect — only while
        // this handle is actually part of the drag in progress.
        if (activeSet.includes(e) && e.rectSize) {
          g.fillStyle(0xff7fd0, 0.16);
          g.fillRect(e.obj.x, e.obj.y, e.rectSize.w, e.rectSize.h);
          g.lineStyle(2, 0xff7fd0, 0.9);
          g.strokeRect(e.obj.x, e.obj.y, e.rectSize.w, e.rectSize.h);
        }
        continue;
      }

      if (selected) {
        g.lineStyle(1, 0x6fd3ff, 0.95);
        g.strokeRect(cx - 10, cy - 10, 20, 20);
      }
      g.lineStyle(1, moved ? 0x7fe08a : 0xffc857, e === this._dragHeld ? 1 : 0.65);
      g.strokeRect(cx - 5, cy - 5, 10, 10);
      g.lineBetween(cx - 9, cy, cx + 9, cy);
      g.lineBetween(cx, cy - 9, cx, cy + 9);
    }
  }

  // The ⛓ button: groups the current selection, or dissolves the group when
  // the selection is exactly one. Session-only (see devGroups.js).
  toggleDevGroup() {
    const existing = this._devSelGroup();
    if (existing) {
      this._devUngroupSelection();
      this._devDragSyncBtns();
      this._drawDevDragMarks();
      this._showDevDragPanel({}, false, `Ungrouped ${existing.name} — its ${existing.members.length} objects move separately again.`);
      return;
    }
    const made = this._devGroupSelection();
    this._devDragSyncBtns();
    this._drawDevDragMarks();
    this._showDevDragPanel({}, false, made
      ? `Grouped ${made.members.length} objects as "${made.name}" — dragging any one now moves them all (for the rest of this session).`
      : 'Select at least 2 objects first (tap each one), then tap ⛓ Group.');
  }

  clearDevSelection() {
    this._devSelClear();
    this._devDragSyncBtns();
    this._devDragHud(null);
    this._drawDevDragMarks();
  }

  // ─── Export / reset ────────────────────────────────────────────────────
  // Everything that's actually moved this session, as `{ name: { x, y } }` —
  // ready to hand-paste over the matching constant in src/data/props.js or
  // src/data/sections.js (area handles export as `SECTIONS.<key>.rect`, a new
  // {x, y} for that section's rect.x/rect.y).
  _devMovedPositions() {
    const out = {};
    for (const e of this._dragEntries ?? []) {
      const x = Math.round(e.obj.x), y = Math.round(e.obj.y);
      if (x === Math.round(e.ox) && y === Math.round(e.oy)) continue;
      out[e.name] = { x, y };
    }
    return out;
  }

  exportDevPositions() {
    const moved = this._devMovedPositions();
    const n = Object.keys(moved).length;
    const json = JSON.stringify(moved, null, 2);
    // eslint-disable-next-line no-console
    console.log('[dev-positions]', n ? json : '(nothing moved)');
    let copied = false;
    try {
      const p = navigator.clipboard?.writeText(json);
      if (p) { copied = true; p.catch(() => {}); }
    } catch { /* clipboard not available — the panel and the log still have it */ }
    this._showDevDragPanel(moved, copied);
    return moved;
  }

  // Puts every registered object back where the source data placed it —
  // useful for comparing before/after without reloading the page.
  resetDevPositions() {
    for (const e of this._dragEntries ?? []) this._devDragSetPos(e, e.ox, e.oy);
    this._dragHeld = null;
    this._dragMoveSet = null;
    this._dragMoved = false;
    this._devDragHud(null);
    this._drawDevDragMarks();
    this._showDevDragPanel({}, false, 'Reset — everything back to its source position.');
  }

  _showDevDragPanel(moved, copied, note) {
    this._dragPanel?.destroy();
    const names = Object.keys(moved);
    const lines = names.length
      ? names.map((k) => `${k}: { x: ${moved[k].x}, y: ${moved[k].y} }`)
      : note ? [] : ['Nothing has been moved yet.'];
    const head = note
      ? [note]
      : [`${names.length} moved${copied ? ' — copied to clipboard' : ''}`,
         'Also logged to the console as [dev-positions]. Tap to dismiss.'];

    const o = worldUiOffset(this);
    this._dragPanel = this.add.text(BTN_X + o.x, BTN_Y + (BTN_H + 6) * N_BTNS + 10 + o.y,
      [...head, '', ...lines].join('\n'), {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '11px', color: '#ffffff', backgroundColor: '#0d1020f2',
        padding: { x: 8, y: 6 }, lineSpacing: 3,
        wordWrap: { width: Math.max(200, logicalW(this) - BTN_X * 2 - 16) },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH).setResolution(dprOf(this));
  }
};
