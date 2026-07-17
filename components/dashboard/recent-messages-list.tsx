import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getInboxThreads } from "@/lib/services/message.service";

type InboxThread = Awaited<ReturnType<typeof getInboxThreads>>[number];

interface RecentMessagesListProps {
  messages: InboxThread[];
}

export function RecentMessagesList({ messages }: RecentMessagesListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((thread) => (
        <Link
          key={thread.otherUser.id}
          href={`/messages/${thread.otherUser.id}`}
          className="block rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium">
              {thread.otherUser.firstName} {thread.otherUser.lastName}
            </p>
            {thread.unreadCount > 0 && (
              <Badge className="shrink-0 border-0 bg-primary text-[10px] font-semibold text-primary-foreground">
                {thread.unreadCount}
              </Badge>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/80">
            {thread.lastMessage.content}
          </p>
          <p className="mt-1.5 text-[10px] text-muted-foreground/50">
            {formatRelativeTime(thread.lastMessage.createdAt)}
          </p>
        </Link>
      ))}
    </div>
  );
}
