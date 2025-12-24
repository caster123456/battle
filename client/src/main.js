import Phaser from "phaser";
import LobbyScene from "./scenes/LobbyScene.js";
import BoardScene from "./scenes/BoardScene.js";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: "app",
  backgroundColor: "#0b1220",
  scene: [LobbyScene, BoardScene], // ✅ 先 Lobby 再 Game
});
