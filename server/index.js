
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

import { makeInitialRoomState, sanitizeForClient } from "./src/state.js";
import { computeTurnOrderFromPlans } from "./src/rules/phases.js";
import { applyMove } from "./src/rules/movement.js";
import {
  listContestedTables,
  canAskOnTable,
  canSolveOnTable,
  resolveAttempt,
  autoOccupyTables,
  applyResourceIncome
} from "./src/rules/quiz_solve.js";
import { nextPhase } from "./src/rules/flow.js";

const app = express();
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "*");
app.use(cors({ origin: ALLOWED_ORIGINS === "*" ? "*" : ALLOWED_ORIGINS.split(",").map(s=>s.trim()), credentials: true }));
app.get("/health", (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "*");
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS === "*" ? "*" : ALLOWED_ORIGINS.split(",").map(s=>s.trim()) } });

const rooms = new Map(); // roomId -> { state }

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { state: makeInitialRoomState(roomId) });
  return rooms.get(roomId);
}
function broadcast(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("ROOM_STATE", sanitizeForClient(room.state));
}
function err(socket, msg) {
  socket.emit("ERROR", { message: msg });
}

io.on("connection", (socket) => {
  socket.on("JOIN_ROOM", ({ roomId = "room1", name = "player" }) => {
    const room = getRoom(roomId);
    socket.join(roomId);

    if (!room.state.players[socket.id]) {
      room.state.players[socket.id] = { id: socket.id, name, team: null, score: 0, resource: 0 };
    } else {
      room.state.players[socket.id].name = name;
    }
    broadcast(roomId);
  });

  socket.on("SET_TEAM", ({ roomId, team }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (!["A", "B"].includes(team)) return err(socket, "Invalid team");
    if (!room.state.players[socket.id]) return err(socket, "Not in room");
    room.state.players[socket.id].team = team;
    broadcast(roomId);
  });

  socket.on("START_GAME", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "LOBBY") return err(socket, "Game already started");

    const pids = Object.keys(room.state.players);
    if (pids.length < 2) return err(socket, "Need at least 2 players");

    // Auto-balance teams for unset players (hook: real 3v3 assign)
    const teams = { A: 0, B: 0 };
    for (const pid of pids) {
      const t = room.state.players[pid].team;
      if (t === "A") teams.A++;
      if (t === "B") teams.B++;
    }
    for (const pid of pids) {
      if (!room.state.players[pid].team) {
        room.state.players[pid].team = teams.A <= teams.B ? "A" : "B";
        teams[room.state.players[pid].team]++;
      }
    }

    // Init tokens: 6 per player (matches your core logic). Hook: decks/roles.
    room.state.turnOrder = [...pids];
    room.state.previousTurnOrder = [...pids];
    for (const pid of pids) {
      for (let i = 0; i < 6; i++) {
        const tokenId = `${pid.slice(0, 4)}_${i}`;
        const team = room.state.players[pid].team;
        const tableId = room.state.map.spawnTableIdByTeam[team] ?? room.state.map.defaultSpawnTableId;
        room.state.tokens[tokenId] = {
          id: tokenId,
          owner: pid,
          team,
          roleId: "STUDENT_BASIC",
          logic: 3,
          memory: 3,
          exec: 3,
          stress: 0,
          home: false,
          tableId
        };
        room.state.tables[tableId].tokens.push(tokenId);
      }
    }

    room.state.round = 1;
    room.state.phase = "PLANNING";
    room.state.plans = {};
    room.state.actionQueue = [];
    room.state.activeAction = null;
    room.state.questions = {};
    room.state.contestedTableIds = [];
    room.state.solve = { pickerTeam: "A", pickedTableId: null, pickedQuestionId: null };
    broadcast(roomId);
  });

  socket.on("SUBMIT_PLAN", ({ roomId, plan }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "PLANNING") return err(socket, "Not in PLANNING");
    if (!Array.isArray(plan)) return err(socket, "plan must be array");
    if (plan.length > room.state.rules.maxTracksPerRound) return err(socket, "Too many tracks");

    const seen = new Set();
    for (const step of plan) {
      const { tokenId, toTableId } = step || {};
      if (!room.state.tokens[tokenId]) return err(socket, `Unknown token ${tokenId}`);
      if (room.state.tokens[tokenId].owner !== socket.id) return err(socket, "You can only move your tokens");
      if (!room.state.tables[toTableId]) return err(socket, `Unknown table ${toTableId}`);
      if (seen.has(tokenId)) return err(socket, "Each track must use a different token");
      seen.add(tokenId);
    }
    room.state.plans[socket.id] = plan;

    const all = room.state.turnOrder.every(pid => Array.isArray(room.state.plans[pid]));
    if (all) {
      room.state.turnOrder = computeTurnOrderFromPlans(room.state);
      room.state.actionQueue = [];
      for (const pid of room.state.turnOrder) {
        for (let idx = 0; idx < room.state.plans[pid].length; idx++) {
          room.state.actionQueue.push({ pid, idx, ...room.state.plans[pid][idx] });
        }
      }
      room.state.activeAction = null;
      room.state.phase = "ACTION";
    }
    broadcast(roomId);
  });

  socket.on("RESOLVE_NEXT_ACTION", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "ACTION") return err(socket, "Not in ACTION");

    const next = room.state.actionQueue.shift();
    if (!next) {
      room.state.activeAction = null;
      room.state.phase = "QUIZ";
      room.state.contestedTableIds = listContestedTables(room.state);
      return broadcast(roomId);
    }

    room.state.activeAction = next;
    room.state.lastActionResult = applyMove(room.state, next.tokenId, next.toTableId);
    broadcast(roomId);
  });

  socket.on("ASK_QUESTION", ({ roomId, tableId, fromTokenId, spendLogic, spendMemory, modifiers }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "QUIZ") return err(socket, "Not in QUIZ");
    if (!canAskOnTable(room.state, socket.id, tableId, fromTokenId)) return err(socket, "Cannot ask here");
    const token = room.state.tokens[fromTokenId];

    spendLogic = Math.max(0, Math.floor(spendLogic ?? 0));
    spendMemory = Math.max(0, Math.floor(spendMemory ?? 0));
    if (spendLogic + spendMemory <= 0) return err(socket, "Spend must be > 0");
    if (token.logic < spendLogic || token.memory < spendMemory) return err(socket, "Not enough attributes");

    // REQUIRED: ask consumes attributes immediately
    token.logic -= spendLogic;
    token.memory -= spendMemory;

    const qid = uuidv4();
    room.state.questions[qid] = {
      id: qid,
      tableId,
      fromTokenId,
      fromPlayerId: socket.id,
      team: token.team,
      X: spendLogic,
      Y: spendMemory,
      modifiers: modifiers ?? {},
      pending: true
    };
    room.state.tables[tableId].questionIds.push(qid);
    broadcast(roomId);
  });

  socket.on("NEXT_PHASE", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    nextPhase(room.state);

    if (room.state.phase === "SOLVE") {
      // ensure pickerTeam exists
      room.state.solve = room.state.solve ?? { pickerTeam: "A", pickedTableId: null, pickedQuestionId: null };
    }

    if (room.state.phase === "SETTLE") autoOccupyTables(room.state);

    if (room.state.phase === "RESOURCE") {
      applyResourceIncome(room.state);
      room.state.round += 1;
      if (room.state.round > room.state.rules.maxRounds) {
        room.state.phase = "GAME_OVER";
      } else {
        room.state.phase = "PLANNING";
        room.state.plans = {};
        room.state.actionQueue = [];
        room.state.activeAction = null;
        room.state.contestedTableIds = [];
      }
    }
    broadcast(roomId);
  });

  socket.on("PICK_SOLVE_TABLE", ({ roomId, tableId }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "SOLVE") return err(socket, "Not in SOLVE");
    const me = room.state.players[socket.id];
    if (!me) return err(socket, "Not a player");
    if (me.team !== room.state.solve.pickerTeam) return err(socket, "Not your team to pick");
    if (!canSolveOnTable(room.state, tableId)) return err(socket, "Table not solvable");
    room.state.solve.pickedTableId = tableId;
    room.state.solve.pickedQuestionId = null;
    broadcast(roomId);
  });

  socket.on("PICK_QUESTION", ({ roomId, questionId }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "SOLVE") return err(socket, "Not in SOLVE");
    const q = room.state.questions[questionId];
    if (!q || !q.pending) return err(socket, "Question not available");
    if (room.state.solve.pickedTableId !== q.tableId) return err(socket, "Question not on picked table");
    room.state.solve.pickedQuestionId = questionId;
    broadcast(roomId);
  });

  socket.on("ATTEMPT_SOLVE", ({ roomId, questionId, solverTokenIds, spendLogic, spendMemory, modifiers }) => {
    const room = rooms.get(roomId);
    if (!room) return err(socket, "Room not found");
    if (room.state.phase !== "SOLVE") return err(socket, "Not in SOLVE");

    const me = room.state.players[socket.id];
    if (!me) return err(socket, "Not a player");
    if (me.team !== room.state.solve.pickerTeam) return err(socket, "Not your team to act");

    const q = room.state.questions[questionId];
    if (!q || !q.pending) return err(socket, "Question not available");

    if (!Array.isArray(solverTokenIds) || solverTokenIds.length < 1) return err(socket, "Need solver tokens");
    for (const tid of solverTokenIds) {
      const t = room.state.tokens[tid];
      if (!t) return err(socket, "Unknown solver token");
      if (t.team !== me.team) return err(socket, "Can only use your team tokens");
      if (t.home) return err(socket, "Home token cannot solve");
      if (t.tableId !== q.tableId) return err(socket, "Solver token must be on the table");
    }

    // REQUIRED: solver consumes attributes immediately (primary only)
    const primary = room.state.tokens[solverTokenIds[0]];
    spendLogic = Math.max(0, Math.floor(spendLogic ?? 0));
    spendMemory = Math.max(0, Math.floor(spendMemory ?? 0));
    if (spendLogic + spendMemory <= 0) return err(socket, "Spend must be > 0");
    if (primary.logic < spendLogic || primary.memory < spendMemory) return err(socket, "Not enough attributes");
    primary.logic -= spendLogic;
    primary.memory -= spendMemory;

    room.state.lastSolveResult = resolveAttempt(room.state, {
      questionId,
      solverPlayerId: socket.id,
      solverTokenIds,
      spendLogic,
      spendMemory,
      modifiers: modifiers ?? {}
    });

    // Alternate pick team
    room.state.solve.pickerTeam = room.state.solve.pickerTeam === "A" ? "B" : "A";
    room.state.solve.pickedTableId = null;
    room.state.solve.pickedQuestionId = null;

    broadcast(roomId);
  });
});

server.listen(3001, () => console.log("Server on http://localhost:3001"));
