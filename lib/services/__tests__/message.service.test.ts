import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { message: { updateMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { markRead } from '../message.service'

const mockUpdateMany = vi.mocked(prisma.message.updateMany)

beforeEach(() => vi.clearAllMocks())

describe('markRead', () => {
  it('sets isRead and a readAt timestamp on unread messages from the sender', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 } as any)

    await markRead('sender_id', 'recipient_id')

    expect(mockUpdateMany).toHaveBeenCalledOnce()
    const arg = mockUpdateMany.mock.calls[0][0] as any
    expect(arg.where).toEqual({ senderId: 'sender_id', recipientId: 'recipient_id', isRead: false })
    expect(arg.data.isRead).toBe(true)
    expect(arg.data.readAt).toBeInstanceOf(Date)
  })
})
