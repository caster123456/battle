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

  // 房主开始游戏
  socket.on("start-game", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (socket.id !== room.hostId) return;

    const players = Object.values(room.players);
    const allReady = players.every(p => p.ready);
    const enoughPlayers = room.mode === "SINGLE" || players.length >= 6;

    if (!allReady || !enoughPlayers) return;

    room.phase = "IN_GAME";

    const payload = {
      ...room,
      hostName: room.players?.[room.hostId]?.name || ""
    };

    io.to(roomId).emit("game-start", payload);
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
