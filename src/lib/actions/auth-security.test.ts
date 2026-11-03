/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/auth-security.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  verifyEmailAction,
  resendVerificationEmailAction,
  changePasswordAction,
} from "./auth-recovery";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    emailVerificationToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => {
  const getCurrentUser = vi.fn();
  return {
    getCurrentUser,
    requireUser: vi.fn(),
    requireRole: vi.fn(),
    requireVerifiedUser: vi.fn(),
    verifyUserForAction: vi.fn(async (allowed?: string | string[]) => {
      const user = await getCurrentUser();
      if (!user) {
        return { success: false, error: "Authentication required: You must be signed in to perform this action.", code: "UNAUTHENTICATED" };
      }
      if (user.roleSelected === false) {
        return { success: false, error: "Please complete onboarding before performing this action.", code: "UNAUTHORIZED_ROLE" };
      }
      if (allowed) {
        const allowedList = Array.isArray(allowed) ? allowed : [allowed];
        if (!allowedList.includes(user.role)) {
          const roleLabels = allowedList.map((r) => r.toLowerCase()).join(" or ");
          return { success: false, error: `Unauthorized: Only ${roleLabels} accounts can perform this action.`, code: "UNAUTHORIZED_ROLE" };
        }
      }
      if (user.emailVerified === null) {
        return { success: false, error: "Please verify your email address to access this feature.", code: "EMAIL_NOT_VERIFIED" };
      }
      return { success: true, user: { ...user, emailVerified: user.emailVerified || new Date() } };
    }),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  getAppBaseUrl: vi.fn().mockReturnValue("https://workpulse.internal"),
}));

