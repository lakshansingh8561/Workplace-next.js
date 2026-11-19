import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock NextAuth
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    emailVerificationToken: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => {
      if (typeof cb === "function") {
        return cb(mockPrisma);
      }
      return Promise.all(cb);
    }),
  };
  return { prisma: mockPrisma };
});

// Mock Session
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

// Mock Email Delivery
vi.mock("@/lib/email", () => ({
  sendEmailVerificationOtp: vi.fn().mockResolvedValue({ success: true, messageId: "msg_123" }),
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  getAppBaseUrl: vi.fn().mockReturnValue("https://workplace-next-js.vercel.app"),
}));

// Mock Rate Limiting
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 10 }),
  getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

// Mock Next.js cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { signIn, signOut } from "@/lib/auth";
import { registerUser, loginUser } from "@/lib/actions/auth";
import {
  sendEmailVerificationOtpAction,
  verifyEmailOtpAction,
  getUserVerificationStateAction,
} from "@/lib/actions/auth-recovery";
import bcrypt from "bcryptjs";

describe("WorkPulse Authentication & Email OTP Lifecycle Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Signup Flow", () => {
    it("successfully creates a new CLIENT account with hashed password and OTP", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: "user_client_1",
        email: "dikshu85@yopmail.com",
        name: "Dikshu Client",
        role: "CLIENT",
        createdAt: new Date(),
      });
      (prisma.emailVerificationToken.deleteMany as any).mockResolvedValue({ count: 0 });
      (prisma.emailVerificationToken.create as any).mockResolvedValue({ id: "token_1" });

      const result = await registerUser({
        name: "Dikshu Client",
        email: "dikshu85@yopmail.com",
        password: "Password123",
        role: "CLIENT",
      });

      expect(result.success).toBe(true);
      expect(result.emailDelivered).toBe(true);
      expect(result.role).toBe("CLIENT");
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "dikshu85@yopmail.com",
            role: "CLIENT",
          }),
        })
      );
    });

    it("successfully creates a new FREELANCER account", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: "user_freelancer_1",
        email: "alex.freelancer@yopmail.com",
        name: "Alex Dev",
        role: "FREELANCER",
        createdAt: new Date(),
      });
      (prisma.emailVerificationToken.deleteMany as any).mockResolvedValue({ count: 0 });
      (prisma.emailVerificationToken.create as any).mockResolvedValue({ id: "token_2" });

      const result = await registerUser({
        name: "Alex Dev",
        email: "alex.freelancer@yopmail.com",
        password: "Password123",
        role: "FREELANCER",
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe("FREELANCER");
    });

    it("rejects duplicate email signup for an already-verified user", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "existing_1",
        email: "dikshu85@yopmail.com",
        emailVerified: new Date(),
      });

      const result = await registerUser({
        name: "Another Name",
        email: "dikshu85@yopmail.com",
        password: "Password123",
        role: "CLIENT",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("handles slow email provider gracefully without hanging or failing registration", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: "user_client_slow",
        email: "slow.email@yopmail.com",
        name: "Slow Email",
        role: "CLIENT",
        createdAt: new Date(),
      });

      const emailMock = await import("@/lib/email");
      (emailMock.sendEmailVerificationOtp as any).mockResolvedValueOnce({
        success: false,
        error: "SMTP connection timed out",
      });

      const result = await registerUser({
        name: "Slow Email",
        email: "slow.email@yopmail.com",
        password: "Password123",
        role: "CLIENT",
      });

      // User account is safely created, user is informed that email failed delivery but can resend
      expect(result.success).toBe(true);
      expect(result.emailDelivered).toBe(false);
      expect(result.warning).toBeDefined();
    });
  });

  describe("2. Email OTP Dispatch & Cross-Account Isolation", () => {
    it("allows requesting an OTP for an unverified account when unauthenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "client_1",
        email: "dikshu85@yopmail.com",
        emailVerified: null,
        name: "Dikshu",
      });
      (prisma.emailVerificationToken.deleteMany as any).mockResolvedValue({ count: 1 });
      (prisma.emailVerificationToken.create as any).mockResolvedValue({ id: "tok_1" });

      const result = await sendEmailVerificationOtpAction({ email: "dikshu85@yopmail.com" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("verification code has been sent");
    });

    it("strictly blocks an authenticated user from requesting an OTP for another user's email", async () => {
      // Authenticated as User A (unverified)
      (getCurrentUser as any).mockResolvedValue({
        id: "user_a",
        email: "dikshu85@yopmail.com",
        role: "CLIENT",
      });
      (prisma.user.findUnique as any).mockImplementation(({ where }: any) => {
        if (where.id === "user_a") {
          return Promise.resolve({ id: "user_a", email: "dikshu85@yopmail.com", emailVerified: null });
        }
        return Promise.resolve(null);
      });

      // Attempting to request OTP for User B
      const result = await sendEmailVerificationOtpAction({ email: "target.victim@yopmail.com" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("You cannot request a verification code for another user's email address.");
    });

    it("auto-clears a stale leftover verified session when registering/verifying a new account", async () => {
      // Stale leftover session from an old verified account
      (getCurrentUser as any).mockResolvedValue({
        id: "old_verified_user",
        email: "old.verified@example.com",
        role: "CLIENT",
      });
      (prisma.user.findUnique as any).mockImplementation(({ where }: any) => {
        if (where.id === "old_verified_user") {
          return Promise.resolve({ id: "old_verified_user", email: "old.verified@example.com", emailVerified: new Date() });
        }
        if (where.email === "dikshu85@yopmail.com") {
          return Promise.resolve({ id: "new_client", email: "dikshu85@yopmail.com", emailVerified: null, name: "Dikshu" });
        }
        return Promise.resolve(null);
      });

      const result = await sendEmailVerificationOtpAction({ email: "dikshu85@yopmail.com" });

      // Stale session was signed out, new verification proceeded cleanly
      expect(signOut).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("3. Email OTP Verification", () => {
    it("successfully verifies valid 6-digit OTP and marks user verified in DB", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      const crypto = await import("crypto");
      const validOtp = "654321";
      const tokenHash = crypto.createHash("sha256").update(validOtp).digest("hex");

      (prisma.$transaction as any).mockImplementation(async (cb: any) => {
        const txMock = {
          emailVerificationToken: {
            findFirst: vi.fn().mockResolvedValue({
              email: "dikshu85@yopmail.com",
              tokenHash,
              expiresAt: new Date(Date.now() + 500000),
            }),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "client_1",
              email: "dikshu85@yopmail.com",
              emailVerified: null,
              role: "CLIENT",
            }),
            update: vi.fn().mockResolvedValue({
              id: "client_1",
              emailVerified: new Date(),
            }),
          },
        };
        return cb(txMock);
      });

      const result = await verifyEmailOtpAction({
        email: "dikshu85@yopmail.com",
        otp: "654321",
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe("CLIENT");
      expect(result.message).toContain("verified successfully");
    });

    it("rejects invalid OTP", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      (prisma.$transaction as any).mockImplementation(async (cb: any) => {
        const txMock = {
          emailVerificationToken: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return cb(txMock);
      });

      const result = await verifyEmailOtpAction({
        email: "dikshu85@yopmail.com",
        otp: "000000",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid verification code");
    });

    it("rejects expired OTP", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      const crypto = await import("crypto");
      const expiredOtp = "123456";
      const tokenHash = crypto.createHash("sha256").update(expiredOtp).digest("hex");

      (prisma.$transaction as any).mockImplementation(async (cb: any) => {
        const txMock = {
          emailVerificationToken: {
            findFirst: vi.fn().mockResolvedValue({
              email: "dikshu85@yopmail.com",
              tokenHash,
              expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
            }),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(txMock);
      });

      const result = await verifyEmailOtpAction({
        email: "dikshu85@yopmail.com",
        otp: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.error).toContain("expired");
    });
  });

  describe("4. Login & Account Switching Flow", () => {
    it("logs in a verified Client and directs to /dashboard/client", async () => {
      const passwordHash = await bcrypt.hash("Password123", 10);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "client_1",
        email: "dikshu85@yopmail.com",
        role: "CLIENT",
        roleSelected: true,
        emailVerified: new Date(),
        passwordHash,
      });

      const result = await loginUser({
        email: "dikshu85@yopmail.com",
        password: "Password123",
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe("CLIENT");
      expect(result.requiresVerification).toBe(false);
      expect(signIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({
          email: "dikshu85@yopmail.com",
        })
      );
    });

    it("flags unverified account login with requiresVerification: true", async () => {
      const passwordHash = await bcrypt.hash("Password123", 10);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "unverified_client",
        email: "unverified@yopmail.com",
        role: "CLIENT",
        roleSelected: true,
        emailVerified: null,
        passwordHash,
      });

      const result = await loginUser({
        email: "unverified@yopmail.com",
        password: "Password123",
      });

      expect(result.success).toBe(true);
      expect(result.requiresVerification).toBe(true);
      expect(result.email).toBe("unverified@yopmail.com");
    });

    it("rejects incorrect password", async () => {
      const passwordHash = await bcrypt.hash("CorrectPassword", 10);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "client_1",
        email: "dikshu85@yopmail.com",
        passwordHash,
      });

      const result = await loginUser({
        email: "dikshu85@yopmail.com",
        password: "WrongPassword",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid email or password");
    });
  });
});

