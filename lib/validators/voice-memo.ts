import { z } from "zod"

const ALLOWED_EXTENSIONS = ["webm", "mp3", "m4a", "wav"] as const

export const presignSchema = z.object({
  workoutId: z.string().min(1),
  fileExtension: z.enum(ALLOWED_EXTENSIONS),
})

export const confirmSchema = z.object({
  workoutId: z.string().min(1),
  pendingKey: z.string().regex(/^voice-memos\/pending\/[0-9a-f-]{36}\.(webm|mp3|m4a|wav)$/),
  durationSec: z.number().int().min(1).max(300),
})

export type PresignInput = z.infer<typeof presignSchema>
export type ConfirmInput = z.infer<typeof confirmSchema>
