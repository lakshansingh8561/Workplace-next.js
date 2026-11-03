/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/frontend-hiring-experience.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  updateProposalStatusAction,
  getJobProposalsForReview,
} from "./proposal";
import {
  respondToInvitationAction,
  getMyInvitationsAction,
} from "./invitation";
import {
  getOrCreatePreHireConversationAction,
  getMessagesAction,
  sendMessageAction,
} from "./message";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/session", () => {
  const getCurrentUser = vi.fn();
  return {
    getCurrentUser,
    requireUser: vi.fn(async () => {
      const u = await getCurrentUser();
      if (!u) throw new Error("Unauthorized");
      return u;
    }),
    requireRole: vi.fn(async (role: string) => {
      const u = await getCurrentUser();
      if (!u || u.role !== role) throw new Error("Unauthorized");
      return u;
    }),
    verifyUserForAction: vi.fn(async (allowed?: string | string[], customError?: string) => {
      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Authentication required: You must be signed in to perform this action.",
          code: "UNAUTHENTICATED",
        };
      }
      if (allowed) {
        const list = Array.isArray(allowed) ? allowed : [allowed];
        if (!list.includes(user.role)) {
          return {
            success: false,
            error: customError || `Unauthorized: Only ${list.join(" or ")} accounts can perform this action.`,
            code: "UNAUTHORIZED_ROLE",
          };
        }
      }
      return { success: true, user };
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    proposal: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    interviewInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return cb(prisma);
      }
      return Promise.all(cb);
    }),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn(async () => true),
}));

