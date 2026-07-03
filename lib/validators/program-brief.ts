import { z } from "zod"

export const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const

export const CONTENT_TYPES: Record<(typeof ALLOWED_EXTENSIONS)[number], string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
}

export const presignSchema = z.object({
  fileExtension: z.enum(ALLOWED_EXTENSIONS),
})

export type PresignInput = z.infer<typeof presignSchema>
