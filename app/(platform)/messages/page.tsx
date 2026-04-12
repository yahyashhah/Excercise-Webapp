import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getInboxThreads } from "@/lib/services/message.service";
import { getPatientsForClinician, getCliniciansForPatient } from "@/lib/services/patient.service";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";

// Deterministic gradient per contact
const threadGradients = [
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
];

function getThreadGradient(name: string) {
  return threadGradients[name.charCodeAt(0) % threadGradients.length];
}

export default async function MessagesPage() {
  const user = await getCurrentUser();
  const threads = await getInboxThreads(user.id);

  const contacts =
    user.role === "CLINICIAN"
      ? await getPatientsForClinician(user.id)
      : await getCliniciansForPatient(user.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Messages</h2>
          <p className="text-muted-foreground">
            {threads.length > 0
              ? `${threads.length} conversation${threads.length !== 1 ? "s" : ""}`
              : "Your conversations"}
          </p>
        </div>
        <NewMessageDialog contacts={contacts} />
      </div>

      {/* Thread list */}
      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">No messages yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Start a conversation by clicking <strong>New Message</strong> above.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          {threads.map((thread, i) => {
            const hasUnread = thread.unreadCount > 0;
            const fullName = `${thread.otherUser.firstName} ${thread.otherUser.lastName}`;
            const initials = `${thread.otherUser.firstName[0]}${thread.otherUser.lastName[0]}`;
            const gradient = getThreadGradient(thread.otherUser.firstName);

            return (
              <Link key={thread.otherUser.id} href={`/messages/${thread.otherUser.id}`}>
                <div
                  className={`group relative flex items-center gap-4 px-5 py-4 transition-all duration-150 hover:bg-muted/40 ${
                    hasUnread ? "bg-primary/3" : ""
                  } ${i !== 0 ? "border-t border-border/50" : ""}`}
                >
                  {/* Unread left bar */}
                  {hasUnread && (
                    <span className="absolute left-0 top-1/2 h-8 w-0.75 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11 ring-2 ring-white shadow-sm">
                      <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                      <AvatarFallback
                        className={`bg-linear-to-br ${gradient} text-sm font-bold text-white`}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {hasUnread && (
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className={`truncate text-sm transition-colors group-hover:text-primary ${
                          hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                        }`}
                      >
                        {fullName}
                      </p>
                      <span
                        className={`shrink-0 text-xs ${
                          hasUnread ? "font-medium text-primary" : "text-muted-foreground/60"
                        }`}
                      >
                        {formatRelativeTime(thread.lastMessage.createdAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 truncate text-sm leading-snug ${
                        hasUnread ? "font-medium text-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {thread.lastMessage.content}
                    </p>
                  </div>

                  {/* Unread badge */}
                  {hasUnread && (
                    <Badge
                      className="h-5 min-w-5 shrink-0 justify-center border-0 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
                    >
                      {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
