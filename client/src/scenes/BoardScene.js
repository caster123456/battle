import Phaser from "phaser";
import { createNet } from "../net.js"; // 仅作为兜底：如果没有从 LobbyScene 拿到 socket
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

    // 用于取消监听（避免场景切换后重复绑定）
    this._onRoomState = null;
    this._onError = null;
  }

  preload() {
    this.load.svg("boardSvg", new URL("../assets/map.svg", import.meta.url).toString());
  }

  create() {
    // =========================
    // 1) 从 LobbyScene 拿 socket/roomId/name
    // =========================
    this.socket = this.registry.get("socket");
    const roomIdFromLobby = this.registry.get("roomId");
    const nameFromLobby = this.registry.get("name");

    // 兜底：如果你直接进 BoardScene（没走 Lobby），仍可运行
    if (!this.socket) {
      this.socket = createNet();
    }

    // 统一写回 ClientState（你原有逻辑依赖它）
    ClientState.me.name = nameFromLobby || ClientState.me.name || "player";
    ClientState.me.roomId = roomIdFromLobby || ClientState.me.roomId || "room1";

    // ⚠️ 注意：
    // 正常流程下 join-room 已在 LobbyScene 发过了，这里不要再发
    // 但如果用户绕过 Lobby 直接进 BoardScene，则补发一次
    if (!roomIdFromLobby || !nameFromLobby) {
      const name = prompt("昵称", ClientState.me.name || "player") || "player";
      const roomId = prompt("房间号", ClientState.me.roomId || "room1") || "room1";
      ClientState.me.name = name;
      ClientState.me.roomId = roomId;

      // 兼容你的两套协议
      this.socket.emit("join-room", { roomId, name });
      this.socket.emit("JOIN_ROOM", { roomId, name });
    }

    // =========================
    // 2) 创建游戏界面（你原来的内容）
    // =========================
    this.initGameUI();

    // =========================
    // 3) 绑定 socket 监听（保持你原逻辑）
    // =========================
    this._onRoomState = (state) => {
      ClientState.room = state;
      this.render(state);
    };
    this._onError = ({ message }) => alert(message);

    // 兼容你现有服务端：ROOM_STATE / ERROR
    this.socket.on("ROOM_STATE", this._onRoomState);
    this.socket.on("ERROR", this._onError);

    // 如果你未来把服务端改成小写 room-state，也能兼容
    this.socket.on("room-state", this._onRoomState);
    this.socket.on("error-msg", this._onError);

    // 场景退出时解绑监听，避免重复
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
  // 把你原来 create() 里 “// Background” 之后那一大段 UI 原封不动搬到这里
  // （我已经帮你搬好了）
  // =========================
  initGameUI() {
    // Background
    if (this.textures.exists("boardSvg")) {
      const bg = this.add.image(640, 360, "boardSvg");
      bg.setAlpha(0.25);
      const sx = 1280 / bg.width;
      const sy = 720 / bg.height;
      bg.setScale(Math.min(sx, sy));
    }

    // UI
    this.ui.phase = this.add.text(16, 12, "phase:", { fontSize: "18px", color: "#fff" });
    this.ui.round = this.add.text(16, 36, "round:", { fontSize: "18px", color: "#fff" });
    this.ui.tip = this.add.text(16, 64, "", { fontSize: "14px", color: "#cbd5e1", lineSpacing: 6 });

    this.add.text(1040, 8, "Controls", { fontSize: "16px", color: "#e5e7eb" });

    // ⚠️ 这里仍然用你原来的事件名（SET_TEAM/START_GAME/NEXT_PHASE...）
    // 因为你服务端目前就是按这套跑的（你之前“能玩”的那套）
    this.mkBtn(1040, 32, "[TEAM A]", "#f472b6", () =>
      this.socket.emit("SET_TEAM", { roomId: ClientState.me.roomId, team: "A" })
    );
    this.mkBtn(1120, 32, "[TEAM B]", "#38bdf8", () =>
      this.socket.emit("SET_TEAM", { roomId: ClientState.me.roomId, team: "B" })
    );

    // 你未来要把“开始游戏”从 BoardScene 移到 LobbyScene，这里按钮可以保留做调试
    this.mkBtn(1040, 56, "[START]", "#34d399", () =>
      this.socket.emit("START_GAME", { roomId: ClientState.me.roomId })
    );
    this.mkBtn(1120, 56, "[NEXT]", "#60a5fa", () =>
      this.socket.emit("NEXT_PHASE", { roomId: ClientState.me.roomId })
    );

    this.mkBtn(1040, 92, "[SUBMIT PLAN]", "#a78bfa", () => {
      const st = ClientState.room;
      if (!st) return;
      this.socket.emit("SUBMIT_PLAN", { roomId: st.roomId, plan: ClientState.planDraft });
    });

    this.mkBtn(1040, 116, "[RESOLVE ACTION]", "#fbbf24", () => {
      const st = ClientState.room;
      if (!st) return;
      this.socket.emit("RESOLVE_NEXT_ACTION", { roomId: st.roomId });
    });

    this.add.text(1040, 156, "QUIZ/SOLVE", { fontSize: "16px", color: "#e5e7eb" });
    this.mkBtn(1040, 180, "[ASK]", "#f87171", () => this.handleAsk());
    this.mkBtn(1120, 180, "[PICK TABLE]", "#22c55e", () => this.handlePickSolveTable());
    this.mkBtn(1040, 204, "[PICK Q]", "#22c55e", () => this.handlePickQuestion());
    this.mkBtn(1120, 204, "[ATTEMPT]", "#eab308", () => this.handleAttempt());

    this.mkBtn(1040, 660, "[CLEAR PLAN]", "#94a3b8", () => { ClientState.planDraft = []; });
  }

  mkBtn(x, y, text, color, onClick) {
    return this.add.text(x, y, text, { fontSize: "14px", color })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

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
          if (ClientState.planDraft.find(x => x.tokenId === tokenId)) return;
          if (ClientState.planDraft.length >= state.rules.maxTracksPerRound) return;
          ClientState.planDraft.push({ tokenId, toTableId: t.id });
        }
      });

      this.tableZones.set(t.id, zone);
    }
  }

  ensureTokenSprite(tokenId, token) {
    if (this.tokenSprites.has(tokenId)) return this.tokenSprites.get(tokenId);

    const c = this.add.circle(0, 0, 12, token.team === "A" ? 0xf472b6 : 0x38bdf8)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(0, 0, tokenId.split("_")[1], { fontSize: "12px", color: "#111827" })
      .setOrigin(0.5);

    c.on("pointerdown", () => { ClientState.selectedTokenId = tokenId; });

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
    this.ui.phase.setText(`phase: ${state.phase}`);
    this.ui.round.setText(`round: ${state.round}`);

    if (!this._tablesDrawn) {
      this.drawTablesFromConfig(state);
      this._tablesDrawn = true;
    }

    const me = state.players[this.socket.id];
    const myTeam = me?.team ?? "?";
    const selected = ClientState.selectedTokenId ? `token=${ClientState.selectedTokenId}` : "token=none";
    const dest = ClientState.selectedTableId ? `table=${ClientState.selectedTableId}` : "table=none";
    const planStr = ClientState.planDraft.map(p => `${p.tokenId}->${p.toTableId}`).join(", ");
    const actionStr = state.activeAction ? `${state.activeAction.pid.slice(0,4)}:${state.activeAction.tokenId}->${state.activeAction.toTableId}` : "none";
    const solveStr = state.solve ? `pickerTeam=${state.solve.pickerTeam}, pickedTable=${state.solve.pickedTableId ?? "none"}, pickedQ=${state.solve.pickedQuestionId ?? "none"}` : "";

    let qList = "";
    if (state.phase === "SOLVE" && state.solve?.pickedTableId) {
      const t = state.tables[state.solve.pickedTableId];
      const pending = t.questionIds.filter(id => state.questions[id]?.pending);
      qList = `\nQs: ${pending.slice(0,8).map(id => id.slice(0,6)).join(", ")} (use PICK Q enter full id)`;
    }

    this.ui.tip.setText(
      `you: ${ClientState.me.name} (${myTeam})\n` +
      `select: ${selected}, ${dest}\n` +
      `planDraft(${ClientState.planDraft.length}): ${planStr || "—"}\n` +
      `activeAction: ${actionStr}\n` +
      `contested: ${(state.contestedTableIds||[]).join(", ") || "—"}\n` +
      `solve: ${solveStr}${qList}\n` +
      (state.lastSolveResult ? `lastSolve: ${JSON.stringify(state.lastSolveResult)}` : "")
    );

    this.placeTokens(state);
  }

  handleAsk() {
    const state = ClientState.room;
    if (!state) return;
    if (state.phase !== "QUIZ") return alert("Not in QUIZ");
    const tableId = ClientState.selectedTableId;
    const fromTokenId = ClientState.selectedTokenId;
    if (!tableId || !fromTokenId) return alert("Select a table and your token first");
    const spendLogic = Number(prompt("出题扣除逻辑 spendLogic", "1") || "0");
    const spendMemory = Number(prompt("出题扣除记忆 spendMemory", "1") || "0");
    this.socket.emit("ASK_QUESTION", { roomId: state.roomId, tableId, fromTokenId, spendLogic, spendMemory, modifiers: {} });
  }

  handlePickSolveTable() {
    const state = ClientState.room;
    if (!state) return;
    if (state.phase !== "SOLVE") return alert("Not in SOLVE");
    const tableId = ClientState.selectedTableId;
    if (!tableId) return alert("Select a table first");
    this.socket.emit("PICK_SOLVE_TABLE", { roomId: state.roomId, tableId });
  }

  handlePickQuestion() {
    const state = ClientState.room;
    if (!state) return;
    if (state.phase !== "SOLVE") return alert("Not in SOLVE");
    if (!state.solve?.pickedTableId) return alert("Pick a table first");
    const qid = prompt("输入 questionId（服务器生成 UUID，全量）", "");
    if (!qid) return;
    this.socket.emit("PICK_QUESTION", { roomId: state.roomId, questionId: qid });
  }

  handleAttempt() {
    const state = ClientState.room;
    if (!state) return;
    if (state.phase !== "SOLVE") return alert("Not in SOLVE");
    const qid = state.solve?.pickedQuestionId;
    if (!qid) return alert("Pick a question first");
    const solverTokenIds = (prompt("参与解题 tokenId（逗号分隔，首个为主解题者）", ClientState.selectedTokenId || "") || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const spendLogic = Number(prompt("主解题者扣除逻辑 spendLogic", "1") || "0");
    const spendMemory = Number(prompt("主解题者扣除记忆 spendMemory", "1") || "0");
    this.socket.emit("ATTEMPT_SOLVE", { roomId: state.roomId, questionId: qid, solverTokenIds, spendLogic, spendMemory, modifiers: {} });
  }
}
