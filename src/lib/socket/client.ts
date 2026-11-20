"use client";

import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./types";

export type WorkPulseClientSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

let socketInstance: WorkPulseClientSocket | null = null;
let currentConnectedUserId: string | null = null;
let pendingConnectPromise: Promise<WorkPulseClientSocket | null> | null = null;

/**
 * Determine the Socket.IO server URL.
 * 1. Honors explicit NEXT_PUBLIC_SOCKET_URL if provided.
 * 2. On Vercel deployments (*.vercel.app), falls back to the persistent Render Web Service.
 * 3. In local browser development, uses port 3001.
 */
export function getSocketServerUrl(): string {
  // 1. Explicit public socket URL takes highest priority
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL.replace(/\/$/, "");
  }

  // 2. Server-side environment variable (for Server Actions on Vercel)
  if (process.env.SOCKET_SERVER_URL) {
    return process.env.SOCKET_SERVER_URL.replace(/\/$/, "");
  }

  // 3. Client-side browser resolution
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // Local development: standalone socket runs on port 3001
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const protocol = window.location.protocol;
      return `${protocol}//${hostname}:3001`;
    }
    // If running on Render directly, Socket.IO is on standard port 443 of the same host
    if (hostname.includes("onrender.com")) {
      return `${window.location.protocol}//${hostname}`;
    }
    // On Vercel or any other domain, connect to the persistent Render WebSocket service
    return "https://workplace-next-js.onrender.com";
  }

  // 4. Server-side fallback (Vercel serverless functions dispatching internal broadcasts)
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return "https://workplace-next-js.onrender.com";
  }

  // Local server fallback
  return "http://localhost:3001";
}

/**
 * Fetch a short-lived signed socket token and current user identity.
 */
async function fetchSocketToken(): Promise<{ token: string; userId: string } | null> {
  try {
    const res = await fetch("/api/socket/token", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.success && data.token && data.userId
      ? { token: data.token, userId: data.userId }
      : null;
  } catch (err) {
    console.warn("[WorkPulse Socket Client]: Failed to fetch socket token:", err);
    return null;
  }
}

/**
 * Retrieves or establishes the singleton Socket.IO client connection.
 * Strictly guarantees session isolation: if the active user changes,
 * any existing socket is torn down and reconnected for the new user.
 */
export async function getSocket(token?: string, explicitUserId?: string): Promise<WorkPulseClientSocket | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // If a connection exists and belongs to the same user, reuse it
  if (socketInstance && socketInstance.connected && currentConnectedUserId && (!explicitUserId || explicitUserId === currentConnectedUserId)) {
    return socketInstance;
  }

  if (pendingConnectPromise) {
    return pendingConnectPromise;
  }

  pendingConnectPromise = (async () => {
    try {
      let activeToken = token;
      let activeUserId = explicitUserId;

      if (!activeToken || !activeUserId) {
        const authData = await fetchSocketToken();
        if (!authData) {
          console.warn("[WorkPulse Socket Client]: No active session token available for WebSocket connection.");
          return null;
        }
        activeToken = authData.token;
        activeUserId = authData.userId;
      }

      // If user switched accounts in the same browser, tear down old socket instance immediately
      if (socketInstance && currentConnectedUserId && currentConnectedUserId !== activeUserId) {
        console.log(`[WorkPulse Socket]: Switching authenticated user from ${currentConnectedUserId} to ${activeUserId}`);
        socketInstance.disconnect();
        socketInstance = null;
      }

      currentConnectedUserId = activeUserId;

      if (socketInstance) {
        socketInstance.auth = { token: activeToken };
        if (!socketInstance.connected) {
          socketInstance.connect();
        }
        return socketInstance;
      }

      const socketUrl = getSocketServerUrl();

      socketInstance = io(socketUrl, {
        auth: {
          token: activeToken,
        },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 25,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        withCredentials: true,
        autoConnect: true,
      });

      socketInstance.on("connect_error", async (err) => {
        console.warn("[WorkPulse Socket Connect Warning]:", err.message);
        if (err.message.includes("UNAUTHORIZED") && socketInstance) {
          // Token expired or invalid, refresh credentials
          const freshData = await fetchSocketToken();
          if (freshData && socketInstance) {
            currentConnectedUserId = freshData.userId;
            socketInstance.auth = { token: freshData.token };
            socketInstance.connect();
          }
        }
      });

      return socketInstance;
    } finally {
      pendingConnectPromise = null;
    }
  })();

  return pendingConnectPromise;
}

/**
 * Disconnects and destroys the active socket singleton.
 * Called on logout or when switching accounts to ensure zero leakage.
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  currentConnectedUserId = null;
}
