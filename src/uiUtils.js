// Shared HiDPI helpers — ported from the horse/mech games' uiUtils.js.
//
// The game renders its buffer at the device's PHYSICAL pixels (crisp on Retina),
// but all game/world/UI coordinates stay LOGICAL (CSS px). Each scene's camera
// zoom = DPR absorbs the difference; `scale.width/height` are physical, so UI
// layout code reads the logical viewport via logicalW/H instead.

export const dprOf = (scene) => scene.registry.get('dpr') || 1;

// Zoom this scene's main camera by the device pixel ratio. Call once in create().
// `topLeft: true` anchors the zoom at the top-left corner instead of the viewport
// centre — use this for screen-fixed UI scenes (HudScene) laid out from (0,0) in
// logical coords. World scenes (KennelScene) keep the default centred origin so
// `startFollow` behaves correctly; their screen-fixed overlays use worldUiOffset
// below instead.
export function applyDpr(scene, { topLeft = false } = {}) {
  const cam = scene.cameras.main;
  if (topLeft) cam.setOrigin(0, 0);
  cam.setZoom(dprOf(scene));
  return scene;
}

// Offset to add to a logical screen position for a scrollFactor-0 overlay drawn on
// a scene whose camera keeps the default CENTRED origin (KennelScene). Counteracts
// the zoom-about-centre so the overlay lands where the logical coordinate intends.
//
// Issue #53 (local multiplayer): KennelScene's camera zoom is no longer always
// exactly the device pixel ratio — its shared-camera framing multiplies the DPR
// baseline by a factor that shrinks as active players spread apart (see
// KennelScene's _updateCameraFraming). This has to counteract whatever the
// camera's zoom ACTUALLY is right now, not assume it's still bare dpr, or every
// scrollFactor(0) overlay (the touch button cluster, the joystick ring, the
// pause button) drifts off its intended spot the moment the camera zooms out.
// Reading the live zoom keeps this correct in both modes: solo play never
// changes zoom away from dpr, so this is byte-for-byte the same math as before.
export function worldUiOffset(scene) {
  const zoom = scene.cameras.main.zoom;
  const k = (zoom - 1) / 2;
  return { x: logicalW(scene) * k, y: logicalH(scene) * k };
}

// Viewport size in LOGICAL px (scale.width/height are physical buffer px).
export const logicalW = (scene) => scene.scale.width / dprOf(scene);
export const logicalH = (scene) => scene.scale.height / dprOf(scene);

// Convert a pointer's physical (buffer) coordinates to logical CSS px.
export const pointerLogical = (scene, pointer) => ({
  x: pointer.x / dprOf(scene),
  y: pointer.y / dprOf(scene),
});
