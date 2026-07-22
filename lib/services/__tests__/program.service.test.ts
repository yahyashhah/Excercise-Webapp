import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    workout: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    workoutBlockV2: { createMany: vi.fn(), deleteMany: vi.fn() },
    blockExerciseV2: { createMany: vi.fn() },
    exerciseSet: { createMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getGlobalPrograms,
  assignGlobalProgramOrganizations,
  createProgram,
  createGlobalProgram,
  updateProgram,
} from '../program.service'

const mockFindMany = vi.mocked(prisma.program.findMany)
const mockUpdate = vi.mocked(prisma.program.update)
const mockCreate = vi.mocked(prisma.program.create)
const mockFindUnique = vi.mocked(prisma.program.findUnique)
const mockWorkoutFindMany = vi.mocked(prisma.workout.findMany)
const mockWorkoutUpdate = vi.mocked(prisma.workout.update)
const mockWorkoutDeleteMany = vi.mocked(prisma.workout.deleteMany)
const mockBlockDeleteMany = vi.mocked(prisma.workoutBlockV2.deleteMany)
const mockWorkoutCreateMany = vi.mocked(prisma.workout.createMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getGlobalPrograms', () => {
  it('queries without an organization filter when clerkOrgId is omitted', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isGlobal: true, status: { not: 'ARCHIVED' } },
      })
    )
  })

  it('filters to universal-or-matching-org programs when clerkOrgId is provided', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms('org_123')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isGlobal: true,
          status: { not: 'ARCHIVED' },
          OR: [
            { organizationIds: { isEmpty: true } },
            { organizationIds: { has: 'org_123' } },
          ],
        },
      })
    )
  })
})

describe('assignGlobalProgramOrganizations', () => {
  it('updates organizationIds scoped to isGlobal true', async () => {
    mockUpdate.mockResolvedValue({ id: 'prog_1', organizationIds: ['org_1'] } as any)

    const result = await assignGlobalProgramOrganizations('prog_1', ['org_1'])

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'prog_1', isGlobal: true },
      data: { organizationIds: ['org_1'] },
    })
    expect(result).toEqual({ id: 'prog_1', organizationIds: ['org_1'] })
  })
})

describe('createProgram', () => {
  it('does not write organizationIds even if present in input', async () => {
    mockCreate.mockResolvedValue({ id: 'prog_1' } as any)
    // createProgram re-reads the program with its tree before returning
    mockFindUnique.mockResolvedValue({ id: 'prog_1' } as any)

    await createProgram('trainer_1', {
      name: 'Test',
      isTemplate: false,
      tags: [],
      equipmentRequired: [],
      organizationIds: ['org_1'],
      workouts: [],
    } as any)

    const callArg = mockCreate.mock.calls[0][0] as any
    expect(callArg.data).not.toHaveProperty('organizationIds')
  })
})

describe('createGlobalProgram', () => {
  it('passes organizationIds through to the Prisma create call', async () => {
    mockCreate.mockResolvedValue({ id: 'prog_2' } as any)

    await createGlobalProgram({
      name: 'Test',
      isTemplate: false,
      tags: [],
      equipmentRequired: [],
      organizationIds: ['org_1', 'org_2'],
      workouts: [],
    } as any)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isGlobal: true,
          organizationIds: ['org_1', 'org_2'],
        }),
      })
    )
  })
})

