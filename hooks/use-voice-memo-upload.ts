import { useState } from "react"
import {
  generateVoiceMemoPresignedUrl,
  confirmVoiceMemoUpload,
} from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"

export type UploadState = "idle" | "uploading" | "confirming" | "done" | "error"

export function useVoiceMemoUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [error, setError] = useState<string | null>(null)

  async function upload(
    workoutId: string,
    audioBlob: Blob,
    fileExtension: string,
    durationSec: number
  ): Promise<VoiceMemoData | null> {
    setUploadState("uploading")
    setError(null)
    try {
      const presignResult = await generateVoiceMemoPresignedUrl(workoutId, fileExtension)
      if (!presignResult.success || !presignResult.data) {
        setError(presignResult.error ?? "Failed to get upload URL")
        setUploadState("error")
        return null
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
        return null
      }

      setUploadState("confirming")
      const confirmResult = await confirmVoiceMemoUpload(workoutId, pendingKey, durationSec)
      if (!confirmResult.success || !confirmResult.data) {
        setError(confirmResult.error ?? "Failed to confirm upload")
        setUploadState("error")
        return null
      }

      setUploadState("done")
      return confirmResult.data
    } catch (err) {
      console.error("[useVoiceMemoUpload]", err)
      setError("Upload failed. Please try again.")
      setUploadState("error")
      return null
    }
  }

  function reset() {
    setUploadState("idle")
    setError(null)
  }

  return { upload, uploadState, error, reset }
}
