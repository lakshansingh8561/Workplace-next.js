"use server";

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
} from "@/lib/validations/auth";

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

    await prisma.user.create({
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
        role: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      message: "Account created successfully. You can now log in.",
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

  let destination = "/jobs";
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    destination = redirectTo;
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: destination,
    });

    return {
      success: true,
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
  let destination = "/jobs";
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    destination = redirectTo;
  }
  await signIn("google", { redirectTo: destination });
}

/**
 * Server Action to sign out the active user session.
 */
export async function logoutUser() {
  await signOut({ redirectTo: "/" });
}
