import Phaser from "phaser";
import { createNet } from "../net.js"; // 兜底：如果没有从 LobbyScene 拿到 socket
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

    this._onRoomState = null;
    this._onError = null;
    // 选学科 UI
    this.subjectUI = {
      container: null,
      title: null,
      buttons: [],
    };

    // 背景图引用
    this.bg = null;
  }

  preload() {
    this.load.on("loaderror", (file) => {
      console.error("❌ loaderror:", file?.key, file?.src);
    });
    // this.load.svg("boardSvg", new URL("../assets/绘图v1.svg", import.meta.url).toString());
    this.load.svg("boardSvg", new URL("../assets/map.svg", import.meta.url).toString());
  }

  create() {
    // =========================
    // 1) 从 LobbyScene 拿 socket/roomId/name
    // =========================
    this.socket = this.registry.get("socket");
    const roomIdFromLobby = this.registry.get("roomId");
    const nameFromLobby = this.registry.get("name");

    if (!this.socket) this.socket = createNet();

    ClientState.me.name = nameFromLobby || ClientState.me.name || "player";
    ClientState.me.roomId = roomIdFromLobby || ClientState.me.roomId || "room1";

    // 如果没有走 Lobby，则补发 join
    if (!roomIdFromLobby || !nameFromLobby) {
      const name = prompt("昵称", ClientState.me.name || "player") || "player";
      const roomId = prompt("房间号", ClientState.me.roomId || "room1") || "room1";
      ClientState.me.name = name;
      ClientState.me.roomId = roomId;

      this.socket.emit("join-room", { roomId, name });
      this.socket.emit("JOIN_ROOM", { roomId, name });
    }

    // =========================
    // 2) UI：地图背景 + 左上角中文信息（先别要右侧按钮）
    // =========================
    this.initGameUI();

    // =========================
    // 3) 绑定 socket 监听
    // =========================
    this._onRoomState = (state) => {
      console.log("✅ ROOM_STATE received:", state);
      ClientState.room = state;
      this.render(state);
    };
    this._onError = ({ message }) => alert(message);

    this.socket.on("ROOM_STATE", this._onRoomState);
    this.socket.on("ERROR", this._onError);

    // 兼容未来事件名
    this.socket.on("room-state", this._onRoomState);
    this.socket.on("error-msg", this._onError);
    // ✅ 关键：主动向服务端要一次最新状态（避免错过 ROOM_STATE）
    this.socket.emit("request-room-state", { roomId: ClientState.me.roomId });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        if (this._onRoomState) {
          this.socket.off("ROOM_STATE", this._onRoomState);
          this.socket.off("room-state", this._onRoomState);
        }
        if (this._onError) {
          this.socket.off("ERROR", this._onError);
          this.socket.off("error-msg", this._onError);
        }
      } catch (e) {}
    });
  }

  // =========================
  // UI 初始化：地图背景 + 中文“阶段/回合”
  // 右侧按钮全部先不显示（你后面流程做好再加）
  // =========================
  initGameUI() {
    // ✅ 1) 地图背景（清晰显示、铺满、置底）
    // 注意：svg 加载成功后 textures 一定存在；若没出现，说明文件名/路径不对
    this.cameras.main.setBackgroundColor("#ffffff");
    if (this.textures.exists("boardSvg")) {
      const bg = this.add.image(0, 0, "boardSvg");
      bg.setOrigin(0.5);

      // 居中
      bg.setPosition(1280 / 2, 720 / 2);

      // 等比缩放铺满画布（可能会留边/或裁切一点，看你地图比例）
      const sx = 1280 / bg.width;
      const sy = 720 / bg.height;
      const scale = Math.max(sx, sy); // ✅ 用 max：尽量铺满（会裁边）
      bg.setScale(scale);

      bg.setAlpha(1);     // ✅ 不要透明
      bg.setDepth(-9999); // ✅ 永远在最底层

      this.bg = bg;
    } else {
      // 兜底：如果没加载成功，就给深色背景（方便你定位问题）
      this.cameras.main.setBackgroundColor("#0b1220");
    }

    // ✅ 2) 中文 UI（左上角）
    this.ui.phase = this.add.text(16, 12, "阶段：", {
      fontSize: "20px",
      color: "#ffffff",
    });
    this.ui.round = this.add.text(16, 40, "回合：", {
      fontSize: "20px",
      color: "#ffffff",
    });
    this.ui.tip = this.add.text(16, 76, "", {
      fontSize: "14px",
      color: "#e2e8f0",
      lineSpacing: 6,
    });
    this.buildSubjectPanel(); // ✅ 构建选学科面板（默认隐藏，render里控制显示）

    // ✅ 右侧按钮先不加（你说先不用）
    // 如果你后面要恢复，只需要把你原来的 mkBtn 那些再搬回来
  }
  // ========== 选学科 UI 面板 ==========

  buildSubjectPanel() {
    // 防重复
    if (this.subjectUI.container) return;
  
    const c = this.add.container(0, 0).setDepth(9999);
    this.subjectUI.container = c;
  
    // 半透明底板
    const bg = this.add.rectangle(640, 610, 980, 170, 0x0b1220, 0.85)
      .setStrokeStyle(2, 0x334155, 1);
  
    // 标题
    const title = this.add.text(170, 540, "", {
      fontSize: "20px",
      color: "#ffffff",
    });
  
    c.add(bg);
    c.add(title);
    this.subjectUI.title = title;
  
    // 默认隐藏
    c.setVisible(false);
  }
  
  clearSubjectButtons() {
    for (const b of this.subjectUI.buttons) {
      try { b.destroy(); } catch (e) {}
    }
    this.subjectUI.buttons = [];
  }
  
  renderSubjectDraft(state) {
    // 只在 PICK_SUBJECT 才显示
    const d = state?.draft;
    if (!d || state.phase !== "PICK_SUBJECT") {
      if (this.subjectUI.container) this.subjectUI.container.setVisible(false);
      return;
    }
  
    // 确保面板存在
    this.buildSubjectPanel();
    this.subjectUI.container.setVisible(true);
  
    const players = state.players || {};
    const me = players[this.socket.id];
    const currentId = d.currentPlayerId;
  
    const currentPlayer = players[currentId];
    const currentName = currentPlayer?.name || "未知";
    const currentTeam = currentPlayer?.team || "?";
    const currentSeat = currentPlayer?.seat || "?";
  
    const myName = me?.name || ClientState.me.name;
    const myTeam = me?.team || "?";
  
    // 是否轮到我
    const isMyTurn = this.socket.id === currentId;
  
    // 标题文字
    const pickedMe = d.picksByPlayer?.[this.socket.id];
    const pickedText = pickedMe ? `你已选择：${pickedMe}` : "你还未选择";
    const leftText = (d.pool || []).join("、") || "（无）";
  
    this.subjectUI.title.setText(
      `阶段：随机分队后【选学科】\n` +
      `当前轮到：${currentName}（队伍${currentTeam} / 座位${currentSeat}）  ${isMyTurn ? "👉轮到你选" : "⏳等待中"}\n` +
      `${pickedText}    剩余：${leftText}`
    );
  
    // 重建按钮
    this.clearSubjectButtons();
  
    const pool = d.pool || [];
    const startX = 240;
    const y = 625;
    const gap = 120;
  
    pool.forEach((subject, i) => {
      const x = startX + i * gap;
  
      const btn = this.add.text(x, y, subject, {
        fontSize: "22px",
        color: "#34d399",
        backgroundColor: "#0f172a",
        padding: { x: 12, y: 10 },
      });
  
      // 只有轮到的玩家能点
      if (isMyTurn) {
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", () => {
          this.socket.emit("pick-subject", {
            roomId: ClientState.me.roomId,
            subject,
          });
        });
        btn.setAlpha(1);
      } else {
        btn.setAlpha(0.35);
      }
  
      this.subjectUI.container.add(btn);
      this.subjectUI.buttons.push(btn);
    });
  }

  // ====== 原来的按钮方法保留（后面要用可以直接恢复按钮）======
  mkBtn(x, y, text, color, onClick) {
    return this.add
      .text(x, y, text, { fontSize: "14px", color })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  // ====== 下面逻辑保持原样（画桌子/放棋子/渲染）======

  drawTablesFromConfig(state) {
    for (const z of this.tableZones.values()) z.destroy();
    this.tableZones.clear();
    this.tableRects.clear();

    for (const t of state.map.tables) {
      const r = t.rect;
      this.tableRects.set(t.id, r);

      const g = this.add.graphics();
      g.lineStyle(2, 0x93c5fd, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);

      this.add.text(r.x + 6, r.y + 6, `${t.id}`, { fontSize: "14px", color: "#e5e7eb" });

      const zone = this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0).setInteractive();
      zone.on("pointerdown", () => {
        ClientState.selectedTableId = t.id;
        if (state.phase === "PLANNING" && ClientState.selectedTokenId) {
          const tokenId = ClientState.selectedTokenId;
          if (ClientState.planDraft.find((x) => x.tokenId === tokenId)) return;
          if (ClientState.planDraft.length >= state.rules.maxTracksPerRound) return;
          ClientState.planDraft.push({ tokenId, toTableId: t.id });
        }
      });

      this.tableZones.set(t.id, zone);
    }
  }

  ensureTokenSprite(tokenId, token) {
    if (this.tokenSprites.has(tokenId)) return this.tokenSprites.get(tokenId);

    const c = this.add
      .circle(0, 0, 12, token.team === "A" ? 0xf472b6 : 0x38bdf8)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(0, 0, tokenId.split("_")[1], { fontSize: "12px", color: "#111827" })
      .setOrigin(0.5);

    c.on("pointerdown", () => {
      ClientState.selectedTokenId = tokenId;
    });

    const obj = { c, label };
    this.tokenSprites.set(tokenId, obj);
    return obj;
  }

  placeTokens(state) {
    for (const [tokenId, token] of Object.entries(state.tokens)) {
      const obj = this.ensureTokenSprite(tokenId, token);
      const r = this.tableRects.get(token.tableId);
      if (!r) continue;

      const table = state.tables[token.tableId];
      const idx = table.tokens.indexOf(tokenId);
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x = r.x + 40 + col * 50;
      const y = r.y + 60 + row * 45;

      obj.c.setPosition(x, y);
      obj.label.setPosition(x, y);
      obj.c.setAlpha(token.home ? 0.25 : 1.0);
    }
  }

  render(state) {
    // ✅ 中文阶段/回合
    this.ui.phase.setText(`阶段：${state.phase}`);
    this.ui.round.setText(`回合：${state.round}`);

    // 桌子画一次
    if (!this._tablesDrawn) {
      this.drawTablesFromConfig(state);
      this._tablesDrawn = true;
    }

    const me = state.players?.[this.socket.id];
    const myTeam = me?.team ?? "?";
    const selected = ClientState.selectedTokenId ? `token=${ClientState.selectedTokenId}` : "token=无";
    const dest = ClientState.selectedTableId ? `table=${ClientState.selectedTableId}` : "table=无";
    const planStr = ClientState.planDraft.map((p) => `${p.tokenId}->${p.toTableId}`).join(", ");
    const actionStr = state.activeAction
      ? `${state.activeAction.pid.slice(0, 4)}:${state.activeAction.tokenId}->${state.activeAction.toTableId}`
      : "无";

    this.ui.tip.setText(
      `你：${ClientState.me.name}（队伍 ${myTeam}）\n` +
      `选择：${selected}，${dest}\n` +
      `计划(${ClientState.planDraft.length})：${planStr || "—"}\n` +
      `当前动作：${actionStr}\n` +
      `争夺桌：${(state.contestedTableIds || []).join(", ") || "—"}`
    );

    this.placeTokens(state);
    this.renderSubjectDraft(state);
  }

  // 下面这些先保留（你后面流程会用到）
  handleAsk() {}
  handlePickSolveTable() {}
  handlePickQuestion() {}
  handleAttempt() {}
}
