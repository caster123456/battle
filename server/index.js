import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const rooms = {};
const SUBJECT_POOL = ["语文", "数学", "英语", "物理", "化学", "生物"];

/**
 * ===== CORS（Render / Node 22 安全写法）=====
 */
const ALLOWED_ORIGINS =
  process.env.CORS_ORIGINS && process.env.CORS_ORIGINS !== "*"
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
    : "*";

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * ===== Socket.io =====
 */
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

/**
 * =========================
 * 小工具函数（统一出口）
 * =========================
 */
function getOrCreateRoom(roomId, hostSocketId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      hostId: hostSocketId,
      phase: "LOBBY",
      mode: "SIX",
      players: {},
      draft: null,
    };
  }
  return rooms[roomId];
}

function buildRoomState(roomId, room) {
  return {
    roomId,
    phase: room.phase,
    round: room.round ?? 0,

    // 选学科草稿
    draft: room.draft || null,

    // 玩家信息（包含 team/seat/subject/card）
    players: room.players,

    hostId: room.hostId,
    mode: room.mode,

    // ✅ 正式游戏需要的最小字段（防止前端旧逻辑崩）
    map: room.game?.map || null,
    tables: room.game?.tables || null,
    tokens: room.game?.tokens || null,
    rules: room.game?.rules || null,
    contestedTableIds: room.game?.contestedTableIds || [],
    activeAction: room.game?.activeAction || null,
  };
}


function emitRoomStateToRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit("ROOM_STATE", buildRoomState(roomId, room));
}

function emitRoomStateToSocket(socket, roomId) {
  const room = rooms[roomId];
  if (!room) return;
  socket.emit("ROOM_STATE", buildRoomState(roomId, room));
}

function emitRoomUpdate(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  const payload = {
    ...room,
    hostName: room.players?.[room.hostId]?.name || "",
  };
  io.to(roomId).emit("room-update", payload);
  return payload;
}

function ensureHost(room, fallbackSocketId) {
  if (!room.hostId || !room.players[room.hostId]) {
    room.hostId = fallbackSocketId;
  }
}

function startPickSubjectPhase(roomId) {
  const room = rooms[roomId];
  if (!room) return false;

  const players = Object.values(room.players);
  if (players.length < 6) return false;

  const ids = Object.keys(room.players);

  // 分队：前3 A，后3 B（先固定，后面你想随机再改）
  ids.forEach((pid, idx) => {
    room.players[pid].team = idx < 3 ? "A" : "B";
    room.players[pid].seat = idx + 1; // 1..6
  });

  // 轮次：A1,B1,A2,B2,A3,B3
  const A = ids.filter((id) => room.players[id].team === "A");
  const B = ids.filter((id) => room.players[id].team === "B");

  A.sort((x, y) => room.players[x].seat - room.players[y].seat);
  B.sort((x, y) => room.players[x].seat - room.players[y].seat);

  const order = [];
  for (let i = 0; i < 3; i++) {
    order.push(A[i]);
    order.push(B[i]);
  }

  room.phase = "PICK_SUBJECT";
  room.draft = {
    phase: "PICK_SUBJECT",
    pool: [...SUBJECT_POOL],
    picksByPlayer: {},
    order,
    turnIndex: 0,
    currentPlayerId: order[0],
  };

  return true;
}
function makeEmptyCards(count) {
  // 空白卡：技能/特性都为空，先占位
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({
      id: `EMPTY_${i + 1}`,
      name: `空白卡${i + 1}`,
      desc: "（占位卡，暂无技能）",
      skill: null,
      trait: null,
    });
  }
  return cards;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 学科全选完 -> 记录到 player.subject
 * 然后跳过真实选牌：随机发空白卡 -> 直接进入 IN_GAME
 */
