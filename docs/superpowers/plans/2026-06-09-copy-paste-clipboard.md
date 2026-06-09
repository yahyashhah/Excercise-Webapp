# Copy-Paste Clipboard for Program Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ctrl+C / Ctrl+V keyboard-driven clipboard for exercises, blocks, and workout days across the program builder, program editor, and the calendar workout editor — replacing the existing in-place duplicate buttons.

**Architecture:** A global `ClipboardContext` backed by `localStorage` stores the copied payload and renders a persistent toast. A `useBuilderKeyboard` hook wires Ctrl+C, Ctrl+V, and Escape in each builder component. Selection state lives locally per component. The program builder uses pure local state for paste; the calendar editor calls two new server actions.

**Tech Stack:** React Context, localStorage, Vitest, TypeScript, Next.js App Router, Prisma (MongoDB), `@dnd-kit`, `sonner`

---

## File Map

| Status | File | Change |
|---|---|---|
| **Create** | `lib/clipboard-context.tsx` | `ClipboardPayload` type, `ClipboardProvider`, `useClipboard`, `stripIds`, `ClipboardToast` |
| **Create** | `lib/__tests__/clipboard-context.test.ts` | Unit tests for `stripIds` |
| **Create** | `hooks/use-builder-keyboard.ts` | `useBuilderKeyboard` — Ctrl+C / Ctrl+V / Escape wiring |
| **Modify** | `app/layout.tsx` | Wrap children with `<ClipboardProvider>` |
| **Modify** | `components/programs/program-builder.tsx` | Selection state, visual indicators, checkboxes, copy/paste, remove old duplicate buttons |
| **Modify** | `actions/calendar-workout-actions.ts` | Add `pasteExercisesToBlockAction` and `pasteBlockToWorkoutAction` |
| **Modify** | `components/calendar/workout-editor-panel.tsx` | Selection state, visual indicators, checkboxes, copy/paste, remove old duplicate menu items |

---

## Task 1: Create `lib/clipboard-context.tsx`

**Files:**
- Create: `lib/clipboard-context.tsx`
- Create: `lib/__tests__/clipboard-context.test.ts`

- [ ] **Step 1: Write the failing test for `stripIds`**

Create `lib/__tests__/clipboard-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripIds } from "../clipboard-context";

describe("stripIds", () => {
  it("removes id from a flat object", () => {
    const result = stripIds({ id: "abc", name: "test", orderIndex: 0 });
    expect(result).toEqual({ name: "test", orderIndex: 0 });
    expect("id" in result).toBe(false);
  });

  it("removes ids recursively from nested objects", () => {
    const input = {
      id: "workout-1",
      name: "Day 1",
      blocks: [
        {
          id: "block-1",
          name: "Main",
          exercises: [
            {
              id: "ex-1",
              exerciseId: "e-1",
              sets: [{ id: "set-1", orderIndex: 0 }],
            },
          ],
        },
      ],
    };
    const result = stripIds(input);
    expect("id" in result).toBe(false);
    expect("id" in result.blocks[0]).toBe(false);
    expect("id" in result.blocks[0].exercises[0]).toBe(false);
    expect("id" in result.blocks[0].exercises[0].sets[0]).toBe(false);
    expect(result.blocks[0].exercises[0].exerciseId).toBe("e-1");
  });

  it("preserves non-id display fields like _exerciseName", () => {
    const result = stripIds({
      id: "ex-1",
      exerciseId: "lib-1",
      _exerciseName: "Squat",
      orderIndex: 0,
    });
    expect(result).toHaveProperty("_exerciseName", "Squat");
    expect(result).toHaveProperty("exerciseId", "lib-1");
    expect("id" in result).toBe(false);
  });

  it("handles top-level arrays", () => {
    const result = stripIds([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
    expect(result).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("returns primitives unchanged", () => {
    expect(stripIds(42)).toBe(42);
    expect(stripIds("hello")).toBe("hello");
    expect(stripIds(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run lib/__tests__/clipboard-context.test.ts
```

Expected: FAIL — `stripIds` not found.

- [ ] **Step 3: Create `lib/clipboard-context.tsx`**

