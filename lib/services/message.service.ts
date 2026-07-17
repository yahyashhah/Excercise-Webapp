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
    data: { isRead: true, readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.message.count({
    where: { recipientId: userId, isRead: false },
  });
}

export async function getInboxThreads(userId: string) {
  // Fetch all messages and unread counts in parallel — 2 queries total, not N+1
  const [messages, unreadGroups] = await Promise.all([
    prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      include: { sender: true, recipient: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.groupBy({
      by: ["senderId"],
      where: { recipientId: userId, isRead: false },
      _count: { id: true },
    }),
  ]);

  // Build a quick lookup: senderId → unread count
  const unreadBySender = new Map(
    unreadGroups.map((g) => [g.senderId, g._count.id])
  );

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
      threadMap.set(otherUserId, {
        otherUser: {
          id: otherUser.id,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          imageUrl: otherUser.imageUrl,
          role: otherUser.role,
        },
        lastMessage: msg,
        unreadCount: unreadBySender.get(otherUserId) ?? 0,
      });
    }
  }

  return Array.from(threadMap.values()).sort(
    (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
  );
}