function finishSubjectAndStartGame(roomId) {
  const room = rooms[roomId];
  if (!room || !room.draft) return false;

  const d = room.draft;
  if (room.phase !== "PICK_SUBJECT") return false;

  // 是否都选完：6人局就是 order.length；你放宽人数也没事
  const total = d.order?.length || Object.keys(room.players).length;
  const pickedCount = Object.keys(d.picksByPlayer || {}).length;
  if (pickedCount < total) return false;

  // 1) 把学科写入到玩家身上（前端更好显示）
  for (const pid of Object.keys(room.players)) {
    room.players[pid].subject = d.picksByPlayer?.[pid] || null;
  }

  // 2) “跳过选牌”：发空白卡
  const ids = Object.keys(room.players);
  const deck = shuffleInPlace(makeEmptyCards(ids.length));
  ids.forEach((pid, idx) => {
    room.players[pid].card = deck[idx]; // 每人一张占位卡
  });

  // 3) 进入正式游戏
  room.phase = "IN_GAME";
  room.round = 1;

  // ✅ 给 BoardScene 一个最小可用的 gameState，避免你旧逻辑报错
  room.game = room.game || {};
  room.game.map = room.game.map || { tables: [] };
  room.game.tables = room.game.tables || {};
  room.game.tokens = room.game.tokens || {};
  room.game.rules = room.game.rules || { maxTracksPerRound: 3 };
  room.game.contestedTableIds = room.game.contestedTableIds || [];
  room.game.activeAction = room.game.activeAction || null;

  return true;
}

/**
 * =========================
 * Socket handlers
 * =========================
 */
io.on("connection", (socket) => {
  // 进入房间
  socket.on("join-room", ({ roomId, name }) => {
    if (!roomId) return;

    const room = getOrCreateRoom(roomId, socket.id);

    // 确保房主存在
    ensureHost(room, socket.id);

    // 写入玩家
    room.players[socket.id] = {
      id: socket.id,
      name: name || "player",
      ready: false,
    };

    socket.data.roomId = roomId;
    socket.join(roomId);

    // 广播 Lobby 信息
    emitRoomUpdate(roomId);

    // ✅ 单播当前 ROOM_STATE（刚加入的人立刻知道阶段）
    emitRoomStateToSocket(socket, roomId);
  });

  // ✅ 新增：前端进入 BoardScene 后主动要一次状态（防止错过 ROOM_STATE）
  socket.on("request-room-state", ({ roomId }) => {
    if (!roomId) return;
    emitRoomStateToSocket(socket, roomId);
  });

  // 准备/取消准备
  socket.on("toggle-ready", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players[socket.id];
    if (!player) return;

    player.ready = !player.ready;

    emitRoomUpdate(roomId);
    emitRoomStateToRoom(roomId);
  });

  // 房主开始游戏：进入选学科阶段
  socket.on("start-game", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    // 只有房主能开始
    if (socket.id !== room.hostId) return;

    const players = Object.values(room.players);

    // 所有人必须准备
    const allReady = players.every((p) => p.ready);
    if (!allReady) return;

    // 必须满 6 人
    if (players.length < 6) return;

    // 进入 PICK_SUBJECT
    const ok = startPickSubjectPhase(roomId);
    if (!ok) return;

    const payload = emitRoomUpdate(roomId);
    io.to(roomId).emit("game-start", payload);

    emitRoomStateToRoom(roomId);
  });

  // 玩家选学科（严格到当前玩家）
  socket.on("pick-subject", ({ roomId, subject }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.phase !== "PICK_SUBJECT") return;

    const d = room.draft;
    if (!d || d.phase !== "PICK_SUBJECT") return;

    // 只有轮到的玩家能选
    if (socket.id !== d.currentPlayerId) return;

    // 必须在池子里
    if (!d.pool.includes(subject)) return;

    // 不能重复选
    if (d.picksByPlayer[socket.id]) return;

    // 选
    d.picksByPlayer[socket.id] = subject;
    d.pool = d.pool.filter((x) => x !== subject);

    // 推进轮次
    d.turnIndex += 1;

    if (d.turnIndex >= d.order.length || d.pool.length === 0) {
      d.phase = "DONE";
    
      finishSubjectAndStartGame(roomId);
    } else {
      d.currentPlayerId = d.order[d.turnIndex];
    }
    
    emitRoomUpdate(roomId);
    emitRoomStateToRoom(roomId);

    console.log(
      "[PICK_SUBJECT]",
      roomId,
      "picked",
      subject,
      "by",
      socket.id,
      "next",
      d.currentPlayerId
    );
  });

  // 你原来的同步（保留）
  socket.on("state-update", ({ roomId, state }) => {
    socket.to(roomId).emit("state-update", state);
  });

  // 断开连接
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    delete room.players[socket.id];

    const ids = Object.keys(room.players);
    if (ids.length === 0) {
      delete rooms[roomId];
      return;
    }

    // 房主走了就换一个
    if (room.hostId === socket.id) {
      room.hostId = ids[0];
    }

    emitRoomUpdate(roomId);
    emitRoomStateToRoom(roomId);
  });
});

/**
 * ===== 启动服务 =====
 */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
