export type JobStatusChangeEvent = {
  jobId: string;
  status: "OPEN" | "PAUSED" | "CLOSED" | "DRAFT";
  timestamp: number;
};

export type MarketplaceEventType =
  | "JOB_STATUS"
  | "JOB_CREATED"
  | "PROPOSAL_STATUS"
  | "MILESTONE_STATUS"
  | "CONTRACT_STATUS";

export type MarketplaceEvent = {
  type: MarketplaceEventType;
  jobId?: string;
  proposalId?: string;
  contractId?: string;
  milestoneId?: string;
  status?: string;
  title?: string;
  timestamp: number;
};

const CHANNEL_NAME = "workpulse_marketplace_sync";
const STORAGE_KEY = "workpulse:marketplace_event";
const CUSTOM_EVENT_NAME = "workpulse:marketplace_event";

// Backwards-compatible constants for job status
const LEGACY_STORAGE_KEY = "workpulse:job_status_update";
const LEGACY_CUSTOM_EVENT = "workpulse:job_status_update";

/**
 * Broadcasts any marketplace event across browser tabs, windows, and components.
 */
export function broadcastMarketplaceEvent(
  event: Omit<MarketplaceEvent, "timestamp">
) {
  if (typeof window === "undefined") return;

  const payload: MarketplaceEvent = {
    ...event,
    timestamp: Date.now(),
  };

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {
    // Channel error ignored, fallback to storage
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }

  window.dispatchEvent(
    new CustomEvent(CUSTOM_EVENT_NAME, { detail: payload })
  );

  // If this is a job status update, also emit legacy format for backwards compatibility
  if (payload.type === "JOB_STATUS" && payload.jobId && payload.status) {
    const legacyPayload: JobStatusChangeEvent = {
      jobId: payload.jobId,
      status: payload.status as "OPEN" | "PAUSED" | "CLOSED" | "DRAFT",
      timestamp: payload.timestamp,
    };

    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyPayload));
    } catch {}

    window.dispatchEvent(
      new CustomEvent(LEGACY_CUSTOM_EVENT, { detail: legacyPayload })
    );
  }
}

/**
 * Broadcasts a job status update across browser tabs and same-window components.
 * Backwards compatible helper.
 */
export function broadcastJobStatusChange(
  jobId: string,
  status: "OPEN" | "PAUSED" | "CLOSED" | "DRAFT"
) {
  broadcastMarketplaceEvent({
    type: "JOB_STATUS",
    jobId,
    status,
  });
}

/**
 * Broadcasts a newly created job.
 */
export function broadcastJobCreated(
  jobId: string,
  status: string = "OPEN",
  title?: string
) {
  broadcastMarketplaceEvent({
    type: "JOB_CREATED",
    jobId,
    status,
    title,
  });
}

/**
 * Broadcasts a proposal status update (submitted, accepted, rejected).
 */
export function broadcastProposalUpdate(
  proposalId: string,
  status?: string,
  jobId?: string
) {
  broadcastMarketplaceEvent({
    type: "PROPOSAL_STATUS",
    proposalId,
    status,
    jobId,
  });
}

/**
 * Broadcasts milestone deliverable, revision, or approval updates.
 */
export function broadcastMilestoneUpdate(
  milestoneId: string,
  contractId?: string,
  status?: string
) {
  broadcastMarketplaceEvent({
    type: "MILESTONE_STATUS",
    milestoneId,
    contractId,
    status,
  });
}

/**
 * Subscribes to all marketplace events across tabs and local windows.
 */
export function subscribeToMarketplaceEvents(
  callback: (event: MarketplaceEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let channel: BroadcastChannel | null = null;
  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e) => {
        if (e.data && e.data.type) {
          callback(e.data);
        }
      };
    }
  } catch {
    // Fallback to storage event
  }

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.type) {
          callback(parsed);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  };

  const handleCustom = (e: Event) => {
    const customEvt = e as CustomEvent<MarketplaceEvent>;
    if (customEvt.detail) {
      callback(customEvt.detail);
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CUSTOM_EVENT_NAME, handleCustom);

  return () => {
    if (channel) {
      channel.close();
    }
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CUSTOM_EVENT_NAME, handleCustom);
  };
}

/**
 * Subscribes specifically to job status update notifications (backwards-compatible).
 */
export function subscribeToJobStatusChanges(
  callback: (event: JobStatusChangeEvent) => void
): () => void {
  return subscribeToMarketplaceEvents((event) => {
    if (event.type === "JOB_STATUS" && event.jobId && event.status) {
      callback({
        jobId: event.jobId,
        status: event.status as "OPEN" | "PAUSED" | "CLOSED" | "DRAFT",
        timestamp: event.timestamp,
      });
    }
  });
}
