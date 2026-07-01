"use client"

import { useRouter } from "next/navigation"
import { Mic, CheckCircle2, Clock } from "lucide-react"
import type { FeedItem } from "@/actions/voice-memo-actions"

function formatRelative(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ")
  const letters =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.slice(0, 2)
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-medium text-sm">
      {letters.toUpperCase()}
    </div>
  )
}

export function VoiceMessagesFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Mic className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No voice messages yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Client responses appear here after they complete a workout
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/60">
      {items.map((item) => (
        <button
          key={item.memoId}
          type="button"
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50"
          onClick={() => router.push(`/sessions/${item.sessionId}`)}
        >
          <Initials name={item.clientName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{item.clientName}</span>
              {!item.isRead && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.workoutName}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[11px] text-muted-foreground">
              {formatRelative(item.createdAt)}
            </span>
            {item.isRead ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
