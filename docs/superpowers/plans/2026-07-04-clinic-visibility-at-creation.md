# Clinic Visibility at Program Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super admin choose a global program's clinic visibility ("All Clinics" or specific clinics) at the moment they create it — in both the manual builder and the AI generation wizard — instead of always creating universal and requiring a separate post-creation dialog trip.

**Architecture:** A new shared `ClinicVisibilitySelector` component (radio: All Clinics / Specific Clinics, with a conditional checkbox list) is used in three places: the manual global-program builder, the AI generation wizard, and the existing post-creation `AssignClinicsDialog` (retrofitted for consistency). `organizationIds` — already a `Program` column from the prior feature — gets threaded through `createProgramSchema` (manual path) and the AI wizard's loosely-typed params object (generate path), landing in the same `prisma.program.create` calls that already exist.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma (MongoDB), Clerk (`@clerk/nextjs/server`), Zod, React Hook Form, Vitest, Tailwind, shadcn/ui (`@base-ui/react` under the hood for `RadioGroup`).

## Global Constraints

- Builds on the already-implemented feature in `docs/superpowers/plans/2026-07-04-assign-global-program-to-clinics.md`: `Program.organizationIds: String[]`, `listClerkOrganizations()` (`lib/services/admin.service.ts`), `assignGlobalProgramOrganizations` (`lib/services/program.service.ts`), `AssignClinicsDialog` (`app/admin/global-programs/assign-clinics-dialog.tsx`) — all already exist in the working tree.
- Authorization: `createGlobalProgramAction` and `generateGlobalProgramAction` (`actions/global-program-actions.ts`) already call `requireSuperAdmin()` — no new auth code needed anywhere in this plan.
- `organizationIds` is only ever meaningful for `Program` rows where `isGlobal: true`. The regular (non-global) `createProgram` service function must explicitly discard any `organizationIds` present in its input so it can never write onto a trainer's own program.
- This codebase only unit-tests server-side logic (`actions/`, `lib/services/`, `lib/validators/`) via Vitest — no jsdom/testing-library setup exists. Do not add component tests for `.tsx` files; verify those via `npx tsc --noEmit` and a manual dev-server pass instead.
- Work happens directly in the main working directory (`/Users/yahyashah/Dev/Excercise-Webapp`, branch `dev-yahya`) — not a new git worktree.
- **Never run `git add` or `git commit`.** The user reviews all changes and commits them personally. Every task ends with a verification step, not a commit step.

---

### Task 1: Schema — add `organizationIds` to `createProgramSchema`

**Files:**
- Modify: `lib/validators/program.ts:53-64`
- Create: `lib/validators/__tests__/program.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CreateProgramInput.organizationIds: string[]` (optional, defaults to `[]`) — relied on by Tasks 2, 4.

- [ ] **Step 1: Write the failing tests**

Create `lib/validators/__tests__/program.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createProgramSchema } from '../program'

describe('createProgramSchema', () => {
  it('defaults organizationIds to an empty array when omitted', () => {
    const result = createProgramSchema.safeParse({ name: 'Test Program' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.organizationIds).toEqual([])
    }
  })

  it('accepts an explicit organizationIds array', () => {
    const result = createProgramSchema.safeParse({
      name: 'Test Program',
      organizationIds: ['org_1', 'org_2'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.organizationIds).toEqual(['org_1', 'org_2'])
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/validators/__tests__/program.test.ts`
Expected: FAIL — `organizationIds` is `undefined` in the parsed result (the field doesn't exist on the schema yet).

- [ ] **Step 3: Implement the change**

In `lib/validators/program.ts`, replace lines 53-64:

```ts
export const createProgramSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isTemplate: z.boolean().default(false),
  sourceTemplateId: z.string().optional().nullable(),
  durationWeeks: z.number().int().positive().optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  tags: z.array(z.string()).default([]),
  equipmentRequired: z.array(z.string()).default([]),
  startDate: z.string().datetime().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});
```

with:

```ts
export const createProgramSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isTemplate: z.boolean().default(false),
  sourceTemplateId: z.string().optional().nullable(),
  durationWeeks: z.number().int().positive().optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  tags: z.array(z.string()).default([]),
  equipmentRequired: z.array(z.string()).default([]),
  organizationIds: z.array(z.string()).default([]),
  startDate: z.string().datetime().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/validators/__tests__/program.test.ts`
Expected: PASS — both tests green.

---

### Task 2: `program.service.ts` — regular `createProgram` discards it, `createGlobalProgram` passes it through

**Files:**
- Modify: `lib/services/program.service.ts:47-51` (the existing `createProgram`)
- Modify: `lib/services/__tests__/program.service.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `CreateProgramInput.organizationIds` (Task 1).
- Produces: nothing new consumed by later tasks — `createGlobalProgram(data: CreateProgramInput)` already exists and needs no signature change, only a behavior guarantee this task verifies with a test.

- [ ] **Step 1: Write the failing tests**

Open `lib/services/__tests__/program.service.test.ts`. Update the top of the file — replace:

```ts
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
```

with:

```ts
vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getGlobalPrograms,
  assignGlobalProgramOrganizations,
  createProgram,
  createGlobalProgram,
} from '../program.service'

