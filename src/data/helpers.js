// Issue #52: three NPC kennel helpers, present from game start. Each just
// needs a fixed, distinct name — not the animal-naming machinery in
// data/names.js (no uniqueness/pool/synthesis concerns for three fixed
// humans) — so these are simply hardcoded, kid-friendly, and matched 1:1
// with art/helper.js's three palette/silhouette variants by array index.
export const HELPER_NAMES = ['Priya', 'Maya', 'Nora'];
