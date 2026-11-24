/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/invitation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  sendInterviewInvitationAction,
  respondToInvitationAction,
  withdrawInterviewInvitationAction,
  getMyInvitationsAction,
} from "./invitation";
import {
  getOrCreatePreHireConversationAction,
  sendMessageAction,
  getMessagesAction,
} from "./message";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotificationSafe } from "@/lib/actions/notification";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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
      job: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      interviewInvitation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
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
  createNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
  createNotificationSafe: vi.fn().mockResolvedValue({ id: "notif-1" }),
}));

describe("Phase 3 Batch 2: Interview Invitations & Pre-Hire Conversations (Unit Tests)", () => {
  const clientId = "507f1f77bcf86cd799439011";
  const freelancerId = "507f1f77bcf86cd799439022";
  const jobId = "507f1f77bcf86cd799439033";
  const conversationId = "507f1f77bcf86cd799439044";
  const invitationId = "507f1f77bcf86cd799439055";

  const verifiedClientUser = {
    id: clientId,
    role: "CLIENT",
    name: "Client Acme",
    emailVerified: new Date("2025-01-01"),
    roleSelected: true,
  };

  const unverifiedClientUser = {
    id: clientId,
    role: "CLIENT",
    name: "Client Unverified",
    emailVerified: null,
    roleSelected: true,
  };

  const verifiedFreelancerUser = {
    id: freelancerId,
    role: "FREELANCER",
    name: "Freelancer Alice",
    emailVerified: new Date("2025-01-01"),
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

  describe("1. Pre-Hire Conversation: getOrCreatePreHireConversationAction", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Authentication required/i);
    });

    it("rejects unverified client", async () => {
      (getCurrentUser as any).mockResolvedValue(unverifiedClientUser);
      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/verify your email/i);
    });

    it("rejects client contacting themselves", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      const res = await getOrCreatePreHireConversationAction(jobId, clientId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot initiate a conversation with yourself/i);
    });

    it("rejects non-existent job or job not owned by client", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue(null);

      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/job posting not found/i);
    });

    it("rejects closed jobs", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId,
        status: "CLOSED",
      });

      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Job is currently closed/i);
    });

    it("rejects if freelancer user does not exist or is not a freelancer", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId,
        status: "OPEN",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: freelancerId,
        role: "CLIENT",
      });

      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not active or available for contact/i);
    });

    it("returns existing conversation if one already exists for (jobId, freelancerId)", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId,
        status: "OPEN",
        title: "Senior Full Stack Dev",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      });
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "PRE_HIRE",
        jobId,
        freelancerId,
        clientId,
      });

      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(true);
      expect(res.conversationId).toBe(conversationId);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("handles concurrent creation gracefully upon P2002 conflict", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId,
        status: "OPEN",
        title: "Senior Full Stack Dev",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      });
      // Initial lookup returns null, then retry finds it
      (prisma.conversation.findUnique as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: conversationId,
          type: "PRE_HIRE",
          jobId,
          freelancerId,
          clientId,
        });

      // Creation throws P2002
      const p2002Error = new Error("Unique constraint failed");
      (p2002Error as any).code = "P2002";
      (prisma.conversation.create as any).mockRejectedValueOnce(p2002Error);

      const res = await getOrCreatePreHireConversationAction(jobId, freelancerId);
      expect(res.success).toBe(true);
      expect(res.conversationId).toBe(conversationId);
    });
  });

  describe("2. Interview Invitation: sendInterviewInvitationAction", () => {
    it("enforces client role and email verification", async () => {
      (getCurrentUser as any).mockResolvedValue(unverifiedClientUser);
      const res = await sendInterviewInvitationAction({
        jobId,
        freelancerId,
        message: "We'd like to interview you",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/verify your email/i);
    });

    it("enforces rate limiting (10 invitations/hr)", async () => {                                 
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (checkRateLimit as any).mockResolvedValue({
        success: false,
        retryAfterMs: 3600000,
      });

      const res = await sendInterviewInvitationAction({
        jobId,
        freelancerId,
        message: "Interview invitation",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Too many interview invitations/i);
    });

    it("rejects non-owned jobs and closed jobs", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId: "different-client-id",
        status: "OPEN",
      });

      const res = await sendInterviewInvitationAction({
        jobId,
        freelancerId,
        message: "Interview invitation",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden: You do not own this job/i);
    });

    it("rejects duplicate invitations for same (jobId, freelancerId)", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId,
        status: "OPEN",
        title: "Backend Architect",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
        name: "Alice Developer",
      });
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        status: "PENDING",
      });

      const res = await sendInterviewInvitationAction({
        jobId,
        freelancerId,
        message: "Let's talk",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invitation has already been sent to this freelancer/i);
    });

    it("atomically creates conversation, invitation, initial message, and notification", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: jobId,
        clientId,
        status: "OPEN",
        title: "Backend Architect",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
        name: "Alice Developer",
      });
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue(null);

      const mockCreatedInvitation = {
        id: invitationId,
        jobId,
        freelancerId,
        clientId,
        conversationId,
        status: "PENDING",
        message: "We loved your portfolio!",
      };

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          conversation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: conversationId }),
            update: vi.fn().mockResolvedValue({}),
          },
          interviewInvitation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockCreatedInvitation),
          },
          message: {
            create: vi.fn().mockResolvedValue({ id: "msg-1" }),
          },
        };
        return callback(tx);
      });

      const res = await sendInterviewInvitationAction({
        jobId,
        freelancerId,
        message: "We loved your portfolio!",
      });

      expect(res.success).toBe(true);
      expect(res.invitationId).toBe(invitationId);
      expect(res.conversationId).toBe(conversationId);
    });
  });

  describe("3. Responding to Invitation: respondToInvitationAction", () => {
    it("rejects unauthorized responders (non-freelancer or different freelancer)", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: "another-freelancer-id",
        role: "FREELANCER",
        emailVerified: new Date(),
        roleSelected: true,
      });
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        freelancerId,
        clientId,
        status: "PENDING",
      });

      const res = await respondToInvitationAction({
        invitationId,
        action: "ACCEPT",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden: You are not authorized to respond/i);
    });

    it("rejects non-PENDING invitations", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        freelancerId,
        clientId,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 100000),
      });

      const res = await respondToInvitationAction({
        invitationId,
        action: "ACCEPT",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot respond. This invitation is already accepted/i);
    });

    it("rejects expired invitations and updates status to EXPIRED", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        freelancerId,
        clientId,
        status: "PENDING",
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      });
      (prisma.interviewInvitation.update as any).mockResolvedValue({});

      const res = await respondToInvitationAction({
        invitationId,
        action: "ACCEPT",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/This interview invitation has expired/i);
      expect(prisma.interviewInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: invitationId },
          data: { status: "EXPIRED", respondedAt: expect.any(Date) },
        })
      );
    });

    it("accepts valid pending invitation and updates status", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        freelancerId,
        clientId,
        conversationId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        job: { id: jobId, title: "Next.js Pro" },
        freelancer: { name: "Freelancer Alice" },
      });

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          interviewInvitation: {
            findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
            update: vi.fn().mockResolvedValue({
              id: invitationId,
              status: "ACCEPTED",
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          message: {
            create: vi.fn().mockResolvedValue({ id: "msg-system" }),
          },
          conversation: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const res = await respondToInvitationAction({
        invitationId,
        action: "ACCEPT",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("ACCEPTED");
    });

    it("declines invitation with reason and updates status", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        freelancerId,
        clientId,
        conversationId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        job: { id: jobId, title: "Next.js Pro" },
        freelancer: { name: "Freelancer Alice" },
      });

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          interviewInvitation: {
            findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
            update: vi.fn().mockResolvedValue({
              id: invitationId,
              status: "DECLINED",
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          message: {
            create: vi.fn().mockResolvedValue({ id: "msg-system" }),
          },
          conversation: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const res = await respondToInvitationAction({
        invitationId,
        action: "DECLINE",
        reason: "Currently unavailable for new projects.",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("DECLINED");
    });
  });

  describe("4. Client Withdrawal: withdrawInterviewInvitationAction", () => {
    it("rejects non-owner client", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        clientId: "different-client-id",
        freelancerId,
        status: "PENDING",
      });

      const res = await withdrawInterviewInvitationAction({ invitationId });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden: You do not own this invitation/i);
    });

    it("rejects non-PENDING invitation withdrawal", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        clientId,
        freelancerId,
        status: "ACCEPTED",
      });

      const res = await withdrawInterviewInvitationAction({ invitationId });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot withdraw invitation. It is already marked as accepted/i);
    });

    it("successfully withdraws pending invitation and updates conversation thread", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: invitationId,
        clientId,
        freelancerId,
        conversationId,
        status: "PENDING",
        job: { id: jobId, title: "Full Stack Engineer" },
      });

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          interviewInvitation: {
            findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
            update: vi.fn().mockResolvedValue({
              id: invitationId,
              status: "WITHDRAWN",
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          message: {
            create: vi.fn().mockResolvedValue({ id: "msg-withdrawn" }),
          },
          conversation: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const res = await withdrawInterviewInvitationAction({ invitationId });
      expect(res.success).toBe(true);
      expect(res.status).toBe("WITHDRAWN");
    });
  });

  describe("5. Messaging Authorization & Lockdown Rules", () => {
    it("blocks freelancer from sending messages if invitation was DECLINED", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "PRE_HIRE",
        freelancerId,
        clientId,
        jobId,
        job: { id: jobId, status: "OPEN" },
        contract: null,
        interviewInvitation: {
          id: invitationId,
          status: "DECLINED",
        },
      });

      const res = await sendMessageAction({
        conversationId,
        content: "Can I still apply?",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invitation was declined/i);
    });

    it("blocks freelancer from sending messages if invitation was WITHDRAWN", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "PRE_HIRE",
        freelancerId,
        clientId,
        jobId,
        job: { id: jobId, status: "OPEN" },
        contract: null,
        interviewInvitation: {
          id: invitationId,
          status: "WITHDRAWN",
        },
      });

      const res = await sendMessageAction({
        conversationId,
        content: "Why did you withdraw?",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invitation was withdrawn/i);
    });

    it("blocks messaging if job is CLOSED for PRE_HIRE conversation", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "PRE_HIRE",
        freelancerId,
        clientId,
        jobId,
        job: { id: jobId, status: "CLOSED" },
        contract: null,
        interviewInvitation: {
          id: invitationId,
          status: "ACCEPTED",
        },
      });

      const res = await sendMessageAction({
        conversationId,
        content: "Hello?",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Messaging is closed because this job is no longer open/i);
    });

    it("allows CONTRACT messaging under existing contract rules even if job is closed", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        type: "CONTRACT",
        freelancerId,
        clientId,
        contractId: "507f1f77bcf86cd799439066",
        contract: {
          id: "507f1f77bcf86cd799439066",
          status: "ACTIVE",
          clientId,
          freelancerId,
        },
      });
      (prisma.message.create as any).mockResolvedValue({
        id: "507f1f77bcf86cd799439077",
        conversationId,
        senderId: freelancerId,
        content: "Here is the milestone update",
        read: false,
        createdAt: new Date(),
        sender: {
          id: freelancerId,
          name: "Freelancer Alice",
          image: null,
          role: "FREELANCER",
        },
      });
      (prisma.conversation.update as any).mockResolvedValue({});

      const res = await sendMessageAction({
        conversationId,
        content: "Here is the milestone update",
      });

      expect(res.success).toBe(true);
      expect(res.message?.id).toBe("507f1f77bcf86cd799439077");
    });

    it("denies cross-user conversation access to third parties", async () => {
      const thirdPartyUser = {
        id: "507f1f77bcf86cd799439088",
        role: "FREELANCER",
        emailVerified: new Date(),
        roleSelected: true,
      };
      (getCurrentUser as any).mockResolvedValue(thirdPartyUser);
      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: conversationId,
        clientId,
        freelancerId,
        type: "PRE_HIRE",
        job: { id: jobId, title: "Test Job", status: "OPEN" },
      });

      const res = await getMessagesAction(conversationId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden: You are not authorized to view this conversation/i);
    });
  });

  describe("6. Get My Invitations: getMyInvitationsAction", () => {
    it("returns client invitations when logged in as client", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedClientUser);
      (prisma.interviewInvitation.findMany as any).mockResolvedValue([
        {
          id: invitationId,
          jobId,
          freelancerId,
          clientId,
          status: "PENDING",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          job: { id: jobId, title: "Job 1" },
          freelancer: { id: freelancerId, name: "Alice", avatarUrl: null },
          client: { id: clientId, name: "Client Corp", avatarUrl: null },
        },
      ]);

      const res = await getMyInvitationsAction();
      expect(res.success).toBe(true);
      expect(res.invitations?.length).toBe(1);
      expect(prisma.interviewInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId },
        })
      );
    });

    it("returns freelancer invitations when logged in as freelancer", async () => {
      (getCurrentUser as any).mockResolvedValue(verifiedFreelancerUser);
      (prisma.interviewInvitation.findMany as any).mockResolvedValue([
        {
          id: invitationId,
          jobId,
          freelancerId,
          clientId,
          status: "PENDING",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          job: { id: jobId, title: "Job 1" },
          freelancer: { id: freelancerId, name: "Bob", avatarUrl: null },
          client: { id: clientId, name: "Client Corp", avatarUrl: null },
        },
      ]);

      const res = await getMyInvitationsAction();
      expect(res.success).toBe(true);
      expect(res.invitations?.length).toBe(1);
      expect(prisma.interviewInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { freelancerId },
        })
      );
    });
  });
});
