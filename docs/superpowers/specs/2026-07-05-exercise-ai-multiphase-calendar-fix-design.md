# Feature Design: Multi-Phase Exercises, AI YouTube Autofill, Calendar Popup Scroll Fix

## Overview

Three related fixes to the exercise creation flow and program schedule calendar, requested together from two screenshots:

1. Exercises can only be tagged with one `ExercisePhase` today, but a single exercise (e.g. a lunge with rotation) can legitimately belong to more than one phase (Mobility + Strength). This needs to become a true multi-select, end to end.
2. The "Create New Exercise" modal already has a Video URL field, and the codebase already has an AI pipeline (`/api/ai/generate-exercise-metadata`) that extracts a YouTube video's metadata/transcript and generates exercise fields via GPT-4o — it's just not wired into this modal's UI.
3. The program schedule calendar's "edit workout" popup has no height cap, so its scrollable content area never actually scrolls — exercises below the fold are unreachable.

## Part 1 — Multi-Phase Exercises

### Schema change

`prisma/schema.prisma`, `model Exercise`:

```prisma
// before
exercisePhase ExercisePhase?

// after
exercisePhases ExercisePhase[]
```

The `ExercisePhase` enum itself (`WARMUP`, `ACTIVATION`, `STRENGTHENING`, `MOBILITY`, `COOLDOWN`) is unchanged.

### Data migration

Datasource is MongoDB, so there's no SQL migration — but existing documents have `exercisePhase` as a scalar string (or absent), which the new Prisma Client will not read correctly once the schema says array. Order of operations:

1. Run a one-off script (`lib/db/scripts/backfill-exercise-phases.ts`) against the **raw** MongoDB collection (via `$runCommandRaw` or the underlying driver, not the typed Prisma Client) that renames/reshapes every `Exercise` document: if `exercisePhase` is a string, set `exercisePhases: [thatValue]`; if null/missing, set `exercisePhases: []`. Then unset the old `exercisePhase` field.
2. Only after the backfill has run against the target database does the Prisma schema change (`exercisePhase?` → `exercisePhases[]`) get deployed, followed by `prisma generate` / `prisma db push`.

This script is a one-time operational step, run once per environment (dev, staging, prod), not part of normal app boot.

### Consumers to update (treat phase as array everywhere)

| File | Change |
|---|---|
| `lib/services/exercise.service.ts` | Filter param becomes `exercisePhases?: ExercisePhase[]` matched with Prisma `hasSome`; create/update accept `exercisePhases: ExercisePhase[]`. |
| `actions/exercise-actions.ts`, `actions/bulk-exercise-actions.ts` | Pass `exercisePhases: ExercisePhase[]` through instead of a single value. |
| `components/exercises/exercise-filters.tsx` | Phase filter becomes multi-select; matches "any of" the selected phases instead of exact equality. |
| `components/exercises/exercise-card.tsx` | Renders one badge per phase in `exercisePhases` instead of a single badge. |
| `components/exercises/csv-import-form.tsx`, `bulk-import-form.tsx`, `lib/validators/csv-exercise.ts` | CSV column accepts semicolon-separated phase values (e.g. `MOBILITY;STRENGTHENING`), parsed/validated into `ExercisePhase[]`. Bulk-import's native `<select>` becomes a multi-select control. |
| `lib/services/ai.service.ts` | Read-only phase references in prompt-building switch from raw string to `.join(", ")`. |
| `lib/db/seed/exercises-v2.ts`, `exercises-v3.ts`, `import-athletic-program.ts`, `tag-exercises-ai.ts` | Seed data updated to the array shape. |
| `lib/services/__tests__/exercise.service.test.ts` | Updated fixtures/assertions for array field and `hasSome` filtering. |
| `components/programs/exercise-picker-dialog.tsx`, `components/calendar/workout-editor-panel.tsx`, `components/programs/program-schedule-view.tsx` | Any inline phase display/filter logic updated to array. |

## Part 2 — AI YouTube Autofill in Create Exercise Modal

### UI: AI / Manual tabs

`components/programs/exercise-picker-dialog.tsx`'s "create" view gets a shadcn `Tabs` component with two tabs:

- **AI Generate** (default selected)
- **Manual**

Each tab owns **fully independent form state** — no data is shared or copied between them when switching tabs. Whichever tab is active when "Create & Add to Program" is clicked is the one whose state gets submitted.

### AI Generate tab

1. Initial state: a Video URL input and a "Generate with AI" button. The button is disabled until the input contains a valid YouTube URL (checked with the existing `isYouTubeUrl` util from `lib/utils/video.ts`).
2. On click: POST to `/api/ai/generate-exercise-metadata` with `{ youtubeUrl }` (existing route, reused as-is for fetch/transcript/GPT-4o work). Show a loading state on the button while the request is in flight.
3. On success: reveal the full field set in the same tab — Name, Body Region, Difficulty, Phase(s) (multi-select), Description — pre-filled from the AI response but editable, plus the existing "Visible to all organizations" toggle and Create button.
4. On error: show an inline error message with a "Retry" action; form fields are not revealed.

### Manual tab

Identical to today's create form, unchanged except the Phase field becomes a multi-select (see Part 1). Starts empty; independent of whatever happened on the AI tab.

### AI route schema change

`app/api/ai/generate-exercise-metadata/route.ts`:

```ts
// before
exercisePhase: z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"])
  .describe("Workout phase this exercise best fits"),

// after
exercisePhases: z.array(z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]))
  .min(1)
  .describe("Workout phase(s) this exercise fits — an exercise can belong to more than one, e.g. mobility and strength"),
```

The generation prompt is updated to tell the model an exercise can belong to multiple phases and to return all that apply.

## Part 3 — Calendar Popup Scroll Fix

`components/programs/program-schedule-view.tsx`:

- Line 1807: `DialogContent` gets `max-h-[85vh]` added to its className (matching the pattern already used in `exercise-picker-dialog.tsx` and `components/calendar/workout-editor-panel.tsx`).
- Line 967: the `flex-1 overflow-y-auto` content div inside `EditPanel` gets `min-h-0` added, so it can actually shrink within the now-bounded dialog and scroll instead of growing unbounded.

This mirrors the already-working pattern in `workout-editor-panel.tsx` (`max-h-[92vh]` on the dialog + `min-h-0 overflow-y-auto` on the body).

## Testing

- Update/extend `exercise.service.test.ts` for array-based phase filtering and create/update.
- Manual QA: create an exercise via AI tab from a real YouTube link, verify multi-phase badges show correctly in the exercise list/filters; create one via Manual tab with 2+ phases selected; run the backfill script against a dev DB copy and confirm existing exercises still filter/display correctly; open the program schedule calendar popup for a workout with many exercise blocks and confirm it scrolls.

## Out of Scope

- Switching the AI provider from OpenAI (`gpt-4o`) to Anthropic (installed but unused `@ai-sdk/anthropic`) — not requested, existing pipeline is reused as-is.
- Auto-triggering AI generation on URL paste/blur — explicitly rejected in favor of a manual "Generate with AI" button.
- Any changes to the `ReadOnlyPanel` scroll behavior in `program-schedule-view.tsx` — it already scrolls correctly via `ScrollArea max-h-[60vh]`.