```tsx
"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Scissors, X } from "lucide-react";
import type { WorkoutInput, WorkoutBlockInput, BlockExerciseInput } from "@/lib/validators/program";

export type ClipboardPayload =
  | { type: "workout";   data: WorkoutInput;        label: string }
  | { type: "block";     data: WorkoutBlockInput;    label: string }
  | { type: "exercises"; data: BlockExerciseInput[]; label: string };

interface ClipboardContextValue {
  clipboard: ClipboardPayload | null;
  copy: (payload: ClipboardPayload) => void;
  clear: () => void;
}

const ClipboardContext = createContext<ClipboardContextValue>({
  clipboard: null,
  copy: () => {},
  clear: () => {},
});

const STORAGE_KEY = "program-builder-clipboard";

export function stripIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripIds) as unknown as T;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => k !== "id")
      .map(([k, v]) => [k, stripIds(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

export function ClipboardProvider({ children }: { children: React.ReactNode }) {
  const [clipboard, setClipboard] = useState<ClipboardPayload | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setClipboard(JSON.parse(stored));
    } catch {}
  }, []);

  const copy = useCallback((payload: ClipboardPayload) => {
    setClipboard(payload);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  }, []);

  const clear = useCallback(() => {
    setClipboard(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return (
    <ClipboardContext.Provider value={{ clipboard, copy, clear }}>
      {children}
      {clipboard && <ClipboardToast clipboard={clipboard} onClear={clear} />}
    </ClipboardContext.Provider>
  );
}

export function useClipboard() {
  return useContext(ClipboardContext);
}

function ClipboardToast({
  clipboard,
  onClear,
}: {
  clipboard: ClipboardPayload;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full text-sm shadow-lg animate-in slide-in-from-bottom-2 duration-200">
      <Scissors className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[280px] truncate">
        {clipboard.label} copied — Ctrl+V to paste
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full hover:bg-background/20 p-0.5 transition-colors"
        aria-label="Clear clipboard"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run lib/__tests__/clipboard-context.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `lib/clipboard-context.tsx`.

---

## Task 2: Create `hooks/use-builder-keyboard.ts`

**Files:**
- Create: `hooks/use-builder-keyboard.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useRef } from "react";

interface BuilderKeyboardOptions {
  onCopy: () => void;
  onPaste: () => void;
  onEscape: () => void;
}

export function useBuilderKeyboard({ onCopy, onPaste, onEscape }: BuilderKeyboardOptions) {
  const onCopyRef = useRef(onCopy);
  const onPasteRef = useRef(onPaste);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => { onCopyRef.current = onCopy; }, [onCopy]);
  useEffect(() => { onPasteRef.current = onPaste; }, [onPaste]);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        onCopyRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        onPasteRef.current();
      } else if (e.key === "Escape") {
        onEscapeRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // stable — callbacks accessed via refs
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `hooks/use-builder-keyboard.ts`.

---

## Task 3: Wrap `app/layout.tsx` with `ClipboardProvider`

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add the import**

Add to the imports at the top of `app/layout.tsx`:

```ts
import { ClipboardProvider } from "@/lib/clipboard-context";
```

- [ ] **Step 2: Wrap children**

The current `RootLayout` returns:

```tsx
<TooltipProvider>
  {children}
  <ToastProvider />
</TooltipProvider>
```

Change it to:

```tsx
<TooltipProvider>
  <ClipboardProvider>
    {children}
    <ToastProvider />
  </ClipboardProvider>
</TooltipProvider>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 4: `program-builder.tsx` — selection state, visual indicators, exercise checkboxes

**Files:**
- Modify: `components/programs/program-builder.tsx`

This task adds the selection model and visual UI only. No clipboard logic yet.

- [ ] **Step 1: Add imports and SelectionState type at the top of the file**

After the existing imports, add:

```tsx
import { cn } from "@/lib/utils";
import { useClipboard, stripIds } from "@/lib/clipboard-context";
import { useBuilderKeyboard } from "@/hooks/use-builder-keyboard";
import { toast } from "sonner";
```

Just below the `Props` interface definition, add:

```tsx
interface SelectionState {
  level: "workout" | "block" | "exercises" | null;
  workoutIdx: number | null;
  blockIdx: number | null;
  exerciseIdxs: Set<number>;
}

const DEFAULT_SELECTION: SelectionState = {
  level: null,
  workoutIdx: null,
  blockIdx: null,
  exerciseIdxs: new Set(),
};
```

- [ ] **Step 2: Add state inside `ProgramBuilder` component**

Inside the `ProgramBuilder` function body, after the existing `useState` calls, add:

```tsx
const [selection, setSelection] = useState<SelectionState>(DEFAULT_SELECTION);
const [hoveredPasteTarget, setHoveredPasteTarget] = useState<string | null>(null);
const { clipboard } = useClipboard();
```

- [ ] **Step 3: Add `handleExerciseCheck` helper**

Add this function inside `ProgramBuilder`, after the existing `updateExerciseNotes` function:

```tsx
function handleExerciseCheck(wi: number, bi: number, ei: number, checked: boolean) {
  setSelection((prev) => {
    const sameBlock =
      prev.level === "exercises" &&
      prev.workoutIdx === wi &&
      prev.blockIdx === bi;
    const newIdxs = sameBlock ? new Set(prev.exerciseIdxs) : new Set<number>();
    if (checked) {
      newIdxs.add(ei);
      return { level: "exercises", workoutIdx: wi, blockIdx: bi, exerciseIdxs: newIdxs };
    }
    newIdxs.delete(ei);
    return newIdxs.size > 0
      ? { level: "exercises", workoutIdx: wi, blockIdx: bi, exerciseIdxs: newIdxs }
      : DEFAULT_SELECTION;
  });
}
```

- [ ] **Step 4: Add `ring` class to the workout `<Card>` and its `onClick` handler**

Find the `<Card key={wi} className="border-2">` in the JSX. Replace it with:

```tsx
<Card
  key={wi}
  className={cn(
    "border-2 transition-shadow",
    selection.level === "workout" && selection.workoutIdx === wi
      ? "ring-2 ring-blue-500"
      : ""
  )}
  onClick={(e) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, select, textarea")) return;
    setSelection({
      level: "workout",
      workoutIdx: wi,
      blockIdx: null,
      exerciseIdxs: new Set(),
    });
  }}
