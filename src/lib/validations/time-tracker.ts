// src/lib/validations/time-tracker.ts
import { z } from "zod";

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const StartTimeTrackingSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format."),
  description: z
    .string()
    .max(500, "Memo/description cannot exceed 500 characters.")
    .optional(),
});

export const PauseTimeTrackingSchema = z.object({
  timeEntryId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid time entry ID format."),
});

export const ResumeTimeTrackingSchema = z.object({
  timeEntryId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid time entry ID format."),
});

export const StopTimeTrackingSchema = z.object({
  timeEntryId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid time entry ID format."),
  description: z
    .string()
    .max(500, "Memo/description cannot exceed 500 characters.")
    .optional(),
});

export const RecordWorkSnapshotSchema = z.object({
  timeEntryId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid time entry ID format."),
  imageUrl: z
    .string()
    .max(500000, "Snapshot image payload exceeds maximum allowed size.")
    .optional(),
  keystrokes: z
    .number()
    .int("Keystrokes must be an integer.")
    .min(0, "Keystrokes cannot be negative.")
    .max(10000, "Keystrokes count exceeds realistic threshold.")
    .default(0),
  mouseEvents: z
    .number()
    .int("Mouse events must be an integer.")
    .min(0, "Mouse events cannot be negative.")
    .max(20000, "Mouse events count exceeds realistic threshold.")
    .default(0),
  memo: z
    .string()
    .max(500, "Memo cannot exceed 500 characters.")
    .optional(),
});

export const SubmitTimeEntriesSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format."),
  timeEntryIds: z
    .array(z.string().regex(OBJECT_ID_REGEX, "Invalid time entry ID format."))
    .min(1, "At least one time entry must be selected for submission."),
});

export const ApproveTimeEntriesSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format."),
  timeEntryIds: z
    .array(z.string().regex(OBJECT_ID_REGEX, "Invalid time entry ID format."))
    .min(1, "At least one time entry must be selected for approval."),
});

export const DisputeTimeEntriesSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format."),
  timeEntryIds: z
    .array(z.string().regex(OBJECT_ID_REGEX, "Invalid time entry ID format."))
    .min(1, "At least one time entry must be selected for dispute."),
  reason: z
    .string()
    .min(5, "Dispute reason must be at least 5 characters.")
    .max(500, "Dispute reason cannot exceed 500 characters."),
});

export type StartTimeTrackingInput = z.infer<typeof StartTimeTrackingSchema>;
export type PauseTimeTrackingInput = z.infer<typeof PauseTimeTrackingSchema>;
export type ResumeTimeTrackingInput = z.infer<typeof ResumeTimeTrackingSchema>;
export type StopTimeTrackingInput = z.infer<typeof StopTimeTrackingSchema>;
export type RecordWorkSnapshotInput = z.infer<typeof RecordWorkSnapshotSchema>;
export type SubmitTimeEntriesInput = z.infer<typeof SubmitTimeEntriesSchema>;
export type ApproveTimeEntriesInput = z.infer<typeof ApproveTimeEntriesSchema>;
export type DisputeTimeEntriesInput = z.infer<typeof DisputeTimeEntriesSchema>;
