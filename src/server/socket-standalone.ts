import http from "http";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./socket-handler";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../lib/socket/types";

const PORT = parseInt(process.env.SOCKET_SERVER_PORT || "3001", 10);
const ALLOWED_ORIGIN = process.env.SOCKET_ALLOWED_ORIGIN || "http://localhost:3000";

const origins = ALLOWED_ORIGIN.includes(",")
  ? ALLOWED_ORIGIN.split(",").map((s) => s.trim())
  : [ALLOWED_ORIGIN, "http://127.0.0.1:3000", "http://localhost:3000"];

const server = http.createServer((req, res) => {
  // Simple health check endpoint for monitoring & deployment
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "workpulse-socket-server",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl) or matched origins
      if (!origin || origins.includes(origin) || origins.includes("*")) {
        callback(null, true);
      } else {
        // In local development, permit any localhost origin
        if (
          process.env.NODE_ENV !== "production" &&
          (origin.includes("localhost") || origin.includes("127.0.0.1"))
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
});

setupSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`[WorkPulse Socket.IO] Real-Time Messaging Server running on port ${PORT}`);
  console.log(`[WorkPulse Socket.IO] Allowed Origins: ${origins.join(", ")}`);
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

