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
  description: z
    .string()
    .trim()
    .optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1, "File name is required"),
        fileUrl: z.string().min(1, "File URL is required"),
        fileType: z.string().min(1, "File type is required"),
        fileSize: z.number().int().nonnegative(),
        storageProvider: z.string().optional().nullable(),
      })
    )
    .optional(),
  links: z
    .array(
      z.object({
        title: z.string().trim().max(100).optional().nullable(),
        url: z.string().trim().url("Please provide a valid deliverable URL (e.g. https://github.com/...)"),
      })
    )
    .optional(),
});

export type MilestoneActionInput = z.infer<typeof MilestoneActionSchema>;

export const SubmitMilestoneDeliverableSchema = z
  .object({
    milestoneId: z
      .string()
      .trim()
      .regex(OBJECT_ID_REGEX, "Invalid Milestone ID. Expected a 24-character hexadecimal ObjectId"),
    description: z
      .string()
      .trim()
      .min(10, "Please provide a completion description of at least 10 characters")
      .max(5000, "Completion description cannot exceed 5,000 characters"),
    attachments: z
      .array(
        z.object({
          fileName: z.string().min(1, "File name is required"),
          fileUrl: z.string().min(1, "File URL is required"),
          fileType: z.string().min(1, "File type is required"),
          fileSize: z.number().int().nonnegative(),
          storageProvider: z.string().optional().nullable(),
        })
      )
      .default([]),
    links: z
      .array(
        z.object({
          title: z.string().trim().max(100).optional().nullable(),
          url: z.string().trim().url("Please provide a valid deliverable URL"),
        })
      )
      .default([]),
  })
  .refine(
    (data) => data.attachments.length > 0 || data.links.length > 0,
    {
      message: "Please attach at least one work proof file or provide a deliverable link",
      path: ["attachments"],
    }
  );

export type SubmitMilestoneDeliverableInput = z.infer<typeof SubmitMilestoneDeliverableSchema>;

export const RequestMilestoneChangesSchema = z.object({
  milestoneId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Milestone ID. Expected a 24-character hexadecimal ObjectId"),
  feedback: z
    .string()
    .trim()
    .min(5, "Please provide clear feedback of at least 5 characters")
    .max(2000, "Revision feedback cannot exceed 2,000 characters"),
});

export type RequestMilestoneChangesInput = z.infer<typeof RequestMilestoneChangesSchema>;

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

export const DeleteContractSchema = z.object({
  contractId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Contract ID. Expected a 24-character hexadecimal ObjectId"),
});

export type DeleteContractInput = z.infer<typeof DeleteContractSchema>;