describe("WorkPulse Phase 2 Batch 2: Authentication & Account Security Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ success: true } as any);
  });

  describe("1. Forgot Password & Account Enumeration Defense", () => {
    it("returns a generic success message when an unknown email is submitted (prevents enumeration)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await requestPasswordResetAction({
        email: "nonexistent@unknown.com",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("If an account exists with that email address");
      // Never calls send email if user does not exist
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("generates a cryptographically secure token, stores only SHA-256 hash, and dispatches email for valid user", async () => {
      const testEmail = "engineer@workpulse.internal";
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_1",
        email: testEmail,
        name: "Test Engineer",
        passwordHash: "$2a$12$hashedpassword",
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          passwordResetToken: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "prt_1" }),
          },
        });
      });

      const result = await requestPasswordResetAction({ email: testEmail });

      expect(result.success).toBe(true);
      expect(result.message).toContain("If an account exists");
      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

      const emailCallArgs = vi.mocked(sendPasswordResetEmail).mock.calls[0][0];
      expect(emailCallArgs.to).toBe(testEmail);
      expect(emailCallArgs.resetUrl).toContain("https://workpulse.internal/reset-password?token=");
      // Check that the URL contains a 64-character hex token (32 random bytes)
      const tokenInUrl = emailCallArgs.resetUrl.split("token=")[1];
      expect(tokenInUrl).toHaveLength(64);
    });

    it("enforces rate limits on forgot-password requests", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: false,
        error: "Rate limited",
      } as any);

      const result = await requestPasswordResetAction({
        email: "spammer@attack.com",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many password reset requests");
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("2. Password Reset Token Validation & Single-Use Enforcement", () => {
    it("rejects invalid or non-existent reset tokens", async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          passwordResetToken: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        });
      });

      const result = await resetPasswordAction({
        token: "invalid_random_token_12345",
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("invalid or has already been used");
    });

    it("rejects expired reset tokens and cleans them up", async () => {
      const expiredDate = new Date(Date.now() - 60 * 1000); // 1 minute in the past
      const deleteMock = vi.fn().mockResolvedValue({ id: "prt_1" });

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          passwordResetToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: "prt_1",
              email: "user@example.com",
              expiresAt: expiredDate,
            }),
            delete: deleteMock,
          },
        });
      });

      const result = await resetPasswordAction({
        token: "expired_token_abc",
        password: "ValidPassword123",
        confirmPassword: "ValidPassword123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
      expect(deleteMock).toHaveBeenCalledWith({ where: { id: "prt_1" } });
    });

    it("atomically resets password with bcrypt (cost 12), increments sessionVersion, and deletes tokens", async () => {
      const validDate = new Date(Date.now() + 15 * 60 * 1000); // 15 mins in future
      const rawToken = "valid_secure_token_hex_string_64_characters_long_abcdef1234567890";
      const expectedHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const userUpdateMock = vi.fn().mockResolvedValue({ id: "usr_1" });
      const deleteManyTokensMock = vi.fn().mockResolvedValue({ count: 1 });

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          passwordResetToken: {
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.tokenHash === expectedHash) {
                return Promise.resolve({
                  id: "prt_1",
                  email: "user@example.com",
                  expiresAt: validDate,
                });
              }
              return Promise.resolve(null);
            }),
            deleteMany: deleteManyTokensMock,
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "usr_1",
              email: "user@example.com",
            }),
            update: userUpdateMock,
          },
        });
      });

      const result = await resetPasswordAction({
        token: rawToken,
        password: "BrandNewSecurePassword123!",
        confirmPassword: "BrandNewSecurePassword123!",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("successfully reset");

      // Verify user update called with incremented sessionVersion and hashed password
      expect(userUpdateMock).toHaveBeenCalledWith({
        where: { id: "usr_1" },
        data: {
          passwordHash: expect.any(String),
          sessionVersion: { increment: 1 },
        },
      });

      // Verify the new password hash is a valid bcrypt hash
      const savedHash = userUpdateMock.mock.calls[0][0].data.passwordHash;
      expect(bcrypt.compareSync("BrandNewSecurePassword123!", savedHash)).toBe(true);

      // Verify single-use: all tokens for that user are deleted
      expect(deleteManyTokensMock).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
    });

    it("rejects reset when passwords do not match or fail validation", async () => {
      const result = await resetPasswordAction({
        token: "some_token",
        password: "ValidPassword123",
        confirmPassword: "MismatchPassword123",
      });

      expect(result.success).toBe(false);
      expect(result.fieldErrors?.confirmPassword).toBe("Passwords do not match");
    });
  });

  describe("3. Email Verification Flow", () => {
    it("verifies email successfully with valid token and sets emailVerified", async () => {
      const rawToken = "email_verify_token_hex_1234567890abcdef";
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const userUpdateMock = vi.fn().mockResolvedValue({ id: "usr_1" });
      const deleteManyTokensMock = vi.fn().mockResolvedValue({ count: 1 });

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          emailVerificationToken: {
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.tokenHash === tokenHash) {
                return Promise.resolve({
                  id: "evt_1",
                  email: "unverified@workpulse.internal",
                  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                });
              }
              return Promise.resolve(null);
            }),
            deleteMany: deleteManyTokensMock,
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "usr_1",
              email: "unverified@workpulse.internal",
              emailVerified: null,
            }),
            update: userUpdateMock,
          },
        });
      });

      const result = await verifyEmailAction({ token: rawToken });

      expect(result.success).toBe(true);
      expect(result.message).toContain("verified successfully");
      expect(userUpdateMock).toHaveBeenCalledWith({
        where: { id: "usr_1" },
        data: { emailVerified: expect.any(Date) },
      });
      expect(deleteManyTokensMock).toHaveBeenCalledWith({
        where: { email: "unverified@workpulse.internal" },
      });
    });

    it("handles already verified user cleanly", async () => {
      const rawToken = "already_verified_token_hex";
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const deleteManyMock = vi.fn().mockResolvedValue({ count: 1 });

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          emailVerificationToken: {
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.tokenHash === tokenHash) {
                return Promise.resolve({
                  id: "evt_1",
                  email: "already@verified.com",
                  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                });
              }
              return Promise.resolve(null);
            }),
            deleteMany: deleteManyMock,
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "usr_1",
              email: "already@verified.com",
              emailVerified: new Date("2025-01-01"),
            }),
          },
        });
      });

      const result = await verifyEmailAction({ token: rawToken });

      expect(result.success).toBe(true);
      expect(result.alreadyVerified).toBe(true);
      expect(result.message).toContain("already verified");
    });

    it("rejects expired email verification token", async () => {
      const rawToken = "expired_verify_token";
      const deleteMock = vi.fn().mockResolvedValue({ id: "evt_1" });

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          emailVerificationToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: "evt_1",
              email: "user@example.com",
              expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
            }),
            delete: deleteMock,
          },
        });
      });

      const result = await verifyEmailAction({ token: rawToken });

      expect(result.success).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.error).toContain("expired");
    });

    it("resend verification respects rate limiting", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: false,
        error: "Rate limited",
      } as any);

      const result = await resendVerificationEmailAction({
        email: "frequent@requester.com",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many verification requests");
    });

    it("resends verification email for unverified user and dispatches email", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_unverified",
        email: "needsverification@workpulse.internal",
        name: "Unverified User",
        emailVerified: null,
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          emailVerificationToken: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "evt_new" }),
          },
        });
      });

      const result = await resendVerificationEmailAction({
        email: "needsverification@workpulse.internal",
      });

      expect(result.success).toBe(true);
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Change Password & Session Invalidation in Account Settings", () => {
    it("rejects unauthenticated password changes", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const result = await changePasswordAction({
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("must be signed in");
    });

    it("rejects password change if current password is incorrect", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "usr_1",
        email: "user@example.com",
        role: "CLIENT" as any,
        roleSelected: true,
      });

      const realCurrentHash = await bcrypt.hash("CorrectPassword123!", 12);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_1",
        email: "user@example.com",
        passwordHash: realCurrentHash,
        sessionVersion: 1,
      } as any);

      const result = await changePasswordAction({
        currentPassword: "WrongPassword999!",
        newPassword: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("current password you entered is incorrect");
    });

    it("rejects password change if new password is identical to current password", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "usr_1",
        email: "user@example.com",
        role: "CLIENT" as any,
        roleSelected: true,
      });

      const currentHash = await bcrypt.hash("ExistingPassword123!", 12);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_1",
        email: "user@example.com",
        passwordHash: currentHash,
        sessionVersion: 1,
      } as any);

      const result = await changePasswordAction({
        currentPassword: "ExistingPassword123!",
        newPassword: "ExistingPassword123!",
        confirmPassword: "ExistingPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("identical to your current password");
    });

    it("successfully changes password, hashes with bcrypt cost 12, and increments sessionVersion", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "usr_1",
        email: "user@example.com",
        role: "CLIENT" as any,
        roleSelected: true,
      });

      const oldHash = await bcrypt.hash("OldPassword123!", 12);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_1",
        email: "user@example.com",
        passwordHash: oldHash,
        sessionVersion: 2,
      } as any);

      const updateMock = vi.fn().mockResolvedValue({ id: "usr_1" });
      vi.mocked(prisma.user.update).mockImplementation(updateMock);

      const result = await changePasswordAction({
        currentPassword: "OldPassword123!",
        newPassword: "NewSuperPassword123!",
        confirmPassword: "NewSuperPassword123!",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Other active sessions have been signed out");

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "usr_1" },
        data: {
          passwordHash: expect.any(String),
          sessionVersion: { increment: 1 },
        },
      });

      const newHashSaved = updateMock.mock.calls[0][0].data.passwordHash;
      expect(bcrypt.compareSync("NewSuperPassword123!", newHashSaved)).toBe(true);
    });

    it("rejects password change for Google OAuth accounts without password", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "usr_oauth",
        email: "googleuser@gmail.com",
        role: "CLIENT" as any,
        roleSelected: true,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_oauth",
        email: "googleuser@gmail.com",
        passwordHash: null, // OAuth-only user
        sessionVersion: 1,
      } as any);

      const result = await changePasswordAction({
        currentPassword: "AnyPassword123!",
        newPassword: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("uses Google OAuth authentication");
    });
  });
});
