import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  broadcastMarketplaceEvent,
  broadcastJobStatusChange,
  broadcastJobCreated,
  broadcastProposalUpdate,
  broadcastMilestoneUpdate,
  subscribeToMarketplaceEvents,
} from "./job-events";

describe("Marketplace Real-Time Event Bus & State Synchronization", () => {
  const listeners = new Map<string, Set<(e: any) => void>>();

  beforeEach(() => {
    listeners.clear();
    (globalThis as any).window = {
      addEventListener: (type: string, cb: any) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      },
      removeEventListener: (type: string, cb: any) => {
        listeners.get(type)?.delete(cb);
      },
      dispatchEvent: (evt: any) => {
        const cbs = listeners.get(evt.type);
        cbs?.forEach((cb) => cb(evt));
        return true;
      },
    };
    (globalThis as any).CustomEvent = class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, options?: any) {
        this.type = type;
        this.detail = options?.detail;
      }
    };
    (globalThis as any).localStorage = {
      setItem: vi.fn(),
      getItem: vi.fn(),
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).CustomEvent;
    delete (globalThis as any).localStorage;
    vi.restoreAllMocks();
  });

  it("successfully subscribes and receives broadcast events via custom events", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceEvents(listener);

    broadcastJobStatusChange("job-123", "PAUSED");

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "JOB_STATUS",
        jobId: "job-123",
        status: "PAUSED",
      })
    );

    unsubscribe();
  });

  it("correctly dispatches broadcastJobCreated event", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceEvents(listener);

    broadcastJobCreated("job-999", "OPEN", "Senior React Developer");

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "JOB_CREATED",
        jobId: "job-999",
        status: "OPEN",
        title: "Senior React Developer",
      })
    );

    unsubscribe();
  });

  it("correctly dispatches broadcastProposalUpdate event", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceEvents(listener);

    broadcastProposalUpdate("prop-456", "ACCEPTED", "job-123");

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PROPOSAL_STATUS",
        proposalId: "prop-456",
        status: "ACCEPTED",
        jobId: "job-123",
      })
    );

    unsubscribe();
  });

  it("correctly dispatches broadcastMilestoneUpdate event", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceEvents(listener);

    broadcastMilestoneUpdate("mile-789", "contract-555", "APPROVED");

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MILESTONE_STATUS",
        milestoneId: "mile-789",
        contractId: "contract-555",
        status: "APPROVED",
      })
    );

    unsubscribe();
  });

  it("stops receiving events after calling unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceEvents(listener);

    unsubscribe();

    broadcastJobStatusChange("job-xyz", "CLOSED");

    expect(listener).not.toHaveBeenCalled();
  });
});
