import Phaser from "phaser";
import { createNet } from "../net.js";

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super("LobbyScene");
  }

  create() {
    // 1) 连接服务器（Socket.io）
    const socket = createNet();
    this.registry.set("socket", socket); // ✅ 给后续 BoardScene 用

    // 2) 让玩家输入房间号 + 昵称（先用最简单的 prompt）
    const roomId = prompt("输入房间号（例如 room1）:", "room1") || "room1";
    const name = prompt("输入昵称:", "Player") || "Player";
    this.registry.set("roomId", roomId);
    this.registry.set("name", name);

    // 3) 进入房间（你服务器已经支持 join-room）
    socket.emit("join-room", { roomId, name });

    // 4) 画一个最简单的 Lobby UI（后面你再美化）
    this.add.text(40, 40, "等待房间（Lobby）", { fontSize: "36px", color: "#ffffff" });
    this.roomText = this.add.text(40, 90, `房间号：${roomId}`, { fontSize: "22px", color: "#cbd5e1" });
    this.hostText = this.add.text(40, 125, "房主：", { fontSize: "22px", color: "#cbd5e1" });
    this.playersText = this.add.text(40, 170, "玩家：", { fontSize: "20px", color: "#e2e8f0", lineSpacing: 6 });

    // 5) 准备按钮（所有人都有）
    const readyBtn = this.add.text(40, 520, "[ 准备 / 取消准备 ]", {
      fontSize: "22px",
      color: "#34d399",
      backgroundColor: "#0f172a",
      padding: { x: 12, y: 10 },
    }).setInteractive({ useHandCursor: true });

    readyBtn.on("pointerdown", () => {
      socket.emit("toggle-ready", { roomId });
    });

    // 6) 开始按钮（只有房主能点；我们会在 room-update 里决定显示/隐藏）
    this.startBtn = this.add.text(240, 520, "[ 房主开始游戏 ]", {
      fontSize: "22px",
      color: "#fbbf24",
      backgroundColor: "#0f172a",
      padding: { x: 12, y: 10 },
    }).setInteractive({ useHandCursor: true });

    this.startBtn.on("pointerdown", () => {
      socket.emit("start-game", { roomId });
    });

    // 默认先隐藏，等 room-update 判断你是不是房主
    this.startBtn.setVisible(false);

    // 7) 监听房间更新：刷新玩家列表/准备状态/房主按钮显示
    socket.on("room-update", (room) => {
      const isHost = socket.id === room.hostId;

      this.hostText.setText(`房主：${room.players[room.hostId]?.name || room.hostId}`);
      this.startBtn.setVisible(isHost);

      const lines = Object.values(room.players).map((p) => {
        return `${p.ready ? "✅" : "⏳"}  ${p.name}`;
      });
      this.playersText.setText("玩家：\n" + lines.join("\n"));
    });

    // 8) 监听 game-start：切到 BoardScene
    socket.on("game-start", (room) => {
      // 把 room 存起来给 BoardScene 用（可选）
      this.registry.set("room", room);

      // 切场景：进入真正游戏
      this.scene.start("BoardScene");
    });
  }
}
