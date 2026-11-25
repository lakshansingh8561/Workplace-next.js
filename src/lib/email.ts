// src/lib/email.ts
/**
 * WorkPulse Clean Email Delivery Infrastructure
 *
 * Implements a lightweight, zero-dependency email service abstraction.
 * Supports:
 * 1. Resend API via native fetch (when RESEND_API_KEY is configured).
 * 2. Safe development/test simulation (when in dev/test environment).
 * 3. Fails closed in production if no email provider is configured.
 *
 * Never exposes raw tokens, API keys, or secrets in logs.
 */

import dns from "dns";
import nodemailer from "nodemailer";

// Prefer IPv4 DNS resolution order globally in Node.js to avoid IPv6 ETUNREACH on hosts without IPv6 routing (e.g., Render)
if (typeof dns.setDefaultResultOrder === "function") {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    // Ignore if unsupported in restricted runtime
  }
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  simulated?: boolean;
}

export interface EmailProviderStatus {
  provider: "smtp" | "resend" | "simulation";
  isConfigured: boolean;
  senderConfigured: boolean;
  presentVariables: string[];
  missingVariables: string[];
}

/**
 * Inspects environment variables to report email provider configuration safely
 * without exposing secret values or credentials.
 */
export function getEmailProviderStatus(): EmailProviderStatus {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;
  const smtpHost =
    process.env.SMTP_HOST ||
    (emailUser?.toLowerCase().includes("@gmail.com") ? "smtp.gmail.com" : undefined);

  const presentVariables: string[] = [];
  const missingVariables: string[] = [];

  if (resendApiKey) presentVariables.push("RESEND_API_KEY");
  else missingVariables.push("RESEND_API_KEY");

  if (emailUser) presentVariables.push(process.env.EMAIL_USER ? "EMAIL_USER" : "SMTP_USER");
  else missingVariables.push("EMAIL_USER / SMTP_USER");

  if (emailPass) {
    presentVariables.push(
      process.env.EMAIL_PASS
        ? "EMAIL_PASS"
        : process.env.SMTP_PASS
        ? "SMTP_PASS"
        : "SMTP_PASSWORD"
    );
  } else {
    missingVariables.push("EMAIL_PASS / SMTP_PASS / SMTP_PASSWORD");
  }

  if (emailFrom) presentVariables.push("EMAIL_FROM");
  else missingVariables.push("EMAIL_FROM");

  if (process.env.SMTP_HOST) presentVariables.push("SMTP_HOST");
  else if (emailUser?.toLowerCase().includes("@gmail.com")) presentVariables.push("SMTP_HOST (auto: smtp.gmail.com)");
  else missingVariables.push("SMTP_HOST");

  if (process.env.SMTP_PORT) presentVariables.push("SMTP_PORT");
  else missingVariables.push("SMTP_PORT");

  if (resendApiKey) {
    return {
      provider: "resend",
      isConfigured: true,
      senderConfigured: Boolean(emailFrom),
      presentVariables,
      missingVariables,
    };
  }

  if (emailUser && emailPass && smtpHost) {
    return {
      provider: "smtp",
      isConfigured: true,
      senderConfigured: Boolean(emailFrom || emailUser),
      presentVariables,
      missingVariables,
    };
  }

  return {
    provider: "simulation",
    isConfigured: false,
    senderConfigured: Boolean(emailFrom),
    presentVariables,
    missingVariables,
  };
}

/**
 * Resolves the application public base URL for links.
 */
export function getAppBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL;

  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

/**
 * Dispatches an email via the configured provider or safe local simulation.
 */
/**
 * Resolves a Resend-compatible sender address.
 * Never falls back to an unverified free webmail address (e.g. @gmail.com) for Resend.
 */
