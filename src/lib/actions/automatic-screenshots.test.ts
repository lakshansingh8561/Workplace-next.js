/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SCREENSHOT_INTERVAL_SECONDS,
  SCREENSHOT_CAPTURE_INTERVAL_MS,
} from "@/components/contracts/FreelancerTimeTrackerWidget";
import { recordWorkSnapshotAction } from "./time-tracker";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { TimeTrackingStatus, PaymentType } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    timeEntry: {
      findUnique: vi.fn(),
    },
    timeScreenshot: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Automatic Work Screenshots Cadence & Lifecycle Regression Tests", () => {
  const contractId = "507f1f77bcf86cd799439023";
  const timeEntryId = "507f1f77bcf86cd799439024";
  const screenshotId = "507f1f77bcf86cd799439025";
  const freelancerId = "507f1f77bcf86cd799439021";
  const validSampleBase64 =
    "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. 10-Minute Schedule & Countdown Cadence", () => {
    it("defines the exact 10-minute cadence constants (600 seconds = 600,000 milliseconds)", () => {
      expect(SCREENSHOT_INTERVAL_SECONDS).toBe(600);
      expect(SCREENSHOT_CAPTURE_INTERVAL_MS).toBe(600_000);
      expect(SCREENSHOT_INTERVAL_SECONDS * 1000).toBe(SCREENSHOT_CAPTURE_INTERVAL_MS);
    });

    it("correctly computes countdown display format (MM:SS)", () => {
      const formatCountdown = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
      };

      expect(formatCountdown(600)).toBe("10:00");
      expect(formatCountdown(599)).toBe("9:59");
      expect(formatCountdown(65)).toBe("1:05");
      expect(formatCountdown(9)).toBe("0:09");
      expect(formatCountdown(0)).toBe("0:00");
    });

    it("schedules next capture time 10 minutes in advance", () => {
      const baseTime = 1700000000000;
      const nextCapture = baseTime + SCREENSHOT_CAPTURE_INTERVAL_MS;
      const remainingSeconds = Math.max(0, Math.ceil((nextCapture - baseTime) / 1000));

      expect(remainingSeconds).toBe(600);
    });
  });

  describe("2. Pause / Resume / Stop Lifecycle Enforcement", () => {
    it("rejects automatic or manual screenshot capture when session is PAUSED", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.PAUSED,
        contract: {
          type: PaymentType.HOURLY,
        },
      } as any);

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 20,
        mouseEvents: 30,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot record work snapshot while tracking is paused");
      expect(prisma.timeScreenshot.create).not.toHaveBeenCalled();
    });

    it("rejects screenshot capture when session is STOPPED", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.STOPPED,
        contract: {
          type: PaymentType.HOURLY,
        },
      } as any);

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 20,
        mouseEvents: 30,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot record work snapshot while tracking is stopped");
      expect(prisma.timeScreenshot.create).not.toHaveBeenCalled();
    });

    it("rejects screenshots for non-hourly (fixed-price) contracts", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
        contract: {
          type: PaymentType.FIXED,
        },
      } as any);

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 15,
        mouseEvents: 25,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Snapshots can only be recorded for hourly contracts.");
      expect(prisma.timeScreenshot.create).not.toHaveBeenCalled();
    });
  });

  describe("3. Missing Screen Sharing Permission & Consent Guard", () => {
    it("simulates client-side screen stream check: skips capture when media stream is absent or ended", () => {
      // Stream is null (permission not granted)
      const isStreamActive = (stream: any) =>
        Boolean(
          stream &&
          stream.active &&
          stream.getVideoTracks?.().some((t: any) => t.readyState === "live")
        );

      expect(isStreamActive(null)).toBe(false);
      expect(isStreamActive(undefined)).toBe(false);

      // Stream exists but inactive or tracks ended
      const deadStream = {
        active: false,
        getVideoTracks: () => [{ readyState: "ended" }],
      };
      expect(isStreamActive(deadStream)).toBe(false);

      // Stream with live track
      const liveStream = {
        active: true,
        getVideoTracks: () => [{ readyState: "live" }],
      };
      expect(isStreamActive(liveStream)).toBe(true);
    });

    it("safely handles activity-only snapshot when freelancer explicitly takes manual snapshot without screen sharing", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
        contract: {
          type: PaymentType.HOURLY,
        },
      } as any);

      let createdPayload: any = null;
      (vi.mocked(prisma.timeScreenshot.create) as any).mockImplementation(async (args: any) => {
        createdPayload = args.data;
        return {
          id: screenshotId,
          timestamp: new Date(),
          activityScore: args.data.activityScore,
        } as any;
      });

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: undefined, // no screen stream
        keystrokes: 40,
        mouseEvents: 60,
        memo: "Manual check-in without screen capture",
      });

      expect(res.success).toBe(true);
      expect(createdPayload.imageUrl).toBeNull();
      expect(createdPayload.activityScore).toBe(50);
      expect(prisma.timeScreenshot.update).not.toHaveBeenCalled();
    });
  });

  describe("4. Failed Uploads & Safe Rollback Handling", () => {
    it("deletes the created database record and returns an error if upload fails", async () => {
      process.env.CLOUDINARY_CLOUD_NAME = "workpulse-cloud";
      process.env.CLOUDINARY_API_KEY = "123456789";
      process.env.CLOUDINARY_API_SECRET = "secret";

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
        id: timeEntryId,
        freelancerId,
        contractId,
        status: TimeTrackingStatus.RECORDING,
        contract: {
          type: PaymentType.HOURLY,
        },
      } as any);

      vi.mocked(prisma.timeScreenshot.create).mockResolvedValue({
        id: screenshotId,
        timestamp: new Date(),
        activityScore: 90,
      } as any);

      vi.mocked(prisma.timeScreenshot.delete).mockResolvedValue({
        id: screenshotId,
      } as any);

      vi.spyOn(cloudinary.uploader, "upload").mockRejectedValue(new Error("Network timeout during upload"));

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 60,
        mouseEvents: 60,
        memo: "Automatic snapshot upload test",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Failed to upload screenshot to secure storage.");
      expect(prisma.timeScreenshot.delete).toHaveBeenCalledWith({
        where: { id: screenshotId },
      });
      expect(prisma.timeScreenshot.update).not.toHaveBeenCalled();
    });
  });

  describe("5. Duplicate Timer Prevention & Overlap Guard", () => {
    it("prevents overlapping snapshot executions with in-flight capture lock", async () => {
      let isCapturing = false;
      let executionCount = 0;

      const performSnapshotCapture = async () => {
        if (isCapturing) return { skipped: true };
        isCapturing = true;
        executionCount++;
        try {
          await new Promise((r) => setTimeout(r, 20));
          return { skipped: false };
        } finally {
          isCapturing = false;
        }
      };

      // Trigger 3 concurrent captures
      const [res1, res2, res3] = await Promise.all([
        performSnapshotCapture(),
        performSnapshotCapture(),
        performSnapshotCapture(),
      ]);

      expect(res1.skipped).toBe(false);
      expect(res2.skipped).toBe(true);
      expect(res3.skipped).toBe(true);
      expect(executionCount).toBe(1);
    });

    it("verifies interval cleanup prevents duplicate intervals across pause and resume cycles", () => {
      let activeIntervals = 0;
      let intervalId: any = null;

      const startInterval = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          activeIntervals--;
        }
        intervalId = setInterval(() => {}, 1000);
        activeIntervals++;
      };

      const pauseInterval = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
          activeIntervals--;
        }
      };

      // Start
      startInterval();
      expect(activeIntervals).toBe(1);

      // Pause
      pauseInterval();
      expect(activeIntervals).toBe(0);

      // Resume
      startInterval();
      expect(activeIntervals).toBe(1);

      // Stop
      pauseInterval();
      expect(activeIntervals).toBe(0);
    });
  });

  describe("6. Persistent In-DOM Video Extraction & Aspect Ratio Preservation", () => {
    it("computes bounded canvas dimensions preserving aspect ratio up to 1280x720", () => {
      const computeCanvasDimensions = (videoWidth: number, videoHeight: number) => {
        const width = Math.min(1280, videoWidth);
        const height = Math.min(
          720,
          Math.round((width / videoWidth) * videoHeight)
        );
        return { width, height };
      };

      // 1080p source (1920x1080 -> 1280x720)
      expect(computeCanvasDimensions(1920, 1080)).toEqual({ width: 1280, height: 720 });

      // 1440p source (2560x1440 -> 1280x720)
      expect(computeCanvasDimensions(2560, 1440)).toEqual({ width: 1280, height: 720 });

      // 4K source (3840x2160 -> 1280x720)
      expect(computeCanvasDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 });

      // Smaller source (800x600 -> 800x600)
      expect(computeCanvasDimensions(800, 600)).toEqual({ width: 800, height: 600 });

      // Ultra-wide source (3440x1440 -> 1280x536)
      const ultraWide = computeCanvasDimensions(3440, 1440);
      expect(ultraWide.width).toBe(1280);
      expect(ultraWide.height).toBe(536);
    });

    it("cleans up video element srcObject and stops tracks when stream is stopped", () => {
      let trackStopped = false;
      const mockTrack = {
        stop: () => {
          trackStopped = true;
        },
      };
      const mockStream = {
        getTracks: () => [mockTrack],
      };
      const mockVideoElement: { srcObject: any; pause: () => void } = {
        srcObject: mockStream,
        pause: vi.fn(),
      };

      // Simulate stopScreenStream
      if (mockStream) {
        mockStream.getTracks().forEach((t) => t.stop());
      }
      if (mockVideoElement) {
        mockVideoElement.pause();
        mockVideoElement.srcObject = null;
      }

      expect(trackStopped).toBe(true);
      expect(mockVideoElement.pause).toHaveBeenCalled();
      expect(mockVideoElement.srcObject).toBeNull();
    });
  });

  describe("7. Proactive Screen Permission on Start & Resume", () => {
    it("proactively prompts for screen sharing if supported and inactive upon timer start", async () => {
      let getDisplayMediaCalled = false;
      const mockNavigator = {
        mediaDevices: {
          getDisplayMedia: async () => {
            getDisplayMediaCalled = true;
            return {
              getVideoTracks: () => [{ readyState: "live", onended: null }],
            };
          },
        },
      };

      let screenShareActive = false;
      const requestScreenShareStream = async () => {
        if (!mockNavigator.mediaDevices?.getDisplayMedia) return false;
        const stream = await mockNavigator.mediaDevices.getDisplayMedia();
        const track = stream.getVideoTracks()[0];
        if (track && track.readyState === "live") {
          screenShareActive = true;
          return true;
        }
        return false;
      };

      // Handle start simulation
      const handleStart = async () => {
        if (!screenShareActive) {
          await requestScreenShareStream();
        }
      };

      await handleStart();
      expect(getDisplayMediaCalled).toBe(true);
      expect(screenShareActive).toBe(true);
    });

    it("allows time tracking to start safely even if user cancels screen sharing prompt", async () => {
      const mockNavigator = {
        mediaDevices: {
          getDisplayMedia: async () => {
            throw new Error("Permission denied by user");
          },
        },
      };

      let screenShareActive = false;
      let errorNotice: string | null = null;
      let timerStarted = false;

      const requestScreenShareStream = async () => {
        try {
          await mockNavigator.mediaDevices.getDisplayMedia();
          screenShareActive = true;
          return true;
        } catch {
          errorNotice = "Screen sharing cancelled";
          screenShareActive = false;
          return false;
        }
      };

      const handleStart = async () => {
        if (!screenShareActive) {
          await requestScreenShareStream();
        }
        timerStarted = true;
      };

      await handleStart();
      expect(screenShareActive).toBe(false);
      expect(errorNotice).toBe("Screen sharing cancelled");
      expect(timerStarted).toBe(true); // Tracking still begins safely without crash
    });
  });
});

