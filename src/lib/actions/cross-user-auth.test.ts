/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/cross-user-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Import target actions across all security domains
import { createJobAction, updateJobStatusAction } from "./job";
import {
  submitProposalAction,
  updateProposalStatusAction,
  getJobProposalsForReview,
} from "./proposal";
import {
  createMilestoneAction,
  submitMilestoneAction,
  approveMilestoneAction,
  updateContractStatusAction,
  deleteContractAction,
} from "./contract";
import {
  startTimeTrackingAction,
  pauseTimeTrackingAction,
  resumeTimeTrackingAction,
  stopTimeTrackingAction,
  approveTimeEntriesAction,
  disputeTimeEntriesAction,
} from "./time-tracker";
import { resetActiveTimerLocks } from "@/lib/timer-mutex";
import {
  createMilestonePaymentOrderAction,
  createTimesheetPaymentOrderAction,
  getContractPaymentHistoryAction,
} from "./payment";
import { getMessagesAction, sendMessageAction } from "./message";
import { markNotificationReadAction } from "./notification";

import {
  JobStatus,
  ContractStatus,
  MilestoneStatus,
  PaymentType,
  TimeTrackingStatus,
} from "@prisma/client";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actions/notification", async () => {
  const actual = await vi.importActual<any>("@/lib/actions/notification");
  return {
    ...actual,
    createNotificationSafe: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    proposal: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contractMilestone: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    timeEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    timeScreenshot: {
      create: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((callback: any) =>
      callback({
        user: { update: vi.fn() },
        contractMilestone: { deleteMany: vi.fn() },
        conversation: {
          findUnique: vi.fn().mockResolvedValue({ id: "507f1f77bcf86cd799439090" }),
          delete: vi.fn(),
        },
        message: { deleteMany: vi.fn() },
        contract: { delete: vi.fn() },
        timeEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "507f1f77bcf86cd799439050",
            status: TimeTrackingStatus.RECORDING,
          }),
        },
      })
    ),
  },
}));

