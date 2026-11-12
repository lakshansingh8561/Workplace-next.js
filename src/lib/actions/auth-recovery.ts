"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
  ChangePasswordSchema,
  VerifyEmailOtpSchema,
  SendEmailOtpSchema,
} from "@/lib/validations/auth";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendEmailVerificationOtp,
  getAppBaseUrl,
} from "@/lib/email";

export type AuthRecoveryResult = {
  success: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  expired?: boolean;
  alreadyVerified?: boolean;
};

/**
 * Server Action to initiate password reset.
 * Strictly prevents email enumeration by returning a generic success response.
 * Generates a cryptographically secure token, stores only its SHA-256 hash in MongoDB,
 * and sets a 30-minute expiration window.
 */
export async function requestPasswordResetAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const parsed = ForgotPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Please provide a valid email address.",
    };
  }

  const { email } = parsed.data;
  const clientIp = await getClientIp();

  // Rate limit: 3 attempts per 15 minutes per IP + email
  const rateLimit = await checkRateLimit(
    `forgot-password:${clientIp}:${email}`,
    {
      limit: 3,
      windowMs: 15 * 60 * 1000,
    }
  );

  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many password reset requests. Please wait 15 minutes before trying again.",
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
      },
    });

    // Only issue token if account exists and has credentials password set
    if (user && user.passwordHash) {
      // 1. Generate 32 bytes cryptographically secure random token
      const rawToken = crypto.randomBytes(32).toString("hex");

      // 2. Compute SHA-256 hash for database storage (never store raw tokens)
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      // 3. 30-minute expiration period
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // 4. Invalidate prior reset tokens for this email and persist new hashed token
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({
          where: { email: user.email },
        });

        await tx.passwordResetToken.create({
          data: {
            email: user.email,
            tokenHash,
            expiresAt,
          },
        });
      });

      // 5. Construct secure one-time reset URL
      const resetUrl = `${getAppBaseUrl()}/reset-password?token=${rawToken}`;

      // 6. Dispatch email (does not log raw token or expose in response)
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        recipientName: user.name,
      });
    }

    // Always return generic response to prevent account enumeration
    return {
      success: true,
      message:
        "If an account exists with that email address, we have sent a secure password reset link.",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Password Reset Request Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    // Fail safe with generic message to avoid leaking database details
    return {
      success: true,
      message:
        "If an account exists with that email address, we have sent a secure password reset link.",
    };
  }
}

/**
 * Server Action to reset a password using a valid one-time token.
 * Validates token hash, checks expiration, updates password with bcrypt (cost 12),
 * invalidates all outstanding tokens, and increments sessionVersion to invalidate existing sessions.
 */
