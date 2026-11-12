/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  sendInterviewInvitationAction,
  getMyInvitationsAction,
} from "./invitation";
import {
  saveJobSearchAction,
  matchJobAlertsForPublishedJob,
} from "./saved-search";
import {
  createJobAction,
  updateJobStatusAction,
} from "./job";
import { getRecommendedJobsAction } from "./job-recommendations";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn().mockResolvedValue({ success: true }),
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
    verifyUserForAction: vi.fn(async (allowed?: string | string[]) => {
      const user = await getCurrentUser();
      if (!user) {
        return { success: false, error: "Authentication required", code: "UNAUTHENTICATED" };
      }
      if (allowed) {
        const list = Array.isArray(allowed) ? allowed : [allowed];
        if (!list.includes(user.role)) {
          return { success: false, error: "Unauthorized role", code: "UNAUTHORIZED_ROLE" };
        }
      }
      return { success: true, user };
    }),
  };
});

vi.mock("@/lib/prisma", () => {
  const mockTx = {
    interviewInvitation: {
      findUnique: vi.fn().mockResolvedValue({ id: "inv-1", status: "DECLINED" }),
      create: vi.fn().mockResolvedValue({ id: "inv-created" }),
      update: vi.fn().mockResolvedValue({ id: "inv-renewed" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    conversation: {
      findUnique: vi.fn().mockResolvedValue({ id: "conv-1" }),
      create: vi.fn().mockResolvedValue({ id: "conv-created" }),
      update: vi.fn().mockResolvedValue({ id: "conv-1" }),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
    },
  };

  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      job: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      contract: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      proposal: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      interviewInvitation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      message: {
        create: vi.fn(),
      },
      review: {
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      savedJob: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: any) => callback(mockTx)),
    },
  };
});

