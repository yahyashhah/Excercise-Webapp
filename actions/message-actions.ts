"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendMessageSchema } from "@/lib/validators/message";
import * as messageService from "@/lib/services/message.service";

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
    revalidatePath("/messages");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark messages read:", error);
    return { success: false as const, error: "Failed to mark as read" };
  }
}
