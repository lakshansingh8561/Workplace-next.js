/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/proposal.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateProposalStatusAction } from "./proposal";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proposal: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actions/notification", () => ({
  createNotificationSafe: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

describe("updateProposalStatusAction - Phase 6 One Contract Per Job Enforcement", () => {
  const clientId = "507f1f77bcf86cd799439011";
  const freelancerId = "507f1f77bcf86cd799439012";
  const jobId = "507f1f77bcf86cd799439013";
  const proposalId = "507f1f77bcf86cd799439014";
  const contractId = "507f1f77bcf86cd799439015";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully accepts proposal and forms single contract in atomic transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        proposal: {
          findUnique: vi.fn().mockResolvedValue({
            id: proposalId,
            status: "PENDING",
            freelancerId,
            bidAmount: 5000,
            estimatedDuration: "1 month",
            job: {
              id: jobId,
              title: "Senior Fullstack Engineer",
              type: "FIXED",
              clientId,
              status: "OPEN",
            },
          }),
          update: vi.fn().mockResolvedValue({ id: proposalId, status: "ACCEPTED" }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        job: {
          update: vi.fn().mockResolvedValue({ id: jobId, status: "CLOSED" }),
        },
        contract: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: contractId,
            jobId,
            proposalId,
            clientId,
            freelancerId,
            status: "ACTIVE",
          }),
        },
      };
      return callback(mockTx);
    });

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ACCEPTED");
    expect(result.contractId).toBe(contractId);
    expect(result.proposalId).toBe(proposalId);
  });

  it("rejects acceptance when in-transaction check detects existing job contract", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        proposal: {
          findUnique: vi.fn().mockResolvedValue({
            id: proposalId,
            status: "PENDING",
            freelancerId,
            job: {
              id: jobId,
              title: "Senior Fullstack Engineer",
              type: "FIXED",
              clientId,
              status: "OPEN",
            },
          }),
        },
        job: {
          update: vi.fn().mockResolvedValue({ id: jobId, status: "CLOSED" }),
        },
        contract: {
          findFirst: vi.fn().mockResolvedValue({ id: "existing-contract-id", jobId }),
        },
      };
      return callback(mockTx);
    });

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("A contract has already been awarded and formed for this job.");
  });

  it("maps Prisma P2002 unique constraint error on Contract.jobId to friendly contract awarded message", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the constraint: contracts_jobId_key",
      {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { target: ["jobId"], modelName: "Contract" },
      }
    );

    vi.mocked(prisma.$transaction).mockRejectedValue(p2002Error);

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("A contract has already been awarded and formed for this job.");
  });

  it("handles MongoDB E11000 duplicate key error on contracts.jobId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    const mongoDupError = new Error(
      "E11000 duplicate key error collection: freelance.contracts index: jobId_1 dup key: { jobId: ObjectId('...') }"
    );
    (mongoDupError as any).code = 11000;

    vi.mocked(prisma.$transaction).mockRejectedValue(mongoDupError);

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("A contract has already been awarded and formed for this job.");
  });

  it("does not classify unrelated duplicate errors on other models as contract duplicate errors", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    const unrelatedP2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the constraint: users_email_key",
      {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { target: ["email"], modelName: "User" },
      }
    );

    vi.mocked(prisma.$transaction).mockRejectedValue(unrelatedP2002);

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("A conflict occurred with an existing record. Please try again.");
    expect(result.error).not.toContain("contract has already been awarded");
  });

  it("handles transaction write conflicts (P2034) with clear concurrency guidance", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    const writeConflictError = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict or deadlock.",
      {
        code: "P2034",
        clientVersion: "6.19.3",
      }
    );

    vi.mocked(prisma.$transaction).mockRejectedValue(writeConflictError);

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("This proposal is being processed, or another proposal may already have been accepted.");
  });

  it("rejects acceptance if job status is no longer OPEN", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientId,
      role: "CLIENT",
      email: "client@example.com",
    } as any);

    vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
      id: proposalId,
      status: "PENDING",
      freelancerId,
      job: {
        id: jobId,
        title: "Senior Fullstack Engineer",
        type: "FIXED",
        clientId,
        status: "OPEN",
      },
    } as any);

    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        proposal: {
          findUnique: vi.fn().mockResolvedValue({
            id: proposalId,
            status: "PENDING",
            freelancerId,
            job: {
              id: jobId,
              title: "Senior Fullstack Engineer",
              type: "FIXED",
              clientId,
              status: "CLOSED",
            },
          }),
        },
      };
      return callback(mockTx);
    });

    const result = await updateProposalStatusAction({
      proposalId,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Cannot accept proposal. This job contract is already closed.");
  });
});
