import * as React from "react"

interface VoiceMemoAddedEmailProps {
  recipientName: string
  senderName: string
  workoutName: string
  sessionLink: string
  role: "trainer" | "client"
}

// Stub — full implementation in Task 5
export function VoiceMemoAddedEmail({
  recipientName,
  senderName,
  workoutName,
  sessionLink,
  role,
}: VoiceMemoAddedEmailProps): React.ReactElement {
  return React.createElement(
    "div",
    null,
    `${senderName} left a voice note on "${workoutName}" for ${recipientName}.`
  )
}
