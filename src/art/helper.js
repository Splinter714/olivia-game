// Procedural NPC-helper sprites (issue #52): three kennel-helper characters,
// present from game start, who roam and do routine upkeep on their own. They
// later double as the extra player characters for local multiplayer (issue
// #53), so at-a-glance distinguishability matters now, not just later —
// each variant gets both a different palette AND a different hair
// silhouette, so they're tellable apart from each other, from the player
// (art/player.js — blue shirt, red cap) and from the owner NPC (art/owner.js
// — green dress, brown bob) even as small moving sprites.
//
// Reuses art/player.js's layered-rounded-rect technique and exact scale
// (PLAYER_W/PLAYER_H) so a helper reads as "a person the same size as you",
// which is what issue #53 will need when one of these becomes controllable.
import { gen } from './_gen.js';
import { PLAYER_W, PLAYER_H } from './player.js';

export const HELPER_W = PLAYER_W;
export const HELPER_H = PLAYER_H;

// One entry per helper. `hairStyle` picks the silhouette drawn below —
// distinct shapes, not just distinct colors, so two helpers standing still
// at a glance (no color perception assumed) are still tellable apart.
const VARIANTS = [
  { shirt: 0x8a5fc9, shirtDark: 0x6f49a3, skin: 0xecb98a, hair: 0x2b2320, hairStyle: 'bun' },
  { shirt: 0xe0863f, shirtDark: 0xb96a2c, skin: 0xf0c090, hair: 0xe8d24a, hairStyle: 'pony' },
  { shirt: 0x3f9e8f, shirtDark: 0x2f7d70, skin: 0xd8a878, hair: 0xb84630, hairStyle: 'pigtails' },
];

export const HELPER_VARIANT_COUNT = VARIANTS.length;

export function buildHelperTexture(scene, key, variantIndex) {
  const v = VARIANTS[variantIndex % VARIANTS.length];
  gen(scene, key, HELPER_W, HELPER_H, (g) => {
    const cx = HELPER_W / 2;

    // Legs, then the shirt/vest body, then head + hair — same back-to-front
    // layering as player.js/owner.js.
    g.fillStyle(0x3a3f52, 1).fillRoundedRect(cx - 9, HELPER_H - 12, 7, 12, 2);
    g.fillStyle(0x3a3f52, 1).fillRoundedRect(cx + 2, HELPER_H - 12, 7, 12, 2);

    g.fillStyle(v.shirt, 1).fillRoundedRect(cx - 11, 14, 22, 20, 6);
    g.fillStyle(v.shirtDark, 1).fillRoundedRect(cx - 8, 27, 16, 7, 3); // hem shading

    g.fillStyle(v.skin, 1).fillCircle(cx, 10, 9); // head

    if (v.hairStyle === 'bun') {
      // A rounded cap of hair plus a small top-knot bun.
      g.fillStyle(v.hair, 1).fillRoundedRect(cx - 9, 1, 18, 8, 4);
      g.fillStyle(v.hair, 1).fillCircle(cx, -2, 5);
    } else if (v.hairStyle === 'pony') {
      // Short fringe plus a ponytail swept out to one side.
      g.fillStyle(v.hair, 1).fillRoundedRect(cx - 9, 1, 18, 7, 4);
      g.fillStyle(v.hair, 1).fillRoundedRect(cx + 7, 2, 6, 15, 3);
    } else {
      // Fringe plus two side pigtails.
      g.fillStyle(v.hair, 1).fillRoundedRect(cx - 9, 1, 18, 7, 4);
      g.fillStyle(v.hair, 1).fillCircle(cx - 10, 11, 4);
      g.fillStyle(v.hair, 1).fillCircle(cx + 10, 11, 4);
    }
  });
}