>
```

- [ ] **Step 5: Add block selection ring, paste affordance hover, and block header `onClick`**

Find the block container div: `<div className="border rounded-lg p-4 bg-muted/30">`. Replace it with:

```tsx
<div
  className={cn(
    "border rounded-lg p-4 bg-muted/30 transition-shadow",
    selection.level === "block" &&
    selection.workoutIdx === wi &&
    selection.blockIdx === bi
      ? "ring-2 ring-blue-400"
      : "",
    clipboard?.type === "exercises" &&
    hoveredPasteTarget === `block-${wi}-${bi}`
      ? "border-dashed border-blue-400"
      : ""
  )}
  onMouseEnter={() => {
    if (clipboard?.type === "exercises") setHoveredPasteTarget(`block-${wi}-${bi}`);
  }}
  onMouseLeave={() => setHoveredPasteTarget(null)}
>
```

Then find the block header row (the div that wraps the GripVertical, block name Input, Select, etc.):
`<div className="flex items-center gap-3 mb-3">`. Replace it with:

```tsx
<div
  className="flex items-center gap-3 mb-3 cursor-pointer"
  onClick={(e) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, select")) return;
    setSelection({
      level: "block",
      workoutIdx: wi,
      blockIdx: bi,
      exerciseIdxs: new Set(),
    });
  }}
>
```

- [ ] **Step 6: Add exercise checkboxes**

Find the exercise row: `<div className="border rounded-md p-3 bg-background">`. Replace it with:

```tsx
<div
  className={cn(
    "border rounded-md p-3 bg-background group",
    selection.level === "exercises" &&
    selection.workoutIdx === wi &&
    selection.blockIdx === bi &&
    selection.exerciseIdxs.has(ei)
      ? "bg-blue-50"
      : ""
  )}
>
```

Inside that div, find the row `<div className="flex items-center gap-2 mb-2">`.
Add the checkbox as the **first child** of that div:

```tsx
<div className="flex items-center gap-2 mb-2">
  <input
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 rounded border-gray-300 cursor-pointer transition-opacity",
      selection.level === "exercises" &&
      selection.workoutIdx === wi &&
      selection.blockIdx === bi &&
      selection.exerciseIdxs.has(ei)
        ? "opacity-100"
        : "opacity-0 group-hover:opacity-100"
    )}
    checked={
      selection.level === "exercises" &&
      selection.workoutIdx === wi &&
      selection.blockIdx === bi &&
      selection.exerciseIdxs.has(ei)
    }
    onChange={(e) => {
      e.stopPropagation();
      handleExerciseCheck(wi, bi, ei, e.target.checked);
    }}
    onClick={(e) => e.stopPropagation()}
  />
  {/* existing drag handle button comes next */}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

---

## Task 5: `program-builder.tsx` — copy, paste, keyboard wiring, remove old buttons

**Files:**
- Modify: `components/programs/program-builder.tsx`

- [ ] **Step 1: Add `copy` to the `useClipboard` destructure**

Find the line added in Task 4:

```tsx
const { clipboard } = useClipboard();
```

Change it to:

```tsx
const { clipboard, copy } = useClipboard();
```

- [ ] **Step 2: Add `handleCopy` function**

Add inside `ProgramBuilder`, after `handleExerciseCheck`:

