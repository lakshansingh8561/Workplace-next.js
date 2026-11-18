export type JobStatusChangeEvent = {
  jobId: string;
  status: "OPEN" | "PAUSED" | "CLOSED" | "DRAFT";
  timestamp: number;
};

const CHANNEL_NAME = "workpulse_job_status_sync";

/**
 * Broadcasts a job status update across browser tabs and same-window components.
 * Uses BroadcastChannel with fallback to localStorage storage events and CustomEvent.
 */
export function broadcastJobStatusChange(
  jobId: string,
  status: "OPEN" | "PAUSED" | "CLOSED" | "DRAFT"
) {
  if (typeof window === "undefined") return;

  const payload: JobStatusChangeEvent = {
    jobId,
    status,
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
    localStorage.setItem(
      "workpulse:job_status_update",
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage quota errors
  }

  window.dispatchEvent(
    new CustomEvent("workpulse:job_status_update", { detail: payload })
  );
}

/**
 * Subscribes to cross-tab and cross-dashboard job status update notifications.
 * Automatically cleans up channel, storage, and custom event listeners.
 */
export function subscribeToJobStatusChanges(
  callback: (event: JobStatusChangeEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let channel: BroadcastChannel | null = null;
  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e) => {
        if (e.data && e.data.jobId && e.data.status) {
          callback(e.data);
        }
      };
    }
  } catch {
    // Fallback to storage event
  }

  const handleStorage = (e: StorageEvent) => {
    if (e.key === "workpulse:job_status_update" && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.jobId && parsed?.status) {
          callback(parsed);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  };

  const handleCustom = (e: Event) => {
    const customEvt = e as CustomEvent<JobStatusChangeEvent>;
    if (customEvt.detail) {
      callback(customEvt.detail);
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener("workpulse:job_status_update", handleCustom);

  return () => {
    if (channel) {
      channel.close();
    }
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("workpulse:job_status_update", handleCustom);
  };
}

