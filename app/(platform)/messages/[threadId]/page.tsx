import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getThread, markRead } from "@/lib/services/message.service";
import { prisma } from "@/lib/prisma";
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

  // Mark messages from the other user as read
  await markRead(threadId, user.id);

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
