import { z } from "zod";
import { DURATION_OPTIONS } from "./job";

/**
 * 24-character hexadecimal string representing a MongoDB ObjectId.
 */
export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const SubmitProposalSchema = z.object({
  jobId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Job ID. Expected a 24-character hexadecimal ObjectId"),
  bidAmount: z.coerce
    .number()
    .positive("Proposed bid amount must be a positive number")
    .max(1000000, "Proposed amount cannot exceed $1,000,000"),
  estimatedDuration: z
    .enum(DURATION_OPTIONS, {
      error: "Please select an estimated project duration",
    })
    .optional()
    .nullable(),
  coverLetter: z
    .string()
    .trim()
    .min(30, "Please provide a detailed cover letter of at least 30 characters explaining your approach")
    .max(3000, "Cover letter cannot exceed 3,000 characters"),
});

export type SubmitProposalInput = z.infer<typeof SubmitProposalSchema>;

export const UpdateProposalStatusSchema = z.object({
  proposalId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Proposal ID. Expected a 24-character hexadecimal ObjectId"),
  status: z.enum(["ACCEPTED", "REJECTED"], {
    error: "Status must be either ACCEPTED or REJECTED",
  }),
});

export type UpdateProposalStatusInput = z.infer<typeof UpdateProposalStatusSchema>;
