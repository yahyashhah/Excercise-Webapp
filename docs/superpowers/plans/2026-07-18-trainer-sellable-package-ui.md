# Trainer Self-Service "Sell This Program" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any trainer make one of their own program templates sellable (price, public link, optional bundle upsell) entirely from the UI, with no developer/script involvement.

**Architecture:** A "Sell this program" button on the existing program detail page opens a dialog. The dialog calls new server actions that wrap the sellable-package service (already partially built for the self-serve funnel) to create or update a `CoachPackage` row. No schema changes; no changes to checkout/webhook/fulfillment.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Prisma 6 + MongoDB, shadcn-style UI kit (`components/ui/*`), Vitest.

## Global Constraints

- **No git commits by the agent.** Per project rule, the user reviews and commits all changes. Every task ends at a green checkpoint; do NOT run `git commit`.
- **No schema changes.** Every field this feature needs already exists on `CoachPackage` (`priceInCents`, `slug`, `kind`, `upsellPackageId`, `isActive`, `programTemplateId`).
- **Auto-generated slugs only** (v1) — no custom-slug field. Reuse the existing `uniqueSlug` logic in `lib/services/sellable-package.service.ts`.
- **Turned-off packages 404** — this falls out for free from `getSellablePackageBySlug`'s existing `isActive: true` filter. No new code needed for it.
- **Editing price only affects future checkouts** — `createProgramCheckoutSession` already builds Stripe line items from the package's current `priceInCents` at checkout time; past purchases are never retroactively changed.
- **Ownership is always re-verified server-side** — every new action checks the calling trainer owns both the program (`isTemplate: true`, `clientId: null`, `trainerId` matches) and, for updates, the package itself.
- **Test runner:** `npm test` → `vitest run`. Run a single file with `npx vitest run <path>`.
- **No React component test framework exists in this repo** (`@testing-library/react` is not installed, no `.test.tsx` files exist outside `node_modules`). UI component tasks are verified via `npx tsc --noEmit` + manual/functional verification, not automated component tests — consistent with how the existing funnel UI (`app/p/[slug]/page.tsx`, `buy-button.tsx`) was built and verified.

---

## File Structure

**Modify:**
- `lib/services/sellable-package.service.ts` — add `getSellablePackageByProgramTemplateId`, `updateSellablePackage`
- `components/programs/program-detail-view.tsx` — add the "Sell this program" button + dialog render

**Create:**
- `lib/services/__tests__/sellable-package.service.test.ts` — extend (file already exists from the funnel work; add new `describe` blocks)
- `actions/sellable-package-actions.ts` — `getSellablePackageForProgramAction`, `getTrainerTemplatesForBundleAction`, `createSellablePackageAction`, `updateSellablePackageAction`
- `actions/__tests__/sellable-package-actions.test.ts`
- `components/programs/sell-program-dialog.tsx`

---

## Task 1: Service layer — read + update a trainer's sellable package

**Files:**
- Modify: `lib/services/sellable-package.service.ts`
- Test: `lib/services/__tests__/sellable-package.service.test.ts` (extend)

**Interfaces:**
- Consumes: existing `uniqueSlug` (private helper already in this file), `prisma` from `@/lib/prisma`.
- Produces:
  - `getSellablePackageByProgramTemplateId(programTemplateId: string, trainerId: string): Promise<(CoachPackage & { upsell: CoachPackage | null }) | null>`
  - `updateSellablePackage(packageId: string, trainerId: string, args: { priceInCents?: number; isActive?: boolean; bundle?: { programTemplateId: string; priceInCents: number } | null }): Promise<CoachPackage>` — throws `Error("Package not found")` if `packageId` doesn't exist or doesn't belong to `trainerId`. `args.bundle` is 3-state: omit it entirely to leave the bundle untouched, pass `null` to remove it, pass an object to create-or-update it.

- [ ] **Step 1: Write the failing tests**

Read the current top of `lib/services/__tests__/sellable-package.service.test.ts` first (it already has `slugify`/`createSellablePackage`/`getSellablePackageBySlug` tests and a `vi.mock('@/lib/prisma', ...)` block with `coachPackage: { findFirst, findUnique, create }`). Add `update` to that mocked `coachPackage` object, then append these new `describe` blocks and import statements:

