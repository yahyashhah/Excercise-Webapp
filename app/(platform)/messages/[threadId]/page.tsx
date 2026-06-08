import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getThread, markRead } from "@/lib/services/message.service";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";
import { MessageThread } from "@/components/messages/message-thread";

interface Props {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadPage({ params }: Props) {
  const { threadId } = await params;
  const user = await getCurrentUser();

  const otherUser = await prisma.user.findUnique({ where: { id: threadId } });
  if (!otherUser) notFound();

  const messages = await getThread(user.id, threadId);

  // Mark as read in DB and notify the sender via Pusher so they get a real-time read receipt
  await markRead(threadId, user.id);
  pusherServer
    .trigger(threadChannel(threadId, user.id), "messages-read", { readByUserId: user.id })
    .catch((err) => console.error("[pusher] messages-read trigger failed:", err));

  return (
    <div className="h-[calc(100vh-10rem)]">
      <MessageThread
        messages={messages}
        currentUserId={user.id}
        recipientId={threadId}
        recipientName={`${otherUser.firstName} ${otherUser.lastName}`}
      />
    </div>
  );
}
