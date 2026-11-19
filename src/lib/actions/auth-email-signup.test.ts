import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUser } from "./auth";
import { sendEmailVerificationOtpAction } from "./auth-recovery";
import { prisma } from "../prisma";
import * as emailModule from "../email";

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
  handlers: {},
}));

vi.mock("../prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    emailVerificationToken: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: any) =>
      cb({
        emailVerificationToken: {
          deleteMany: vi.fn(),
          create: vi.fn(),
        },
      })
    ),
  },
}));

vi.mock("../rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

vi.mock("../session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

describe("Signup Registration & Email OTP Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully registers client user and dispatches OTP email", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({
      id: "user_client_1",
      email: "client@example.com",
      name: "Test Client",
      role: "CLIENT",
      createdAt: new Date(),
    });

    const sendEmailSpy = vi
      .spyOn(emailModule, "sendEmailVerificationOtp")
      .mockResolvedValue({ success: true, messageId: "msg_123" });

    const result = await registerUser({
      name: "Test Client",
      email: "client@example.com",
      password: "Password123!",
      role: "CLIENT",
    });

    expect(result.success).toBe(true);
    expect(result.emailDelivered).toBe(true);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        recipientName: "Test Client",
        otp: expect.stringMatching(/^\d{6}$/),
      })
    );
  });

  it("handles duplicate email registration gracefully without creating duplicate record", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "existing_user_id",
      email: "existing@example.com",
    });

    const result = await registerUser({
      name: "Existing User",
      email: "existing@example.com",
      password: "Password123!",
      role: "FREELANCER",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("safely reports email delivery failure during signup without crashing user creation", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({
      id: "user_freelancer_1",
      email: "freelancer@example.com",
      name: "Test Freelancer",
      role: "FREELANCER",
      createdAt: new Date(),
    });

    vi.spyOn(emailModule, "sendEmailVerificationOtp").mockResolvedValue({
      success: false,
      error: "SMTP connection timeout",
    });

    const result = await registerUser({
      name: "Test Freelancer",
      email: "freelancer@example.com",
      password: "Password123!",
      role: "FREELANCER",
    });

    expect(result.success).toBe(true);
    expect(result.emailDelivered).toBe(false);
    expect(result.warning).toContain("SMTP connection timeout");
  });

  it("rejects invalid signup password or email formats", async () => {
    const result = await registerUser({
      name: "Invalid",
      email: "not-an-email",
      password: "short",
      role: "CLIENT",
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.password).toBeDefined();
  });

  it("returns explicit failure when resending OTP if email provider fails", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user_resend_1",
      email: "resend@example.com",
      name: "Resend User",
      emailVerified: null,
    });

    vi.spyOn(emailModule, "sendEmailVerificationOtp").mockResolvedValue({
      success: false,
      error: "Resend API key invalid",
    });

    const result = await sendEmailVerificationOtpAction({
      email: "resend@example.com",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Resend API key invalid");
  });

  it("successfully resends fresh OTP when email provider accepts send request", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user_resend_2",
      email: "resend2@example.com",
      name: "Resend User 2",
      emailVerified: null,
    });

    vi.spyOn(emailModule, "sendEmailVerificationOtp").mockResolvedValue({
      success: true,
      messageId: "resend_msg_456",
    });

    const result = await sendEmailVerificationOtpAction({
      email: "resend2@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("verification code has been sent");
  });
});
