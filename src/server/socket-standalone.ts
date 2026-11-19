import http from "http";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./socket-handler";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../lib/socket/types";

// Support both Render's standard PORT and custom SOCKET_SERVER_PORT
const PORT = parseInt(
  process.env.PORT || process.env.SOCKET_SERVER_PORT || "3001",
  10
);
const ALLOWED_ORIGIN = process.env.SOCKET_ALLOWED_ORIGIN || "http://localhost:3000";

const rawOrigins = ALLOWED_ORIGIN.includes(",")
  ? ALLOWED_ORIGIN.split(",").map((s) => s.trim())
  : [ALLOWED_ORIGIN, "http://127.0.0.1:3000", "http://localhost:3000"];

const origins = [
  ...new Set([
    ...rawOrigins,
    "https://workplace-next-js.vercel.app",
    "https://workplace-next-js.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]),
];

const VALID_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "workpulse-marketplace-local-development-secret-key-32chars";

let ioInstance: Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const server = http.createServer((req, res) => {
  // CORS headers for incoming HTTP requests & preflights
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint for Render/uptime monitoring
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "workpulse-socket-server",
        timestamp: new Date().toISOString(),
        port: PORT,
      })
    );
    return;
  }

  // HTTP broadcast endpoint: allows Next.js Server Actions to bridge into real-time WebSockets
  if (req.method === "POST" && req.url === "/api/socket/broadcast") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Safeguard against oversized requests
      if (body.length > 500000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const { conversationId, message, counterpartyId, secret } = payload;

        // Verify secret token for internal communication
        if (secret && secret !== VALID_SECRET) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
          return;
        }

        if (conversationId && message && ioInstance) {
          const roomName = `conversation:${conversationId}`;
          // Broadcast to everyone in the conversation room
          ioInstance.to(roomName).emit("message:new", message);

          // Update counterparty's conversation inbox snippet in real-time
          if (counterpartyId) {
            ioInstance.to(`user:${counterpartyId}`).emit("conversation:updated", {
              conversationId,
              lastMessageSnippet: message.content ? message.content.slice(0, 80) : "",
              lastMessageAt: message.createdAt || new Date().toISOString(),
              senderId: message.senderId,
            });
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, conversationId, messageId: message.id }));
          return;
        }

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Missing conversationId or message" }));
      } catch (err) {
        console.error("[WorkPulse Socket Broadcast Webhook Error]:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Malformed JSON payload" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, mobile)
      if (!origin) {
        return callback(null, true);
      }

      // Check explicit origin whitelist or Vercel / Render wildcard subdomains
      const isAllowed =
        origins.includes(origin) ||
        origins.includes("*") ||
        origin.endsWith(".vercel.app") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("onrender.com");

      if (isAllowed) {
        return callback(null, true);
      }

      console.warn(`[WorkPulse Socket.IO CORS Blocked]: Origin ${origin} not in whitelist`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
});

ioInstance = io;
setupSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`[WorkPulse Socket.IO] Real-Time Messaging Server running on port ${PORT}`);
  console.log(`[WorkPulse Socket.IO] Whitelisted Origins: ${origins.join(", ")}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("[WorkPulse Socket.IO] Shutting down WebSocket server...");
  io.close(() => {
    server.close(() => {
      console.log("[WorkPulse Socket.IO] Server closed cleanly.");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { server, io };
