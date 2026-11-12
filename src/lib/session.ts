import { auth } from "@/lib/auth";
import { Role } from "@/types";
import { redirect } from "next/navigation";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
  roleSelected: boolean;
  emailVerified?: Date | null;
  sessionVersion?: number;
}

/**
 * Returns the currently authenticated user from the trusted server-side session,
 * or null if no valid session exists.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      role: (session.user.role as Role) || Role.CLIENT,
      roleSelected: session.user.roleSelected !== false,
      emailVerified: session.user.emailVerified,
      sessionVersion: session.user.sessionVersion ?? 1,
    };
  } catch (error) {
    if (
      (error as { digest?: string })?.digest?.startsWith("NEXT_") ||
      (error as { digest?: string })?.digest?.includes("DYNAMIC") ||
      (error as Error)?.message?.includes("prerendering")
    ) {
      throw error;
    }

    console.error(
      "[WorkPulse Session Error]:",
      error instanceof Error ? error.message : "Error verifying session"
    );
    return null;
  }
}

/**
 * Ensures the user is authenticated on the server side.
 * Redirects to /login if unauthenticated.
 */
export async function requireUser(
  redirectTo?: string,
  requireRoleSelected: boolean = false
): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    const target = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login";
    redirect(target);
  }

  if (requireRoleSelected && !user.roleSelected) {
    redirect("/onboarding/role");
  }

  return user;
}

/**
 * Enforces server-side role-based access control.
 * Throws or redirects if the user does not possess one of the allowed roles.
 */
export async function requireRole(
  allowed: Role | Role[],
  redirectTo?: string
): Promise<SessionUser> {
  const user = await requireUser(redirectTo);

  if (!user.roleSelected) {
    redirect("/onboarding/role");
  }

  const allowedList = Array.isArray(allowed) ? allowed : [allowed];

  if (!allowedList.includes(user.role)) {
    if (user.role === Role.CLIENT) {
      redirect("/dashboard/client?error=unauthorized_role");
    } else {
      redirect("/dashboard/freelancer?error=unauthorized_role");
    }
  }

  return user;
}

export type VerifiedUserActionResult =
  | { success: true; user: SessionUser; error?: undefined; code?: undefined }
  | {
      success: false;
      user?: undefined;
      error: string;
      code: "UNAUTHENTICATED" | "UNAUTHORIZED_ROLE" | "EMAIL_NOT_VERIFIED";
    };

/**
 * Server Component / Page-level guard:
 * Strictly enforces that:
 * 1. The user is authenticated (redirects to /login).
 * 2. The user has selected a role (redirects to /onboarding/role).
 * 3. The user has the required role if specified (redirects to /jobs?error=unauthorized_role).
 * 4. The user's email is verified in the database (redirects to /verify-email?required=true).
 *
 * Returns the authenticated and verified SessionUser.
 */
export async function requireVerifiedUser(
  allowed?: Role | Role[],
  redirectTo?: string
): Promise<SessionUser> {
  const user = allowed ? await requireRole(allowed, redirectTo) : await requireUser(redirectTo);

  let isVerified = false;
  try {
    const { prisma } = await import("@/lib/prisma");
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true },
    });
    isVerified = Boolean(dbUser?.emailVerified);
  } catch {
    isVerified = Boolean(user.emailVerified);
  }

  if (!isVerified) {
    redirect("/verify-email?required=true");
  }

  return {
    ...user,
    emailVerified: user.emailVerified || new Date(),
  };
}

/**
 * Server Action guard:
 * Centralized, typed authorization check for marketplace mutations.
 * Returns { success: true, user } on success, or { success: false, error, code } on failure.
 * Never throws uncaught redirect errors, making it safe for use inside server action RPCs.
 */
export async function verifyUserForAction(
  allowed?: Role | Role[],
  customRoleError?: string,
  options?: { requireEmailVerified?: boolean }
): Promise<VerifiedUserActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required: You must be signed in to perform this action.",
      code: "UNAUTHENTICATED",
    };
  }

  if (user.roleSelected === false) {
    return {
      success: false,
      error: "Please complete onboarding before performing this action.",
      code: "UNAUTHORIZED_ROLE",
    };
  }

  if (allowed) {
    const allowedList = Array.isArray(allowed) ? allowed : [allowed];
    if (!allowedList.includes(user.role)) {
      if (customRoleError) {
        return {
          success: false,
          error: customRoleError,
          code: "UNAUTHORIZED_ROLE",
        };
      }
      const roleLabels = allowedList.map((r) => r.toLowerCase()).join(" or ");
      return {
        success: false,
        error: `Unauthorized: Only ${roleLabels} accounts can perform this action.`,
        code: "UNAUTHORIZED_ROLE",
      };
    }
  }

  // If requireEmailVerified is explicitly set to false, skip email verification
  if (options?.requireEmailVerified === false) {
    return {
      success: true,
      user: {
        ...user,
        emailVerified: user.emailVerified || new Date(),
      },
    };
  }

  let isVerified = false;
  try {
    const { prisma } = await import("@/lib/prisma");
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true },
    });
    isVerified = Boolean(dbUser?.emailVerified);
  } catch {
    isVerified = Boolean(user.emailVerified);
  }

  if (!isVerified) {
    return {
      success: false,
      error: "Please verify your email address to access this feature.",
      code: "EMAIL_NOT_VERIFIED",
    };
  }

  return {
    success: true,
    user: {
      ...user,
      emailVerified: user.emailVerified || new Date(),
    },
  };
}

export const requireVerifiedUserAction = verifyUserForAction;
