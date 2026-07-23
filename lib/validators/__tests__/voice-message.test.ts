import { describe, it, expect } from 'vitest'
import { presignVoiceMessageSchema, confirmVoiceMessageSchema } from '../voice-message'

describe('presignVoiceMessageSchema', () => {
  it('accepts all valid extensions', () => {
    for (const ext of ['webm', 'mp3', 'm4a', 'wav']) {
      expect(presignVoiceMessageSchema.safeParse({ recipientId: 'abc', fileExtension: ext }).success).toBe(true)
    }
  })

  it('rejects invalid extension', () => {
    expect(presignVoiceMessageSchema.safeParse({ recipientId: 'abc', fileExtension: 'mp4' }).success).toBe(false)
  })

  it('rejects empty recipientId', () => {
    expect(presignVoiceMessageSchema.safeParse({ recipientId: '', fileExtension: 'webm' }).success).toBe(false)
  })
})

describe('confirmVoiceMessageSchema', () => {
  it('accepts valid input', () => {
    expect(
      confirmVoiceMessageSchema.safeParse({
        recipientId: 'abc',
        pendingKey: 'voice-messages/pending/550e8400-e29b-41d4-a716-446655440000.webm',
        durationSec: 30,
      }).success
    ).toBe(true)
  })

  it('rejects durationSec > 300', () => {
    expect(
      confirmVoiceMessageSchema.safeParse({
        recipientId: 'abc',
        pendingKey: 'voice-messages/pending/550e8400-e29b-41d4-a716-446655440000.webm',
        durationSec: 301,
      }).success
    ).toBe(false)
  })

  it('rejects pendingKey without correct prefix', () => {
    expect(
      confirmVoiceMessageSchema.safeParse({
        recipientId: 'abc',
        pendingKey: 'arbitrary-key.webm',
        durationSec: 30,
      }).success
    ).toBe(false)
  })
})
