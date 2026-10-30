/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJobAction } from "./job";
import { submitProposalAction } from "./proposal";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { resetRateLimits } from "@/lib/rate-limit";

vi.mock("@/lib/prisma", () => {
  const mockPrisma: any = {
    job: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    proposal: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return cb(mockPrisma);
      }
      return cb;
    }),
  };
  return { prisma: mockPrisma };
});

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn(),
}));

describe("Task 1: Rate Limiting for Marketplace Actions", () => {
  const clientAId = "507f1f77bcf86cd799439011";
  const clientBId = "507f1f77bcf86cd799439012";
  const freelancerAId = "507f1f77bcf86cd799439021";
  const freelancerBId = "507f1f77bcf86cd799439022";
  const jobId = "507f1f77bcf86cd799439031";

  const validJobPayload = {
    title: "Senior Full Stack Engineer for SaaS Marketplace",
    description: "Detailed job description outlining architectural deliverables and tech stack.",
    category: "Development & IT",
    skills: ["Next.js", "TypeScript", "Node.js"],
    type: "FIXED",
    budget: 1500,
    experienceLevel: "EXPERT",
  };

  const validProposalPayload = {
    jobId,
    bidAmount: 1200,
    coverLetter: "Comprehensive proposal with verifiable architectural portfolio deliverables that exceeds thirty chars.",
    estimatedDuration: "1 to 3 months",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();

    (prisma.job.create as any).mockResolvedValue({
      id: "job_created_123",
      title: validJobPayload.title,
      status: "OPEN",
    });

    (prisma.job.findUnique as any).mockResolvedValue({
      id: jobId,
      title: "Active Job Requirement",
      type: "FIXED",
      status: "OPEN",
      clientId: clientAId,
      budget: 1500,
    });

    (prisma.proposal.findUnique as any).mockResolvedValue(null);
    (prisma.proposal.create as any).mockResolvedValue({
      id: "prop_created_123",
      jobId,
      freelancerId: freelancerAId,
      status: "PENDING",
    });
  });

  describe("createJobAction Rate Limiting (5 per hour per user)", () => {
    it("rejects unauthenticated job creation requests before rate limit deduction", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const res = await createJobAction(validJobPayload);
      expect(res.success).toBe(false);
      expect(res.error).toContain("must be signed in");
    });

    it("permits up to 5 job creations within the hourly window for an authenticated client", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: clientAId,
        role: "CLIENT",
      });

      for (let i = 0; i < 5; i++) {
        const res = await createJobAction(validJobPayload);
        expect(res.success).toBe(true);
      }

      expect(prisma.job.create).toHaveBeenCalledTimes(5);
    });

    it("blocks the 6th job creation attempt with a safe rate-limit message", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: clientAId,
        role: "CLIENT",
      });

      for (let i = 0; i < 5; i++) {
        await createJobAction(validJobPayload);
      }

      const blockedRes = await createJobAction(validJobPayload);
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toBe(
        "Too many jobs posted recently. Please wait before creating another job."
      );
      // Ensure database was NOT called on the blocked attempt
      expect(prisma.job.create).toHaveBeenCalledTimes(5);
    });

    it("tracks rate limits independently across different clients", async () => {
      // Client A exhausts 5 creations
      (getCurrentUser as any).mockResolvedValue({
        id: clientAId,
        role: "CLIENT",
      });
      for (let i = 0; i < 5; i++) {
        await createJobAction(validJobPayload);
      }

      // Client A is now blocked
      const blockedRes = await createJobAction(validJobPayload);
      expect(blockedRes.success).toBe(false);

      // Client B can still post jobs without interference
      (getCurrentUser as any).mockResolvedValue({
        id: clientBId,
        role: "CLIENT",
      });
      const clientBRes = await createJobAction(validJobPayload);
      expect(clientBRes.success).toBe(true);
    });
  });

  describe("submitProposalAction Rate Limiting (10 per 10 minutes per user)", () => {
    it("rejects unauthenticated proposal submissions before rate limit deduction", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const res = await submitProposalAction(validProposalPayload);
      expect(res.success).toBe(false);
      expect(res.error).toContain("must be signed in");
    });

    it("permits up to 10 proposal submissions within 10 minutes for an authenticated freelancer", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: freelancerAId,
        role: "FREELANCER",
        roleSelected: true,
      });

      for (let i = 0; i < 10; i++) {
        const res = await submitProposalAction(validProposalPayload);
        expect(res.success).toBe(true);
      }

      expect(prisma.proposal.create).toHaveBeenCalledTimes(10);
    });

    it("blocks the 11th proposal submission attempt with a safe rate-limit message", async () => {
      (getCurrentUser as any).mockResolvedValue({
        id: freelancerAId,
        role: "FREELANCER",
        roleSelected: true,
      });

      for (let i = 0; i < 10; i++) {
        await submitProposalAction(validProposalPayload);
      }

      const blockedRes = await submitProposalAction(validProposalPayload);
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toBe(
        "Too many proposal submissions. Please wait before submitting another proposal."
      );
      expect(prisma.proposal.create).toHaveBeenCalledTimes(10);
    });

    it("tracks rate limits independently across different freelancers", async () => {
      // Freelancer A exhausts 10 submissions
      (getCurrentUser as any).mockResolvedValue({
        id: freelancerAId,
        role: "FREELANCER",
        roleSelected: true,
      });
      for (let i = 0; i < 10; i++) {
        await submitProposalAction(validProposalPayload);
      }

      // Freelancer A is blocked
      const blockedRes = await submitProposalAction(validProposalPayload);
      expect(blockedRes.success).toBe(false);

      // Freelancer B can still submit proposals without interference
      (getCurrentUser as any).mockResolvedValue({
        id: freelancerBId,
        role: "FREELANCER",
        roleSelected: true,
      });
      const freelancerBRes = await submitProposalAction(validProposalPayload);
      expect(freelancerBRes.success).toBe(true);
    });
  });
});
