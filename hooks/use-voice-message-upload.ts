import { useState } from "react"
import {
  generateVoiceMessageUploadUrl,
  confirmVoiceMessage,
} from "@/actions/voice-message-actions"

export type UploadState = "idle" | "uploading" | "confirming" | "done" | "error"

export function useVoiceMessageUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [error, setError] = useState<string | null>(null)

  async function upload(
    recipientId: string,
    audioBlob: Blob,
    fileExtension: string,
    durationSec: number
  ): Promise<boolean> {
    setUploadState("uploading")
    setError(null)
    try {
      const presignResult = await generateVoiceMessageUploadUrl(recipientId, fileExtension)
      if (!presignResult.success || !presignResult.data) {
        setError(presignResult.error ?? "Failed to get upload URL")
        setUploadState("error")
        return false
      }
      const { presignedUrl, pendingKey } = presignResult.data

      const uploadResp = await fetch(presignedUrl, {
        method: "PUT",
        body: audioBlob,
        headers: { "Content-Type": audioBlob.type || `audio/${fileExtension}` },
      })
      if (!uploadResp.ok) {
        setError("Upload to storage failed. Please try again.")
        setUploadState("error")
        return false
      }

      setUploadState("confirming")
      const confirmResult = await confirmVoiceMessage(recipientId, pendingKey, durationSec)
      if (!confirmResult.success) {
        setError(confirmResult.error ?? "Failed to send voice message")
        setUploadState("error")
        return false
      }

      setUploadState("done")
      return true
    } catch (err) {
      console.error("[useVoiceMessageUpload]", err)
      setError("Upload failed. Please try again.")
      setUploadState("error")
      return false
    }
  }

  function reset() {
    setUploadState("idle")
    setError(null)
  }

  return { upload, uploadState, error, reset }
}
