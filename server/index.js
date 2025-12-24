import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

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
    socket.join(roomId);
    socket.data.name = name;
    io.to(roomId).emit("system", `${name} joined ${roomId}`);
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
