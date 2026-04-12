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
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No messages yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a conversation by clicking <strong>New Message</strong> above.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => {
            const hasUnread = thread.unreadCount > 0;
            return (
              <Link key={thread.otherUser.id} href={`/messages/${thread.otherUser.id}`}>
                <Card className={`transition-all hover:shadow-sm hover:border-primary/20 ${hasUnread ? "border-primary/30 bg-primary/5" : ""}`}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {thread.otherUser.firstName[0]}
                        {thread.otherUser.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate ${hasUnread ? "font-semibold" : "font-medium"}`}>
                          {thread.otherUser.firstName} {thread.otherUser.lastName}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(thread.lastMessage.createdAt)}
                        </span>
                      </div>
                      <p className={`truncate text-sm ${hasUnread ? "text-foreground" : "text-muted-foreground"}`}>
                        {thread.lastMessage.content}
                      </p>
                    </div>
                    {hasUnread && (
                      <Badge variant="destructive" className="h-5 min-w-5 shrink-0 justify-center px-1 text-xs">
                        {thread.unreadCount}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
