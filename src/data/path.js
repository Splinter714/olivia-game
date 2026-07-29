// Grid A* pathfinding over a collision callback — pure logic, no Phaser.
// Adapted from the horse game's _findPath: routes plan with a fattened clearance
// so razor-thin gaps get routed around, then the path is string-pulled with the
// real clearance. Returns world-space waypoints (excluding the start), or null
// if the goal is unreachable.
export function findPath(fromX, fromY, toX, toY, opts) {
  const {
    minX, minY, maxX, maxY,
    collides,          // (x, y, r) => bool
    cell = 20,
    clearance = 12,    // body radius used to validate the final path
    planMargin = 6,    // extra planning fat — don't pick slivers
  } = opts;
  const planR = clearance + planMargin;

  const clearLine = (x0, y0, x1, y1, R) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 10));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (collides(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, R)) return false;
    }
    return true;
  };

  // Straight shot? Skip the grid search entirely.
  if (clearLine(fromX, fromY, toX, toY, planR)) return [{ x: toX, y: toY }];

  const cols = Math.floor((maxX - minX) / cell) + 1;
  const rows = Math.floor((maxY - minY) / cell) + 1;
  const N = cols * rows;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wx = (c) => minX + c * cell;
  const wy = (r) => minY + r * cell;
  const toC = (x) => clamp(Math.round((x - minX) / cell), 0, cols - 1);
  const toR = (y) => clamp(Math.round((y - minY) / cell), 0, rows - 1);

  const blocked = new Uint8Array(N);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      blocked[r * cols + c] = collides(wx(c), wy(r), planR) ? 1 : 0;

  const startC = toC(fromX), startR = toR(fromY);
  let goalC = toC(toX), goalR = toR(toY);

  // Snap a blocked goal (e.g. tapping the desk itself) to the nearest free cell.
  if (blocked[goalR * cols + goalC]) {
    let best = -1, bestD = Infinity;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (blocked[r * cols + c]) continue;
        const d = (c - goalC) ** 2 + (r - goalR) ** 2;
        if (d < bestD) { bestD = d; best = r * cols + c; }
      }
    if (best < 0) return null;
    goalC = best % cols; goalR = Math.floor(best / cols);
  }
  const startIdx = startR * cols + startC;
  const goalIdx = goalR * cols + goalC;
  blocked[startIdx] = 0; // never trap the search at the walker's own cell

  const g = new Float64Array(N).fill(Infinity);
  const f = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const h = (c, r) => {
    const dc = Math.abs(c - goalC), dr = Math.abs(r - goalR);
    return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr); // octile
  };
  g[startIdx] = 0;
  f[startIdx] = h(startC, startR);
  const open = new Set([startIdx]);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  let found = false;
  while (open.size) {
    let cur = -1, curF = Infinity;
    for (const idx of open) if (f[idx] < curF) { curF = f[idx]; cur = idx; }
    if (cur === goalIdx) { found = true; break; }
    open.delete(cur);
    const cc = cur % cols, cr = (cur - cc) / cols;
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nidx = nr * cols + nc;
      if (blocked[nidx]) continue;
      // Don't cut across an obstacle corner on diagonal moves.
      if (dc !== 0 && dr !== 0 && (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue;
      const ng = g[cur] + ((dc !== 0 && dr !== 0) ? Math.SQRT2 : 1);
      if (ng < g[nidx]) {
        g[nidx] = ng;
        came[nidx] = cur;
        f[nidx] = ng + h(nc, nr);
        open.add(nidx);
      }
    }
  }
  if (!found) return null;

  // Reconstruct, then string-pull: keep only waypoints we can't see past.
  const cells = [];
  for (let i = goalIdx; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ x: wx(i % cols), y: wy(Math.floor(i / cols)) }));
  pts[0] = { x: fromX, y: fromY };
  const last = pts[pts.length - 1];
  if (clearLine(last.x, last.y, toX, toY, clearance)) pts.push({ x: toX, y: toY });

  const smooth = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    const tail = smooth[smooth.length - 1];
    while (j > i + 1 && !clearLine(tail.x, tail.y, pts[j].x, pts[j].y, clearance)) j--;
    smooth.push(pts[j]);
    i = j;
  }
  smooth.shift(); // drop the current position
  return smooth.length ? smooth : [{ x: toX, y: toY }];
}
