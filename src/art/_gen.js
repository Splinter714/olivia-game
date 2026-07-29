// Shared procedural-art helper: draw into an off-screen Graphics, snapshot it to
// a texture under `key`, discard the Graphics. (Same pattern as the siblings.)
export function gen(scene, key, w, h, drawFn) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  drawFn(g);
  g.generateTexture(key, w, h);
  g.destroy();
}
