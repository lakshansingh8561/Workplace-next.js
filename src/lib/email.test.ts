import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail, getEmailProviderStatus } from "./email";
import nodemailer from "nodemailer";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

describe("Email Service & Provider Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_FROM;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    process.env.LIVE_EMAIL_TEST = "true"; // Bypass test mode short-circuit
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("detects Resend provider when RESEND_API_KEY is configured", () => {
    process.env.RESEND_API_KEY = "re_test_123456";
    const status = getEmailProviderStatus();
    expect(status.provider).toBe("resend");
    expect(status.isConfigured).toBe(true);
  });

  it("detects SMTP provider when EMAIL_USER and EMAIL_PASS are configured", () => {
    process.env.EMAIL_USER = "test@gmail.com";
    process.env.EMAIL_PASS = "abcd efgh ijkl mnop";
    const status = getEmailProviderStatus();
    expect(status.provider).toBe("smtp");
    expect(status.isConfigured).toBe(true);
  });

  it("dispatches email via Resend API when RESEND_API_KEY is present", async () => {
    process.env.RESEND_API_KEY = "re_live_key";

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "resend_msg_789" }),
    } as any);

    const result = await sendEmail({
      to: "recipient@example.com",
      subject: "Test Resend",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("resend_msg_789");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_live_key",
        }),
      })
    );
  });

  it("handles Resend unverified domain error cleanly", async () => {
    process.env.RESEND_API_KEY = "re_live_key";

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "The domain example.com is not verified" }),
    } as any);

    const result = await sendEmail({
      to: "recipient@example.com",
      subject: "Test Domain Error",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Email domain is not verified");
  });

  it("dispatches email via Nodemailer SMTP with timeouts configured", async () => {
    process.env.EMAIL_USER = "user@gmail.com";
    process.env.EMAIL_PASS = "abcdefghijklmnop";

    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "smtp_msg_101" });
    (nodemailer.createTransport as any).mockReturnValue({
      sendMail: sendMailMock,
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test SMTP",
      html: "<p>OTP Code</p>",
      text: "OTP Code",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("smtp_msg_101");

    // Verify transporter was initialized with timeouts and port 587
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 587,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      })
    );
  });

  it("returns user-friendly guidance when Gmail SMTP authentication fails (535)", async () => {
    process.env.EMAIL_USER = "user@gmail.com";
    process.env.EMAIL_PASS = "wrongpassword";

    (nodemailer.createTransport as any).mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error("535-5.7.8 Username and Password not accepted")),
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test Auth Error",
      html: "<p>OTP</p>",
      text: "OTP",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Google App Password");
  });
});