describe("Cross-User Authorization Security Test Suite", () => {
  // Identifiers for multi-tenant simulation
  const clientOwnerId = "507f1f77bcf86cd799439011";
  const clientAttackerId = "507f1f77bcf86cd799439012";
  const freelancerAssignedId = "507f1f77bcf86cd799439021";
  const freelancerAttackerId = "507f1f77bcf86cd799439022";
  const nonParticipantId = "507f1f77bcf86cd799439033";

  const jobId = "507f1f77bcf86cd799439041";
  const proposalId = "507f1f77bcf86cd799439042";
  const contractId = "507f1f77bcf86cd799439043";
  const milestoneId = "507f1f77bcf86cd799439044";
  const timeEntryId = "507f1f77bcf86cd799439045";
  const conversationId = "507f1f77bcf86cd799439046";
  const notificationId = "507f1f77bcf86cd799439047";

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveTimerLocks();
  });

  // ==========================================
  // SECTION 1: JOBS AUTHORIZATION
  // ==========================================
  describe("Jobs Authorization", () => {
    it("rejects non-owner client attempting to update another client's job status", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: jobId,
        clientId: clientOwnerId, // Owned by Client A
        status: JobStatus.OPEN,
      } as any);

      const res = await updateJobStatusAction({
        jobId,
        status: JobStatus.CLOSED,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this job contract");
    });

    it("rejects freelancer attempting to perform client-only job status update", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      const res = await updateJobStatusAction({
        jobId,
        status: JobStatus.CLOSED,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only client accounts can manage job status");
    });

    it("rejects freelancer attempting to create a job posting", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      const res = await createJobAction({
        title: "Senior Full Stack Engineer",
        description: "Comprehensive job description with sufficient characters for validation.",
        category: "Development & IT",
        budgetType: "FIXED",
        budget: 2500,
        experienceLevel: "EXPERT",
        estimatedDuration: "1 to 3 months",
        skills: ["React", "Node.js"],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only client accounts can post freelance jobs");
    });
  });

  // ==========================================
  // SECTION 2: PROPOSALS AUTHORIZATION
  // ==========================================
  describe("Proposals Authorization", () => {
    it("rejects client attempting to review proposals for a job they do not own", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: jobId,
        clientId: clientOwnerId, // Owned by Client A
      } as any);

      const res = await getJobProposalsForReview(jobId);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this job posting");
    });

    it("rejects client attempting to accept/update proposal for a job owned by another client", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.proposal.findUnique).mockResolvedValue({
        id: proposalId,
        jobId,
        freelancerId: freelancerAssignedId,
        job: {
          id: jobId,
          clientId: clientOwnerId, // Owned by Client A
        },
      } as any);

      const res = await updateProposalStatusAction({
        proposalId,
        status: "ACCEPTED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own the job associated with this proposal");
    });

    it("rejects client attempting to submit a proposal", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      const res = await submitProposalAction({
        jobId,
        coverLetter: "Trying to submit proposal as client with sufficient length.",
        bidAmount: 1500,
        estimatedDuration: "1 to 3 months",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only freelancer accounts can submit proposals");
    });

    it("rejects freelancer attempting to accept or decline proposals", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      const res = await updateProposalStatusAction({
        proposalId,
        status: "ACCEPTED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only client accounts can manage proposals");
    });
  });

  // ==========================================
  // SECTION 3: CONTRACTS, MILESTONES & AUDIT DELETION
  // ==========================================
  describe("Contracts & Milestones Authorization and Audit Protection", () => {
    it("rejects client attempting to create milestones on another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId, // Owned by Client A
        status: ContractStatus.ACTIVE,
      } as any);

      const res = await createMilestoneAction({
        contractId,
        title: "Unauthorized Milestone",
        amount: 500,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this contract");
    });

    it("rejects freelancer attempting to create milestones", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      const res = await createMilestoneAction({
        contractId,
        title: "Freelancer Milestone",
        amount: 500,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only client accounts can create contract milestones");
    });

    it("rejects client attempting to submit a freelancer milestone delivery", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      const res = await submitMilestoneAction({
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only freelancer accounts can submit milestone deliverables");
    });

    it("rejects different freelancer attempting to submit milestone delivery on another freelancer's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAttackerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.ACTIVE,
        contract: {
          id: contractId,
          freelancerId: freelancerAssignedId, // Assigned to Freelancer A
          status: ContractStatus.ACTIVE,
        },
      } as any);

      const res = await submitMilestoneAction({
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("You are not the assigned freelancer for this contract");
    });

    it("rejects freelancer attempting to approve their own milestone delivery", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      const res = await approveMilestoneAction({
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only client accounts can");
    });

    it("rejects different client attempting to approve another client's milestone", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.SUBMITTED,
        contract: {
          id: contractId,
          clientId: clientOwnerId, // Owned by Client A
        },
      } as any);

      const res = await approveMilestoneAction({
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own the contract associated with this milestone");
    });

    it("rejects different client attempting to update status of another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
      } as any);

      const res = await updateContractStatusAction({
        contractId,
        status: "COMPLETED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this contract");
    });

    it("rejects different client attempting to delete another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
      } as any);

      const res = await deleteContractAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this contract");
    });

    it("TASK 3: prevents deleting a contract when payment records exist (financial audit preservation)", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
      } as any);

      // Payment records exist
      vi.mocked(prisma.payment.count).mockResolvedValue(1);

      const res = await deleteContractAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Financial records exist");
      expect(res.error).toContain("financial audit compliance");
    });

    it("TASK 3: prevents deleting a contract when time entries exist (timesheet audit preservation)", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.payment.count).mockResolvedValue(0);
      // Time entry records exist
      vi.mocked(prisma.timeEntry.count).mockResolvedValue(3);

      const res = await deleteContractAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Timesheet records exist");
      expect(res.error).toContain("audit compliance");
    });

    it("TASK 3: prevents deleting a contract with active or paid milestones", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.payment.count).mockResolvedValue(0);
      vi.mocked(prisma.timeEntry.count).mockResolvedValue(0);
      vi.mocked(prisma.contractMilestone.findFirst).mockResolvedValue({
        id: milestoneId,
      } as any);

      const res = await deleteContractAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Active or settled milestones exist");
    });

    it("TASK 3: allows safe deletion of an empty draft contract with zero financial activity", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.payment.count).mockResolvedValue(0);
      vi.mocked(prisma.timeEntry.count).mockResolvedValue(0);
      vi.mocked(prisma.contractMilestone.findFirst).mockResolvedValue(null);

      const res = await deleteContractAction({ contractId });
      expect(res.success).toBe(true);
      expect(res.contractId).toBe(contractId);
    });
  });

  // ==========================================
  // SECTION 4: TIMESHEETS AUTHORIZATION
  // ==========================================
  describe("Timesheets Authorization", () => {
    it("rejects client attempting to start time tracking", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientOwnerId,
        role: "CLIENT",
      } as any);

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only freelancer accounts can track work time");
    });

    it("rejects different freelancer attempting to start time tracking on another freelancer's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAttackerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 75,
        freelancerId: freelancerAssignedId, // Assigned to Freelancer A
      } as any);

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("You are not the assigned freelancer for this contract");
    });

    it("rejects different freelancer attempting to pause another freelancer's session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAttackerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId: freelancerAssignedId, // Owned by Freelancer A
        status: TimeTrackingStatus.RECORDING,
      } as any);

      const res = await pauseTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this time-tracking session");
    });

    it("rejects different freelancer attempting to resume another freelancer's session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAttackerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId: freelancerAssignedId,
        status: TimeTrackingStatus.PAUSED,
      } as any);

      const res = await resumeTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this time-tracking session");
    });

    it("rejects different freelancer attempting to stop another freelancer's session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAttackerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId: freelancerAssignedId,
        status: TimeTrackingStatus.RECORDING,
      } as any);

      const res = await stopTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized: You do not own this time-tracking session");
    });

    it("rejects freelancer attempting to approve timesheets", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      const res = await approveTimeEntriesAction({
        contractId,
        timeEntryIds: [timeEntryId],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract's client can approve timesheets");
    });

    it("rejects different client attempting to approve timesheets for another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId, // Owned by Client A
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
      } as any);

      const res = await approveTimeEntriesAction({
        contractId,
        timeEntryIds: [timeEntryId],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract's client can approve timesheets");
    });

    it("rejects different client attempting to dispute timesheets for another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
      } as any);

      const res = await disputeTimeEntriesAction({
        contractId,
        timeEntryIds: [timeEntryId],
        reason: "Disputing work",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract's client can dispute timesheets");
    });
  });

  // ==========================================
  // SECTION 5: PAYMENTS AUTHORIZATION
  // ==========================================
  describe("Payments Authorization", () => {
    it("rejects freelancer attempting to create milestone payment orders", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        contractId,
        contract: {
          id: contractId,
          clientId: clientOwnerId,
          status: ContractStatus.ACTIVE,
        },
      } as any);

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract client can initiate milestone payments");
    });

    it("rejects different client attempting to create milestone payment orders for another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contractMilestone.findUnique).mockResolvedValue({
        id: milestoneId,
        contractId,
        contract: {
          id: contractId,
          clientId: clientOwnerId, // Owned by Client A
          status: ContractStatus.ACTIVE,
        },
      } as any);

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract client can initiate milestone payments");
    });

    it("rejects freelancer attempting to create timesheet payment orders", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerAssignedId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
        type: PaymentType.HOURLY,
      } as any);

      const res = await createTimesheetPaymentOrderAction({
        contractId,
        timeEntryIds: [timeEntryId],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract client can initiate timesheet payments");
    });

    it("rejects different client attempting to create timesheet payment orders for another client's contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        status: ContractStatus.ACTIVE,
        type: PaymentType.HOURLY,
      } as any);

      const res = await createTimesheetPaymentOrderAction({
        contractId,
        timeEntryIds: [timeEntryId],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only the contract client can initiate timesheet payments");
    });

    it("rejects unauthorized non-participant user attempting to view private contract payment history", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: nonParticipantId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        clientId: clientOwnerId,
        freelancerId: freelancerAssignedId,
      } as any);

      const res = await getContractPaymentHistoryAction(contractId);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized");
    });
  });

  // ==========================================
  // SECTION 6: MESSAGES & NOTIFICATIONS AUTHORIZATION
  // ==========================================
  describe("Messages & Notifications Authorization", () => {
    it("rejects non-participant attempting to view conversation messages", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: nonParticipantId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        id: conversationId,
        clientId: clientOwnerId,
        freelancerId: freelancerAssignedId,
        contract: {
          id: contractId,
          title: "Confidential Project",
          status: ContractStatus.ACTIVE,
        },
        client: { id: clientOwnerId, name: "Client A", role: "CLIENT" },
        freelancer: { id: freelancerAssignedId, name: "Freelancer A", role: "FREELANCER" },
      } as any);

      const res = await getMessagesAction(conversationId);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Forbidden: You are not authorized to view this conversation");
    });

    it("rejects non-participant attempting to send messages in a private conversation", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: nonParticipantId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        id: conversationId,
        clientId: clientOwnerId,
        freelancerId: freelancerAssignedId,
      } as any);

      const res = await sendMessageAction({
        conversationId,
        content: "Attempting to inject message into private conversation",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Forbidden: You are not a member of this conversation");
    });

    it("rejects User B attempting to mark User A's notification as read", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientAttackerId,
        role: "CLIENT",
      } as any);

      // Prisma updateMany where id = notificationId AND userId = clientAttackerId returns count = 0
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({
        count: 0,
      } as any);

      const res = await markNotificationReadAction({
        notificationId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Notification not found or access denied");
    });
  });
});