describe("WorkPulse Phase 7: Job Marketplace and Invitations", () => {
  const mockClientId = "67a000000000000000000001";
  const mockFreelancerId = "67a000000000000000000002";
  const mockJobId = "67a000000000000000000003";

  const clientUser = {
    id: mockClientId,
    name: "Acme Client",
    email: "client@example.com",
    role: "CLIENT",
    roleSelected: true,
    emailVerified: new Date(),
  };

  const freelancerUser = {
    id: mockFreelancerId,
    name: "Dev Freelancer",
    email: "freelancer@example.com",
    role: "FREELANCER",
    roleSelected: true,
    emailVerified: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Client-to-Freelancer Invitations", () => {
    it("prevents duplicate active invitations when one is already PENDING", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        title: "Build App",
        clientId: mockClientId,
        status: "OPEN",
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockFreelancerId,
        role: "FREELANCER",
        roleSelected: true,
      });

      // Existing invitation with PENDING status
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: "inv-1",
        status: "PENDING",
      });

      const res = await sendInterviewInvitationAction({
        jobId: mockJobId,
        freelancerId: mockFreelancerId,
        message: "We'd like to interview you for this role.",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invitation has already been sent to this freelancer/i);
    });

    it("allows renewing an invitation if previous invitation was DECLINED or EXPIRED", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        title: "Build App",
        clientId: mockClientId,
        status: "OPEN",
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockFreelancerId,
        role: "FREELANCER",
        roleSelected: true,
      });

      // Initially found as DECLINED
      (prisma.interviewInvitation.findUnique as any).mockResolvedValue({
        id: "inv-declined-1",
        status: "DECLINED",
      });

      const res = await sendInterviewInvitationAction({
        jobId: mockJobId,
        freelancerId: mockFreelancerId,
        message: "Re-inviting you with updated terms.",
      });

      expect(res.success).toBe(true);
    });

    it("computes accurate lazy expiry status in getMyInvitationsAction", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      (prisma.interviewInvitation.findMany as any).mockResolvedValue([
        {
          id: "inv-expired",
          jobId: mockJobId,
          clientId: mockClientId,
          freelancerId: mockFreelancerId,
          conversationId: "conv-1",
          message: "Interview me",
          status: "PENDING", // still stored as PENDING in DB
          expiresAt: pastDate, // but past expiry!
          respondedAt: null,
          createdAt: new Date(),
          job: { id: mockJobId, title: "Test Job", type: "FIXED", budget: 500, status: "OPEN" },
          client: clientUser,
          freelancer: freelancerUser,
        },
      ]);

      const res = await getMyInvitationsAction();

      expect(res.success).toBe(true);
      expect(res.invitations).toHaveLength(1);
      // Status must be dynamically computed as EXPIRED
      expect(res.invitations?.[0].status).toBe("EXPIRED");
      expect(res.invitations?.[0].counterparty.role).toBe("FREELANCER");
    });
  });

  describe("2. Saved Searches and Job Alerts", () => {
    it("saves a job search and prevents duplicate search names", async () => {
      (getCurrentUser as any).mockResolvedValue(freelancerUser);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockFreelancerId,
        savedSearches: [
          { id: "s-1", name: "Existing Search", query: "React" },
        ],
      });

      // Saving duplicate name must fail
      const dupRes = await saveJobSearchAction({
        name: "existing search",
        query: "React 19",
      });

      expect(dupRes.success).toBe(false);
      expect(dupRes.error).toContain('A saved search named "existing search" already exists');

      // Saving new name must succeed
      (prisma.user.update as any).mockResolvedValue({ id: mockFreelancerId });
      const newRes = await saveJobSearchAction({
        name: "Next.js High Budget",
        query: "Next.js",
        category: "Development & IT",
        type: "FIXED",
        minBudget: 1000,
      });

      expect(newRes.success).toBe(true);
      expect(newRes.savedSearchId).toBeDefined();
    });

    it("matches newly published jobs and triggers idempotent job alerts", async () => {
      (prisma.user.findMany as any).mockResolvedValue([
        {
          id: mockFreelancerId,
          savedSearches: [
            {
              id: "srch-100",
              name: "React Alert",
              query: "React",
              category: "Development & IT",
              type: "FIXED",
              minBudget: 500,
              alertsEnabled: true,
            },
          ],
        },
      ]);

      const matchingJob = {
        id: "job-published-1",
        title: "Senior React Architect",
        description: "Looking for an expert React developer for a greenfield build.",
        category: "Development & IT",
        skills: ["React", "TypeScript"],
        type: "FIXED",
        budget: 1500,
        clientId: mockClientId,
      };

      const alertsDispatched = await matchJobAlertsForPublishedJob(matchingJob);

      expect(alertsDispatched).toBe(1);
    });
  });

  describe("3. Job Publishing Improvements", () => {
    it("detects and prevents duplicate job postings within a 10-minute window", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);

      (prisma.job.findFirst as any).mockResolvedValue({
        id: "existing-recent-job",
      });

      const res = await createJobAction({
        title: "Full-Stack Web App",
        description: "A detailed description that has more than twenty characters for validation.",
        category: "Development & IT",
        skills: ["Next.js", "TypeScript"],
        type: "FIXED",
        budget: 2000,
        duration: "1 to 3 months",
        experienceLevel: "EXPERT",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("was already published recently");
    });

    it("allows creating a job with DRAFT status", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);
      (prisma.job.findFirst as any).mockResolvedValue(null); // no duplicate

      (prisma.review.aggregate as any).mockResolvedValue({ _avg: { rating: 4.9 } });
      (prisma.contract.count as any).mockResolvedValue(3);

      (prisma.job.create as any).mockResolvedValue({
        id: "job-draft-1",
        title: "Draft Web App",
        category: "Development & IT",
        createdAt: new Date(),
      });

      const res = await createJobAction({
        title: "Draft Web App",
        description: "A detailed description that has more than twenty characters for validation.",
        category: "Development & IT",
        skills: ["Next.js"],
        type: "FIXED",
        budget: 1000,
        duration: "Less than 1 month",
        experienceLevel: "INTERMEDIATE",
        status: "DRAFT",
      });

      expect(res.success).toBe(true);
      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DRAFT",
            clientRating: 4.9,
            clientPaymentVerified: true,
          }),
        })
      );
    });

    it("allows reopening an eligible CLOSED job when no active contract is running", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        title: "Closed Job",
        description: "Long description for job...",
        category: "Development & IT",
        skills: ["React"],
        type: "FIXED",
        clientId: mockClientId,
        status: "CLOSED",
      });

      // No active contract in progress
      (prisma.contract.findFirst as any).mockResolvedValue(null);
      (prisma.job.update as any).mockResolvedValue({
        id: mockJobId,
        status: "OPEN",
      });

      const res = await updateJobStatusAction({
        jobId: mockJobId,
        status: "OPEN",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("OPEN");
    });

    it("blocks reopening a CLOSED job if an active contract is already in progress", async () => {
      (getCurrentUser as any).mockResolvedValue(clientUser);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        title: "Closed Job",
        clientId: mockClientId,
        status: "CLOSED",
      });

      // Active contract exists
      (prisma.contract.findFirst as any).mockResolvedValue({
        id: "active-contract-1",
        status: "ACTIVE",
      });

      const res = await updateJobStatusAction({
        jobId: mockJobId,
        status: "OPEN",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("An active contract is already in progress");
    });
  });

  describe("4. Job Recommendations", () => {
    it("generates explainable job matches based on skill overlap and category", async () => {
      (getCurrentUser as any).mockResolvedValue(freelancerUser);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockFreelancerId,
        skills: ["React", "TypeScript", "Tailwind CSS"],
        experience: "5+ years",
        title: "Senior Full-Stack Engineer",
        bio: "Specialist in Development & IT systems.",
      });

      (prisma.proposal.findMany as any).mockResolvedValue([]); // not applied to any

      (prisma.job.findMany as any).mockResolvedValue([
        {
          id: "job-perfect-match",
          title: "Senior React Engineer",
          description: "Full-stack role",
          category: "Development & IT",
          skills: ["React", "TypeScript"],
          type: "HOURLY",
          hourlyMin: 60,
          hourlyMax: 90,
          experienceLevel: "EXPERT",
          proposalsCount: 2,
          createdAt: new Date(),
          clientName: "Tech Corp",
          clientCountry: "USA",
          clientRating: 5.0,
        },
      ]);

      const res = await getRecommendedJobsAction();

      expect(res.success).toBe(true);
      expect(res.isPersonalized).toBe(true);
      expect(res.recommendedJobs).toHaveLength(1);
      const rec = res.recommendedJobs[0];
      expect(rec.matchingSkills).toContain("React");
      expect(rec.matchingSkills).toContain("TypeScript");
      expect(rec.matchScore).toBeGreaterThan(60);
      expect(rec.matchReasons.length).toBeGreaterThan(0);
    });
  });
});
