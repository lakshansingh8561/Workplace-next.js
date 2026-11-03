/**
 * WorkPulse Deterministic Avatar Mapping & Asset Resolution
 *
 * Strict Rules Enforced:
 * 1. Client photos MUST ONLY be used for client/company profiles.
 * 2. Freelancer photos MUST ONLY be used for freelancer profiles.
 * 3. Folders are strictly isolated:
 *    - Client assets: /images/client/ (client1.jfif .. client5.jfif)
 *    - Freelancer assets: /images/freelancers/ (freelancer1.jpg, freelancer2.jfif .. freelancer5.jfif)
 * 4. Real uploaded profile images (Cloudinary, Google OAuth, S3, custom URL) take precedence.
 * 5. Demonstration photo assignment is 100% deterministic and stable based on user ID or name hash.
 * 6. Never assigns random photos or re-hashes on every render.
 * 7. Never mutates database or writes mock paths to persistent user records.
 */

export const CLIENT_DEMO_IMAGES: readonly string[] = [
  "/images/client/client1.jfif",
  "/images/client/client2.jfif",
  "/images/client/client3.jfif",
  "/images/client/client4.jfif",
  "/images/client/client5.jfif",
] as const;

export const FREELANCER_DEMO_IMAGES: readonly string[] = [
  "/images/freelancers/freelancer1.jpg",
  "/images/freelancers/freelancer2.jfif",
  "/images/freelancers/freelancer3.jfif",
  "/images/freelancers/freelancer4.jfif",
  "/images/freelancers/freelancer5.jfif",
] as const;

/**
 * Computes a stable 32-bit integer hash from a string key.
 */
function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export interface AvatarResolvableUser {
  id?: string | null;
  image?: string | null;
  role?: string | null;
  name?: string | null;
  companyName?: string | null;
}

/**
 * Returns the deterministic avatar image URL for a user or profile.
 * Respects real uploaded image first; otherwise maps to the strictly role-segregated demo assets.
 */
export function getDeterministicAvatar(
  user?: AvatarResolvableUser | null,
  roleOverride?: "CLIENT" | "FREELANCER"
): string {
  // 1. Real uploaded profile image takes strict precedence
  if (user?.image && typeof user.image === "string" && user.image.trim().length > 0) {
    return user.image.trim();
  }

  // 2. Determine role strictly (never mix client and freelancer)
  const isFreelancer =
    roleOverride === "FREELANCER" ||
    (!roleOverride && (user?.role === "FREELANCER" || user?.role?.toUpperCase() === "FREELANCER"));

  const targetList = isFreelancer ? FREELANCER_DEMO_IMAGES : CLIENT_DEMO_IMAGES;

  // 3. Deterministic key: use user ID if available, otherwise name or companyName
  const seedKey = user?.id || user?.name || user?.companyName || (isFreelancer ? "freelancer-default" : "client-default");
  const index = stableHash(seedKey) % targetList.length;

  return targetList[index];
}

/**
 * Formats user display initials (e.g. "Alice Johnson" -> "AJ", "Bob" -> "B")
 */
export function getInitials(name?: string | null, fallback = "WP"): string {
  if (!name || typeof name !== "string") return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return (parts[0][0] || fallback).toUpperCase();
  return ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase() || fallback;
}