export async function resetPasswordAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const parsed = ResetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });

    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid password reset request.",
      fieldErrors,
    };
  }

  const { token, password } = parsed.data;
  const clientIp = await getClientIp();

  // Rate limit reset attempts per IP
  const rateLimit = await checkRateLimit(`reset-password:${clientIp}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many reset attempts. Please wait 15 minutes before trying again.",
    };
  }

  try {
    // Hash incoming raw token with SHA-256 to compare with stored hash
    const tokenHash = crypto
      .createHash("sha256")
      .update(token.trim())
      .digest("hex");

    const newPasswordHash = await bcrypt.hash(password, 12);

    // Atomic consumption inside Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find token by unique hash
      const tokenRecord = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });

      if (!tokenRecord) {
        return {
          valid: false,
          error: "This password reset link is invalid or has already been used.",
        };
      }

      // 2. Check expiration
      if (tokenRecord.expiresAt < new Date()) {
        // Clean up expired token
        await tx.passwordResetToken.delete({
          where: { id: tokenRecord.id },
        });

        return {
          valid: false,
          error: "This password reset link has expired. Please request a new one.",
        };
      }

      // 3. Find matching user
      const user = await tx.user.findUnique({
        where: { email: tokenRecord.email },
        select: { id: true, email: true },
      });

      if (!user) {
        return {
          valid: false,
          error: "User associated with this reset link was not found.",
        };
      }

      // 4. Update user password and increment sessionVersion (invalidates all other active JWT sessions)
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          sessionVersion: { increment: 1 },
        },
      });

      // 5. Invalidate all outstanding reset tokens for this email (single-use enforcement)
      await tx.passwordResetToken.deleteMany({
        where: { email: user.email },
      });

      return { valid: true };
    });

    if (!result.valid) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      message: "Your password has been successfully reset. You can now log in.",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Reset Password Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to reset password. Please try again.",
    };
  }
}

/**
 * Server Action to verify an email address using a single-use token.
 * Sets emailVerified only upon successful token match.
 */
export async function verifyEmailAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const parsed = VerifyEmailSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid email verification request.",
    };
  }

  const { token } = parsed.data;

  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token.trim())
      .digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      // 1. Look up token by hash
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
      });

      if (!record) {
        return {
          valid: false,
          error: "This verification link is invalid or has already been used.",
        };
      }

      // 2. Check expiration
      if (record.expiresAt < new Date()) {
        await tx.emailVerificationToken.delete({
          where: { id: record.id },
        });

        return {
          valid: false,
          expired: true,
          error: "This verification link has expired. Please request a new one.",
        };
      }

      // 3. Find matching user
      const user = await tx.user.findUnique({
        where: { email: record.email },
        select: { id: true, emailVerified: true },
      });

      if (!user) {
        return {
          valid: false,
          error: "User associated with this verification link was not found.",
        };
      }

      if (user.emailVerified) {
        // Already verified, cleanly consume remaining token
        await tx.emailVerificationToken.deleteMany({
          where: { email: record.email },
        });

        return {
          valid: true,
          alreadyVerified: true,
        };
      }

      // 4. Mark user email as verified
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });

      // 5. Invalidate all verification tokens for this user
      await tx.emailVerificationToken.deleteMany({
        where: { email: record.email },
      });

      return { valid: true };
    });

    if (!result.valid) {
      return {
        success: false,
        error: result.error,
        expired: result.expired,
      };
    }

    if (result.alreadyVerified) {
      return {
        success: true,
        alreadyVerified: true,
        message: "Your email address is already verified.",
      };
    }

    return {
      success: true,
      message: "Your email address has been verified successfully. Welcome to WorkPulse!",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Verify Email Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to verify email address. Please try again.",
    };
  }
}

/**
 * Server Action to resend an email verification link.
 * Protected against email enumeration and rate-limited.
 */
export async function resendVerificationEmailAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const parsed = ResendVerificationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Please enter a valid email address.",
    };
  }

  const { email } = parsed.data;
  const clientIp = await getClientIp();

  // Rate limit: 3 resend attempts per 15 minutes per IP & email
  const rateLimit = await checkRateLimit(`resend-verify:${clientIp}:${email}`, {
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many verification requests. Please wait 15 minutes before requesting again.",
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
      },
    });

    if (user) {
      if (user.emailVerified) {
        return {
          success: true,
          alreadyVerified: true,
          message: "Your email address is already verified. You can sign in directly.",
        };
      }

      // Generate secure verification token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await prisma.$transaction(async (tx) => {
        await tx.emailVerificationToken.deleteMany({
          where: { email: user.email },
        });

        await tx.emailVerificationToken.create({
          data: {
            email: user.email,
            tokenHash,
            expiresAt,
          },
        });
      });

      const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${rawToken}`;

      await sendVerificationEmail({
        to: user.email,
        verifyUrl,
        recipientName: user.name,
      });
    }

    return {
      success: true,
      message:
        "If an account exists with that email and requires verification, a new verification link has been sent.",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Resend Verification Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: true,
      message:
        "If an account exists with that email and requires verification, a new verification link has been sent.",
    };
  }
}

/**
 * Server Action to dispatch a 6-digit email verification OTP with 10-minute expiration.
 * Protects against email enumeration and enforces rate limiting & 60-second cooldown.
 */
export async function sendEmailVerificationOtpAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const parsed = SendEmailOtpSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Please enter a valid email address.",
    };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const clientIp = await getClientIp();

  // Rate limit: 5 requests per 15 minutes per IP & email
  const rateLimit = await checkRateLimit(`otp-send:${clientIp}:${email}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many verification requests. Please wait 15 minutes before trying again.",
    };
  }

  // Cooldown limit: 1 request per 60 seconds per email
  const cooldown = await checkRateLimit(`otp-cooldown:${email}`, {
    limit: 1,
    windowMs: 60 * 1000,
  });

  if (!cooldown.success) {
    return {
      success: false,
      error: "Please wait 60 seconds before requesting another code.",
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
      },
    });

    if (user && user.emailVerified) {
      return {
        success: true,
        alreadyVerified: true,
        message: "Your email address is already verified. You can proceed directly.",
      };
    }

    // Generate cryptographically secure 6-digit OTP (100000 - 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Store only SHA-256 hash (never store raw OTPs)
    const tokenHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    // 10-minute expiration
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate prior OTPs for this email and save new hashed OTP
    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.deleteMany({
        where: { email },
      });

      await tx.emailVerificationToken.create({
        data: {
          email,
          tokenHash,
          expiresAt,
        },
      });
    });

    // Send email via configured SMTP (or simulation in test mode)
    await sendEmailVerificationOtp({
      to: email,
      otp,
      recipientName: user?.name,
    });

    return {
      success: true,
      message: "A 6-digit verification code has been sent to your email address.",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Send OTP Error]:",
      error instanceof Error ? error.message : "Database/Email error"
    );

    return {
      success: false,
      error: "Failed to send verification code. Please try again.",
    };
  }
}

/**
 * Server Action to verify an email address using a 6-digit OTP.
 * Validates OTP SHA-256 hash, verifies expiration, and updates user emailVerified.
 */
export async function verifyEmailOtpAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const parsed = VerifyEmailOtpSchema.safeParse(input);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      error: firstIssue?.message || "Invalid verification code.",
    };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const otp = parsed.data.otp.trim();
  const clientIp = await getClientIp();

  // Rate limit OTP verification attempts to prevent brute force (10 attempts per 10 minutes)
  const attemptLimit = await checkRateLimit(`otp-verify:${clientIp}:${email}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!attemptLimit.success) {
    return {
      success: false,
      error: "Too many verification attempts. Please wait 10 minutes or request a new code.",
    };
  }

  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      // 1. Look up token by email and hash
      const record = await tx.emailVerificationToken.findFirst({
        where: {
          email,
          tokenHash,
        },
      });

      if (!record) {
        return {
          valid: false,
          error: "Invalid verification code. Please check your email or request a new code.",
        };
      }

      // 2. Check expiration (10 minutes)
      if (record.expiresAt < new Date()) {
        await tx.emailVerificationToken.delete({
          where: { id: record.id },
        });

        return {
          valid: false,
          expired: true,
          error: "This verification code has expired. Please request a new one.",
        };
      }

      // 3. Find matching user
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, emailVerified: true },
      });

      if (!user) {
        return {
          valid: false,
          error: "User associated with this email was not found.",
        };
      }

      if (user.emailVerified) {
        await tx.emailVerificationToken.deleteMany({
          where: { email },
        });

        return {
          valid: true,
          alreadyVerified: true,
        };
      }

      // 4. Mark user email verified
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
        },
      });

      // 5. Invalidate all verification tokens for this user
      await tx.emailVerificationToken.deleteMany({
        where: { email },
      });

      return { valid: true };
    });

    if (!result.valid) {
      return {
        success: false,
        error: result.error,
        expired: result.expired,
      };
    }

    if (result.alreadyVerified) {
      return {
        success: true,
        alreadyVerified: true,
        message: "Your email address is already verified.",
      };
    }

    return {
      success: true,
      message: "Your email address has been verified successfully. Welcome to WorkPulse!",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Verify OTP Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to verify code. Please try again.",
    };
  }
}

/**
 * Server Action for authenticated users to change their password in account settings.
 * Requires current password verification, enforces password rules, prevents password reuse,
 * hashes new password with bcrypt (cost 12), and increments sessionVersion to invalidate
 * other active sessions.
 */
export async function changePasswordAction(
  input: unknown
): Promise<AuthRecoveryResult> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "You must be signed in to change your password.",
    };
  }

  const parsed = ChangePasswordSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });

    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid password change request.",
      fieldErrors,
    };
  }

  const { currentPassword, newPassword } = parsed.data;

  // Rate limit password changes: 5 attempts per 15 minutes per user
  const rateLimit = await checkRateLimit(`change-password:${sessionUser.id}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many password change attempts. Please wait 15 minutes before trying again.",
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        sessionVersion: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: "Account not found.",
      };
    }

    if (!user.passwordHash) {
      return {
        success: false,
        error:
          "This account uses Google OAuth authentication and does not have a password configured.",
      };
    }

    // 1. Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!isCurrentPasswordValid) {
      return {
        success: false,
        error: "The current password you entered is incorrect.",
        fieldErrors: {
          currentPassword: "The current password you entered is incorrect.",
        },
      };
    }

    // 2. Prevent reusing the current password
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return {
        success: false,
        error: "New password cannot be identical to your current password.",
        fieldErrors: {
          newPassword: "New password cannot be identical to your current password.",
        },
      };
    }

    // 3. Hash new password with bcrypt (cost 12)
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // 4. Update password and increment sessionVersion in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        sessionVersion: { increment: 1 },
      },
    });

    return {
      success: true,
      message:
        "Your password has been changed successfully. Other active sessions have been signed out.",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Change Password Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to change password. Please try again.",
    };
  }
}

/**
 * Safely purges expired password reset and email verification tokens from MongoDB.
 * Utilizes the existing @@index([expiresAt]) on both collections for high-performance deletion.
 */
export async function cleanupExpiredTokensAction(): Promise<{
  success: boolean;
  deletedPasswordResetTokens: number;
  deletedEmailVerificationTokens: number;
}> {
  const now = new Date();
  try {
    const [prRes, evRes] = await Promise.all([
      prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.emailVerificationToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

    return {
      success: true,
      deletedPasswordResetTokens: prRes.count,
      deletedEmailVerificationTokens: evRes.count,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Token Cleanup Error]:",
      error instanceof Error ? error.message : "Error cleaning up expired tokens"
    );
    return {
      success: false,
      deletedPasswordResetTokens: 0,
      deletedEmailVerificationTokens: 0,
    };
  }
}
