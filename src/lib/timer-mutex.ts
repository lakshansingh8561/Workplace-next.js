// src/lib/timer-mutex.ts
/**
 * In-memory active timer reservation lock per freelancer.
 * Provides microsecond mutual exclusion to serialize concurrent start requests
 * before and during the database transaction.
 */
interface ActiveTimerLock {
  contractId: string;
  lockedAt: number;
}

const activeTimerLocks = new Map<string, ActiveTimerLock>();
const LOCK_TIMEOUT_MS = 15_000; // 15s auto-expire for in-flight reservation

export function acquireActiveTimerLock(freelancerId: string, contractId: string): boolean {
  const now = Date.now();
  const existing = activeTimerLocks.get(freelancerId);
  if (existing && now - existing.lockedAt < LOCK_TIMEOUT_MS) {
    return false; // Lock acquisition rejected: concurrent request in progress
  }
  activeTimerLocks.set(freelancerId, { contractId, lockedAt: now });
  return true;
}

export function releaseActiveTimerLock(freelancerId: string): void {
  activeTimerLocks.delete(freelancerId);
}

export function resetActiveTimerLocks(): void {
  activeTimerLocks.clear();
}
