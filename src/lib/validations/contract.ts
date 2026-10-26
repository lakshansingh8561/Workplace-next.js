import { z } from "zod";

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const CreateMilestoneSchema = z.object({
  contractId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Contract ID. Expected a 24-character hexadecimal ObjectId"),
  title: z
    .string()
    .trim()
    .min(3, "Milestone title must be at least 3 characters")
    .max(100, "Milestone title cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Description cannot exceed 1,000 characters")
    .optional()
    .nullable(),
  amount: z.coerce
    .number()
    .positive("Milestone amount must be a positive number")
    .min(1, "Milestone amount must be at least $1")
    .max(1000000, "Milestone amount cannot exceed $1,000,000"),
  dueDate: z
    .string()
    .optional()
    .nullable(),
});

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;

export const MilestoneActionSchema = z.object({
  milestoneId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Milestone ID. Expected a 24-character hexadecimal ObjectId"),
});

export type MilestoneActionInput = z.infer<typeof MilestoneActionSchema>;

export const UpdateContractStatusSchema = z.object({
  contractId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Contract ID. Expected a 24-character hexadecimal ObjectId"),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "TERMINATED"], {
    error: "Status must be ACTIVE, PAUSED, COMPLETED, or TERMINATED",
  }),
});

export type UpdateContractStatusInput = z.infer<typeof UpdateContractStatusSchema>;
