import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/pusher', () => ({
  pusherServer: { authorizeChannel: vi.fn() },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher'
import { POST } from '../route'

const mockAuth = vi.mocked(auth)
const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuthorize = vi.mocked(pusherServer.authorizeChannel)

function makeRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/api/pusher/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/pusher/auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'private-thread-a-b' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for unknown channel patterns', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_a', firstName: 'A', lastName: 'B', imageUrl: null } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'public-channel' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when user is not a participant in the thread channel', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_c', firstName: 'C', lastName: 'D', imageUrl: null } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'private-thread-user_a-user_b' }))
    expect(res.status).toBe(403)
  })

  it('authorizes a valid private thread channel when user is a participant', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_a', firstName: 'A', lastName: 'B', imageUrl: null } as any)
    mockAuthorize.mockReturnValue({ auth: 'tok' } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'private-thread-user_a-user_b' }))
    expect(res.status).toBe(200)
    expect(mockAuthorize).toHaveBeenCalledWith('s1', 'private-thread-user_a-user_b', undefined)
  })

  it('authorizes a presence inbox channel for any authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_a', firstName: 'Alice', lastName: 'Smith', imageUrl: null } as any)
    mockAuthorize.mockReturnValue({ auth: 'tok', channel_data: '{}' } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'presence-inbox-user_b' }))
    expect(res.status).toBe(200)
    expect(mockAuthorize).toHaveBeenCalledWith(
      's1',
      'presence-inbox-user_b',
      expect.objectContaining({ user_id: 'user_a' }),
    )
  })
})
