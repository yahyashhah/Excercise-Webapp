import { z } from "zod"

const ALLOWED_EXTENSIONS = ["webm", "mp3", "m4a", "wav"] as const

export const presignSchema = z.object({
  workoutId: z.string().min(1),
  fileExtension: z.enum(ALLOWED_EXTENSIONS),
})

export const confirmSchema = z.object({
  workoutId: z.string().min(1),
  pendingKey: z.string().min(1),
  durationSec: z.number().int().min(1).max(300),
})

export type PresignInput = z.infer<typeof presignSchema>
export type ConfirmInput = z.infer<typeof confirmSchema>
