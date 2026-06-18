# Workout Pill Three-Dot Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible ⋯ menu to session workout pills in the schedule view and client calendar, offering "Duplicate to date" and "Delete" actions for clinicians.

**Architecture:** A React context is defined at the module level in each file to pass the refresh callback (and `isClinician` flag in the schedule view) into the pill component — necessary because react-big-calendar only passes the `event` prop. The pill component holds its own local Dialog/loading state, calls server actions directly, and stops click propagation so the ⋯ click doesn't simultaneously open the edit panel.

**Tech Stack:** Next.js App Router, React context, `@base-ui/react` (Dialog + DropdownMenu via `@/components/ui/dialog` and `@/components/ui/dropdown-menu`), existing server actions `deleteSession` and `duplicateWorkoutToDateAction` from `@/actions/calendar-workout-actions`.

## Global Constraints

- Only show the menu when `event.isSession === true && !!event.sessionId` (schedule view) — template/structural workouts get no menu.
- `ClientCalendar` is always a clinician view; show menu unconditionally there.
- Stop click propagation on the `DropdownMenuTrigger` so react-big-calendar's `onSelectEvent` does not fire alongside the menu.
- Delete: immediate, no confirm step, `toast.success("Workout deleted")` on success.
- Duplicate: Dialog with `<input type="date">` + "Duplicate" button, `toast.success("Workout duplicated")` on success.
- No new files — modify the two existing component files only.

---

### Task 1: `program-schedule-view.tsx` — add context + update EventPill

**Files:**
- Modify: `components/programs/program-schedule-view.tsx`

**Interfaces:**
- Consumes: `deleteSession(sessionId: string): Promise<ActionResult<void>>` and `duplicateWorkoutToDateAction(sessionId: string, targetDate: string): Promise<ActionResult<{ sessionId: string }>>` from `@/actions/calendar-workout-actions`
- Produces: updated `EventPill` that renders `⋯` menu and `SchedulePillCtx` context that `ProgramScheduleView` provides

- [ ] **Step 1: Add imports**

In `components/programs/program-schedule-view.tsx`, make these import changes:

Change line 3 from:
```tsx
import { useState, useCallback, useMemo, useTransition } from "react";
```
to:
```tsx
import { useState, useCallback, useMemo, useTransition, createContext, useContext } from "react";
```

Add `MoreHorizontal` and `Copy` to the existing lucide import block (lines 27–38). The block currently ends with `Repeat,` — add the two icons:
```tsx
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  Info,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Loader2,
  Timer,
  Repeat,
  MoreHorizontal,
  Copy,
} from "lucide-react";
```

Add these new import blocks after the existing imports (after the `dragAndDrop` CSS import on line ~51):
```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteSession,
  duplicateWorkoutToDateAction,
} from "@/actions/calendar-workout-actions";
```

- [ ] **Step 2: Add the context**

Insert this block immediately after the import section and before the `const monLocale = ...` line (~line 53):

```tsx
const SchedulePillCtx = createContext<{ isClinician: boolean; onRefresh: () => void }>({
  isClinician: false,
  onRefresh: () => {},
});
```

- [ ] **Step 3: Replace the EventPill component**

Replace the entire `EventPill` function (lines 296–322 in the original file) with:

