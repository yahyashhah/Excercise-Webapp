# Admin Program Click-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super admin click into Global Programs to edit them, and click into any trainer's program in the admin "All Programs" table to view, edit, and assign it — without touching trainer-facing permissions or UI.

**Architecture:** Two small JSX changes make existing list rows clickable. A new `actions/admin-program-actions.ts` file (gated by `requireSuperAdmin()`, mirroring the existing `actions/global-program-actions.ts` pattern) supplies admin-authorized update/assign operations that reuse the same `program.service.ts` functions trainers already use. Two new routes (`/admin/programs/[id]` and `/admin/programs/[id]/edit`) reuse the existing `ProgramDetailView` and `ProgramEditor` components via small additive props, so trainer-facing behavior is provably unchanged when those props are omitted.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma, Zod, Vitest, React Server/Client Components, Tailwind.

## Global Constraints

- Authorization boundary for all new admin actions is `requireSuperAdmin()` from `lib/current-user.ts` — no `trainerId` ownership check (mirrors `actions/global-program-actions.ts`, not `actions/program-actions.ts`).
- Reuse existing service functions (`programService.updateProgram`, `programService.assignProgram`, `programService.getProgramById`) — do not duplicate their logic.
- All changes to shared components (`ProgramDetailView`, `AssignProgramDialog`) must be additive (new optional props with safe defaults) — zero behavior change when the new props are omitted, since the trainer-facing pages don't pass them.
- This codebase only unit-tests server-side logic (`actions/`, `lib/services/`, `lib/validators/`, `lib/utils/`) via Vitest — there is no component-testing setup (no jsdom/testing-library). Do not add component tests for `.tsx` UI files; verify those manually via the dev server per the "Manual verification" task at the end.
- **Never run `git add` or `git commit`.** The user reviews all changes and commits them personally. Every task ends with a verification step, not a commit step.

---

### Task 1: Global Programs table — clickable row

**Files:**
- Modify: `app/admin/global-programs/page.tsx:80-92`

**Interfaces:**
- Consumes: nothing new — `Link` is already imported in this file (`import Link from "next/link";`, line 6). The target route `/admin/global-programs/[id]/edit` already exists.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Wrap the program name cell in a Link**

In `app/admin/global-programs/page.tsx`, replace lines 80-92:

```tsx
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{prog.name}</p>
                    {prog.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                    )}
                    {prog.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {prog.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
```

with:

