# Assign Global Programs to Specific Clinics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super admin restrict a global (template) program's visibility to specific clinics (Clerk Organizations), instead of it always being available to every organization.

**Architecture:** Add an `organizationIds: String[]` field to `Program` (empty = universal, non-empty = restricted to those clinics). A new admin service function lists real Clerk Organizations for the picker UI. A new admin action writes the restriction list, gated by `requireSuperAdmin()`. The trainer-facing global-programs query gains an optional org filter. All new UI reuses existing dialog/dropdown patterns already in `app/admin/global-programs/`.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma (MongoDB), Clerk (`@clerk/nextjs/server`), Zod, Vitest, Tailwind, shadcn/ui.

## Global Constraints

- Authorization boundary for the new admin action is `requireSuperAdmin()` from `lib/current-user.ts` (same as every other function in `actions/global-program-actions.ts`).
- `organizationIds` is only ever read/written for programs where `isGlobal: true` — enforce this via the Prisma `where` clause, not application-level branching (mirrors `updateGlobalProgram`/`deleteGlobalProgram`/`pushGlobalProgramUpdate`).
- `listClerkOrganizations()` fetches at most 100 organizations in one call — acceptable at current scale; do not silently extend this without adding pagination.
- This codebase only unit-tests server-side logic (`actions/`, `lib/services/`, `lib/validators/`, `lib/utils/`) via Vitest — no jsdom/testing-library setup exists. Do not add component tests for `.tsx` files; verify those manually via the dev server.
- **Never run `git add` or `git commit`.** The user reviews all changes and commits them personally. Every task ends with a verification step, not a commit step.

---

### Task 1: Schema — add `organizationIds` to `Program`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Program.organizationIds: string[]` field, relied on by Tasks 2, 4, 6, 7, 8.

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, find the `Program` model (starts at the line with `model Program {`). Add `organizationIds` right after `equipmentRequired`:

```prisma
  equipmentRequired String[] @default([])
  organizationIds  String[] @default([])
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run:
```bash
npm run db:push
npx prisma generate
```
Expected: both commands complete without errors. `db:push` reports the `Program` collection is in sync (MongoDB has no migrations, so this is additive and non-destructive — existing documents simply don't have the field until written).

- [ ] **Step 3: Verify the generated client knows the field**

Run:
```bash
grep -n "organizationIds" node_modules/.prisma/client/index.d.ts | head -5
```
Expected: at least one match referencing `Program`.

---

### Task 2: `program.service.ts` — org-scoped visibility and assignment

**Files:**
- Modify: `lib/services/program.service.ts:319-327` (the existing `getGlobalPrograms`)
- Create: `lib/services/__tests__/program.service.test.ts`

**Interfaces:**
- Consumes: `Prisma.ProgramWhereInput` (already imported in this file as `Prisma` from `@prisma/client`), `Program.organizationIds` (Task 1).
- Produces: `getGlobalPrograms(clerkOrgId?: string)` (modified signature, consumed by Task 5) and `assignGlobalProgramOrganizations(programId: string, organizationIds: string[]): Promise<Program>` (new, consumed by Task 3).

- [ ] **Step 1: Write the failing tests**

Create `lib/services/__tests__/program.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getGlobalPrograms, assignGlobalProgramOrganizations } from '../program.service'

