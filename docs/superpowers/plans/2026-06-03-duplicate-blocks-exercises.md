# Duplicate Blocks & Exercises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click duplication of blocks and exercises in both the program builder form and the calendar workout editor panel.

**Architecture:** Two new server actions (`duplicateBlockAction`, `duplicateBlockExerciseAction`) handle calendar persistence. Program builder duplication is pure client-side state cloning following the existing mutation pattern. The block in the calendar already has a DropdownMenu — we add "Duplicate" there. Exercise delete button becomes a 3-dot dropdown with Duplicate + Delete.

**Tech Stack:** Next.js server actions, Prisma MongoDB, React client state, @dnd-kit, shadcn/ui DropdownMenu, lucide-react

---

## File Map

| File | Action |
|------|--------|
| `actions/calendar-workout-actions.ts` | Add `duplicateBlockAction`, `duplicateBlockExerciseAction` |
| `components/programs/program-builder.tsx` | Add `duplicateBlock`, `duplicateExercise` functions + Copy icon buttons |
| `components/calendar/workout-editor-panel.tsx` | Add `handleDuplicateBlock`, `handleDuplicateExercise`; add to block dropdown; replace exercise Trash2 with 3-dot dropdown |

---

## Task 1: Server Actions — duplicateBlockAction and duplicateBlockExerciseAction

**Files:**
- Modify: `actions/calendar-workout-actions.ts`

- [ ] **Step 1: Add `duplicateBlockAction` at the end of `actions/calendar-workout-actions.ts`**

```typescript
export async function duplicateBlockAction(blockId: string): Promise<ActionResult<{
  id: string;
  name: string | null;
  type: string;
  orderIndex: number;
  rounds: number;
  timeCap: number | null;
  restBetweenRounds: number | null;
  notes: string | null;
  exercises: Array<{
    id: string;
    orderIndex: number;
    restSeconds: number | null;
    notes: string | null;
    exercise: { id: string; name: string; imageUrl: string | null; videoUrl: string | null };
    sets: Array<{
      id: string;
      orderIndex: number;
      setType: string;
      targetReps: number | null;
      targetWeight: number | null;
      targetDuration: number | null;
      targetRPE: number | null;
      restAfter: number | null;
    }>;
  }>;
}>> {
  const user = await getClinicianUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: { include: { program: { select: { clinicianId: true, patientId: true } } } },
        exercises: {
          orderBy: { orderIndex: "asc" },
          include: {
            exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
            sets: { orderBy: { orderIndex: "asc" } },
          },
        },
      },
    });

    if (!block || block.workout.program.clinicianId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    // Shift all subsequent blocks up by 1
    await prisma.workoutBlockV2.updateMany({
      where: { workoutId: block.workoutId, orderIndex: { gt: block.orderIndex } },
      data: { orderIndex: { increment: 1 } },
    });

    // Create the duplicate block
    const newBlock = await prisma.workoutBlockV2.create({
      data: {
        workoutId: block.workoutId,
        name: block.name,
        type: block.type,
        orderIndex: block.orderIndex + 1,
        rounds: block.rounds,
        timeCap: block.timeCap,
        restBetweenRounds: block.restBetweenRounds,
        notes: block.notes,
      },
    });

    // Duplicate each exercise and its sets
    const newExercises = [];
    for (const ex of block.exercises) {
      const newEx = await prisma.blockExerciseV2.create({
        data: {
          blockId: newBlock.id,
          exerciseId: ex.exerciseId,
          orderIndex: ex.orderIndex,
          restSeconds: ex.restSeconds,
          notes: ex.notes,
          sets: {
            create: ex.sets.map((s) => ({
              orderIndex: s.orderIndex,
              setType: s.setType,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight,
              targetDuration: s.targetDuration,
              targetRPE: s.targetRPE,
              restAfter: s.restAfter,
              tempo: s.tempo ?? null,
            })),
          },
        },
        include: {
          exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
          sets: { orderBy: { orderIndex: "asc" } },
        },
      });
      newExercises.push({
        id: newEx.id,
        orderIndex: newEx.orderIndex,
        restSeconds: newEx.restSeconds,
        notes: newEx.notes,
        exercise: newEx.exercise,
        sets: newEx.sets.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      });
    }

    if (block.workout.program.patientId) revalidatePatient(block.workout.program.patientId);
    return {
      success: true,
      data: {
        id: newBlock.id,
        name: newBlock.name,
        type: newBlock.type,
        orderIndex: newBlock.orderIndex,
        rounds: newBlock.rounds,
        timeCap: newBlock.timeCap,
        restBetweenRounds: newBlock.restBetweenRounds,
        notes: newBlock.notes,
        exercises: newExercises,
      },
    };
  } catch (error) {
    console.error("Failed to duplicate block:", error);
    return { success: false, error: "Failed to duplicate block" };
  }
}
```

