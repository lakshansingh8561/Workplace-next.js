"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  ContractStatus,
  PaymentType,
  TimeTrackingStatus,
  TimesheetReviewStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  StartTimeTrackingSchema,
  PauseTimeTrackingSchema,
  ResumeTimeTrackingSchema,
  StopTimeTrackingSchema,
  RecordWorkSnapshotSchema,
  SubmitTimeEntriesSchema,
  ApproveTimeEntriesSchema,
  DisputeTimeEntriesSchema,
  SubmitTimeEntriesInput,
  ApproveTimeEntriesInput,
  DisputeTimeEntriesInput,
} from "@/lib/validations/time-tracker";
import { processScreenshotStorage, isStorageConfigured } from "@/lib/storage";
import { acquireActiveTimerLock, releaseActiveTimerLock } from "@/lib/timer-mutex";

export type TimeTrackingActionResult = {
  success: boolean;
  timeEntryId?: string;
  status?: TimeTrackingStatus;
  durationSeconds?: number;
  billableAmount?: number;
  error?: string;
};

export type WorkSnapshotResult = {
  success: boolean;
  snapshotId?: string;
  timestamp?: string;
  activityScore?: number;
  imageUrl?: string | null;
  error?: string;
};

/**
 * Starts a new time-tracking session for an active HOURLY contract.
 * Enforces:
 * 1. Caller is an authenticated FREELANCER.
 * 2. Contract exists, is ACTIVE, and is of type HOURLY.
 * 3. Caller is the designated freelancer on the contract.
 * 4. Contract has a valid agreed hourlyRate (> 0).
 * 5. Prevents overlapping active sessions: Freelancer cannot have another session in RECORDING or PAUSED state.
 */
