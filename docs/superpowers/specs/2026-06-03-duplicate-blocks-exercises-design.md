# Duplicate Blocks & Exercises Design

**Date:** 2026-06-03  
**Status:** Approved

## Problem

Clinicians building multi-day programs must manually recreate repeated blocks (e.g., the same warm-up on every day). There is no way to duplicate a block or exercise — neither in the program builder form nor in the calendar workout editor.

## Goals

1. **Program builder**: One-click duplicate for blocks and individual exercises; result inserted directly below source; existing drag-and-drop handles repositioning.
2. **Calendar editor panel**: 3-dot menu on blocks and exercises replaces standalone delete button; menu contains Duplicate and Delete.

---

## Program Builder (`components/programs/program-builder.tsx`)

### UI Changes

**Block header**: Add a `Copy` icon button (lucide `Copy`) next to the existing delete (trash) icon on each block's header row.

**Exercise row**: Add a `Copy` icon button next to the existing delete icon on each exercise row within a block.

### Client-Side Logic (no server calls)

**`duplicateBlock(workoutIdx, blockIdx)`**
- Deep-clone `workouts[workoutIdx].blocks[blockIdx]`
- Strip all `id` fields from the clone and all nested exercises/sets (so they're treated as new on save)
- Insert the clone at `blockIdx + 1` in the blocks array
- Reassign `orderIndex` for all blocks after insertion
- Call `onChange(next)`

**`duplicateExercise(workoutIdx, blockIdx, exerciseIdx)`**
- Deep-clone `workouts[workoutIdx].blocks[blockIdx].exercises[exerciseIdx]`
- Strip all `id` fields from the clone and its nested sets
- Insert at `exerciseIdx + 1` in the exercises array
- Reassign `orderIndex` for all exercises after insertion
- Call `onChange(next)`

Both follow the identical mutation pattern already used by `addExerciseToBlock` and the delete functions.

---

## Calendar Workout Editor Panel (`components/calendar/workout-editor-panel.tsx`)

### Block: Add to Existing Dropdown

The block header already has a `DropdownMenu` triggered by the Settings icon. Add a "Duplicate Block" `DropdownMenuItem` above the existing separator and "Delete Block" item. No UI restructuring needed.

**`handleDuplicateBlock(blockIndex)`**
- Call new server action `duplicateBlockAction(blockId)`
- On success: insert returned block into `session.workout.blocks` at `blockIndex + 1`, call `onWorkoutUpdated()`

### Exercise: Replace Trash Button with 3-dot Menu

In `SortableExercise`, replace the standalone `Trash2` button with a `DropdownMenu` triggered by `MoreVertical` (`MoreVertical` already imported). The menu contains:
- "Duplicate" — calls `onDuplicateExercise(blockIndex, exerciseIndex)`
- "Delete" — calls `onDeleteExercise(blockIndex, exerciseIndex)` (existing)

`SortableExercise` gains a new `onDuplicateExercise` prop (same signature as `onDeleteExercise`).

**`handleDuplicateExercise(blockIndex, exerciseIndex)`** in the parent
- Call new server action `duplicateBlockExerciseAction(blockExerciseId)`
- On success: insert returned exercise into `block.exercises` at `exerciseIndex + 1`, call `onWorkoutUpdated()`

---

## New Server Actions (`actions/calendar-workout-actions.ts`)

### `duplicateBlockAction(blockId: string)`

1. Auth + ownership check (block → workout → program → clinicianId === user.id)
2. Fetch block with all exercises and their sets
3. Compute next `orderIndex` = current block's `orderIndex + 1`
4. Increment `orderIndex` of all subsequent blocks in the same workout by 1
5. Create new `WorkoutBlockV2` with same name/type/rounds/timeCap/restBetweenRounds/notes, `orderIndex` = computed
6. For each exercise in order: create `BlockExerciseV2` with same exerciseId/restSeconds/notes, then create its `ExerciseSet` records
7. Return the fully populated new block (same shape as what `getSessionWithWorkout` returns for a block)

### `duplicateBlockExerciseAction(blockExerciseId: string)`

1. Auth + ownership check (blockExercise → block → workout → program → clinicianId === user.id)
2. Fetch the block exercise with its sets
3. Compute next `orderIndex` = current exercise's `orderIndex + 1`
4. Increment `orderIndex` of all subsequent exercises in the same block by 1
5. Create new `BlockExerciseV2` with same exerciseId/restSeconds/notes, `orderIndex` = computed
6. Create its `ExerciseSet` records in order
7. Return the fully populated new block exercise

---

## Out of Scope

- Copy/paste between different sessions or programs
- Keyboard shortcuts (Cmd+C / Cmd+V)
- Duplicating an entire workout day