const mockFindMany = vi.mocked(prisma.program.findMany)
const mockUpdate = vi.mocked(prisma.program.update)

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program.service.test.ts`
Expected: FAIL — `assignGlobalProgramOrganizations` is not exported yet, and the org-filter test fails because `getGlobalPrograms` doesn't accept an argument.

- [ ] **Step 3: Implement the changes**

In `lib/services/program.service.ts`, replace the existing `getGlobalPrograms` (lines 321-327):

```ts
export async function getGlobalPrograms() {
  return prisma.program.findMany({
    where: { isGlobal: true, status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}
```

with:

```ts
export async function getGlobalPrograms(clerkOrgId?: string) {
  const where: Prisma.ProgramWhereInput = {
    isGlobal: true,
    status: { not: "ARCHIVED" },
  };
  if (clerkOrgId) {
    where.OR = [
      { organizationIds: { isEmpty: true } },
      { organizationIds: { has: clerkOrgId } },
    ];
  }

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}
```

Then add this new function directly after `pushGlobalProgramUpdate` (which ends around line 468, right before `deleteGlobalProgram`):

```ts
export async function assignGlobalProgramOrganizations(
  id: string,
  organizationIds: string[]
) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { organizationIds },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program.service.test.ts`
Expected: PASS — all 3 tests green.

---

### Task 3: `admin.service.ts` — list real Clerk Organizations

**Files:**
- Modify: `lib/services/admin.service.ts` (add import + new function)
- Create: `lib/services/__tests__/admin.service.test.ts`

**Interfaces:**
- Consumes: `clerkClient` from `@clerk/nextjs/server` (already used the same way in `actions/organization-actions.ts`).
- Produces: `listClerkOrganizations(): Promise<{ id: string; name: string }[]>` — consumed by Task 5 (admin page) and Task 6 (dialog props).

- [ ] **Step 1: Write the failing test**

Create `lib/services/__tests__/admin.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetOrganizationList = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    organizations: { getOrganizationList: mockGetOrganizationList },
  })),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { listClerkOrganizations } from '../admin.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listClerkOrganizations', () => {
  it('maps Clerk organizations to id/name pairs, requesting up to 100', async () => {
    mockGetOrganizationList.mockResolvedValue({
      data: [
        { id: 'org_1', name: 'Riverside Clinic' },
        { id: 'org_2', name: 'Downtown PT' },
      ],
      totalCount: 2,
    })

    const result = await listClerkOrganizations()

    expect(mockGetOrganizationList).toHaveBeenCalledWith({ limit: 100 })
    expect(result).toEqual([
      { id: 'org_1', name: 'Riverside Clinic' },
      { id: 'org_2', name: 'Downtown PT' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/__tests__/admin.service.test.ts`
Expected: FAIL — `listClerkOrganizations` is not exported yet.

- [ ] **Step 3: Implement `listClerkOrganizations`**

In `lib/services/admin.service.ts`, add to the top import block:

```ts
import { clerkClient } from "@clerk/nextjs/server";
```

Then add this function anywhere at the top level (e.g. right after `getPlatformStats`):

```ts
export async function listClerkOrganizations() {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationList({ limit: 100 });
  return data.map((org) => ({ id: org.id, name: org.name }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/services/__tests__/admin.service.test.ts`
Expected: PASS.

---

### Task 4: Admin action — `assignGlobalProgramOrganizationsAction`

**Files:**
- Modify: `actions/global-program-actions.ts`
- Create: `actions/__tests__/global-program-actions.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` (`@/lib/current-user`), `programService.assignGlobalProgramOrganizations` (Task 2).
- Produces: `assignGlobalProgramOrganizationsAction(programId: string, organizationIds: string[]): Promise<{success: true} | {success: false, error: string}>` — consumed by Task 6 (dialog).

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/global-program-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  assignGlobalProgramOrganizations: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { requireSuperAdmin } from '@/lib/current-user'
import * as programService from '@/lib/services/program.service'
import { revalidatePath } from 'next/cache'
import { assignGlobalProgramOrganizationsAction } from '../global-program-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockAssign = vi.mocked(programService.assignGlobalProgramOrganizations)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1' } as any)
})

describe('assignGlobalProgramOrganizationsAction', () => {
  it('checks super admin, assigns organizations, and revalidates', async () => {
    mockAssign.mockResolvedValue({ id: 'prog_1' } as any)

    const result = await assignGlobalProgramOrganizationsAction('prog_1', ['org_1', 'org_2'])

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockAssign).toHaveBeenCalledWith('prog_1', ['org_1', 'org_2'])
    expect(revalidatePath).toHaveBeenCalledWith('/admin/global-programs')
    expect(result).toEqual({ success: true })
  })

  it('returns a generic error when the service call throws', async () => {
    mockAssign.mockRejectedValue(new Error('db down'))

    const result = await assignGlobalProgramOrganizationsAction('prog_1', ['org_1'])

    expect(result).toEqual({ success: false, error: 'Failed to assign program to clinics' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/global-program-actions.test.ts`
Expected: FAIL — `assignGlobalProgramOrganizationsAction` is not exported yet.

- [ ] **Step 3: Implement the action**

In `actions/global-program-actions.ts`, add this function at the end of the file:

```ts
export async function assignGlobalProgramOrganizationsAction(
  programId: string,
  organizationIds: string[]
) {
  await requireSuperAdmin();

  try {
    await programService.assignGlobalProgramOrganizations(programId, organizationIds);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to assign program to clinics:", error);
    return { success: false as const, error: "Failed to assign program to clinics" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/global-program-actions.test.ts`
Expected: PASS — both tests green.

---

### Task 5: Trainer-facing visibility filter wired in

**Files:**
- Modify: `app/(platform)/programs/page.tsx:31`

**Interfaces:**
- Consumes: `programService.getGlobalPrograms(clerkOrgId?: string)` (Task 2), `user.clerkOrgId` (already present on the `dbUser` returned by `getCurrentUser()`).
- Produces: nothing consumed by later tasks — this closes the loop for trainers.

- [ ] **Step 1: Pass the trainer's clerkOrgId through**

In `app/(platform)/programs/page.tsx`, replace line 31:

```ts
    user.role === "TRAINER" ? programService.getGlobalPrograms() : Promise.resolve([]),
```

with:

```ts
    user.role === "TRAINER" ? programService.getGlobalPrograms(user.clerkOrgId ?? undefined) : Promise.resolve([]),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `app/(platform)/programs/page.tsx`.

---

### Task 6: `AssignClinicsDialog` component

**Files:**
- Create: `app/admin/global-programs/assign-clinics-dialog.tsx`

**Interfaces:**
- Consumes: `assignGlobalProgramOrganizationsAction` (Task 4), `Checkbox`/`Dialog`/`Button`/`Label` from `@/components/ui/*` (all pre-existing).
- Produces: `AssignClinicsDialog` component — consumed by Task 7.

- [ ] **Step 1: Create the dialog**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignGlobalProgramOrganizationsAction } from "@/actions/global-program-actions";

interface Props {
  programId: string;
  clinics: { id: string; name: string }[];
  currentOrganizationIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignClinicsDialog({
  programId,
  clinics,
  currentOrganizationIds,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(currentOrganizationIds);
  const [saving, setSaving] = useState(false);

  function toggle(clinicId: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...prev, clinicId] : prev.filter((id) => id !== clinicId)
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await assignGlobalProgramOrganizationsAction(programId, selected);
      if (result.success) {
        toast.success(
          selected.length === 0
            ? "Program is now available to all clinics"
            : `Program assigned to ${selected.length} clinic${selected.length === 1 ? "" : "s"}`
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to Clinics</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Leave every clinic unchecked to keep this program available to all organizations.
          </p>
          {clinics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clinics found.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {clinics.map((clinic) => (
                <div key={clinic.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`clinic-${clinic.id}`}
                    checked={selected.includes(clinic.id)}
                    onCheckedChange={(checked) => toggle(clinic.id, checked === true)}
                  />
                  <Label htmlFor={`clinic-${clinic.id}`} className="font-normal">
                    {clinic.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `assign-clinics-dialog.tsx`.

---

### Task 7: `GlobalProgramActions` — wire in the dialog

**Files:**
- Modify: `app/admin/global-programs/global-program-actions.tsx`

**Interfaces:**
- Consumes: `AssignClinicsDialog` (Task 6).
- Produces: `GlobalProgramActions` now requires two new required props (`clinics`, `currentOrganizationIds`) — consumed by Task 8.

- [ ] **Step 1: Update imports and props**

Replace lines 1-22:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  pushGlobalProgramUpdateAction,
  deleteGlobalProgramAction,
} from "@/actions/global-program-actions";

interface Props {
  programId: string;
  programName: string;
}
```

with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Send, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  pushGlobalProgramUpdateAction,
  deleteGlobalProgramAction,
} from "@/actions/global-program-actions";
import { AssignClinicsDialog } from "./assign-clinics-dialog";

interface Props {
  programId: string;
  programName: string;
  clinics: { id: string; name: string }[];
  currentOrganizationIds: string[];
}
```

- [ ] **Step 2: Add `assignOpen` state and destructure the new props**

Replace line 24:

```tsx
export function GlobalProgramActions({ programId, programName }: Props) {
```

with:

```tsx
export function GlobalProgramActions({
  programId,
  programName,
  clinics,
  currentOrganizationIds,
}: Props) {
```

Then replace line 26:

```tsx
  const [loading, setLoading] = useState(false);
```

with:

```tsx
  const [loading, setLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
```

- [ ] **Step 3: Add the dropdown item and render the dialog**

Replace the final return block (lines 59-87):

```tsx
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={loading}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(`/admin/global-programs/${programId}/edit`)} className="flex items-center gap-2">
          <Pencil className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePushUpdate} className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          Push Update Notification
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="flex items-center gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

with:

```tsx
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={loading}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/admin/global-programs/${programId}/edit`)} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAssignOpen(true)} className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Assign to Clinics
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePushUpdate} className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Push Update Notification
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AssignClinicsDialog
        programId={programId}
        clinics={clinics}
        currentOrganizationIds={currentOrganizationIds}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors will appear at this point in `app/admin/global-programs/page.tsx` (Task 8 not done yet) complaining `clinics`/`currentOrganizationIds` are missing — that's expected and resolved by Task 8.

---

### Task 8: Admin Global Programs page — fetch clinics and pass props

**Files:**
- Modify: `app/admin/global-programs/page.tsx`

**Interfaces:**
- Consumes: `listClerkOrganizations` (Task 3), `GlobalProgramActions` new props (Task 7).
- Produces: nothing consumed by later tasks (final wiring task).

- [ ] **Step 1: Import `listClerkOrganizations` and fetch it alongside programs**

Replace line 2:

```tsx
import { getAdminGlobalPrograms } from "@/lib/services/admin.service";
```

with:

```tsx
import { getAdminGlobalPrograms, listClerkOrganizations } from "@/lib/services/admin.service";
```

Replace lines 19-23:

```tsx
  const { items: programs, total, totalPages } = await getAdminGlobalPrograms({
    page,
    pageSize: 25,
    search,
  });
```

with:

```tsx
  const [{ items: programs, total, totalPages }, clinics] = await Promise.all([
    getAdminGlobalPrograms({ page, pageSize: 25, search }),
    listClerkOrganizations(),
  ]);
```

- [ ] **Step 2: Pass the new props to `GlobalProgramActions`**

Replace line 109:

```tsx
                    <GlobalProgramActions programId={prog.id} programName={prog.name} />
```

with:

```tsx
                    <GlobalProgramActions
                      programId={prog.id}
                      programName={prog.name}
                      clinics={clinics}
                      currentOrganizationIds={prog.organizationIds}
                    />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new tests from Tasks 2, 3, and 4, with no regressions in the pre-existing suite.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end manual pass**

With `npm run dev` running:
1. As a super admin, go to `/admin/global-programs`, open the ⋮ menu on any program, click "Assign to Clinics." Confirm the dialog lists real Clerk organization names (not trainer names) and starts fully unchecked.
2. Check one clinic, click Save. Confirm the success toast says "Program assigned to 1 clinic."
3. As a trainer belonging to that checked clinic, go to `/programs` → Templates tab, confirm the program appears.
4. As a trainer belonging to a *different* clinic, confirm the same program does NOT appear in their Templates tab.
5. Back in admin, uncheck the clinic and Save. Confirm the toast says "Program is now available to all clinics," and both trainers from steps 3–4 now see it again.
6. Confirm a global program that was never assigned to any clinic is visible to every trainer throughout (regression check on the default/empty-array case).

Leave all changes uncommitted — do not run `git add` or `git commit`. The user will review the diff and commit it themselves.