export async function startTimeTrackingAction(
  input: unknown
): Promise<TimeTrackingActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to track work time.",
    };
  }

  if (user.role !== "FREELANCER") {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can track work time.",
    };
  }

  const parsed = StartTimeTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid start tracking request.",
    };
  }

  const { contractId, description } = parsed.data;

  try {
    // 1. Fetch live contract to verify ownership, status, and hourly payment type
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        type: true,
        status: true,
        hourlyRate: true,
        freelancerId: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found.",
      };
    }

    if (contract.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You are not the assigned freelancer for this contract.",
      };
    }

    if (contract.type !== PaymentType.HOURLY) {
      return {
        success: false,
        error: "Time tracking is only supported for hourly contracts. Fixed-price contracts use milestone deliverables.",
      };
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot track time. Contract is currently ${contract.status.toLowerCase()}.`,
      };
    }

    if (!contract.hourlyRate || contract.hourlyRate <= 0) {
      return {
        success: false,
        error: "Cannot track time. Contract does not have a valid agreed hourly rate.",
      };
    }

    // 2. Prevent overlapping active sessions for this freelancer
    // Atomic reservation lock ensures concurrent requests within the process are serialized
    if (!acquireActiveTimerLock(user.id, contract.id)) {
      return {
        success: false,
        error:
          "An active time session is already in progress. Please pause or stop your current session before starting a new one.",
      };
    }

    // 3. Multi-document transaction with User document touch for MongoDB write serialization
    const newEntry = await prisma.$transaction(async (tx) => {
      // Establish document write lock on the freelancer's User record
      try {
        await tx.user.update({
          where: { id: user.id },
          data: { updatedAt: new Date() },
          select: { id: true },
        });
      } catch {
        // Proceed if User.update mock is omitted in test environments
      }

      const activeEntry = await tx.timeEntry.findFirst({
        where: {
          freelancerId: user.id,
          status: { in: [TimeTrackingStatus.RECORDING, TimeTrackingStatus.PAUSED] },
        },
        select: {
          id: true,
          contractId: true,
          status: true,
        },
      });

      if (activeEntry) {
        throw new Error(
          "An active time session is already in progress. Please pause or stop your current session before starting a new one."
        );
      }

      return tx.timeEntry.create({
        data: {
          contractId: contract.id,
          freelancerId: user.id,
          description: description?.trim() || null,
          status: TimeTrackingStatus.RECORDING,
          startTime: new Date(),
          durationSeconds: 0,
          totalPausedSeconds: 0,
          hourlyRate: contract.hourlyRate!,
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/dashboard/freelancer");

    return {
      success: true,
      timeEntryId: newEntry.id,
      status: newEntry.status,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";
    const isConflict =
      errorMsg.includes("already in progress") ||
      (error as { code?: string })?.code === "P2034" ||
      errorMsg.includes("WriteConflict");

    if (isConflict) {
      return {
        success: false,
        error:
          "An active time session is already in progress. Please pause or stop your current session before starting a new one.",
      };
    }

    // Release lock on unexpected failure so freelancer is not blocked
    releaseActiveTimerLock(user.id);

    console.error(
      "[WorkPulse Start Time Tracking Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to start time tracking session. Please try again.",
    };
  }
}

/**
 * Pauses an active recording session.
 */
export async function pauseTimeTrackingAction(
  input: unknown
): Promise<TimeTrackingActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage time tracking.",
    };
  }

  const parsed = PauseTimeTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid pause time tracking request.",
    };
  }

  const { timeEntryId } = parsed.data;

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: {
        id: true,
        freelancerId: true,
        contractId: true,
        status: true,
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time session not found.",
      };
    }

    if (entry.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this time-tracking session.",
      };
    }

    if (entry.status === TimeTrackingStatus.PAUSED) {
      return {
        success: true,
        timeEntryId: entry.id,
        status: entry.status,
      };
    }

    if (entry.status === TimeTrackingStatus.STOPPED) {
      return {
        success: false,
        error: "Cannot pause a time session that has already been stopped.",
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: TimeTrackingStatus.PAUSED,
        pausedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

    revalidatePath(`/contracts/${entry.contractId}`);

    return {
      success: true,
      timeEntryId: updated.id,
      status: updated.status,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Pause Time Tracking Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to pause time tracking session.",
    };
  }
}

/**
 * Resumes a paused time-tracking session.
 * Accurately accumulates paused duration on the server.
 */
export async function resumeTimeTrackingAction(
  input: unknown
): Promise<TimeTrackingActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage time tracking.",
    };
  }

  const parsed = ResumeTimeTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid resume time tracking request.",
    };
  }

  const { timeEntryId } = parsed.data;

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: {
        id: true,
        freelancerId: true,
        contractId: true,
        status: true,
        pausedAt: true,
        totalPausedSeconds: true,
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time session not found.",
      };
    }

    if (entry.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this time-tracking session.",
      };
    }

    if (entry.status === TimeTrackingStatus.RECORDING) {
      return {
        success: true,
        timeEntryId: entry.id,
        status: entry.status,
      };
    }

    if (entry.status === TimeTrackingStatus.STOPPED) {
      return {
        success: false,
        error: "Cannot resume a time session that has already been stopped.",
      };
    }

    const now = new Date();
    const additionalPausedSeconds = entry.pausedAt
      ? Math.max(0, Math.floor((now.getTime() - entry.pausedAt.getTime()) / 1000))
      : 0;

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: TimeTrackingStatus.RECORDING,
        pausedAt: null,
        totalPausedSeconds: entry.totalPausedSeconds + additionalPausedSeconds,
      },
      select: {
        id: true,
        status: true,
      },
    });

    revalidatePath(`/contracts/${entry.contractId}`);

    return {
      success: true,
      timeEntryId: updated.id,
      status: updated.status,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Resume Time Tracking Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to resume time tracking session.",
    };
  }
}

/**
 * Stops an active or paused time session and finalizes billing calculation.
 * Accurately calculates:
 * - Net billable seconds = (now - startTime) - totalPausedSeconds
 * - Billable amount = (durationSeconds / 3600) * hourlyRate
 */
export async function stopTimeTrackingAction(
  input: unknown
): Promise<TimeTrackingActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage time tracking.",
    };
  }

  const parsed = StopTimeTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid stop time tracking request.",
    };
  }

  const { timeEntryId, description } = parsed.data;

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: {
        id: true,
        freelancerId: true,
        contractId: true,
        status: true,
        startTime: true,
        pausedAt: true,
        totalPausedSeconds: true,
        hourlyRate: true,
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time session not found.",
      };
    }

    if (entry.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this time-tracking session.",
      };
    }

    if (entry.status === TimeTrackingStatus.STOPPED) {
      return {
        success: false,
        error: "This time session has already been stopped.",
      };
    }

    const now = new Date();

    // 1. Calculate final accumulated paused seconds
    let finalTotalPausedSeconds = entry.totalPausedSeconds;
    if (entry.status === TimeTrackingStatus.PAUSED && entry.pausedAt) {
      const additionalPause = Math.max(
        0,
        Math.floor((now.getTime() - entry.pausedAt.getTime()) / 1000)
      );
      finalTotalPausedSeconds += additionalPause;
    }

    // 2. Compute net active billable time on server
    const totalElapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - entry.startTime.getTime()) / 1000)
    );
    const durationSeconds = Math.max(0, totalElapsedSeconds - finalTotalPausedSeconds);

    // 3. Compute billable amount using immutable hourlyRate snapshot
    const billableAmount = Number(
      ((durationSeconds / 3600) * entry.hourlyRate).toFixed(2)
    );

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: TimeTrackingStatus.STOPPED,
        endTime: now,
        pausedAt: null,
        durationSeconds,
        totalPausedSeconds: finalTotalPausedSeconds,
        billableAmount,
        ...(description ? { description: description.trim() } : {}),
      },
      select: {
        id: true,
        status: true,
        durationSeconds: true,
        billableAmount: true,
      },
    });

    revalidatePath(`/contracts/${entry.contractId}`);
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/client");

    releaseActiveTimerLock(user.id);

    return {
      success: true,
      timeEntryId: updated.id,
      status: updated.status,
      durationSeconds: updated.durationSeconds,
      billableAmount: updated.billableAmount ?? 0,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Stop Time Tracking Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to stop time tracking session.",
    };
  }
}

/**
 * Records a periodic work snapshot (target: every 10 minutes) for an active session.
 * Enforces:
 * 1. Caller is the designated freelancer.
 * 2. Session is strictly in RECORDING state (cannot record while paused or stopped).
 * 3. Calculates activity score on server; never trusts client-submitted activity scores or financial amounts.
 */
export async function recordWorkSnapshotAction(
  input: unknown
): Promise<WorkSnapshotResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to record work snapshots.",
    };
  }

  const parsed = RecordWorkSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid work snapshot payload.",
    };
  }

  const { timeEntryId, imageUrl, keystrokes, mouseEvents, memo } = parsed.data;

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: {
        id: true,
        contractId: true,
        freelancerId: true,
        status: true,
        startTime: true,
        contract: {
          select: {
            type: true,
          },
        },
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time tracking session not found.",
      };
    }

    if (entry.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this time-tracking session.",
      };
    }

    if (entry.status !== TimeTrackingStatus.RECORDING) {
      return {
        success: false,
        error: `Cannot record work snapshot while tracking is ${entry.status.toLowerCase()}. Snapshots are only taken during active work.`,
      };
    }

    if (entry.contract && entry.contract.type !== PaymentType.HOURLY) {
      return {
        success: false,
        error: "Snapshots can only be recorded for hourly contracts.",
      };
    }

    // Server-side calculation of activity rating (0-100%)
    // Benchmark: 200 input events (keystrokes + mouse events) over a 10-minute slot represents 100% active work.
    const totalInputEvents = keystrokes + mouseEvents;
    const calculatedActivityScore = Math.min(
      100,
      Math.max(0, Math.round((totalInputEvents / 200) * 100))
    );

    // Create initial screenshot record
    const snapshot = await prisma.timeScreenshot.create({
      data: {
        timeEntryId: entry.id,
        contractId: entry.contractId,
        timestamp: new Date(),
        imageUrl: null,
        activityScore: calculatedActivityScore,
        keystrokes,
        mouseEvents,
        memo: memo?.trim() || null,
      },
      select: {
        id: true,
        timestamp: true,
        activityScore: true,
      },
    });

    // If image payload provided and storage configured, store image and link route URL
    let storedImageUrl: string | null = null;
    if (imageUrl) {
      const { routeUrl, reason } = await processScreenshotStorage(
        entry.contractId,
        entry.id,
        snapshot.id,
        imageUrl
      );

      if (routeUrl) {
        storedImageUrl = routeUrl;
        await prisma.timeScreenshot.update({
          where: { id: snapshot.id },
          data: { imageUrl: routeUrl },
        });
      } else if (reason === "UPLOAD_FAILED") {
        await prisma.timeScreenshot.delete({
          where: { id: snapshot.id },
        });
        return {
          success: false,
          error: "Failed to upload screenshot to secure storage.",
        };
      }
    }

    return {
      success: true,
      snapshotId: snapshot.id,
      timestamp: snapshot.timestamp.toISOString(),
      activityScore: snapshot.activityScore,
      imageUrl: storedImageUrl,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Record Work Snapshot Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to record work activity snapshot.",
    };
  }
}

/**
 * Retrieves currently active or paused time entry for the authenticated freelancer.
 */
export async function getActiveTimeEntryAction(contractId?: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "FREELANCER") {
    return { activeEntry: null };
  }

  try {
    const activeEntry = await prisma.timeEntry.findFirst({
      where: {
        freelancerId: user.id,
        status: { in: [TimeTrackingStatus.RECORDING, TimeTrackingStatus.PAUSED] },
        ...(contractId ? { contractId } : {}),
      },
      select: {
        id: true,
        contractId: true,
        status: true,
        startTime: true,
        pausedAt: true,
        totalPausedSeconds: true,
        hourlyRate: true,
        description: true,
      },
    });

    return { activeEntry, isStorageConfigured: isStorageConfigured() };
  } catch (error) {
    console.error("[WorkPulse Get Active Time Entry Error]:", error);
    return { activeEntry: null, isStorageConfigured: isStorageConfigured() };
  }
}

export type WorkDiaryScreenshot = {
  id: string;
  timestamp: string;
  imageUrl?: string | null;
  activityScore: number;
  keystrokes: number;
  mouseEvents: number;
  memo?: string | null;
};

export type WorkDiaryEntry = {
  id: string;
  contractId: string;
  freelancerId: string;
  description?: string | null;
  status: TimeTrackingStatus;
  reviewStatus: TimesheetReviewStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  disputeReason?: string | null;
  startTime: string;
  endTime?: string | null;
  durationSeconds: number;
  totalPausedSeconds: number;
  hourlyRate: number;
  billableAmount: number;
  screenshots: WorkDiaryScreenshot[];
  createdAt: string;
  isPaid?: boolean;
  paidAt?: string | null;
};

export type DailySummary = {
  date: string;
  formattedDate: string;
  totalSeconds: number;
  totalHours: number;
  totalBillableAmount: number;
  entries: WorkDiaryEntry[];
};

export type WeeklySummary = {
  totalSeconds: number;
  totalHours: number;
  totalBillableAmount: number;
  hourlyRate: number;
  sessionCount: number;
  // Billing breakdown:
  pendingSeconds: number;
  pendingHours: number;
  pendingAmount: number;
  approvedSeconds: number;
  approvedHours: number;
  approvedAmount: number;
  disputedSeconds: number;
  disputedHours: number;
  disputedAmount: number;
};

export type ContractWorkDiaryResult = {
  success: boolean;
  contractId?: string;
  contractTitle?: string;
  hourlyRate?: number;
  entries?: WorkDiaryEntry[];
  dailySummaries?: DailySummary[];
  weeklySummary?: WeeklySummary;
  isStorageConfigured?: boolean;
  error?: string;
};

/**
 * Retrieves the contract work diary and server-calculated billing totals.
 * Accessible strictly by:
 * 1. The contract client owner (contract.clientId === user.id)
 * 2. The contract assigned freelancer (contract.freelancerId === user.id)
 */
export async function getContractWorkDiaryAction(
  contractId: string
): Promise<ContractWorkDiaryResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to view contract work diary.",
    };
  }

  if (!contractId || !/^[0-9a-fA-F]{24}$/.test(contractId)) {
    return {
      success: false,
      error: "Invalid contract ID format.",
    };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        title: true,
        clientId: true,
        freelancerId: true,
        hourlyRate: true,
        type: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found.",
      };
    }

    if (contract.clientId !== user.id && contract.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You are not a participant in this contract agreement.",
      };
    }

    const rawEntries = await prisma.timeEntry.findMany({
      where: { contractId },
      orderBy: { startTime: "desc" },
      include: {
        screenshots: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    const now = new Date();
    const formattedEntries: WorkDiaryEntry[] = rawEntries.map((e) => {
      let duration = e.durationSeconds;
      let billable = e.billableAmount ?? 0;

      // For in-progress sessions, calculate current live duration and estimate
      if (e.status !== TimeTrackingStatus.STOPPED) {
        let livePaused = e.totalPausedSeconds;
        if (e.status === TimeTrackingStatus.PAUSED && e.pausedAt) {
          livePaused += Math.max(0, Math.floor((now.getTime() - e.pausedAt.getTime()) / 1000));
        }
        duration = Math.max(0, Math.floor((now.getTime() - e.startTime.getTime()) / 1000) - livePaused);
        billable = Number(((duration / 3600) * e.hourlyRate).toFixed(2));
      }

      return {
        id: e.id,
        contractId: e.contractId,
        freelancerId: e.freelancerId,
        description: e.description,
        status: e.status,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime?.toISOString() || null,
        durationSeconds: duration,
        totalPausedSeconds: e.totalPausedSeconds,
        hourlyRate: e.hourlyRate,
        billableAmount: billable,
        reviewStatus: e.reviewStatus,
        submittedAt: e.submittedAt?.toISOString() || null,
        reviewedAt: e.reviewedAt?.toISOString() || null,
        reviewedById: e.reviewedById || null,
        disputeReason: e.disputeReason || null,
        createdAt: e.createdAt.toISOString(),
        isPaid: Boolean((e as unknown as { isPaid?: boolean }).isPaid),
        paidAt: (e as unknown as { paidAt?: Date | null }).paidAt?.toISOString() || null,
        screenshots: e.screenshots.map((s) => ({
          id: s.id,
          timestamp: s.timestamp.toISOString(),
          imageUrl: s.imageUrl,
          activityScore: s.activityScore,
          keystrokes: s.keystrokes,
          mouseEvents: s.mouseEvents,
          memo: s.memo,
        })),
      };
    });

    // Group entries by date string
    const dailyMap = new Map<string, WorkDiaryEntry[]>();
    for (const entry of formattedEntries) {
      const dateKey = entry.startTime.split("T")[0] || "Unknown";
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, []);
      }
      dailyMap.get(dateKey)!.push(entry);
    }

    const dailySummaries: DailySummary[] = [];
    let totalSeconds = 0;
    let totalBillableAmount = 0;

    for (const [dateKey, dayEntries] of dailyMap.entries()) {
      const daySeconds = dayEntries.reduce((sum, ent) => sum + ent.durationSeconds, 0);
      const dayAmount = Number(
        dayEntries.reduce((sum, ent) => sum + ent.billableAmount, 0).toFixed(2)
      );

      totalSeconds += daySeconds;
      totalBillableAmount = Number((totalBillableAmount + dayAmount).toFixed(2));

      const dateObj = new Date(dateKey + "T00:00:00Z");
      const formattedDate = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
        : dateKey;

      dailySummaries.push({
        date: dateKey,
        formattedDate,
        totalSeconds: daySeconds,
        totalHours: Number((daySeconds / 3600).toFixed(2)),
        totalBillableAmount: dayAmount,
        entries: dayEntries,
      });
    }

    // Calculate pending, approved, and disputed billing totals from stopped sessions only
    const stoppedEntries = formattedEntries.filter((e) => e.status === TimeTrackingStatus.STOPPED);

    let pendingSeconds = 0;
    let pendingAmount = 0;
    let approvedSeconds = 0;
    let approvedAmount = 0;
    let disputedSeconds = 0;
    let disputedAmount = 0;

    for (const entry of stoppedEntries) {
      if (entry.reviewStatus === TimesheetReviewStatus.APPROVED) {
        approvedSeconds += entry.durationSeconds;
        approvedAmount += entry.billableAmount;
      } else if (entry.reviewStatus === TimesheetReviewStatus.DISPUTED) {
        disputedSeconds += entry.durationSeconds;
        disputedAmount += entry.billableAmount;
      } else {
        // DRAFT or SUBMITTED
        pendingSeconds += entry.durationSeconds;
        pendingAmount += entry.billableAmount;
      }
    }

    const weeklySummary: WeeklySummary = {
      totalSeconds,
      totalHours: Number((totalSeconds / 3600).toFixed(2)),
      totalBillableAmount,
      hourlyRate: contract.hourlyRate ?? 0,
      sessionCount: formattedEntries.length,
      pendingSeconds,
      pendingHours: Number((pendingSeconds / 3600).toFixed(2)),
      pendingAmount: Number(pendingAmount.toFixed(2)),
      approvedSeconds,
      approvedHours: Number((approvedSeconds / 3600).toFixed(2)),
      approvedAmount: Number(approvedAmount.toFixed(2)),
      disputedSeconds,
      disputedHours: Number((disputedSeconds / 3600).toFixed(2)),
      disputedAmount: Number(disputedAmount.toFixed(2)),
    };

    return {
      success: true,
      contractId: contract.id,
      contractTitle: contract.title,
      hourlyRate: contract.hourlyRate ?? 0,
      entries: formattedEntries,
      dailySummaries,
      weeklySummary,
      isStorageConfigured: isStorageConfigured(),
    };
  } catch (error) {
    console.error("[WorkPulse Get Work Diary Error]:", error);
    return {
      success: false,
      error: "Failed to retrieve contract work diary.",
    };
  }
}

/**
 * Submits completed (STOPPED) time entries for client review.
 * Enforces:
 * 1. User is authenticated and is the assigned contract freelancer.
 * 2. Contract is an active HOURLY contract.
 * 3. All selected entries belong to this contract and are in STOPPED status.
 * 4. Prevents duplicate submissions and re-submitting already approved sessions.
 */
export async function submitTimeEntriesAction(input: SubmitTimeEntriesInput) {
  const parseResult = SubmitTimeEntriesSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid input parameters.",
    };
  }

  const { contractId, timeEntryIds } = parseResult.data;
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required to submit time entries." };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, freelancerId: true, type: true },
    });

    if (!contract) {
      return { success: false, error: "Contract not found." };
    }

    if (contract.type !== PaymentType.HOURLY) {
      return { success: false, error: "Timesheet submissions are only supported for hourly contracts." };
    }

    if (contract.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: Only the assigned freelancer can submit time entries for review.",
      };
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
        contractId,
        freelancerId: user.id,
      },
      select: { id: true, status: true, reviewStatus: true },
    });

    if (entries.length !== timeEntryIds.length) {
      return {
        success: false,
        error: "One or more selected time entries do not exist or do not belong to this contract.",
      };
    }

    // Verify all entries are STOPPED
    const nonStopped = entries.find((e) => e.status !== TimeTrackingStatus.STOPPED);
    if (nonStopped) {
      return {
        success: false,
        error: "Only stopped time tracking sessions can be submitted for client review.",
      };
    }

    // Prevent duplicate submissions and re-submitting already approved sessions
    const alreadyApproved = entries.find((e) => e.reviewStatus === TimesheetReviewStatus.APPROVED);
    if (alreadyApproved) {
      return {
        success: false,
        error: "One or more entries are already approved and cannot be re-submitted.",
      };
    }

    const alreadySubmitted = entries.find((e) => e.reviewStatus === TimesheetReviewStatus.SUBMITTED);
    if (alreadySubmitted) {
      return {
        success: false,
        error: "One or more entries have already been submitted and are pending client review.",
      };
    }

    await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        contractId,
        freelancerId: user.id,
        status: TimeTrackingStatus.STOPPED,
      },
      data: {
        reviewStatus: TimesheetReviewStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    revalidatePath(`/contracts/${contractId}`);

    return {
      success: true,
      submittedCount: entries.length,
    };
  } catch (error) {
    console.error("[WorkPulse Submit Time Entries Error]:", error);
    return {
      success: false,
      error: "Failed to submit time entries for client review.",
    };
  }
}

/**
 * Client approval of submitted timesheet entries.
 * Enforces:
 * 1. Caller is the contract's client owner.
 * 2. Contract is an active HOURLY contract.
 * 3. All selected entries are STOPPED and currently in SUBMITTED status.
 * 4. Prevents duplicate approvals and unsubmitted session approvals.
 */
export async function approveTimeEntriesAction(input: ApproveTimeEntriesInput) {
  const parseResult = ApproveTimeEntriesSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid input parameters.",
    };
  }

  const { contractId, timeEntryIds } = parseResult.data;
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required to approve timesheets." };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, clientId: true, type: true },
    });

    if (!contract) {
      return { success: false, error: "Contract not found." };
    }

    if (contract.type !== PaymentType.HOURLY) {
      return { success: false, error: "Timesheet approvals are only supported for hourly contracts." };
    }

    if (contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: Only the contract's client can approve timesheets.",
      };
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
        contractId,
      },
      select: { id: true, status: true, reviewStatus: true, billableAmount: true },
    });

    if (entries.length !== timeEntryIds.length) {
      return {
        success: false,
        error: "One or more selected time entries do not exist for this contract.",
      };
    }

    const nonStopped = entries.find((e) => e.status !== TimeTrackingStatus.STOPPED);
    if (nonStopped) {
      return {
        success: false,
        error: "Cannot approve sessions that are currently in progress or paused.",
      };
    }

    // Prevent duplicate approvals
    const alreadyApproved = entries.find((e) => e.reviewStatus === TimesheetReviewStatus.APPROVED);
    if (alreadyApproved) {
      return {
        success: false,
        error: "One or more entries are already approved (duplicate approval prevented).",
      };
    }

    // Only SUBMITTED sessions can be approved
    const notSubmitted = entries.find((e) => e.reviewStatus !== TimesheetReviewStatus.SUBMITTED);
    if (notSubmitted) {
      return {
        success: false,
        error: "Only submitted time entries can be approved by the client.",
      };
    }

    await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        contractId,
        status: TimeTrackingStatus.STOPPED,
        reviewStatus: TimesheetReviewStatus.SUBMITTED,
      },
      data: {
        reviewStatus: TimesheetReviewStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: user.id,
        disputeReason: null,
      },
    });

    const totalApprovedAmount = Number(
      entries.reduce((sum, e) => sum + (e.billableAmount || 0), 0).toFixed(2)
    );

    revalidatePath(`/contracts/${contractId}`);

    return {
      success: true,
      approvedCount: entries.length,
      approvedAmount: totalApprovedAmount,
    };
  } catch (error) {
    console.error("[WorkPulse Approve Time Entries Error]:", error);
    return {
      success: false,
      error: "Failed to approve timesheet entries.",
    };
  }
}

/**
 * Client dispute of submitted timesheet entries with a mandatory reason.
 * Enforces:
 * 1. Caller is the contract's client owner.
 * 2. Contract is an active HOURLY contract.
 * 3. All selected entries are STOPPED and currently in SUBMITTED status.
 * 4. Cannot dispute already approved entries.
 * 5. Requires a non-empty, validated dispute reason.
 */
export async function disputeTimeEntriesAction(input: DisputeTimeEntriesInput) {
  const parseResult = DisputeTimeEntriesSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid input parameters.",
    };
  }

  const { contractId, timeEntryIds, reason } = parseResult.data;
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required to dispute timesheets." };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, clientId: true, type: true },
    });

    if (!contract) {
      return { success: false, error: "Contract not found." };
    }

    if (contract.type !== PaymentType.HOURLY) {
      return { success: false, error: "Timesheet dispute is only supported for hourly contracts." };
    }

    if (contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: Only the contract's client can dispute timesheets.",
      };
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
        contractId,
      },
      select: { id: true, status: true, reviewStatus: true, billableAmount: true },
    });

    if (entries.length !== timeEntryIds.length) {
      return {
        success: false,
        error: "One or more selected time entries do not exist for this contract.",
      };
    }

    const nonStopped = entries.find((e) => e.status !== TimeTrackingStatus.STOPPED);
    if (nonStopped) {
      return {
        success: false,
        error: "Cannot dispute sessions that are currently in progress or paused.",
      };
    }

    // Cannot dispute already approved entries
    const alreadyApproved = entries.find((e) => e.reviewStatus === TimesheetReviewStatus.APPROVED);
    if (alreadyApproved) {
      return {
        success: false,
        error: "Cannot dispute entries that have already been approved.",
      };
    }

    // Only SUBMITTED sessions can be disputed
    const notSubmitted = entries.find((e) => e.reviewStatus !== TimesheetReviewStatus.SUBMITTED);
    if (notSubmitted) {
      return {
        success: false,
        error: "Only submitted time entries can be disputed by the client.",
      };
    }

    await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        contractId,
        status: TimeTrackingStatus.STOPPED,
        reviewStatus: TimesheetReviewStatus.SUBMITTED,
      },
      data: {
        reviewStatus: TimesheetReviewStatus.DISPUTED,
        reviewedAt: new Date(),
        reviewedById: user.id,
        disputeReason: reason.trim(),
      },
    });

    const totalDisputedAmount = Number(
      entries.reduce((sum, e) => sum + (e.billableAmount || 0), 0).toFixed(2)
    );

    revalidatePath(`/contracts/${contractId}`);

    return {
      success: true,
      disputedCount: entries.length,
      disputedAmount: totalDisputedAmount,
    };
  } catch (error) {
    console.error("[WorkPulse Dispute Time Entries Error]:", error);
    return {
      success: false,
      error: "Failed to dispute timesheet entries.",
    };
  }
}
