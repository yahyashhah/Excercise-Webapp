import { describe, it, expect } from 'vitest'
import { presignSchema, confirmSchema } from '../voice-memo'

describe('presignSchema', () => {
  it('accepts all valid extensions', () => {
    for (const ext of ['webm', 'mp3', 'm4a', 'wav']) {
      expect(presignSchema.safeParse({ workoutId: 'abc', fileExtension: ext }).success).toBe(true)
    }
  })

  it('rejects invalid extension', () => {
    expect(presignSchema.safeParse({ workoutId: 'abc', fileExtension: 'mp4' }).success).toBe(false)
    expect(presignSchema.safeParse({ workoutId: 'abc', fileExtension: '' }).success).toBe(false)
  })

  it('rejects empty workoutId', () => {
    expect(presignSchema.safeParse({ workoutId: '', fileExtension: 'webm' }).success).toBe(false)
  })
})

describe('confirmSchema', () => {
  it('accepts valid input', () => {
    expect(
      confirmSchema.safeParse({ workoutId: 'abc', pendingKey: 'voice-memos/pending/550e8400-e29b-41d4-a716-446655440000.webm', durationSec: 60 }).success
    ).toBe(true)
  })

  it('rejects durationSec > 300', () => {
    expect(
      confirmSchema.safeParse({ workoutId: 'abc', pendingKey: 'voice-memos/pending/550e8400-e29b-41d4-a716-446655440000.webm', durationSec: 301 }).success
    ).toBe(false)
  })

  it('rejects durationSec <= 0', () => {
    expect(
      confirmSchema.safeParse({ workoutId: 'abc', pendingKey: 'voice-memos/pending/550e8400-e29b-41d4-a716-446655440000.webm', durationSec: 0 }).success
    ).toBe(false)
  })

  it('rejects pendingKey without correct prefix', () => {
    const result = confirmSchema.safeParse({
      workoutId: 'abc123',
      pendingKey: 'arbitrary-key.webm',
      durationSec: 60,
    })
    expect(result.success).toBe(false)
  })
})