function resolveResendFromAddress(): string {
  const explicitResendFrom = process.env.RESEND_FROM?.trim();
  if (explicitResendFrom) {
    return explicitResendFrom.includes("<")
      ? explicitResendFrom
      : `WorkPulse <${explicitResendFrom}>`;
  }

  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (emailFrom && !/@(gmail|yahoo|outlook|hotmail)\./i.test(emailFrom)) {
    return emailFrom.includes("<") ? emailFrom : `WorkPulse <${emailFrom}>`;
  }

  return "WorkPulse <onboarding@resend.dev>";
}

/**
 * Determines whether an SMTP error is a network/routing/port connectivity failure
 * (where a Resend HTTPS fallback on port 443 can succeed).
 */
function isSmtpConnectivityError(errMsg: string): boolean {
  return /ETUNREACH|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|connection timeout|Greeting never received/i.test(
    errMsg
  );
}

/**
 * Dispatches an email via the Resend HTTP API over HTTPS (port 443).
 * Verifies the actual HTTP response and returned message ID.
 */
async function sendViaResend({
  apiKey,
  fromAddress,
  to,
  subject,
  html,
  text,
}: SendEmailOptions & { apiKey: string; fromAddress: string }): Promise<EmailDeliveryResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second fast timeout

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to.trim().toLowerCase()],
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        message?: string;
        name?: string;
      };
      const errorMsg = errorData.message || `HTTP ${response.status}`;
      console.error(
        `[WorkPulse Email Error] Resend API returned error (HTTP ${response.status}):`,
        errorMsg
      );

      let userMsg = `Resend email delivery failed: ${errorMsg}`;
      if (errorMsg.toLowerCase().includes("domain") && errorMsg.toLowerCase().includes("not verified")) {
        userMsg =
          "Email domain is not verified in Resend. Please set EMAIL_FROM to onboarding@resend.dev or verify your domain at resend.com.";
      } else if (response.status === 401 || response.status === 403) {
        userMsg = "Resend API key is invalid or unauthorized. Please verify RESEND_API_KEY.";
      }

      return {
        success: false,
        error: userMsg,
      };
    }

    const result = (await response.json()) as { id?: string };
    if (!result?.id) {
      return {
        success: false,
        error: "Resend API did not return a valid message ID.",
      };
    }

    return {
      success: true,
      messageId: result.id,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const errMsg = isAbort
      ? "Connection to Resend API timed out (5s limit)"
      : err instanceof Error
      ? err.message
      : "Network error";
    console.error(
      "[WorkPulse Email Error] Network exception connecting to Resend API:",
      errMsg
    );
    return {
      success: false,
      error: isAbort
        ? "Email provider request timed out. Please try again."
        : "Network error delivering email.",
    };
  }
}

/**
 * Dispatches an email via Nodemailer SMTP using IPv4-only socket resolution
 * to prevent IPv6 ETUNREACH failures on hosts without IPv6 routing (e.g. Render).
 */
