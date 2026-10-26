import { z } from "zod";
import { isSafeHttpUrl } from "./profile"; // re-export for tests

export const SignupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot exceed 50 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot exceed 100 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z.enum(["CLIENT", "FREELANCER"], {
    error: "Role must be either Client or Freelancer",
  }),
});

export type SignupInput = z.infer<typeof SignupSchema>;

/**
 * Strictly sanitizes an incoming redirect path to prevent open redirects.
 * Enforces same-origin relative paths starting with a single '/' and rejects:
 * - Absolute external URLs (e.g. https://evil.com, http://evil.com)
 * - Protocol-relative paths (//evil.com)
 * - Backslash bypasses (/\evil.com, \evil.com, /evil.com\test)
 * - Unsafe URI schemes (javascript:, data:)
 * Falls back to safe internal destination '/jobs'.
 */
export function sanitizeRedirectPath(
  target: string | null | undefined,
  fallback = "/jobs"
): string {
  if (!target || typeof target !== "string") return fallback;
  const trimmed = target.trim();

  // Must begin with a single slash, followed by an alphanumeric or permitted path character
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject backslashes anywhere in the target string
  if (trimmed.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    // Ensure the host was not mutated to an external destination
    if (parsed.origin !== "http://localhost") {
      return fallback;
    }
    // Double-check pathname is strictly a relative root path
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return fallback;
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  redirectTo: z
    .string()
    .optional()
    .transform((val) => sanitizeRedirectPath(val)),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const SelectRoleSchema = z.object({
  role: z.enum(["CLIENT", "FREELANCER"], {
    error: "Role must be either Client or Freelancer",
  }),
});

export type SelectRoleInput = z.infer<typeof SelectRoleSchema>;

export { isSafeHttpUrl };
