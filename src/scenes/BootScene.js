import Phaser from 'phaser';

// Placeholder boot scene — replaced once the game exists. Its only job is to prove
// the Phaser + Vite skeleton runs.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'olivia-game — skeleton ready', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9fb4d8'
      })
      .setOrigin(0.5);
  }
}
