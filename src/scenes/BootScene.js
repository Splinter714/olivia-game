import Phaser from 'phaser';

// Boot step — starts the real gameplay scene + its parallel HUD, then gets out
// of the way. Kept as its own scene (rather than folded away) in case a later
// phase needs an actual loading step (e.g. warming up procedural textures).
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.scene.start('Kennel');
    this.scene.launch('Hud');
    this.scene.launch('Notification');
  }
}
