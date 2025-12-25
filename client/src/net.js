import { io } from "socket.io-client";

/**
 * Socket endpoint selection (robust)
 * 1) VITE_SOCKET_URL (Vercel/Vite build-time)
 * 2) window.__SOCKET_URL__ (optional runtime injection)
 * 3) fallback: Render server (so it never goes to localhost online)
 */
export function createNet() {
  const envUrl = import.meta?.env?.VITE_SOCKET_URL;
  const winUrl = typeof window !== "undefined" ? window.__SOCKET_URL__ : undefined;

  // ✅ 关键：不要再 fallback 到 localhost（线上必失败）
  const base =
    envUrl ||
    winUrl ||
    "https://classroom-battle-server-fm1p.onrender.com";

  console.log("[NET] connecting to =", base);

  return io(base, {
    transports: ["websocket"],
  });
}
