// Dev tool: drag placed world objects live, then export their new coordinates.
//
// Ported from the horse game's src/scenes/paddock/devDrag.js, trimmed way down
// for this project's current scale (no fences/splines/groups — just one
// object at a time). The owner's own description of the workflow: toggle it
// on, drag placed objects around by hand until they look right, read the
// {x, y} off the export panel, hand-paste it into the real source data files
// (src/data/props.js / sections.js). This tool never edits those files itself.
//
// Two deliberate constraints, same spirit as the horse game's version:
//
//   1. SESSION-ONLY. Nothing here writes to localStorage. A page reload puts
//      every object back exactly where the source code says it goes — this is
//      a ruler, not a level editor.
//   2. The draggable-object list is NOT hand-maintained here. It comes from
//      `scene._devDragTargets()` (defined on KennelScene, populated once from
//      `_buildProps()`), so this tool and the world's actual prop-placement
//      code can never drift apart.
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

const PICK_R = 40;    // world px: how close a tap must be to grab an object
const TAP_SLOP = 6;   // world px of travel before a press counts as a drag, not a tap
const MARK_DEPTH = 10010;
const UI_DEPTH = 10020; // above tintGfx (9999) / sleepGfx (10000) so it reads at any time of day
const BTN_X = 8;
const BTN_Y = 64;
const BTN_H = 30;

export const WithDevDrag = (Base) => class extends Base {
  // Called once from create(), after this.controls exists.
  buildDevDrag() {
    this._dragOn = false;
    this._dragEntries = null;  // [{ name, obj, ox, oy }] snapshot, mount-time
    this._dragHeld = null;     // the entry currently under the finger, or null
    this._dragMoved = false;   // has this press travelled past TAP_SLOP?
    this._dragSelected = null; // the one entry with a highlight ring (tap-to-select)
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
    this._dragSelected = null;

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
    this._dragMoved = false;
    this._dragSelected = null;
    this.controls?.setSuspended?.(false);
    this.game.events.emit(EVENTS.NOTIFY, 'Dev drag mode OFF');
  }

  // Snapshot every registered object AND where it started, so "moved" is
  // knowable and a reset is possible without reloading.
  _snapshotDragEntries() {
    this._dragEntries = (this._devDragTargets?.() ?? [])
      .filter((t) => t.obj)
      .map((t) => ({ name: t.name, obj: t.obj, ox: t.obj.x, oy: t.obj.y }));
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
    if (this._dragPanel) { this._dragPanel.destroy(); this._dragPanel = null; }

    const w = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let best = null, bestD = PICK_R;
    for (const e of this._dragEntries) {
      const d = Math.hypot(e.obj.x - w.x, e.obj.y - w.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    this._dragHeld = best;
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
    this._devDragSetPos(e, w.x - e.gx, w.y - e.gy);
    this._devDragHud(e);
    this._drawDevDragMarks();
  }

  _devDragDrop() {
    const e = this._dragHeld;
    if (!e) return;
    // A press that never became a drag is a tap: toggle this object's selection.
    if (!this._dragMoved) this._dragSelected = this._dragSelected === e ? null : e;
    this._dragHeld = null;
    this._dragMoved = false;
    this._devDragHud(this._dragSelected);
    this._drawDevDragMarks();
  }

  // Moves the object's position, keeping its depth tracking y if it looked
  // like it was doing that already (most props are `.setDepth(y ± const)`).
  _devDragSetPos(e, x, y) {
    const obj = e.obj;
    const wasSorted = typeof obj.depth === 'number' && Math.abs(obj.depth - obj.y) < 6;
    if (typeof obj.setPosition === 'function') obj.setPosition(x, y);
    else { obj.x = x; obj.y = y; }
    if (wasSorted && typeof obj.setDepth === 'function') obj.setDepth(y);
  }

  _devDragHud(e) {
    this._dragHud?.setText(e
      ? `${e.name}  (${Math.round(e.obj.x)}, ${Math.round(e.obj.y)})`
      : 'Dev drag ON — tap to select, drag to move (F9 to exit)');
  }

  // Small hollow marker per draggable object — amber untouched, green once
  // moved this session; a cyan ring around whatever's currently selected.
  _drawDevDragMarks() {
    const g = this._dragMarks;
    if (!g || !this._dragEntries) return;
    g.clear();
    for (const e of this._dragEntries) {
      if (this._dragSelected === e || this._dragHeld === e) {
        g.lineStyle(1, 0x6fd3ff, 0.95);
        g.strokeRect(Math.round(e.obj.x) - 10, Math.round(e.obj.y) - 10, 20, 20);
      }
      const moved = Math.round(e.obj.x) !== Math.round(e.ox) || Math.round(e.obj.y) !== Math.round(e.oy);
      g.lineStyle(1, moved ? 0x7fe08a : 0xffc857, e === this._dragHeld ? 1 : 0.65);
      g.strokeRect(Math.round(e.obj.x) - 5, Math.round(e.obj.y) - 5, 10, 10);
      g.lineBetween(e.obj.x - 9, e.obj.y, e.obj.x + 9, e.obj.y);
      g.lineBetween(e.obj.x, e.obj.y - 9, e.obj.x, e.obj.y + 9);
    }
  }

  // ─── Export / reset ────────────────────────────────────────────────────
  // Everything that's actually moved this session, as `{ name: { x, y } }` —
  // ready to hand-paste over the matching constant in src/data/props.js or
  // src/data/sections.js.
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
    this._dragMoved = false;
    this._devDragHud(this._dragSelected);
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
    this._dragPanel = this.add.text(BTN_X + o.x, BTN_Y + (BTN_H + 6) * 2 + 10 + o.y,
      [...head, '', ...lines].join('\n'), {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '11px', color: '#ffffff', backgroundColor: '#0d1020f2',
        padding: { x: 8, y: 6 }, lineSpacing: 3,
        wordWrap: { width: Math.max(200, logicalW(this) - BTN_X * 2 - 16) },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH).setResolution(dprOf(this));
  }
};
