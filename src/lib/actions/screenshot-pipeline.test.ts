/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { v2 as cloudinary } from "cloudinary";
import { recordWorkSnapshotAction, getContractWorkDiaryAction } from "./time-tracker";
import {
  isStorageConfigured,
  getStorageConfig,
  processScreenshotStorage,
  getScreenshotImage,
  clearScreenshotStoreForTesting,
} from "@/lib/storage";
import { GET as getScreenshotRoute } from "@/app/api/contracts/[id]/screenshots/[screenshotId]/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { TimeTrackingStatus, PaymentType, ContractStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contract: {
      findUnique: vi.fn(),
    },
    timeEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    timeScreenshot: {
      create: vi.fn(),
      update: vi.fn(),
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

describe("Screenshot Pipeline & Protected Storage Verification", () => {
  const contractId = "507f1f77bcf86cd799439023";
  const timeEntryId = "507f1f77bcf86cd799439024";
  const screenshotId = "507f1f77bcf86cd799439025";
  const freelancerId = "507f1f77bcf86cd799439021";
  const clientId = "507f1f77bcf86cd799439022";
  const thirdPartyId = "507f1f77bcf86cd799439099";

  const validSampleBase64 =
    "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    clearScreenshotStoreForTesting();
    process.env = { ...originalEnv };
    delete process.env.STORAGE_PROVIDER;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_API_KEY_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("1. Storage Configuration Checks (src/lib/storage.ts)", () => {
    it("reports storage as unconfigured when provider/keys are missing", () => {
      expect(isStorageConfigured()).toBe(false);
      expect(getStorageConfig().provider).toBe("none");
    });

    it("reports storage as configured when valid S3/R2 settings are set", () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

      expect(isStorageConfigured()).toBe(true);
      expect(getStorageConfig().provider).toBe("s3");
    });

    it("reports storage as configured when Cloudinary credentials are set", () => {
      process.env.CLOUDINARY_CLOUD_NAME = "workpulse-cloud";
      process.env.CLOUDINARY_API_KEY = "mock-cloud-key";
      process.env.CLOUDINARY_API_SECRET = "mock-cloud-secret";

      expect(isStorageConfigured()).toBe(true);
      expect(getStorageConfig().provider).toBe("cloudinary");
    });

    it("reports storage as configured when CLOUDINARY_API_KEY_SECRET alias is used", () => {
      process.env.CLOUDINARY_CLOUD_NAME = "workpulse-cloud";
      process.env.CLOUDINARY_API_KEY = "mock-cloud-key";
      process.env.CLOUDINARY_API_KEY_SECRET = "mock-cloud-secret";
      delete process.env.CLOUDINARY_API_SECRET;

      expect(isStorageConfigured()).toBe(true);
      expect(getStorageConfig().provider).toBe("cloudinary");
      expect(getStorageConfig().apiSecret).toBe("mock-cloud-secret");
    });

    it("returns STORAGE_NOT_CONFIGURED reason and null routeUrl when storage is unset", async () => {
      const result = await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        validSampleBase64
      );

      expect(result.storageKey).toBeNull();
      expect(result.routeUrl).toBeNull();
      expect(result.reason).toBe("STORAGE_NOT_CONFIGURED");
    });

    it("handles upload failure gracefully on malformed base64 image data", async () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

      const result = await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        "not-a-valid-data-uri"
      );

      expect(result.storageKey).toBeNull();
      expect(result.routeUrl).toBeNull();
      expect(result.reason).toBe("NO_IMAGE_DATA");
    });

    it("successfully stores valid image buffer and returns protected route URL when storage is configured", async () => {
      process.env.STORAGE_PROVIDER = "r2";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

      const result = await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        validSampleBase64
      );

      expect(result.storageKey).toBe(`contracts/${contractId}/entries/${timeEntryId}/${screenshotId}.webp`);
      expect(result.routeUrl).toBe(`/api/contracts/${contractId}/screenshots/${screenshotId}`);

      const retrieved = await getScreenshotImage(screenshotId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.contentType).toBe("image/webp");
      expect(retrieved?.buffer).toBeInstanceOf(Buffer);
    });
  });

  describe("2. recordWorkSnapshotAction - Handling Storage & Missing Images", () => {
    it("saves activity metrics with imageUrl null when storage is unconfigured", async () => {
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

      let createdData: any = null;
      (vi.mocked(prisma.timeScreenshot.create) as any).mockImplementation(async (args: any) => {
        createdData = args.data;
        return {
          id: screenshotId,
          timestamp: new Date(),
          activityScore: args.data.activityScore,
        };
      });

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 30,
        mouseEvents: 50,
        memo: "Developing responsive layout",
      });

      expect(res.success).toBe(true);
      expect(createdData.imageUrl).toBeNull(); // Storage unconfigured -> null
      expect(createdData.activityScore).toBe(40);
      expect(createdData.memo).toBe("Developing responsive layout");
      expect(prisma.timeScreenshot.update).not.toHaveBeenCalled();
    });

    it("links protected route URL when storage is configured and upload succeeds", async () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

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

      vi.mocked(prisma.timeScreenshot.create).mockResolvedValue({
        id: screenshotId,
        timestamp: new Date(),
        activityScore: 80,
      } as any);

      vi.mocked(prisma.timeScreenshot.update).mockResolvedValue({
        id: screenshotId,
        imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
      } as any);

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 80,
        mouseEvents: 80,
        memo: "Testing storage upload",
      });

      expect(res.success).toBe(true);
      expect(prisma.timeScreenshot.update).toHaveBeenCalledWith({
        where: { id: screenshotId },
        data: {
          imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
        },
      });
    });

    it("never fabricates screenshots when imageUrl is omitted (activity-only record)", async () => {
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

      let createdData: any = null;
      (vi.mocked(prisma.timeScreenshot.create) as any).mockImplementation(async (args: any) => {
        createdData = args.data;
        return {
          id: screenshotId,
          timestamp: new Date(),
          activityScore: args.data.activityScore,
        };
      });

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: undefined, // No screen sharing active
        keystrokes: 10,
        mouseEvents: 10,
      });

      expect(res.success).toBe(true);
      expect(createdData.imageUrl).toBeNull();
      expect(prisma.timeScreenshot.update).not.toHaveBeenCalled();
    });
  });

  describe("3. Protected Screenshot API Route Authorization & Streaming", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const req = new Request(`http://localhost:3000/api/contracts/${contractId}/screenshots/${screenshotId}`);
      const res = await getScreenshotRoute(req, {
        params: Promise.resolve({ id: contractId, screenshotId }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns 404 when screenshot is not found or does not belong to contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.timeScreenshot.findUnique).mockResolvedValue(null);

      const req = new Request(`http://localhost:3000/api/contracts/${contractId}/screenshots/${screenshotId}`);
      const res = await getScreenshotRoute(req, {
        params: Promise.resolve({ id: contractId, screenshotId }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    it("returns 403 when user is neither client nor freelancer on the contract", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: thirdPartyId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.timeScreenshot.findUnique).mockResolvedValue({
        id: screenshotId,
        contractId,
        imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
        contract: {
          clientId,
          freelancerId,
        },
      } as any);

      const req = new Request(`http://localhost:3000/api/contracts/${contractId}/screenshots/${screenshotId}`);
      const res = await getScreenshotRoute(req, {
        params: Promise.resolve({ id: contractId, screenshotId }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    it("returns 404 when storage is not configured", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.timeScreenshot.findUnique).mockResolvedValue({
        id: screenshotId,
        contractId,
        imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
        contract: {
          clientId,
          freelancerId,
        },
      } as any);

      const req = new Request(`http://localhost:3000/api/contracts/${contractId}/screenshots/${screenshotId}`);
      const res = await getScreenshotRoute(req, {
        params: Promise.resolve({ id: contractId, screenshotId }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Object storage is not configured");
    });

    it("returns 200 with binary image and correct Content-Type for assigned client when storage is active", async () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

      // Seed storage
      await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        validSampleBase64
      );

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.timeScreenshot.findUnique).mockResolvedValue({
        id: screenshotId,
        contractId,
        imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
        contract: {
          clientId,
          freelancerId,
        },
      } as any);

      const req = new Request(`http://localhost:3000/api/contracts/${contractId}/screenshots/${screenshotId}`);
      const res = await getScreenshotRoute(req, {
        params: Promise.resolve({ id: contractId, screenshotId }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/webp");
      expect(res.headers.get("Cache-Control")).toContain("private");
      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it("returns 200 with binary image for assigned freelancer", async () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

      await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        validSampleBase64
      );

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.timeScreenshot.findUnique).mockResolvedValue({
        id: screenshotId,
        contractId,
        imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
        contract: {
          clientId,
          freelancerId,
        },
      } as any);

      const req = new Request(`http://localhost:3000/api/contracts/${contractId}/screenshots/${screenshotId}`);
      const res = await getScreenshotRoute(req, {
        params: Promise.resolve({ id: contractId, screenshotId }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/webp");
    });
  });

  describe("4. getContractWorkDiaryAction - Storage Status Propagation", () => {
    it("reports isStorageConfigured false when storage env is not set", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: clientId,
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        title: "Full Stack Development",
        clientId,
        freelancerId,
        hourlyRate: 50,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([]);

      const diary = await getContractWorkDiaryAction(contractId);
      expect(diary.success).toBe(true);
      expect(diary.isStorageConfigured).toBe(false);
    });

    it("reports isStorageConfigured true when storage env is configured", async () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: freelancerId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.contract.findUnique).mockResolvedValue({
        id: contractId,
        title: "Full Stack Development",
        clientId,
        freelancerId,
        hourlyRate: 50,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([]);

      const diary = await getContractWorkDiaryAction(contractId);
      expect(diary.success).toBe(true);
      expect(diary.isStorageConfigured).toBe(true);
    });
  });

  describe("5. Cloudinary Authenticated Asset Storage & Retrieval", () => {
    beforeEach(() => {
      process.env.CLOUDINARY_CLOUD_NAME = "workpulse-cloud";
      process.env.CLOUDINARY_API_KEY = "mock-cloud-key";
      process.env.CLOUDINARY_API_SECRET = "mock-cloud-secret";
    });

    it("uploads authenticated asset to Cloudinary with unique identifier and returns protected route URL", async () => {
      const uploadSpy = vi.spyOn(cloudinary.uploader, "upload").mockResolvedValue({
        public_id: `workpulse_screenshot_${screenshotId}`,
        format: "webp",
      } as any);

      const result = await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        validSampleBase64
      );

      expect(uploadSpy).toHaveBeenCalledWith(
        validSampleBase64,
        expect.objectContaining({
          public_id: `workpulse_screenshot_${screenshotId}`,
          type: "authenticated",
          resource_type: "image",
          overwrite: true,
        })
      );
      expect(result.storageKey).toBe(`workpulse_screenshot_${screenshotId}`);
      expect(result.routeUrl).toBe(`/api/contracts/${contractId}/screenshots/${screenshotId}`);
    });

    it("handles Cloudinary upload failure safely without marking screenshot as stored", async () => {
      vi.spyOn(cloudinary.uploader, "upload").mockRejectedValue(new Error("Cloudinary connection timeout"));

      const result = await processScreenshotStorage(
        contractId,
        timeEntryId,
        screenshotId,
        validSampleBase64
      );

      expect(result.storageKey).toBeNull();
      expect(result.routeUrl).toBeNull();
      expect(result.reason).toBe("UPLOAD_FAILED");
    });

    it("retrieves private Cloudinary asset server-side using signed private URL without exposing to browser", async () => {
      clearScreenshotStoreForTesting();

      const signedDownloadUrl = "https://api.cloudinary.com/v1_1/workpulse-cloud/image/download?signed=1";
      const privateUrlSpy = vi.spyOn(cloudinary.utils, "private_download_url").mockReturnValue(signedDownloadUrl);

      const mockBuffer = Buffer.from("mock-binary-webp-data");
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(mockBuffer, {
          status: 200,
          headers: { "content-type": "image/webp" },
        })
      );

      const retrieved = await getScreenshotImage(screenshotId);

      expect(privateUrlSpy).toHaveBeenCalledWith(
        `workpulse_screenshot_${screenshotId}`,
        "webp",
        expect.objectContaining({
          resource_type: "image",
          type: "authenticated",
        })
      );
      expect(fetchSpy).toHaveBeenCalledWith(signedDownloadUrl);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.contentType).toBe("image/webp");
      expect(retrieved?.buffer).toEqual(mockBuffer);
    });

    it("handles Cloudinary fetch failure safely when asset is missing or expired", async () => {
      clearScreenshotStoreForTesting();

      vi.spyOn(cloudinary.utils, "private_download_url").mockReturnValue("https://api.cloudinary.com/v1_1/workpulse-cloud/image/download?signed=1");
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(null, {
          status: 404,
          statusText: "Not Found",
        })
      );

      const retrieved = await getScreenshotImage(screenshotId);
      expect(retrieved).toBeNull();
    });
  });

  describe("6. Automatic 10-Minute Cadence & Tracker Session Lifecycle Guard", () => {
    it("exports 10-minute automated screenshot schedule constants (600s, 600,000ms)", async () => {
      const { SCREENSHOT_INTERVAL_SECONDS, SCREENSHOT_CAPTURE_INTERVAL_MS } = await import(
        "@/components/contracts/FreelancerTimeTrackerWidget"
      );
      expect(SCREENSHOT_INTERVAL_SECONDS).toBe(600);
      expect(SCREENSHOT_CAPTURE_INTERVAL_MS).toBe(600 * 1000);
    });

    it("rejects snapshot capture when contract is FIXED price instead of HOURLY", async () => {
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
        keystrokes: 30,
        mouseEvents: 30,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Snapshots can only be recorded for hourly contracts.");
      expect(prisma.timeScreenshot.create).not.toHaveBeenCalled();
    });

    it("rejects snapshot capture when session is PAUSED or COMPLETED", async () => {
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
        keystrokes: 10,
        mouseEvents: 10,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot record work snapshot while tracking is paused");
      expect(prisma.timeScreenshot.create).not.toHaveBeenCalled();
    });

    it("rejects snapshot capture if user is not the owning freelancer", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: thirdPartyId,
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

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 20,
        mouseEvents: 20,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized");
      expect(prisma.timeScreenshot.create).not.toHaveBeenCalled();
    });

    it("records valid hourly snapshot and links protected route when storage is configured", async () => {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.STORAGE_BUCKET = "workpulse-screenshots";
      process.env.STORAGE_ACCESS_KEY_ID = "mock-key";
      process.env.STORAGE_SECRET_ACCESS_KEY = "mock-secret";

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
        activityScore: 85,
      } as any);

      vi.mocked(prisma.timeScreenshot.update).mockResolvedValue({
        id: screenshotId,
        imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
      } as any);

      const res = await recordWorkSnapshotAction({
        timeEntryId,
        imageUrl: validSampleBase64,
        keystrokes: 50,
        mouseEvents: 50,
        memo: "Automatic 10-minute snapshot",
      });

      expect(res.success).toBe(true);
      expect(prisma.timeScreenshot.update).toHaveBeenCalledWith({
        where: { id: screenshotId },
        data: {
          imageUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
        },
      });
    });
  });
});

