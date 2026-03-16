import { prisma } from "@/lib/prisma";

export async function sendMessage(data: {
  senderId: string;
  recipientId: string;
  content: string;
  planId?: string;
  planExerciseId?: string;
}) {
  return prisma.message.create({
    data,
    include: { sender: true, recipient: true },
  });
}

export async function getThread(userId1: string, userId2: string) {
  return prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId1, recipientId: userId2 },
        { senderId: userId2, recipientId: userId1 },
      ],
    },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function markRead(senderId: string, recipientId: string) {
  return prisma.message.updateMany({
    where: {
      senderId,
      recipientId,
      isRead: false,
    },
    data: { isRead: true },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.message.count({
    where: { recipientId: userId, isRead: false },
  });
}

export async function getInboxThreads(userId: string) {
  // Get all messages involving the user
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "desc" },
  });

  // Group by conversation partner
  const threadMap = new Map<
    string,
    {
      otherUser: { id: string; firstName: string; lastName: string; imageUrl: string | null; role: string };
      lastMessage: typeof messages[0];
      unreadCount: number;
    }
  >();

  for (const msg of messages) {
    const otherUserId = msg.senderId === userId ? msg.recipientId : msg.senderId;
    const otherUser = msg.senderId === userId ? msg.recipient : msg.sender;

    if (!threadMap.has(otherUserId)) {
      const unreadCount = await prisma.message.count({
        where: {
          senderId: otherUserId,
          recipientId: userId,
          isRead: false,
        },
      });

      threadMap.set(otherUserId, {
        otherUser: {
          id: otherUser.id,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          imageUrl: otherUser.imageUrl,
          role: otherUser.role,
        },
        lastMessage: msg,
        unreadCount,
      });
    }
  }

  return Array.from(threadMap.values()).sort(
    (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
  );
}
