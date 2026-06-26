"use client"

import { useEffect, useState } from "react"
import Pusher from "pusher-js"

interface VoiceMessagesNavBadgeProps {
  initialUnread: number
  trainerClerkId: string
}

export function VoiceMessagesNavBadge({
  initialUnread,
  trainerClerkId,
}: VoiceMessagesNavBadgeProps) {
  const [unread, setUnread] = useState(initialUnread)

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    })
    const channel = pusher.subscribe(`trainer-${trainerClerkId}`)

    channel.bind("client-voice-memo-added", () => {
      setUnread((n) => n + 1)
    })
    channel.bind("voice-memo-read", () => {
      setUnread((n) => Math.max(0, n - 1))
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(`trainer-${trainerClerkId}`)
      pusher.disconnect()
    }
  }, [trainerClerkId])

  if (unread === 0) return null

  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[11px] font-bold text-white">
      {unread > 99 ? "99+" : unread}
    </span>
  )
}