async function sendViaSmtp({
  emailUser,
  emailPass,
  smtpHost,
  smtpPort,
  fromAddress,
  to,
  subject,
  html,
  text,
  connectionTimeoutMs,
}: SendEmailOptions & {
  emailUser: string;
  emailPass: string;
  smtpHost: string;
  smtpPort: number;
  fromAddress: string;
  connectionTimeoutMs: number;
}): Promise<{ result: EmailDeliveryResult; isConnectivityFailure: boolean }> {
  try {
    const cleanPass = emailPass.replace(/\s+/g, "");
    const isGmail =
      emailUser.toLowerCase().includes("@gmail.com") ||
      smtpHost.toLowerCase() === "smtp.gmail.com";

    const targetHost = isGmail ? "smtp.gmail.com" : smtpHost;
    const targetPort = smtpPort || 587;
    const isSecure = targetPort === 465;

    const transporter = nodemailer.createTransport({
      host: targetHost,
      port: targetPort,
      secure: isSecure,
      requireTLS: !isSecure,
      family: 4, // Force IPv4 to avoid IPv6 ETUNREACH on containers without IPv6 routing
      connectionTimeout: connectionTimeoutMs,
      greetingTimeout: connectionTimeoutMs,
      socketTimeout: 10000,
      auth: {
        user: emailUser.trim(),
        pass: cleanPass,
      },
      tls: {
        servername: targetHost,
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    } as nodemailer.TransportOptions);

    const info = await transporter.sendMail({
      from: fromAddress,
      to: to.trim().toLowerCase(),
      subject,
      text,
      html,
    });

    return {
      result: {
        success: true,
        messageId: info.messageId,
      },
      isConnectivityFailure: false,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "SMTP error";
    const connectivityFailure = isSmtpConnectivityError(errMsg);
    console.error("[WorkPulse Email Error] SMTP delivery exception:", errMsg);

    let userFriendlyError = `SMTP email delivery failed: ${errMsg}`;
    if (
      errMsg.includes("535") ||
      errMsg.includes("Username and Password not accepted") ||
      errMsg.includes("Invalid login") ||
      errMsg.includes("BadCredentials")
    ) {
      userFriendlyError =
        "Email authentication failed. If using Gmail, please ensure EMAIL_PASS is a 16-character Google App Password (not your personal Google account password).";
    } else if (
      errMsg.includes("ETIMEDOUT") ||
      errMsg.includes("ESOCKETTIMEDOUT") ||
      errMsg.includes("connection timeout") ||
      errMsg.includes("Greeting never received")
    ) {
      userFriendlyError =
        "Connection to SMTP server timed out. Cloud hosting may restrict direct SMTP ports; please configure RESEND_API_KEY for HTTPS (port 443) delivery.";
    } else if (errMsg.includes("ETUNREACH") || errMsg.includes("ENETUNREACH")) {
      userFriendlyError =
        "SMTP network unreachable from host. Please configure RESEND_API_KEY in Render environment variables for HTTPS email delivery.";
    } else if (errMsg.includes("ECONNREFUSED")) {
      userFriendlyError =
        "Connection refused by SMTP server. Please verify SMTP_HOST and SMTP_PORT.";
    }

    return {
      result: {
        success: false,
        error: userFriendlyError,
      },
      isConnectivityFailure: connectivityFailure,
    };
  }
}

/**
 * Dispatches an email via the configured provider or safe local simulation.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailOptions): Promise<EmailDeliveryResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const smtpHost =
    process.env.SMTP_HOST ||
    (emailUser?.toLowerCase().includes("@gmail.com") ? "smtp.gmail.com" : undefined);
  const smtpPort = process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT, 10)
    : 587; // Default to port 587 (STARTTLS) which is universally permitted on cloud hosts
  const rawFrom = process.env.EMAIL_FROM || emailUser;
  const smtpFromAddress = rawFrom
    ? rawFrom.includes("<")
      ? rawFrom
      : `WorkPulse <${rawFrom}>`
    : "WorkPulse <noreply@workpulse.internal>";

  // Automated test mode bypass (unless explicitly running live verification)
  if (process.env.NODE_ENV === "test" && process.env.LIVE_EMAIL_TEST !== "true") {
    return {
      success: true,
      simulated: true,
      messageId: `test_msg_${Date.now()}`,
    };
  }

  const hasSmtp = Boolean(emailUser && emailPass && smtpHost);
  const isRender = Boolean(
    process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID
  );

  // 1. If SMTP is configured, try IPv4 SMTP first (preserves Vercel Gmail SMTP path).
  //    On Render when RESEND_API_KEY is also configured, use a 3.5s connect timeout so a
  //    blocked SMTP port falls back to Resend HTTPS (port 443) well within the 9s action budget.
  if (hasSmtp && emailUser && emailPass && smtpHost) {
    const smtpAttempt = await sendViaSmtp({
      emailUser,
      emailPass,
      smtpHost,
      smtpPort,
      fromAddress: smtpFromAddress,
      to,
      subject,
      html,
      text,
      connectionTimeoutMs: isRender && resendApiKey ? 3500 : 8000,
    });

    if (smtpAttempt.result.success) {
      return smtpAttempt.result;
    }

    // If SMTP failed due to network/port reachability AND Resend is configured, fall back to Resend HTTPS (port 443)
    if (smtpAttempt.isConnectivityFailure && resendApiKey) {
      console.warn(
        "[WorkPulse Email Fallback] SMTP connectivity failed; falling back to Resend HTTPS API (port 443)."
      );
      return sendViaResend({
        apiKey: resendApiKey,
        fromAddress: resolveResendFromAddress(),
        to,
        subject,
        html,
        text,
      });
    }

    return smtpAttempt.result;
  }

  // 2. Resend API (HTTP POST over port 443) when SMTP is not configured
  if (resendApiKey) {
    return sendViaResend({
      apiKey: resendApiKey,
      fromAddress: resolveResendFromAddress(),
      to,
      subject,
      html,
      text,
    });
  }

  // 3. Production fail-safe: Never pretend emails were sent if unconfigured in production
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[WorkPulse Email Error] No email provider configured in production environment (Neither RESEND_API_KEY nor SMTP credentials EMAIL_USER/EMAIL_PASS are configured on Vercel or Render)."
    );
    return {
      success: false,
      error:
        "Email delivery service is unconfigured in production. Please configure EMAIL_USER and EMAIL_PASS (or RESEND_API_KEY) in Vercel / Render environment variables.",
    };
  }

  // 4. Safe development simulation when no provider credentials exist
  console.log(
    `[WorkPulse Email Dev] Simulated email dispatch to ${to} | Subject: "${subject}"`
  );

  return {
    success: true,
    simulated: true,
    messageId: `dev_msg_${Date.now()}`,
  };
}

/**
 * Sends a password reset email with secure one-time link.
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  recipientName,
}: {
  to: string;
  resetUrl: string;
  recipientName?: string | null;
}): Promise<EmailDeliveryResult> {
  const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";

  const subject = "Reset your WorkPulse password";

  const text = `${greeting}

We received a request to reset your password for your WorkPulse account.

Please visit the following secure link to set a new password:
${resetUrl}

This link is valid for 30 minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your existing password will remain unchanged.

Best regards,
The WorkPulse Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="520" border="0" cellspacing="0" cellpadding="0" style="background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px;">
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #27272a;">
              <span style="display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; background-color: #059669; color: #ffffff; font-weight: bold; border-radius: 8px; font-size: 18px;">W</span>
              <span style="font-size: 18px; font-weight: 700; color: #ffffff; margin-left: 10px; vertical-align: middle;">WorkPulse</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px;">
              <h2 style="color: #ffffff; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">Password Reset Request</h2>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 22px; margin-top: 0; margin-bottom: 24px;">${greeting}</p>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 22px; margin-top: 0; margin-bottom: 24px;">We received a request to reset your password for your WorkPulse account. Click the button below to choose a new password.</p>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${resetUrl}" style="background-color: #059669; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">Reset Password</a>
              </div>
              <p style="color: #71717a; font-size: 12px; line-height: 18px; margin-top: 24px; margin-bottom: 8px;">This link will expire in <strong>30 minutes</strong> and can only be used once.</p>
              <p style="color: #71717a; font-size: 12px; line-height: 18px; margin: 0;">If you didn't request a password reset, you can safely ignore this email. Your account remains secure.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 28px; border-top: 1px solid #27272a; margin-top: 28px;">
              <p style="color: #52525b; font-size: 11px; margin: 0; line-height: 16px;">If the button does not work, copy and paste this URL into your browser:<br><span style="color: #10b981; word-break: break-all;">${resetUrl}</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Sends an email address verification email with secure one-time link.
 */
export async function sendVerificationEmail({
  to,
  verifyUrl,
  recipientName,
}: {
  to: string;
  verifyUrl: string;
  recipientName?: string | null;
}): Promise<EmailDeliveryResult> {
  const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";

  const subject = "Verify your WorkPulse email address";

  const text = `${greeting}

Welcome to WorkPulse! Please verify your email address to confirm your account.

Visit the following link to complete verification:
${verifyUrl}

This link is valid for 24 hours and can only be used once.

If you did not sign up for a WorkPulse account, please disregard this email.

Best regards,
The WorkPulse Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify Your Email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="520" border="0" cellspacing="0" cellpadding="0" style="background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px;">
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #27272a;">
              <span style="display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; background-color: #059669; color: #ffffff; font-weight: bold; border-radius: 8px; font-size: 18px;">W</span>
              <span style="font-size: 18px; font-weight: 700; color: #ffffff; margin-left: 10px; vertical-align: middle;">WorkPulse</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px;">
              <h2 style="color: #ffffff; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">Confirm your email address</h2>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 22px; margin-top: 0; margin-bottom: 24px;">${greeting}</p>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 22px; margin-top: 0; margin-bottom: 24px;">Thanks for signing up for WorkPulse! Please confirm your email address by clicking the button below.</p>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${verifyUrl}" style="background-color: #059669; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">Verify Email Address</a>
              </div>
              <p style="color: #71717a; font-size: 12px; line-height: 18px; margin-top: 24px; margin-bottom: 8px;">This link will expire in <strong>24 hours</strong> and can only be used once.</p>
              <p style="color: #71717a; font-size: 12px; line-height: 18px; margin: 0;">If you didn't create a WorkPulse account, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 28px; border-top: 1px solid #27272a; margin-top: 28px;">
              <p style="color: #52525b; font-size: 11px; margin: 0; line-height: 16px;">If the button does not work, copy and paste this URL into your browser:<br><span style="color: #10b981; word-break: break-all;">${verifyUrl}</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Sends a 6-digit email verification OTP with 10-minute expiration.
 */
export async function sendEmailVerificationOtp({
  to,
  otp,
  recipientName,
}: {
  to: string;
  otp: string;
  recipientName?: string | null;
}): Promise<EmailDeliveryResult> {
  const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";

  if (process.env.NODE_ENV !== "production") {
    console.log("\n" + "=".repeat(60));
    console.log(`[WorkPulse Email OTP] 📩 Verification Code for ${to}:`);
    console.log(`                 👉  ${otp}  👈`);
    console.log("=".repeat(60) + "\n");
  }

  const subject = `${otp} is your WorkPulse verification code`;

  const text = `${greeting}

Your WorkPulse verification code is: ${otp}

Enter this 6-digit code to complete your email verification and access all marketplace features.

This code will expire in 10 minutes and can only be used once.

If you did not request this verification code, please disregard this email. Your account remains secure.

Best regards,
The WorkPulse Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="520" border="0" cellspacing="0" cellpadding="0" style="background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px;">
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #27272a;">
              <span style="display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; background-color: #059669; color: #ffffff; font-weight: bold; border-radius: 8px; font-size: 18px;">W</span>
              <span style="font-size: 18px; font-weight: 700; color: #ffffff; margin-left: 10px; vertical-align: middle;">WorkPulse</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px;">
              <h2 style="color: #ffffff; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">Confirm your email address</h2>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 22px; margin-top: 0; margin-bottom: 20px;">${greeting}</p>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 22px; margin-top: 0; margin-bottom: 24px;">Enter the following 6-digit verification code to verify your WorkPulse account and activate proposal submissions, hiring, and messaging:</p>
              <div style="margin: 28px 0; text-align: center;">
                <div style="display: inline-block; background-color: #27272a; border: 2px solid #059669; border-radius: 12px; padding: 14px 28px;">
                  <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #10b981;">${otp}</span>
                </div>
              </div>
              <p style="color: #71717a; font-size: 12px; line-height: 18px; margin-top: 24px; margin-bottom: 8px;">This code will expire in <strong>10 minutes</strong> and can only be used once.</p>
              <p style="color: #71717a; font-size: 12px; line-height: 18px; margin: 0;">If you didn't create a WorkPulse account, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
 </body>
</html>`;

  return sendEmail({ to, subject, html, text });
}
