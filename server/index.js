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
 * 不要重复声明变量，否则 Render 会直接崩
 */
const ALLOWED_ORIGINS =
  process.env.CORS_ORIGINS && process.env.CORS_ORIGINS !== "*"
    ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
    : "*";

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

/**
 * ===== 健康检查（非常重要）=====
 * 用来判断 Render 是否部署成功
 */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * ===== Socket.io 联机 =====
 */
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

io.on("connection", (socket) => {

  // 进入房间
  socket.on("join-room", ({ roomId, name }) => {
    if (!roomId) return;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        hostId: socket.id,
        phase: "LOBBY",
        mode: "SIX",
        players: {}
      };
    }

    const room = rooms[roomId];

    // 如果房主丢了/不存在，补一个房主
    if (!room.hostId || !room.players[room.hostId]) {
      room.hostId = socket.id;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: name || "player",
      ready: false
    };

    socket.data.roomId = roomId;
    socket.join(roomId);

    const payload = {
      ...room,
      hostName: room.players?.[room.hostId]?.name || ""
    };

    io.to(roomId).emit("room-update", payload);
  });

  // 准备/取消准备
  socket.on("toggle-ready", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players[socket.id];
    if (!player) return;

    player.ready = !player.ready;

    const payload = {
      ...room,
      hostName: room.players?.[room.hostId]?.name || ""
    };

    io.to(roomId).emit("room-update", payload);
  });

  // 房主开始游戏：进入“选学科阶段”
socket.on("start-game", ({ roomId }) => {
  const room = rooms[roomId];
  if (!room) return;

  // 只有房主能开始
  if (socket.id !== room.hostId) return;

  const players = Object.values(room.players);

  // 所有人必须准备
  const allReady = players.every(p => p.ready);
  if (!allReady) return;

  // 必须满 6 人（你要单人测试开6人，后面再加开关）
  if (players.length < 6) return;

  // ✅ 给玩家分队：加入顺序前3个A，后3个B（先稳定方便测试）
  const ids = Object.keys(room.players);
  ids.forEach((pid, idx) => {
    room.players[pid].team = idx < 3 ? "A" : "B";
    room.players[pid].seat = idx + 1; // 1..6
  });

  // ✅ 生成严格到玩家的轮次：A1,B1,A2,B2,A3,B3
  const A = ids.filter(id => room.players[id].team === "A");
  const B = ids.filter(id => room.players[id].team === "B");

  // 按 seat 排序（保证稳定）
  A.sort((x, y) => room.players[x].seat - room.players[y].seat);
  B.sort((x, y) => room.players[x].seat - room.players[y].seat);

  const order = [];
  for (let i = 0; i < 3; i++) {
    order.push(A[i]);
    order.push(B[i]);
  }

  // ✅ 初始化 draft
  room.phase = "PICK_SUBJECT";
  room.draft = {
    phase: "PICK_SUBJECT",
    pool: [...SUBJECT_POOL],      // 剩余可选学科
    picksByPlayer: {},            // { socketId: "语文" }
    order,                        // 轮次玩家列表（长度6）
    turnIndex: 0,                 // 当前第几手
    currentPlayerId: order[0],    // 当前该谁选
  };

  const payload = {
    ...room,
    hostName: room.players?.[room.hostId]?.name || ""
  };

  // ✅ 仍然发 game-start：让前端从 Lobby 切到 Board
  io.to(roomId).emit("room-update", payload);
  io.to(roomId).emit("game-start", payload);

  // ✅ 同步一个游戏状态（BoardScene 会用到）
  io.to(roomId).emit("ROOM_STATE", {
    roomId,
    phase: room.phase,
    draft: room.draft,
    players: room.players,
  });
});
  // 玩家选学科（严格到当前玩家）
socket.on("pick-subject", ({ roomId, subject }) => {
  const room = rooms[roomId];
  if (!room) return;

  if (room.phase !== "PICK_SUBJECT") return;

  const d = room.draft;
  if (!d || d.phase !== "PICK_SUBJECT") return;

  // ✅ 只有轮到的玩家能选
  if (socket.id !== d.currentPlayerId) return;

  // ✅ 必须是池子里的学科
  if (!d.pool.includes(subject)) return;

  // ✅ 不能重复选
  if (d.picksByPlayer[socket.id]) return;

  // 执行选牌
  d.picksByPlayer[socket.id] = subject;
  d.pool = d.pool.filter(x => x !== subject);

  // 推进轮次
  d.turnIndex += 1;

  // 是否结束
  if (d.turnIndex >= d.order.length || d.pool.length === 0) {
    d.phase = "DONE";
    room.phase = "PICK_CARD"; // 下一阶段（占位）
  } else {
    d.currentPlayerId = d.order[d.turnIndex];
  }

  const payload = {
    ...room,
    hostName: room.players?.[room.hostId]?.name || ""
  };

  // Lobby & Board 都更新
  io.to(roomId).emit("room-update", payload);

  // Board 用的游戏状态
  io.to(roomId).emit("ROOM_STATE", {
    roomId,
    phase: room.phase,
    draft: room.draft,
    players: room.players,
  });

  console.log("[PICK_SUBJECT]", roomId, "picked", subject, "by", socket.id, "next", d.currentPlayerId);
});


  // 你原来的同步（留着）
  socket.on("state-update", ({ roomId, state }) => {
    socket.to(roomId).emit("state-update", state);
  });

  // 断开连接：清理玩家、必要时转移房主
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

    if (room.hostId === socket.id) {
      room.hostId = ids[0];
    }

    const payload = {
      ...room,
      hostName: room.players?.[room.hostId]?.name || ""
    };

    io.to(roomId).emit("room-update", payload);
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
