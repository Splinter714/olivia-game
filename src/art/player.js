// Procedural kennel-worker sprite — simple layered shapes, kid-friendly and
// readable at a glance. No frame animation; KennelScene gives it a walk-cycle
// wobble at runtime (squash/stretch + a little bob) driven by its own velocity.
import { gen } from './_gen.js';

export const PLAYER_W = 28;
export const PLAYER_H = 40;

export function buildPlayerTexture(scene, key = 'player') {
  gen(scene, key, PLAYER_W, PLAYER_H, (g) => {
    const cx = PLAYER_W / 2;

    // Shadow-side legs, then the apron-front body, then head + a little cap —
    // drawn back-to-front so nothing needs alpha tricks.
    g.fillStyle(0x3a3f52, 1).fillRoundedRect(cx - 9, PLAYER_H - 12, 7, 12, 2);
    g.fillStyle(0x3a3f52, 1).fillRoundedRect(cx + 2, PLAYER_H - 12, 7, 12, 2);

    g.fillStyle(0x5b7fd6, 1).fillRoundedRect(cx - 11, 14, 22, 20, 6); // shirt
    g.fillStyle(0xf2c96b, 1).fillRoundedRect(cx - 8, 20, 16, 13, 3);  // apron

    g.fillStyle(0xf0c090, 1).fillCircle(cx, 10, 9); // head
    g.fillStyle(0xdd5555, 1).fillRoundedRect(cx - 10, 1, 20, 6, 3); // cap
  });
}