- [ ] **Step 2: Add `duplicateBlockExerciseAction` immediately after**

```typescript
export async function duplicateBlockExerciseAction(blockExerciseId: string): Promise<ActionResult<{
  id: string;
  orderIndex: number;
  restSeconds: number | null;
  notes: string | null;
  exercise: { id: string; name: string; imageUrl: string | null; videoUrl: string | null };
  sets: Array<{
    id: string;
    orderIndex: number;
    setType: string;
    targetReps: number | null;
    targetWeight: number | null;
    targetDuration: number | null;
    targetRPE: number | null;
    restAfter: number | null;
  }>;
}>> {
  const user = await getClinicianUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const blockExercise = await prisma.blockExerciseV2.findUnique({
      where: { id: blockExerciseId },
      include: {
        exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
        sets: { orderBy: { orderIndex: "asc" } },
        block: {
          include: {
            workout: { include: { program: { select: { clinicianId: true, patientId: true } } } },
          },
        },
      },
    });

    if (!blockExercise || blockExercise.block.workout.program.clinicianId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    // Shift all subsequent exercises up by 1
    await prisma.blockExerciseV2.updateMany({
      where: { blockId: blockExercise.blockId, orderIndex: { gt: blockExercise.orderIndex } },
      data: { orderIndex: { increment: 1 } },
    });

    const newEx = await prisma.blockExerciseV2.create({
      data: {
        blockId: blockExercise.blockId,
        exerciseId: blockExercise.exerciseId,
        orderIndex: blockExercise.orderIndex + 1,
        restSeconds: blockExercise.restSeconds,
        notes: blockExercise.notes,
        sets: {
          create: blockExercise.sets.map((s) => ({
            orderIndex: s.orderIndex,
            setType: s.setType,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            targetDuration: s.targetDuration,
            targetRPE: s.targetRPE,
            restAfter: s.restAfter,
            tempo: s.tempo ?? null,
          })),
        },
      },
      include: {
        exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
        sets: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (blockExercise.block.workout.program.patientId) {
      revalidatePatient(blockExercise.block.workout.program.patientId);
    }
    return {
      success: true,
      data: {
        id: newEx.id,
        orderIndex: newEx.orderIndex,
        restSeconds: newEx.restSeconds,
        notes: newEx.notes,
        exercise: newEx.exercise,
        sets: newEx.sets.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to duplicate exercise:", error);
    return { success: false, error: "Failed to duplicate exercise" };
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

---

## Task 2: Program Builder — Duplicate Functions + UI

**Files:**
- Modify: `components/programs/program-builder.tsx`

- [ ] **Step 1: Add `Copy` to the lucide-react import**

Find the existing lucide-react import line (contains `Trash2`, `GripVertical`, etc.) and add `Copy` to it:

```typescript
import { ..., Trash2, Copy, ... } from "lucide-react";
```

- [ ] **Step 2: Add `duplicateBlock` function after the existing `removeBlock` function (around line 170)**

```typescript
function duplicateBlock(workoutIdx: number, blockIdx: number) {
  const next = [...workouts];
  const source = next[workoutIdx].blocks[blockIdx];

  // Deep-clone stripping all id fields so they're treated as new on save
  const clone = JSON.parse(JSON.stringify(source));
  delete clone.id;
  clone.exercises = clone.exercises.map((ex: typeof clone.exercises[number]) => {
    const { id: _eid, ...exRest } = ex;
    return {
      ...exRest,
      sets: exRest.sets.map((s: typeof exRest.sets[number]) => {
        const { id: _sid, ...sRest } = s;
        return sRest;
      }),
    };
  });

  // Insert clone directly after source
  next[workoutIdx].blocks.splice(blockIdx + 1, 0, clone);

  // Reassign orderIndex for all blocks in this workout
  next[workoutIdx].blocks = next[workoutIdx].blocks.map((b, i) => ({
    ...b,
    orderIndex: i,
  }));

  onChange(next);
}
```

- [ ] **Step 3: Add `duplicateExercise` function after `duplicateBlock`**

```typescript
function duplicateExercise(workoutIdx: number, blockIdx: number, exerciseIdx: number) {
  const next = [...workouts];
  const source = next[workoutIdx].blocks[blockIdx].exercises[exerciseIdx];

  const clone = JSON.parse(JSON.stringify(source));
  const { id: _eid, ...exRest } = clone;
  const cloneClean = {
    ...exRest,
    sets: exRest.sets.map((s: typeof exRest.sets[number]) => {
      const { id: _sid, ...sRest } = s;
      return sRest;
    }),
  };

  // Insert clone directly after source
  next[workoutIdx].blocks[blockIdx].exercises.splice(exerciseIdx + 1, 0, cloneClean);

  // Reassign orderIndex
  next[workoutIdx].blocks[blockIdx].exercises = next[workoutIdx].blocks[
    blockIdx
  ].exercises.map((ex, i) => ({ ...ex, orderIndex: i }));

  onChange(next);
}
```

- [ ] **Step 4: Add Copy button to the block header — next to the existing Trash2 button**

Find the block header delete button in the JSX (around line 465). It looks like:

```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => removeBlock(wi, bi)}
  className="ml-auto text-destructive h-8 w-8"
