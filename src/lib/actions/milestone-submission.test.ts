/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  submitMilestoneAction,
  approveMilestoneAction,
  requestMilestoneChangesAction,
} from "./contract";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ContractStatus, MilestoneStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contractMilestone: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contract: {
      update: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => {
  const getCurrentUser = vi.fn();
  return {
    getCurrentUser,
    requireUser: vi.fn(),
    requireRole: vi.fn(),
    requireVerifiedUser: vi.fn(),
    verifyUserForAction: vi.fn(async (allowed?: string | string[]) => {
      const user = await getCurrentUser();
      if (!user) {
        return { success: false, error: "You must be signed in to perform this action.", code: "UNAUTHENTICATED" };
      }
      if (user.roleSelected === false) {
        return { success: false, error: "Please complete onboarding before performing this action.", code: "UNAUTHORIZED_ROLE" };
      }
      if (allowed) {
        const allowedList = Array.isArray(allowed) ? allowed : [allowed];
        if (!allowedList.includes(user.role)) {
          const roleLabels = allowedList.map((r) => r.toLowerCase()).join(" or ");
          return { success: false, error: `Unauthorized: Only ${roleLabels} accounts can perform this action.`, code: "UNAUTHORIZED_ROLE" };
        }
      }
      return { success: true, user: { ...user, emailVerified: user.emailVerified || new Date() } };
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Milestone Deliverable Submission & Approval Workflow", () => {
  const freelancerId = "507f1f77bcf86cd799439011";
  const clientId = "507f1f77bcf86cd799439022";
  const milestoneId = "507f1f77bcf86cd799439033";
  const contractId = "507f1f77bcf86cd799439044";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Freelancer Milestone Deliverable Submission", () => {
    it("successfully submits milestone with work description and attachments", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        email: "freelancer@test.com",
        role: "FREELANCER",
        roleSelected: true,
        emailVerified: new Date(),
      } as any);

      const mockMilestone = {
        id: milestoneId,
        title: "Frontend Integration",
        status: MilestoneStatus.ACTIVE,
        lifecycleVersion: 1,
        contract: {
          id: contractId,
          freelancerId,
          clientId,
          status: ContractStatus.ACTIVE,
        },
      };

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue(mockMilestone as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          contract: { update: vi.fn().mockResolvedValue({}) },
          contractMilestone: {
            findUnique: vi.fn().mockResolvedValue({
              id: milestoneId,
              status: MilestoneStatus.ACTIVE,
              lifecycleVersion: 1,
            }),
            update: vi.fn().mockResolvedValue({
              id: milestoneId,
              status: MilestoneStatus.SUBMITTED,
              lifecycleVersion: 2,
            }),
          },
        });
      });

      const res = await submitMilestoneAction({
        milestoneId,
        description: "Implemented all responsive UI components with unit tests.",
        attachments: [
          {
            fileName: "screenshot.png",
            fileUrl: "https://res.cloudinary.com/demo/image/upload/sample.png",
            fileType: "image/png",
            fileSize: 102400,
          },
        ],
        links: [
          {
            title: "GitHub Pull Request",
            url: "https://github.com/example/repo/pull/1",
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.milestoneId).toBe(milestoneId);
    });

    it("rejects submission if user is not the designated contract freelancer", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "507f1f77bcf86cd799439999",
        email: "attacker@test.com",
        role: "FREELANCER",
        roleSelected: true,
        emailVerified: new Date(),
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        contract: {
          id: contractId,
          freelancerId, // different freelancer
          clientId,
          status: ContractStatus.ACTIVE,
        },
      } as any);

      const res = await submitMilestoneAction({
        milestoneId,
        description: "Attempted unauthorized submission.",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized");
    });
  });

  describe("Client Revision Requests", () => {
    it("allows client to request changes on a submitted milestone with feedback", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        email: "client@test.com",
        role: "CLIENT",
        roleSelected: true,
        emailVerified: new Date(),
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        title: "Frontend Integration",
        status: MilestoneStatus.SUBMITTED,
        lifecycleVersion: 2,
        submissions: [
          {
            id: "sub-1",
            freelancerId,
            description: "Work completed",
            status: "SUBMITTED",
            submittedAt: new Date(),
            attachments: [],
            links: [],
          },
        ],
        contract: {
          id: contractId,
          freelancerId,
          clientId,
          status: ContractStatus.ACTIVE,
        },
      } as any);

      vi.mocked(prisma.contractMilestone.update).mockResolvedValue({
        id: milestoneId,
        status: MilestoneStatus.REVISION_REQUESTED,
        lifecycleVersion: 3,
      } as any);

      const res = await requestMilestoneChangesAction({
        milestoneId,
        feedback: "Please fix button contrast on dark mode and add mobile navigation tests.",
      });

      expect(res.success).toBe(true);
      expect(res.milestoneId).toBe(milestoneId);
    });

    it("rejects revision request from non-owner client", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "507f1f77bcf86cd799439888",
        email: "otherclient@test.com",
        role: "CLIENT",
        roleSelected: true,
        emailVerified: new Date(),
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        contract: {
          id: contractId,
          freelancerId,
          clientId, // different client
          status: ContractStatus.ACTIVE,
        },
      } as any);

      const res = await requestMilestoneChangesAction({
        milestoneId,
        feedback: "Unauthorized revision request.",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized");
    });
  });

  describe("Client Milestone Approval", () => {
    it("approves submitted milestone deliverable", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        email: "client@test.com",
        role: "CLIENT",
        roleSelected: true,
        emailVerified: new Date(),
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        title: "Frontend Integration",
        status: MilestoneStatus.SUBMITTED,
        lifecycleVersion: 2,
        contract: {
          id: contractId,
          freelancerId,
          clientId,
          status: ContractStatus.ACTIVE,
        },
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          contract: { update: vi.fn().mockResolvedValue({}) },
          contractMilestone: {
            findUnique: vi.fn().mockResolvedValue({
              id: milestoneId,
              status: MilestoneStatus.SUBMITTED,
              lifecycleVersion: 2,
              submissions: [],
            }),
            update: vi.fn().mockResolvedValue({
              id: milestoneId,
              status: MilestoneStatus.APPROVED,
              lifecycleVersion: 3,
            }),
          },
        });
      });

      const res = await approveMilestoneAction({ milestoneId });

      expect(res.success).toBe(true);
      expect(res.milestoneId).toBe(milestoneId);
    });
  });
});
