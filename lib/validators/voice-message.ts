import { z } from "zod"

const ALLOWED_EXTENSIONS = ["webm", "mp3", "m4a", "wav"] as const

export const presignVoiceMessageSchema = z.object({
  recipientId: z.string().min(1),
  fileExtension: z.enum(ALLOWED_EXTENSIONS),
})

export const confirmVoiceMessageSchema = z.object({
  recipientId: z.string().min(1),
  pendingKey: z.string().regex(/^voice-messages\/pending\/[0-9a-f-]{36}\.(webm|mp3|m4a|wav)$/),
  durationSec: z.number().int().min(1).max(300),
})

export type PresignVoiceMessageInput = z.infer<typeof presignVoiceMessageSchema>
export type ConfirmVoiceMessageInput = z.infer<typeof confirmVoiceMessageSchema>
