/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/email-verification-enforcement.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

import { createJobAction } from "./job";
import { submitProposalAction, updateProposalStatusAction } from "./proposal";
import { sendMessageAction } from "./message";
import { createMilestoneAction } from "./contract";
import {
  createMilestonePaymentOrderAction,
  createTimesheetPaymentOrderAction,
  verifyPaymentSignatureAction,
} from "./payment";
import { startTimeTrackingAction } from "./time-tracker";
import { submitReviewAction } from "./review";
import { cleanupExpiredTokensAction } from "./auth-recovery";

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
      return { success: true, user: { ...user, emailVerified: user.emailVerified || new Date() } };
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    proposal: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    contractMilestone: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    message: {
      create: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      deleteMany: vi.fn(),
    },
    emailVerificationToken: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("WorkPulse Phase 2 Final Verification Enforcement Security Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Unverified User Rejection across Marketplace Mutations", () => {
    it("rejects job creation when client has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_unverified_1",
        email: "unverified_client@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await createJobAction({
        title: "Build a Security Dashboard",
        description: "Need an engineer to build authentication dashboards with full tests.",
        category: "Web Development",
        skills: ["TypeScript", "Next.js"],
        paymentType: "FIXED",
        budget: 500,
        experienceLevel: "EXPERT",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it("rejects proposal submission when freelancer has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "freelancer_unverified_1",
        email: "unverified_freelancer@example.com",
        role: "FREELANCER",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await submitProposalAction({
        jobId: "507f1f77bcf86cd799439011",
        coverLetter: "I can deliver this project with high test coverage and zero security regressions.",
        bidAmount: 450,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.proposal.create).not.toHaveBeenCalled();
    });

    it("rejects sending direct messages when caller has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "user_unverified_1",
        email: "unverified_chat@example.com",
        role: "FREELANCER",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await sendMessageAction({
        conversationId: "507f1f77bcf86cd799439022",
        content: "Hello client, please check my proposal credentials.",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("rejects proposal acceptance and contract creation when client has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_unverified_2",
        email: "unverified_client2@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await updateProposalStatusAction({
        proposalId: "507f1f77bcf86cd799439033",
        status: "ACCEPTED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it("rejects milestone creation when client has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_unverified_3",
        email: "unverified_client3@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await createMilestoneAction({
        contractId: "507f1f77bcf86cd799439044",
        title: "Sprint 1 Deliverable",
        description: "Initial feature milestone.",
        amount: 250,
        order: 1,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.contractMilestone.create).not.toHaveBeenCalled();
    });

    it("rejects milestone payment order creation when client has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_unverified_4",
        email: "unverified_client4@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await createMilestonePaymentOrderAction({
        contractId: "507f1f77bcf86cd799439055",
        milestoneId: "507f1f77bcf86cd799439066",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it("rejects timesheet payment order creation when client has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_unverified_5",
        email: "unverified_client5@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await createTimesheetPaymentOrderAction({
        contractId: "507f1f77bcf86cd799439077",
        timeEntryIds: ["507f1f77bcf86cd799439088"],
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it("rejects time tracking start when freelancer has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "freelancer_unverified_2",
        email: "unverified_tracker@example.com",
        role: "FREELANCER",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await startTimeTrackingAction({
        contractId: "507f1f77bcf86cd799439099",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
    });

    it("rejects review submission when caller has emailVerified = null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_unverified_6",
        email: "unverified_reviewer@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      const res = await submitReviewAction({
        contractId: "507f1f77bcf86cd7994390aa",
        rating: 5,
        feedback: "Outstanding work delivered on schedule with high quality.",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Please verify your email address to access this feature.");
    });
  });

  describe("2. Verified Users and Google OAuth Compatibility", () => {
    it("allows verified credentials client to create a job", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_verified_1",
        email: "verified_client@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: new Date("2026-11-01T12:00:00Z"),
      } as any);

      vi.mocked(prisma.job.create).mockResolvedValue({
        id: "job_created_123",
        clientId: "client_verified_1",
      } as any);

      const res = await createJobAction({
        title: "Verified Client Job Requirement",
        description: "Need senior React 19 and Next.js engineering talent with verified tests.",
        category: "Development & IT",
        skills: ["React", "TypeScript", "Next.js"],
        type: "FIXED",
        budget: 1200,
        duration: "1 to 3 months",
        experienceLevel: "EXPERT",
      });

      expect(res.success).toBe(true);
      expect(res.jobId).toBe("job_created_123");
      expect(prisma.job.create).toHaveBeenCalled();
    });

    it("allows trusted Google OAuth user (with emailVerified Date) to submit proposals", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "freelancer_google_oauth_1",
        email: "oauth_freelancer@gmail.com",
        role: "FREELANCER",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: new Date("2026-10-15T08:30:00Z"),
      } as any);

      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: "507f1f77bcf86cd7994390bb",
        clientId: "different_client_id",
        status: "OPEN",
        type: "FIXED",
        budget: 1000,
      } as any);

      vi.mocked(prisma.proposal.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          proposal: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "proposal_google_123" }),
          },
          job: {
            findUnique: vi.fn().mockResolvedValue({ status: "OPEN" }),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });

      const res = await submitProposalAction({
        jobId: "507f1f77bcf86cd7994390bb",
        coverLetter: "I am a verified Google OAuth contractor ready to begin work immediately.",
        bidAmount: 950,
      });

      expect(res.success).toBe(true);
      expect(res.proposalId).toBe("proposal_google_123");
    });
  });

  describe("3. Webhook Settlement & Payment Verification Independence", () => {
    it("does not block verifyPaymentSignatureAction due to unverified user status", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client_post_checkout_unverified",
        email: "unverified_settlement@example.com",
        role: "CLIENT",
        roleSelected: true,
        sessionVersion: 1,
        emailVerified: null,
      } as any);

      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: "pay_record_1",
        contractId: "507f1f77bcf86cd7994390cc",
        status: "PENDING",
      } as any);

      // Even if caller emailVerified is null, verifyPaymentSignatureAction does not reject on verification
      // It validates signature and payment record status
      const res = await verifyPaymentSignatureAction({
        contractId: "507f1f77bcf86cd7994390cc",
        razorpayOrderId: "order_test_123",
        razorpayPaymentId: "pay_test_456",
        razorpaySignature: "invalid_sig_will_fail_sig_not_verification",
      });

      // Signature verification fails due to bad signature, NOT due to email verification guard
      expect(res.error).not.toBe("Please verify your email address to access this feature.");
      expect(res.error).toContain("Payment verification failed");
    });
  });

  describe("4. Expired Token Purge Action", () => {
    it("purges expired password reset and email verification tokens safely using index", async () => {
      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 14 } as any);
      vi.mocked(prisma.emailVerificationToken.deleteMany).mockResolvedValue({ count: 28 } as any);

      const result = await cleanupExpiredTokensAction();

      expect(result.success).toBe(true);
      expect(result.deletedPasswordResetTokens).toBe(14);
      expect(result.deletedEmailVerificationTokens).toBe(28);
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalled();
    });
  });
});