```tsx
                  <td className="px-5 py-3">
                    <Link href={`/admin/global-programs/${prog.id}/edit`} className="group block">
                      <p className="font-medium text-foreground group-hover:underline">{prog.name}</p>
                      {prog.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                      )}
                      {prog.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prog.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </td>
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, sign in as a super admin, visit `/admin/global-programs`.
Expected: hovering the program name underlines it (cursor is a pointer); clicking it navigates to `/admin/global-programs/{id}/edit` and the existing editor loads. The ⋮ menu's Push Update / Archive actions still work.

---

### Task 2: Admin-authorized program actions (`actions/admin-program-actions.ts`)

**Files:**
- Create: `actions/admin-program-actions.ts`
- Test: `actions/__tests__/admin-program-actions.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` (`@/lib/current-user`), `programService.updateProgram(id, data)` and `programService.assignProgram(programId, clientId, startDate: Date)` (`@/lib/services/program.service`), `updateProgramSchema` / `assignProgramSchema` / `UpdateProgramInput` (`@/lib/validators/program`), `revalidatePath` (`next/cache`).
- Produces: `updateAdminProgramAction(programId: string, input: UpdateProgramInput): Promise<{success: true, data: unknown} | {success: false, error: string}>` and `assignAdminProgramAction(input: {programId: string; clientId: string; startDate: string}): Promise<{success: true, data: unknown} | {success: false, error: string}>` — consumed by Task 5 (editor wrapper) and Task 6 (detail page).

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/admin-program-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  updateProgram: vi.fn(),
  assignProgram: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireSuperAdmin } from '@/lib/current-user'
import * as programService from '@/lib/services/program.service'
import { revalidatePath } from 'next/cache'
import { updateAdminProgramAction, assignAdminProgramAction } from '../admin-program-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockUpdateProgram = vi.mocked(programService.updateProgram)
const mockAssignProgram = vi.mocked(programService.assignProgram)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1' } as any)
})

describe('updateAdminProgramAction', () => {
  it('checks super admin, updates the program, and revalidates admin paths', async () => {
    mockUpdateProgram.mockResolvedValue({ id: 'prog_1', name: 'Updated' } as any)

    const result = await updateAdminProgramAction('prog_1', { name: 'Updated' })

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockUpdateProgram).toHaveBeenCalledWith(
      'prog_1',
      expect.objectContaining({ name: 'Updated' })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs/prog_1')
    expect(result).toEqual({ success: true, data: { id: 'prog_1', name: 'Updated' } })
  })

  it('returns a validation error and does not call the service for an invalid daysPerWeek', async () => {
    const result = await updateAdminProgramAction('prog_1', { daysPerWeek: 0 } as any)

    expect(result.success).toBe(false)
    expect(mockUpdateProgram).not.toHaveBeenCalled()
  })

  it('returns a generic error when the service call throws', async () => {
    mockUpdateProgram.mockRejectedValue(new Error('db down'))

    const result = await updateAdminProgramAction('prog_1', { name: 'Updated' })

    expect(result).toEqual({ success: false, error: 'Failed to update program' })
  })
})

describe('assignAdminProgramAction', () => {
  it('checks super admin, assigns the program, and revalidates admin paths', async () => {
    mockAssignProgram.mockResolvedValue({ id: 'prog_1' } as any)

    const result = await assignAdminProgramAction({
      programId: 'prog_1',
      clientId: 'client_1',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockAssignProgram).toHaveBeenCalledWith(
      'prog_1',
      'client_1',
      new Date('2026-08-01T00:00:00.000Z')
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs/prog_1')
    expect(result).toEqual({ success: true, data: { id: 'prog_1' } })
  })

  it('returns a validation error and does not call the service when clientId is missing', async () => {
    const result = await assignAdminProgramAction({
      programId: 'prog_1',
      clientId: '',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(result.success).toBe(false)
    expect(mockAssignProgram).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/admin-program-actions.test.ts`
Expected: FAIL — `actions/admin-program-actions.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement `actions/admin-program-actions.ts`**

```ts
"use server";

import { requireSuperAdmin } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { updateProgramSchema, assignProgramSchema } from "@/lib/validators/program";
import type { UpdateProgramInput } from "@/lib/validators/program";
import { revalidatePath } from "next/cache";

export async function updateAdminProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  await requireSuperAdmin();

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program (admin):", error);
    return { success: false as const, error: "Failed to update program" };
  }
}

