// Shared world-space geometry tests — pure logic, no Phaser (same rule as
// data/path.js, and the reason the Phaser.Math calls below are spelled out by
// hand: nothing in src/data/ imports Phaser).
//
// Lives here rather than in either of its callers because it has two, on
// opposite sides of a file boundary: KennelScene's `_buildCollision` (the
// `_collides` callback shared by arcade movement AND findPath routing) and
// its `_walkCollides` (the per-walk variant that ignores the cages holding a
// walk's own endpoints). See issue #83.

// Circle-vs-axis-aligned-rect overlap test, used by findPath's `collides`
// callback.
export function circleRectOverlap(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  return Math.sqrt(dx * dx + dy * dy) < r;
}
