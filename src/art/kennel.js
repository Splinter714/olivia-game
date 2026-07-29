// Procedural textures for the kennel building — cozy flat pixel-art tiles,
// generated once at scene start via the shared `gen()` helper and stretched
// over the layout rects from data/sections.js with TileSprites.
import { gen } from './_gen.js';

const TILE = 32;

// A soft 2x2 checker in the section's two floor colours — reads as a clean tile
// floor at a glance without needing real per-pixel texture detail.
export function buildFloorTile(scene, key, colorA, colorB) {
  gen(scene, key, TILE, TILE, (g) => {
    g.fillStyle(colorA, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(colorB, 1)
      .fillRect(0, 0, TILE / 2, TILE / 2)
      .fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2);
  });
}

// Warm wood-plank floor for the reception rug/mat area.
export function buildWoodTile(scene, key) {
  gen(scene, key, TILE, TILE, (g) => {
    g.fillStyle(0xc79a63, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0xb98950, 1).fillRect(0, TILE / 2 - 1, TILE, 2);
  });
}

// Sandy-tan wall texture with a faint plank line — used for both the outer
// building walls and the thin pen-walls between sections.
export function buildWallTile(scene, key) {
  gen(scene, key, TILE, TILE, (g) => {
    g.fillStyle(0xd8c9a3, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0xc7b78e, 1).fillRect(0, TILE - 3, TILE, 3);
  });
}

// White picket-fence tile for the outside grass strip's boundary.
export function buildFenceTile(scene, key) {
  gen(scene, key, TILE, TILE, (g) => {
    g.fillStyle(0xffffff, 1).fillRect(TILE * 0.15, 0, TILE * 0.2, TILE);
    g.fillStyle(0xffffff, 1).fillRect(TILE * 0.6, 0, TILE * 0.2, TILE);
    g.fillStyle(0xd9d9d9, 1).fillRect(0, TILE * 0.4, TILE, TILE * 0.15);
  });
}

// Grass tile for the outside strip.
export function buildGrassTile(scene, key) {
  gen(scene, key, TILE, TILE, (g) => {
    g.fillStyle(0x7cbf6a, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x72b360, 1).fillRect(4, 6, 3, 3).fillRect(20, 18, 3, 3).fillRect(12, 24, 3, 3);
  });
}

export function buildKennelTextures(scene) {
  buildWoodTile(scene, 'tile-wood');
  buildWallTile(scene, 'tile-wall');
  buildFenceTile(scene, 'tile-fence');
  buildGrassTile(scene, 'tile-grass');
}