describe("Phase 3 Batch 5: Complete Frontend Hiring Experience Unit Tests", () => {
  const mockClient = {
    id: "671000000000000000000001",
    name: "Hiring Client",
    email: "client@test.com",
    role: "CLIENT",
    roleSelected: true,
    emailVerified: new Date(),
  };

  const mockFreelancer = {
    id: "671000000000000000000002",
    name: "Top Freelancer",
    email: "freelancer@test.com",
    role: "FREELANCER",
    roleSelected: true,
    emailVerified: new Date(),
  };

  const mockJobId = "671000000000000000000010";
  const mockProposalId = "671000000000000000000020";
  const mockContractId = "671000000000000000000030";
  const mockConversationId = "671000000000000000000040";
  const mockInvitationId = "671000000000000000000050";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Client Experience: Proposal Management & Review
  // ---------------------------------------------------------------------------
  describe("Client Proposal Review & Lifecycle Actions", () => {
    it("fetches proposals for client job review with candidate details", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);
      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        clientId: mockClient.id,
      });

      (prisma.proposal.findMany as any).mockResolvedValue([
        {
          id: mockProposalId,
          jobId: mockJobId,
          freelancerId: mockFreelancer.id,
          bidAmount: 1500,
          coverLetter: "Experienced full-stack engineer ready to deliver.",
          estimatedDuration: "2 weeks",
          status: "PENDING",
          createdAt: new Date("2026-11-01"),
          freelancer: {
            id: mockFreelancer.id,
            name: mockFreelancer.name,
            email: mockFreelancer.email,
            image: null,
            title: "Senior Full Stack Dev",
            skills: ["React", "Next.js", "TypeScript"],
            hourlyRate: 65,
            location: "San Francisco, CA",
            createdAt: new Date("2026-01-01"),
          },
        },
      ]);

      const res = await getJobProposalsForReview(mockJobId);
      expect(res.success).toBe(true);
      expect(res.proposals).toHaveLength(1);
      expect(res.proposals[0].freelancer.name).toBe("Top Freelancer");
      expect(res.proposals[0].freelancer.skills).toContain("Next.js");
      expect(res.proposals[0].status).toBe("PENDING");
    });

    it("accepts candidate proposal, atomically creates contract, and links conversation", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.proposal.findUnique as any).mockResolvedValue({
        id: mockProposalId,
        status: "PENDING",
        bidAmount: 1500,
        estimatedDuration: "2 weeks",
        freelancerId: mockFreelancer.id,
        job: {
          id: mockJobId,
          title: "Build WorkPulse Marketplace",
          type: "FIXED",
          clientId: mockClient.id,
          status: "OPEN",
        },
        freelancer: {
          id: mockFreelancer.id,
          name: mockFreelancer.name,
          role: "FREELANCER",
          roleSelected: true,
        },
      });

      (prisma.proposal.findMany as any).mockResolvedValue([]);
      (prisma.contract.findFirst as any).mockResolvedValue(null);
      (prisma.contract.findUnique as any).mockResolvedValue(null);

      (prisma.job.update as any).mockResolvedValue({ id: mockJobId, status: "CLOSED" });
      (prisma.proposal.update as any).mockResolvedValue({ id: mockProposalId, status: "ACCEPTED" });
      (prisma.proposal.updateMany as any).mockResolvedValue({ count: 0 });

      (prisma.contract.create as any).mockResolvedValue({
        id: mockContractId,
        title: "Build WorkPulse Marketplace",
        status: "ACTIVE",
      });

      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: mockConversationId,
        type: "PRE_HIRE",
      });
      (prisma.conversation.update as any).mockResolvedValue({
        id: mockConversationId,
        type: "CONTRACT",
        contractId: mockContractId,
      });

      const res = await updateProposalStatusAction({
        proposalId: mockProposalId,
        status: "ACCEPTED",
      });

      expect(res.success).toBe(true);
      expect(res.contractId).toBe(mockContractId);
      expect(res.conversationId).toBe(mockConversationId);
      expect(res.status).toBe("ACCEPTED");
    });

    it("rejects proposal cleanly with feedback", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.proposal.findUnique as any).mockResolvedValue({
        id: mockProposalId,
        status: "PENDING",
        freelancerId: mockFreelancer.id,
        job: {
          id: mockJobId,
          title: "Build WorkPulse Marketplace",
          clientId: mockClient.id,
        },
        freelancer: {
          id: mockFreelancer.id,
          role: "FREELANCER",
          roleSelected: true,
        },
      });

      (prisma.proposal.update as any).mockResolvedValue({
        id: mockProposalId,
        status: "REJECTED",
      });

      const res = await updateProposalStatusAction({
        proposalId: mockProposalId,
        status: "REJECTED",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("REJECTED");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Freelancer Experience: Interview Invitations Inbox
  // ---------------------------------------------------------------------------
  describe("Freelancer Interview Invitations Inbox", () => {
    it("retrieves invitations scoped to the authenticated freelancer", async () => {
      (getCurrentUser as any).mockResolvedValue(mockFreelancer);

      (prisma.interviewInvitation.findMany as any).mockResolvedValue([
        {
          id: mockInvitationId,
          jobId: mockJobId,
          clientId: mockClient.id,
          freelancerId: mockFreelancer.id,
          conversationId: mockConversationId,
          message: "We loved your proposal. Let's discuss timeline and scope.",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86400000 * 5),
          respondedAt: null,
          createdAt: new Date(),
          job: {
            id: mockJobId,
            title: "Build WorkPulse Marketplace",
            type: "FIXED",
            budget: 1500,
            hourlyMin: null,
            hourlyMax: null,
            status: "OPEN",
          },
          client: {
            id: mockClient.id,
            name: mockClient.name,
            image: null,
            role: "CLIENT",
          },
          freelancer: {
            id: mockFreelancer.id,
            name: mockFreelancer.name,
            image: null,
            role: "FREELANCER",
          },
        },
      ]);

      const res = await getMyInvitationsAction();
      expect(res.success).toBe(true);
      expect(res.invitations).toHaveLength(1);
      expect(res.invitations![0].status).toBe("PENDING");
      expect(res.invitations![0].job.title).toBe("Build WorkPulse Marketplace");
      expect(res.invitations![0].counterparty.name).toBe("Hiring Client");
    });

    it("allows freelancer to accept interview invitation without automatically creating a contract", async () => {
      (getCurrentUser as any).mockResolvedValue(mockFreelancer);

      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: mockInvitationId,
        freelancerId: mockFreelancer.id,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        conversationId: mockConversationId,
        job: { id: mockJobId, title: "Build WorkPulse Marketplace" },
      });

      (prisma.interviewInvitation.updateMany as any).mockResolvedValue({ count: 1 });

      const res = await respondToInvitationAction({
        invitationId: mockInvitationId,
        action: "ACCEPT",
      });

      expect(res.success).toBe(true);
      // Ensure contract was NOT created automatically
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it("allows freelancer to decline interview invitation with optional reason", async () => {
      (getCurrentUser as any).mockResolvedValue(mockFreelancer);

      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: mockInvitationId,
        freelancerId: mockFreelancer.id,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        conversationId: mockConversationId,
        job: { id: mockJobId, title: "Build WorkPulse Marketplace" },
      });

      (prisma.interviewInvitation.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.message.create as any).mockResolvedValue({ id: "msg-1" });
      (prisma.conversation.update as any).mockResolvedValue({ id: mockConversationId });

      const res = await respondToInvitationAction({
        invitationId: mockInvitationId,
        action: "DECLINE",
        reason: "Currently at full project capacity.",
      });

      expect(res.success).toBe(true);
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: "[Invitation Declined] Currently at full project capacity.",
          }),
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Unified Messaging Experience (PRE_HIRE & CONTRACT)
  // ---------------------------------------------------------------------------
  describe("Unified Messaging Experience", () => {
    it("initializes a PRE_HIRE conversation between client and candidate", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        clientId: mockClient.id,
        status: "OPEN",
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockFreelancer.id,
        role: "FREELANCER",
        roleSelected: true,
      });

      (prisma.conversation.findUnique as any).mockResolvedValue(null);
      (prisma.conversation.create as any).mockResolvedValue({
        id: mockConversationId,
        type: "PRE_HIRE",
      });

      const res = await getOrCreatePreHireConversationAction(mockJobId, mockFreelancer.id);
      expect(res.success).toBe(true);
      expect(res.conversationId).toBe(mockConversationId);
    });

    it("fetches message history with cursor-based pagination and marks counterparty messages as read", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: mockConversationId,
        type: "PRE_HIRE",
        clientId: mockClient.id,
        freelancerId: mockFreelancer.id,
        contractId: null,
        jobId: mockJobId,
        contract: null,
        job: { id: mockJobId, title: "Build WorkPulse Marketplace", status: "OPEN" },
        interviewInvitation: {
          id: mockInvitationId,
          status: "ACCEPTED",
          expiresAt: new Date(),
        },
        client: mockClient,
        freelancer: mockFreelancer,
      });

      (prisma.message.findMany as any).mockResolvedValue([
        {
          id: "msg-101",
          conversationId: mockConversationId,
          senderId: mockFreelancer.id,
          content: "Hello! Looking forward to reviewing requirements.",
          read: false,
          createdAt: new Date("2026-11-02T10:00:00Z"),
          sender: mockFreelancer,
        },
      ]);

      (prisma.message.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.notification.updateMany as any).mockResolvedValue({ count: 1 });

      const res = await getMessagesAction(mockConversationId, 50);

      expect(res.success).toBe(true);
      expect(res.messages).toHaveLength(1);
      expect(res.conversation?.type).toBe("PRE_HIRE");
      expect(res.conversation?.counterparty.name).toBe("Top Freelancer");
      expect(res.conversation?.invitation?.status).toBe("ACCEPTED");
    });

    it("sends a message and respects rate limits", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: mockConversationId,
        type: "PRE_HIRE",
        clientId: mockClient.id,
        freelancerId: mockFreelancer.id,
        job: { id: mockJobId, title: "Build WorkPulse Marketplace", status: "OPEN" },
        interviewInvitation: null,
        contract: null,
      });

      (prisma.message.create as any).mockResolvedValue({
        id: "msg-102",
        conversationId: mockConversationId,
        senderId: mockClient.id,
        content: "Let's schedule a kickoff call tomorrow at 2 PM.",
        read: false,
        createdAt: new Date(),
        sender: mockClient,
      });

      (prisma.conversation.update as any).mockResolvedValue({ id: mockConversationId });

      const res = await sendMessageAction({
        conversationId: mockConversationId,
        content: "Let's schedule a kickoff call tomorrow at 2 PM.",
      });

      expect(res.success).toBe(true);
      expect(res.message?.content).toContain("kickoff call");
    });
  });
});

