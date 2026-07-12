import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))
vi.mock('@/lib/services/program-brief.service', () => ({
  extractProgramBriefText: vi.fn(),
  extractBriefMetadata: vi.fn(),
  parseProgramBrief: vi.fn(),
}))
vi.mock('@/lib/services/program.service', () => ({
  createProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'New Program' }),
  updateProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Updated', status: 'ACTIVE' }),
  deleteProgram: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (k in after && after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { PROGRAM_CREATED: 'PROGRAM_CREATED', PROGRAM_UPDATED: 'PROGRAM_UPDATED', PROGRAM_DELETED: 'PROGRAM_DELETED' },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import * as programService from '@/lib/services/program.service'
import { createProgramAction, updateProgramAction, deleteProgramAction } from '../program-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockLogAudit = vi.mocked(logAudit)
const mockDeleteProgram = vi.mocked(programService.deleteProgram)

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('logs PROGRAM_CREATED', async () => {
  const result = await createProgramAction({ name: 'New Program' } as never)
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'PROGRAM_CREATED', targetType: 'Program', targetId: 'prog_1', orgId: 'org_1',
  }))
})

it('logs PROGRAM_UPDATED with a diff', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old', status: 'DRAFT' } as never)
  await updateProgramAction('prog_1', { name: 'Updated' } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('PROGRAM_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Old' }, after: { name: 'Updated' } })
})

it('logs PROGRAM_DELETED with the pre-fetched name, after the delete succeeds', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  const result = await deleteProgramAction('prog_1')

  expect(result).toEqual({ success: true })
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'PROGRAM_DELETED', targetLabel: 'Old',
  }))
  // The delete must actually succeed before the audit row is written, so a
  // failed delete never produces a false "deleted" audit entry.
  expect(mockDeleteProgram.mock.invocationCallOrder[0]).toBeLessThan(
    mockLogAudit.mock.invocationCallOrder[0]
  )
})

it('does not log PROGRAM_DELETED when the delete itself fails', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  mockDeleteProgram.mockRejectedValueOnce(new Error('db error'))

  const result = await deleteProgramAction('prog_1')

  expect(result).toEqual({ success: false, error: 'Failed to delete program' })
  expect(mockLogAudit).not.toHaveBeenCalled()
})