```tsx
function EventPill({ event }: { event: ScheduleEvent }) {
  const { isClinician, onRefresh } = useContext(SchedulePillCtx);
  const cfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.SCHEDULED;
  const exerciseCount = event.workout.blocks.reduce(
    (sum, b) => sum + b.exercises.length,
    0
  );
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeDate, setDupeDate] = useState("");
  const [dupeLoading, setDupeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showMenu = isClinician && event.isSession && !!event.sessionId;

  async function handleDelete() {
    if (!event.sessionId || deleting) return;
    setDeleting(true);
    const result = await deleteSession(event.sessionId);
    setDeleting(false);
    if (result.success) {
      toast.success("Workout deleted");
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  }

  async function handleDuplicate() {
    if (!event.sessionId || !dupeDate || dupeLoading) return;
    setDupeLoading(true);
    const result = await duplicateWorkoutToDateAction(event.sessionId, dupeDate);
    setDupeLoading(false);
    if (result.success) {
      toast.success("Workout duplicated");
      setDupeOpen(false);
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to duplicate");
    }
  }

  return (
    <>
      <div
        className="h-full overflow-hidden rounded-[5px] transition-opacity hover:opacity-90 cursor-pointer"
        style={{
          backgroundColor: cfg.bg,
          borderLeft: `3px solid ${cfg.border}`,
          color: cfg.text,
        }}
      >
        <div className="px-2 py-1 flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-semibold leading-tight">
              {event.title}
            </p>
            <p className="mt-0.5 text-[10px] opacity-70">
              {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
              {event.isSession && ` · ${cfg.label}`}
            </p>
          </div>
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="shrink-0 flex h-5 w-5 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
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
            </DropdownMenu>
          )}
        </div>
      </div>

      <Dialog open={dupeOpen} onOpenChange={setDupeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Choose a date to copy <strong>{event.title}</strong> to.
            </p>
            <Input
              type="date"
              value={dupeDate}
              onChange={(e) => setDupeDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!dupeDate || dupeLoading}
            >
              {dupeLoading ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Wrap ProgramScheduleView's return in the context provider**

In `ProgramScheduleView` (exported function at line ~973), find the `return (` statement (line ~1403). Wrap the outer `<div className="space-y-4">` in the context provider. The current return looks like:

```tsx
  return (
    <div className="space-y-4">
      ...
    </div>
  );
```

Change it to:

```tsx
  return (
    <SchedulePillCtx.Provider
      value={{ isClinician, onRefresh: () => startTransition(() => router.refresh()) }}
    >
      <div className="space-y-4">
        ...
      </div>
    </SchedulePillCtx.Provider>
  );
```

(Keep all existing JSX inside the `<div>` unchanged.)

- [ ] **Step 5: Verify the TypeScript build compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors related to `program-schedule-view.tsx`. Fix any type errors before continuing.

---

### Task 2: `client-calendar.tsx` — add context + update EventComponent

**Files:**
- Modify: `components/calendar/client-calendar.tsx`

**Interfaces:**
- Consumes: same `deleteSession` and `duplicateWorkoutToDateAction` actions
- Consumes: `handleRefresh` already defined in `ClientCalendar` as `const handleRefresh = useCallback(() => router.refresh(), [router])`
- Produces: updated `EventComponent` with ⋯ menu and `CalendarPillCtx` that `ClientCalendar` provides

- [ ] **Step 1: Add imports**

Change line 3 from:
```tsx
import { useState, useCallback, useMemo } from "react";
```
to:
```tsx
import { useState, useCallback, useMemo, createContext, useContext } from "react";
```

Change the lucide import (line ~23) to add `MoreHorizontal` and `Copy`:
```tsx
import { Plus, Dumbbell, ChevronLeft, ChevronRight, Sparkles, MoreHorizontal, Copy } from "lucide-react";
```

Add `Input` to the existing Button import:
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

Add these new import blocks after the existing imports (before the `const localizer = ...` block):
```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteSession,
  duplicateWorkoutToDateAction,
} from "@/actions/calendar-workout-actions";
```

- [ ] **Step 2: Add the context**

Insert immediately before `const localizer = dateFnsLocalizer(...)`:

```tsx
const CalendarPillCtx = createContext<{ onRefresh: () => void }>({
  onRefresh: () => {},
});
```

- [ ] **Step 3: Replace the EventComponent**

Replace the entire `EventComponent` function (lines 118–139 in the original file) with:

```tsx
function EventComponent({ event }: { event: SessionEvent }) {
  const { onRefresh } = useContext(CalendarPillCtx);
  const c = statusConfig[event.status] ?? statusConfig.SCHEDULED;
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeDate, setDupeDate] = useState("");
  const [dupeLoading, setDupeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteSession(event.id);
    setDeleting(false);
    if (result.success) {
      toast.success("Workout deleted");
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  }

  async function handleDuplicate() {
    if (!dupeDate || dupeLoading) return;
    setDupeLoading(true);
    const result = await duplicateWorkoutToDateAction(event.id, dupeDate);
    setDupeLoading(false);
    if (result.success) {
      toast.success("Workout duplicated");
      setDupeOpen(false);
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to duplicate");
    }
  }

  return (
    <>
      <div
        className="h-full overflow-hidden rounded-[5px] transition-opacity hover:opacity-90"
        style={{
          backgroundColor: c.bg,
          borderLeft: `3px solid ${c.border}`,
          color: c.text,
        }}
      >
        <div className="px-2 py-1 flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-semibold leading-tight">
              {event.workoutName}
            </p>
            <p className="mt-0.5 text-[10px] opacity-60">
              {event.exerciseCount} ex
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="shrink-0 flex h-5 w-5 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
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
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={dupeOpen} onOpenChange={setDupeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Choose a date to copy <strong>{event.workoutName}</strong> to.
            </p>
            <Input
              type="date"
              value={dupeDate}
              onChange={(e) => setDupeDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!dupeDate || dupeLoading}
            >
              {dupeLoading ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Wrap ClientCalendar's return in the context provider**

In the `ClientCalendar` exported function, find the `return (` statement (line ~323). Wrap the outer `<div className="space-y-4">` in the context provider using the already-defined `handleRefresh`:

```tsx
  return (
    <CalendarPillCtx.Provider value={{ onRefresh: handleRefresh }}>
      <div className="space-y-4">
        ...
      </div>
    </CalendarPillCtx.Provider>
  );
```

(Keep all existing JSX inside the `<div>` unchanged.)

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 6: Manual smoke test**

Start the dev server:
```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npm run dev
```

Test checklist:
1. Open a client calendar — each session pill shows a `⋯` icon.
2. Clicking `⋯` opens dropdown with "Duplicate to date" and "Delete" (red).
3. Clicking `⋯` does NOT open the workout editor panel.
4. "Duplicate to date" opens a centered Dialog with a date input and Duplicate/Cancel buttons.
5. Selecting a date and clicking "Duplicate" shows toast "Workout duplicated" and the new session appears on the calendar.
6. "Delete" immediately removes the session and shows toast "Workout deleted".
7. Open a program schedule view with sessions assigned — same behavior on the session pills.
8. Open a program schedule view in structural/template mode (no sessions) — pills show no `⋯` icon.