```tsx
function handleCopy() {
  const { level, workoutIdx, blockIdx, exerciseIdxs } = selection;
  if (level === "workout" && workoutIdx !== null) {
    const data = stripIds(workouts[workoutIdx]);
    copy({ type: "workout", data, label: `"${workouts[workoutIdx].name}"` });
  } else if (level === "block" && workoutIdx !== null && blockIdx !== null) {
    const block = workouts[workoutIdx].blocks[blockIdx];
    copy({ type: "block", data: stripIds(block), label: `"${block.name || "Block"}"` });
  } else if (
    level === "exercises" &&
    workoutIdx !== null &&
    blockIdx !== null &&
    exerciseIdxs.size > 0
  ) {
    const sorted = Array.from(exerciseIdxs).sort((a, b) => a - b);
    const exs = sorted.map((i) =>
      stripIds(workouts[workoutIdx!].blocks[blockIdx!].exercises[i])
    );
    const firstName = getExerciseName(
      exs[0].exerciseId,
      (exs[0] as any)._exerciseName
    );
    const label = exs.length === 1 ? `"${firstName}"` : `${exs.length} exercises`;
    copy({ type: "exercises", data: exs, label });
  }
}
```

- [ ] **Step 3: Add `handlePaste` function**

Add inside `ProgramBuilder`, after `handleCopy`:

```tsx
function handlePaste() {
  if (!clipboard) return;

  if (clipboard.type === "workout") {
    const idx = workouts.length;
    const clone = {
      ...clipboard.data,
      dayIndex: idx,
      orderIndex: idx,
      name: `${clipboard.data.name} (copy)`,
    };
    onChange([...workouts, clone]);
    toast.success("Workout day pasted");
    return;
  }

  if (clipboard.type === "block") {
    if (selection.workoutIdx === null) {
      toast.info("Click a workout day header first, then paste");
      return;
    }
    const next = [...workouts];
    const target = next[selection.workoutIdx];
    const clone = { ...clipboard.data, orderIndex: target.blocks.length };
    next[selection.workoutIdx] = {
      ...target,
      blocks: [...target.blocks, clone],
    };
    onChange(next);
    toast.success(`Block "${clipboard.data.name || "Block"}" pasted`);
    return;
  }

  if (clipboard.type === "exercises") {
    const { workoutIdx: wi, blockIdx: bi } = selection;
    if (wi === null || bi === null) {
      toast.info("Click a block first, then paste");
      return;
    }
    const next = [...workouts];
    const block = { ...next[wi].blocks[bi] };
    const startOrder = block.exercises.length;
    const clones = clipboard.data.map((ex, i) => ({
      ...ex,
      orderIndex: startOrder + i,
    }));
    block.exercises = [...block.exercises, ...clones];
    next[wi] = {
      ...next[wi],
      blocks: next[wi].blocks.map((b, i) => (i === bi ? block : b)),
    };
    onChange(next);
    const n = clipboard.data.length;
    toast.success(`${n} exercise${n > 1 ? "s" : ""} pasted`);
  }
}
```

- [ ] **Step 4: Wire `useBuilderKeyboard`**

Add after the `handlePaste` function:

```tsx
useBuilderKeyboard({
  onCopy: handleCopy,
  onPaste: handlePaste,
  onEscape: () => setSelection(DEFAULT_SELECTION),
});
```

- [ ] **Step 5: Remove `duplicateBlock` and `duplicateExercise` functions**

Delete the entire `duplicateBlock` function (lines ~183–211) and the entire `duplicateExercise` function (lines ~213–236).

- [ ] **Step 6: Remove the duplicate Copy button from the block header**

Find the block header button group (the `<div className="ml-auto flex items-center gap-1">`). Remove the entire Copy button inside it:

```tsx
{/* DELETE THIS ENTIRE BUTTON: */}
<Button
  variant="ghost"
  size="icon"
  onClick={() => duplicateBlock(wi, bi)}
  className="text-muted-foreground hover:text-foreground h-8 w-8"
  title="Duplicate block"
>
  <Copy className="h-3.5 w-3.5" />
</Button>
```

- [ ] **Step 7: Remove the duplicate Copy button from the exercise row**

Find the exercise action button group. Remove the Copy button:

```tsx
{/* DELETE THIS ENTIRE BUTTON: */}
<Button
  variant="ghost"
  size="icon"
  onClick={() => duplicateExercise(wi, bi, ei)}
  className="text-muted-foreground hover:text-foreground h-7 w-7"
  title="Duplicate exercise"
>
  <Copy className="h-3 w-3" />
</Button>
```

Also remove `Copy` from the lucide-react import line if it's no longer used anywhere else.

- [ ] **Step 8: Type-check and run tests**

```bash
npx tsc --noEmit 2>&1 | head -30
npx vitest run lib/__tests__/clipboard-context.test.ts
```

Expected: no TS errors, tests still pass.

---

## Task 6: New server actions for calendar paste

**Files:**
- Modify: `actions/calendar-workout-actions.ts`

