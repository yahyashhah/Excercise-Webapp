import { requireRole } from "@/lib/current-user"
import { getTrainerVoiceMessageFeed } from "@/actions/voice-memo-actions"
import { VoiceMessagesFeed } from "@/components/voice-memo/VoiceMessagesFeed"
import { Mic } from "lucide-react"

export default async function VoiceMessagesPage() {
  await requireRole("TRAINER")
  const result = await getTrainerVoiceMessageFeed()
  const items = result.data ?? []
  const unreadCount = items.filter((i) => !i.isRead).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <Mic className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Voice Messages</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <VoiceMessagesFeed items={items} />
      </div>
    </div>
  )
}
