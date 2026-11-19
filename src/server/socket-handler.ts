import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { verifySocketToken } from "../lib/socket/token";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../lib/socket/types";
import { OBJECT_ID_REGEX } from "../lib/validations/message";
import { createNotificationSafe } from "../lib/actions/notification";
import { NotificationType } from "@prisma/client";

export type WorkPulseSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type WorkPulseSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// In-memory presence map: userId -> Set of active socket IDs
const userSocketsMap = new Map<string, Set<string>>();

/**
 * Configure and attach Socket.IO messaging event handlers.
 */
export function setupSocketHandlers(io: WorkPulseSocketServer) {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers.authorization;
      const token =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : (socket.handshake.auth?.token as string) ||
            (socket.handshake.query?.token as string);

      if (!token) {
        return next(new Error("UNAUTHORIZED: Missing authentication token"));
      }

      const verified = verifySocketToken(token);
      if (!verified) {
        return next(new Error("UNAUTHORIZED: Invalid or expired socket token"));
      }

      socket.data.user = {
        id: verified.userId,
        role: verified.role,
        name: verified.name,
      };

      next();
    } catch (err) {
      console.error("[WorkPulse Socket Auth Error]:", err);
      next(new Error("UNAUTHORIZED: Authentication error"));
    }
  });

  io.on("connection", (socket: WorkPulseSocket) => {
    const user = socket.data.user;
    if (!user || !user.id) {
      socket.disconnect(true);
      return;
    }

    const userId = user.id;

    // Join user-specific room for private cross-tab notifications and inbox snippet updates
    socket.join(`user:${userId}`);

    // Update presence
    const isFirstConnection = !userSocketsMap.has(userId) || userSocketsMap.get(userId)!.size === 0;
    if (!userSocketsMap.has(userId)) {
      userSocketsMap.set(userId, new Set());
    }
    userSocketsMap.get(userId)!.add(socket.id);

    if (isFirstConnection) {
      // Broadcast online status to all other connected sockets
      socket.broadcast.emit("presence:online", { userId });
    }

    // Send initial list of currently online users to the newly connected socket
    const onlineUserIds = Array.from(userSocketsMap.entries())
      .filter(([, sockets]) => sockets.size > 0)
      .map(([uid]) => uid);
    socket.emit("presence:init", { onlineUserIds });

    // Handle conversation room join
    socket.on("conversation:join", async ({ conversationId }, callback) => {
      try {
        if (!conversationId || !OBJECT_ID_REGEX.test(conversationId)) {
          callback?.({ success: false, error: "Invalid conversation ID format" });
          return;
        }

        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            clientId: true,
            freelancerId: true,
          },
        });

        if (!conversation) {
          callback?.({ success: false, error: "Conversation not found" });
          return;
        }

        const currentUserId = socket.data.user?.id;
        if (!currentUserId) {
          callback?.({ success: false, error: "Unauthorized" });
          return;
        }

        const isAuthorized =
          conversation.clientId === currentUserId || conversation.freelancerId === currentUserId;

        if (!isAuthorized) {
          callback?.({
            success: false,
            error: "Forbidden: You are not an authorized participant in this conversation",
          });
          return;
        }

        const roomName = `conversation:${conversationId}`;
        await socket.join(roomName);

        callback?.({ success: true, conversationId });
      } catch (err) {
        console.error("[WorkPulse Socket Join Error]:", err);
        callback?.({ success: false, error: "Failed to join conversation room" });
      }
    });

    // Handle conversation room leave
    socket.on("conversation:leave", ({ conversationId }) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    // Handle Real-Time Message Sending
    socket.on("message:send", async ({ conversationId, content, clientMessageId }, callback) => {
      try {
        const trimmed = (content || "").trim();
        if (!trimmed) {
          callback?.({ success: false, error: "Message content cannot be empty", clientMessageId });
          return;
        }

        if (trimmed.length > 3000) {
          callback?.({
            success: false,
            error: "Message content cannot exceed 3,000 characters",
            clientMessageId,
          });
          return;
        }

        if (!conversationId || !OBJECT_ID_REGEX.test(conversationId)) {
          callback?.({ success: false, error: "Invalid conversation ID format", clientMessageId });
          return;
        }

        // Verify conversation membership
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            clientId: true,
            freelancerId: true,
            job: { select: { title: true } },
            contract: { select: { title: true } },
          },
        });

        if (!conversation) {
          callback?.({ success: false, error: "Conversation thread not found", clientMessageId });
          return;
        }

        if (conversation.clientId !== userId && conversation.freelancerId !== userId) {
          callback?.({
            success: false,
            error: "Forbidden: You cannot send messages to this conversation",
            clientMessageId,
          });
          return;
        }

        // Idempotency check: prevent duplicate rapid messages with identical content
        const recentDuplicate = await prisma.message.findFirst({
          where: {
            conversationId,
            senderId: userId,
            content: trimmed,
            createdAt: {
              gte: new Date(Date.now() - 10000), // 10s window
            },
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                image: true,
                role: true,
              },
            },
          },
        });

        let targetMessage = recentDuplicate;

        if (!targetMessage) {
          // Persist message to MongoDB before broadcasting
          const created = await prisma.message.create({
            data: {
              conversationId,
              senderId: userId,
              content: trimmed,
              read: false,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  role: true,
                },
              },
            },
          });

          // Update conversation lastMessageAt
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() },
          });

          targetMessage = created;

          // Dispatch in-app notification to counterparty
          const recipientId =
            conversation.clientId === userId
              ? conversation.freelancerId
              : conversation.clientId;

          const senderName = targetMessage.sender?.name || "Someone";
          const snippet =
            trimmed.length > 60 ? `${trimmed.substring(0, 60)}...` : trimmed;

          createNotificationSafe({
            userId: recipientId,
            type: NotificationType.NEW_MESSAGE,
            title: `New message from ${senderName}`,
            message: snippet,
            link: `/messages?conversationId=${conversationId}`,
          }).catch((err) => {
            console.error("[WorkPulse Notification Warning]:", err);
          });
        }

        const canonicalMessage = {
          id: targetMessage.id,
          conversationId: targetMessage.conversationId,
          senderId: targetMessage.senderId,
          content: targetMessage.content,
          read: targetMessage.read,
          createdAt: targetMessage.createdAt.toISOString(),
          sender: {
            id: targetMessage.sender.id,
            name: targetMessage.sender.name,
            image: targetMessage.sender.image,
            role: targetMessage.sender.role,
          },
        };

        const roomName = `conversation:${conversationId}`;

        // Broadcast to all participants in the conversation room
        io.to(roomName).emit("message:new", canonicalMessage);

        // Also broadcast update to counterparty user room so their inbox preview updates
        const counterpartyId =
          conversation.clientId === userId
            ? conversation.freelancerId
            : conversation.clientId;

        io.to(`user:${counterpartyId}`).emit("conversation:updated", {
          conversationId,
          lastMessageSnippet: canonicalMessage.content.slice(0, 80),
          lastMessageAt: canonicalMessage.createdAt,
          senderId: userId,
        });

        // Acknowledge the sender
        callback?.({
          success: true,
          message: canonicalMessage,
          clientMessageId,
        });
      } catch (err) {
        console.error("[WorkPulse Socket Send Error]:", err);
        callback?.({
          success: false,
          error: "Failed to process and deliver message",
          clientMessageId,
        });
      }
    });

    // Handle typing start
    socket.on("typing:start", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId,
        userId,
        isTyping: true,
        userName: user.name,
      });
    });

    // Handle typing stop
    socket.on("typing:stop", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId,
        userId,
        isTyping: false,
        userName: user.name,
      });
    });

    // Handle read receipt
    socket.on("message:read", async ({ conversationId }, callback) => {
      try {
        if (!conversationId || !OBJECT_ID_REGEX.test(conversationId)) {
          callback?.({ success: false, error: "Invalid conversation ID" });
          return;
        }

        // Verify participant
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { clientId: true, freelancerId: true },
        });

        if (!conversation) {
          callback?.({ success: false, error: "Conversation not found" });
          return;
        }

        if (conversation.clientId !== userId && conversation.freelancerId !== userId) {
          callback?.({ success: false, error: "Forbidden: Not a participant" });
          return;
        }

        // Mark messages sent by counterparty as read
        const updateRes = await prisma.message.updateMany({
          where: {
            conversationId,
            senderId: { not: userId },
            read: false,
          },
          data: {
            read: true,
          },
        });

        // Broadcast read receipt to room
        io.to(`conversation:${conversationId}`).emit("message:read_receipt", {
          conversationId,
          readerId: userId,
          readAt: new Date().toISOString(),
        });

        callback?.({ success: true, markedCount: updateRes.count });
      } catch (err) {
        console.error("[WorkPulse Socket Read Error]:", err);
        callback?.({ success: false, error: "Failed to mark messages as read" });
      }
    });

    // Handle socket disconnect
    socket.on("disconnect", () => {
      const userSockets = userSocketsMap.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketsMap.delete(userId);
          // Only broadcast offline when all sockets for this user are gone
          socket.broadcast.emit("presence:offline", { userId });
        }
      }
    });
  });
}
