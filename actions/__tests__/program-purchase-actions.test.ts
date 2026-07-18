import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    programPurchase: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { markProgramPurchaseClaimedAction } from '../program-purchase-actions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('markProgramPurchaseClaimedAction', () => {
  it('rejects when not signed in', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    const result = await markProgramPurchaseClaimedAction('cs_1')
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(prisma.programPurchase.update).not.toHaveBeenCalled()
  })

  it('rejects when the purchase does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_buyer' } as any)
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue(null)
    const result = await markProgramPurchaseClaimedAction('cs_1')
    expect(result).toEqual({ success: false, error: 'Purchase not found' })
    expect(prisma.programPurchase.update).not.toHaveBeenCalled()
  })

  it('rejects when the signed-in user is not the purchase buyer', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_someone_else' } as any)
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({ buyerClerkId: 'clerk_buyer' } as any)
    const result = await markProgramPurchaseClaimedAction('cs_1')
    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(prisma.programPurchase.update).not.toHaveBeenCalled()
  })

  it('marks the purchase claimed when the buyer confirms', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_buyer' } as any)
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({ buyerClerkId: 'clerk_buyer' } as any)
    vi.mocked(prisma.programPurchase.update).mockResolvedValue({} as any)

    const result = await markProgramPurchaseClaimedAction('cs_1')

    expect(result).toEqual({ success: true })
    expect(prisma.programPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeCheckoutSessionId: 'cs_1' },
        data: expect.objectContaining({ accountClaimedAt: expect.any(Date) }),
      })
    )
  })
})
