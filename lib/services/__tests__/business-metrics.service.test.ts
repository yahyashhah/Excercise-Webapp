import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    invoice: {
      aggregate: vi.fn(),
    },
    clientSubscription: {
      count: vi.fn(),
    },
    workoutSessionV2: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getMonthRanges,
  getNewClientsCount,
  getRevenueCents,
  getProgramsSold,
  getRetentionRate,
  getAverageAttendance,
  getBusinessMetrics,
} from '../business-metrics.service'

const mockUserFindMany = vi.mocked(prisma.user.findMany)
const mockUserCount = vi.mocked(prisma.user.count)
const mockInvoiceAggregate = vi.mocked(prisma.invoice.aggregate)
const mockSubscriptionCount = vi.mocked(prisma.clientSubscription.count)
const mockSessionFindMany = vi.mocked(prisma.workoutSessionV2.findMany)

// A fixed reference point so month math is deterministic across CI/local runs.
const NOW = new Date('2026-07-14T12:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getMonthRanges', () => {
  it('returns one ordered range per month ending with the current month', () => {
    const ranges = getMonthRanges(3, NOW)
    expect(ranges).toHaveLength(3)
    expect(ranges.map((r) => r.label)).toEqual(['May 2026', 'Jun 2026', 'Jul 2026'])
    // The final range brackets the current calendar month.
    expect(ranges[2].start.getMonth()).toBe(6) // July (0-indexed)
    expect(ranges[2].end.getMonth()).toBe(6)
  })
})

describe('getNewClientsCount', () => {
  it('counts clients in the org created within the window', async () => {
    mockUserCount.mockResolvedValue(5 as never)
    const start = new Date('2026-07-01')
    const end = new Date('2026-07-31')

    const result = await getNewClientsCount('org_1', start, end)

    expect(result).toBe(5)
    expect(mockUserCount).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1', role: 'CLIENT', createdAt: { gte: start, lte: end } },
    })
  })
})

describe('getRevenueCents', () => {
  it('returns 0 without querying when there are no trainers', async () => {
    const result = await getRevenueCents([], NOW, NOW)
    expect(result).toBe(0)
    expect(mockInvoiceAggregate).not.toHaveBeenCalled()
  })

  it('sums paid invoice amounts for the org trainers within the window', async () => {
    mockInvoiceAggregate.mockResolvedValue({ _sum: { amountInCents: 12500 } } as never)
    const start = new Date('2026-07-01')
    const end = new Date('2026-07-31')

    const result = await getRevenueCents(['t1', 't2'], start, end)

    expect(result).toBe(12500)
    expect(mockInvoiceAggregate).toHaveBeenCalledWith({
      _sum: { amountInCents: true },
      where: {
        status: 'PAID',
        paidAt: { gte: start, lte: end },
        subscription: { trainerId: { in: ['t1', 't2'] } },
      },
    })
  })

  it('treats a null aggregate sum (no invoices) as 0', async () => {
    mockInvoiceAggregate.mockResolvedValue({ _sum: { amountInCents: null } } as never)
    const result = await getRevenueCents(['t1'], NOW, NOW)
    expect(result).toBe(0)
  })
})

describe('getProgramsSold', () => {
  it('returns 0 without querying when there are no trainers', async () => {
    const result = await getProgramsSold([], NOW, NOW)
    expect(result).toBe(0)
    expect(mockSubscriptionCount).not.toHaveBeenCalled()
  })

  it('counts client subscriptions started in the window for the org trainers', async () => {
    mockSubscriptionCount.mockResolvedValue(3 as never)
    const start = new Date('2026-07-01')
    const end = new Date('2026-07-31')

    const result = await getProgramsSold(['t1'], start, end)

    expect(result).toBe(3)
    expect(mockSubscriptionCount).toHaveBeenCalledWith({
      where: { trainerId: { in: ['t1'] }, createdAt: { gte: start, lte: end } },
    })
  })
})

