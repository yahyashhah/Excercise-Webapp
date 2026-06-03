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
    videoUrl: null, videoProvider: null, exercisePhase: null,
  }
  const publicClinicEx = {
    id: '2', name: 'Band Pull', source: 'CLINIC', organizationId: 'org_other',
    isPublic: true, bodyRegion: 'UPPER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 12, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhase: null,
  }
  const privateClinicEx = {
    id: '3', name: 'Custom Hold', source: 'CLINIC', organizationId: 'org_mine',
    isPublic: false, bodyRegion: 'CORE', difficultyLevel: 'INTERMEDIATE',
    defaultReps: null, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhase: null,
  }

  it('returns all exercises for the calling clinic (universal + public + own private)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicClinicEx, privateClinicEx] as any)
    const result = await getExercisesForPicker('org_mine')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'CLINIC', isPublic: true },
            { source: 'CLINIC', organizationId: 'org_mine' },
          ]),
        }),
      })
    )
    expect(result).toHaveLength(3)
  })

  it('works without an organizationId (falls back to universal + public only)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicClinicEx] as any)
    await getExercisesForPicker()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'CLINIC', isPublic: true },
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

  it('filters to CLINIC + organizationId when both provided', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'CLINIC' as any, organizationId: 'org_abc' })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'CLINIC', organizationId: 'org_abc' }),
      })
    )
  })

  it('returns no results when source is CLINIC but no orgId (sentinel prevents fallthrough)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'CLINIC' as any })
    const call = mockFindMany.mock.calls[0][0] as any
    // Must still filter by source=CLINIC so the query never falls through to returning all exercises
    expect(call.where).toHaveProperty('source', 'CLINIC')
    // organizationId sentinel ensures no real exercise matches
    expect(call.where).toHaveProperty('organizationId')
  })
})
