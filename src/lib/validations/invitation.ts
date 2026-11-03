import { z } from "zod";
import { OBJECT_ID_REGEX } from "./message";

export const SendInterviewInvitationSchema = z.object({
  jobId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Job ID format"),
  freelancerId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Freelancer ID format"),
  message: z
    .string()
    .trim()
    .min(10, "Invitation message must be at least 10 characters")
    .max(2000, "Invitation message cannot exceed 2,000 characters"),
});

export type SendInterviewInvitationInput = z.infer<typeof SendInterviewInvitationSchema>;

export const RespondInterviewInvitationSchema = z.object({
  invitationId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Invitation ID format"),
  action: z.enum(["ACCEPT", "DECLINE"], {
    error: "Action must be either ACCEPT or DECLINE",
  }),
  reason: z
    .string()
    .trim()
    .max(500, "Decline reason cannot exceed 500 characters")
    .optional(),
});

export type RespondInterviewInvitationInput = z.infer<typeof RespondInterviewInvitationSchema>;

export const WithdrawInterviewInvitationSchema = z.object({
  invitationId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Invitation ID format"),
});

export type WithdrawInterviewInvitationInput = z.infer<typeof WithdrawInterviewInvitationSchema>;

export const GetOrCreatePreHireConversationSchema = z.object({
  jobId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Job ID format"),
  freelancerId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Freelancer ID format"),
});

export type GetOrCreatePreHireConversationInput = z.infer<typeof GetOrCreatePreHireConversationSchema>;
