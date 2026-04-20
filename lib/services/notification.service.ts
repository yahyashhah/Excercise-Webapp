import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Notification type constants
export const NOTIFICATION_TYPES = {
  SESSION_REMINDER: "SESSION_REMINDER",
  CHECK_IN_DUE: "CHECK_IN_DUE",
  SESSION_COMPLETED: "SESSION_COMPLETED",
  MISSED_SESSION: "MISSED_SESSION",
  NEW_RESPONSE: "NEW_RESPONSE",
  NEW_MESSAGE: "NEW_MESSAGE",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  // Typed as Prisma's InputJsonValue so callers can pass plain objects
  metadata?: Prisma.InputJsonValue;
}

/**
 * Fetches the most recent notifications for a user, sorted newest first.
 */
export async function getNotificationsForUser(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Returns the count of unread notifications for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Marks a single notification as read. Validates ownership before updating
 * to prevent users from marking other users' notifications read.
 */
export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

/**
 * Marks all of a user's notifications as read in a single bulk operation.
 */
export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/**
 * Creates a new notification for a user.
 */
export async function createNotification(data: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link,
      metadata: data.metadata,
    },
  });
}

/**
 * Helper that creates a MISSED_SESSION compliance alert for a clinician.
 * Called when a patient has missed a configured number of sessions.
 */
export async function createComplianceAlert(
  clinicianId: string,
  patientName: string,
  missedCount: number
): Promise<void> {
  await createNotification({
    userId: clinicianId,
    type: NOTIFICATION_TYPES.MISSED_SESSION,
    title: "Missed Sessions Alert",
    body: `${patientName} has missed ${missedCount} session${missedCount !== 1 ? "s" : ""} in the last 14 days.`,
    link: "/patients",
    metadata: { patientName, missedCount },
  });
}
