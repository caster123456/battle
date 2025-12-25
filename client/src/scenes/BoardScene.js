import Phaser from "phaser";
import { createNet } from "../net.js";
import { ClientState } from "../state.js";

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super("BoardScene");

    this.socket = null;

    this.ui = {};
    this._tablesDrawn = false;

    this.subjectUI = {
      container: null,
      title: null,
      buttons: [],
    };

    this.bg = null;

    // ✅ 记一个：是否已在本场景主动 join（避免重复 join）
    this._joined = false;
  }

  preload() {
    this.load.on("loaderror", (file) => {
      console.error("❌ loaderror:", file?.key, file?.src);
    });
    this.load.svg("boardSvg", new URL("../assets/map.svg", import.meta.url).toString());
  }

  create() {
    // =========================
    // 1) socket / room / name
    // =========================
    this.socket = this.registry.get("socket") || createNet();

    const lobbyName = this.registry.get("name");
    const lobbyRoomId = this.registry.get("roomId");

    ClientState.me.name = lobbyName || ClientState.me.name || "player";
    ClientState.me.roomId = lobbyRoomId || ClientState.me.roomId || "room1";

    // =========================
    // 2) UI
    // =========================
    this.initGameUI();

    // =========================
    // 3) socket listeners
    // =========================
    this.socket.off("ROOM_STATE");
    this.socket.off("room-state");
    this.socket.off("ERROR");
    this.socket.off("error-msg");

    this.socket.on("ROOM_STATE", (state) => {
      console.log("✅ ROOM_STATE:", state);
      ClientState.room = state;
      this.render(state);
    });
    this.socket.on("room-state", (state) => {
      console.log("✅ room-state:", state);
      ClientState.room = state;
      this.render(state);
    });
    this.socket.on("game-start", () => {
      this.socket.emit("request-room-state", { roomId: ClientState.me.roomId });
    })
    // ✅ 关键修复：BoardScene 创建后主动拉取状态（房主切场景最容易漏接一次 ROOM_STATE）
    const rid = ClientState.me.roomId;
    this.socket.emit("request-room-state", { roomId: rid });
    setTimeout(() => this.socket.emit("request-room-state", { roomId: rid }), 200);
    setTimeout(() => this.socket.emit("request-room-state", { roomId: rid }), 800);

    this.socket.on("ERROR", (e) => console.warn("❌ ERROR:", e));
    this.socket.on("error-msg", (e) => console.warn("❌ error-msg:", e));

    // =========================
    // 4) 关键：connect 后再 join + request-room-state
    //    （避免 socket.id 还没准备好导致“轮次判定失败/乱点才触发”）
    // =========================
    const ensureJoinAndState = () => {
      // 如果没从 Lobby 来，才需要在 BoardScene 自己 join
      if (!lobbyRoomId) {
        if (!this._joined) {
          const name = ClientState.me.name || "player";
          const roomId = ClientState.me.roomId || "room1";

          // ✅ join-room（只发一次）
          this.socket.emit("join-room", { roomId, name });
          this._joined = true;

          console.log("[BoardScene] join-room emitted:", roomId, name);
        }
      }

      // ✅ 无论从 Lobby 来不来，都要主动要一次最新状态（防止错过 ROOM_STATE）
      this.socket.emit("request-room-state", { roomId: ClientState.me.roomId });
      console.log("[BoardScene] request-room-state:", ClientState.me.roomId);
    };

    // 如果已经连接了，立即做一次；否则等 connect
    if (this.socket.connected) {
      ensureJoinAndState();
    } else {
      this.socket.once("connect", () => {
        ensureJoinAndState();
      });
    }

    // 进入场景时先显示一行“等待状态”
    this.ui.tip.setText(
      `你：${ClientState.me.name}\n` +
      `房间：${ClientState.me.roomId}\n` +
      `正在连接/同步房间状态…`
    );

    // =========================
    // 5) 清理
    // =========================
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.socket.off("ROOM_STATE");
        this.socket.off("room-state");
        this.socket.off("ERROR");
        this.socket.off("error-msg");
      } catch (e) {}
    });
  }

  // ================= UI =================

  initGameUI() {
    this.cameras.main.setBackgroundColor("#ffffff");

    // ✅ 背景地图（支持缩放 + 上下平移）
    this.layoutBackground(0, +90, 1.35);

    // ✅ 左上角文字
    const titleStyle = { fontSize: "20px", color: "#111827" };
    const tipStyle = { fontSize: "14px", color: "#334155", lineSpacing: 6 };

    this.ui.phase = this.add.text(16, 12, "阶段：", titleStyle).setDepth(10000);
    this.ui.round = this.add.text(16, 40, "回合：", titleStyle).setDepth(10000);
    this.ui.tip = this.add.text(16, 76, "", tipStyle).setDepth(10000);

    // ✅ 选学科面板
    this.buildSubjectPanel();
  }

  /**
   * ✅ 你要的“调整长宽/上下平移/缩放”
   * @param {number} dx  水平偏移（正数向右）
   * @param {number} dy  垂直偏移（正数向下）
   * @param {number} scaleMul  额外放大倍数
   */
  layoutBackground(dx = 0, dy = 0, scaleMul = 1.3) {
    const W = this.scale.width || 1280;
    const H = this.scale.height || 720;

    if (!this.textures.exists("boardSvg")) return;

    // 如果已存在就复用
    if (!this.bg) {
      this.bg = this.add.image(0, 0, "boardSvg");
      this.bg.setDepth(-9999);
      this.bg.setAlpha(1);
      this.bg.setOrigin(0.5);
    }

    // 居中 + 偏移
    this.bg.setPosition(W / 2 + dx, H / 2 + dy);

    // 等比缩放（让地图更大/更满）
    const sx = W / this.bg.width;
    const sy = H / this.bg.height;
    const scale = Math.min(sx, sy) * scaleMul; // ✅ min 保证完整显示；scaleMul 控制大小
    this.bg.setScale(scale);
  }

  // ================= 选学科 UI =================

  buildSubjectPanel() {
    if (this.subjectUI.container) return;

    const c = this.add.container(0, 0).setDepth(9999);
    this.subjectUI.container = c;

    const bg = this.add
      .rectangle(640, 610, 980, 170, 0x0b1220, 0.85)
      .setStrokeStyle(2, 0x334155);

    const title = this.add.text(170, 540, "", {
      fontSize: "20px",
      color: "#ffffff",
      lineSpacing: 8,
    });

    c.add([bg, title]);
    this.subjectUI.title = title;
    c.setVisible(false);
  }

  clearSubjectButtons() {
    this.subjectUI.buttons.forEach((b) => {
      try { b.destroy(); } catch (e) {}
    });
    this.subjectUI.buttons = [];
  }

  myId(state) {
    // ✅ socket.id 有时会在 very early render 时还没准备好
    const sid = this.socket?.id;
    if (sid) return sid;

    // 尝试从 players 里用名字匹配（兜底）
    const players = state?.players || {};
    const name = ClientState.me.name;
    const found = Object.values(players).find((p) => p?.name === name);
    return found?.id || null;
  }

  renderSubjectDraft(state) {
    // 只在 PICK_SUBJECT 显示
    if (state.phase !== "PICK_SUBJECT" || !state.draft) {
      if (this.subjectUI.container) this.subjectUI.container.setVisible(false);
      return;
    }

    this.subjectUI.container.setVisible(true);

    const d = state.draft;
    const myId = this.myId(state);
    const players = state.players || {};

    const curId = d.currentPlayerId;
    const cur = players?.[curId];

    const isMyTurn = !!myId && myId === curId;

    const picked = myId ? d.picksByPlayer?.[myId] : null;
    const left = (d.pool || []).join("、") || "（无）";

    const myPlayer = myId ? players?.[myId] : null;
    const myTeam = myPlayer?.team ?? "?";
    const mySeat = myPlayer?.seat ?? "?";

    this.subjectUI.title.setText(
      `阶段：选学科（你：队伍${myTeam} / 座位${mySeat}）\n` +
      `当前：${cur?.name || "未知"}（${cur?.team || "?"} / 座位${cur?.seat || "?"}） ${isMyTurn ? "👉轮到你" : "⏳等待中"}\n` +
      `${picked ? "你已选：" + picked : "你还未选择"}    剩余：${left}`
    );

    // 重建按钮
    this.clearSubjectButtons();

    (d.pool || []).forEach((subject, i) => {
      const btn = this.add.text(240 + i * 120, 625, subject, {
        fontSize: "22px",
        color: "#34d399",
        backgroundColor: "#0f172a",
        padding: { x: 12, y: 10 },
      });

      if (isMyTurn) {
        btn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          this.socket.emit("pick-subject", {
            roomId: ClientState.me.roomId,
            subject,
          });
          this.socket.emit("request-room-state", { roomId: ClientState.me.roomId });
          setTimeout(() => {
            this.socket.emit("request-room-state", { roomId: ClientState.me.roomId });
          }, 200);
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
    this.ui.phase.setText(`阶段：${state.phase ?? ""}`);
    this.ui.round.setText(`回合：${state.round ?? 0}`);

    // ✅ 先渲染选学科面板（最关键）
    this.renderSubjectDraft(state);

    const myId = this.myId(state);
    const me = myId ? state.players?.[myId] : null;

    // ✅ 学科/队伍/卡牌显示（服务端写到 player.subject / player.card）
    const myTeam = me?.team ?? "?";
    const mySeat = me?.seat ?? "?";

    const mySubject =
      me?.subject ||
      (state.phase === "PICK_SUBJECT" && myId ? state.draft?.picksByPlayer?.[myId] : null) ||
      "未选择";

    const myCard = me?.card?.name || "未发牌";

    // ✅ 如果还在 PICK_SUBJECT 或还没进入正式棋盘逻辑，就不要画 tables/tokens（避免 WebGL 报错）
    if (!state.map || !state.tables || !state.tokens) {
      this.ui.tip.setText(
        `你：${ClientState.me.name}\n` +
        `id：${myId || "(未连接)"}\n` +
        `队伍：${myTeam}  座位：${mySeat}\n` +
        `学科：${mySubject}\n` +
        `卡牌：${myCard}\n` +
        (state.phase === "PICK_SUBJECT"
          ? `正在选学科中…（轮到谁看底部提示）`
          : `等待进入游戏数据…`)
      );
      return;
    }

    // ✅ 未来：如果你进入 IN_GAME 并且 server 开始下发 map/tables/tokens
    // 才启用棋盘绘制（现在先不实现也不会崩）
    this.ui.tip.setText(
      `你：${ClientState.me.name}\n` +
      `队伍：${myTeam}  座位：${mySeat}\n` +
      `学科：${mySubject}\n` +
      `卡牌：${myCard}\n`
    );

    // 下面先留着：你后面真要画桌子和棋子，再实现即可
    // if (!this._tablesDrawn && state?.map?.tables && Array.isArray(state.map.tables)) {
    //   this.drawTablesFromConfig(state);
    //   this._tablesDrawn = true;
    // }
    // this.placeTokens(state);
  }

  // ================= 未来阶段用（先保留空实现，不会崩） =================
  drawTablesFromConfig(state) {}
  placeTokens(state) {}
  handleAsk() {}
  handlePickSolveTable() {}
  handlePickQuestion() {}
  handleAttempt() {}
}