describe('updateProgram', () => {
  it('never deletes a workout that has sessions attached, even when the trainer removes it from the payload', async () => {
    // DB has two workouts: "keep" (no sessions) and "hasSessions" (1 scheduled/completed session).
    mockWorkoutFindMany.mockResolvedValue([
      { id: 'wk_keep', _count: { sessions: 0 } },
      { id: 'wk_hasSessions', _count: { sessions: 1 } },
    ] as any)
    mockUpdate.mockResolvedValue({ id: 'prog_1' } as any)

    // Incoming payload only re-sends "wk_keep" — the trainer removed "wk_hasSessions" in the UI.
    await updateProgram('prog_1', {
      workouts: [
        {
          id: 'wk_keep',
          name: 'Day 1',
          dayIndex: 0,
          weekIndex: 0,
          orderIndex: 0,
          blocks: [],
        },
      ],
    } as any)

    // The buggy implementation deletes every workout for the program via
    // `{ where: { programId } }` regardless of sessions — that shape must
    // never be used. The fixed implementation must look up existing
    // workouts (to check session counts) before deciding what to delete,
    // and delete by an explicit id allowlist that excludes session-bearing
    // workouts.
    expect(mockWorkoutFindMany).toHaveBeenCalled()
    for (const call of mockWorkoutDeleteMany.mock.calls) {
      const where = call[0]?.where as any
      expect(where).not.toHaveProperty('programId')
      const idsTargeted = where?.id?.in ?? (where?.id ? [where.id] : [])
      expect(idsTargeted).not.toContain('wk_hasSessions')
    }
  })

  it('deletes a removed workout only when it has zero sessions', async () => {
    mockWorkoutFindMany.mockResolvedValue([
      { id: 'wk_keep', _count: { sessions: 0 } },
      { id: 'wk_removable', _count: { sessions: 0 } },
    ] as any)
    mockUpdate.mockResolvedValue({ id: 'prog_1' } as any)

    await updateProgram('prog_1', {
      workouts: [
        { id: 'wk_keep', name: 'Day 1', dayIndex: 0, weekIndex: 0, orderIndex: 0, blocks: [] },
      ],
    } as any)

    expect(mockWorkoutDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['wk_removable'] } },
    })
  })

  it('updates an existing workout in place by id instead of deleting and recreating it', async () => {
    mockWorkoutFindMany.mockResolvedValue([
      { id: 'wk_existing', _count: { sessions: 3 } },
    ] as any)
    mockUpdate.mockResolvedValue({ id: 'prog_1' } as any)

    await updateProgram('prog_1', {
      workouts: [
        {
          id: 'wk_existing',
          name: 'Renamed Day',
          dayIndex: 1,
          weekIndex: 0,
          orderIndex: 0,
          blocks: [],
        },
      ],
    } as any)

    // The existing row is updated in place — its id (and therefore every
    // WorkoutSessionV2 that references it) survives the save.
    expect(mockWorkoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wk_existing' },
        data: expect.objectContaining({ name: 'Renamed Day', dayIndex: 1 }),
      })
    )
    // Block/exercise/set subtree under a preserved workout id is safe to
    // replace wholesale — nothing user-generated hangs off those tables.
    expect(mockBlockDeleteMany).toHaveBeenCalledWith({
      where: { workoutId: { in: ['wk_existing'] } },
    })
    // It must NOT go through the workout-level delete+recreate path.
    expect(mockWorkoutDeleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: expect.anything() }) })
    )
  })

  it('creates a brand-new workout when the incoming item has no matching existing id', async () => {
    mockWorkoutFindMany.mockResolvedValue([] as any)
    mockUpdate.mockResolvedValue({ id: 'prog_1' } as any)

    await updateProgram('prog_1', {
      workouts: [
        { name: 'New Day', dayIndex: 0, weekIndex: 0, orderIndex: 0, blocks: [] },
      ],
    } as any)

    expect(mockWorkoutCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          programId: 'prog_1',
          name: 'New Day',
          dayIndex: 0,
          weekIndex: 0,
          orderIndex: 0,
        }),
      ],
    })
  })

  it('always reads existing workouts before issuing any delete, so the safe-removal set is never stale', async () => {
    mockWorkoutFindMany.mockResolvedValue([] as any)
    mockUpdate.mockResolvedValue({ id: 'prog_1' } as any)

    await updateProgram('prog_1', { workouts: [] } as any)

    expect(mockWorkoutFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { programId: 'prog_1' } })
    )
  })

  it('does not touch workouts at all when the payload has no workouts field (metadata-only save)', async () => {
    mockUpdate.mockResolvedValue({ id: 'prog_1' } as any)

    await updateProgram('prog_1', { name: 'Renamed Program' } as any)

    expect(mockWorkoutFindMany).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prog_1' }, data: expect.objectContaining({ name: 'Renamed Program' }) })
    )
  })
})
