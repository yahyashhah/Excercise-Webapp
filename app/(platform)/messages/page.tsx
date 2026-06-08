import { getCurrentUser } from "@/lib/current-user";
import { getInboxThreads } from "@/lib/services/message.service";
import { getPatientsForClinician, getCliniciansForPatient } from "@/lib/services/patient.service";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { MessagesInboxClient } from "@/components/messages/messages-inbox-client";
import { MessageSquare } from "lucide-react";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  const threads = await getInboxThreads(user.id);

  const contacts =
    user.role === "CLINICIAN"
      ? await getPatientsForClinician(user.id)
      : await getCliniciansForPatient(user.id);

  return (
    <div className="space-y-6">
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
        <MessagesInboxClient initialThreads={threads} currentUserId={user.id} />
      )}
    </div>
  );
}
