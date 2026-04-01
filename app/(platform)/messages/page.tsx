import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getInboxThreads } from "@/lib/services/message.service";
import { getPatientsForClinician, getCliniciansForPatient } from "@/lib/services/patient.service";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, CheckCheck } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  const threads = await getInboxThreads(user.id);

  const contacts =
    user.role === "CLINICIAN"
      ? await getPatientsForClinician(user.id)
      : await getCliniciansForPatient(user.id);

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {threads.length} conversation{threads.length !== 1 ? "s" : ""}
            {totalUnread > 0 && ` · ${totalUnread} unread`}
          </p>
        </div>
        <NewMessageDialog contacts={contacts} />
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MessageSquare className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No messages yet</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Start a conversation with a{" "}
            {user.role === "CLINICIAN" ? "client" : "clinician"}.
          </p>
          <div className="mt-5">
            <NewMessageDialog contacts={contacts} />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs divide-y divide-border/50">
          {threads.map((thread) => {
            const isUnread = thread.unreadCount > 0;
            return (
              <Link
                key={thread.otherUser.id}
                href={`/messages/${thread.otherUser.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/40 group"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                    <AvatarFallback className="bg-primary/8 text-primary font-semibold text-sm">
                      {thread.otherUser.firstName[0]}
                      {thread.otherUser.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  {isUnread && (
                    <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-blue-500 ring-2 ring-card" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-sm truncate ${isUnread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                      {thread.otherUser.firstName} {thread.otherUser.lastName}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(thread.lastMessage.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {!isUnread && <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                    <p className={`truncate text-sm ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                      {thread.lastMessage.content}
                    </p>
                  </div>
                </div>

                {isUnread && (
                  <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                    {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