```typescript
// Add to the existing vi.mock('@/lib/prisma', ...) coachPackage object:
//   findFirst: vi.fn(),
//   findUnique: vi.fn(),
//   create: vi.fn(),
//   update: vi.fn(),   <-- add this line

// Add to the existing import from '../sellable-package.service':
//   import { createSellablePackage, getSellablePackageBySlug, getSellablePackageByProgramTemplateId, updateSellablePackage } from '../sellable-package.service'

// Add alongside the existing mockFindFirst/mockFindUnique/mockCreate consts:
const mockUpdate = vi.mocked(prisma.coachPackage.update)

describe('getSellablePackageByProgramTemplateId', () => {
  it('returns null when the trainer has no package for that template', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await getSellablePackageByProgramTemplateId('tmpl1', 'trainer1')
    expect(result).toBeNull()
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { programTemplateId: 'tmpl1', trainerId: 'trainer1', kind: 'program' },
    })
  })

  it('returns the package with upsell: null when it has no bundle', async () => {
    mockFindFirst.mockResolvedValue({ id: 'pkg1', upsellPackageId: null } as any)
    const result = await getSellablePackageByProgramTemplateId('tmpl1', 'trainer1')
    expect(result?.id).toBe('pkg1')
    expect(result?.upsell).toBeNull()
  })

  it('resolves the bundle package when upsellPackageId is set', async () => {
    mockFindFirst.mockResolvedValue({ id: 'pkg1', upsellPackageId: 'pkg2' } as any)
    mockFindUnique.mockResolvedValue({ id: 'pkg2', kind: 'bundle' } as any)
    const result = await getSellablePackageByProgramTemplateId('tmpl1', 'trainer1')
    expect(result?.upsell?.id).toBe('pkg2')
  })
})

describe('updateSellablePackage', () => {
  it('throws when the package does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(updateSellablePackage('pkg1', 'trainer1', {})).rejects.toThrow('Package not found')
  })

  it('throws when the package belongs to a different trainer', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'someone-else' } as any)
    await expect(updateSellablePackage('pkg1', 'trainer1', {})).rejects.toThrow('Package not found')
  })

  it('updates price and isActive without touching the bundle when bundle is omitted', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: 'pkg2', name: 'Golf' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', { priceInCents: 8999, isActive: false })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pkg1' },
      data: { priceInCents: 8999, isActive: false, upsellPackageId: 'pkg2' },
    })
  })

  it('deactivates the existing bundle and clears upsellPackageId when bundle is null', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: 'pkg2', name: 'Golf' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', { bundle: null })

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'pkg2' }, data: { isActive: false } })
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: 'pkg1' },
      data: { upsellPackageId: null },
    })
  })

  it('creates a new bundle package when none existed before', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: null, name: 'Golf' } as any) // ownership check
      .mockResolvedValue(null) // uniqueSlug's collision check finds nothing
    const mockCreate = vi.mocked(prisma.coachPackage.create)
    mockCreate.mockResolvedValue({ id: 'newBundlePkg' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', {
      bundle: { programTemplateId: 'tmpl2', priceInCents: 2999 },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trainerId: 'trainer1',
        name: 'Golf Bundle',
        priceInCents: 2999,
        programTemplateId: 'tmpl2',
        kind: 'bundle',
      }),
    })
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: 'pkg1' },
      data: { upsellPackageId: 'newBundlePkg' },
    })
  })

  it('updates the existing bundle package in place when one already exists', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: 'pkg2', name: 'Golf' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', {
      bundle: { programTemplateId: 'tmpl3', priceInCents: 3499 },
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pkg2' },
      data: { programTemplateId: 'tmpl3', priceInCents: 3499, isActive: true },
    })
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: 'pkg1' },
      data: { upsellPackageId: 'pkg2' },
    })
    // Only the existing bundle is touched — no new package created
    expect(prisma.coachPackage.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/sellable-package.service.test.ts`
Expected: FAIL — `getSellablePackageByProgramTemplateId` and `updateSellablePackage` are not exported from `../sellable-package.service`.

- [ ] **Step 3: Implement both functions**

Append to `lib/services/sellable-package.service.ts` (after the existing `getSellablePackageBySlug`):

