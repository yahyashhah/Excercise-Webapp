import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireSuperAdmin } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { archiveUserAction, restoreUserAction, deleteUserAction } from '../admin-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockUserUpdate = vi.mocked(prisma.user.update)
const mockUserDelete = vi.mocked(prisma.user.delete)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1' } as any)
})

describe('archiveUserAction', () => {
  it('sets isActive false and returns success', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    const result = await archiveUserAction('user_1')
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: false },
    })
    expect(result.success).toBe(true)
  })

  it('returns error when not super admin', async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error('Forbidden'))
    const result = await archiveUserAction('user_1')
    expect(result.success).toBe(false)
    expect((result as any).error).toBeDefined()
  })
})

describe('restoreUserAction', () => {
  it('sets isActive true and returns success', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    const result = await restoreUserAction('user_1')
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: true },
    })
    expect(result.success).toBe(true)
  })
})

describe('deleteUserAction', () => {
  it('hard deletes the user and returns success', async () => {
    mockUserDelete.mockResolvedValue({} as any)
    const result = await deleteUserAction('user_1')
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: 'user_1' } })
    expect(result.success).toBe(true)
  })
})
