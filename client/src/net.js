import { io } from "socket.io-client";

/**
 * Domain-ready socket endpoint selection
 * 1) VITE_SOCKET_URL (recommended) e.g. https://your-domain.com
 * 2) window.__SOCKET_URL__ (optional, injected by hosting page)
 * 3) fallback: http://localhost:3001
 *
 * IMPORTANT:
 * - When you have a domain with HTTPS, you should use https://<domain>
 *   Socket.io will upgrade to wss automatically.
 */
export function createNet() {
  const envUrl = import.meta?.env?.VITE_SOCKET_URL;
  const winUrl = typeof window !== "undefined" ? window.__SOCKET_URL__ : undefined;
  const base = envUrl || winUrl || "http://localhost:3001";
  return io(base, { transports: ["websocket"] });
}