- [ ] **Step 1: Add `pasteExercisesToBlockAction` at the end of `actions/calendar-workout-actions.ts`**

```ts
// ---------------------------------------------------------------------------
// Paste exercises from clipboard into a block
// ---------------------------------------------------------------------------

type PasteExerciseInput = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  sets: {
    orderIndex: number;
    setType: string;
    targetReps: number | null;
    targetWeight: number | null;
    targetDuration: number | null;
    targetRPE: number | null;
    restAfter: number | null;
  }[];
};

export async function pasteExercisesToBlockAction(
  blockId: string,
  exercises: PasteExerciseInput[]
): Promise<ActionResult<void>> {
  const user = await getClinicianUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: {
          include: { program: { select: { clinicianId: true, patientId: true } } },
        },
        exercises: {
          select: { orderIndex: true },
          orderBy: { orderIndex: "desc" },
          take: 1,
        },
      },
    });
    if (!block || block.workout.program.clinicianId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    let nextOrder = (block.exercises[0]?.orderIndex ?? -1) + 1;
    for (const ex of exercises) {
      await prisma.blockExerciseV2.create({
        data: {
          blockId,
          exerciseId: ex.exerciseId,
          orderIndex: nextOrder++,
          restSeconds: ex.restSeconds,
          notes: ex.notes,
          supersetGroup: ex.supersetGroup,
          sets: {
            create: ex.sets.map((s) => ({
              orderIndex: s.orderIndex,
              setType: s.setType,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight,
              targetDuration: s.targetDuration,
              targetRPE: s.targetRPE,
              restAfter: s.restAfter,
            })),
          },
        },
      });
    }

    if (block.workout.program.patientId) revalidatePatient(block.workout.program.patientId);
    return { success: true };
  } catch (error) {
    console.error("Failed to paste exercises:", error);
    return { success: false, error: "Failed to paste exercises" };
  }
}
```

- [ ] **Step 2: Add `pasteBlockToWorkoutAction` immediately after**

```ts
// ---------------------------------------------------------------------------
// Paste a block from clipboard into a workout
// ---------------------------------------------------------------------------

type PasteBlockInput = {
  name: string | null;
  type: string;
  rounds: number;
  timeCap: number | null;
  restBetweenRounds: number | null;
  notes: string | null;
  exercises: PasteExerciseInput[];
};

export async function pasteBlockToWorkoutAction(
  workoutId: string,
  block: PasteBlockInput
): Promise<ActionResult<void>> {
  const user = await getClinicianUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: { select: { clinicianId: true, patientId: true } },
        blocks: {
          select: { orderIndex: true },
          orderBy: { orderIndex: "desc" },
          take: 1,
        },
      },
    });
    if (!workout || workout.program.clinicianId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const nextBlockOrder = (workout.blocks[0]?.orderIndex ?? -1) + 1;

    await prisma.workoutBlockV2.create({
      data: {
        workoutId,
        name: block.name,
        type: block.type,
        orderIndex: nextBlockOrder,
        rounds: block.rounds,
        timeCap: block.timeCap,
        restBetweenRounds: block.restBetweenRounds,
        notes: block.notes,
        exercises: {
          create: block.exercises.map((ex, exIdx) => ({
            exerciseId: ex.exerciseId,
            orderIndex: exIdx,
            restSeconds: ex.restSeconds,
            notes: ex.notes,
            supersetGroup: ex.supersetGroup,
            sets: {
              create: ex.sets.map((s) => ({
                orderIndex: s.orderIndex,
                setType: s.setType,
                targetReps: s.targetReps,
                targetWeight: s.targetWeight,
                targetDuration: s.targetDuration,
                targetRPE: s.targetRPE,
                restAfter: s.restAfter,
              })),
            },
          })),
        },
      },
    });

    if (workout.program.patientId) revalidatePatient(workout.program.patientId);
    return { success: true };
  } catch (error) {
    console.error("Failed to paste block:", error);
    return { success: false, error: "Failed to paste block" };
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `actions/calendar-workout-actions.ts`.

---

## Task 7: `workout-editor-panel.tsx` — selection state, visual indicators, exercise checkboxes

**Files:**
- Modify: `components/calendar/workout-editor-panel.tsx`

- [ ] **Step 1: Add imports at the top of the file**

Add to the existing import block:

```tsx
import { cn } from "@/lib/utils";
import { useClipboard, stripIds } from "@/lib/clipboard-context";
import { useBuilderKeyboard } from "@/hooks/use-builder-keyboard";
import {
  pasteExercisesToBlockAction,
  pasteBlockToWorkoutAction,
} from "@/actions/calendar-workout-actions";
import { toast as sonnerToast } from "sonner";
```

Note: the file already imports `toast` from `sonner` — rename the new import to `sonnerToast` to avoid conflict, or check if the existing import uses a different alias. If `toast` is already imported, skip the `sonnerToast` import and use the existing `toast`.

- [ ] **Step 2: Add `SelectionState` type and `DEFAULT_SELECTION` constant**

Add these just before the `WorkoutEditorPanelProps` interface:

```tsx
interface SelectionState {
  level: "block" | "exercises" | null;
  blockIndex: number | null;
  blockId: string | null;
  exerciseIdxs: Set<number>;
}

