# Program Editor & Calendar Unification — Design

**Date:** 2026-07-21
**Status:** Approved in brainstorming; pending final spec review
**Sub-project:** 2 of 4 in the production-readiness sequence (AI generation → program editor/calendar → patient experience → foundation hardening)

## 1. Context & Goals

Trainers edit a program's exercises/weeks/sessions through three independently-built surfaces, and view/reschedule sessions through two independently-built calendars. Each pair diverges in ways that make the app feel unreliable rather than merely inconsistent:

- **Full-page editor** (`/programs/[id]/edit` → `program-editor.tsx` + `program-builder.tsx`): one big form, one "Update Program" button that replaces the entire workout tree on save. This is the surface that had the data-loss bug (fixed as an emergency hotfix in sub-project 2's investigation phase — see §7).
- **Schedule-tab modal** (`program-schedule-view.tsx`, 1840 lines): a dirty-tracked panel with its own "Save Changes" button, coarser sets/reps editing (a single set count, not per-set) than the full editor.
- **Calendar side-panel** (`workout-editor-panel.tsx`, 1640 lines): the only one of the three that already autosaves per field today, via `calendar-workout-actions.ts` (1423 lines, 18 exported actions).
- **Two calendars**: `client-calendar.tsx` (client detail page, instant/optimistic drag-to-reschedule) and an embedded calendar inside `program-schedule-view.tsx` (revert-on-failure optimistic move, but used for a different case — unassigned/template programs moving day/week position rather than rescheduling a real session). Two more calendar files (`workout-calendar.tsx`, `calendar-with-sidebar.tsx`) are dead code, unused anywhere.

**Concrete gaps a trainer runs into today:**
- Swapping one exercise for another means removing it and re-adding it — the removed exercise's configured sets/reps/rest/notes are lost.
- No day-level drag-reorder inside the editor (only blocks/exercises within a day are sortable).
- No undo anywhere.
- Two of the three surfaces require an explicit save action, with no strong feedback that a save actually took effect — a contributor to the "feels fragile" complaint.

**Goals:**
1. One consistent editing experience — same save model, same components — regardless of which page a trainer opens.
2. One consistent calendar experience — same drag-to-reschedule feel — regardless of where the calendar appears.
3. Close the two concrete capability gaps: swap-exercise (config-preserving) and day-level drag-reorder.
4. A short undo window for destructive edits, since autosave removes the "cancel before it's real" safety net trainers have today in two of the three surfaces.
5. Never repeat the data-loss incident: every migration step that touches save-path code is verified live against disposable throwaway data before being considered done.

**Non-goals (explicitly out of scope):**
- "Duplicate week" (bulk-copy a week to another week position) — considered and explicitly deferred by the product owner; single-session duplication (`duplicateWorkoutToDateAction`/`duplicateWorkoutToDayAction`) stays as-is.
- Full multi-step undo/redo history — only a short-lived (~6–8s) single-action undo toast.
- Mobile/touch-specific redesign of the drag-and-drop interactions — noted as a real gap in exploration (low responsive-class density, default pointer-only DnD sensors) but not addressed in this pass.
- Any change to the AI generation pipeline (sub-project 1, already complete) or to patient-facing session logging (sub-project 3).
- Feature-flagged or big-bang rollout — see §3 for why incremental migration was chosen instead.

## 2. Architecture

Three new shared pieces replace the current five independent implementations (three editors, two calendars):

### 2.1 Shared editing core
- **Service/action layer**: consolidates and extends the existing fine-grained, already-proven-safe actions in `actions/workout-editor-actions.ts` and `actions/calendar-workout-actions.ts` (which today implement overlapping logic three different ways against the same schema) into one module. Adds one new action: swap-exercise (updates `BlockExerciseV2.exerciseId` in place, preserving its existing sets/notes/rest — no delete+recreate).
- **Client hook** (`useWorkoutEditor` or similar): the single way any surface mutates a workout. Wraps the action layer with:
  - Optimistic local state updates (instant UI feedback).
  - Autosave — each edit fires its own targeted server action in the background; no batch/explicit save step.
  - Short-lived undo — after a destructive action resolves, exposes an "undo" callback for ~6–8 seconds that re-issues an inverse action with the same config.
  - Error handling — on a failed action, reverts the optimistic change and surfaces a retry-capable error toast.

### 2.2 Shared editor UI
One set of presentational components — block/exercise/set rows, the exercise picker, a new swap-exercise dialog, and a day-list with drag-reorder (extending the existing `@dnd-kit` `SortableContext` pattern already used for blocks/exercises to the day level) — replacing `program-builder.tsx`, the modal in `program-schedule-view.tsx`, and `workout-editor-panel.tsx`.

### 2.3 Shared calendar
One `ProgramCalendar` component built on `react-big-calendar` + `withDragAndDrop`, handling two cases with one consistent optimistic-update pattern:
- **Real sessions** (`WorkoutSessionV2` exists): drag = reschedule via `rescheduleSessionAction`, using `client-calendar.tsx`'s already-instant optimistic pattern.
- **Template/unassigned programs** (no session yet): drag = move day/week position via `moveWorkoutAction`, using `program-schedule-view.tsx`'s revert-on-failure optimistic pattern.

Replaces both existing calendar embeds; `workout-calendar.tsx` and `calendar-with-sidebar.tsx` (confirmed unused anywhere in the live app) are deleted, not migrated.

## 3. Migration order & why incremental

Three approaches were considered: (A) incremental — build the shared core, migrate one surface at a time, each independently shippable; (B) big-bang rewrite — build the replacement, then swap and delete the old surfaces in one large change; (C) feature-flagged rollout — build alongside the old, toggle, remove old once confident.

**Approach A was chosen.** The data-loss incident during this sub-project's own investigation phase happened because a change to this exact save-path code was large enough that its failure mode (a slow, cluster-specific transaction-timeout interaction) wasn't caught until it hit real data. A big-bang rewrite (B) of the same code carries the same category of risk at a larger scale. A feature flag (C) adds a toggling mechanism this app has no other use for — pure overhead for a change that can instead be validated by testing thoroughly before moving to each next surface.

**Steps, each shipped and live-verified before the next begins:**

1. Build the shared action/service layer + `useWorkoutEditor` hook. No UI change. Unit-tested in isolation.
2. Build the shared presentational editor components (not yet wired into any real page).
3. **Migrate the calendar side-panel first.** It already autosaves per field today, making it the lowest-risk validation of the new shared core end-to-end.
4. Migrate the Schedule-tab modal onto the same core, removing its batched "Save Changes" button in favor of autosave.
5. **Migrate the full-page editor last.** Highest risk: it's the surface that had the data-loss bug, and it handles the heaviest structural edits (add/remove/reorder whole days). Landing this step deletes the emergency-patched `updateProgram`/`replaceWorkoutTree` full-tree-diff service entirely (see §7), replacing it with the same fine-grained per-action mutations already proven safe by step 3.
6. Add swap-exercise to the shared core, surfaced in all three now-unified contexts.
7. Add day-level drag-reorder to the shared editor UI.
8. Consolidate the two calendars into `ProgramCalendar`, migrate both usage sites (client detail page, program Schedule tab), delete the two dead legacy calendar files.

## 4. Autosave, undo, and error handling

- Every edit — rename, reorder (block/exercise/day), sets/reps/notes/rest change, add/remove/swap exercise, add/remove block — triggers one targeted server action. No whole-tree replace is ever used by the unified editor.
- **Optimistic UI**: local state updates immediately; the server action runs in the background; success reconciles silently (no visible "saved" flash needed for every keystroke, but a subtle persistent "Saved"/"Saving…" indicator is shown for the editor as a whole, addressing the "does this feel fragile" complaint directly).
- **Undo**: destructive actions (remove exercise, remove block, remove day) show a toast — "Removed [exercise name] — Undo" — for 6–8 seconds. Clicking it re-issues an add action with the exact prior configuration (sets/reps/rest/notes). After the toast expires, the action is final; no persistent undo history.
- **Failure**: a failed action reverts its optimistic change and shows an error toast with a retry button that re-attempts the same action.

## 5. Day-level drag-reorder

The day list within a program (currently rendered as a static list in the full editor) becomes a `@dnd-kit` `SortableContext`, matching the pattern already used for blocks and exercises within a day. Dropping a day into a new position calls the existing `moveWorkoutAction` (already used by the calendar's "structural mode" drag) to update `dayIndex`/`weekIndex`/`orderIndex`.

## 6. Testing & verification

- Each new/changed service function gets Vitest unit tests following existing conventions (mocked Prisma client, following the pattern in `program.service.test.ts` and `workout-editor-actions.test.ts` if present).
- **Standing rule for this sub-project, learned directly from the data-loss incident**: any implementation step that touches save-path/mutation code must be live-verified against a disposable throwaway program (created and torn down by the verification step itself) before being considered done — confirming both that the intended edit persisted and that no unrelated session/data was destroyed. Real client or trainer data is never used for verification.
- Manual end-to-end pass through each migrated surface in the browser before moving to the next migration step, per the project's `verify` skill.

## 7. Relationship to the emergency data-loss fix

During this sub-project's investigation, `lib/services/program.service.ts`'s `updateProgram` (and the identically-affected `updateGlobalProgram`) was found to delete and recreate every `Workout` row on every save — cascading to delete real scheduled/completed `WorkoutSessionV2` rows whenever a trainer edited an already-assigned program. This was fixed ahead of and independently from this design: `updateProgram` now diffs incoming workouts against existing ones by id, updates matched workouts in place (preserving their id and therefore their sessions), and only deletes a removed workout if it has zero sessions attached. The fix is live, tested (unit tests + full suite passing, plus live verification against disposable throwaway data at realistic scale), and does not depend on this design to be safe.

This design's step 5 (§3) *removes* that fixed-but-still-blunt full-tree-diff code entirely, replacing it with the same fine-grained per-action mutation pattern used everywhere else — not because the hotfix is unsafe, but because a single "replace everything, diffed" save is exactly the kind of operation that caused the original incident, and the unified editor's autosave model has no need for it once every surface uses targeted mutations.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Repeating the data-loss incident during migration | Every save-path change verified live against disposable throwaway data before being considered done (§6); migration order deliberately puts the highest-risk surface (full editor) last, after the shared core is already proven by three lower-risk migrations |
| Autosave feels less predictable than an explicit Save button to trainers used to it | Persistent "Saved"/"Saving…" indicator + undo toast on destructive actions gives comparable confidence without the "did my last edit actually go through" uncertainty explicit-save surfaces have today |
| This cluster's measured latency (a 29-workout full-tree save took ~18s even after the emergency fix) could make individual autosaved actions feel slow too | Each autosaved action is a single targeted mutation (rename, one prescription update, etc.), not a whole-tree operation — comparable in cost to the calendar panel's actions today, which already feel responsive in production |
| Consolidating three action modules into one could silently change behavior for an edge case not caught in review | Existing action tests are carried forward; new tests target the consolidated module directly; each surface migration is manually verified end-to-end before the next starts |
