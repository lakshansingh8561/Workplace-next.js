/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/time-tracker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startTimeTrackingAction,
  pauseTimeTrackingAction,
  resumeTimeTrackingAction,
  stopTimeTrackingAction,
  recordWorkSnapshotAction,
  getActiveTimeEntryAction,
  getContractWorkDiaryAction,
  submitTimeEntriesAction,
  approveTimeEntriesAction,
  disputeTimeEntriesAction,
} from "./time-tracker";
import { resetActiveTimerLocks } from "@/lib/timer-mutex";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  ContractStatus,
  PaymentType,
  TimeTrackingStatus,
  TimesheetReviewStatus,
} from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contract: {
      findUnique: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    timeEntry: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    timeScreenshot: {
      create: vi.fn(),
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

describe("WorkPulse Time Tracker & Hourly Billing Server Actions", () => {
  const freelancerId = "507f1f77bcf86cd799439021";
  const otherFreelancerId = "507f1f77bcf86cd799439022";
  const contractId = "507f1f77bcf86cd799439023";
  const timeEntryId = "507f1f77bcf86cd799439024";

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveTimerLocks();
  });

  describe("startTimeTrackingAction - Authorization & Validation", () => {
    it("rejects unauthenticated user", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("signed in");
    });

    it("rejects non-freelancer accounts", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client-id",
        role: "CLIENT",
      } as any);
      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only freelancer accounts");
    });

    it("rejects when freelancer is not assigned to the contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId: otherFreelancerId,
      } as any);

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("not the assigned freelancer");
    });

    it("rejects tracking on FIXED price contracts", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.FIXED,
        status: ContractStatus.ACTIVE,
        hourlyRate: null,
        freelancerId,
      } as any);

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("only supported for hourly contracts");
    });

    it("rejects tracking on non-ACTIVE contracts (e.g. PAUSED or COMPLETED)", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.PAUSED,
        hourlyRate: 65,
        freelancerId,
      } as any);

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("currently paused");
    });

    it("successfully starts tracking and records snapshot of contract hourly rate", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 75.5,
        freelancerId,
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const mockTx = {
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: timeEntryId,
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        };
        return cb(mockTx);
      });

      const res = await startTimeTrackingAction({
        contractId,
        description: "Implementing GraphQL resolvers",
      });

      expect(res.success).toBe(true);
      expect(res.timeEntryId).toBe(timeEntryId);
      expect(res.status).toBe(TimeTrackingStatus.RECORDING);
    });

    it("prevents overlapping active sessions when another session is already in progress", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 80,
        freelancerId,
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const mockTx = {
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue({
              id: "existing-active-session",
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        };
        return cb(mockTx);
      });

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("active time session is already in progress");
    });
  });

  describe("pauseTimeTrackingAction & resumeTimeTrackingAction - State Machine & Timing", () => {
    it("pauses an actively recording session and stores pausedAt timestamp", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
      } as any);

      vi.mocked(prisma.timeEntry.update).mockResolvedValue({
        id: timeEntryId,
        status: TimeTrackingStatus.PAUSED,
      } as any);

      const res = await pauseTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(true);
      expect(res.status).toBe(TimeTrackingStatus.PAUSED);
    });

    it("rejects pausing a session that has already been stopped", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.STOPPED,
      } as any);

      const res = await pauseTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("already been stopped");
    });

    it("resumes a paused session and accumulates paused duration in totalPausedSeconds", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.PAUSED,
        pausedAt: tenMinutesAgo,
        totalPausedSeconds: 120, // 2 minutes previously paused
      } as any);

      let updatedData: any;
      (vi.mocked(prisma.timeEntry.update) as any).mockImplementation(async (args: any) => {
        updatedData = args.data;
        return {
          id: timeEntryId,
          status: args.data.status,
        };
      });

      const res = await resumeTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(true);
      expect(res.status).toBe(TimeTrackingStatus.RECORDING);
      expect(updatedData.pausedAt).toBeNull();
      // ~600 seconds additional pause + 120 initial = ~720 seconds total
      expect(updatedData.totalPausedSeconds).toBeGreaterThanOrEqual(719);
      expect(updatedData.totalPausedSeconds).toBeLessThanOrEqual(725);
    });

    it("rejects resuming a stopped session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.STOPPED,
      } as any);

      const res = await resumeTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("already been stopped");
    });
  });

  describe("stopTimeTrackingAction - Billing Calculation & Finalization", () => {
    it("correctly calculates net billable seconds and billable amount for an active session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      // Session started 2 hours ago (7200 seconds), paused for 30 minutes (1800 seconds)
      // Net billable time = 5400 seconds = 1.5 hours
      // Hourly rate = $60/hr -> Expected billable = 1.5 * 60 = $90.00
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
        startTime: twoHoursAgo,
        pausedAt: null,
        totalPausedSeconds: 1800,
        hourlyRate: 60,
      } as any);

      let savedData: any;
      (vi.mocked(prisma.timeEntry.update) as any).mockImplementation(async (args: any) => {
        savedData = args.data;
        return {
          id: timeEntryId,
          status: args.data.status,
          durationSeconds: args.data.durationSeconds,
          billableAmount: args.data.billableAmount,
        };
      });

      const res = await stopTimeTrackingAction({
        timeEntryId,
        description: "Completed API endpoints and documentation",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(TimeTrackingStatus.STOPPED);
      // Duration should be ~5400 seconds (1.5 hours)
      expect(savedData.durationSeconds).toBeGreaterThanOrEqual(5395);
      expect(savedData.durationSeconds).toBeLessThanOrEqual(5405);
      // Billable amount should be exactly $90.00
      expect(savedData.billableAmount).toBeCloseTo(90.0, 1);
    });

    it("correctly includes pending pause interval when stopped while in PAUSED state", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      // Session started 1 hour ago (3600 seconds)
      // Paused 30 minutes ago (1800 seconds in paused state right now)
      // Net billable time should be ~1800 seconds = 0.5 hours
      // Rate = $100/hr -> Expected billable = $50.00
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.PAUSED,
        startTime: oneHourAgo,
        pausedAt: thirtyMinsAgo,
        totalPausedSeconds: 0,
        hourlyRate: 100,
      } as any);

      let savedData: any;
      (vi.mocked(prisma.timeEntry.update) as any).mockImplementation(async (args: any) => {
        savedData = args.data;
        return {
          id: timeEntryId,
          status: args.data.status,
          durationSeconds: args.data.durationSeconds,
          billableAmount: args.data.billableAmount,
        };
      });

      const res = await stopTimeTrackingAction({ timeEntryId });

      expect(res.success).toBe(true);
      expect(savedData.totalPausedSeconds).toBeGreaterThanOrEqual(1795);
      expect(savedData.durationSeconds).toBeGreaterThanOrEqual(1795);
      expect(savedData.durationSeconds).toBeLessThanOrEqual(1805);
      expect(savedData.billableAmount).toBeCloseTo(50.0, 1);
    });

    it("rejects stopping an already stopped session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.STOPPED,
      } as any);

      const res = await stopTimeTrackingAction({ timeEntryId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("already been stopped");
    });
  });

  describe("recordWorkSnapshotAction - Activity Monitoring & Safety", () => {
    it("rejects recording snapshots when tracking is paused or stopped", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.PAUSED,
      } as any);

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        keystrokes: 45,
        mouseEvents: 80,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Snapshots are only taken during active work");
    });

    it("calculates activity score server-side from input events and clamps to 100%", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
      } as any);

      let savedSnapshot: any;
      (vi.mocked(prisma.timeScreenshot.create) as any).mockImplementation(async (args: any) => {
        savedSnapshot = args.data;
        return {
          id: "snapshot-1",
          timestamp: new Date(),
          activityScore: args.data.activityScore,
        };
      });

      // 100 keystrokes + 100 mouse events = 200 events -> 100% activity
      const res = await recordWorkSnapshotAction({
        timeEntryId,
        keystrokes: 100,
        mouseEvents: 100,
        memo: "Refactoring database queries",
      });

      expect(res.success).toBe(true);
      expect(savedSnapshot.activityScore).toBe(100);
      expect(savedSnapshot.memo).toBe("Refactoring database queries");
    });

    it("calculates partial activity score accurately for low activity intervals", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
      } as any);

      let savedSnapshot: any;
      (vi.mocked(prisma.timeScreenshot.create) as any).mockImplementation(async (args: any) => {
        savedSnapshot = args.data;
        return {
          id: "snapshot-2",
          timestamp: new Date(),
          activityScore: args.data.activityScore,
        };
      });

      // 30 keystrokes + 20 mouse events = 50 events -> 25% activity
      const res = await recordWorkSnapshotAction({
        timeEntryId,
        keystrokes: 30,
        mouseEvents: 20,
      });

      expect(res.success).toBe(true);
      expect(savedSnapshot.activityScore).toBe(25);
    });
  });

  describe("getActiveTimeEntryAction - Active Session Recovery", () => {
    it("recovers currently active recording session for authorized freelancer", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({
        id: timeEntryId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
        startTime: new Date(),
        pausedAt: null,
        totalPausedSeconds: 0,
        hourlyRate: 50,
        description: "In-progress task",
      } as any);

      const res = await getActiveTimeEntryAction(contractId);
      expect(res.activeEntry).not.toBeNull();
      expect(res.activeEntry?.id).toBe(timeEntryId);
      expect(res.activeEntry?.status).toBe(TimeTrackingStatus.RECORDING);
    });

    it("returns null if user is not a freelancer", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "client-id",
        role: "CLIENT",
      } as any);

      const res = await getActiveTimeEntryAction(contractId);
      expect(res.activeEntry).toBeNull();
    });

    it("returns null if no active or paused session exists", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue(null);

      const res = await getActiveTimeEntryAction(contractId);
      expect(res.activeEntry).toBeNull();
    });
  });

  describe("getContractWorkDiaryAction - Authorization & Billing Calculation", () => {
    const clientId = "507f1f77bcf86cd799439025";
    const thirdPartyId = "507f1f77bcf86cd799439026";

    it("rejects unauthenticated caller", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const res = await getContractWorkDiaryAction(contractId);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Authentication required");
    });

    it("rejects unauthorized third parties who are not contract participants", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: thirdPartyId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        title: "E-Commerce Microservices",
        clientId,
        freelancerId,
        hourlyRate: 60,
        type: PaymentType.HOURLY,
      } as any);

      const res = await getContractWorkDiaryAction(contractId);
      expect(res.success).toBe(false);
      expect(res.error).toContain("not a participant");
    });

    it("allows client owner to view work diary with server-calculated daily & weekly totals", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        title: "E-Commerce Microservices",
        clientId,
        freelancerId,
        hourlyRate: 50,
        type: PaymentType.HOURLY,
      } as any);

      const d1 = new Date("2026-10-26T09:00:00Z");
      const d2 = new Date("2026-10-26T11:00:00Z");

      vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
        {
          id: "entry-1",
          contractId,
          freelancerId,
          description: "Feature development",
          status: TimeTrackingStatus.STOPPED,
          startTime: d1,
          endTime: d2,
          durationSeconds: 7200, // 2 hours
          totalPausedSeconds: 0,
          hourlyRate: 50,
          billableAmount: 100.0,
          createdAt: d1,
          screenshots: [
            {
              id: "snap-1",
              timestamp: d1,
              imageUrl: null,
              activityScore: 90,
              keystrokes: 150,
              mouseEvents: 200,
              memo: "Writing unit tests",
            },
          ],
        },
      ] as any);

      const res = await getContractWorkDiaryAction(contractId);
      expect(res.success).toBe(true);
      expect(res.contractTitle).toBe("E-Commerce Microservices");
      expect(res.entries).toHaveLength(1);
      expect(res.dailySummaries).toHaveLength(1);
      expect(res.dailySummaries![0]?.totalHours).toBe(2);
      expect(res.dailySummaries![0]?.totalBillableAmount).toBe(100.0);
      expect(res.weeklySummary?.totalHours).toBe(2);
      expect(res.weeklySummary?.totalBillableAmount).toBe(100.0);
      expect(res.weeklySummary?.sessionCount).toBe(1);
    });
  });

  describe("Phase 7: Timesheet Submission, Approval, Dispute & Billing Breakdown", () => {
    const clientId = "507f1f77bcf86cd799439020";
    const otherClientId = "507f1f77bcf86cd799439099";

    describe("submitTimeEntriesAction", () => {
      it("rejects unauthenticated user", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(null);
        const res = await submitTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("Authentication required");
      });

      it("rejects caller who is not the contract freelancer", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: otherFreelancerId,
          role: "FREELANCER",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          freelancerId,
          type: PaymentType.HOURLY,
        } as any);

        const res = await submitTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("Unauthorized");
      });

      it("rejects submission if session is not STOPPED", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: freelancerId,
          role: "FREELANCER",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          freelancerId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.RECORDING,
            reviewStatus: TimesheetReviewStatus.DRAFT,
          },
        ] as any);

        const res = await submitTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("stopped");
      });

      it("prevents duplicate submissions for already SUBMITTED entries", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: freelancerId,
          role: "FREELANCER",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          freelancerId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.SUBMITTED,
          },
        ] as any);

        const res = await submitTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("already been submitted");
      });

      it("prevents re-submitting already APPROVED entries", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: freelancerId,
          role: "FREELANCER",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          freelancerId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.APPROVED,
          },
        ] as any);

        const res = await submitTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("already approved");
      });

      it("successfully transitions DRAFT stopped entries to SUBMITTED", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: freelancerId,
          role: "FREELANCER",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          freelancerId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.DRAFT,
          },
        ] as any);

        vi.mocked(prisma.timeEntry.updateMany).mockResolvedValue({ count: 1 } as any);

        const res = await submitTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(true);
        expect(res.submittedCount).toBe(1);
        expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              reviewStatus: TimesheetReviewStatus.SUBMITTED,
            }),
          })
        );
      });
    });

    describe("approveTimeEntriesAction", () => {
      it("rejects unauthenticated user", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(null);
        const res = await approveTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("Authentication required");
      });

      it("rejects caller who is not the contract client", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: otherClientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          type: PaymentType.HOURLY,
        } as any);

        const res = await approveTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("Unauthorized");
      });

      it("rejects approval of unsubmitted (DRAFT) sessions", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.DRAFT,
            billableAmount: 50,
          },
        ] as any);

        const res = await approveTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("Only submitted");
      });

      it("prevents duplicate approvals", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.APPROVED,
            billableAmount: 50,
          },
        ] as any);

        const res = await approveTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("already approved");
      });

      it("successfully approves SUBMITTED entries and computes approved amount", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.SUBMITTED,
            billableAmount: 75.5,
          },
        ] as any);

        vi.mocked(prisma.timeEntry.updateMany).mockResolvedValue({ count: 1 } as any);

        const res = await approveTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
        });
        expect(res.success).toBe(true);
        expect(res.approvedCount).toBe(1);
        expect(res.approvedAmount).toBe(75.5);
        expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              reviewStatus: TimesheetReviewStatus.APPROVED,
              reviewedById: clientId,
            }),
          })
        );
      });
    });

    describe("disputeTimeEntriesAction", () => {
      it("rejects dispute with reason shorter than 5 characters", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        const res = await disputeTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
          reason: "no",
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("at least 5 characters");
      });

      it("rejects dispute on already APPROVED sessions", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.APPROVED,
            billableAmount: 50,
          },
        ] as any);

        const res = await disputeTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
          reason: "Timesheet discrepancy on activity",
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("already been approved");
      });

      it("successfully disputes SUBMITTED entries and records dispute reason", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          type: PaymentType.HOURLY,
        } as any);

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          {
            id: timeEntryId,
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.SUBMITTED,
            billableAmount: 60,
          },
        ] as any);

        vi.mocked(prisma.timeEntry.updateMany).mockResolvedValue({ count: 1 } as any);

        const res = await disputeTimeEntriesAction({
          contractId,
          timeEntryIds: [timeEntryId],
          reason: "Excessive idle time logged during this block.",
        });
        expect(res.success).toBe(true);
        expect(res.disputedCount).toBe(1);
        expect(res.disputedAmount).toBe(60);
        expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              reviewStatus: TimesheetReviewStatus.DISPUTED,
              disputeReason: "Excessive idle time logged during this block.",
            }),
          })
        );
      });
    });

    describe("Work Diary Billing Breakdown Calculations", () => {
      it("calculates pending, approved, and disputed totals from stopped sessions", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
          id: clientId,
          role: "CLIENT",
        } as any);

        vi.mocked(prisma.contract.findUnique).mockResolvedValue({
          id: contractId,
          clientId,
          freelancerId,
          title: "Fullstack Architecture",
          hourlyRate: 50,
          type: PaymentType.HOURLY,
        } as any);

        const d1 = new Date("2026-10-25T10:00:00Z");
        const d2 = new Date("2026-10-25T12:00:00Z");

        vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
          // Session 1: Approved, 2 hrs = $100
          {
            id: "entry-1",
            contractId,
            freelancerId,
            description: "Module 1",
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.APPROVED,
            startTime: d1,
            endTime: d2,
            durationSeconds: 7200,
            totalPausedSeconds: 0,
            hourlyRate: 50,
            billableAmount: 100.0,
            createdAt: d1,
            screenshots: [],
          },
          // Session 2: Submitted (Pending), 1 hr = $50
          {
            id: "entry-2",
            contractId,
            freelancerId,
            description: "Module 2",
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.SUBMITTED,
            startTime: d1,
            endTime: d2,
            durationSeconds: 3600,
            totalPausedSeconds: 0,
            hourlyRate: 50,
            billableAmount: 50.0,
            createdAt: d1,
            screenshots: [],
          },
          // Session 3: Disputed, 1 hr = $50
          {
            id: "entry-3",
            contractId,
            freelancerId,
            description: "Module 3",
            status: TimeTrackingStatus.STOPPED,
            reviewStatus: TimesheetReviewStatus.DISPUTED,
            disputeReason: "Activity metrics below agreed threshold",
            startTime: d1,
            endTime: d2,
            durationSeconds: 3600,
            totalPausedSeconds: 0,
            hourlyRate: 50,
            billableAmount: 50.0,
            createdAt: d1,
            screenshots: [],
          },
        ] as any);

        const res = await getContractWorkDiaryAction(contractId);
        expect(res.success).toBe(true);
        expect(res.weeklySummary?.totalHours).toBe(4);
        expect(res.weeklySummary?.totalBillableAmount).toBe(200.0);
        expect(res.weeklySummary?.approvedHours).toBe(2);
        expect(res.weeklySummary?.approvedAmount).toBe(100.0);
        expect(res.weeklySummary?.pendingHours).toBe(1);
        expect(res.weeklySummary?.pendingAmount).toBe(50.0);
        expect(res.weeklySummary?.disputedHours).toBe(1);
        expect(res.weeklySummary?.disputedAmount).toBe(50.0);
      });
    });
  });

  describe("Task 2: Active Time-Tracking Concurrency & Overlap Protection", () => {
    const contractId2 = "507f1f77bcf86cd799439099";

    it("rejects two simultaneous start requests for the same freelancer", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId,
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        // Simulate in-flight transaction
        await new Promise((r) => setTimeout(r, 10));
        return cb({
          user: { update: vi.fn() },
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: "507f1f77bcf86cd799439025",
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        });
      });

      // Launch two requests concurrently
      const req1Promise = startTimeTrackingAction({ contractId });
      const req2Promise = startTimeTrackingAction({ contractId });

      const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

      // Exactly one succeeds and one is rejected
      const successes = [res1, res2].filter((r) => r.success);
      const failures = [res1, res2].filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(failures[0].error).toContain("already in progress");
    });

    it("rejects start request for a different contract when freelancer already has an active session lock", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      (vi.mocked(prisma.contract.findUnique) as any).mockImplementation(async ({ where }: any) => {
        return {
          id: where.id,
          type: PaymentType.HOURLY,
          status: ContractStatus.ACTIVE,
          hourlyRate: 60,
          freelancerId,
        } as any;
      });

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          user: { update: vi.fn() },
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: "507f1f77bcf86cd799439025",
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        });
      });

      // Start on contract 1
      const res1 = await startTimeTrackingAction({ contractId });
      expect(res1.success).toBe(true);

      // Attempt start on contract 2 while lock is held
      const res2 = await startTimeTrackingAction({ contractId: contractId2 });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("already in progress");
    });

    it("allows simultaneous start requests from two different freelancers", async () => {
      (vi.mocked(prisma.contract.findUnique) as any).mockImplementation(async ({ where }: any) => {
        return {
          id: where.id,
          type: PaymentType.HOURLY,
          status: ContractStatus.ACTIVE,
          hourlyRate: 60,
          freelancerId: where.id === contractId ? freelancerId : otherFreelancerId,
        } as any;
      });

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          user: { update: vi.fn() },
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: "507f1f77bcf86cd799439025",
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        });
      });

      // Freelancer 1
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: freelancerId,
        role: "FREELANCER",
      } as any);
      const res1 = await startTimeTrackingAction({ contractId });
      expect(res1.success).toBe(true);

      // Freelancer 2
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: otherFreelancerId,
        role: "FREELANCER",
      } as any);
      const res2 = await startTimeTrackingAction({ contractId: contractId2 });
      expect(res2.success).toBe(true);
    });

    it("allows starting a new session after stopping a previous session", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId,
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          user: { update: vi.fn() },
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: timeEntryId,
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        });
      });

      // 1. Start session
      const startRes = await startTimeTrackingAction({ contractId });
      expect(startRes.success).toBe(true);

      // 2. Stop session
      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
        startTime: new Date(Date.now() - 3600000),
        pausedAt: null,
        totalPausedSeconds: 0,
        hourlyRate: 50,
      } as any);

      vi.mocked(prisma.timeEntry.update).mockResolvedValue({
        id: timeEntryId,
        status: TimeTrackingStatus.STOPPED,
        durationSeconds: 3600,
        billableAmount: 50,
      } as any);

      const stopRes = await stopTimeTrackingAction({ timeEntryId });
      expect(stopRes.success).toBe(true);

      // 3. Start a new session now succeeds
      const startRes2 = await startTimeTrackingAction({ contractId });
      expect(startRes2.success).toBe(true);
    });

    it("prevents starting a new session while an existing session is PAUSED", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId,
      } as any);

      // Clear in-memory lock to test DB active status check
      resetActiveTimerLocks();

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          user: { update: vi.fn() },
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue({
              id: "507f1f77bcf86cd799439025",
              contractId,
              status: TimeTrackingStatus.PAUSED,
            }),
          },
        });
      });

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("An active time session is already in progress");
    });

    it("safely releases the lock when session creation encounters an unexpected database error", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId,
      } as any);

      // Fail inside transaction
      vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("Unexpected DB crash"));

      const failedRes = await startTimeTrackingAction({ contractId });
      expect(failedRes.success).toBe(false);
      expect(failedRes.error).toContain("Failed to start time tracking session");

      // Lock should have been released so freelancer is not permanently stuck
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
        return cb({
          user: { update: vi.fn() },
          timeEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: timeEntryId,
              status: TimeTrackingStatus.RECORDING,
            }),
          },
        });
      });

      const recoveredRes = await startTimeTrackingAction({ contractId });
      expect(recoveredRes.success).toBe(true);
      expect(recoveredRes.timeEntryId).toBe(timeEntryId);
    });

    it("handles MongoDB P2034 WriteConflict gracefully", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId,
      } as any);

      const writeConflictError = new Error("Write conflict in MongoDB transaction");
      (writeConflictError as any).code = "P2034";

      vi.mocked(prisma.$transaction).mockRejectedValueOnce(writeConflictError);

      const res = await startTimeTrackingAction({ contractId });
      expect(res.success).toBe(false);
      expect(res.error).toContain("already in progress");
    });
  });
});

