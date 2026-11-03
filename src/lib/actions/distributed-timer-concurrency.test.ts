/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/distributed-timer-concurrency.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startTimeTrackingAction,
  pauseTimeTrackingAction,
  resumeTimeTrackingAction,
  stopTimeTrackingAction,
} from "./time-tracker";
import {
  acquireActiveTimerLock,
  releaseActiveTimerLock,
  resetActiveTimerLocks,
  acquireDatabaseTimerReservation,
} from "@/lib/timer-mutex";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  ContractStatus,
  PaymentType,
  TimeTrackingStatus,
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
    activeTimerReservation: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
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
        return { success: false, error: "Authentication required: You must be signed in to perform this action.", code: "UNAUTHENTICATED" };
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

describe("Distributed Timer Concurrency & Database Reservation Tests (Task 3 Remediation)", () => {
  const freelancerId = "507f1f77bcf86cd799439001";
  const otherFreelancerId = "507f1f77bcf86cd799439002";
  const contractId1 = "507f1f77bcf86cd799439011";
  const contractId2 = "507f1f77bcf86cd799439012";
  const timeEntryId1 = "507f1f77bcf86cd799439021";

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveTimerLocks();
  });

  it("1. prevents two simultaneous requests from the same freelancer within the same process", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: freelancerId,
      role: "FREELANCER",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId1,
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
            id: timeEntryId1,
            status: TimeTrackingStatus.RECORDING,
          }),
        },
        activeTimerReservation: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "res_1" }),
          updateMany: vi.fn(),
        },
      });
    });

    const [res1, res2] = await Promise.all([
      startTimeTrackingAction({ contractId: contractId1 }),
      startTimeTrackingAction({ contractId: contractId1 }),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].error).toContain("already in progress");
  });

  it("2. simulates requests from separate Node.js processes using database-level unique constraint", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: freelancerId,
      role: "FREELANCER",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId1,
      type: PaymentType.HOURLY,
      status: ContractStatus.ACTIVE,
      hourlyRate: 50,
      freelancerId,
    } as any);

    // Simulate Node Process B where in-memory lock is not present,
    // but the database transaction attempts to create a duplicate reservation
    resetActiveTimerLocks();

    const uniqueConstraintError = new Error(
      "Unique constraint failed on the constraint: active_timer_reservations_freelancerId_key"
    );
    (uniqueConstraintError as any).code = "P2002";

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(uniqueConstraintError);

    const res = await startTimeTrackingAction({ contractId: contractId1 });
    expect(res.success).toBe(false);
    expect(res.error).toContain("already in progress");
  });

  it("3. allows two different freelancers to start timers simultaneously", async () => {
    (vi.mocked(prisma.contract.findUnique) as any).mockImplementation(async ({ where }: any) => {
      return {
        id: where.id,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId: where.id === contractId1 ? freelancerId : otherFreelancerId,
      } as any;
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: { update: vi.fn() },
        timeEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: timeEntryId1,
            status: TimeTrackingStatus.RECORDING,
          }),
        },
        activeTimerReservation: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "res_x" }),
          updateMany: vi.fn(),
        },
      });
    });

    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: freelancerId,
      role: "FREELANCER",
    } as any);
    const start1 = await startTimeTrackingAction({ contractId: contractId1 });

    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: otherFreelancerId,
      role: "FREELANCER",
    } as any);
    const start2 = await startTimeTrackingAction({ contractId: contractId2 });

    expect(start1.success).toBe(true);
    expect(start2.success).toBe(true);
  });

  it("4. rejects starting a second session on a different contract while one is active", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: freelancerId,
      role: "FREELANCER",
    } as any);

    (vi.mocked(prisma.contract.findUnique) as any).mockImplementation(async ({ where }: any) => {
      return {
        id: where.id,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        hourlyRate: 50,
        freelancerId,
      } as any;
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: { update: vi.fn() },
        timeEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: timeEntryId1,
            status: TimeTrackingStatus.RECORDING,
          }),
        },
        activeTimerReservation: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "res_1" }),
          updateMany: vi.fn(),
        },
      });
    });

    const res1 = await startTimeTrackingAction({ contractId: contractId1 });
    expect(res1.success).toBe(true);

    const res2 = await startTimeTrackingAction({ contractId: contractId2 });
    expect(res2.success).toBe(false);
    expect(res2.error).toContain("already in progress");
  });

  it("5. preserves reservation during pause and resume lifecycle", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: freelancerId,
      role: "FREELANCER",
    } as any);

    vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
      id: timeEntryId1,
      freelancerId,
      contractId: contractId1,
      status: TimeTrackingStatus.RECORDING,
      startTime: new Date(Date.now() - 3600000),
      totalPausedSeconds: 0,
      hourlyRate: 50,
    } as any);

    vi.mocked(prisma.timeEntry.update).mockResolvedValue({
      id: timeEntryId1,
      status: TimeTrackingStatus.PAUSED,
    } as any);

    // Pause
    const pauseRes = await pauseTimeTrackingAction({ timeEntryId: timeEntryId1 });
    expect(pauseRes.success).toBe(true);
    expect(pauseRes.status).toBe(TimeTrackingStatus.PAUSED);

    // Resume
    vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
      id: timeEntryId1,
      freelancerId,
      contractId: contractId1,
      status: TimeTrackingStatus.PAUSED,
      pausedAt: new Date(Date.now() - 60000),
      totalPausedSeconds: 0,
      hourlyRate: 50,
    } as any);

    vi.mocked(prisma.timeEntry.update).mockResolvedValue({
      id: timeEntryId1,
      status: TimeTrackingStatus.RECORDING,
    } as any);

    const resumeRes = await resumeTimeTrackingAction({ timeEntryId: timeEntryId1 });
    expect(resumeRes.success).toBe(true);
    expect(resumeRes.status).toBe(TimeTrackingStatus.RECORDING);
  });

  it("6. releases reservation on stop allowing a new session to be started", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: freelancerId,
      role: "FREELANCER",
    } as any);

    vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
      id: timeEntryId1,
      freelancerId,
      contractId: contractId1,
      status: TimeTrackingStatus.RECORDING,
      startTime: new Date(Date.now() - 3600000),
      pausedAt: null,
      totalPausedSeconds: 0,
      hourlyRate: 50,
    } as any);

    vi.mocked(prisma.timeEntry.update).mockResolvedValue({
      id: timeEntryId1,
      status: TimeTrackingStatus.STOPPED,
      durationSeconds: 3600,
      billableAmount: 50,
    } as any);

    const stopRes = await stopTimeTrackingAction({ timeEntryId: timeEntryId1 });
    expect(stopRes.success).toBe(true);

    // Now starting a new session succeeds
    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId1,
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
            id: "507f1f77bcf86cd799439099",
            status: TimeTrackingStatus.RECORDING,
          }),
        },
        activeTimerReservation: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "res_new" }),
          updateMany: vi.fn(),
        },
      });
    });

    const restartRes = await startTimeTrackingAction({ contractId: contractId1 });
    expect(restartRes.success).toBe(true);
  });

  it("7. recovers safely from an orphaned reservation when no active TimeEntry exists", async () => {
    // Transaction client where an orphaned reservation is present in the database,
    // but no active TimeEntry exists (e.g. following a server crash)
    const mockTx = {
      timeEntry: {
        findFirst: vi.fn().mockResolvedValue(null), // No active time entry!
      },
      activeTimerReservation: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }), // Orphan cleaned up!
        create: vi.fn().mockResolvedValue({ id: "recovered_res_id" }),
      },
    };

    const res = await acquireDatabaseTimerReservation(mockTx, freelancerId, contractId1);
    expect(res.success).toBe(true);
    expect(res.isOrphanRecovered).toBe(true);
    expect(res.reservationId).toBe("recovered_res_id");
  });

  it("8. ensures protection persists indefinitely past 15 seconds without premature expiry", async () => {
    // Acquire reservation
    expect(acquireActiveTimerLock(freelancerId, contractId1)).toBe(true);

    // Advance time by 60 seconds (well past the old 15s TTL)
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);

    // In-memory lock MUST STILL BE HELD
    expect(acquireActiveTimerLock(freelancerId, contractId1)).toBe(false);

    // Advance time by 1 hour
    vi.advanceTimersByTime(3_600_000);
    expect(acquireActiveTimerLock(freelancerId, contractId1)).toBe(false);

    vi.useRealTimers();
    releaseActiveTimerLock(freelancerId);
  });

  it("9. rolls back reservation and releases lock when transaction fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: freelancerId,
      role: "FREELANCER",
    } as any);

    vi.mocked(prisma.contract.findUnique).mockResolvedValue({
      id: contractId1,
      type: PaymentType.HOURLY,
      status: ContractStatus.ACTIVE,
      hourlyRate: 50,
      freelancerId,
    } as any);

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("Database connection severed during timeEntry.create")
    );

    const failRes = await startTimeTrackingAction({ contractId: contractId1 });
    expect(failRes.success).toBe(false);
    expect(failRes.error).toContain("Failed to start time tracking session");

    // The lock was released on failure so the freelancer is not permanently stuck
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      return cb({
        user: { update: vi.fn() },
        timeEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: timeEntryId1,
            status: TimeTrackingStatus.RECORDING,
          }),
        },
        activeTimerReservation: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "res_ok" }),
          updateMany: vi.fn(),
        },
      });
    });

    const retryRes = await startTimeTrackingAction({ contractId: contractId1 });
    expect(retryRes.success).toBe(true);
  });
});