const DEFAULT_SELECTION: SelectionState = {
  level: null,
  blockIndex: null,
  blockId: null,
  exerciseIdxs: new Set(),
};
```

Note: no `"workout"` level in the calendar — the workout (session) is always the one open in the panel.

- [ ] **Step 3: Add calendar-to-clipboard conversion helpers**

Add these module-level functions (not inside any component) just before `WorkoutEditorPanel`:

```tsx
function calendarExToClipboardEx(ex: any) {
  return {
    exerciseId: ex.exercise.id as string,
    orderIndex: ex.orderIndex as number,
    restSeconds: (ex.restSeconds ?? null) as number | null,
    notes: (ex.notes ?? null) as string | null,
    supersetGroup: (ex.supersetGroup ?? null) as string | null,
    _exerciseName: ex.exercise.name as string,
    sets: (ex.sets as any[]).map((s, i) => ({
      orderIndex: i,
      setType: (s.setType ?? "NORMAL") as string,
      targetReps: (s.targetReps ?? null) as number | null,
      targetWeight: (s.targetWeight ?? null) as number | null,
      targetDuration: (s.targetDuration ?? null) as number | null,
      targetDistance: (s.targetDistance ?? null) as number | null,
      targetRPE: (s.targetRPE ?? null) as number | null,
      restAfter: (s.restAfter ?? null) as number | null,
    })),
  };
}

function calendarBlockToClipboardBlock(block: any) {
  return {
    name: (block.name ?? null) as string | null,
    type: block.type as string,
    orderIndex: block.orderIndex as number,
    rounds: (block.rounds ?? 1) as number,
    restBetweenRounds: (block.restBetweenRounds ?? null) as number | null,
    timeCap: (block.timeCap ?? null) as number | null,
    notes: (block.notes ?? null) as string | null,
    exercises: (block.exercises as any[]).map(calendarExToClipboardEx),
  };
}
```

- [ ] **Step 4: Add `selection`, `hoveredPasteTarget`, and `clipboard` state inside `WorkoutEditorPanel`**

Find the main `WorkoutEditorPanel` function and add after the existing `useState` declarations:

```tsx
const [selection, setSelection] = useState<SelectionState>(DEFAULT_SELECTION);
const [hoveredPasteTarget, setHoveredPasteTarget] = useState<string | null>(null);
const { clipboard } = useClipboard();
```

- [ ] **Step 5: Add `handleExerciseCheck` inside `WorkoutEditorPanel`**

Add near the bottom of the internal handler functions section (before `handleOpenChange`):

```tsx
function handleExerciseCheck(
  blockIndex: number,
  blockId: string,
  exerciseIndex: number,
  checked: boolean
) {
  setSelection((prev) => {
    const sameBlock =
      prev.level === "exercises" &&
      prev.blockIndex === blockIndex;
    const newIdxs = sameBlock ? new Set(prev.exerciseIdxs) : new Set<number>();
    if (checked) {
      newIdxs.add(exerciseIndex);
      return { level: "exercises", blockIndex, blockId, exerciseIdxs: newIdxs };
    }
    newIdxs.delete(exerciseIndex);
    return newIdxs.size > 0
      ? { level: "exercises", blockIndex, blockId, exerciseIdxs: newIdxs }
      : DEFAULT_SELECTION;
  });
}
```

- [ ] **Step 6: Update `SortableExercise` component to accept checkbox props**

Find `function SortableExercise({ ... }: any)`. The component currently receives `onDuplicateExercise` as a prop. Add two new props to the destructure:

```tsx
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
  onAddSet,
  onUpdateNotes,
  patientId,
  sessionStatus,
  exerciseLog,
  isSelected,         // NEW
  onToggleSelect,     // NEW
}: any) {
```

- [ ] **Step 7: Add checkbox to `SortableExercise` render**

Inside `SortableExercise`, find the outer div:

```tsx
<div ref={setNodeRef} style={style} className="py-2 border-b last:border-0 border-border group">
```

Add the checkbox as the first element inside the exercise header flex row. Find:

```tsx
<div className="flex items-start justify-between">
  <div className="flex items-center gap-3 flex-1">
    <div {...attributes} {...listeners} className={...}>
      <GripVertical ... />
    </div>
```

Insert a checkbox before the drag handle:

```tsx
<div className="flex items-start justify-between">
  <div className="flex items-center gap-3 flex-1">
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 rounded border-gray-300 cursor-pointer transition-opacity mt-1",
        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}
      checked={!!isSelected}
      onChange={(e) => {
        e.stopPropagation();
        onToggleSelect?.(e.target.checked);
      }}
      onClick={(e) => e.stopPropagation()}
      disabled={sessionStatus === "COMPLETED"}
    />
    <div {...attributes} {...listeners} className={...}>
