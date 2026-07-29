// Hue-based procedural palette generator — replaces species.js's old hardcoded
// 2-entry palette arrays so every animal can get a genuinely unique look
// (see data/looks.js for how hues are handed out uniquely + spaced).
// Pure JS, no Phaser.

// Standard HSL -> RGB -> packed 0xRRGGBB hex number. h: 0-360, s/l: 0-100.
export function hsl(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r, g, b;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

// Builds the color-field object a species' draw function (art/animals.js)
// expects, from a single hue. Field names/formulas per species are fixed —
// see the per-species draw functions for what each field is used for.
export function paletteForHue(speciesKey, hue) {
  const h = ((hue % 360) + 360) % 360;
  switch (speciesKey) {
    case 'turtle':
      return {
        shell: hsl(h, 45, 45),
        shellDark: hsl(h, 50, 30),
        skin: hsl((h + 35) % 360, 30, 72),
      };
    case 'guineaPig':
      return {
        body: hsl(h, 55, 60),
        bodyDark: hsl(h, 55, 44),
        belly: hsl(h, 35, 88),
      };
    case 'hamster':
      return {
        body: hsl(h, 55, 58),
        bodyDark: hsl(h, 55, 42),
        cheek: hsl(h, 40, 82),
      };
    case 'bunny':
      return {
        body: hsl(h, 28, 82),
        bodyDark: hsl(h, 28, 66),
        earInner: hsl((h + 330) % 360, 45, 82),
      };
    case 'cat':
      return {
        body: hsl(h, 45, 55),
        bodyDark: hsl(h, 45, 40),
        earInner: hsl((h + 340) % 360, 45, 82),
      };
    case 'dog':
      return {
        body: hsl(h, 42, 60),
        bodyDark: hsl(h, 42, 44),
        earColor: hsl(h, 40, 36),
      };
    default:
      throw new Error(`paletteForHue: unknown species "${speciesKey}"`);
  }
}