const mockFindMany = vi.mocked(prisma.program.findMany)
const mockUpdate = vi.mocked(prisma.program.update)
const mockCreate = vi.mocked(prisma.program.create)
```

Then append at the end of the file:

```ts
describe('createProgram', () => {
  it('does not write organizationIds even if present in input', async () => {
    mockCreate.mockResolvedValue({ id: 'prog_1' } as any)

    await createProgram('trainer_1', {
      name: 'Test',
      isTemplate: false,
      tags: [],
      equipmentRequired: [],
      organizationIds: ['org_1'],
      workouts: [],
    } as any)

    const callArg = mockCreate.mock.calls[0][0] as any
    expect(callArg.data).not.toHaveProperty('organizationIds')
  })
})

describe('createGlobalProgram', () => {
  it('passes organizationIds through to the Prisma create call', async () => {
    mockCreate.mockResolvedValue({ id: 'prog_2' } as any)

    await createGlobalProgram({
      name: 'Test',
      isTemplate: false,
      tags: [],
      equipmentRequired: [],
      organizationIds: ['org_1', 'org_2'],
      workouts: [],
    } as any)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isGlobal: true,
          organizationIds: ['org_1', 'org_2'],
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program.service.test.ts`
Expected: The `createProgram` test FAILs (its `data` object currently includes `organizationIds: ['org_1']` via the existing `...rest` spread, so `not.toHaveProperty` fails). The `createGlobalProgram` test PASSes already (no code change needed there — confirms the passthrough already works via the existing spread once Task 1 lands).

- [ ] **Step 3: Implement the change**

In `lib/services/program.service.ts`, replace lines 47-51:

```ts
export async function createProgram(
  trainerId: string,
  data: CreateProgramInput
) {
  const { workouts, startDate, ...rest } = data;
```

with:

```ts
export async function createProgram(
  trainerId: string,
  data: CreateProgramInput
) {
  const { workouts, startDate, organizationIds, ...rest } = data;
  void organizationIds;
```

(This mirrors the existing `void _exerciseName; void _exerciseBodyRegion;` pattern already used in `components/programs/program-editor.tsx` for intentionally-discarded destructured fields.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program.service.test.ts`
Expected: PASS — all tests in the file green, including the pre-existing `getGlobalPrograms`/`assignGlobalProgramOrganizations` tests (no regressions).

---

### Task 3: `ClinicVisibilitySelector` component

**Files:**
- Create: `components/programs/clinic-visibility-selector.tsx`

**Interfaces:**
- Consumes: `RadioGroup`/`RadioGroupItem` (`@/components/ui/radio-group`), `Checkbox` (`@/components/ui/checkbox`), `Label` (`@/components/ui/label`) — all pre-existing.
- Produces: `ClinicVisibilitySelector` component — consumed by Tasks 4, 6, 7.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Props {
  clinics: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function ClinicVisibilitySelector({ clinics, value, onChange }: Props) {
  const [mode, setMode] = useState<"all" | "specific">(
    value.length > 0 ? "specific" : "all"
  );

  function handleModeChange(next: "all" | "specific") {
    setMode(next);
    if (next === "all") {
      onChange([]);
    }
  }

  function toggle(clinicId: string, checked: boolean) {
    onChange(
      checked ? [...value, clinicId] : value.filter((id) => id !== clinicId)
    );
  }

  return (
    <div className="space-y-3">
      <Label>Visibility</Label>
      <RadioGroup value={mode} onValueChange={handleModeChange}>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="all" id="visibility-all" />
          <Label htmlFor="visibility-all" className="font-normal">
            All Clinics
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="specific" id="visibility-specific" />
          <Label htmlFor="visibility-specific" className="font-normal">
            Specific Clinics
          </Label>
        </div>
      </RadioGroup>
      {mode === "specific" && (
        <div className="space-y-2 rounded-md border p-3">
          {clinics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clinics found.</p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {clinics.map((clinic) => (
                <div key={clinic.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`clinic-visibility-${clinic.id}`}
                    checked={value.includes(clinic.id)}
                    onCheckedChange={(checked) =>
                      toggle(clinic.id, checked === true)
                    }
                  />
                  <Label
                    htmlFor={`clinic-visibility-${clinic.id}`}
                    className="font-normal"
                  >
                    {clinic.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          {value.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Select at least one clinic, or choose All Clinics.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: this is a plain, layout-agnostic block (no grid/col-span classes baked in) — callers wrap it in whatever layout container fits their surrounding form.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `clinic-visibility-selector.tsx`.

---

### Task 4: Manual builder — wire `ClinicVisibilitySelector` into program creation

**Files:**
- Modify: `app/admin/global-programs/new/page.tsx`
- Modify: `app/admin/global-programs/global-program-editor-wrapper.tsx`
- Modify: `components/programs/program-editor.tsx`

**Interfaces:**
- Consumes: `listClerkOrganizations()` (existing, `lib/services/admin.service.ts`), `ClinicVisibilitySelector` (Task 3), `createProgramSchema`'s `organizationIds` field (Task 1).
- Produces: nothing consumed by later tasks — this closes the loop for the manual builder.

- [ ] **Step 1: Fetch clinics on the new-program page**

In `app/admin/global-programs/new/page.tsx`, replace:

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { GlobalProgramEditorWrapper } from "../global-program-editor-wrapper";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NewGlobalProgramPage() {
  await requireSuperAdmin();
  const exercises = await getExercises();
```

with:

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { listClerkOrganizations } from "@/lib/services/admin.service";
import { GlobalProgramEditorWrapper } from "../global-program-editor-wrapper";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NewGlobalProgramPage() {
  await requireSuperAdmin();
  const [exercises, clinics] = await Promise.all([
    getExercises(),
    listClerkOrganizations(),
  ]);
```

Then replace the render line:

```tsx
      <GlobalProgramEditorWrapper exercises={exercises} />
```

with:

```tsx
      <GlobalProgramEditorWrapper exercises={exercises} clinics={clinics} />
```

- [ ] **Step 2: Thread `clinics` through the wrapper**

In `app/admin/global-programs/global-program-editor-wrapper.tsx`, replace the whole file:

```tsx
"use client";

import { ProgramEditor } from "@/components/programs/program-editor";
import {
  createGlobalProgramAction,
  updateGlobalProgramAction,
} from "@/actions/global-program-actions";
import type { CreateProgramInput } from "@/lib/validators/program";

interface Props {
  program?: Record<string, unknown>;
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
  clinics?: { id: string; name: string }[];
}

export function GlobalProgramEditorWrapper({ program, exercises, clinics }: Props) {
  async function handleSave(data: CreateProgramInput, programId?: string) {
    if (programId) {
      return updateGlobalProgramAction(programId, data);
    }
    return createGlobalProgramAction(data);
  }

  return (
    <ProgramEditor
      program={program}
      exercises={exercises}
      clinics={clinics}
      onSave={handleSave}
      redirectTo="/admin/global-programs"
    />
  );
}
```

(The edit page, `app/admin/global-programs/[id]/edit/page.tsx`, also renders this wrapper but doesn't pass `clinics` — it stays optional and `undefined` there, so editing an existing global program still goes through the existing post-creation `AssignClinicsDialog` rather than gaining this control. That's intentional — this plan scopes the new control to creation only.)

- [ ] **Step 3: Render the selector in `ProgramEditor`**

In `components/programs/program-editor.tsx`, add the import — replace:

```tsx
import { ProgramBuilder } from "./program-builder";
```

with:

```tsx
import { ProgramBuilder } from "./program-builder";
import { ClinicVisibilitySelector } from "./clinic-visibility-selector";
```

Replace the `Props` interface:

```tsx
interface Props {
  program?: Record<string, unknown>;
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
  onSave?: (
    data: CreateProgramInput,
    programId?: string
  ) => Promise<{ success: boolean; error?: string; data?: { id: string } }>;
  redirectTo?: string;
  organizationOrganizationId?: string;
}
```

with:

```tsx
interface Props {
  program?: Record<string, unknown>;
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
  onSave?: (
    data: CreateProgramInput,
    programId?: string
  ) => Promise<{ success: boolean; error?: string; data?: { id: string } }>;
  redirectTo?: string;
  organizationOrganizationId?: string;
  clinics?: { id: string; name: string }[];
}
```

Replace the function signature:

```tsx
export function ProgramEditor({ program, exercises, onSave, redirectTo, organizationOrganizationId }: Props) {
```

with:

```tsx
export function ProgramEditor({ program, exercises, onSave, redirectTo, organizationOrganizationId, clinics }: Props) {
```

Add state — replace:

```tsx
  // Equipment state — pre-populated from saved program or empty
  const [equipment, setEquipment] = useState<string[]>(
    (program?.equipmentRequired as string[]) || []
  );
```

with:

```tsx
  // Equipment state — pre-populated from saved program or empty
  const [equipment, setEquipment] = useState<string[]>(
    (program?.equipmentRequired as string[]) || []
  );
  // Clinic visibility state — pre-populated from saved program or empty (= all clinics)
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>(
    (program?.organizationIds as string[]) || []
  );
```

Render the selector — replace the `isTemplate` `FormField` block:

```tsx
            <FormField
              control={form.control}
              name="isTemplate"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 sm:col-span-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="mt-0!">Save as template</FormLabel>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
```

with:

```tsx
            <FormField
              control={form.control}
              name="isTemplate"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 sm:col-span-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="mt-0!">Save as template</FormLabel>
                </FormItem>
              )}
            />
            {clinics && (
              <div className="sm:col-span-2">
                <ClinicVisibilitySelector
                  clinics={clinics}
                  value={selectedOrganizationIds}
                  onChange={setSelectedOrganizationIds}
                />
              </div>
            )}
          </CardContent>
        </Card>
```

Include the selection in the submitted data — replace, inside `onSubmit`:

```tsx
      data.workouts = cleanWorkouts;
      data.equipmentRequired = equipment;
```

with:

```tsx
      data.workouts = cleanWorkouts;
      data.equipmentRequired = equipment;
      data.organizationIds = selectedOrganizationIds;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `program-editor.tsx`, `global-program-editor-wrapper.tsx`, or `app/admin/global-programs/new/page.tsx`.

---

### Task 5: `generateGlobalProgramAction` — accept and write `organizationIds`

**Files:**
- Modify: `actions/global-program-actions.ts`
- Modify: `actions/__tests__/global-program-actions.test.ts` (extend existing file)

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is a standalone params/data-shape change).
- Produces: `generateGlobalProgramAction`'s `params` accepts an optional `organizationIds: string[]` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Open `actions/__tests__/global-program-actions.test.ts`. Replace the mock/import block at the top:

```ts
vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  assignGlobalProgramOrganizations: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))

import { requireSuperAdmin } from '@/lib/current-user'
import * as programService from '@/lib/services/program.service'
import { revalidatePath } from 'next/cache'
import { assignGlobalProgramOrganizationsAction } from '../global-program-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockAssign = vi.mocked(programService.assignGlobalProgramOrganizations)
```

with:

```ts
vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  assignGlobalProgramOrganizations: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: { create: vi.fn() },
  },
}))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))

import { requireSuperAdmin } from '@/lib/current-user'
import * as programService from '@/lib/services/program.service'
import { revalidatePath } from 'next/cache'
import { generateProgram } from '@/lib/services/ai.service'
import { prisma } from '@/lib/prisma'
import {
  assignGlobalProgramOrganizationsAction,
  generateGlobalProgramAction,
} from '../global-program-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockAssign = vi.mocked(programService.assignGlobalProgramOrganizations)
const mockGenerateProgram = vi.mocked(generateProgram)
const mockProgramCreate = vi.mocked(prisma.program.create)
```

Then append at the end of the file:

```ts
describe('generateGlobalProgramAction', () => {
  it('writes organizationIds from params onto the created program', async () => {
    mockGenerateProgram.mockResolvedValue({
      name: 'AI Program',
      description: 'Generated',
      workouts: [],
    } as any)
    mockProgramCreate.mockResolvedValue({ id: 'prog_ai_1' } as any)

    const result = await generateGlobalProgramAction({
      organizationIds: ['org_1'],
    } as any)

    expect(mockProgramCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isGlobal: true,
          organizationIds: ['org_1'],
        }),
      })
    )
    expect(result).toEqual({ success: true, data: 'prog_ai_1' })
  })

  it('defaults organizationIds to an empty array when omitted from params', async () => {
    mockGenerateProgram.mockResolvedValue({
      name: 'AI Program',
      description: 'Generated',
      workouts: [],
    } as any)
    mockProgramCreate.mockResolvedValue({ id: 'prog_ai_2' } as any)

    await generateGlobalProgramAction({} as any)

    expect(mockProgramCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationIds: [] }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/global-program-actions.test.ts`
Expected: FAIL — the `data` object passed to `prisma.program.create` has no `organizationIds` key yet.

- [ ] **Step 3: Implement the change**

In `actions/global-program-actions.ts`, replace the `generateGlobalProgramAction` signature:

```ts
export async function generateGlobalProgramAction(params: {
  focusAreas?: string[];
  durationMinutes?: number;
  daysPerWeek?: number;
  durationWeeks?: number;
  circuits?: unknown[];
  preferredWeekdays?: string[];
  difficultyLevel?: string;
  weekPlan?: WeekPlan[];
  [key: string]: unknown;
}) {
```

with:

```ts
export async function generateGlobalProgramAction(params: {
  focusAreas?: string[];
  durationMinutes?: number;
  daysPerWeek?: number;
  durationWeeks?: number;
  circuits?: unknown[];
  preferredWeekdays?: string[];
  difficultyLevel?: string;
  weekPlan?: WeekPlan[];
  organizationIds?: string[];
  [key: string]: unknown;
}) {
```

Then replace the `prisma.program.create` call:

```ts
    const program = await prisma.program.create({
      data: {
        name: aiPlan.name,
        description: aiPlan.description || "Generated by AI",
        isGlobal: true,
        isTemplate: false,
        trainerId: null,
        status: "DRAFT",
        aiGenerationParams: params as import("@prisma/client").Prisma.InputJsonValue,
      },
      select: { id: true },
    });
```

with:

```ts
    const program = await prisma.program.create({
      data: {
        name: aiPlan.name,
        description: aiPlan.description || "Generated by AI",
        isGlobal: true,
        isTemplate: false,
        trainerId: null,
        status: "DRAFT",
        organizationIds: params.organizationIds ?? [],
        aiGenerationParams: params as import("@prisma/client").Prisma.InputJsonValue,
      },
      select: { id: true },
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/global-program-actions.test.ts`
Expected: PASS — all tests in the file green, including the pre-existing `assignGlobalProgramOrganizationsAction` tests (no regressions).

---

### Task 6: AI wizard — wire `ClinicVisibilitySelector` into generation

**Files:**
- Modify: `app/admin/global-programs/generate/page.tsx`
- Modify: `app/admin/global-programs/generate/global-generate-wrapper.tsx`
- Modify: `components/programs/generate-program-form.tsx`

**Interfaces:**
- Consumes: `listClerkOrganizations()` (existing), `ClinicVisibilitySelector` (Task 3), `generateGlobalProgramAction`'s `organizationIds` param (Task 5).
- Produces: nothing consumed by later tasks — this closes the loop for the AI wizard.

- [ ] **Step 1: Fetch clinics on the generate page**

In `app/admin/global-programs/generate/page.tsx`, replace:

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { GlobalGenerateWrapper } from "./global-generate-wrapper";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminGenerateGlobalProgramPage() {
  await requireSuperAdmin();
```

with:

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { listClerkOrganizations } from "@/lib/services/admin.service";
import { GlobalGenerateWrapper } from "./global-generate-wrapper";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminGenerateGlobalProgramPage() {
  await requireSuperAdmin();
  const clinics = await listClerkOrganizations();
```

Then replace:

```tsx
      <div className="max-w-2xl">
        <GlobalGenerateWrapper />
      </div>
```

with:

```tsx
      <div className="max-w-2xl">
        <GlobalGenerateWrapper clinics={clinics} />
      </div>
```

- [ ] **Step 2: Thread `clinics` through the wrapper**

Replace the whole file `app/admin/global-programs/generate/global-generate-wrapper.tsx`:

```tsx
"use client";

import {
  GenerateProgramForm,
  type GenerateExercisesHandler,
} from "@/components/programs/generate-program-form";
import { generateGlobalProgramAction } from "@/actions/global-program-actions";

interface Props {
  clinics: { id: string; name: string }[];
}

export function GlobalGenerateWrapper({ clinics }: Props) {
  const handleGenerate: GenerateExercisesHandler = async (params) => {
    return generateGlobalProgramAction(
      params as Parameters<typeof generateGlobalProgramAction>[0]
    );
  };

  return (
    <GenerateProgramForm
      clients={[]}
      clinics={clinics}
      onGenerateExercises={handleGenerate}
      redirectTo="/admin/global-programs"
    />
  );
}
```

- [ ] **Step 3: Render the selector in `GenerateProgramForm`**

In `components/programs/generate-program-form.tsx`, add the import — replace:

```tsx
import { PlanReviewStep } from "@/components/programs/plan-review-step";
```

with:

```tsx
import { PlanReviewStep } from "@/components/programs/plan-review-step";
import { ClinicVisibilitySelector } from "@/components/programs/clinic-visibility-selector";
```

Extend `GenerateExercisesHandler`'s params — replace:

```tsx
export type GenerateExercisesHandler = (params: {
  clientId: string | null;
  programGoals: string[];
  availableEquipment: string[];
  startDate?: string | null;
  durationMinutes: number;
  daysPerWeek: number;
  durationWeeks: number;
  circuits: { name: string; focusType: string; exerciseCount: number; rounds: number; restBetweenRounds: number | null }[];
  preferredWeekdays: string[];
  difficultyLevel: string;
  weekPlan: unknown[];
}) => Promise<{ success: boolean; error?: string; data?: string }>;

interface GenerateProgramFormProps {
  clients: ClientSummary[];
  initialClientId?: string;
  onGenerateExercises?: GenerateExercisesHandler;
  redirectTo?: string;
}
```

with:

```tsx
export type GenerateExercisesHandler = (params: {
  clientId: string | null;
  programGoals: string[];
  availableEquipment: string[];
  startDate?: string | null;
  durationMinutes: number;
  daysPerWeek: number;
  durationWeeks: number;
  circuits: { name: string; focusType: string; exerciseCount: number; rounds: number; restBetweenRounds: number | null }[];
  preferredWeekdays: string[];
  difficultyLevel: string;
  weekPlan: unknown[];
  organizationIds?: string[];
}) => Promise<{ success: boolean; error?: string; data?: string }>;

interface GenerateProgramFormProps {
  clients: ClientSummary[];
  initialClientId?: string;
  onGenerateExercises?: GenerateExercisesHandler;
  redirectTo?: string;
  clinics?: { id: string; name: string }[];
}
```

Update the function signature — replace:

```tsx
export function GenerateProgramForm({ clients, initialClientId, onGenerateExercises, redirectTo }: GenerateProgramFormProps) {
```

with:

```tsx
export function GenerateProgramForm({ clients, initialClientId, onGenerateExercises, redirectTo, clinics }: GenerateProgramFormProps) {
```

Add state — replace:

```tsx
  const [selectedClient, setSelectedClient] = useState(initialClientId ?? "");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
```

with:

```tsx
  const [selectedClient, setSelectedClient] = useState(initialClientId ?? "");
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
```

Render the selector right after the client-selector block — replace:

```tsx
                </>
              )}

              {/* Start Date — shown only when a client is selected */}
```

with:

```tsx
                </>
              )}

              {/* Clinic visibility — shown only in admin/global context (clinics provided) */}
              {clinics && (
                <ClinicVisibilitySelector
                  clinics={clinics}
                  value={selectedOrganizationIds}
                  onChange={setSelectedOrganizationIds}
                />
              )}

              {/* Start Date — shown only when a client is selected */}
```

Include the selection in `genParams` — replace, inside `handleGenerateExercises`:

```tsx
    const genParams = {
      clientId: selectedClient || null,
      programGoals: selectedGoals,
      availableEquipment: selectedEquipment,
      startDate: selectedClient ? startDate : null,
      durationMinutes: duration,
      daysPerWeek,
      durationWeeks,
      circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
        name, focusType, exerciseCount, rounds, restBetweenRounds,
      })),
      preferredWeekdays: selectedWeekdays,
      difficultyLevel: difficulty,
      weekPlan: approvedPlan.weeklyPlan,
    };
```

with:

```tsx
    const genParams = {
      clientId: selectedClient || null,
      programGoals: selectedGoals,
      availableEquipment: selectedEquipment,
      startDate: selectedClient ? startDate : null,
      durationMinutes: duration,
      daysPerWeek,
      durationWeeks,
      circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
        name, focusType, exerciseCount, rounds, restBetweenRounds,
      })),
      preferredWeekdays: selectedWeekdays,
      difficultyLevel: difficulty,
      weekPlan: approvedPlan.weeklyPlan,
      organizationIds: selectedOrganizationIds,
    };
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `generate-program-form.tsx`, `global-generate-wrapper.tsx`, or `app/admin/global-programs/generate/page.tsx`.

---

### Task 7: Retrofit `AssignClinicsDialog` to use `ClinicVisibilitySelector`

**Files:**
- Modify: `app/admin/global-programs/assign-clinics-dialog.tsx`

**Interfaces:**
- Consumes: `ClinicVisibilitySelector` (Task 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the bare checkbox list with the shared selector**

Replace the whole file `app/admin/global-programs/assign-clinics-dialog.tsx`:

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
import { toast } from "sonner";
import { assignGlobalProgramOrganizationsAction } from "@/actions/global-program-actions";
import { ClinicVisibilitySelector } from "@/components/programs/clinic-visibility-selector";

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
        <div className="py-4">
          <ClinicVisibilitySelector
            clinics={clinics}
            value={selected}
            onChange={setSelected}
          />
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

### Task 8: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new/updated tests from Tasks 1, 2, and 5, with no regressions in the pre-existing suite.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end manual pass**

With `npm run dev` running:
1. As a super admin, go to `/admin/global-programs/new`. Confirm the "Visibility" control appears with "All Clinics" selected by default. Create a program without touching it — confirm it's visible to every trainer (regression check).
2. Go to `/admin/global-programs/new` again, select "Specific Clinics", check one clinic, and create the program. As a trainer in that clinic, confirm it appears in Templates. As a trainer in a different clinic, confirm it does not.
3. Go to `/admin/global-programs/generate`. Confirm the same "Visibility" control appears (in the same spot the client selector would be for a non-admin context) with "All Clinics" selected by default. Generate a program with "Specific Clinics" and one clinic checked; confirm the same visibility behavior as step 2 once generation completes.
4. Open the ⋮ menu on any existing program → "Assign to Clinics" — confirm the dialog now shows the same radio + checkbox UI (retrofitted) and still saves correctly.

Leave all changes uncommitted — do not run `git add` or `git commit`. The user will review the diff and commit it themselves.
