import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    program: { findMany: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/current-user'
import { globalSearch } from '../search-actions'

const mockAuth = vi.mocked(auth)
const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockUserFindMany = vi.mocked(prisma.user.findMany)
const mockProgramFindMany = vi.mocked(prisma.program.findMany)
const mockExerciseFindMany = vi.mocked(prisma.exercise.findMany)

const TRAINER = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1' }
const CLIENT_USER = { id: 'client_1', role: 'CLIENT', clerkOrgId: 'org_1' }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ orgId: 'org_1' } as any)
})

describe('globalSearch', () => {
  it('returns empty results for empty query', async () => {
    mockGetCurrentUser.mockResolvedValue(TRAINER as any)
    const result = await globalSearch('')
    expect(result).toEqual({ clients: [], programs: [], exercises: [] })
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('returns clients, programs, exercises for trainer', async () => {
    mockGetCurrentUser.mockResolvedValue(TRAINER as any)
    mockUserFindMany.mockResolvedValue([{ id: 'c1', firstName: 'Jane', lastName: 'Doe', email: 'j@ex.com' }] as any)
    mockProgramFindMany.mockResolvedValue([{ id: 'p1', name: 'Rehab Plan', status: 'ACTIVE' }] as any)
    mockExerciseFindMany.mockResolvedValue([{ id: 'e1', name: 'Squat', bodyRegion: 'LOWER_BODY', difficultyLevel: 'BEGINNER' }] as any)

    const result = await globalSearch('Jane')
    expect(result.clients).toHaveLength(1)
    expect(result.clients[0].firstName).toBe('Jane')
    expect(result.programs).toHaveLength(1)
    expect(result.exercises).toHaveLength(1)
  })

  it('does not return clients for CLIENT role', async () => {
    mockGetCurrentUser.mockResolvedValue(CLIENT_USER as any)
    mockProgramFindMany.mockResolvedValue([] as any)
    mockExerciseFindMany.mockResolvedValue([] as any)

    const result = await globalSearch('test')
    expect(result.clients).toHaveLength(0)
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })
})
