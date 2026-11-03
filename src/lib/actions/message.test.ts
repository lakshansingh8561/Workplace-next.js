/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotificationSafe } from "@/lib/actions/notification";
import {
  getConversationsAction,
  getMessagesAction,
  markConversationAsReadAction,
  getUnreadMessagesCountAction,
  sendMessageAction,
} from "./message";

vi.mock("@/lib/session", () => {
  const getCurrentUser = vi.fn();
  return {
    getCurrentUser,
    requireUser: vi.fn(),
    requireRole: vi.fn(),
    requireVerifiedUser: vi.fn(),
    verifyUserForAction: vi.fn(async (allowed?: string | string[], customRoleError?: string) => {
      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Authentication required: You must be signed in to perform this action.",
          code: "UNAUTHENTICATED",
        };
      }
      if (user.roleSelected === false) {
        return {
          success: false,
          error: "Please complete onboarding before performing this action.",
          code: "UNAUTHORIZED_ROLE",
        };
      }
      if (allowed) {
        const allowedList = Array.isArray(allowed) ? allowed : [allowed];
        if (!allowedList.includes(user.role)) {
          if (customRoleError) {
            return { success: false, error: customRoleError, code: "UNAUTHORIZED_ROLE" };
          }
          const roleLabels = allowedList.map((r) => r.toLowerCase()).join(" or ");
          return {
            success: false,
            error: `Unauthorized: Only ${roleLabels} accounts can perform this action.`,
            code: "UNAUTHORIZED_ROLE",
          };
        }
      }
      if (user.emailVerified === null) {
        return {
          success: false,
          error: "Please verify your email address to access this feature.",
          code: "EMAIL_NOT_VERIFIED",
        };
      }
      return { success: true, user };
    }),
  };
});

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      conversation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      message: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      notification: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn().mockResolvedValue({ id: "notif-1" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("WorkPulse Phase 3 Batch 3: Unified Messaging Backend (Unit Tests)", () => {
  const clientId = "507f1f77bcf86cd799439011";
  const freelancerId = "507f1f77bcf86cd799439022";
  const strangerId = "507f1f77bcf86cd799439099";
  const conversationId = "507f1f77bcf86cd799439033";
  const contractId = "507f1f77bcf86cd799439044";
  const jobId = "507f1f77bcf86cd799439055";

  const verifiedClient = {
    id: clientId,
    role: "CLIENT",
    name: "Acme Corp",
    emailVerified: new Date("2025-01-01"),
    roleSelected: true,
  };

  const verifiedFreelancer = {
    id: freelancerId,
    role: "FREELANCER",
    name: "Alice Dev",
    emailVerified: new Date("2025-01-01"),
    roleSelected: true,
  };

  const unverifiedUser = {
    id: clientId,
    role: "CLIENT",
    name: "Unverified Client",
    emailVerified: null,
    roleSelected: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as any).mockResolvedValue({ success: true });
    (createNotificationSafe as any).mockResolvedValue({ id: "notif-1" });
    (prisma.$transaction as any).mockImplementation((arg: any) =>
      typeof arg === "function" ? arg(prisma) : Promise.all(arg)
    );
  });

  describe("Task 1 & 2: Conversation Inbox & N+1 Elimination", () => {
    it("rejects unauthenticated user accessing conversations", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      const res = await getConversationsAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Authentication required/i);
    });

    it("rejects unverified user accessing conversations", async () => {
      (getCurrentUser as any).mockResolvedValue(unverifiedUser);
      const res = await getConversationsAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/verify your email/i);
    });

    it("fetches conversations and eliminates N+1 query via single aggregation", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClient);
      (prisma.conversation.count as any).mockResolvedValue(2);
      (prisma.conversation.findMany as any).mockResolvedValue([
        {
          id: conversationId,
          type: "CONTRACT",
          contractId,
          jobId,
          clientId,
          freelancerId,
          lastMessageAt: new Date("2026-03-01T12:00:00Z"),
          contract: { id: contractId, title: "React Mobile App", status: "ACTIVE" },
          job: { id: jobId, title: "React Mobile App", status: "OPEN" },
          interviewInvitation: null,
          client: { id: clientId, name: "Acme Corp", image: null, role: "CLIENT" },
          freelancer: { id: freelancerId, name: "Alice Dev", image: null, role: "FREELANCER" },
          messages: [{ content: "Latest snippet", createdAt: new Date("2026-03-01T12:00:00Z") }],
        },
      ]);

      (prisma.message.groupBy as any).mockResolvedValue([
        { conversationId, _count: { _all: 3 } },
      ]);

      const res = await getConversationsAction({ limit: 10 });
      expect(res.success).toBe(true);
      expect(res.conversations).toHaveLength(1);
      expect(res.conversations![0].unreadCount).toBe(3);
      expect(res.conversations![0].counterparty.id).toBe(freelancerId);
      expect(res.conversations![0].counterparty.role).toBe("FREELANCER");
      // Check that groupBy was called once (no N+1 per conversation)
      expect(prisma.message.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.message.count).not.toHaveBeenCalled();
    });

    it("correctly computes pagination hasMore and nextCursor", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClient);
      (prisma.conversation.count as any).mockResolvedValue(5);
      // Returning limit + 1 items indicates hasMore = true
      (prisma.conversation.findMany as any).mockResolvedValue([
        {
          id: "conv-1",
          type: "CONTRACT",
          clientId,
          freelancerId,
          lastMessageAt: new Date(),
          contract: { id: "c1", title: "App 1", status: "ACTIVE" },
          job: null,
          interviewInvitation: null,
          client: { id: clientId, name: "Acme", image: null, role: "CLIENT" },
          freelancer: { id: freelancerId, name: "Alice", image: null, role: "FREELANCER" },
          messages: [],
        },
        {
          id: "conv-2",
          type: "CONTRACT",
          clientId,
          freelancerId,
          lastMessageAt: new Date(),
          contract: { id: "c2", title: "App 2", status: "ACTIVE" },
          job: null,
          interviewInvitation: null,
          client: { id: clientId, name: "Acme", image: null, role: "CLIENT" },
          freelancer: { id: freelancerId, name: "Alice", image: null, role: "FREELANCER" },
          messages: [],
        },
      ]);
      (prisma.message.groupBy as any).mockResolvedValue([]);

      const res = await getConversationsAction({ limit: 1 });
      expect(res.success).toBe(true);
      expect(res.hasMore).toBe(true);
      expect(res.nextCursor).toBe("conv-1");
      expect(res.conversations).toHaveLength(1);
    });
  });

  describe("Task 1 & 3: Message History, Cursor Pagination, and Read Receipts", () => {
    it("rejects non-participant from reading messages", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: strangerId,
        role: "FREELANCER",
        name: "Intruder Bob",
        emailVerified: new Date(),
        roleSelected: true,
      });

      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "CONTRACT",
        clientId,
        freelancerId,
      });

      const res = await getMessagesAction(conversationId, 50);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden: You are not authorized/i);
    });

    it("returns messages in stable chronological order and marks counterparty messages as read", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancer);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "CONTRACT",
        contractId,
        jobId,
        clientId,
        freelancerId,
        contract: { id: contractId, title: "Web app", status: "ACTIVE" },
        job: { id: jobId, title: "Web app", status: "OPEN" },
        interviewInvitation: null,
        client: { id: clientId, name: "Client Acme", image: null, role: "CLIENT" },
        freelancer: { id: freelancerId, name: "Alice Dev", image: null, role: "FREELANCER" },
      });

      // DB returns in desc order for bounded pagination
      const msg1 = {
        id: "msg-1",
        conversationId,
        senderId: clientId,
        content: "First message",
        read: false,
        createdAt: new Date("2026-03-01T10:00:00Z"),
        sender: { id: clientId, name: "Client Acme", image: null, role: "CLIENT" },
      };
      const msg2 = {
        id: "msg-2",
        conversationId,
        senderId: clientId,
        content: "Second message",
        read: false,
        createdAt: new Date("2026-03-01T10:05:00Z"),
        sender: { id: clientId, name: "Client Acme", image: null, role: "CLIENT" },
      };

      (prisma.message.findMany as any).mockResolvedValue([msg2, msg1]);
      (prisma.message.updateMany as any).mockResolvedValue({ count: 2 });
      (prisma.notification.updateMany as any).mockResolvedValue({ count: 2 });

      const res = await getMessagesAction(conversationId, 50);
      expect(res.success).toBe(true);
      expect(res.messages).toHaveLength(2);
      // Verify returned in chronological asc order
      expect(res.messages![0].id).toBe("msg-1");
      expect(res.messages![1].id).toBe("msg-2");

      // Verify counterparty messages marked read
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId,
          senderId: { not: freelancerId },
          read: false,
        },
        data: { read: true },
      });
    });

    it("supports cursor pagination to load older messages", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClient);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "CONTRACT",
        clientId,
        freelancerId,
        client: { id: clientId, name: "Client", image: null, role: "CLIENT" },
        freelancer: { id: freelancerId, name: "Alice", image: null, role: "FREELANCER" },
      });

      const olderMsg = {
        id: "507f1f77bcf86cd799439001",
        conversationId,
        senderId: freelancerId,
        content: "Very old message",
        read: true,
        createdAt: new Date("2026-02-01T08:00:00Z"),
        sender: { id: freelancerId, name: "Alice", image: null, role: "FREELANCER" },
      };
      (prisma.message.findMany as any).mockResolvedValue([olderMsg]);
      (prisma.message.updateMany as any).mockResolvedValue({ count: 0 });
      (prisma.notification.updateMany as any).mockResolvedValue({ count: 0 });

      const cursorId = "507f1f77bcf86cd799439002";
      const res = await getMessagesAction(conversationId, {
        limit: 10,
        cursor: cursorId,
        direction: "before",
      });

      expect(res.success).toBe(true);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursorId },
          skip: 1,
        })
      );
    });
  });

  describe("Task 3: Mark Conversation As Read & Unread Count Actions", () => {
    it("markConversationAsReadAction rejects non-participant", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: strangerId,
        role: "CLIENT",
        name: "Stranger",
        emailVerified: new Date(),
        roleSelected: true,
      });

      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        clientId,
        freelancerId,
      });

      const res = await markConversationAsReadAction(conversationId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden/i);
    });

    it("markConversationAsReadAction idempotently marks only counterparty messages as read", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancer);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        clientId,
        freelancerId,
      });

      (prisma.message.updateMany as any).mockResolvedValue({ count: 4 });
      (prisma.notification.updateMany as any).mockResolvedValue({ count: 1 });

      const res = await markConversationAsReadAction(conversationId);
      expect(res.success).toBe(true);
      expect(res.markedCount).toBe(4);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId,
          senderId: { not: freelancerId },
          read: false,
        },
        data: { read: true },
      });
    });

    it("getUnreadMessagesCountAction aggregates unread count across user conversations", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancer);
      (prisma.conversation.findMany as any).mockResolvedValue([
        { id: "conv-1" },
        { id: "conv-2" },
      ]);
      (prisma.message.count as any).mockResolvedValue(7);

      const res = await getUnreadMessagesCountAction();
      expect(res.success).toBe(true);
      expect(res.unreadCount).toBe(7);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: { in: ["conv-1", "conv-2"] },
          senderId: { not: freelancerId },
          read: false,
        },
      });
    });
  });

  describe("Task 4 & 5: Message Authorization & Integrity", () => {
    it("rejects empty or whitespace-only messages", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClient);
      const res = await sendMessageAction({
        conversationId,
        content: "    ",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot be empty/i);
    });

    it("rejects oversized message content (> 3000 chars)", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClient);
      const res = await sendMessageAction({
        conversationId,
        content: "A".repeat(3001),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot exceed 3,000 characters/i);
    });

    it("blocks pre-hire messages when job is CLOSED", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClient);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "PRE_HIRE",
        clientId,
        freelancerId,
        job: { id: jobId, title: "Test Job", status: "CLOSED" },
        interviewInvitation: null,
      });

      const res = await sendMessageAction({
        conversationId,
        content: "Hello there",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Messaging is closed because this job is no longer open/i);
    });

    it("blocks freelancer from pre-hire messaging when invitation is DECLINED", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancer);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "PRE_HIRE",
        clientId,
        freelancerId,
        job: { id: jobId, title: "Test Job", status: "OPEN" },
        interviewInvitation: {
          id: "inv-1",
          status: "DECLINED",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const res = await sendMessageAction({
        conversationId,
        content: "Can I still apply?",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invitation was declined/i);
    });

    it("allows contract messaging even if job is CLOSED", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancer);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "CONTRACT",
        clientId,
        freelancerId,
        contract: { id: contractId, title: "Active Contract" },
        job: { id: jobId, title: "Test Job", status: "CLOSED" },
      });

      const msg = {
        id: "msg-created-1",
        conversationId,
        senderId: freelancerId,
        content: "Here is your deliverable",
        read: false,
        createdAt: new Date(),
        sender: { id: freelancerId, name: "Alice", image: null, role: "FREELANCER" },
      };
      (prisma.message.create as any).mockResolvedValue(msg);
      (prisma.conversation.update as any).mockResolvedValue({});

      const res = await sendMessageAction({
        conversationId,
        content: "Here is your deliverable",
      });
      expect(res.success).toBe(true);
      expect(res.message?.id).toBe("msg-created-1");
    });
  });
});