describe('getRetentionRate', () => {
  it('returns null when no clients were active in the prior month', async () => {
    // Both distinct queries resolve empty → nothing to retain.
    mockSessionFindMany.mockResolvedValue([] as never)
    const result = await getRetentionRate(['c1', 'c2'], NOW)
    expect(result).toBeNull()
  })

  it('computes the share of last-month clients still active this month', async () => {
    // Distinguish the two windows by the month of completedAt.gte.
    mockSessionFindMany.mockImplementation((args: unknown) => {
      const where = (args as { where: { completedAt: { gte: Date } } }).where
      const month = where.completedAt.gte.getMonth()
      // June (prev): c1, c2, c3 active. July (current): c1, c3 active → 2/3 retained.
      const clientIds = month === 5 ? ['c1', 'c2', 'c3'] : ['c1', 'c3']
      return Promise.resolve(clientIds.map((clientId) => ({ clientId }))) as never
    })

    const result = await getRetentionRate(['c1', 'c2', 'c3'], NOW)
    expect(result).toBe(67) // round(2/3 * 100)
  })

  it('returns 0 for empty client set without over-counting', async () => {
    const result = await getRetentionRate([], NOW)
    expect(result).toBeNull()
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })
})

describe('getAverageAttendance', () => {
  it('returns 0 without querying when there are no clients', async () => {
    const result = await getAverageAttendance([], new Date('2026-07-01'), new Date('2026-07-31'), NOW)
    expect(result).toBe(0)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('computes completed / due ratio and caps the window at now', async () => {
    mockSessionFindMany.mockResolvedValue([
      { status: 'COMPLETED', overallRPE: 5 },
      { status: 'COMPLETED', overallRPE: null },
      { status: 'MISSED', overallRPE: null },
      { status: 'SCHEDULED', overallRPE: null },
    ] as never)
    const start = new Date('2026-07-01')
    const end = new Date('2026-07-31')

    const result = await getAverageAttendance(['c1'], start, end, NOW)

    // 2 completed out of 4 due = 50%.
    expect(result).toBe(50)
    const callArgs = mockSessionFindMany.mock.calls[0][0] as {
      where: { scheduledDate: { gte: Date; lte: Date } }
    }
    // Due cutoff is min(end, now); NOW (Jul 14) precedes end (Jul 31).
    expect(callArgs.where.scheduledDate.gte).toEqual(start)
    expect(callArgs.where.scheduledDate.lte).toEqual(NOW)
  })
})

describe('getBusinessMetrics', () => {
  it('short-circuits to an empty, no-org payload when orgId is undefined', async () => {
    const result = await getBusinessMetrics({ orgId: undefined, months: 3, now: NOW })

    expect(result.hasOrganization).toBe(false)
    expect(result.revenueThisMonthCents).toBe(0)
    expect(result.newClientsThisMonth).toBe(0)
    expect(result.retentionRate).toBeNull()
    expect(result.newClientsTrend).toHaveLength(3)
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('aggregates all metrics for an organization', async () => {
    // Org membership lookups: clients then trainers.
    mockUserFindMany
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }] as never) // clients
      .mockResolvedValueOnce([{ id: 't1' }] as never) // trainers
    mockUserCount.mockResolvedValue(4 as never)
    mockInvoiceAggregate.mockResolvedValue({ _sum: { amountInCents: 9900 } } as never)
    mockSubscriptionCount.mockResolvedValue(2 as never)
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getBusinessMetrics({ orgId: 'org_1', months: 3, now: NOW })

    expect(result.hasOrganization).toBe(true)
    expect(result.revenueThisMonthCents).toBe(9900)
    expect(result.newClientsThisMonth).toBe(4)
    expect(result.programsSold).toBe(2)
    expect(result.newClientsTrend).toHaveLength(3)
    expect(result.attendanceTrend).toHaveLength(3)
  })
})