```typescript
export async function getSellablePackageByProgramTemplateId(
  programTemplateId: string,
  trainerId: string
): Promise<(CoachPackage & { upsell: CoachPackage | null }) | null> {
  const pkg = await prisma.coachPackage.findFirst({
    where: { programTemplateId, trainerId, kind: "program" },
  });
  if (!pkg) return null;
  const upsell = pkg.upsellPackageId
    ? await prisma.coachPackage.findUnique({ where: { id: pkg.upsellPackageId } })
    : null;
  return { ...pkg, upsell };
}

export async function updateSellablePackage(
  packageId: string,
  trainerId: string,
  args: {
    priceInCents?: number;
    isActive?: boolean;
    bundle?: { programTemplateId: string; priceInCents: number } | null;
  }
): Promise<CoachPackage> {
  const existing = await prisma.coachPackage.findUnique({ where: { id: packageId } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Package not found");
  }

  let upsellPackageId = existing.upsellPackageId;

  if (args.bundle === null) {
    if (upsellPackageId) {
      await prisma.coachPackage.update({ where: { id: upsellPackageId }, data: { isActive: false } });
    }
    upsellPackageId = null;
  } else if (args.bundle) {
    if (upsellPackageId) {
      await prisma.coachPackage.update({
        where: { id: upsellPackageId },
        data: {
          programTemplateId: args.bundle.programTemplateId,
          priceInCents: args.bundle.priceInCents,
          isActive: true,
        },
      });
    } else {
      const bundleSlug = await uniqueSlug(`${existing.name} Bundle`);
      const created = await prisma.coachPackage.create({
        data: {
          trainerId,
          name: `${existing.name} Bundle`,
          priceInCents: args.bundle.priceInCents,
          programTemplateId: args.bundle.programTemplateId,
          kind: "bundle",
          slug: bundleSlug,
        },
      });
      upsellPackageId = created.id;
    }
  }

  return prisma.coachPackage.update({
    where: { id: packageId },
    data: {
      ...(args.priceInCents !== undefined ? { priceInCents: args.priceInCents } : {}),
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      upsellPackageId,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/sellable-package.service.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Checkpoint (user commits).**

---

## Task 2: Server actions

**Files:**
- Create: `actions/sellable-package-actions.ts`
- Test: `actions/__tests__/sellable-package-actions.test.ts`

**Interfaces:**
- Consumes: `createSellablePackage`, `getSellablePackageByProgramTemplateId`, `updateSellablePackage` from `@/lib/services/sellable-package.service` (Task 1); `getTemplates` from `@/lib/services/program.service` (existing); `auth` from `@clerk/nextjs/server`; `prisma` from `@/lib/prisma`.
- Produces:
  - `getSellablePackageForProgramAction(programId: string): Promise<{ success: true; data: (CoachPackage & { upsell: CoachPackage | null }) | null } | { success: false; error: string }>`
  - `getTrainerTemplatesForBundleAction(excludeProgramId: string): Promise<{ success: true; data: Program[] } | { success: false; error: string }>`
  - `createSellablePackageAction(input: { programId: string; priceInCents: number; bundle?: { programTemplateId: string; priceInCents: number } }): Promise<{ success: true; data: CoachPackage } | { success: false; error: string }>`
  - `updateSellablePackageAction(input: { packageId: string; programId: string; priceInCents?: number; isActive?: boolean; bundle?: { programTemplateId: string; priceInCents: number } | null }): Promise<{ success: true; data: CoachPackage } | { success: false; error: string }>`

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/sellable-package-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/program.service', () => ({
  getTemplates: vi.fn(),
}))
vi.mock('@/lib/services/sellable-package.service', () => ({
  createSellablePackage: vi.fn(),
  getSellablePackageByProgramTemplateId: vi.fn(),
  updateSellablePackage: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getTemplates } from '@/lib/services/program.service'
import {
  createSellablePackage,
  getSellablePackageByProgramTemplateId,
  updateSellablePackage,
} from '@/lib/services/sellable-package.service'
import {
  createSellablePackageAction,
  getSellablePackageForProgramAction,
  getTrainerTemplatesForBundleAction,
  updateSellablePackageAction,
} from '../sellable-package-actions'

const trainer = { id: 'trainer1', role: 'TRAINER' }
const ownedTemplate = { id: 'prog1', trainerId: 'trainer1', isTemplate: true, clientId: null, name: 'Golf Back Pain' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'clerk_trainer1' } as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any)
})

describe('getSellablePackageForProgramAction', () => {
  it('rejects when not a trainer', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const result = await getSellablePackageForProgramAction('prog1')
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects when the program is not an owned template', async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue({ ...ownedTemplate, trainerId: 'someone-else' } as any)
    const result = await getSellablePackageForProgramAction('prog1')
    expect(result).toEqual({ success: false, error: 'Program not found' })
  })

  it('returns the resolved package for an owned template', async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue(ownedTemplate as any)
    vi.mocked(getSellablePackageByProgramTemplateId).mockResolvedValue({ id: 'pkg1' } as any)
    const result = await getSellablePackageForProgramAction('prog1')
    expect(result).toEqual({ success: true, data: { id: 'pkg1' } })
    expect(getSellablePackageByProgramTemplateId).toHaveBeenCalledWith('prog1', 'trainer1')
  })
})

describe('getTrainerTemplatesForBundleAction', () => {
  it('excludes the given program id from the trainer\'s templates', async () => {
    vi.mocked(getTemplates).mockResolvedValue([
      { id: 'prog1', name: 'Golf Back Pain' },
      { id: 'prog2', name: 'Warm-up Routine' },
    ] as any)
    const result = await getTrainerTemplatesForBundleAction('prog1')
    expect(result).toEqual({ success: true, data: [{ id: 'prog2', name: 'Warm-up Routine' }] })
  })
})

describe('createSellablePackageAction', () => {
  beforeEach(() => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue(ownedTemplate as any)
  })

  it('rejects a zero or negative price', async () => {
    const result = await createSellablePackageAction({ programId: 'prog1', priceInCents: 0 })
    expect(result).toEqual({ success: false, error: 'Price must be greater than zero' })
    expect(createSellablePackage).not.toHaveBeenCalled()
  })

  it('creates a package with no bundle', async () => {
    vi.mocked(createSellablePackage).mockResolvedValue({ id: 'pkg1' } as any)
    const result = await createSellablePackageAction({ programId: 'prog1', priceInCents: 7999 })
    expect(result).toEqual({ success: true, data: { id: 'pkg1' } })
    expect(createSellablePackage).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: 'trainer1', programTemplateId: 'prog1', priceInCents: 7999, kind: 'program' })
    )
  })

  it('creates the bundle package first, then the main package with upsellPackageId set', async () => {
    vi.mocked(prisma.program.findUnique)
      .mockResolvedValueOnce(ownedTemplate as any) // main program ownership check
      .mockResolvedValueOnce({ id: 'prog2', trainerId: 'trainer1', isTemplate: true, clientId: null, name: 'Warm-up' } as any) // bundle template ownership check
    vi.mocked(createSellablePackage)
      .mockResolvedValueOnce({ id: 'bundlePkg' } as any)
      .mockResolvedValueOnce({ id: 'mainPkg' } as any)

    const result = await createSellablePackageAction({
      programId: 'prog1',
      priceInCents: 7999,
      bundle: { programTemplateId: 'prog2', priceInCents: 2999 },
    })

    expect(result).toEqual({ success: true, data: { id: 'mainPkg' } })
    expect(createSellablePackage).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ programTemplateId: 'prog2', priceInCents: 2999, kind: 'bundle' })
    )
    expect(createSellablePackage).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ programTemplateId: 'prog1', upsellPackageId: 'bundlePkg' })
    )
  })
})

describe('updateSellablePackageAction', () => {
  it('rejects a zero or negative bundle price', async () => {
    const result = await updateSellablePackageAction({
      packageId: 'pkg1',
      programId: 'prog1',
      bundle: { programTemplateId: 'prog2', priceInCents: 0 },
    })
    expect(result).toEqual({ success: false, error: 'Bundle price must be greater than zero' })
    expect(updateSellablePackage).not.toHaveBeenCalled()
  })

  it('updates the package and returns it', async () => {
    vi.mocked(updateSellablePackage).mockResolvedValue({ id: 'pkg1', isActive: false } as any)
    const result = await updateSellablePackageAction({ packageId: 'pkg1', programId: 'prog1', isActive: false })
    expect(result).toEqual({ success: true, data: { id: 'pkg1', isActive: false } })
    expect(updateSellablePackage).toHaveBeenCalledWith('pkg1', 'trainer1', {
      priceInCents: undefined,
      isActive: false,
      bundle: undefined,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/sellable-package-actions.test.ts`
