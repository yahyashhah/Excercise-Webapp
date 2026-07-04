import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/utils/video', () => ({
  buildYouTubeSearchUrl: vi.fn((name: string) => `https://youtube.com/search?q=${name}`),
  extractYouTubeId: vi.fn(() => null),
  getYouTubeThumbnail: vi.fn(() => null),
}))

import { prisma } from '@/lib/prisma'
import {
  getExercises,
  getExercisesForPicker,
  toggleExercisePublic,
} from '../exercise.service'

const mockFindMany = vi.mocked(prisma.exercise.findMany)
const mockUpdate = vi.mocked(prisma.exercise.update)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getExercisesForPicker', () => {
  const universalEx = {
    id: '1', name: 'Squat', source: 'UNIVERSAL', organizationId: null,
    isPublic: true, bodyRegion: 'LOWER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 10, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhases: [],
  }
  const publicOrganizationEx = {
    id: '2', name: 'Band Pull', source: 'ORGANIZATION', organizationId: 'org_other',
    isPublic: true, bodyRegion: 'UPPER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 12, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhases: [],
  }
  const privateOrganizationEx = {
    id: '3', name: 'Custom Hold', source: 'ORGANIZATION', organizationId: 'org_mine',
    isPublic: false, bodyRegion: 'CORE', difficultyLevel: 'INTERMEDIATE',
    defaultReps: null, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhases: [],
  }

  it('returns all exercises for the calling organization (universal + public + own private)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicOrganizationEx, privateOrganizationEx] as any)
    const result = await getExercisesForPicker('org_mine')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'ORGANIZATION', isPublic: true },
            { source: 'ORGANIZATION', organizationId: 'org_mine' },
          ]),
        }),
      })
    )
    expect(result).toHaveLength(3)
  })

  it('works without an organizationId (falls back to universal + public only)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicOrganizationEx] as any)
    await getExercisesForPicker()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'ORGANIZATION', isPublic: true },
          ]),
        }),
      })
    )
  })
})

describe('toggleExercisePublic', () => {
  it('flips isPublic from true to false', async () => {
    mockUpdate.mockResolvedValue({ id: '3', isPublic: false } as any)
    await toggleExercisePublic('3', false)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: '3' },
      data: { isPublic: false },
    })
  })
})

describe('getExercises', () => {
  it('filters to UNIVERSAL exercises only when source is UNIVERSAL', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'UNIVERSAL' as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'UNIVERSAL' }),
      })
    )
  })

  it('filters to ORGANIZATION + organizationId when both provided', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'ORGANIZATION' as any, organizationId: 'org_abc' })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'ORGANIZATION', organizationId: 'org_abc' }),
      })
    )
  })

  it('returns no results when source is ORGANIZATION but no orgId (sentinel prevents fallthrough)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'ORGANIZATION' as any })
    const call = mockFindMany.mock.calls[0][0] as any
    // Must still filter by source=ORGANIZATION so the query never falls through to returning all exercises
    expect(call.where).toHaveProperty('source', 'ORGANIZATION')
    // organizationId sentinel ensures no real exercise matches
    expect(call.where).toHaveProperty('organizationId')
  })
})

describe('getExercises phase filtering', () => {
  it('matches exercises with any of the requested phases (hasSome)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ exercisePhases: ['MOBILITY', 'STRENGTHENING'] as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          exercisePhases: { hasSome: ['MOBILITY', 'STRENGTHENING'] },
        }),
      })
    )
  })

  it('omits the phase clause entirely when no phases are requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('exercisePhases')
  })
})
