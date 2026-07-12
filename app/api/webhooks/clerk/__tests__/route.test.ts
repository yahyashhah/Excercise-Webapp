import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function () {
    return {
      verify: vi.fn((body: string) => JSON.parse(body)),
    }
  }),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([
    ['svix-id', 'id'],
    ['svix-timestamp', 'ts'],
    ['svix-signature', 'sig'],
  ])),
}))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { deleteMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

process.env.CLERK_WEBHOOK_SECRET = 'test_secret'

import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuditCreate = vi.mocked(prisma.auditLog.create)

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('session webhook events', () => {
  it('logs LOGIN on session.created for a known user', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: 'org_1',
    } as never)

    await POST(makeRequest({ type: 'session.created', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user_1',
        actorType: 'TRAINER',
        action: 'LOGIN',
        orgId: 'org_1',
      }),
    })
  })

  it('logs LOGOUT on session.ended', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: null,
    } as never)

    await POST(makeRequest({ type: 'session.ended', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOGOUT' }),
    })
  })

  it('does nothing when the user is not found locally', async () => {
    mockFindUnique.mockResolvedValue(null)
    await POST(makeRequest({ type: 'session.created', data: { user_id: 'unknown' } }))
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })
})
