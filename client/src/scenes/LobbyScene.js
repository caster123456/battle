import Phaser from "phaser";
import { createNet } from "../net.js";

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super("LobbyScene");
    this.startBtn = null;
    this.readyBtn = null;
    this.roomText = null;
    this.hostText = null;
    this.countText = null;
    this.playersText = null;
  }

  create() {
    // 1) 连接服务器（Socket.io）
    const socket = createNet();
    this.registry.set("socket", socket); // 给后续 BoardScene 用

    // 2) 输入房间号 + 昵称
    const roomId = prompt("输入房间号（例如 room1）:", "room1") || "room1";
    const name = prompt("输入昵称:", "Player") || "Player";
    this.registry.set("roomId", roomId);
    this.registry.set("name", name);

    // 3) Lobby UI
    this.add.text(40, 40, "等待房间（Lobby）", { fontSize: "36px", color: "#ffffff" });
    this.roomText = this.add.text(40, 90, `房间号：${roomId}`, { fontSize: "22px", color: "#cbd5e1" });
    this.hostText = this.add.text(40, 125, "房主：（连接中）", { fontSize: "22px", color: "#cbd5e1" });
    this.countText = this.add.text(40, 155, "人数：0 / 6", { fontSize: "22px", color: "#cbd5e1" });
    this.playersText = this.add.text(40, 200, "玩家：\n（等待加入）", {
      fontSize: "20px",
      color: "#e2e8f0",
      lineSpacing: 6,
    });

    // 4) 准备按钮（所有人都有）
    this.readyBtn = this.add.text(40, 520, "[ 未准备（点我准备） ]", {
      fontSize: "22px",
      color: "#34d399",
      backgroundColor: "#0f172a",
      padding: { x: 12, y: 10 },
    }).setInteractive({ useHandCursor: true });

    this.readyBtn.on("pointerdown", () => {
      socket.emit("toggle-ready", { roomId });
    });

    // 5) 开始按钮（只有房主能点；room-update 决定显示/隐藏）
    this.startBtn = this.add.text(280, 520, "[ 房主开始游戏 ]", {
      fontSize: "22px",
      color: "#fbbf24",
      backgroundColor: "#0f172a",
      padding: { x: 12, y: 10 },
    }).setInteractive({ useHandCursor: true });

    this.startBtn.on("pointerdown", () => {
      socket.emit("start-game", { roomId });
    });

    // 默认隐藏
    this.startBtn.setVisible(false);

    // 6) ✅ 关键：必须等 connect 后再 join-room（保证 socket.id 已就绪）
    socket.on("connect", () => {
      // 加入房间
      socket.emit("join-room", { roomId, name });
    });

    // 7) 监听房间更新：刷新玩家列表/准备状态/房主按钮显示
    socket.on("room-update", (room) => {
      const players = Object.values(room.players || {});
      const isHost = socket.id === room.hostId;

      // 房主显示：优先用后端给的 hostName（更稳）
      const hostName = room.hostName || room.players?.[room.hostId]?.name || "";
      this.hostText.setText(`房主：${hostName || room.hostId || "（未确定）"}`);

      // 人数显示
      this.countText.setText(`人数：${players.length} / 6`);

      // 只有房主显示开始按钮
      this.startBtn.setVisible(isHost);

      // 玩家列表显示 ready
      const lines = players.map((p) => `${p.ready ? "✅" : "⏳"}  ${p.name}`);
      this.playersText.setText("玩家：\n" + (lines.join("\n") || "（暂无玩家）"));

      // 准备按钮反馈（显示我是否已准备）
      const me = room.players?.[socket.id];
      if (me?.ready) {
        this.readyBtn.setText("[ 已准备（点我取消） ]");
      } else {
        this.readyBtn.setText("[ 未准备（点我准备） ]");
      }
    });

    // 8) 监听 game-start：切到 BoardScene
    socket.on("game-start", (room) => {
      this.registry.set("room", room);
      this.scene.start("BoardScene");
    });

    // 可选：错误提示
    socket.on("ERROR", ({ message }) => {
      alert(message || "Server ERROR");
    });
  }
}
