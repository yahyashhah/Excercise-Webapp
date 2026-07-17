import { describe, it, expect, vi, beforeEach } from 'vitest'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' }) }))
vi.mock('@/lib/current-user', () => ({ isSuperAdmin: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, exercise: { findUnique: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/exercise.service', () => ({
  cloneExerciseToOrganization: vi.fn(),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { EXERCISE_CREATED: 'EXERCISE_CREATED' },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import * as exerciseService from '@/lib/services/exercise.service'
import { adoptUniversalExercisesAction } from '../exercise-actions'

const mockAuth = vi.mocked(auth)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockExerciseFindMany = vi.mocked(prisma.exercise.findMany)
const mockClone = vi.mocked(exerciseService.cloneExerciseToOrganization)
const mockLogAudit = vi.mocked(logAudit)

const universal = (id: string) => ({ id, name: `Exercise ${id}`, source: 'UNIVERSAL' })

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' } as never)
  mockUserFindUnique.mockResolvedValue(trainer as never)
  mockClone.mockImplementation(((source: { id: string; name: string }) =>
    Promise.resolve({ id: `clone_${source.id}`, name: source.name })) as never)
})

it('rejects non-trainers', async () => {
  mockUserFindUnique.mockResolvedValue({ ...trainer, role: 'CLIENT' } as never)
  const result = await adoptUniversalExercisesAction(['ex_1'])
  expect(result.success).toBe(false)
  expect(mockClone).not.toHaveBeenCalled()
})

it('rejects trainers without an organization', async () => {
  mockAuth.mockResolvedValue({ userId: 'clerk_1', orgId: null } as never)
  mockUserFindUnique.mockResolvedValue({ ...trainer, clerkOrgId: null } as never)
  const result = await adoptUniversalExercisesAction(['ex_1'])
  expect(result.success).toBe(false)
  expect(mockClone).not.toHaveBeenCalled()
})

it('adopts every universal exercise on the all-success path', async () => {
  mockExerciseFindMany.mockResolvedValue([universal('ex_1'), universal('ex_2')] as never)
  const result = await adoptUniversalExercisesAction(['ex_1', 'ex_2'])
  expect(result.success).toBe(true)
  expect(result.success && result.successCount).toBe(2)
  expect(result.success && result.failures).toEqual([])
  expect(mockClone).toHaveBeenCalledTimes(2)
  expect(mockLogAudit).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'EXERCISE_CREATED', metadata: expect.objectContaining({ count: 2 }) }),
  )
})

it('fails non-universal ids individually without aborting the batch', async () => {
  mockExerciseFindMany.mockResolvedValue([
    universal('ex_1'),
    { id: 'ex_2', name: 'Org Exercise', source: 'ORGANIZATION' },
  ] as never)
  const result = await adoptUniversalExercisesAction(['ex_1', 'ex_2'])
  expect(result.success).toBe(true)
  expect(result.success && result.successCount).toBe(1)
  expect(result.success && result.failures).toEqual([
    { id: 'ex_2', error: 'Only universal exercises can be adopted' },
  ])
  expect(mockClone).toHaveBeenCalledTimes(1)
})

it('reports missing ids as per-exercise failures', async () => {
  mockExerciseFindMany.mockResolvedValue([universal('ex_1')] as never)
  const result = await adoptUniversalExercisesAction(['ex_1', 'ex_missing'])
  expect(result.success).toBe(true)
  expect(result.success && result.successCount).toBe(1)
  expect(result.success && result.failures).toEqual([{ id: 'ex_missing', error: 'Exercise not found' }])
})

it('does not log an audit entry when nothing is adopted', async () => {
  mockExerciseFindMany.mockResolvedValue([] as never)
  const result = await adoptUniversalExercisesAction(['ex_missing'])
  expect(result.success).toBe(true)
  expect(result.success && result.successCount).toBe(0)
  expect(mockLogAudit).not.toHaveBeenCalled()
})

it('rejects an empty selection', async () => {
  const result = await adoptUniversalExercisesAction([])
  expect(result.success).toBe(false)
  expect(mockExerciseFindMany).not.toHaveBeenCalled()
})
