import { describe, it, expect } from 'vitest'
import { threadChannel, inboxChannel } from '../pusher-channels'

describe('threadChannel', () => {
  it('returns the same name regardless of argument order', () => {
    expect(threadChannel('bbb', 'aaa')).toBe('private-thread-aaa-bbb')
    expect(threadChannel('aaa', 'bbb')).toBe('private-thread-aaa-bbb')
  })

  it('sorts IDs alphabetically so both sides get the same channel name', () => {
    const a = threadChannel('user_z', 'user_a')
    const b = threadChannel('user_a', 'user_z')
    expect(a).toBe(b)
  })
})

describe('inboxChannel', () => {
  it('returns a presence channel scoped to the given userId', () => {
    expect(inboxChannel('user_123')).toBe('presence-inbox-user_123')
  })
})
