import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateJobStatusAction } from "./job";
import { prisma } from "@/lib/prisma";
import { verifyUserForAction } from "@/lib/session";
import { JobStatus } from "@prisma/client";
import { getJobs } from "@/lib/jobs";
import { broadcastJobStatusChange, subscribeToJobStatusChanges } from "@/lib/events/job-events";

vi.mock("@/lib/session", () => ({
  verifyUserForAction: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    contract: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Client Job Status Management & Cross-Dashboard Sync", () => {
  const verifiedClient = {
    id: "client_test_owner_1",
    name: "Acme Client",
    email: "client@acme.com",
    role: "CLIENT",
    roleSelected: true,
    emailVerified: new Date(),
    sessionVersion: 1,
  };

  const sampleJobId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(verifyUserForAction).mockResolvedValue({
      success: true,
      user: verifiedClient as any,
    });
  });

  describe("Job Status Transitions & Database Persistence", () => {
    it("1. Client pauses an OPEN job and updates database to PAUSED", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Senior Full-Stack Engineer",
        clientId: verifiedClient.id,
        status: JobStatus.OPEN,
      } as any);

      vi.mocked(prisma.job.update).mockResolvedValue({
        id: sampleJobId,
        status: JobStatus.PAUSED,
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "PAUSED",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(JobStatus.PAUSED);
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sampleJobId },
          data: { status: JobStatus.PAUSED },
        })
      );
    });

    it("2. Client reopens a PAUSED job and updates database to OPEN with reset expiration window", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Senior Full-Stack Engineer",
        clientId: verifiedClient.id,
        status: JobStatus.PAUSED,
      } as any);

      vi.mocked(prisma.job.update).mockResolvedValue({
        id: sampleJobId,
        status: JobStatus.OPEN,
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "OPEN",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(JobStatus.OPEN);
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sampleJobId },
          data: expect.objectContaining({
            status: JobStatus.OPEN,
            expiresAt: expect.any(Date),
          }),
        })
      );
    });

    it("3. Client closes an OPEN job and updates database to CLOSED", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Senior Full-Stack Engineer",
        clientId: verifiedClient.id,
        status: JobStatus.OPEN,
      } as any);

      vi.mocked(prisma.job.update).mockResolvedValue({
        id: sampleJobId,
        status: JobStatus.CLOSED,
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "CLOSED",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(JobStatus.CLOSED);
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sampleJobId },
          data: { status: JobStatus.CLOSED },
        })
      );
    });

    it("4. Prevents reopening a CLOSED job if an active contract is already in progress", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Senior Full-Stack Engineer",
        clientId: verifiedClient.id,
        status: JobStatus.CLOSED,
      } as any);

      vi.mocked(prisma.contract.findFirst).mockResolvedValue({
        id: "contract_active_123",
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "OPEN",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("active contract is already in progress");
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it("5. Idempotent: returns success immediately if job is already at target status", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Senior Full-Stack Engineer",
        clientId: verifiedClient.id,
        status: JobStatus.PAUSED,
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "PAUSED",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(JobStatus.PAUSED);
      expect(prisma.job.update).not.toHaveBeenCalled();
    });
  });

  describe("Server-Side Authorization & Ownership Enforcement", () => {
    it("6. Rejects unauthenticated callers", async () => {
      vi.mocked(verifyUserForAction).mockResolvedValueOnce({
        success: false,
        error: "You must be signed in to access this feature.",
        code: "UNAUTHENTICATED",
      });

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "PAUSED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("signed in");
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it("7. Rejects Freelancer role from changing job status", async () => {
      vi.mocked(verifyUserForAction).mockResolvedValueOnce({
        success: false,
        error: "Unauthorized: Only client accounts can manage job status.",
        code: "UNAUTHORIZED_ROLE",
      });

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "PAUSED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Only client accounts");
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it("8. Rejects client who is NOT the job owner", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Other Client Job",
        clientId: "different_client_999",
        status: JobStatus.OPEN,
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "PAUSED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("You do not own this job contract");
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it("9. Rejects invalid status transition (e.g. CLOSED to PAUSED)", async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: sampleJobId,
        title: "Closed Job",
        clientId: verifiedClient.id,
        status: JobStatus.CLOSED,
      } as any);

      const res = await updateJobStatusAction({
        jobId: sampleJobId,
        status: "PAUSED",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Invalid status transition");
      expect(prisma.job.update).not.toHaveBeenCalled();
    });
  });

  describe("Cross-Dashboard Discovery Synchronization", () => {
    it("10. Guarantees getJobs strictly filters by status: OPEN so PAUSED/CLOSED jobs never appear in Find Work", async () => {
      vi.mocked(prisma.job.count).mockResolvedValue(0);
      vi.mocked(prisma.job.findMany).mockResolvedValue([]);

      await getJobs({ page: 1, limit: 10 });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ status: "OPEN" }),
            ]),
          }),
        })
      );
    });

    it("11. Broadcasts cross-tab job status update via job-events channel and storage", () => {
      const listeners: Record<string, Function[]> = {};
      const mockWindow = {
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== fn);
          }
        },
        dispatchEvent: (event: any) => {
          if (listeners[event.type]) {
            listeners[event.type].forEach((fn) => fn(event));
          }
          return true;
        },
      };

      vi.stubGlobal("window", mockWindow);
      vi.stubGlobal("CustomEvent", class CustomEvent {
        type: string;
        detail: any;
        constructor(type: string, init?: any) {
          this.type = type;
          this.detail = init?.detail;
        }
      });
      vi.stubGlobal("localStorage", {
        setItem: vi.fn(),
        getItem: vi.fn(),
      });

      const receivedEvents: any[] = [];
      const unsubscribe = subscribeToJobStatusChanges((evt) => {
        receivedEvents.push(evt);
      });

      broadcastJobStatusChange(sampleJobId, "PAUSED");

      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].jobId).toBe(sampleJobId);
      expect(receivedEvents[0].status).toBe("PAUSED");

      unsubscribe();
      vi.unstubAllGlobals();
    });
  });
});