```

- [ ] **Step 8: Add block selection click + ring + paste affordance in the block render**

Find the block container div in the session render (around line 1262):

```tsx
<div key={block.id} className="mb-6 relative">
```

Replace with:

```tsx
<div
  key={block.id}
  className={cn(
    "mb-6 relative rounded-lg transition-shadow",
    selection.level === "block" && selection.blockIndex === blockIndex
      ? "ring-2 ring-blue-400"
      : "",
    clipboard?.type === "exercises" &&
    hoveredPasteTarget === `block-${blockIndex}`
      ? "outline outline-2 outline-dashed outline-blue-400"
      : ""
  )}
  onMouseEnter={() => {
    if (clipboard?.type === "exercises") setHoveredPasteTarget(`block-${blockIndex}`);
  }}
  onMouseLeave={() => setHoveredPasteTarget(null)}
>
```

Find the block header div:

```tsx
<div className="flex items-center justify-between mb-2 pb-1 border-b border-muted">
```

Replace with:

```tsx
<div
  className="flex items-center justify-between mb-2 pb-1 border-b border-muted cursor-pointer"
  onClick={(e) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, [role='combobox']")) return;
    setSelection({
      level: "block",
      blockIndex,
      blockId: block.id,
      exerciseIdxs: new Set(),
    });
  }}
>
```

- [ ] **Step 9: Pass checkbox props to `SortableExercise`**

Find the `<SortableExercise ... />` render. Add two new props:

```tsx
<SortableExercise
  key={exercise.id}
  id={exercise.id}
  exercise={exercise}
  blockIndex={blockIndex}
  exerciseIndex={exerciseIndex}
  blockLetter={blockLetter}
  isCircuit={isCircuit}
  savingSetIds={savingSetIds}
  patientId={patientId}
  sessionStatus={session.status}
  exerciseLog={session.exerciseLogs?.find((l: any) => l.blockExerciseId === exercise.id)}
  onSetChange={handleSetChange}
  onDeleteSet={handleDeleteSet}
  onDeleteExercise={handleDeleteExercise}
  onAddSet={handleAddSet}
  onUpdateNotes={handleUpdateExerciseNotes}
  isSelected={
    selection.level === "exercises" &&
    selection.blockIndex === blockIndex &&
    selection.exerciseIdxs.has(exerciseIndex)
  }
  onToggleSelect={(checked) =>
    handleExerciseCheck(blockIndex, block.id, exerciseIndex, checked)
  }
