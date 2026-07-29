import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import KennelScene from './scenes/KennelScene.js';
import HudScene from './scenes/HudScene.js';
import NotificationScene from './scenes/NotificationScene.js';

// HiDPI: render the canvas buffer at the device's PHYSICAL pixels so pixel-art and
// text are crisp on Retina screens, while keeping the on-screen size and all game
// coordinates LOGICAL (CSS px) — each scene's camera zoom = DPR compensates. Phaser 3
// has no built-in DPR support and Scale.RESIZE renders at CSS resolution, so we drive
// the size manually with Scale.NONE. (Same pattern as the sibling horse/mech games.)
//
// MAX_DPR caps the fill-rate cost: 2 = full native quality on any iPad/Retina laptop;
// higher only matters on DPR-3 phones, where it burns battery for no visible gain.
const MAX_DPR = 2;
export const getDpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1c2330',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  input: {
    gamepad: true,
  },
  scale: {
    mode: Phaser.Scale.NONE,
    width: window.innerWidth * getDpr(),
    height: window.innerHeight * getDpr(),
  },
  scene: [BootScene, KennelScene, HudScene, NotificationScene]
});
game.registry.set('dpr', getDpr()); // available to scenes from their first create()

// Dev-only handle for debugging/verification from the browser console.
if (import.meta.env.DEV) window.__game = game;

const gameEl = document.getElementById('game');
let lastW = 0, lastH = 0;

// Size the renderer to the device's PHYSICAL pixels while DISPLAYING at logical (CSS)
// size. Scale.NONE doesn't auto-track the container, and window.innerWidth/Height is
// unreliable on iOS while the Safari toolbar / orientation settle — so measure the
// #game container (inset:0 → fills the viewport) and re-run on every viewport change.
// The bogus-size guard stops a transient 0×0 from freezing the canvas.
function applySize() {
  const dpr = getDpr();
  const w = Math.round(gameEl?.clientWidth || window.innerWidth);
  const h = Math.round(gameEl?.clientHeight || window.innerHeight);
  if (w <= 0 || h <= 0) return;                                   // ignore bogus transient sizes
  if (w === lastW && h === lastH && game.registry.get('dpr') === dpr) return; // unchanged → skip
  lastW = w; lastH = h;
  game.registry.set('dpr', dpr);
  game.scale.resize(w * dpr, h * dpr);                            // emits Scale RESIZE → UI relayouts
  const c = game.canvas;
  if (c) { c.style.width = w + 'px'; c.style.height = h + 'px'; } // displayed size stays logical
  game.scene.scenes.forEach((s) => s.cameras?.main?.setZoom(dpr));
}

applySize();                       // initial size (the canvas exists synchronously)
game.events.once('ready', applySize);
window.addEventListener('resize', applySize);
window.addEventListener('orientationchange', () => setTimeout(applySize, 50));
window.visualViewport?.addEventListener('resize', applySize);
