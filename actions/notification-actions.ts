"use server";

import { getCurrentUser } from "@/lib/current-user";
import * as notificationService from "@/lib/services/notification.service";
import { revalidatePath } from "next/cache";

/**
 * Retrieves the current user's notifications (most recent 20).
 */
export async function getNotificationsAction() {
  try {
    const user = await getCurrentUser();
    const notifications = await notificationService.getNotificationsForUser(
      user.id
    );
    return { success: true as const, data: notifications };
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return { success: false as const, error: "Failed to fetch notifications" };
  }
}

/**
 * Marks a single notification as read for the current user.
 * Ownership is validated inside the service to prevent cross-user access.
 */
export async function markNotificationReadAction(notificationId: string) {
  try {
    const user = await getCurrentUser();
    await notificationService.markAsRead(notificationId, user.id);
    revalidatePath("/", "layout");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark notification read:", error);
    return { success: false as const, error: "Failed to mark as read" };
  }
}

/**
 * Marks all notifications as read for the current user.
 */
export async function markAllNotificationsReadAction() {
  try {
    const user = await getCurrentUser();
    await notificationService.markAllAsRead(user.id);
    revalidatePath("/", "layout");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark all notifications read:", error);
    return { success: false as const, error: "Failed to mark all as read" };
  }
}

/**
 * Returns the unread notification count for the current user.
 * Useful for badge display without fetching the full notification list.
 */
export async function getUnreadNotificationCountAction() {
  try {
    const user = await getCurrentUser();
    const count = await notificationService.getUnreadCount(user.id);
    return { success: true as const, data: count };
  } catch (error) {
    console.error("Failed to fetch unread count:", error);
    return { success: false as const, error: "Failed to fetch unread count" };
  }
}
