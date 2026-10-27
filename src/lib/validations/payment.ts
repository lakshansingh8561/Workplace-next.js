import { z } from "zod";

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const CreateMilestonePaymentOrderSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format."),
  milestoneId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid milestone ID format."),
});

export const CreateTimesheetPaymentOrderSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format."),
  timeEntryIds: z
    .array(z.string().regex(OBJECT_ID_REGEX, "Invalid time entry ID format."))
    .min(1, "At least one approved time entry must be selected for payment."),
});

export const VerifyPaymentSignatureSchema = z.object({
  contractId: z
    .string()
    .regex(OBJECT_ID_REGEX, "Invalid contract ID format.")
    .optional(),
  razorpayOrderId: z
    .string()
    .min(1, "Razorpay Order ID is required."),
  razorpayPaymentId: z
    .string()
    .min(1, "Razorpay Payment ID is required."),
  razorpaySignature: z
    .string()
    .min(1, "Razorpay Signature is required."),
});

export type CreateMilestonePaymentOrderInput = z.infer<typeof CreateMilestonePaymentOrderSchema>;
export type CreateTimesheetPaymentOrderInput = z.infer<typeof CreateTimesheetPaymentOrderSchema>;
export type VerifyPaymentSignatureInput = z.infer<typeof VerifyPaymentSignatureSchema>;
