/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  sendEmailVerificationOtpAction,
  verifyEmailOtpAction,
} from "./auth-recovery";
import * as emailModule from "@/lib/email";
import * as rateLimitModule from "@/lib/rate-limit";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailVerificationToken: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((callback: any) => {
      const tx = {
        user: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        emailVerificationToken: {
          findFirst: vi.fn(),
          delete: vi.fn(),
          deleteMany: vi.fn(),
          create: vi.fn(),
        },
      };
      return callback(tx);
    }),
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmailVerificationOtp: vi.fn().mockResolvedValue({ success: true, messageId: "msg_123" }),
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  getAppBaseUrl: vi.fn().mockReturnValue("http://localhost:3000"),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
  requireUser: vi.fn(),
  requireRole: vi.fn(),
  requireVerifiedUser: vi.fn(),
  verifyUserForAction: vi.fn(),
}));

describe("Email OTP Verification Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendEmailVerificationOtpAction", () => {
    it("should reject invalid email inputs", async () => {
      const result = await sendEmailVerificationOtpAction({ email: "invalid-email" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("valid email");
    });

    it("should reject when rate limited", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValueOnce({
        success: false,
        limit: 5,
        remaining: 0,
        resetAt: Date.now() + 60000,
      });

      const result = await sendEmailVerificationOtpAction({ email: "test@example.com" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many verification requests");
    });

    it("should enforce cooldown limit of 60 seconds", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit")
        .mockResolvedValueOnce({ success: true, limit: 5, remaining: 4, resetAt: Date.now() })
        .mockResolvedValueOnce({ success: false, limit: 1, remaining: 0, resetAt: Date.now() });

      const result = await sendEmailVerificationOtpAction({ email: "test@example.com" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("wait 60 seconds");
    });

    it("should report already verified if user is already verified", async () => {
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: "user-123",
        email: "verified@example.com",
        name: "Verified User",
        emailVerified: new Date(),
      });

      const result = await sendEmailVerificationOtpAction({ email: "verified@example.com" });
      expect(result.success).toBe(true);
      expect(result.alreadyVerified).toBe(true);
    });

    it("should generate 6-digit OTP, store SHA-256 hash, and send email", async () => {
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: "user-456",
        email: "unverified@example.com",
        name: "Unverified User",
        emailVerified: null,
      });

      let createdData: any = null;
      (prisma.$transaction as any).mockImplementationOnce(async (callback: any) => {
        const tx = {
          emailVerificationToken: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdData = args.data;
              return { id: "tok-1", ...args.data };
            }),
          },
        };
        return callback(tx);
      });

      const result = await sendEmailVerificationOtpAction({ email: "unverified@example.com" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("6-digit verification code");
      expect(createdData).not.toBeNull();
      expect(createdData.email).toBe("unverified@example.com");
      expect(createdData.tokenHash).toHaveLength(64); // SHA-256 hex length
      expect(emailModule.sendEmailVerificationOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "unverified@example.com",
          recipientName: "Unverified User",
          otp: expect.stringMatching(/^\d{6}$/),
        })
      );
    });
  });

  describe("verifyEmailOtpAction", () => {
    it("should reject non-6-digit OTP codes", async () => {
      const res1 = await verifyEmailOtpAction({ email: "test@example.com", otp: "123" });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain("6 digits");

      const res2 = await verifyEmailOtpAction({ email: "test@example.com", otp: "abcdef" });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("6 digits");
    });

    it("should reject when verification rate limit is exceeded", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValueOnce({
        success: false,
        limit: 10,
        remaining: 0,
        resetAt: Date.now() + 60000,
      });

      const result = await verifyEmailOtpAction({ email: "test@example.com", otp: "123456" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many verification attempts");
    });

    it("should reject invalid OTP code when token hash does not match", async () => {
      (prisma.$transaction as any).mockImplementationOnce(async (callback: any) => {
        const tx = {
          emailVerificationToken: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      });

      const result = await verifyEmailOtpAction({ email: "test@example.com", otp: "999999" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid verification code");
    });

    it("should reject expired OTP code and clean it up", async () => {
      let deletedTokenId: string | null = null;
      (prisma.$transaction as any).mockImplementationOnce(async (callback: any) => {
        const tx = {
          emailVerificationToken: {
            findFirst: vi.fn().mockResolvedValue({
              id: "tok-expired",
              email: "test@example.com",
              expiresAt: new Date(Date.now() - 1000), // expired 1s ago
            }),
            delete: vi.fn().mockImplementation((args: any) => {
              deletedTokenId = args.where.id;
              return {};
            }),
          },
        };
        return callback(tx);
      });

      const result = await verifyEmailOtpAction({ email: "test@example.com", otp: "123456" });
      expect(result.success).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.error).toContain("expired");
      expect(deletedTokenId).toBe("tok-expired");
    });

    it("should mark user emailVerified, invalidate tokens, and return success on valid OTP", async () => {
      const otp = "654321";
      const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");

      let updatedUser: any = null;
      let deletedTokensForEmail: string | null = null;

      (prisma.$transaction as any).mockImplementationOnce(async (callback: any) => {
        const tx = {
          emailVerificationToken: {
            findFirst: vi.fn().mockResolvedValue({
              id: "tok-valid",
              email: "test@example.com",
              tokenHash,
              expiresAt: new Date(Date.now() + 500000), // 5 min in future
            }),
            deleteMany: vi.fn().mockImplementation((args: any) => {
              deletedTokensForEmail = args.where.email;
              return { count: 1 };
            }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "user-target",
              email: "test@example.com",
              emailVerified: null,
            }),
            update: vi.fn().mockImplementation((args: any) => {
              updatedUser = args;
              return { id: "user-target", emailVerified: args.data.emailVerified };
            }),
          },
        };
        return callback(tx);
      });

      const result = await verifyEmailOtpAction({ email: "test@example.com", otp });

      expect(result.success).toBe(true);
      expect(result.message).toContain("verified successfully");
      expect(updatedUser).not.toBeNull();
      expect(updatedUser.where.id).toBe("user-target");
      expect(updatedUser.data.emailVerified).toBeInstanceOf(Date);
      expect(deletedTokensForEmail).toBe("test@example.com");
    });
  });
});
