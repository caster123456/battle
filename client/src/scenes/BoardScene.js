
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
  }

  preload() {
    // SVG background (optional)
    this.load.svg("boardSvg", new URL("../assets/map.svg", import.meta.url).toString());
  }

  create() {
    this.socket = createNet();

    ClientState.me.name = prompt("昵称", "xhm") || "player";
    ClientState.me.roomId = prompt("房间号", "room1") || "room1";
    this.socket.emit("JOIN_ROOM", { roomId: ClientState.me.roomId, name: ClientState.me.name });

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

    this.mkBtn(1040, 32, "[TEAM A]", "#f472b6", () => this.socket.emit("SET_TEAM", { roomId: ClientState.me.roomId, team: "A" }));
    this.mkBtn(1120, 32, "[TEAM B]", "#38bdf8", () => this.socket.emit("SET_TEAM", { roomId: ClientState.me.roomId, team: "B" }));
    this.mkBtn(1040, 56, "[START]", "#34d399", () => this.socket.emit("START_GAME", { roomId: ClientState.me.roomId }));
    this.mkBtn(1120, 56, "[NEXT]", "#60a5fa", () => this.socket.emit("NEXT_PHASE", { roomId: ClientState.me.roomId }));

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

    this.socket.on("ROOM_STATE", (state) => {
      ClientState.room = state;
      this.render(state);
    });

    this.socket.on("ERROR", ({ message }) => alert(message));
  }

  mkBtn(x, y, text, color, onClick) {
    return this.add.text(x, y, text, { fontSize: "14px", color })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  drawTablesFromConfig(state) {
    // Clear existing zones
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
        // In planning: click table after selecting token to add a track
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

    // list questions on picked table for convenience
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
