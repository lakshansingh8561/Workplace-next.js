"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { MarkNotificationSchema } from "@/lib/validations/message";
import { Prisma, NotificationType } from "@prisma/client";

export type NotificationActionResult = {
  success: boolean;
  error?: string;
  notifications?: Array<{
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
    read: boolean;
    createdAt: string;
  }>;
  unreadCount?: number;
};

/**
 * Fetch the authenticated user's notifications.
 * Scoped strictly to session.user.id.
 */
export async function getNotificationsAction(
  limit: number = 30,
  filter?: "all" | "unread"
): Promise<NotificationActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to view notifications.",
      notifications: [],
      unreadCount: 0,
    };
  }

  try {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const whereClause: { userId: string; read?: boolean } = { userId: user.id };
    if (filter === "unread") {
      whereClause.read = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: [
          { read: "asc" },
          { createdAt: "desc" },
        ],
        take: safeLimit,
      }),
      prisma.notification.count({
        where: { userId: user.id, read: false },
      }),
    ]);

    return {
      success: true,
      notifications: notifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return {
      success: false,
      error: "Failed to retrieve notifications.",
      notifications: [],
      unreadCount: 0,
    };
  }
}

/**
 * Mark one or all notifications as read for the authenticated user.
 * Enforces recipient scoping so a user cannot touch another user's notifications.
 */
export async function markNotificationReadAction(
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "Unauthorized: You must be signed in to update notifications.",
    };
  }

  const result = MarkNotificationSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message || "Invalid input parameters.",
    };
  }

  try {
    if (result.data.all) {
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          read: false,
        },
        data: {
          read: true,
        },
      });
      return { success: true };
    }

    if (result.data.notificationId) {
      const updateResult = await prisma.notification.updateMany({
        where: {
          id: result.data.notificationId,
          userId: user.id,
        },
        data: {
          read: true,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          error: "Notification not found or access denied.",
        };
      }

      return { success: true };
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating notification status:", error);
    return {
      success: false,
      error: "Failed to update notification.",
    };
  }
}

/**
 * Helper to determine if an error is specifically an idempotencyKey unique constraint violation.
 * Only errors originating from notifications_idempotencyKey_unique or target "idempotencyKey"
 * are absorbed. Unrelated unique constraint violations or transient errors are rejected.
 */
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = err.meta?.target;
    if (Array.isArray(target)) {
      if (
        target.some(
          (t) =>
            typeof t === "string" &&
            (t.includes("idempotencyKey") || t.includes("notifications_idempotencyKey_unique"))
        )
      ) {
        return true;
      }
    } else if (typeof target === "string") {
      if (
        target.includes("idempotencyKey") ||
        target.includes("notifications_idempotencyKey_unique")
      ) {
        return true;
      }
    }

    const message = typeof err.message === "string" ? err.message : "";
    if (
      message.includes("idempotencyKey") ||
      message.includes("notifications_idempotencyKey_unique")
    ) {
      return true;
    }

    return false;
  }

  // Handle direct MongoServerError / code 11000 duplicate key
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : "";

  const code = (err as Record<string, unknown>)?.code;
  const isMongoDuplicate = /E11000\s+duplicate\s+key/i.test(msg) || code === 11000;

  if (isMongoDuplicate) {
    const keyPattern = (err as Record<string, unknown>)?.keyPattern;
    if (
      keyPattern &&
      typeof keyPattern === "object" &&
      "idempotencyKey" in (keyPattern as Record<string, unknown>)
    ) {
      return true;
    }
    return (
      msg.includes("idempotencyKey") ||
      msg.includes("notifications_idempotencyKey_unique")
    );
  }

  return false;
}

/**
 * Server-side helper to create an in-app notification.
 * Wrapped safely so notification failures do not break primary operations.
 *
 * Idempotency guarantees:
 * - When `params.idempotencyKey` is supplied, delivery is database-enforced atomic
 *   via MongoDB partial unique index `notifications_idempotencyKey_unique`.
 *   Concurrent dispatches or retries are safely absorbed without duplication.
 * - When `params.idempotencyKey` is omitted, fallback uses a short rolling window (10s)
 *   without unbounded historical suppression.
 */
export async function createNotificationSafe(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  idempotencyKey?: string;
}): Promise<boolean> {
  try {
    // 1. Database-enforced atomic idempotency if key is provided
    if (params.idempotencyKey) {
      try {
        await prisma.notification.create({
          data: {
            userId: params.userId,
            type: params.type,
            title: params.title,
            message: params.message,
            link: params.link,
            idempotencyKey: params.idempotencyKey,
          },
        });
        return true;
      } catch (err) {
        // Absorb ONLY duplicate key errors confirmed to belong to the idempotency key unique constraint
        if (isIdempotencyKeyConflict(err)) {
          // Idempotent retry: notification already created and delivered
          return true;
        }

        const errName = err instanceof Error ? err.name : "UnknownError";
        const errCode = (err as { code?: string | number })?.code ?? "UNKNOWN";
        console.error(
          `[WorkPulse Notification] Delivery failed for key '${params.idempotencyKey}' [type: ${params.type}, code: ${errCode}, name: ${errName}]`
        );
        return false;
      }
    }

    // 2. Fallback for unkeyed callers: short 10s rolling deduplication window
    // (Never perform unbounded historical suppression across all time)
    if (params.link) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: params.userId,
          type: params.type,
          link: params.link,
          title: params.title,
          createdAt: { gte: new Date(Date.now() - 10000) },
        },
      });
      if (existing) {
        return true;
      }
    }

    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
      },
    });
    return true;
  } catch (err) {
    const errName = err instanceof Error ? err.name : "UnknownError";
    const errCode = (err as { code?: string | number })?.code ?? "UNKNOWN";
    console.error(
      `[WorkPulse Safe Notification Error] Delivery failed [type: ${params.type}, code: ${errCode}, name: ${errName}]`
    );
    return false;
  }
}