>
  <Trash2 className="h-3.5 w-3.5" />
</Button>
```

Replace with:

```tsx
<div className="ml-auto flex items-center gap-1">
  <Button
    variant="ghost"
    size="icon"
    onClick={() => duplicateBlock(wi, bi)}
    className="text-muted-foreground hover:text-foreground h-8 w-8"
    title="Duplicate block"
  >
    <Copy className="h-3.5 w-3.5" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    onClick={() => removeBlock(wi, bi)}
    className="text-destructive h-8 w-8"
  >
    <Trash2 className="h-3.5 w-3.5" />
  </Button>
</div>
```

- [ ] **Step 5: Add Copy button to the exercise row — next to the existing Trash2 button**

Find the exercise row delete button in the JSX (around line 515). It looks like:

```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => removeExercise(wi, bi, ei)}
  className="text-destructive h-7 w-7"
>
  <Trash2 className="h-3 w-3" />
</Button>
```

Replace with:

```tsx
<div className="flex items-center gap-0.5">
  <Button
    variant="ghost"
    size="icon"
    onClick={() => duplicateExercise(wi, bi, ei)}
    className="text-muted-foreground hover:text-foreground h-7 w-7"
    title="Duplicate exercise"
  >
    <Copy className="h-3 w-3" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    onClick={() => removeExercise(wi, bi, ei)}
    className="text-destructive h-7 w-7"
  >
    <Trash2 className="h-3 w-3" />
  </Button>
</div>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

---

## Task 3: Calendar Panel — Block Duplicate + Exercise 3-dot Menu

**Files:**
- Modify: `components/calendar/workout-editor-panel.tsx`

- [ ] **Step 1: Import the two new actions**

Find the existing import line that already imports `deleteBlockExercise` and `deleteBlock` (around line 39):

```typescript
import {
  ...
  deleteBlockExercise,
  deleteBlock,
  ...
} from "@/actions/calendar-workout-actions";
```

Add the two new actions:

```typescript
import {
  ...
  deleteBlockExercise,
  deleteBlock,
  duplicateBlockAction,
  duplicateBlockExerciseAction,
  ...
} from "@/actions/calendar-workout-actions";
```

- [ ] **Step 2: Add `handleDuplicateBlock` handler after the existing `handleDeleteBlock` function (around line 861)**

```typescript
async function handleDuplicateBlock(blockIndex: number) {
  if (!session) return;
  const blockId = session.workout.blocks[blockIndex].id;
  const result = await duplicateBlockAction(blockId);
  if (result.success) {
    setSession((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.workout.blocks];
      // Insert the new block after the source block
      blocks.splice(blockIndex + 1, 0, result.data as any);
      return { ...prev, workout: { ...prev.workout, blocks } };
    });
    onWorkoutUpdated();
  } else {
    toast.error(result.error);
  }
}
```

- [ ] **Step 3: Add "Duplicate Block" to the existing block DropdownMenu**

Find the block DropdownMenuContent (around line 1201). It currently contains block type change items, a separator, and "Delete Block". Add a "Duplicate Block" item before the separator:

```tsx
<DropdownMenuItem
  onClick={() => handleDuplicateBlock(blockIndex)}
>
  <Copy className="h-3.5 w-3.5 mr-1.5" />
  Duplicate Block
</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem
  variant="destructive"
  onClick={() => handleDeleteBlock(blockIndex)}
>
  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
  Delete Block
</DropdownMenuItem>
```

Also add `Copy` to the lucide-react import at the top of this file (line 4):

