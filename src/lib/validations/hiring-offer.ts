import { z } from "zod";

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const CreateHiringOfferSchema = z.object({
  freelancerId: z.string().regex(OBJECT_ID_REGEX, "Invalid freelancer ID"),
  jobId: z.string().regex(OBJECT_ID_REGEX).optional().nullable(),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(100),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(3000),
  type: z.enum(["FIXED", "HOURLY"]),
  amount: z.number().positive("Amount must be greater than zero"),
  duration: z.string().trim().max(100).optional().nullable(),
  startDate: z.string().optional().nullable(),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().max(500).optional().nullable(),
        amount: z.number().positive(),
        dueDate: z.string().optional().nullable(),
      })
    )
    .optional()
    .default([]),
  message: z.string().trim().max(1000).optional().nullable(),
});

export type CreateHiringOfferInput = z.infer<typeof CreateHiringOfferSchema>;

export const RespondToOfferSchema = z.object({
  offerId: z.string().regex(OBJECT_ID_REGEX, "Invalid offer ID"),
  action: z.enum(["ACCEPT", "DECLINE", "COUNTER"]),
  counterAmount: z.number().positive().optional(),
  message: z.string().trim().max(1000).optional().nullable(),
  declineReason: z.string().trim().max(500).optional().nullable(),
});

export type RespondToOfferInput = z.infer<typeof RespondToOfferSchema>;

