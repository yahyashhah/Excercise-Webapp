import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils/dates";
import { ROUTES } from "@/lib/utils/constants";

interface MessagePreviewProps {
  thread: {
    partnerId: string;
    partnerName: string;
    lastMessage: string;
    lastMessageDate: Date;
    unreadCount: number;
  };
}

export function MessagePreview({ thread }: MessagePreviewProps) {
  const initials = thread.partnerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Link href={ROUTES.MESSAGE_THREAD(thread.partnerId)}>
      <div className="flex items-center gap-3 p-4 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors">
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate">{thread.partnerName}</p>
            <span className="text-muted-foreground text-xs shrink-0">
              {formatRelative(thread.lastMessageDate)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm truncate">
            {thread.lastMessage}
          </p>
        </div>
        {thread.unreadCount > 0 && (
          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
            {thread.unreadCount}
          </Badge>
        )}
      </div>
    </Link>
  );
}
