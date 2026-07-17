import { requireRole } from "@/lib/current-user"
import { getTrainerVoiceMessageFeed } from "@/actions/voice-memo-actions"
import { VoiceMessagesFeed } from "@/components/voice-memo/VoiceMessagesFeed"
import { MessagesTabNav } from "@/components/messages/messages-tab-nav"
import { PageHeader } from "@/components/shared/page-header"

export default async function VoiceMessagesPage() {
  await requireRole("TRAINER")
  const result = await getTrainerVoiceMessageFeed()
  const items = result.data ?? []
  const unreadCount = items.filter((i) => !i.isRead).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voice Messages"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
      />
      <MessagesTabNav active="/voice-messages" />
      <div className="max-w-2xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <VoiceMessagesFeed items={items} />
      </div>
    </div>
  )
}
