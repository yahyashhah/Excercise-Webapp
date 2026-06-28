# Calendar Grid Lines, Checklist Can't-Do Reasons & Program Schedule Three-Dot Menus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent UI improvements: (1) add grid lines to the client dashboard calendar, (2) show an inline reason textarea when a client clicks "Can't do" in the workout checklist, (3) add duplicate/delete three-dot menus to template workout events in the program schedule view.

**Architecture:** All changes are isolated to existing component files plus one new server-actions file. Features 1 and 2 are purely component-level. Feature 3 adds two new server actions then wires them into the existing EventPill sub-component. Tasks 1, 2, and 3 are fully independent and can run in any order; Task 4 depends on Task 3.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Prisma (MongoDB), Vitest, Sonner (toast), shadcn/ui (Dialog, DropdownMenu, Select, Textarea, Button)

## Global Constraints

- Do NOT run `git add` / `git commit` — user reviews and commits themselves
- Never modify the Prisma schema — all three features fit the existing data model
- Existing `deleteSession` and `duplicateWorkoutToDateAction` in `actions/calendar-workout-actions.ts` are untouched — template actions are a new separate file
- Test environment is Vitest with `environment: 'node'` — only pure-logic server-action tests are written; component changes are verified manually by running the dev server

---

## Task 1: Client Dashboard Calendar Grid Lines

**Files:**
- Modify: `components/dashboard/client-session-calendar.tsx`

**Interfaces:**
- Produces: visual change only — no API or type changes

- [ ] **Step 1: Wrap header and day cells in a bordered container**

In `components/dashboard/client-session-calendar.tsx`, replace the two sibling divs (the day-of-week header and the calendar grid) with a single outer wrapper. Find this block starting at line 95:

```tsx
{/* Day-of-week headers */}
<div className="grid grid-cols-7 text-center">
  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
    <div key={d} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1">
      {d}
    </div>
  ))}
</div>

{/* Calendar grid */}
<div className="grid grid-cols-7 gap-y-1">
  {Array.from({ length: paddedStart }).map((_, i) => (
    <div key={`pad-${i}`} />
  ))}
  {days.map((day) => {
```

Replace with:

```tsx
{/* Calendar grid with grid lines */}
<div className="rounded-lg border border-border/40 overflow-hidden">
  {/* Day-of-week headers */}
  <div className="grid grid-cols-7 bg-muted/40 border-b border-border/40">
    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, idx) => (
      <div
        key={d}
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 text-center",
          idx < 6 && "border-r border-border/40"
        )}
      >
        {d}
      </div>
    ))}
  </div>

  {/* Day cells */}
  <div className="grid grid-cols-7">
    {Array.from({ length: paddedStart }).map((_, i) => (
      <div
        key={`pad-${i}`}
        className={cn(
          "min-h-[44px] border-b border-border/40",
          i % 7 < 6 && "border-r border-border/40"
        )}
      />
    ))}
    {days.map((day) => {
```

- [ ] **Step 2: Add border classes to each day button**

Inside the `days.map` block, find the `<button>` element's `className`:

```tsx
className={cn(
  "relative flex flex-col items-center justify-start rounded-lg p-1 py-1.5 transition-colors min-h-[44px]",
  !hasSession && "cursor-default",
  hasSession && !isSelected && "cursor-pointer hover:bg-muted/60",
  isSelected && "bg-primary text-primary-foreground",
  isCurrentDay && !isSelected && "ring-2 ring-primary ring-inset rounded-lg",
  isFutureDay && hasSession && "opacity-50"
)}
```

