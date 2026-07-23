"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendMessageSchema, sendBroadcastMessageSchema } from "@/lib/validators/message";
import * as messageService from "@/lib/services/message.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { pusherServer } from "@/lib/pusher";
import { threadChannel, inboxChannel } from "@/lib/pusher-channels";

type DeliveredMessage = Awaited<ReturnType<typeof messageService.sendMessage>>;

export async function broadcastNewMessage(message: DeliveredMessage) {
  const payload = {
    id: message.id,
    senderId: message.senderId,
    recipientId: message.recipientId,
    content: message.content,
    audioUrl: message.audioUrl,
    audioDurationSec: message.audioDurationSec,
    createdAt: message.createdAt.toISOString(),
    sender: {
      firstName: message.sender.firstName,
      lastName: message.sender.lastName,
      imageUrl: message.sender.imageUrl,
    },
  };

  Promise.all([
    pusherServer.trigger(threadChannel(message.senderId, message.recipientId), "new-message", payload),
    pusherServer.trigger(inboxChannel(message.recipientId), "new-message", payload),
  ]).catch((err) => console.error("[pusher] trigger failed:", err));
}

export async function sendMessageAction(input: {
  recipientId: string;
  content: string;
  planId?: string;
  planExerciseId?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const message = await messageService.sendMessage({
      senderId: dbUser.id,
      ...parsed.data,
    });

    broadcastNewMessage(message);

    revalidatePath("/messages");
    return { success: true as const, data: message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { success: false as const, error: "Failed to send message" };
  }
}

export async function markMessagesReadAction(senderId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    await messageService.markRead(senderId, dbUser.id);

    pusherServer
      .trigger(threadChannel(senderId, dbUser.id), "messages-read", { readByUserId: dbUser.id })
      .catch((err) => console.error("[pusher] trigger failed:", err));

    revalidatePath("/messages");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark messages read:", error);
    return { success: false as const, error: "Failed to mark as read" };
  }
}

export async function sendBroadcastMessageAction(input: {
  content: string;
  recipientIds?: string[];
  sendToAll?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") {
    return { success: false as const, error: "Only trainers can broadcast messages" };
  }

  const parsed = sendBroadcastMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const rosterIds = await getClientIdsForTrainer(dbUser.id);
    const rosterSet = new Set(rosterIds);

    const recipientIds = parsed.data.sendToAll
      ? rosterIds
      : (parsed.data.recipientIds ?? []).filter((id) => rosterSet.has(id));

    if (recipientIds.length === 0) {
      return { success: false as const, error: "No valid recipients" };
    }

    let sentCount = 0;
    for (const recipientId of recipientIds) {
      try {
        const message = await messageService.sendMessage({
          senderId: dbUser.id,
          recipientId,
          content: parsed.data.content,
        });
        broadcastNewMessage(message);
        sentCount += 1;
      } catch (error) {
        console.error(`Failed to send broadcast to ${recipientId}:`, error);
      }
    }

    if (sentCount === 0) {
      return { success: false as const, error: "Failed to send broadcast" };
    }

    revalidatePath("/messages");
    return { success: true as const, sentCount };
  } catch (error) {
    console.error("Failed to send broadcast:", error);
    return { success: false as const, error: "Failed to send broadcast" };
  }
}
