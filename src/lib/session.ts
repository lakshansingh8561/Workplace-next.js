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
    redirect("/jobs?error=unauthorized_role");
  }

  return user;
}
