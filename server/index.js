import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const rooms = {};

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
  socket.on("join-room", ({ roomId, name }) => {
  if (!rooms[roomId]) {
    // 第一个人 = 房主
    rooms[roomId] = {
      hostId: socket.id,
      phase: "LOBBY", // LOBBY | IN_GAME
      mode: "SIX",    // SIX | SINGLE
      players: {}
    };
  }

  const room = rooms[roomId];

  room.players[socket.id] = {
    id: socket.id,
    name,
    ready: false
  };

  socket.join(roomId);

  io.to(roomId).emit("room-update", room);
});
      // ===== 准备 / 取消准备 =====
  socket.on("toggle-ready", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players[socket.id];
    if (!player) return;

    player.ready = !player.ready;

    io.to(roomId).emit("room-update", room);
  });
    // ===== 房主开始游戏 =====
  socket.on("start-game", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    // 只有房主能点开始
    if (socket.id !== room.hostId) return;

    const players = Object.values(room.players);

    // 所有人必须准备
    const allReady = players.every(p => p.ready);

    // 人数校验（单人测试 / 6人正式）
    const enoughPlayers =
      room.mode === "SINGLE" || players.length >= 6;

    if (!allReady || !enoughPlayers) return;

    room.phase = "IN_GAME";

    io.to(roomId).emit("game-start", room);
  });

  socket.on("state-update", ({ roomId, state }) => {
    socket.to(roomId).emit("state-update", state);
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
