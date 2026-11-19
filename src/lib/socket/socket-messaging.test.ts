import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSocketToken, verifySocketToken } from "./token";
import { setupSocketHandlers } from "../../server/socket-handler";
import { prisma } from "../prisma";

vi.mock("../prisma", () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../actions/notification", () => ({
  createNotificationSafe: vi.fn().mockResolvedValue(true),
}));

describe("Socket Token Security & Validation", () => {
  it("generates a signed token and verifies it correctly", () => {
    const payload = {
      userId: "64a0f1b2c3d4e5f6a7b8c9d0",
      role: "CLIENT",
      name: "Alice Client",
    };

    const token = generateSocketToken(payload, 3600 * 1000);
    expect(typeof token).toBe("string");
    expect(token.includes(".")).toBe(true);

    const verified = verifySocketToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(payload.userId);
    expect(verified?.role).toBe(payload.role);
    expect(verified?.name).toBe(payload.name);
  });

  it("rejects a tampered socket token", () => {
    const token = generateSocketToken({
      userId: "64a0f1b2c3d4e5f6a7b8c9d0",
      role: "CLIENT",
    });

    const tampered = token.slice(0, -4) + "abcd";
    const verified = verifySocketToken(tampered);
    expect(verified).toBeNull();
  });

  it("rejects an expired socket token", () => {
    // Generate token that expired 10 seconds ago
    const expiredToken = generateSocketToken(
      {
        userId: "64a0f1b2c3d4e5f6a7b8c9d0",
        role: "FREELANCER",
      },
      -10000
    );

    const verified = verifySocketToken(expiredToken);
    expect(verified).toBeNull();
  });

  it("rejects malformed token strings", () => {
    expect(verifySocketToken("")).toBeNull();
    expect(verifySocketToken("not-a-token")).toBeNull();
    expect(verifySocketToken("a.b.c.d")).toBeNull();
  });
});

describe("Socket Server Authentication Middleware", () => {
  let ioMock: any;
  let authMiddleware: any;

  beforeEach(() => {
    ioMock = {
      use: vi.fn((fn) => {
        authMiddleware = fn;
      }),
      on: vi.fn(),
    };
    setupSocketHandlers(ioMock);
  });

  it("registers authentication middleware on the Socket.IO instance", () => {
    expect(ioMock.use).toHaveBeenCalled();
    expect(typeof authMiddleware).toBe("function");
  });

  it("rejects socket connection with missing token", async () => {
    const socket = {
      handshake: {
        auth: {},
        headers: {},
        query: {},
      },
      data: {},
    };
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const error = next.mock.calls[0][0];
    expect(error.message).toContain("UNAUTHORIZED: Missing authentication token");
  });

  it("accepts socket connection with valid token and populates user data", async () => {
    const validToken = generateSocketToken({
      userId: "64a0f1b2c3d4e5f6a7b8c9d0",
      role: "FREELANCER",
      name: "Bob Dev",
    });

    const socket = {
      handshake: {
        auth: { token: validToken },
        headers: {},
        query: {},
      },
      data: {} as any,
    };
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toBeDefined();
    expect(socket.data.user.id).toBe("64a0f1b2c3d4e5f6a7b8c9d0");
    expect(socket.data.user.role).toBe("FREELANCER");
    expect(socket.data.user.name).toBe("Bob Dev");
  });
});

