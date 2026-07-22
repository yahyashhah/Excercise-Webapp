import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    habitDefinition: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/services/habit.service', () => ({
  logHabit: vi.fn(),
  deleteHabit: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import * as habitService from '@/lib/services/habit.service'
import { logHabitAction, deleteHabitAction } from '../habit-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHabitFindUnique = vi.mocked(prisma.habitDefinition.findUnique)
const mockLogHabit = vi.mocked(habitService.logHabit)
const mockDeleteHabit = vi.mocked(habitService.deleteHabit)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logHabitAction', () => {
  it('rejects when the caller is neither the owning client nor the assigning trainer', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'attacker_1', role: 'CLIENT' } as any)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1', trainerId: 'trainer_1' } as any)

    const result = await logHabitAction('habit_1', true)

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockLogHabit).not.toHaveBeenCalled()
  })

  it('rejects when the habit does not exist', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'client_1', role: 'CLIENT' } as any)
    mockHabitFindUnique.mockResolvedValue(null)

    const result = await logHabitAction('habit_missing', true)

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockLogHabit).not.toHaveBeenCalled()
  })

  it('allows the owning client to log their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'client_1', role: 'CLIENT' } as any)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1', trainerId: 'trainer_1' } as any)
    mockLogHabit.mockResolvedValue({ id: 'log_1' } as any)

    const result = await logHabitAction('habit_1', true)

    expect(result).toEqual({ success: true, data: { id: 'log_1' } })
    expect(mockLogHabit).toHaveBeenCalledWith('habit_1', expect.any(Date), true, undefined, undefined)
  })

  it('allows the assigning trainer to log on behalf of their client', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'trainer_1', role: 'TRAINER' } as any)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1', trainerId: 'trainer_1' } as any)
    mockLogHabit.mockResolvedValue({ id: 'log_1' } as any)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(true)
  })
})

describe('deleteHabitAction', () => {
  it('rejects when the caller does not own the habit', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'attacker_1', role: 'CLIENT' } as any)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1', trainerId: 'trainer_1' } as any)

    const result = await deleteHabitAction('habit_1')

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockDeleteHabit).not.toHaveBeenCalled()
  })

  it('allows the owning client to delete their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'client_1', role: 'CLIENT' } as any)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1', trainerId: 'trainer_1' } as any)
    mockDeleteHabit.mockResolvedValue({ id: 'habit_1' } as any)

    const result = await deleteHabitAction('habit_1')

    expect(result).toEqual({ success: true, data: undefined })
  })
})