Expected: FAIL — cannot find module `../sellable-package-actions`.

- [ ] **Step 3: Implement the actions**

Create `actions/sellable-package-actions.ts`:

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import {
  createSellablePackage,
  getSellablePackageByProgramTemplateId,
  updateSellablePackage,
} from "@/lib/services/sellable-package.service";

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

async function getOwnedTemplate(programId: string, trainerId: string) {
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program || program.trainerId !== trainerId || !program.isTemplate || program.clientId) {
    return null;
  }
  return program;
}

export async function getSellablePackageForProgramAction(programId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await getOwnedTemplate(programId, user.id);
  if (!program) return { success: false as const, error: "Program not found" };

  const pkg = await getSellablePackageByProgramTemplateId(programId, user.id);
  return { success: true as const, data: pkg };
}

export async function getTrainerTemplatesForBundleAction(excludeProgramId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const templates = await programService.getTemplates(user.id);
  const filtered = templates.filter((t) => t.id !== excludeProgramId);
  return { success: true as const, data: filtered };
}

export async function createSellablePackageAction(input: {
  programId: string;
  priceInCents: number;
  bundle?: { programTemplateId: string; priceInCents: number };
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await getOwnedTemplate(input.programId, user.id);
  if (!program) return { success: false as const, error: "Program not found" };

  if (input.priceInCents <= 0) {
    return { success: false as const, error: "Price must be greater than zero" };
  }

  try {
    let upsellPackageId: string | undefined;
    if (input.bundle) {
      if (input.bundle.priceInCents <= 0) {
        return { success: false as const, error: "Bundle price must be greater than zero" };
      }
      const bundleTemplate = await getOwnedTemplate(input.bundle.programTemplateId, user.id);
      if (!bundleTemplate) {
        return { success: false as const, error: "Bundle template not found" };
      }
      const bundlePkg = await createSellablePackage({
        trainerId: user.id,
        name: `${bundleTemplate.name} Bundle`,
        priceInCents: input.bundle.priceInCents,
        programTemplateId: input.bundle.programTemplateId,
        kind: "bundle",
      });
      upsellPackageId = bundlePkg.id;
    }

    const pkg = await createSellablePackage({
      trainerId: user.id,
      name: program.name,
      priceInCents: input.priceInCents,
      programTemplateId: input.programId,
      kind: "program",
      upsellPackageId,
    });

    revalidatePath(`/programs/${input.programId}`);
    return { success: true as const, data: pkg };
  } catch (error) {
    console.error("Failed to create sellable package:", error);
    return { success: false as const, error: "Failed to create sellable package" };
  }
}

export async function updateSellablePackageAction(input: {
  packageId: string;
  programId: string;
  priceInCents?: number;
  isActive?: boolean;
  bundle?: { programTemplateId: string; priceInCents: number } | null;
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  if (input.priceInCents !== undefined && input.priceInCents <= 0) {
    return { success: false as const, error: "Price must be greater than zero" };
  }
  if (input.bundle && input.bundle.priceInCents <= 0) {
    return { success: false as const, error: "Bundle price must be greater than zero" };
  }

  try {
    const pkg = await updateSellablePackage(input.packageId, user.id, {
      priceInCents: input.priceInCents,
      isActive: input.isActive,
      bundle: input.bundle,
    });
    revalidatePath(`/programs/${input.programId}`);
    return { success: true as const, data: pkg };
  } catch (error) {
    console.error("Failed to update sellable package:", error);
    return { success: false as const, error: "Failed to update sellable package" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/sellable-package-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Checkpoint (user commits).**

---

## Task 3: The dialog component

**Files:**
- Create: `components/programs/sell-program-dialog.tsx`

**Interfaces:**
- Consumes: `createSellablePackageAction`, `getSellablePackageForProgramAction`, `getTrainerTemplatesForBundleAction`, `updateSellablePackageAction` (Task 2); `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label`; `Switch` from `@/components/ui/switch`; `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` from `@/components/ui/select`; `toast` from `sonner`.
- Produces: `SellProgramDialog({ programId, open, onOpenChange }: { programId: string; open: boolean; onOpenChange: (open: boolean) => void })` — a React component.

- [ ] **Step 1: Create the component**

Create `components/programs/sell-program-dialog.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createSellablePackageAction,
  getSellablePackageForProgramAction,
  getTrainerTemplatesForBundleAction,
  updateSellablePackageAction,
} from "@/actions/sellable-package-actions";

interface Props {
  programId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExistingPackage {
  id: string;
  slug: string;
  priceInCents: number;
  isActive: boolean;
  upsell: { programTemplateId: string | null; priceInCents: number } | null;
}

export function SellProgramDialog({ programId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<ExistingPackage | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [price, setPrice] = useState("");
  const [bundleTemplateId, setBundleTemplateId] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [pkgResult, templatesResult] = await Promise.all([
      getSellablePackageForProgramAction(programId),
      getTrainerTemplatesForBundleAction(programId),
    ]);
    if (templatesResult.success) {
      setTemplates(templatesResult.data.map((t) => ({ id: t.id as string, name: t.name as string })));
    }
    if (pkgResult.success && pkgResult.data) {
      const pkg = pkgResult.data;
      setExisting({
        id: pkg.id,
        slug: pkg.slug ?? "",
        priceInCents: pkg.priceInCents,
        isActive: pkg.isActive,
        upsell: pkg.upsell
          ? { programTemplateId: pkg.upsell.programTemplateId, priceInCents: pkg.upsell.priceInCents }
          : null,
      });
      setPrice((pkg.priceInCents / 100).toFixed(2));
      if (pkg.upsell) {
        setBundleTemplateId(pkg.upsell.programTemplateId ?? "");
        setBundlePrice((pkg.upsell.priceInCents / 100).toFixed(2));
      } else {
        setBundleTemplateId("");
        setBundlePrice("");
      }
    } else {
      setExisting(null);
      setPrice("");
      setBundleTemplateId("");
      setBundlePrice("");
    }
    setLoading(false);
  }, [programId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function parseDollars(value: string): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  async function handleSubmit() {
    const priceInCents = parseDollars(price);
    if (priceInCents === null) {
      toast.error("Enter a price greater than zero");
      return;
    }
    let bundle: { programTemplateId: string; priceInCents: number } | null | undefined;
    if (bundleTemplateId) {
      const bundlePriceInCents = parseDollars(bundlePrice);
      if (bundlePriceInCents === null) {
        toast.error("Enter a bundle price greater than zero");
        return;
      }
      bundle = { programTemplateId: bundleTemplateId, priceInCents: bundlePriceInCents };
    } else if (existing?.upsell) {
      bundle = null;
    }

    setSaving(true);
    try {
      const result = existing
        ? await updateSellablePackageAction({
            packageId: existing.id,
            programId,
            priceInCents,
            bundle,
          })
        : await createSellablePackageAction({ programId, priceInCents, bundle: bundle ?? undefined });

      if (result.success) {
        toast.success(existing ? "Sellable link updated" : "Sellable link created");
        router.refresh();
        await load();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(isActive: boolean) {
    if (!existing) return;
    setSaving(true);
    try {
      const result = await updateSellablePackageAction({
        packageId: existing.id,
        programId,
        isActive,
      });
      if (result.success) {
        toast.success(isActive ? "Now selling" : "Turned off");
        router.refresh();
        await load();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const publicUrl = existing ? `${process.env.NEXT_PUBLIC_APP_URL}/p/${existing.slug}` : "";

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Manage sellable program" : "Sell this program"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 py-4">
            {existing && (
              <div className="space-y-2">
                <Label>Public link</Label>
                <div className="flex gap-2">
                  <Input value={publicUrl} readOnly />
                  <Button type="button" variant="outline" onClick={copyLink}>
                    Copy
                  </Button>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={existing.isActive}
                    onCheckedChange={handleToggleActive}
                    disabled={saving}
                  />
                  <span className="text-sm">{existing.isActive ? "Active" : "Off"}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="79.99"
              />
            </div>
            <div className="space-y-2">
              <Label>Bundle upsell (optional)</Label>
              <Select
                value={bundleTemplateId || "none"}
                onValueChange={(v) => setBundleTemplateId(v === "none" ? "" : (v ?? ""))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No bundle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No bundle</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Create another template first to offer a bundle.
                </p>
              )}
            </div>
            {bundleTemplateId && (
              <div className="space-y-2">
                <Label>Bundle price (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  placeholder="29.99"
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving ? "Saving…" : existing ? "Save changes" : "Create sellable link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: `publicUrl` is built from `process.env.NEXT_PUBLIC_APP_URL`, not `window.location.origin` — this matches how the rest of the funnel (`lib/payments/program-checkout.ts`, `actions/program-purchase-actions.ts` — see `lib/services/program-purchase.service.ts`) builds full URLs, and avoids a server/client rendering mismatch since `window` doesn't exist during server rendering.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit 2>&1 | grep "sell-program-dialog" || echo "no errors in this file"`
Expected: `no errors in this file`.

- [ ] **Step 3: Checkpoint (user commits).**

---

## Task 4: Wire the button into the program detail page + final verification

**Files:**
- Modify: `components/programs/program-detail-view.tsx`

**Interfaces:**
- Consumes: `SellProgramDialog` (Task 3).

- [ ] **Step 1: Add the import and state**

In `components/programs/program-detail-view.tsx`, add this import alongside the existing `AssignProgramDialog` import (line 37):

```typescript
import { SellProgramDialog } from "@/components/programs/sell-program-dialog";
```

Add this state declaration alongside the existing `const [assignOpen, setAssignOpen] = useState(showAssignDialog);` (line 85):

```typescript
const [sellOpen, setSellOpen] = useState(false);
```

- [ ] **Step 2: Add the button**

In the `isTrainer` block (the one containing the existing `Duplicate` and conditional `Assign` buttons), add a "Sell this program" button right after the existing `{!clientId && (<Button onClick={() => setAssignOpen(true)}>...Assign...</Button>)}` block. It must require `isTemplate` (not just `!clientId`) since selling only makes sense for reusable templates:

```tsx
            {(program.isTemplate as boolean) && !clientId && (
              <Button variant="outline" onClick={() => setSellOpen(true)}>
                Sell this program
              </Button>
            )}
```

- [ ] **Step 3: Render the dialog**

Near the existing `<AssignProgramDialog ... />` render (around line 553), add:

```tsx
      <SellProgramDialog
        programId={program.id as string}
        open={sellOpen}
        onOpenChange={setSellOpen}
      />
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit 2>&1 | grep "program-detail-view" || echo "no errors in this file"`
Expected: `no errors in this file`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `sellable-package.service` and `sellable-package-actions` suites.

- [ ] **Step 6: Whole-repo typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this repo was confirmed tsc-clean before this feature; no new errors should appear).

- [ ] **Step 7: Manual verification**

With the dev server running (`npm run dev`) and signed in as a trainer with at least one program template:
1. Open a template's detail page. Confirm the "Sell this program" button appears (and does **not** appear on an assigned/non-template program).
2. Click it — confirm the create form appears (price + optional bundle picker).
3. Enter a price, pick a bundle template + bundle price, submit — confirm success toast, and that reopening the dialog now shows the manage view with a working `/p/<slug>` link, the price, and the bundle pre-filled.
4. Toggle the Active switch off — confirm visiting the `/p/<slug>` link now 404s. Toggle back on — confirm it works again.
5. Change the price and save — confirm the manage view reflects the new price.

- [ ] **Step 8: Checkpoint (user commits).** Feature complete.

---

## Self-Review (completed by plan author)

- **Spec coverage:** entry point + button condition (Task 4), create/manage two-state dialog (Task 3), bundle picked inline with its own price (Task 2/3), auto-generated slug — reuses existing `uniqueSlug`, no new field (Task 1), turned-off → 404 — free from existing `isActive` filter, no new code (documented in Global Constraints, verified in Task 4 Step 7), no schema changes (confirmed — only existing `CoachPackage` fields used throughout). ✔ All locked decisions map to a task.
- **Placeholder scan:** no TBD/TODO; every code step has complete code.
- **Type consistency:** `updateSellablePackage`'s `bundle?: {...} | null` 3-state signature is identical across Task 1 (definition), Task 2 (`updateSellablePackageAction` passthrough), and Task 3 (dialog's local `bundle` variable typed the same way). `getSellablePackageByProgramTemplateId` / `getTrainerTemplatesForBundleAction` / `createSellablePackageAction` / `updateSellablePackageAction` names and shapes match between their Task 2 definitions and Task 3's imports/usage. ✔
- **Scope:** single cohesive feature, no decomposition needed.
- **Deviation from the brainstormed mockup (intentional, noted for the user):** the button always reads "Sell this program" rather than dynamically showing "Selling · Active/Off" from the program list/detail page without opening the dialog. Showing that status inline would require an extra data fetch at the parent-page level (which currently has no reason to know about `CoachPackage` at all) purely to label a button. Deferred as a fast follow — the dialog itself shows full, correct status the instant it's opened.
