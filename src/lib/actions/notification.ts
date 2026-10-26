"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { MarkNotificationSchema } from "@/lib/validations/message";
import { NotificationType } from "@prisma/client";

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
  limit: number = 20
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

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
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
 * Server-side helper to create an in-app notification.
 * Wrapped safely so notification failures do not break primary operations.
 */
export async function createNotificationSafe(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}): Promise<boolean> {
  try {
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
    console.error("Safe notification dispatch failed:", err);
    return false;
  }
}
