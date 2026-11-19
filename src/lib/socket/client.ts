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
let isInitializing = false;
let pendingConnectPromise: Promise<WorkPulseClientSocket | null> | null = null;

/**
 * Determine the Socket.IO server URL.
 * Defaults to NEXT_PUBLIC_SOCKET_URL, or window.location with port 3001 in browser.
 */
export function getSocketServerUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001`;
  }
  return "http://localhost:3001";
}

/**
 * Fetch a short-lived signed socket token from the server.
 */
async function fetchSocketToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/socket/token", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.success && data.token ? data.token : null;
  } catch (err) {
    console.warn("[WorkPulse Socket Client]: Failed to fetch socket token:", err);
    return null;
  }
}

/**
 * Retrieves or establishes the singleton Socket.IO client connection.
 */
export async function getSocket(token?: string): Promise<WorkPulseClientSocket | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  if (pendingConnectPromise) {
    return pendingConnectPromise;
  }

  pendingConnectPromise = (async () => {
    try {
      const activeToken = token || (await fetchSocketToken());
      if (!activeToken) {
        console.warn("[WorkPulse Socket Client]: No valid session token available for WebSocket connection.");
        return null;
      }

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
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        withCredentials: true,
        autoConnect: true,
      });

      socketInstance.on("connect_error", async (err) => {
        console.warn("[WorkPulse Socket Connect Warning]:", err.message);
        if (err.message.includes("UNAUTHORIZED") && socketInstance) {
          // Token may have expired, refresh token once
          const freshToken = await fetchSocketToken();
          if (freshToken && socketInstance) {
            socketInstance.auth = { token: freshToken };
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
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

