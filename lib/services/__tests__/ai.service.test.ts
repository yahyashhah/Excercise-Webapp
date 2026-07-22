import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGenerateProgramEvents } = vi.hoisted(() => ({
  mockGenerateProgramEvents: vi.fn(),
}))
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateObject: vi.fn().mockResolvedValue({ object: { bestName: '' } }),
  }
})
vi.mock('@/lib/prisma', () => ({
  prisma: { exercise: { findMany: vi.fn() }, user: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/ai/utils/exercise-pool', () => ({
  filterByEquipment: vi.fn((pool: unknown[]) => pool),
}))
vi.mock('@/lib/services/program-generation.service', () => ({
  generateProgramEvents: mockGenerateProgramEvents,
}))

import { generateObject } from 'ai'
import { resolveExerciseByName, generateWorkoutPlan } from '../ai.service'
import { prisma } from '@/lib/prisma'

const mockGenerateObject = vi.mocked(generateObject)

async function* eventsOf(...events: unknown[]) {
  for (const e of events) yield e
}

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ex1',
    name: 'Squat',
    bodyRegion: 'LOWER_BODY',
    difficultyLevel: 'BEGINNER',
    equipmentRequired: [],
    contraindications: [],
    description: null,
    musclesTargeted: [],
    exercisePhases: [],
    commonMistakes: null,
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: null,
    cuesThumbnail: null,
    videoUrl: null,
    isActive: true,
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveExerciseByName', () => {
  it('returns an exact match without calling AI', async () => {
    const squat = exercise({ name: 'Squat' })
    const result = await resolveExerciseByName('Squat', [squat])
    expect(result).toEqual({ exercise: squat, matchType: 'exact' })
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })

  it('matches case/punctuation-insensitively as exact', async () => {
    const squat = exercise({ name: 'Back Squat' })
    const result = await resolveExerciseByName('back-squat', [squat])
    expect(result).toEqual({ exercise: squat, matchType: 'exact' })
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })

  it('falls back to AI-assisted fuzzy match when no exact match exists', async () => {
    const bandPull = exercise({ id: 'ex2', name: 'Band Pull Apart' })
    vi.mocked(generateObject).mockResolvedValueOnce({ object: { bestName: 'Band Pull Apart' } } as any)
    const result = await resolveExerciseByName('Pull Apart Band', [bandPull])
    expect(result).toEqual({ exercise: bandPull, matchType: 'fuzzy' })
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('returns none when the candidate list is empty', async () => {
    const result = await resolveExerciseByName('Nonexistent Move', [])
    expect(result).toEqual({ exercise: null, matchType: 'none' })
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })
})

describe('generateWorkoutPlan (sessionBlueprint path)', () => {
  it('resolves exercises directly from sessionBlueprint via a fuzzy match without warning (fuzzy matches are silent — only true non-matches are flagged)', async () => {
    const squat = exercise({ id: 'sq1', name: 'Back Squat', defaultSets: 4, defaultReps: 8 })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])
    vi.mocked(generateObject).mockResolvedValue({ object: { bestName: 'Back Squat' } } as any)

    const result = await generateWorkoutPlan({
      durationMinutes: 60,
      daysPerWeek: 1,
      difficultyLevel: 'INTERMEDIATE',
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [
            {
              name: 'Strength Block A',
              exercises: [{ name: 'Squat', sets: 4, reps: 8 }],
            },
          ],
        },
      ],
    } as any)

    expect(result.exercises).toHaveLength(1)
    expect(result.exercises[0].exerciseId).toBe('sq1')
    expect(result.warnings).toEqual([])
  })

  it('reports a warning and skips the exercise when nothing matches', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([])

    const result = await generateWorkoutPlan({
      durationMinutes: 60,
      daysPerWeek: 1,
      difficultyLevel: 'INTERMEDIATE',
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Nonexistent Move' }] }],
        },
      ],
    } as any)

    expect(result.exercises).toHaveLength(0)
    expect(result.warnings).toEqual([
      '"Nonexistent Move" has no matching exercise in the library and was skipped from "Lower Body A".',
    ])
  })
})

