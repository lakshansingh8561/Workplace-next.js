// src/lib/timer-mutex.ts
import { TimeTrackingStatus } from "@prisma/client";

/**
 * Distributed-Safe Active Timer Reservation & Concurrency Management.
 *
 * Implements a dual-layer concurrency guarantee:
 * Layer 1 (Process-Level): In-memory Map serialization for microsecond mutual exclusion
 *         within the local Node.js process (without arbitrary 15s expiration).
 * Layer 2 (Database-Level): Dedicated MongoDB `active_timer_reservations` collection
 *         with a UNIQUE constraint on `freelancerId` ensuring absolute mutual exclusion
 *         across horizontally scaled Node.js processes, serverless lambdas, and cluster workers.
 */

interface ActiveTimerLock {
  contractId: string;
  lockedAt: number;
}

// In-process lock map (held for the entire active session duration, never arbitrarily expired)
const activeTimerLocks = new Map<string, ActiveTimerLock>();

/**
 * Acquires local process-level reservation lock.
 * Remains held for the full duration of the RECORDING or PAUSED session.
 */
export function acquireActiveTimerLock(freelancerId: string, contractId: string): boolean {
  const existing = activeTimerLocks.get(freelancerId);
  if (existing) {
    return false; // Active lock held: concurrent request in progress
  }
  activeTimerLocks.set(freelancerId, { contractId, lockedAt: Date.now() });
  return true;
}

/**
 * Releases local process-level reservation lock.
 */
export function releaseActiveTimerLock(freelancerId: string): void {
  activeTimerLocks.delete(freelancerId);
}

/**
 * Clears all local process-level locks (for testing and recovery).
 */
export function resetActiveTimerLocks(): void {
  activeTimerLocks.clear();
}

export type ReservationResult = {
  success: boolean;
  reservationId?: string;
  isOrphanRecovered?: boolean;
  error?: string;
};

/**
 * Atomically acquires a distributed database-level reservation within an active transaction.
 *
 * Enforces:
 * 1. Mutual exclusion across all distributed processes via MongoDB `@unique freelancerId`.
 * 2. Reconciles state before acquisition: checks if an active time-entry actually exists.
 * 3. Safely recovers orphaned reservations if an interrupted crash left a reservation without an active TimeEntry.
 * 4. Never expires merely because a fixed timeout elapsed.
 */
export async function acquireDatabaseTimerReservation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  freelancerId: string,
  contractId: string
): Promise<ReservationResult> {
  // 1. Reconcile against actual time-entry state
  if (tx.timeEntry) {
    const activeEntry = await tx.timeEntry.findFirst({
      where: {
        freelancerId,
        status: { in: [TimeTrackingStatus.RECORDING, TimeTrackingStatus.PAUSED] },
      },
      select: { id: true, status: true, contractId: true },
    });

    if (activeEntry) {
      return {
        success: false,
        error:
          "An active time session is already in progress. Please pause or stop your current session before starting a new one.",
      };
    }
  }

  // 2. If no active entry exists, clean up any orphaned reservation from prior crash/rollback
  let isOrphanRecovered = false;
  if (tx.activeTimerReservation) {
    const deleted = await tx.activeTimerReservation.deleteMany({
      where: { freelancerId },
    });
    if (deleted.count > 0) {
      isOrphanRecovered = true;
    }

    // 3. Atomically create the database reservation record
    // MongoDB unique constraint on freelancerId guarantees that simultaneous attempts
    // from separate processes will result in P2002 (unique constraint violation)
    const reservation = await tx.activeTimerReservation.create({
      data: {
        freelancerId,
        contractId,
      },
      select: { id: true },
    });

    return {
      success: true,
      reservationId: reservation.id,
      isOrphanRecovered,
    };
  }

  return { success: true, isOrphanRecovered };
}

/**
 * Links a newly created TimeEntry record to the active reservation.
 */
export async function linkTimeEntryToReservation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  freelancerId: string,
  timeEntryId: string
): Promise<void> {
  if (tx.activeTimerReservation) {
    await tx.activeTimerReservation.updateMany({
      where: { freelancerId },
      data: { timeEntryId },
    });
  }
}

/**
 * Releases the distributed database reservation upon session finalization.
 */
export async function releaseDatabaseTimerReservation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  freelancerId: string
): Promise<void> {
  if (prismaClient.activeTimerReservation) {
    await prismaClient.activeTimerReservation.deleteMany({
      where: { freelancerId },
    });
  }
  
}