describe("Conversation Room Authorization & Messaging Handlers", () => {
  let connectionHandler: any;
  let ioMock: any;
  let socketMock: any;
  let clientCallbacks: Record<string, any>;

  const clientUserId = "64a0f1b2c3d4e5f6a7b8c901";
  const freelancerUserId = "64a0f1b2c3d4e5f6a7b8c902";
  const strangerUserId = "64a0f1b2c3d4e5f6a7b8c999";
  const conversationId = "64a0f1b2c3d4e5f6a7b8c955";

  beforeEach(() => {
    vi.clearAllMocks();
    clientCallbacks = {};
    socketMock = {
      id: "socket_123",
      data: {
        user: {
          id: clientUserId,
          role: "CLIENT",
          name: "Alice Client",
        },
      },
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      broadcast: {
        emit: vi.fn(),
      },
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
      on: vi.fn((event, handler) => {
        clientCallbacks[event] = handler;
      }),
      disconnect: vi.fn(),
    };

    ioMock = {
      use: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === "connection") {
          connectionHandler = handler;
        }
      }),
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
    };

    setupSocketHandlers(ioMock);
    connectionHandler(socketMock);
  });

  it("joins user-specific room on connection", () => {
    expect(socketMock.join).toHaveBeenCalledWith(`user:${clientUserId}`);
  });

  it("allows authorized participants to join conversation room", async () => {
    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: conversationId,
      clientId: clientUserId,
      freelancerId: freelancerUserId,
    });

    const ack = vi.fn();
    await clientCallbacks["conversation:join"]({ conversationId }, ack);

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: conversationId },
      select: { id: true, clientId: true, freelancerId: true },
    });
    expect(socketMock.join).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(ack).toHaveBeenCalledWith({ success: true, conversationId });
  });

  it("rejects unauthorized user trying to join conversation room", async () => {
    socketMock.data.user.id = strangerUserId;

    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: conversationId,
      clientId: clientUserId,
      freelancerId: freelancerUserId,
    });

    const ack = vi.fn();
    await clientCallbacks["conversation:join"]({ conversationId }, ack);

    expect(socketMock.join).not.toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("Forbidden"),
      })
    );
  });

  it("persists message to MongoDB and broadcasts to room on message:send", async () => {
    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: conversationId,
      clientId: clientUserId,
      freelancerId: freelancerUserId,
      job: { title: "Full Stack App" },
    });

    (prisma.message.findFirst as any).mockResolvedValue(null);

    const mockCreatedMessage = {
      id: "64a0f1b2c3d4e5f6a7b8c988",
      conversationId,
      senderId: clientUserId,
      content: "Hello Freelancer! Real-time message.",
      read: false,
      createdAt: new Date(),
      sender: {
        id: clientUserId,
        name: "Alice Client",
        image: null,
        role: "CLIENT",
      },
    };

    (prisma.message.create as any).mockResolvedValue(mockCreatedMessage);
    (prisma.conversation.update as any).mockResolvedValue({ id: conversationId });

    const ack = vi.fn();
    await clientCallbacks["message:send"](
      {
        conversationId,
        content: "Hello Freelancer! Real-time message.",
        clientMessageId: "client_12345",
      },
      ack
    );

    // Verified message was created in Prisma DB
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId,
        senderId: clientUserId,
        content: "Hello Freelancer! Real-time message.",
        read: false,
      },
      include: expect.any(Object),
    });

    // Verified conversation lastMessageAt was updated
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: conversationId },
      data: { lastMessageAt: expect.any(Date) },
    });

    // Verified broadcast to conversation room
    expect(ioMock.to).toHaveBeenCalledWith(`conversation:${conversationId}`);

    // Verified sender acknowledged with persisted message
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        clientMessageId: "client_12345",
        message: expect.objectContaining({
          id: mockCreatedMessage.id,
          content: "Hello Freelancer! Real-time message.",
        }),
      })
    );
  });

  it("marks unread messages as read and broadcasts read receipt on message:read", async () => {
    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: conversationId,
      clientId: clientUserId,
      freelancerId: freelancerUserId,
    });

    (prisma.message.updateMany as any).mockResolvedValue({ count: 3 });

    const ack = vi.fn();
    await clientCallbacks["message:read"]({ conversationId }, ack);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId,
        senderId: { not: clientUserId },
        read: false,
      },
      data: {
        read: true,
      },
    });

    expect(ioMock.to).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(ack).toHaveBeenCalledWith({ success: true, markedCount: 3 });
  });

  it("broadcasts typing events to counterparty without writing to database", () => {
    clientCallbacks["typing:start"]({ conversationId });
    expect(socketMock.to).toHaveBeenCalledWith(`conversation:${conversationId}`);

    clientCallbacks["typing:stop"]({ conversationId });
    expect(socketMock.to).toHaveBeenCalledWith(`conversation:${conversationId}`);

    // Typing must NEVER touch database
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