```typescript
import { GripVertical, Dumbbell, Trash2, Loader2, X, Plus, MoreVertical, Copy, Calendar as CalendarIcon, ChevronDown, ChevronRight, Settings, CheckCircle, Info, Sparkles } from "lucide-react";
```

- [ ] **Step 4: Add `handleDuplicateExercise` handler after `handleDeleteExercise` (around line 857)**

```typescript
async function handleDuplicateExercise(blockIndex: number, exerciseIndex: number) {
  if (!session) return;
  const beId = session.workout.blocks[blockIndex].exercises[exerciseIndex].id;
  const result = await duplicateBlockExerciseAction(beId);
  if (result.success) {
    setSession((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.workout.blocks];
      const block = { ...blocks[blockIndex] };
      const exercises = [...block.exercises];
      // Insert duplicated exercise after the source
      exercises.splice(exerciseIndex + 1, 0, result.data as any);
      block.exercises = exercises;
      blocks[blockIndex] = block;
      return { ...prev, workout: { ...prev.workout, blocks } };
    });
    onWorkoutUpdated();
  } else {
    toast.error(result.error);
  }
}
```

- [ ] **Step 5: Pass `onDuplicateExercise` prop to SortableExercise**

Find where `<SortableExercise` is rendered (around line 1239). It already has `onDeleteExercise={handleDeleteExercise}`. Add the new prop:

```tsx
<SortableExercise
  ...
  onDeleteExercise={handleDeleteExercise}
  onDuplicateExercise={handleDuplicateExercise}
  ...
/>
```

- [ ] **Step 6: Replace Trash2 button with 3-dot DropdownMenu in `SortableExercise`**

In the `SortableExercise` function (around line 253), add `onDuplicateExercise` to the destructured props:

```typescript
function SortableExercise({
  id,
  exercise,
  savingSetIds,
  blockIndex,
  exerciseIndex,
  blockLetter,
  isCircuit,
  onSetChange,
  onDeleteSet,
  onDeleteExercise,
  onDuplicateExercise,   // ← add this
  onAddSet,
  onUpdateNotes,
  patientId,
  sessionStatus,
  exerciseLog
}: any) {
```

Then find the existing exercise delete button (around line 370):

```tsx
{(!sessionStatus || sessionStatus !== "COMPLETED") && (
  <Button
    variant="ghost"
    size="icon-xs"
    className="text-muted-foreground hover:text-destructive h-6 w-6 lg:opacity-0 group-hover:opacity-100 transition-opacity"
    onClick={() => onDeleteExercise(blockIndex, exerciseIndex)}
  >
    <Trash2 className="h-3.5 w-3.5" />
  </Button>
)}
```

Replace with:

```tsx
{(!sessionStatus || sessionStatus !== "COMPLETED") && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-foreground h-6 w-6 lg:opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => onDuplicateExercise(blockIndex, exerciseIndex)}>
        <Copy className="h-3.5 w-3.5 mr-1.5" />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() => onDeleteExercise(blockIndex, exerciseIndex)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

Make sure `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` are imported. Check existing imports near the top — if they're not there, add:

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

---

## Task 4: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 2: Manual smoke test — Program Builder**

1. Open any patient → Programs → New Program (or edit existing)
2. Add a block with 2–3 exercises
3. Click the Copy icon on the block header → a duplicate block should appear directly below
4. Click the Copy icon on an individual exercise → a duplicate exercise should appear directly below in the same block
5. Drag the duplicated items to confirm drag-and-drop still works

- [ ] **Step 3: Manual smoke test — Calendar Editor Panel**

1. Open any patient calendar → click a workout to open the editor panel
2. Click the `•••` (Settings) icon on a block → menu should show "Duplicate Block", separator, "Delete Block"
3. Click "Duplicate Block" → duplicate block with all exercises should appear below
4. Click the `•••` on any exercise → menu should show "Duplicate", separator, "Delete"
5. Click "Duplicate" → duplicate exercise should appear below in the same block
6. Refresh the page → confirm duplicates persisted

---

## Self-Review Notes

- Spec: program builder duplicate block → Task 2 (functions + block header Copy button) ✓
- Spec: program builder duplicate exercise → Task 2 (function + exercise row Copy button) ✓
- Spec: calendar block 3-dot → added "Duplicate Block" to existing Settings dropdown ✓
- Spec: calendar exercise 3-dot → replaced Trash2 with DropdownMenu (Duplicate + Delete) ✓
- Server actions use `getClinicianUser()` + ownership chain matching existing pattern ✓
- `orderIndex` shift before insert ensures no collisions ✓
- All new props typed via `any` to match existing SortableExercise pattern ✓
- Return shapes match what local state expects ✓
