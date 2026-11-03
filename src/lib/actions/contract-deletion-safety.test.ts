/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/contract-deletion-safety.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteContractAction } from "./contract";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ContractStatus, MilestoneStatus, JobStatus, ProposalStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contract: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    payment: {
      count: vi.fn(),
    },
    timeEntry: {
      count: vi.fn(),
    },
    review: {
      count: vi.fn(),
    },
    contractMilestone: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    job: {
      update: vi.fn(),
    },
    proposal: {
      update: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      deleteMany: vi.fn(),
    },
    activeTimerReservation: {
      deleteMany: vi.fn(),
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
      if (user.emailVerified === null) {
        return { success: false, error: "Please verify your email address to access this feature.", code: "EMAIL_NOT_VERIFIED" };
      }
      return { success: true, user: { ...user, emailVerified: user.emailVerified || new Date() } };
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Contract Deletion Safety & Financial Integrity Tests (Task 2 Remediation)", () => {
  const clientOwnerId = "507f1f77bcf86cd799439001";
  const attackerClientId = "507f1f77bcf86cd799439002";
  const contractId = "507f1f77bcf86cd799439011";
  const jobId = "507f1f77bcf86cd799439021";
  const proposalId = "507f1f77bcf86cd799439031";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. rejects contract deletion by unauthorized client", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: attackerClientId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.ACTIVE,
      jobId,
      proposalId,
    } as any);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Unauthorized: You do not own this contract");
  });

  it("2. prohibits deletion if ANY payment record exists (financial audit retention)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.ACTIVE,
      jobId,
      proposalId,
    } as any);

    // Payment history exists
    vi.mocked(prisma.payment.count).mockResolvedValue(1);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Financial records exist");
    expect(res.error).toContain("financial audit compliance");
  });

  it("3. prohibits deletion if ANY logged time entries exist (timesheet audit retention)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.ACTIVE,
      jobId,
      proposalId,
    } as any);

    vi.mocked(prisma.payment.count).mockResolvedValue(0);
    // Time tracking records exist
    vi.mocked(prisma.timeEntry.count).mockResolvedValue(5);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Timesheet records exist");
    expect(res.error).toContain("audit compliance");
  });

  it("4. prohibits deletion of COMPLETED contracts (historical record retention)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.COMPLETED, // Completed contract
      jobId,
      proposalId,
    } as any);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Completed contracts must be permanently retained");
  });

  it("5. prohibits deletion if public reviews exist on the contract", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.TERMINATED,
      jobId,
      proposalId,
    } as any);

    vi.mocked(prisma.payment.count).mockResolvedValue(0);
    vi.mocked(prisma.timeEntry.count).mockResolvedValue(0);
    // Review exists
    vi.mocked(prisma.review.count).mockResolvedValue(1);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Reviews exist");
    expect(res.error).toContain("review history must be permanently retained");
  });

  it("6. prohibits deletion if active or paid milestones exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.ACTIVE,
      jobId,
      proposalId,
    } as any);

    vi.mocked(prisma.payment.count).mockResolvedValue(0);
    vi.mocked(prisma.timeEntry.count).mockResolvedValue(0);
    vi.mocked(prisma.review.count).mockResolvedValue(0);
    vi.mocked(prisma.contractMilestone.findFirst).mockResolvedValue({
      id: "milestone_1",
      status: MilestoneStatus.ACTIVE,
    } as any);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Active or settled milestones exist");
  });

  it("7. safely deletes unused draft contract and restores Job to OPEN and Proposal to PENDING", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.ACTIVE,
      jobId,
      proposalId,
    } as any);

    vi.mocked(prisma.payment.count).mockResolvedValue(0);
    vi.mocked(prisma.timeEntry.count).mockResolvedValue(0);
    vi.mocked(prisma.review.count).mockResolvedValue(0);
    vi.mocked(prisma.contractMilestone.findFirst).mockResolvedValue(null);

    const mockJobUpdate = vi.fn();
    const mockProposalUpdate = vi.fn();
    const mockContractUpdate = vi.fn();
    const mockContractDelete = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        contract: {
          update: mockContractUpdate,
          delete: mockContractDelete,
        },
        payment: { count: vi.fn().mockResolvedValue(0) },
        timeEntry: { count: vi.fn().mockResolvedValue(0) },
        job: { update: mockJobUpdate },
        proposal: { update: mockProposalUpdate },
        contractMilestone: { deleteMany: vi.fn() },
        conversation: {
          findUnique: vi.fn().mockResolvedValue({ id: "conv_1" }),
          delete: vi.fn(),
        },
        message: { deleteMany: vi.fn() },
        activeTimerReservation: { deleteMany: vi.fn() },
      });
    });

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(true);
    expect(res.contractId).toBe(contractId);

    // Contract was document-locked before deletion
    expect(mockContractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: contractId },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      })
    );

    // Job was restored to OPEN so client can re-hire
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data: { status: JobStatus.OPEN },
    });

    // Proposal was restored to PENDING so freelancer is not stranded
    expect(mockProposalUpdate).toHaveBeenCalledWith({
      where: { id: proposalId },
      data: { status: ProposalStatus.PENDING },
    });

    // Contract was deleted
    expect(mockContractDelete).toHaveBeenCalledWith({
      where: { id: contractId },
    });
  });

  it("8. catches Prisma P2003 referential action violation if concurrent child record is linked", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: clientOwnerId,
      role: "CLIENT",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId,
      clientId: clientOwnerId,
      status: ContractStatus.ACTIVE,
      jobId,
      proposalId,
    } as any);

    vi.mocked(prisma.payment.count).mockResolvedValue(0);
    vi.mocked(prisma.timeEntry.count).mockResolvedValue(0);
    vi.mocked(prisma.review.count).mockResolvedValue(0);
    vi.mocked(prisma.contractMilestone.findFirst).mockResolvedValue(null);

    const p2003Error = new Error("Foreign key constraint failed on the field: contractId");
    (p2003Error as any).code = "P2003";

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(p2003Error);

    const res = await deleteContractAction({ contractId });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Referential integrity protection active");
  });
});
