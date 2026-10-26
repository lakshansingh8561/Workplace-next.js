import { z } from "zod";
import { isValidObjectId } from "@/lib/jobs";

export const ReviewSubmissionSchema = z.object({
  contractId: z
    .string()
    .min(1, "Contract ID is required.")
    .refine((val) => isValidObjectId(val), {
      message: "Invalid contract identifier format.",
    }),
  rating: z
    .number()
    .int("Rating must be a whole number of stars.")
    .min(1, "Rating must be at least 1 star.")
    .max(5, "Rating cannot exceed 5 stars."),
  feedback: z
    .string()
    .trim()
    .min(5, "Feedback must be at least 5 characters.")
    .max(2000, "Feedback cannot exceed 2,000 characters."),
});

export const ReviewUpdateSchema = z.object({
  reviewId: z
    .string()
    .min(1, "Review ID is required.")
    .refine((val) => isValidObjectId(val), {
      message: "Invalid review identifier format.",
    }),
  rating: z
    .number()
    .int("Rating must be a whole number of stars.")
    .min(1, "Rating must be at least 1 star.")
    .max(5, "Rating cannot exceed 5 stars."),
  feedback: z
    .string()
    .trim()
    .min(5, "Feedback must be at least 5 characters.")
    .max(2000, "Feedback cannot exceed 2,000 characters."),
});

export type ReviewSubmissionInput = z.infer<typeof ReviewSubmissionSchema>;
export type ReviewUpdateInput = z.infer<typeof ReviewUpdateSchema>;