export async function assignAdminProgramAction(input: {
  programId: string;
  clientId: string;
  startDate: string;
}) {
  await requireSuperAdmin();

  const parsed = assignProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const result = await programService.assignProgram(
      parsed.data.programId,
      parsed.data.clientId,
      new Date(parsed.data.startDate)
    );
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${parsed.data.programId}`);
    return { success: true as const, data: result };
  } catch (error) {
    console.error("Failed to assign program (admin):", error);
    return { success: false as const, error: "Failed to assign program" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/admin-program-actions.test.ts`
Expected: PASS — all 6 tests green.

---

### Task 3: `AssignProgramDialog` — additive `assignAction` prop

**Files:**
- Modify: `components/programs/assign-program-dialog.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: new optional prop `assignAction?: (input: { programId: string; clientId: string; startDate: string }) => Promise<{ success: boolean; error?: string; data?: unknown }>` on `AssignProgramDialog` — consumed by Task 4.

- [ ] **Step 1: Add the optional prop and use it in `handleAssign`**

In `components/programs/assign-program-dialog.tsx`, replace lines 26-38:

```tsx
interface Props {
  programId: string;
  clients: { id: string; firstName: string; lastName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignProgramDialog({
  programId,
  clients,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
```

with:

```tsx
interface Props {
  programId: string;
  clients: { id: string; firstName: string; lastName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate: string;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
}

export function AssignProgramDialog({
  programId,
  clients,
  open,
  onOpenChange,
  assignAction,
}: Props) {
  const router = useRouter();
```

Then replace lines 52-57:

```tsx
      const result = await assignProgramAction({
        programId,
        clientId,
        startDate: new Date(startDate).toISOString(),
      });
```

with:

```tsx
      const doAssign = assignAction ?? assignProgramAction;
      const result = await doAssign({
        programId,
        clientId,
        startDate: new Date(startDate).toISOString(),
      });
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, sign in as a trainer, open a program without a client and click Assign.
Expected: the dialog still assigns via the default `assignProgramAction` exactly as before (no prop passed from trainer pages, so `doAssign` falls back to the import).

---

### Task 4: `ProgramDetailView` — additive `adminMode`/`editHref`/`assignAction` props

**Files:**
- Modify: `components/programs/program-detail-view.tsx`

**Interfaces:**
- Consumes: `AssignProgramDialog`'s new `assignAction` prop (Task 3).
- Produces: new optional props `adminMode?: boolean`, `editHref?: string`, `assignAction?: (input: { programId: string; clientId: string; startDate: string }) => Promise<{ success: boolean; error?: string; data?: unknown }>` on `ProgramDetailView` — consumed by Task 6.

- [ ] **Step 1: Add the new props to the interface and destructure**

Replace lines 54-70:

```tsx
interface ProgramDetailViewProps {
  program: Record<string, unknown>;
  isTrainer: boolean;
  clients: { id: string; firstName: string; lastName: string }[];
  sessions: Record<string, unknown>[];
  showAssignDialog?: boolean;
  trainerName?: string;
}

export function ProgramDetailView({
  program,
  isTrainer,
  clients,
  sessions,
  showAssignDialog = false,
  trainerName: trainerNameProp,
}: ProgramDetailViewProps) {
```

with:

```tsx
interface ProgramDetailViewProps {
  program: Record<string, unknown>;
  isTrainer: boolean;
  clients: { id: string; firstName: string; lastName: string }[];
  sessions: Record<string, unknown>[];
  showAssignDialog?: boolean;
  trainerName?: string;
  adminMode?: boolean;
  editHref?: string;
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate: string;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
}

export function ProgramDetailView({
  program,
  isTrainer,
  clients,
  sessions,
  showAssignDialog = false,
  trainerName: trainerNameProp,
  adminMode = false,
  editHref,
  assignAction,
}: ProgramDetailViewProps) {
```

- [ ] **Step 2: Add the admin action bar after the trainer action bar**

The trainer action bar is the `{isTrainer && (...)}` block spanning lines 207-264, immediately followed by the closing `</div>` of the header flex container (line 265). Insert a new sibling block right after that `{isTrainer && ( ... )}` block closes (i.e., right before the header's closing `</div>` on line 265):

```tsx
        {adminMode && (
          <div className="flex items-center gap-2">
            {trainerName && (
              <span className="text-sm text-muted-foreground mr-2">
                Owned by {trainerName}
              </span>
            )}
            <Button variant="outline" asChild>
              <Link href={editHref ?? `/programs/${program.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            {!clientId && (
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign
              </Button>
            )}
          </div>
        )}
```

This references `clientId`, which is already declared earlier in the component (line 141: `const clientId = program.clientId as string | null;`) — no new declaration needed. `Pencil` and `UserPlus` are already imported (lines 22, 24).

- [ ] **Step 3: Pass `assignAction` through to `AssignProgramDialog`**

Replace lines 488-493:

```tsx
      <AssignProgramDialog
        programId={program.id as string}
        clients={clients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
```

with:

```tsx
      <AssignProgramDialog
        programId={program.id as string}
        clients={clients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        assignAction={assignAction}
      />
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, visit `/programs/{id}` as a trainer.
Expected: page renders identically to before — no "Owned by" text, no duplicate action bar (since `adminMode` defaults to `false` and the trainer page never passes it).

---

### Task 5: Admin program editor wrapper

**Files:**
- Create: `app/admin/programs/[id]/admin-program-editor-wrapper.tsx`

**Interfaces:**
- Consumes: `updateAdminProgramAction` (Task 2), `ProgramEditor` (`@/components/programs/program-editor`, unmodified — same component used by trainers and by `GlobalProgramEditorWrapper`).
- Produces: `AdminProgramEditorWrapper` component — consumed by Task 7.

- [ ] **Step 1: Create the wrapper**

```tsx
"use client";

import { ProgramEditor } from "@/components/programs/program-editor";
import { updateAdminProgramAction } from "@/actions/admin-program-actions";
import type { CreateProgramInput } from "@/lib/validators/program";

interface Props {
  program: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
  }[];
}

export function AdminProgramEditorWrapper({ program, exercises }: Props) {
  async function handleSave(data: CreateProgramInput, programId?: string) {
    return updateAdminProgramAction(programId as string, data);
  }

  return (
    <ProgramEditor
      program={program}
      exercises={exercises}
      onSave={handleSave}
      redirectTo={`/admin/programs/${program.id}`}
    />
  );
}
```

This route only ever edits an existing program (Task 7 guards against `program` being missing), so `handleSave` never needs a create branch — `programId` is always defined when `ProgramEditor` calls `onSave` from an edit form.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `admin-program-editor-wrapper.tsx`.

---

### Task 6: Admin program detail page (`/admin/programs/[id]`)

**Files:**
- Create: `app/admin/programs/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireSuperAdmin` (`@/lib/current-user`), `programService.getProgramById` (`@/lib/services/program.service`), `getClientsForTrainer` (`@/lib/services/client.service`), `prisma` (`@/lib/prisma`), `ProgramDetailView` with `adminMode`/`editHref`/`assignAction` props (Task 4), `assignAdminProgramAction` (Task 2).
- Produces: the `/admin/programs/[id]` route — consumed by Task 8's table link.

- [ ] **Step 1: Create the detail page**

```tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ProgramDetailView } from "@/components/programs/program-detail-view";
import { assignAdminProgramAction } from "@/actions/admin-program-actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminProgramDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const program = await programService.getProgramById(id);
  if (!program) notFound();
  if (program.isGlobal) redirect(`/admin/global-programs/${id}/edit`);

  let clients: { id: string; firstName: string; lastName: string }[] = [];
  if (program.trainerId) {
    const linkedClients = await getClientsForTrainer(program.trainerId);
    clients = linkedClients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
    }));
  }

  const workoutIds = (program.workouts ?? []).map((w) => w.id);
  let sessions: Record<string, unknown>[] = [];
  if (workoutIds.length > 0) {
    sessions = (await prisma.workoutSessionV2.findMany({
      where: { workoutId: { in: workoutIds } },
      include: {
        workout: {
          include: {
            program: { select: { id: true, name: true } },
            blocks: {
              include: {
                exercises: {
                  include: {
                    exercise: true,
                    sets: { orderBy: { orderIndex: "asc" } },
                  },
                  orderBy: { orderIndex: "asc" },
                },
              },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        exerciseLogs: {
          include: { setLogs: { orderBy: { setIndex: "asc" } } },
          orderBy: { orderIndex: "asc" },
        },
        feedback: true,
      },
      orderBy: { scheduledDate: "asc" },
    })) as unknown as Record<string, unknown>[];
  }

  const trainerData = program.trainer as { firstName?: string; lastName?: string } | null;
  const trainerName = trainerData
    ? `${trainerData.firstName ?? ""} ${trainerData.lastName ?? ""}`.trim()
    : "Unknown trainer";

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <ProgramDetailView
        program={program as unknown as Record<string, unknown>}
        isTrainer={false}
        clients={clients}
        sessions={sessions}
        adminMode
        editHref={`/admin/programs/${id}/edit`}
        assignAction={assignAdminProgramAction}
        trainerName={trainerName}
      />
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, sign in as a super admin, navigate directly to `/admin/programs/{id}` for a real (non-global) trainer-owned program id from your database.
Expected: page renders with "Owned by {trainer name}", an Edit button, and (if the program has no client yet) an Assign button. Visiting the id of a global program instead redirects to `/admin/global-programs/{id}/edit`. Visiting as a non-super-admin redirects away (via `requireSuperAdmin()`), same as any other `/admin/*` route.

---

### Task 7: Admin program edit page (`/admin/programs/[id]/edit`)

**Files:**
- Create: `app/admin/programs/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `getExercises` (`@/lib/services/exercise.service`), `getProgramById` (`@/lib/services/program.service`), `AdminProgramEditorWrapper` (Task 5).
- Produces: the `/admin/programs/[id]/edit` route — linked from Task 6's Edit button.

- [ ] **Step 1: Create the edit page**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AdminProgramEditorWrapper } from "../admin-program-editor-wrapper";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminProgramEditPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    getProgramById(id),
    getExercises(),
  ]);

  if (!program || program.isGlobal) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={`/admin/programs/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Program
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit Program</h1>
        <p className="text-muted-foreground">
          Editing on behalf of the program&apos;s trainer. Changes apply immediately.
        </p>
      </div>
      <AdminProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, from the Task 6 detail page click Edit.
Expected: the full `ProgramEditor` loads pre-populated with the program's existing workouts/blocks/exercises. Saving redirects back to `/admin/programs/{id}` and the changes are visible there. Visiting the edit URL for a global program id returns a 404 (global programs are edited only via `/admin/global-programs/{id}/edit`).

---

### Task 8: Admin "All Programs" table — clickable row

**Files:**
- Modify: `app/admin/programs/page.tsx`

**Interfaces:**
- Consumes: the `/admin/programs/[id]` route (Task 6).
- Produces: nothing consumed by later tasks (final task in the chain).

- [ ] **Step 1: Import `Link`**

Add to the import block at the top of `app/admin/programs/page.tsx` (after the existing `Library, Search` import on line 12):

```tsx
import Link from "next/link";
```

- [ ] **Step 2: Wrap the program name cell in a Link**

Replace lines 80-92:

```tsx
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{prog.name}</p>
                    {prog.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                    )}
                    {prog.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {prog.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
```

with:

```tsx
                  <td className="px-5 py-3">
                    <Link href={`/admin/programs/${prog.id}`} className="group block">
                      <p className="font-medium text-foreground group-hover:underline">{prog.name}</p>
                      {prog.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                      )}
                      {prog.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prog.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </td>
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `/admin/programs`.
Expected: clicking a trainer-owned program's name navigates to its new detail page (Task 6). Clicking a program shown with trainer "Global" navigates to `/admin/programs/{id}`, which immediately redirects to `/admin/global-programs/{id}/edit` (Task 6's redirect).

---

### Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 6 new tests from Task 2 and every pre-existing test file (no regressions).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end manual pass**

With `npm run dev` running, as a super admin:
1. `/admin/global-programs` → click a program name → lands on its edit page → save → redirected back to `/admin/global-programs`.
2. `/admin/programs` → click a trainer-owned, unassigned program → lands on `/admin/programs/{id}` → shows "Owned by {trainer}" and Edit + Assign buttons only (no Duplicate/Share/mic icons).
3. From there, click Edit → full editor loads with existing content → change something → save → redirected back, change is visible.
4. From the detail page, click Assign → dropdown lists only that program's trainer's clients → assign → toast confirms → program now shows "Assigned to {client}" and the Assign button disappears.
5. `/admin/programs` → click a program whose Trainer column says "Global" → redirected to `/admin/global-programs/{id}/edit`.
6. Sign in as a regular trainer → `/programs/{id}` and `/programs/{id}/edit` behave exactly as before (Edit/Duplicate/Assign/Share/mic buttons all present, no "Owned by" text).
7. Sign in as a non-super-admin (or sign out) → visiting `/admin/programs/{id}` or `/admin/programs/{id}/edit` directly redirects away.

Leave all changes uncommitted — do not run `git add` or `git commit`. The user will review the diff and commit it themselves.
