import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getInboxThreads } from "@/lib/services/message.service";
import { getPatientsForClinician, getCliniciansForPatient } from "@/lib/services/patient.service";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  const threads = await getInboxThreads(user.id);

  // Build contacts list for "New Message" dialog
  const contacts =
    user.role === "CLINICIAN"
      ? await getPatientsForClinician(user.id)
      : await getCliniciansForPatient(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Messages</h2>
          <p className="text-muted-foreground">Your conversations</p>
        </div>
        <NewMessageDialog contacts={contacts} />
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-semibold">No messages yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <strong>New Message</strong> to start a conversation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link key={thread.otherUser.id} href={`/messages/${thread.otherUser.id}`}>
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="flex items-center gap-4 p-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                    <AvatarFallback>
                      {thread.otherUser.firstName[0]}
                      {thread.otherUser.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {thread.otherUser.firstName} {thread.otherUser.lastName}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(thread.lastMessage.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {thread.lastMessage.content}
                    </p>
                  </div>
                  {thread.unreadCount > 0 && (
                    <Badge variant="destructive" className="h-5 min-w-[1.25rem] justify-center px-1 text-xs">
                      {thread.unreadCount}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
