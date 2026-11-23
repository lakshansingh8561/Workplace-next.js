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

export const PortfolioProjectSchema = z.object({
  id: z.string().optional(),
  title: z
    .string()
    .trim()
    .min(2, "Project title must be at least 2 characters")
    .max(100, "Project title cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Project description cannot exceed 1000 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  projectUrl: z
    .string()
    .trim()
    .max(250, "Project link cannot exceed 250 characters")
    .refine(
      (val) => !val || isSafeHttpUrl(val),
      { message: "Project link must use a valid web protocol (http:// or https://)" }
    )
    .optional()
    .nullable()
    .or(z.literal("")),
  imageUrl: z
    .string()
    .trim()
    .max(250, "Project image URL cannot exceed 250 characters")
    .refine(
      (val) => !val || isSafeHttpUrl(val),
      { message: "Project image URL must use a valid web protocol (http:// or https://)" }
    )
    .optional()
    .nullable()
    .or(z.literal("")),
  skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Skill name cannot be empty")
        .max(40, "Skill name cannot exceed 40 characters")
    )
    .max(15, "You can specify up to 15 skills per project")
    .default([]),
});

export type PortfolioProjectInput = z.infer<typeof PortfolioProjectSchema>;

export const EmploymentHistorySchema = z.object({
  id: z.string().optional(),
  company: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(100, "Company name cannot exceed 100 characters"),
  position: z
    .string()
    .trim()
    .min(1, "Position or job title is required")
    .max(100, "Position cannot exceed 100 characters"),
  location: z
    .string()
    .trim()
    .max(80, "Location cannot exceed 80 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  startDate: z
    .string()
    .trim()
    .min(1, "Start date is required")
    .max(40, "Start date cannot exceed 40 characters"),
  endDate: z
    .string()
    .trim()
    .max(40, "End date cannot exceed 40 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  current: z.boolean().default(false),
  description: z
    .string()
    .trim()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type EmploymentHistoryInput = z.infer<typeof EmploymentHistorySchema>;

export const EducationHistorySchema = z.object({
  id: z.string().optional(),
  institution: z
    .string()
    .trim()
    .min(1, "School or university name is required")
    .max(120, "Institution name cannot exceed 120 characters"),
  degree: z
    .string()
    .trim()
    .max(100, "Degree cannot exceed 100 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  fieldOfStudy: z
    .string()
    .trim()
    .max(100, "Field of study cannot exceed 100 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  startYear: z
    .string()
    .trim()
    .max(20, "Start year cannot exceed 20 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  endYear: z
    .string()
    .trim()
    .max(20, "End year cannot exceed 20 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type EducationHistoryInput = z.infer<typeof EducationHistorySchema>;

export const CertificationSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Certification name is required")
    .max(120, "Certification name cannot exceed 120 characters"),
  issuer: z
    .string()
    .trim()
    .min(1, "Issuing organization is required")
    .max(100, "Issuer cannot exceed 100 characters"),
  issueDate: z
    .string()
    .trim()
    .max(40, "Issue date cannot exceed 40 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  expiryDate: z
    .string()
    .trim()
    .max(40, "Expiry date cannot exceed 40 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  credentialId: z
    .string()
    .trim()
    .max(80, "Credential ID cannot exceed 80 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  credentialUrl: z
    .string()
    .trim()
    .max(250, "Credential URL cannot exceed 250 characters")
    .refine(
      (val) => !val || isSafeHttpUrl(val),
      { message: "Credential URL must use a valid web protocol (http:// or https://)" }
    )
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type CertificationInput = z.infer<typeof CertificationSchema>;

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
    .max(10, "You can add up to 10 portfolio links")
    .default([]),
  isAvailable: z.boolean().default(true),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  portfolioProjects: z.array(PortfolioProjectSchema).max(10).default([]),
  employmentHistory: z.array(EmploymentHistorySchema).max(15).default([]),
  educationHistory: z.array(EducationHistorySchema).max(10).default([]),
  certifications: z.array(CertificationSchema).max(10).default([]),
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
  portfolioProjects?: Array<{ title?: string }> | null;
  employmentHistory?: Array<{ company?: string }> | null;
  educationHistory?: Array<{ institution?: string }> | null;
  certifications?: Array<{ name?: string }> | null;
}): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];

  if (profile.name && profile.name.trim().length >= 2) {
    score += 10;
  } else {
    missing.push("Display Name");
  }

  if (profile.title && profile.title.trim().length >= 3) {
    score += 10;
  } else {
    missing.push("Professional Title");
  }

  if (profile.bio && profile.bio.trim().length >= 20) {
    score += 15;
  } else {
    missing.push("Professional Overview (min 20 characters)");
  }

  if (profile.skills && profile.skills.length > 0) {
    score += 15;
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
                   
  const hasPortfolio =
    (profile.portfolioProjects && profile.portfolioProjects.length > 0) ||
    (profile.portfolioUrls && profile.portfolioUrls.length > 0);
  if (hasPortfolio) {
    score += 10;
  } else {
    missing.push("Portfolio Project or Link");
  }

  if (profile.employmentHistory && profile.employmentHistory.length > 0) {
    score += 10;
  } else {
    missing.push("Employment History");
  }

  const hasEducationOrCert =
    (profile.educationHistory && profile.educationHistory.length > 0) ||
    (profile.certifications && profile.certifications.length > 0);
  if (hasEducationOrCert) {
    score += 5;
  } else {
    missing.push("Education or Certification");
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