Replace with (adds cell borders, replaces outer `rounded-lg` with a tighter `rounded-[4px]` on today's ring):

```tsx
className={cn(
  "relative flex flex-col items-center justify-start p-1 py-1.5 transition-colors min-h-[44px]",
  "border-b border-border/40",
  (paddedStart + days.indexOf(day)) % 7 < 6 && "border-r border-border/40",
  !hasSession && "cursor-default",
  hasSession && !isSelected && "cursor-pointer hover:bg-muted/60",
  isSelected && "bg-primary text-primary-foreground",
  isCurrentDay && !isSelected && "ring-2 ring-primary ring-inset rounded-[4px]",
  isFutureDay && hasSession && "opacity-50"
)}
```

- [ ] **Step 3: Close the two new wrapper divs**

After the closing `})}` of the `days.map` and before the `{/* Legend */}` comment, add two closing tags:

```tsx
        })}
      </div>   {/* closes grid grid-cols-7 (day cells) */}
    </div>     {/* closes rounded-lg border wrapper */}
```

- [ ] **Step 4: Verify manually**

Run `npm run dev` and navigate to the client dashboard. The calendar should show thin grid lines between every cell, a muted header row, and the outer border forming a clean calendar shape.

---

## Task 2: Checklist "Can't Do" Inline Reason Textarea

**Files:**
- Modify: `components/workout/workout-checklist-tracker.tsx`

**Interfaces:**
- Consumes: existing `updateSetLogV2Action` which already accepts `notes?: string`
- Produces: `SetLog.notes` stores the user's typed reason instead of the hardcoded `"Unable to complete"`

- [ ] **Step 1: Add `pendingSkips` state**

Near the top of the `WorkoutChecklistTracker` component body, alongside the existing `useState` declarations, add:

```tsx
const [pendingSkips, setPendingSkips] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Update `handleLogSet` to accept an optional skip reason**

Find the function signature (around line 253):

```tsx
async function handleLogSet(
  block: WorkoutBlock,
  ex: BlockExercise,
  setIndex: number,
  skipSet = false
) {
```

Replace with:

```tsx
async function handleLogSet(
  block: WorkoutBlock,
  ex: BlockExercise,
  setIndex: number,
  skipSet = false,
  skipReason?: string
) {
```

Find the `data` assignment (around line 262):

```tsx
const data = skipSet
  ? { actualReps: 0, notes: "Unable to complete" }
  : {
      actualReps: pending.actualReps,
      actualWeight: pending.actualWeight,
      actualDuration: pending.actualDuration,
    };
```

Replace with:

```tsx
const data = skipSet
  ? { actualReps: 0, notes: skipReason || undefined }
  : {
      actualReps: pending.actualReps,
      actualWeight: pending.actualWeight,
      actualDuration: pending.actualDuration,
    };
```

- [ ] **Step 3: Replace the "Can't do" button**

Find the existing "Can't do" button block (around line 748):

```tsx
{!isExtra && (
  <Button
    size="sm"
    variant="outline"
    className="h-8 gap-1 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
    onClick={() => handleLogSet(block, ex, i, true)}
    disabled={isLogging}
  >
    <AlertCircle className="h-3 w-3" />
    Can&apos;t do
  </Button>
)}
```

Replace with (removes `!isExtra` guard so extra sets also get the button; click enters pending-skip mode instead of immediately submitting):

```tsx
<Button
  size="sm"
  variant="outline"
  className="h-8 gap-1 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
  onClick={() =>
    setPendingSkips((prev) => ({ ...prev, [inputKey(ex.id, i)]: "" }))
  }
  disabled={isLogging || inputKey(ex.id, i) in pendingSkips}
>
  <AlertCircle className="h-3 w-3" />
  Can&apos;t do
</Button>
```

- [ ] **Step 4: Add the inline reason textarea**

Immediately after the closing `</div>` of the `flex gap-1.5 ml-auto` button group div, and still inside the per-set map iteration, add:

```tsx
{inputKey(ex.id, i) in pendingSkips && (
  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
      Why can&apos;t you do this? (optional)
    </p>
    <Textarea
      className="h-16 text-xs resize-none bg-white"
      placeholder="Pain, equipment issue, form concern…"
      value={pendingSkips[inputKey(ex.id, i)] ?? ""}
      onChange={(e) =>
        setPendingSkips((prev) => ({
          ...prev,
          [inputKey(ex.id, i)]: e.target.value,
        }))
      }
    />
    <div className="flex gap-1.5">
      <Button
        size="sm"
        className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
        onClick={() => {
          const reason = pendingSkips[inputKey(ex.id, i)] || undefined;
          setPendingSkips((prev) => {
            const next = { ...prev };
            delete next[inputKey(ex.id, i)];
            return next;
          });
          handleLogSet(block, ex, i, true, reason);
        }}
        disabled={isLogging}
      >
        Skip this set
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        onClick={() =>
          setPendingSkips((prev) => {
            const next = { ...prev };
            delete next[inputKey(ex.id, i)];
            return next;
          })
        }
      >
        Cancel
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`. Open a session in checklist mode. Click "Can't do" on any set — a textarea with "Skip this set" / "Cancel" buttons should appear. Type a reason, click "Skip this set" — the set shows as Skipped. Click "Add Set" to add an extra set row and confirm the extra set also shows "Can't do" with the same textarea flow.

On the trainer side navigate to that client's session detail page (`/clients/[id]/sessions/[sessionId]`) — the typed reason should appear as small text below the "Couldn't complete" badge in the set row. If the reason was left blank, nothing extra appears (no "Unable to complete" placeholder text anymore).

---

## Task 3: Program Workout Template Server Actions

**Files:**
- Create: `actions/program-workout-actions.ts`
- Create: `actions/__tests__/program-workout-actions.test.ts`

**Interfaces:**
- Produces:
  - `deleteWorkoutFromProgramAction(workoutId: string): Promise<{ success: boolean; error?: string; data?: undefined }>`
  - `duplicateWorkoutToDayAction(workoutId: string, weekIndex: number, dayIndex: number): Promise<{ success: boolean; error?: string; data?: undefined }>`
- Consumed by: Task 4

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/program-workout-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workout: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import {
  deleteWorkoutFromProgramAction,
  duplicateWorkoutToDayAction,
} from '../program-workout-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockWorkoutFind = vi.mocked(prisma.workout.findUnique)
const mockWorkoutDelete = vi.mocked(prisma.workout.delete)
const mockWorkoutCreate = vi.mocked(prisma.workout.create)

const CLERK_ID = 'clerk_1'
const TRAINER_ID = 'trainer_db_1'
const WORKOUT_ID = 'workout_1'
const PROGRAM_ID = 'program_1'

const dbTrainer = { id: TRAINER_ID, clerkId: CLERK_ID, role: 'TRAINER' }

const workoutWithProgram = {
  id: WORKOUT_ID,
  programId: PROGRAM_ID,
  name: 'Push Day',
  estimatedMinutes: 45,
  program: { id: PROGRAM_ID, trainerId: TRAINER_ID },
  blocks: [],
}

beforeEach(() => vi.clearAllMocks())

describe('deleteWorkoutFromProgramAction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await deleteWorkoutFromProgramAction(WORKOUT_ID)).toEqual({
      success: false,
      error: 'Unauthorized',
    })
  })

  it('returns Unauthorized when user not in db', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(null)
    expect(await deleteWorkoutFromProgramAction(WORKOUT_ID)).toEqual({
      success: false,
      error: 'Unauthorized',
    })
  })

  it('returns Forbidden when workout belongs to a different trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutWithProgram,
      program: { id: PROGRAM_ID, trainerId: 'other_trainer' },
    } as never)
    expect(await deleteWorkoutFromProgramAction(WORKOUT_ID)).toEqual({
      success: false,
      error: 'Forbidden',
    })
  })

  it('deletes the workout and returns success', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutWithProgram as never)
    mockWorkoutDelete.mockResolvedValue(undefined as never)

    const result = await deleteWorkoutFromProgramAction(WORKOUT_ID)

    expect(mockWorkoutDelete).toHaveBeenCalledWith({ where: { id: WORKOUT_ID } })
    expect(result).toEqual({ success: true, data: undefined })
  })
})

describe('duplicateWorkoutToDayAction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await duplicateWorkoutToDayAction(WORKOUT_ID, 1, 2)).toEqual({
      success: false,
      error: 'Unauthorized',
    })
  })

  it('returns Forbidden when workout belongs to a different trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutWithProgram,
      program: { id: PROGRAM_ID, trainerId: 'other_trainer' },
    } as never)
    expect(await duplicateWorkoutToDayAction(WORKOUT_ID, 1, 2)).toEqual({
      success: false,
      error: 'Forbidden',
    })
  })

  it('creates a cloned workout at the target week and day', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutWithProgram as never)
    mockWorkoutCreate.mockResolvedValue({ id: 'new_workout' } as never)

    const result = await duplicateWorkoutToDayAction(WORKOUT_ID, 2, 4)

    expect(mockWorkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          programId: PROGRAM_ID,
          name: 'Push Day (copy)',
          weekIndex: 2,
          dayIndex: 4,
        }),
      })
    )
    expect(result).toEqual({ success: true, data: undefined })
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run actions/__tests__/program-workout-actions.test.ts
```

Expected output: `Cannot find module '../program-workout-actions'`

- [ ] **Step 3: Create the server actions file**

Create `actions/program-workout-actions.ts`:

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

export async function deleteWorkoutFromProgramAction(
  workoutId: string
): Promise<{ success: boolean; error?: string; data?: undefined }> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { program: { select: { id: true, trainerId: true } } },
    });

    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.workout.delete({ where: { id: workoutId } });

    revalidatePath(`/programs/${workout.program.id}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete workout:", error);
    return { success: false, error: "Failed to delete workout" };
  }
}

export async function duplicateWorkoutToDayAction(
  workoutId: string,
  weekIndex: number,
  dayIndex: number
): Promise<{ success: boolean; error?: string; data?: undefined }> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: { select: { id: true, trainerId: true } },
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: { sets: { orderBy: { orderIndex: "asc" } } },
            },
          },
        },
      },
    });

    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.workout.create({
      data: {
        programId: workout.programId,
        name: `${workout.name} (copy)`,
        weekIndex,
        dayIndex,
        orderIndex: 0,
        estimatedMinutes: workout.estimatedMinutes,
        blocks: {
          create: workout.blocks.map((block) => ({
            name: block.name,
            type: block.type,
            orderIndex: block.orderIndex,
            rounds: block.rounds,
            restBetweenRounds: block.restBetweenRounds,
            timeCap: block.timeCap,
            notes: block.notes,
            exercises: {
              create: block.exercises.map((be) => ({
                exerciseId: be.exerciseId,
                orderIndex: be.orderIndex,
                restSeconds: be.restSeconds,
                notes: be.notes,
                supersetGroup: be.supersetGroup ?? null,
                sets: {
                  create: be.sets.map((s) => ({
                    orderIndex: s.orderIndex,
                    setType: s.setType,
                    targetReps: s.targetReps,
                    targetWeight: s.targetWeight,
                    targetDuration: s.targetDuration,
                    targetDistance: (s as Record<string, unknown>).targetDistance ?? null,
                    targetRPE: (s as Record<string, unknown>).targetRPE ?? null,
                    targetPercentage1RM: (s as Record<string, unknown>).targetPercentage1RM ?? null,
                    restAfter: (s as Record<string, unknown>).restAfter ?? null,
                    tempo: (s as Record<string, unknown>).tempo ?? null,
                  })),
                },
              })),
            },
          })),
        },
      },
    });

    revalidatePath(`/programs/${workout.program.id}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to duplicate workout:", error);
    return { success: false, error: "Failed to duplicate workout" };
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run actions/__tests__/program-workout-actions.test.ts
```

Expected: All 7 tests pass.

---

## Task 4: Program Schedule Template Three-Dot Menu UI

**Depends on:** Task 3 must be complete first.

**Files:**
- Modify: `components/programs/program-schedule-view.tsx`

**Interfaces:**
- Consumes:
  - `deleteWorkoutFromProgramAction(workoutId: string)` from `@/actions/program-workout-actions`
  - `duplicateWorkoutToDayAction(workoutId: string, weekIndex: number, dayIndex: number)` from `@/actions/program-workout-actions`
- Produces: template events render a DropdownMenu with "Duplicate to week/day" and "Delete"

- [ ] **Step 1: Add Select component import**

In the imports section at the top of `components/programs/program-schedule-view.tsx`, add after the existing shadcn imports:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

- [ ] **Step 2: Import the new server actions**

After the existing action import block:

```tsx
import {
  deleteSession,
  duplicateWorkoutToDateAction,
} from "@/actions/calendar-workout-actions";
```

Add:

```tsx
import {
  deleteWorkoutFromProgramAction,
  duplicateWorkoutToDayAction,
} from "@/actions/program-workout-actions";
```

- [ ] **Step 3: Add `totalProgramWeeks` to SchedulePillCtx**

Find (line ~73):

```tsx
const SchedulePillCtx = createContext<{ isTrainer: boolean; onRefresh: () => void }>({
  isTrainer: false,
  onRefresh: () => {},
});
```

Replace with:

```tsx
const SchedulePillCtx = createContext<{
  isTrainer: boolean;
  onRefresh: () => void;
  totalProgramWeeks: number;
}>({
  isTrainer: false,
  onRefresh: () => {},
  totalProgramWeeks: 1,
});
```

- [ ] **Step 4: Pass `totalProgramWeeks` into the Provider**

Find (line ~1541):

```tsx
<SchedulePillCtx.Provider
  value={{ isTrainer, onRefresh: () => startTransition(() => router.refresh()) }}
>
```

Replace with:

```tsx
<SchedulePillCtx.Provider
  value={{ isTrainer, onRefresh: () => startTransition(() => router.refresh()), totalProgramWeeks }}
>
```

- [ ] **Step 5: Destructure `totalProgramWeeks` in EventPill and add template state**

Inside `function EventPill({ event }: { event: ScheduleEvent })`, find:

```tsx
const { isTrainer, onRefresh } = useContext(SchedulePillCtx);
```

Replace with:

```tsx
const { isTrainer, onRefresh, totalProgramWeeks } = useContext(SchedulePillCtx);
```

Then find the existing state block:

```tsx
const [dupeOpen, setDupeOpen] = useState(false);
const [dupeDate, setDupeDate] = useState("");
const [dupeLoading, setDupeLoading] = useState(false);
const [deleting, setDeleting] = useState(false);
```

Add below it:

```tsx
const [templateDupeOpen, setTemplateDupeOpen] = useState(false);
const [templateWeek, setTemplateWeek] = useState(0);
const [templateDay, setTemplateDay] = useState(0);
const [templateDupeLoading, setTemplateDupeLoading] = useState(false);
```

- [ ] **Step 6: Update `showMenu` condition**

Find:

```tsx
const showMenu = isTrainer && event.isSession && !!event.sessionId;
```

Replace with:

```tsx
const showMenu = isTrainer && (event.isSession ? !!event.sessionId : true);
```

- [ ] **Step 7: Add template action handlers**

After the existing `handleDuplicate` function, add:

```tsx
async function handleTemplateDelete() {
  if (event.isSession || deleting) return;
  setDeleting(true);
  try {
    const result = await deleteWorkoutFromProgramAction(event.id);
    if (result.success) {
      toast.success("Workout deleted");
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  } catch {
    toast.error("Failed to delete");
  } finally {
    setDeleting(false);
  }
}

async function handleTemplateDuplicate() {
  if (event.isSession || templateDupeLoading) return;
  setTemplateDupeLoading(true);
  try {
    const result = await duplicateWorkoutToDayAction(event.id, templateWeek, templateDay);
    if (result.success) {
      toast.success("Workout duplicated");
      setTemplateDupeOpen(false);
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to duplicate");
    }
  } catch {
    toast.error("Failed to duplicate");
  } finally {
    setTemplateDupeLoading(false);
  }
}
```

- [ ] **Step 8: Split DropdownMenuContent by event type**

Find the existing `<DropdownMenuContent>` block inside EventPill:

```tsx
<DropdownMenuContent
  align="end"
  className="w-44"
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()}
>
  <DropdownMenuItem onClick={() => setDupeOpen(true)}>
    <Copy className="mr-2 h-4 w-4" />
    Duplicate to date
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem
    variant="destructive"
    disabled={deleting}
    onClick={handleDelete}
  >
    Delete
  </DropdownMenuItem>
</DropdownMenuContent>
```

Replace with:

```tsx
<DropdownMenuContent
  align="end"
  className="w-48"
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()}
>
  {event.isSession ? (
    <>
      <DropdownMenuItem onClick={() => setDupeOpen(true)}>
        <Copy className="mr-2 h-4 w-4" />
        Duplicate to date
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={deleting}
        onClick={handleDelete}
      >
        Delete
      </DropdownMenuItem>
    </>
  ) : (
    <>
      <DropdownMenuItem onClick={() => setTemplateDupeOpen(true)}>
        <Copy className="mr-2 h-4 w-4" />
        Duplicate to week/day
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={deleting}
        onClick={handleTemplateDelete}
      >
        Delete
      </DropdownMenuItem>
    </>
  )}
</DropdownMenuContent>
```

- [ ] **Step 9: Add the template duplicate Dialog**

After the closing `</Dialog>` of the existing session-duplication dialog, add:

```tsx
<Dialog
  open={templateDupeOpen}
  onOpenChange={(open) => {
    setTemplateDupeOpen(open);
    if (!open) { setTemplateWeek(0); setTemplateDay(0); }
  }}
>
  <DialogContent
    className="sm:max-w-sm"
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
  >
    <DialogHeader>
      <DialogTitle>Duplicate Workout</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Choose a week and day to copy <strong>{event.title}</strong> to.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Week</p>
          <Select
            value={String(templateWeek)}
            onValueChange={(v) => setTemplateWeek(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: Math.max(1, totalProgramWeeks) }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  Week {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Day</p>
          <Select
            value={String(templateDay)}
            onValueChange={(v) => setTemplateDay(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(
                (label, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setTemplateDupeOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleTemplateDuplicate} disabled={templateDupeLoading}>
        {templateDupeLoading ? "Duplicating…" : "Duplicate"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 10: TypeScript check**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors in the modified files. Fix any type errors before proceeding.

- [ ] **Step 11: Verify manually**

Run `npm run dev`. Go to `/programs/[id]` and open the **Schedule** tab.

**Template mode (no client assigned):**
- Purple "Planned" workout events should now show a `⋯` icon on hover.
- Click `⋯` → "Duplicate to week/day" and "Delete" appear.
- Duplicate: choose Week 2 Day 3 → calendar refreshes, new workout "(copy)" appears on Wednesday of week 2.
- Delete: workout disappears from the calendar.

**Session mode (program assigned to client):**
- Status-coloured session events still show `⋯` with "Duplicate to date" (date picker) and "Delete" — unchanged.
