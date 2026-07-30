// Dev tool: multi-select + session-only named groups, layered onto the drag
// tool (dragTool.js).
//
// Ported from the horse game's src/scenes/paddock/devGroups.js, trimmed down:
// that version PERSISTS groups to the horse game's save file (loadDevSettings/
// saveDevSettings) so they survive a reload. This project has no save system
// and the drag tool is explicitly session-only (see dragTool.js's header
// comment: "nothing here writes to localStorage, a page reload puts every
// object back exactly where the source code says it goes") — so groups here
// live only in memory on the scene instance. They DO persist across toggling
// the tool off and back on with F9 (same page load), which is the useful
// part of the behaviour; a reload clears them along with every moved
// position, same as everything else this tool touches.
//
// The pure list maths (groupOf/nextGroupName/withGroup/withoutGroups) has no
// Phaser or scene dependency, same shape as the horse game's version, minus
// the localStorage-facing normalizeGroups/load/save calls.

// The group containing `name`, or null. Groups never overlap (see `withGroup`).
export const groupOf = (groups, name) =>
  (groups ?? []).find((g) => g.members.includes(name)) ?? null;

export const nextGroupName = (groups) => {
  let n = (groups ?? []).length + 1;
  const taken = new Set((groups ?? []).map((g) => g.name));
  while (taken.has(`Group ${n}`)) n++;
  return `Group ${n}`;
};

// Add a group of `members`, first pulling those names out of any group they
// were already in — groups stay disjoint, so "which group is this object in"
// always has exactly one answer. A group stripped down to fewer than 2
// members is dropped (a one-object group is just an object).
export function withGroup(groups, members, name) {
  const set = new Set(members);
  const kept = (groups ?? [])
    .map((g) => ({ ...g, members: g.members.filter((m) => !set.has(m)) }))
    .filter((g) => g.members.length >= 2);
  if (set.size < 2) return kept;
  return [...kept, { name: name ?? nextGroupName(kept), members: [...set] }];
}

// Dissolve every group that contains any of `names`.
export function withoutGroups(groups, names) {
  const set = new Set(names);
  return (groups ?? []).filter((g) => !g.members.some((m) => set.has(m)));
}

export const WithDevGroups = (Base) => class extends Base {
  // Called from _mountDevDrag every time the tool toggles on. Resets the
  // session-only multi-select each time; leaves `_dragGroups` alone once it
  // exists so groups survive an F9 off/on within the same page load.
  initDevSelection() {
    this._dragSel = new Set();
    this._dragGroups = this._dragGroups ?? []; // [{ name, members: [entryName] }]
  }

  // Every entry whose name is in `names` (a group can legitimately resolve to
  // fewer entries than it names, if the underlying world changed — nothing
  // here assumes a group's members still all exist).
  _devEntriesNamed(names) {
    const set = new Set(names);
    return (this._dragEntries ?? []).filter((e) => set.has(e.name));
  }

  // What "acting on this entry" actually means: its whole group when it's in
  // one, otherwise just itself.
  _devSelExpand(entry) {
    const g = groupOf(this._dragGroups, entry.name);
    const members = g ? this._devEntriesNamed(g.members) : [];
    return members.length ? members : [entry];
  }

  // The set that a drag starting on `entry` should move: its group, else the
  // current selection when the entry is part of it, else just the entry (so
  // an unselected object can still be nudged alone without wrecking a
  // selection in progress).
  _devDragSet(entry) {
    const members = this._devSelExpand(entry);
    if (members.length > 1) return members;
    if (this._dragSel?.has(entry)) return [...this._dragSel];
    return [entry];
  }

  // Tap toggle. Toggling any member of a group toggles the whole group, which
  // is what makes a group feel like one object.
  _devSelToggle(entry) {
    const set = this._dragSel;
    if (!set) return;
    const members = this._devSelExpand(entry);
    const on = !set.has(entry);
    for (const m of members) { if (on) set.add(m); else set.delete(m); }
  }

  _devSelClear() { this._dragSel?.clear(); }

  _devSelEntries() { return [...(this._dragSel ?? [])]; }

  // The group the current selection exactly is, if any — that's what turns
  // the group button into an "Ungroup" button.
  _devSelGroup() {
    const sel = this._devSelEntries();
    if (!sel.length) return null;
    const g = groupOf(this._dragGroups, sel[0].name);
    if (!g) return null;
    const names = new Set(sel.map((e) => e.name));
    return names.size === g.members.length && g.members.every((m) => names.has(m)) ? g : null;
  }

  // Save the current selection as a new named group. Returns the group, or
  // null when there's nothing to group (fewer than 2 selected).
  _devGroupSelection() {
    const names = [...new Set(this._devSelEntries().map((e) => e.name))];
    if (names.length < 2) return null;
    this._dragGroups = withGroup(this._dragGroups, names);
    return this._dragGroups[this._dragGroups.length - 1];
  }

  // Dissolve whatever group(s) the current selection touches.
  _devUngroupSelection() {
    const names = this._devSelEntries().map((e) => e.name);
    const before = this._dragGroups?.length ?? 0;
    this._dragGroups = withoutGroups(this._dragGroups, names);
    return before - (this._dragGroups?.length ?? 0);
  }

  // One-line readout of what's selected, for the HUD.
  _devSelSummary() {
    const n = this._dragSel?.size ?? 0;
    if (!n) return '';
    const g = this._devSelGroup();
    return g ? `  [${g.name}: ${n} selected]` : `  [${n} selected]`;
  }
};
