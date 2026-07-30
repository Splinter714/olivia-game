// Procedural owner-NPC sprite (issue #21): a simple person who walks a new
// arrival in through the front door and drops her off at reception. Reuses
// art/player.js's general layered-shapes technique/scale, but with a visibly
// different palette + hair so she doesn't read as a second player character —
// no frame animation needed, she's a brief walk-in/out background moment, not
// a system the player interacts with.
import { gen } from './_gen.js';

export const OWNER_W = 26;
export const OWNER_H = 40;

export function buildOwnerTexture(scene, key = 'owner-npc') {
  gen(scene, key, OWNER_W, OWNER_H, (g) => {
    const cx = OWNER_W / 2;

    // Legs, then a dress/coat body (green — distinct from the player's blue
    // shirt/apron), then head + simple bobbed hair.
    g.fillStyle(0x4a4438, 1).fillRoundedRect(cx - 8, OWNER_H - 12, 6, 12, 2);
    g.fillStyle(0x4a4438, 1).fillRoundedRect(cx + 2, OWNER_H - 12, 6, 12, 2);

    g.fillStyle(0x5f9668, 1).fillRoundedRect(cx - 10, 14, 20, 21, 6); // coat/dress
    g.fillStyle(0x4a7d54, 1).fillRoundedRect(cx - 10, 27, 20, 8, 4);  // hem shading

    g.fillStyle(0xecb98a, 1).fillCircle(cx, 10, 9); // head
    // Simple hair: a rounded cap over the top plus two side locks, distinct
    // from the player's cap silhouette.
    g.fillStyle(0x6b4423, 1).fillRoundedRect(cx - 9, 0, 18, 7, 4);
    g.fillStyle(0x6b4423, 1).fillRoundedRect(cx - 10, 3, 4, 12, 2);
    g.fillStyle(0x6b4423, 1).fillRoundedRect(cx + 6, 3, 4, 12, 2);
  });
}
