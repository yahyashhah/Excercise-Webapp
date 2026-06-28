import { requireRole } from "@/lib/current-user"
import { getTrainerVoiceMessageFeed } from "@/actions/voice-memo-actions"
import { VoiceMessagesFeed } from "@/components/voice-memo/VoiceMessagesFeed"

export default async function VoiceMessagesPage() {
  await requireRole("TRAINER")
  const result = await getTrainerVoiceMessageFeed()
  const items = result.data ?? []
  const unreadCount = items.filter((i) => !i.isRead).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Voice Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <VoiceMessagesFeed items={items} />
      </div>
    </div>
  )
}