describe('generateWorkoutPlan (multi-week path — delegates to the pipeline)', () => {
  const weekPlanParams = {
    durationMinutes: 30,
    daysPerWeek: 1,
    difficultyLevel: 'BEGINNER',
    preferredWeekdays: ['monday'],
    weekPlan: [
      { week: 1, title: 'Foundations', rehabStage: 'EARLY_REHAB', focusAreas: ['LOWER_BODY'], difficultyLevel: 'BEGINNER', clinicalGuidance: 'g', contraindicationsThisWeek: [], progressionGoal: 'p', derivedIndicationTags: [] },
    ],
  }

  it('sorts by week/day/phase and reassigns orderIndex per day from the pipeline "done" event', async () => {
    mockGenerateProgramEvents.mockReturnValue(
      eventsOf({
        type: 'done',
        plan: {
          title: 'Plan',
          description: 'd',
          sessions: [{ dayOfWeek: 0, weekIndex: 0, name: 'Day 1' }],
          exercises: [
            { exerciseId: 'ex-cooldown', exerciseName: 'Stretch', phase: 'COOLDOWN', sets: 1, dayOfWeek: 0, weekIndex: 0, orderIndex: 9 },
            { exerciseId: 'ex-warmup', exerciseName: 'March', phase: 'WARMUP', sets: 1, dayOfWeek: 0, weekIndex: 0, orderIndex: 0 },
          ],
        },
        unfilled: [],
      })
    )

    const result = await generateWorkoutPlan(weekPlanParams as any)

    expect(result.exercises.map((e) => e.exerciseId)).toEqual(['ex-warmup', 'ex-cooldown'])
    expect(result.exercises.map((e) => e.orderIndex)).toEqual([0, 1])
  })

  it('throws when the pipeline emits a terminal error event', async () => {
    mockGenerateProgramEvents.mockReturnValue(
      eventsOf({
        type: 'error',
        kind: 'validation_exhausted',
        message: 'The AI produced no valid exercises for this program. Please try again.',
        retryable: true,
      })
    )

    await expect(generateWorkoutPlan(weekPlanParams as any)).rejects.toThrow(
      'The AI produced no valid exercises for this program. Please try again.'
    )
  })
})

describe('generateWorkoutPlan (legacy full-pool path)', () => {
  it('filters AI output to valid pool exercise IDs and sorts by day then phase', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([
      exercise({ id: 'ex1', name: 'Push Up' }),
      exercise({ id: 'ex2', name: 'Squat' }),
    ] as any)
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        title: 'Plan',
        description: 'desc',
        sessions: [{ dayOfWeek: 0, name: 'Day 1' }],
        exercises: [
          { exerciseId: 'ex1', exerciseName: 'Push Up', phase: 'COOLDOWN', sets: 3, reps: 10, dayOfWeek: 0, orderIndex: 5 },
          { exerciseId: 'unknown-id', exerciseName: 'Ghost', phase: 'WARMUP', sets: 3, reps: 10, dayOfWeek: 0, orderIndex: 0 },
          { exerciseId: 'ex2', exerciseName: 'Squat', phase: 'WARMUP', sets: 3, reps: 10, dayOfWeek: 0, orderIndex: 1 },
        ],
      },
    } as any)

    const result = await generateWorkoutPlan({
      durationMinutes: 30,
      daysPerWeek: 1,
      difficultyLevel: 'BEGINNER',
      exercisesPerSession: 2,
    } as any)

    // "unknown-id" is filtered out (not in pool); WARMUP sorts before COOLDOWN
    expect(result.exercises.map((e) => e.exerciseId)).toEqual(['ex2', 'ex1'])
    expect(result.exercises.map((e) => e.orderIndex)).toEqual([0, 1])
  })

  it('throws when the AI returns no exercises matching the pool', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([exercise({ id: 'ex1' })] as any)
    mockGenerateObject.mockResolvedValueOnce({
      object: { title: 'Plan', description: 'd', sessions: [], exercises: [] },
    } as any)

    await expect(
      generateWorkoutPlan({
        durationMinutes: 30,
        daysPerWeek: 1,
        difficultyLevel: 'BEGINNER',
      } as any)
    ).rejects.toThrow('AI generated no valid exercises.')
  })

  it('throws before calling the model when no exercises exist for the focus areas', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([])

    await expect(
      generateWorkoutPlan({
        durationMinutes: 30,
        daysPerWeek: 1,
        difficultyLevel: 'BEGINNER',
      } as any)
    ).rejects.toThrow('No suitable exercises found')
  })
})
