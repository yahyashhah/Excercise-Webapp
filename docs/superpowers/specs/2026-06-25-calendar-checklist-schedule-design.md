# Design: Calendar Grid Lines, Checklist Can't-Do Reasons, Program Schedule Three-Dot Menus

Date: 2026-06-25

## Overview

Three independent UI improvements:
1. Add grid lines to the client dashboard calendar so it reads as a proper calendar
2. Show an inline reason textarea when a client clicks "Can't do" in the workout checklist (including additional sets)
3. Add three-dot duplicate/delete menus to template workout events in the program schedule view

---

## Feature 1 — Client Dashboard Calendar Grid Lines

**File:** `components/dashboard/client-session-calendar.tsx`

**Problem:** The custom 7-column CSS grid has no visible cell borders, so it looks like a list of floating numbers rather than a calendar.

**Solution:** Wrap the grid in a bordered container and add cell-level borders:
- Wrap the day-header row and the day-grid in a single `border rounded-lg overflow-hidden` container
- Day header row: `bg-muted/40` background, `border-b` separator
- Each header cell: `border-r border-border/40`, last child omits `border-r`
- Each day cell: `border-r border-b border-border/40`, last column omits `border-r`, first row omits `border-t` (container border covers it)
- Empty padding cells also get the same borders to keep the grid uniform

No logic changes — CSS only.

---

## Feature 2 — Checklist "Can't Do" Inline Reason

**File:** `components/workout/workout-checklist-tracker.tsx`

**Problem:**
- Clicking "Can't do" immediately submits with hardcoded `notes: "Unable to complete"`
- "Can't do" is hidden for additional (extra) sets via `{!isExtra && ...}` guard

**Solution:**

### State
Add `pendingSkips: Map<string, string>` (key = `inputKey(ex.id, setIndex)`, value = typed reason text). A key present in the map means that set is in "pending skip" mode (textarea shown). A key absent means normal state.

### Interaction flow
1. "Can't do" click: add the key to `pendingSkips` with empty string — do NOT submit yet
2. An inline block appears below the set row:
   - Compact `<Textarea>` placeholder `"Why can't you do this? (optional)"`
   - "Skip set" confirm button (amber style) + "×" cancel button
3. Confirm: call `handleLogSet(block, ex, i, true, reason)` where `reason` is the typed text or `undefined` if empty, then remove key from `pendingSkips`
4. Cancel: remove key from `pendingSkips`, no submission

### handleLogSet signature change
```ts
async function handleLogSet(
  block, ex, setIndex, skipSet = false, skipReason?: string
)
```
When `skipSet = true`: `data = { actualReps: 0, notes: skipReason || undefined }`  
(Removes the hardcoded "Unable to complete" string)

### Additional sets
Remove the `{!isExtra && ...}` guard around the "Can't do" button — extra sets get the same button and the same textarea flow.

### Admin side
`app/(platform)/clients/[id]/sessions/[sessionId]/page.tsx` — the `SetRow` component already renders `log.notes` under the "Couldn't complete" badge. No changes needed; reasons flow through automatically.

---

## Feature 3 — Program Schedule Template Three-Dot Menus

### Files
- `components/programs/program-schedule-view.tsx` (UI changes)
- `actions/program-workout-actions.ts` (new server actions)

### Problem
`EventPill` shows the three-dot menu only when `event.isSession && !!event.sessionId`. Template events (`isSession: false`) have no menu despite trainers needing to manage them.

### showMenu logic change
```ts
// Before
const showMenu = isTrainer && event.isSession && !!event.sessionId;

// After
const showMenu = isTrainer && (event.isSession ? !!event.sessionId : true);
```

### Template event — Duplicate
- Menu item: "Duplicate to week/day"
- Dialog: two selects — "Week" (1 to totalWeeks derived from `rawWorkouts`) and "Day" (Mon–Sun, displayed as names, stored as 0–6)
- On confirm: calls `duplicateWorkoutToDayAction(workoutId, targetWeekIndex, targetDayIndex)`
- On success: toast + `onRefresh()`

### Template event — Delete
- Menu item: "Delete" (destructive)
- Immediate call (no confirmation dialog) to `deleteWorkoutFromProgramAction(workoutId)`
- On success: toast + `onRefresh()`

### New server actions (`actions/program-workout-actions.ts`)

**`deleteWorkoutFromProgramAction(workoutId: string)`**
- Auth: current user must be TRAINER and own the program (`workout.program.trainerId === user.id`)
- Delete: `prisma.workoutV2.delete({ where: { id: workoutId } })` — cascades to blocks/exercises/sets
- Revalidate: program page path

**`duplicateWorkoutToDayAction(workoutId: string, weekIndex: number, dayIndex: number)`**
- Auth: same ownership check
- Deep clone: fetch workout with full blocks→exercises→sets, create new workout with same name + " (copy)", same programId, `weekIndex`, `dayIndex`
- Clone blocks in order, clone exercises in order, clone sets in order
- Revalidate: program page path

### Session events (unchanged)
Session events continue using the existing `deleteSession` and `duplicateWorkoutToDateAction` from `actions/calendar-workout-actions.ts`.

---

## Data model

No schema changes. All three features work within existing Prisma models:
- `SetLog.notes: String?` already exists — stores the can't-do reason
- `WorkoutV2` with `weekIndex` / `dayIndex` already exists — used for template duplication positioning
