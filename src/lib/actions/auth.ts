"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Role } from "@/types";
import { signIn, signOut } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";

import {
  SignupSchema,
  LoginSchema,
  SelectRoleSchema,
  sanitizeRedirectPath,
} from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendVerificationEmail, sendEmailVerificationOtp, getAppBaseUrl } from "@/lib/email";

export type AuthActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  role?: Role;
};

/**
 * Server Action to register a new User in MongoDB.
 * Hashes passwords with bcrypt (cost 12), enforces email uniqueness,
 * and restricts roles strictly to CLIENT or FREELANCER.
 */
export async function registerUser(input: unknown): Promise<AuthActionResult> {
  const result = SignupSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });
    return {
      
      success: false,
      error: "Please correct the highlighted errors.",
      fieldErrors,
    };
  }

  const { name, email, password, role } = result.data;

  // Rate limit registration requests by IP (5 attempts per 10 minutes)
  const clientIp = await getClientIp();
  const rateLimit = await checkRateLimit(`signup:${clientIp}`, {
    limit: 5,
    windowMs: 600_000,
  });
  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many accounts created from this IP. Please try again later.",
    };
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return {
        success: false,
        error: "An account with this email address already exists.",
      };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: role as Role,
        roleSelected: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate secure 6-digit email verification OTP (10-minute expiration)
    try {
      const otp = crypto.randomInt(100000, 1000000).toString();
      const tokenHash = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.emailVerificationToken.deleteMany({
        where: { email: newUser.email },
      });

      await prisma.emailVerificationToken.create({
        data: {
          email: newUser.email,
          tokenHash,
          expiresAt,
        },
      });

      await sendEmailVerificationOtp({
        to: newUser.email,
        otp,
        recipientName: newUser.name,
      });
    } catch (emailErr) {
      // Do not fail account registration if email queueing encounters non-fatal error
      console.error(
        "[WorkPulse Verification Email Error]:",
        emailErr instanceof Error ? emailErr.message : "Failed to queue verification email"
      );
    }

    return {
      success: true,
      message:
        "Account created successfully. A 6-digit verification code has been sent to your email.",
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "An account with this email address already exists.",
      };
    }

    console.error(
      "[WorkPulse Registration Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "A database error occurred during registration. Please try again.",
    };
  }
}

/**
 * Server Action for authenticated Google users to select their role during onboarding.
 * Strictly verifies:
 * 1. User is authenticated.
 * 2. User has NOT already finalized role selection (prevents role tampering).
 * 3. Enforces valid CLIENT or FREELANCER role.
 */
export async function selectRoleAction(
  input: unknown
): Promise<AuthActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to select a role.",
    };
  }

  const parsed = SelectRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid role selection.",
    };
  }

  const selectedRole = parsed.data.role as Role;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, roleSelected: true },
    });

    if (!dbUser) {
      return {
        success: false,
        error: "User account not found.",
      };
    }

    // Role safety: if role is already selected, prevent overwriting
    if (dbUser.roleSelected) {
      return {
        success: false,
        error: "Your role has already been established and cannot be changed.",
        role: dbUser.role as Role,
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: selectedRole,
        roleSelected: true,
      },
    });

    revalidatePath("/onboarding/role");
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/jobs");

    return {
      success: true,
      role: selectedRole,
    };
  } catch (error) {
    console.error("[WorkPulse Role Onboarding Error]:", error);
    return {
      success: false,
      error: "Failed to save selected role. Please try again.",
    };
  }
}

/**
 * Server Action to sign in with credentials via Auth.js.
 */
export async function loginUser(input: unknown): Promise<AuthActionResult> {
  const result = LoginSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Please enter a valid email and password.",
    };
  }

  const { email, password, redirectTo } = result.data;
  
  // Resolve role-based default destination
  let destination = sanitizeRedirectPath(redirectTo);
  let userRole: Role | undefined;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { role: true, roleSelected: true },
    });
    if (dbUser) {
      userRole = dbUser.role as Role;
      if (
        !redirectTo ||
        (dbUser.role === "CLIENT" && (redirectTo === "/jobs" || redirectTo === "/dashboard" || redirectTo.startsWith("/dashboard/freelancer"))) ||
        (dbUser.role === "FREELANCER" && (redirectTo === "/dashboard" || redirectTo.startsWith("/dashboard/client")))
      ) {
        if (!dbUser.roleSelected) {
          destination = "/onboarding/role";
        } else if (dbUser.role === "CLIENT") {
          destination = "/dashboard/client";
        } else {
          destination = "/dashboard/freelancer";
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // Rate limit login attempts by IP and email (5 attempts per minute)
  const clientIp = await getClientIp();
  const rateLimit = await checkRateLimit(`login:${clientIp}:${email.toLowerCase()}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many login attempts. Please wait 1 minute before trying again.",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: destination,
    });

    return {
      success: true,
      role: userRole,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return {
            success: false,
            error: "Invalid email or password.",
          };
        default:
          return {
            success: false,
            error: "Authentication failed. Please verify your credentials.",
          };
      }
    }

    // Next.js redirect() throws a NEXT_REDIRECT error which must bubble up to work
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw error;
    }

    console.error(
      "[WorkPulse Login Error]:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return {
      success: false,
      error: "An unexpected error occurred during sign in.",
    };
  }
}

/**
 * Server Action to initiate Google OAuth sign-in.
 */
export async function loginWithGoogleAction(redirectTo?: string) {
  const destination = sanitizeRedirectPath(redirectTo);
  await signIn("google", { redirectTo: destination });
}

/**
 * Server Action to sign out the active user session.
 */
export async function logoutUser() {
  await signOut({ redirectTo: "/" });
}
