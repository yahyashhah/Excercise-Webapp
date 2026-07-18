import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachPackage: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { slugify } from '@/lib/utils/slug'
import { prisma } from '@/lib/prisma'
import { createSellablePackage, getSellablePackageBySlug } from '../sellable-package.service'

const mockFindFirst = vi.mocked(prisma.coachPackage.findFirst)
const mockFindUnique = vi.mocked(prisma.coachPackage.findUnique)
const mockCreate = vi.mocked(prisma.coachPackage.create)

beforeEach(() => vi.clearAllMocks())

describe('slugify', () => {
  it('lowercases, trims, and hyphenates', () => {
    expect(slugify('  Golf Back Pain! Program ')).toBe('golf-back-pain-program')
  })
  it('collapses repeated separators', () => {
    expect(slugify('Jane   & Co --- Golf')).toBe('jane-co-golf')
  })
})

describe('createSellablePackage', () => {
  it('creates a package with a unique slug derived from the name', async () => {
    mockFindUnique.mockResolvedValue(null) // slug is free
    mockCreate.mockResolvedValue({ id: 'pkg1' } as any)

    const pkg = await createSellablePackage({
      trainerId: 'trainer1',
      name: 'Golf Back Pain',
      priceInCents: 7999,
      programTemplateId: 'tmpl1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trainerId: 'trainer1',
          name: 'Golf Back Pain',
          priceInCents: 7999,
          programTemplateId: 'tmpl1',
          slug: 'golf-back-pain',
          kind: 'program',
        }),
      })
    )
    expect(pkg.id).toBe('pkg1')
  })

  it('appends a numeric suffix when the base slug is taken', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'existing' } as any) // 'golf-back-pain' taken
      .mockResolvedValueOnce(null)                       // 'golf-back-pain-2' free
    mockCreate.mockResolvedValue({ id: 'pkg2' } as any)

    await createSellablePackage({
      trainerId: 'trainer1',
      name: 'Golf Back Pain',
      priceInCents: 7999,
      programTemplateId: 'tmpl1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'golf-back-pain-2' }) })
    )
  })
})

describe('getSellablePackageBySlug', () => {
  it('returns null for an inactive or missing package', async () => {
    mockFindFirst.mockResolvedValue(null)
    expect(await getSellablePackageBySlug('nope')).toBeNull()
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'nope', isActive: true } }))
  })

  it('resolves the upsell package when present', async () => {
    mockFindFirst.mockResolvedValue({ id: 'pkg1', slug: 'golf', upsellPackageId: 'pkg2', isActive: true } as any)
    mockFindUnique.mockResolvedValue({ id: 'pkg2', slug: 'bundle', isActive: true } as any)

    const result = await getSellablePackageBySlug('golf')
    expect(result?.id).toBe('pkg1')
    expect(result?.upsell?.id).toBe('pkg2')
  })
})
