import Phaser from "phaser";
import { createNet } from "../net.js";
import { ClientState } from "../state.js";

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super("BoardScene");

    this.socket = null;
    this.tableZones = new Map();
    this.tableRects = new Map();
    this.tokenSprites = new Map();

    this.ui = {};
    this._tablesDrawn = false;

    this.subjectUI = {
      container: null,
      title: null,
      buttons: [],
    };

    this.bg = null;
  }

  preload() {
    this.load.on("loaderror", (file) => {
      console.error("❌ loaderror:", file?.key, file?.src);
    });
    this.load.svg("boardSvg", new URL("../assets/map.svg", import.meta.url).toString());
  }

  create() {
    // ===== socket / room =====
    this.socket = this.registry.get("socket") || createNet();
    ClientState.me.name = this.registry.get("name") || ClientState.me.name || "player";
    ClientState.me.roomId = this.registry.get("roomId") || ClientState.me.roomId || "room1";

    if (!this.registry.get("roomId")) {
      const name = prompt("昵称", ClientState.me.name) || "player";
      const roomId = prompt("房间号", ClientState.me.roomId) || "room1";
      ClientState.me.name = name;
      ClientState.me.roomId = roomId;
      this.socket.emit("join-room", { roomId, name });
    }

    // ===== UI =====
    this.initGameUI();

    // ===== socket listeners =====
    this.socket.on("ROOM_STATE", (state) => {
      console.log("✅ ROOM_STATE:", state);
      ClientState.room = state;
      this.render(state);
    });
  }

  // ================= UI =================

  initGameUI() {
    this.cameras.main.setBackgroundColor("#ffffff");

    if (this.textures.exists("boardSvg")) {
      const bg = this.add.image(640, 360 + 100, "boardSvg");
      const sx = 1280 / bg.width;
      const sy = 720 / bg.height;
      bg.setScale(Math.min(sx, sy) * 1.5);
      bg.setDepth(-9999);
      this.bg = bg;
    }

    const titleStyle = { fontSize: "20px", color: "#111827" };
    const tipStyle = { fontSize: "14px", color: "#334155", lineSpacing: 6 };

    this.ui.phase = this.add.text(16, 12, "阶段：", titleStyle);
    this.ui.round = this.add.text(16, 40, "回合：", titleStyle);
    this.ui.tip = this.add.text(16, 76, "", tipStyle);

    this.buildSubjectPanel();
  }

  // ================= 选学科 UI =================

  buildSubjectPanel() {
    if (this.subjectUI.container) return;

    const c = this.add.container(0, 0).setDepth(9999);
    this.subjectUI.container = c;

    const bg = this.add.rectangle(640, 610, 980, 170, 0x0b1220, 0.85)
      .setStrokeStyle(2, 0x334155);

    const title = this.add.text(170, 540, "", { fontSize: "20px", color: "#ffffff" });

    c.add([bg, title]);
    this.subjectUI.title = title;
    c.setVisible(false);
  }

  clearSubjectButtons() {
    this.subjectUI.buttons.forEach(b => b.destroy());
    this.subjectUI.buttons = [];
  }

  renderSubjectDraft(state) {
    if (state.phase !== "PICK_SUBJECT" || !state.draft) {
      this.subjectUI.container.setVisible(false);
      return;
    }

    this.subjectUI.container.setVisible(true);

    const d = state.draft;
    const meId = this.socket.id;
    const me = state.players?.[meId];
    const curId = d.currentPlayerId;
    const cur = state.players?.[curId];

    const isMyTurn = meId === curId;
    const picked = d.picksByPlayer?.[meId];
    const left = d.pool.join("、");

    this.subjectUI.title.setText(
      `阶段：选学科\n` +
      `当前：${cur?.name}（${cur?.team} / 座位${cur?.seat}） ${isMyTurn ? "👉轮到你" : ""}\n` +
      `${picked ? "你已选：" + picked : "你还未选择"}    剩余：${left}`
    );

    this.clearSubjectButtons();

    d.pool.forEach((subject, i) => {
      const btn = this.add.text(240 + i * 120, 625, subject, {
        fontSize: "22px",
        color: "#34d399",
        backgroundColor: "#0f172a",
        padding: { x: 12, y: 10 },
      });

      if (isMyTurn) {
        btn.setInteractive().on("pointerdown", () => {
          this.socket.emit("pick-subject", {
            roomId: ClientState.me.roomId,
            subject,
          });
        });
      } else {
        btn.setAlpha(0.35);
      }

      this.subjectUI.container.add(btn);
      this.subjectUI.buttons.push(btn);
    });
  }

  // ================= render =================

  render(state) {
    this.ui.phase.setText(`阶段：${state.phase}`);
    this.ui.round.setText(`回合：${state.round ?? 0}`);

    // ✅ 先渲染选学科（最重要）
    this.renderSubjectDraft(state);

    // ✅ PICK_SUBJECT 阶段没有棋盘数据，直接返回
    if (!state.map || !state.tables || !state.tokens) {
      const me = state.players?.[this.socket.id];
      this.ui.tip.setText(`你：${ClientState.me.name}（队伍 ${me?.team ?? "?"}）\n等待学科选择中…`);
      return;
    }

    // 下面是以后阶段才会用到的
    if (!this._tablesDrawn) {
      this.drawTablesFromConfig(state);
      this._tablesDrawn = true;
    }
  }

  // ================= 未来阶段用（原样保留） =================
  drawTablesFromConfig(state) {}
  placeTokens(state) {}
  handleAsk() {}
  handlePickSolveTable() {}
  handlePickQuestion() {}
  handleAttempt() {}
}
