import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clinicalNote: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  AUDIT_ACTIONS: {
    CLINICAL_NOTE_CREATED: 'CLINICAL_NOTE_CREATED',
    CLINICAL_NOTE_UPDATED: 'CLINICAL_NOTE_UPDATED',
    CLINICAL_NOTE_DELETED: 'CLINICAL_NOTE_DELETED',
  },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { createNote, updateNote, deleteNote } from '../clinical-note.service'

const mockCreate = vi.mocked(prisma.clinicalNote.create)
const mockUpdate = vi.mocked(prisma.clinicalNote.update)
const mockDelete = vi.mocked(prisma.clinicalNote.delete)
const mockFindUnique = vi.mocked(prisma.clinicalNote.findUnique)
const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

describe('createNote', () => {
  it('logs CLINICAL_NOTE_CREATED with no field values in metadata', async () => {
    mockCreate.mockResolvedValue({ id: 'note_1', clientId: 'client_1' } as never)
    await createNote({
      clientId: 'client_1', trainerId: 'trainer_1', appointmentDate: new Date(),
      subjective: 'pain', trainerOrgId: 'org_1',
    } as never)

    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CLINICAL_NOTE_CREATED',
      targetType: 'ClinicalNote',
      targetId: 'note_1',
    }))
    const call = mockLogAudit.mock.calls[0][0]
    expect(JSON.stringify(call.metadata ?? {})).not.toContain('pain')
  })
})

describe('updateNote', () => {
  it('logs only changed field names, never values', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'note_1', trainerId: 'trainer_1', clientId: 'client_1',
      subjective: 'old pain', objective: 'same',
    } as never)
    mockUpdate.mockResolvedValue({ id: 'note_1' } as never)

    await updateNote(
      'note_1',
      'trainer_1',
      { subjective: 'new pain', objective: 'same' },
      { name: 'Jane Doe', actorType: 'TRAINER', orgId: 'org_1' }
    )

    const call = mockLogAudit.mock.calls[0][0]
    expect(call.metadata).toEqual({ changedFields: ['subjective'] })
  })
})

describe('deleteNote', () => {
  it('logs CLINICAL_NOTE_DELETED after the delete succeeds', async () => {
    mockFindUnique.mockResolvedValue({ id: 'note_1', trainerId: 'trainer_1', clientId: 'client_1' } as never)
    mockDelete.mockResolvedValue({} as never)

    await deleteNote('note_1', 'trainer_1', 'org_1')

    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICAL_NOTE_DELETED' }))
    // The delete must actually succeed before the audit row is written, so a
    // failed delete never produces a false "deleted" audit entry for this
    // PHI-adjacent record.
    expect(mockDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogAudit.mock.invocationCallOrder[0]
    )
  })

  it('does not log CLINICAL_NOTE_DELETED when the delete itself fails', async () => {
    mockFindUnique.mockResolvedValue({ id: 'note_1', trainerId: 'trainer_1', clientId: 'client_1' } as never)
    mockDelete.mockRejectedValueOnce(new Error('db error'))

    await expect(deleteNote('note_1', 'trainer_1', 'org_1')).rejects.toThrow('db error')
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
