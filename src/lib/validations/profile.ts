import { z } from "zod";

/**
 * Validates whether a given URL uses an explicitly safe web protocol (http: or https:).
 * Rejects javascript:, data:, vbscript:, and relative or malformed URLs.
 */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const FreelancerProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters")
    .max(60, "Display name cannot exceed 60 characters"),
  title: z
    .string()
    .trim()
    .max(100, "Professional title cannot exceed 100 characters")
    .optional()
    .or(z.literal("")),
  bio: z
    .string()
    .trim()
    .max(2000, "Bio overview cannot exceed 2000 characters")
    .optional()
    .or(z.literal("")),
  skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Skill cannot be empty")
        .max(40, "Skill cannot exceed 40 characters")
    )
    .max(25, "You can specify up to 25 skills")
    .default([]),
  hourlyRate: z
    .number({
      error: "Hourly rate must be a valid number",
    })
    .min(0, "Hourly rate cannot be negative")
    .max(9999, "Hourly rate cannot exceed $9,999/hr")
    .optional()
    .nullable(),
  experience: z
    .string()
    .trim()
    .max(120, "Experience description cannot exceed 120 characters")
    .optional()
    .or(z.literal("")),
  location: z
    .string()
    .trim()
    .max(80, "Location cannot exceed 80 characters")
    .optional()
    .or(z.literal("")),
  languages: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Language cannot be empty")
        .max(40, "Language cannot exceed 40 characters")
    )
    .max(10, "You can specify up to 10 languages")
    .default([]),
  portfolioUrls: z
    .array(
      z
        .string()
        .trim()
        .max(250, "URL cannot exceed 250 characters")
        .refine(
          (val) => isSafeHttpUrl(val),
          { message: "Portfolio link must use a valid web protocol (http:// or https://)" }
        )
    )
    .max(5, "You can add up to 5 portfolio/project links")
    .default([]),
});

export type FreelancerProfileInput = z.infer<typeof FreelancerProfileSchema>;

export const ClientProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(60, "Full name cannot exceed 60 characters"),
  companyName: z
    .string()
    .trim()
    .max(100, "Company name cannot exceed 100 characters")
    .optional()
    .or(z.literal("")),
  companyDescription: z
    .string()
    .trim()
    .max(2000, "Company overview cannot exceed 2000 characters")
    .optional()
    .or(z.literal("")),
  companyWebsite: z
    .string()
    .trim()
    .max(200, "Website URL cannot exceed 200 characters")
    .refine(
      (val) => !val || isSafeHttpUrl(val),
      { message: "Website must use a valid web protocol (http:// or https://)" }
    )
    .optional()
    .or(z.literal("")),
  companyIndustry: z
    .string()
    .trim()
    .max(80, "Industry cannot exceed 80 characters")
    .optional()
    .or(z.literal("")),
  location: z
    .string()
    .trim()
    .max(80, "Location cannot exceed 80 characters")
    .optional()
    .or(z.literal("")),
});

export type ClientProfileInput = z.infer<typeof ClientProfileSchema>;

/**
 * Calculates a 0-100 completion percentage score and suggestions for a freelancer profile.
 */
export function calculateFreelancerProfileCompletion(profile: {
  name?: string | null;
  title?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  hourlyRate?: number | null;
  location?: string | null;
  languages?: string[] | null;
  portfolioUrls?: string[] | null;
}): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];

  if (profile.name && profile.name.trim().length >= 2) {
    score += 15;
  } else {
    missing.push("Display Name");
  }

  if (profile.title && profile.title.trim().length >= 3) {
    score += 15;
  } else {
    missing.push("Professional Title");
  }

  if (profile.bio && profile.bio.trim().length >= 20) {
    score += 20;
  } else {
    missing.push("Professional Overview (min 20 characters)");
  }

  if (profile.skills && profile.skills.length > 0) {
    score += 20;
  } else {
    missing.push("Key Skills (at least 1)");
  }

  if (profile.hourlyRate !== undefined && profile.hourlyRate !== null && profile.hourlyRate > 0) {
    score += 10;
  } else {
    missing.push("Hourly Rate");
  }

  if (profile.location && profile.location.trim().length >= 2) {
    score += 10;
  } else {
    missing.push("Location");
  }

  if (profile.languages && profile.languages.length > 0) {
    score += 5;
  } else {
    missing.push("Languages");
  }

  if (profile.portfolioUrls && profile.portfolioUrls.length > 0) {
    score += 5;
  } else {
    missing.push("Portfolio / Project Links");
  }

  return { score: Math.min(100, score), missing };
}

/**
 * Calculates a 0-100 completion percentage score and suggestions for a client profile.
 */
export function calculateClientProfileCompletion(profile: {
  name?: string | null;
  companyName?: string | null;
  companyDescription?: string | null;
  companyIndustry?: string | null;
  location?: string | null;
  companyWebsite?: string | null;
}): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];

  if (profile.name && profile.name.trim().length >= 2) {
    score += 20;
  } else {
    missing.push("Contact / Manager Name");
  }

  if (profile.companyName && profile.companyName.trim().length >= 2) {
    score += 25;
  } else {
    missing.push("Company Name");
  }

  if (profile.companyDescription && profile.companyDescription.trim().length >= 20) {
    score += 25;
  } else {
    missing.push("Company Description (min 20 characters)");
  }

  if (profile.companyIndustry && profile.companyIndustry.trim().length >= 2) {
    score += 15;
  } else {
    missing.push("Industry");
  }

  if (
    (profile.location && profile.location.trim().length >= 2) ||
    (profile.companyWebsite && profile.companyWebsite.trim().length >= 5)
  ) {
    score += 15;
  } else {
    missing.push("Location or Website URL");
  }

  return { score: Math.min(100, score), missing };
}
