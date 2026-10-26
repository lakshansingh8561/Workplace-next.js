import { z } from "zod";

export const SUPPORTED_CATEGORIES = [
  "Development & IT",
  "AI Services & ML",
  "Design & Creative",
  "Sales & Marketing",
  "Writing & Translation",
  "Admin & Customer Support",
  "Finance & Accounting",
  "Engineering & Architecture",
] as const;

export const DURATION_OPTIONS = [
  "Less than 1 month",
  "1 to 3 months",
  "3 to 6 months",
  "More than 6 months",
] as const;

export const CreateJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Job title must be at least 5 characters")
      .max(100, "Job title cannot exceed 100 characters"),
    description: z
      .string()
      .trim()
      .min(20, "Please provide a detailed description of at least 20 characters")
      .max(5000, "Job description cannot exceed 5000 characters"),
    category: z.enum(SUPPORTED_CATEGORIES, {
      error: "Please select a valid job category",
    }),
    skills: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Skill name cannot be empty")
          .max(30, "Skill name is too long")
      )
      .min(1, "Please specify at least one required skill")
      .max(10, "Maximum 10 skills allowed"),
    type: z.enum(["FIXED", "HOURLY"], {
      error: "Payment type must be either Fixed-Price or Hourly",
    }),
    budget: z.coerce
      .number()
      .positive("Budget must be a positive number")
      .max(1000000, "Budget cannot exceed $1,000,000")
      .optional()
      .nullable(),
    hourlyMin: z.coerce
      .number()
      .positive("Minimum hourly rate must be positive")
      .max(500, "Hourly rate cannot exceed $500/hr")
      .optional()
      .nullable(),
    hourlyMax: z.coerce
      .number()
      .positive("Maximum hourly rate must be positive")
      .max(1000, "Hourly rate cannot exceed $1,000/hr")
      .optional()
      .nullable(),
    duration: z.enum(DURATION_OPTIONS).optional().nullable(),
    experienceLevel: z.enum(["ENTRY", "INTERMEDIATE", "EXPERT"], {
      error: "Please select an experience level",
    }),
  })
  .superRefine((data, ctx) => {
    if (data.type === "FIXED") {
      if (!data.budget || data.budget < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fixed-price jobs must have a budget of at least $5",
          path: ["budget"],
        });
      }
    } else if (data.type === "HOURLY") {
      if (!data.hourlyMin || data.hourlyMin < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Minimum hourly rate must be at least $3/hr",
          path: ["hourlyMin"],
        });
      }
      if (!data.hourlyMax || data.hourlyMax < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum hourly rate must be at least $3/hr",
          path: ["hourlyMax"],
        });
      }
      if (
        data.hourlyMin &&
        data.hourlyMax &&
        data.hourlyMin > data.hourlyMax
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Minimum hourly rate cannot be greater than maximum rate",
          path: ["hourlyMin"],
        });
      }
    }
  });

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const UpdateJobStatusSchema = z.object({
  jobId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Job ID. Expected a 24-character hexadecimal ObjectId"),
  status: z.enum(["OPEN", "PAUSED", "CLOSED"], {
    error: "Status must be OPEN, PAUSED, or CLOSED",
  }),
});

export type UpdateJobStatusInput = z.infer<typeof UpdateJobStatusSchema>;

