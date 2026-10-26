import { z } from "zod";

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const SendMessageSchema = z.object({
  conversationId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Conversation ID. Expected a 24-character hexadecimal ObjectId"),
  content: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(3000, "Message content cannot exceed 3,000 characters"),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const GetMessagesSchema = z.object({
  conversationId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Conversation ID. Expected a 24-character hexadecimal ObjectId"),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
});

export type GetMessagesInput = z.infer<typeof GetMessagesSchema>;

export const MarkNotificationSchema = z.object({
  notificationId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "Invalid Notification ID")
    .optional(),
  all: z.boolean().optional(),
});

export type MarkNotificationInput = z.infer<typeof MarkNotificationSchema>;