/>
```

Note: `onDuplicateExercise` is also removed from here (it will be removed in Task 8).

- [ ] **Step 10: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the changes above.

---

## Task 8: `workout-editor-panel.tsx` — copy, paste, keyboard wiring, remove old duplicate items

**Files:**
- Modify: `components/calendar/workout-editor-panel.tsx`

- [ ] **Step 1: Add `copy` to the `useClipboard` destructure**

Find:

```tsx
const { clipboard } = useClipboard();
```

Change to:

```tsx
const { clipboard, copy } = useClipboard();
```

- [ ] **Step 2: Add `handleCopy` inside `WorkoutEditorPanel`**

Add after `handleExerciseCheck`:

```tsx
function handleCopy() {
  if (!session) return;
  const { level, blockIndex, blockId, exerciseIdxs } = selection;

  if (level === "block" && blockIndex !== null) {
    const block = session.workout.blocks[blockIndex];
    const data = calendarBlockToClipboardBlock(block);
    copy({ type: "block", data: data as any, label: `"${block.name || "Block"}"` });
  } else if (level === "exercises" && blockIndex !== null && exerciseIdxs.size > 0) {
    const block = session.workout.blocks[blockIndex];
    const sorted = Array.from(exerciseIdxs).sort((a, b) => a - b);
    const exs = sorted.map((i) => calendarExToClipboardEx(block.exercises[i]));
    const firstName = block.exercises[sorted[0]]?.exercise?.name ?? "Exercise";
    const label = exs.length === 1 ? `"${firstName}"` : `${exs.length} exercises`;
    copy({ type: "exercises", data: exs as any, label });
  }
}
```

- [ ] **Step 3: Add `handlePaste` inside `WorkoutEditorPanel`**

Add after `handleCopy`:

```tsx
async function handlePaste() {
  if (!clipboard || !session) return;

  if (clipboard.type === "block") {
    const result = await pasteBlockToWorkoutAction(
      session.workout.id,
      clipboard.data as any
    );
    if (result.success) {
      toast.success(`Block "${clipboard.data.name || "Block"}" pasted`);
      const refreshed = await getSessionWithWorkout(session.id);
      if (refreshed.success) setSession(refreshed.data);
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
    return;
  }

  if (clipboard.type === "exercises") {
    const { blockIndex, blockId } = selection;
    if (blockIndex === null || blockId === null) {
      toast.info("Click a block first, then paste");
      return;
    }
    const result = await pasteExercisesToBlockAction(
      blockId,
      clipboard.data as any
    );
    if (result.success) {
      const n = clipboard.data.length;
      toast.success(`${n} exercise${n > 1 ? "s" : ""} pasted`);
      const refreshed = await getSessionWithWorkout(session.id);
      if (refreshed.success) setSession(refreshed.data);
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
    return;
  }

  if (clipboard.type === "workout") {
    toast.info("To paste a full workout day into the calendar, use the program builder");
  }
}
```

Note: `setSession` is the existing state setter for the session. `getSessionWithWorkout` and `setSession` are already in scope inside `WorkoutEditorPanel`.

- [ ] **Step 4: Wire `useBuilderKeyboard`**

Add after `handlePaste`:

```tsx
useBuilderKeyboard({
  onCopy: handleCopy,
  onPaste: handlePaste,
  onEscape: () => setSelection(DEFAULT_SELECTION),
});
```

- [ ] **Step 5: Remove "Duplicate Block" from block header dropdown**

Find the block header dropdown `<DropdownMenuContent>`. Remove these lines:

```tsx
<DropdownMenuItem onClick={() => handleDuplicateBlock(blockIndex)}>
  <Copy className="h-3.5 w-3.5 mr-1.5" />
  Duplicate Block
</DropdownMenuItem>
<DropdownMenuSeparator />   {/* the separator immediately before Delete Block */}
```

- [ ] **Step 6: Remove `onDuplicateExercise` prop from `SortableExercise` render**

In the JSX where `<SortableExercise ... />` is rendered, remove:

```tsx
onDuplicateExercise={handleDuplicateExercise}
```

- [ ] **Step 7: Remove "Duplicate" item from exercise dropdown inside `SortableExercise`**

Inside the `SortableExercise` component, find the `<DropdownMenuContent>`:

```tsx
<DropdownMenuItem onClick={() => onDuplicateExercise(blockIndex, exerciseIndex)}>
  <Copy className="h-3.5 w-3.5 mr-1.5" />
  Duplicate
</DropdownMenuItem>
<DropdownMenuSeparator />
```

Remove both those lines (the item and its separator).

- [ ] **Step 8: Remove `Copy` from lucide-react import if no longer used**

Check whether `Copy` is still referenced anywhere in the file. If not, remove it from the import line:

```tsx
import { GripVertical, Dumbbell, Trash2, Loader2, X, Plus, MoreVertical, Calendar as CalendarIcon, ChevronDown, ChevronRight, Settings, CheckCircle, Info, Sparkles } from "lucide-react";
```

- [ ] **Step 9: Final type-check and test run**

```bash
npx tsc --noEmit 2>&1 | head -30
npx vitest run 2>&1 | tail -20
```

Expected: no TS errors, all existing tests still pass.

- [ ] **Step 10: Start dev server and verify manually**

```bash
npm run dev
```

Verify the following golden paths:
1. Open a program in the builder. Click a workout day card header — blue ring appears. Press Ctrl+C — toast shows "Day X copied". Open a different program, press Ctrl+V — new day appended.
2. Click a block header — blue ring. Press Ctrl+C — toast shows block name. Click a different day header. Press Ctrl+V — block appears in that day.
3. Hover over an exercise — checkbox appears. Check it. Press Ctrl+C — toast shows exercise name. Click a block in another day. Press Ctrl+V — exercise appears.
4. Open the calendar, open a workout session panel. Click a block header — blue ring. Press Ctrl+C. Navigate to a different session (or open the same one). Press Ctrl+V — block appears and panel refreshes.
5. Check exercises in the calendar panel. Press Ctrl+C. Click a different block header. Press Ctrl+V — exercises pasted.
6. Press Escape — all selections clear, no blue rings.
7. Refresh the page — clipboard toast persists (localStorage).
