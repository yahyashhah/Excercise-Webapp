# Exercise AI Autofill, Multi-Phase, Calendar Scroll Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an exercise carry multiple `ExercisePhase` tags end-to-end, add an AI-powered "generate from YouTube link" flow to the Create Exercise modal, and fix the program schedule calendar's workout popup so it actually scrolls.

**Architecture:** `Exercise.exercisePhase` (single optional enum) becomes `Exercise.exercisePhases` (enum array) across the Prisma schema, service layer, server actions, CSV/bulk import, filters, and display components. The "Create New Exercise" view inside `ExercisePickerDialog` is restructured into two independent-state tabs (AI Generate / Manual), where the AI tab calls the already-existing `/api/ai/generate-exercise-metadata` YouTube pipeline. The calendar popup fix is an isolated CSS change to `program-schedule-view.tsx`.

**Tech Stack:** Next.js App Router, Prisma + MongoDB, Vercel AI SDK (`generateObject` + `@ai-sdk/openai`), shadcn/ui (`Tabs`, `Select`, `Dialog`), vitest.

## Global Constraints

- Datasource is MongoDB via Prisma — no SQL migrations; schema changes are applied with `prisma db push`, and existing documents are NOT automatically reshaped, so the backfill script (Task 2) is mandatory before `exercisePhases`-based filtering/display is trusted in an existing environment.
- `exercisePhase` (singular) is being fully removed from the codebase — no field should be left reading/writing the old name after this plan completes (verified in the final task).
- Do not touch `components/exercises/exercise-form.tsx` or `lib/validators/exercise.ts` — confirmed to have zero references to phase; out of scope.
- AI generation in the Create Exercise modal is a manual "Generate with AI" button — never auto-triggered on paste/blur.
- The AI tab and Manual tab in the create-exercise view keep fully independent form state — switching tabs never copies data between them.
- `git add`/`git commit` are never run by the implementer — the user reviews and commits changes themselves.

---

### Task 1: Prisma schema — `exercisePhase` → `exercisePhases`

**Files:**
- Modify: `prisma/schema.prisma:190`

**Interfaces:**
- Produces: `Exercise.exercisePhases: ExercisePhase[]` (Prisma-generated type), consumed by every task below.

- [ ] **Step 1: Change the field**

In `prisma/schema.prisma`, in `model Exercise`:

```prisma
// before
  exercisePhase      ExercisePhase?

// after
  exercisePhases     ExercisePhase[]
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors. This does not require a live database connection.

- [ ] **Step 3: Confirm the old field name is gone from generated types**

Run: `grep -r "exercisePhase:" node_modules/.prisma/client/index.d.ts | grep -v exercisePhases`
Expected: no output (only `exercisePhases` should appear).

---

### Task 2: One-time backfill script for existing data

**Files:**
- Create: `lib/db/scripts/backfill-exercise-phases.ts`
- Modify: `package.json` (add script)

**Interfaces:**
- Consumes: `prisma.$runCommandRaw` (same pattern as `backfillExerciseSources` in `lib/services/exercise.service.ts:226-238`).
- Produces: nothing consumed by other tasks — this is an operational script run manually against a real database, not part of the app's runtime code path.

- [ ] **Step 1: Write the backfill script**

Create `lib/db/scripts/backfill-exercise-phases.ts`:

```ts
import { prisma } from "@/lib/prisma";

/**
 * One-time backfill: reshapes every Exercise document's legacy scalar
 * `exercisePhase` field into the new `exercisePhases` array field.
 * MongoDB doesn't retroactively apply Prisma type changes to existing
 * documents, so this must run against the raw collection.
 */
async function backfillExercisePhases() {
  const wrapExisting = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { exercisePhase: { $exists: true, $ne: null } },
        u: [
          { $set: { exercisePhases: ["$exercisePhase"] } },
          { $unset: "exercisePhase" },
        ],
        multi: true,
      },
      {
        q: { exercisePhase: { $exists: true, $eq: null } },
        u: [
          { $set: { exercisePhases: [] } },
          { $unset: "exercisePhase" },
        ],
        multi: true,
      },
      {
        q: { exercisePhases: { $exists: false } },
        u: { $set: { exercisePhases: [] } },
        multi: true,
      },
    ],
  });

  console.log("Backfill result:", JSON.stringify(wrapExisting, null, 2));
}

backfillExercisePhases()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
```

- [ ] **Step 2: Add an npm script for it**

In `package.json`, add to `"scripts"` (alongside the other `db:*` entries):

```json
    "db:backfill-exercise-phases": "npx tsx lib/db/scripts/backfill-exercise-phases.ts",
```

- [ ] **Step 3: Run it against your dev database**

Run: `npm run db:backfill-exercise-phases`
Expected: `Backfill result: { "ok": 1, ... }` with `n` matching your total exercise count. This requires a working `DATABASE_URL` — run it yourself if the implementing environment has no DB access.

---

### Task 3: `exercise.service.ts` — array-based filtering, selects, and create

**Files:**
- Modify: `lib/services/exercise.service.ts:10-58, 60-91, 110-156`

**Interfaces:**
- Consumes: `Exercise.exercisePhases: ExercisePhase[]` (Task 1).
- Produces: `ExerciseFilters.exercisePhases?: ExercisePhase[]`, `createExercise(data: { ..., exercisePhases?: ExercisePhase[] })` — consumed by Task 5 (actions).

- [ ] **Step 1: Update `ExerciseFilters` and `getExercises`**

```ts
// before
export interface ExerciseFilters {
  search?: string;
  bodyRegion?: BodyRegion;
  difficultyLevel?: DifficultyLevel;
  exercisePhase?: ExercisePhase;
  equipment?: string;
  source?: ExerciseSource;
  organizationId?: string;
}

export async function getExercises(filters: ExerciseFilters = {}) {
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      ...(filters.bodyRegion && { bodyRegion: filters.bodyRegion }),
      ...(filters.difficultyLevel && { difficultyLevel: filters.difficultyLevel }),
      ...(filters.exercisePhase && { exercisePhase: filters.exercisePhase }),
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
      ...(filters.equipment && {
        equipmentRequired: { has: filters.equipment },
      }),
      ...(filters.source === "UNIVERSAL" && { source: "UNIVERSAL" as const }),
      ...(filters.source === "ORGANIZATION" && {
        source: "ORGANIZATION" as const,
        ...(filters.organizationId ? { organizationId: filters.organizationId } : { organizationId: "__none__" }),
      }),
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      exercisePhase: true,
      equipmentRequired: true,
      description: true,
      imageUrl: true,
      videoUrl: true,
      isActive: true,
      source: true,
      isPublic: true,
      organizationId: true,
    },
    orderBy: { name: "asc" },
  });
}

// after
export interface ExerciseFilters {
  search?: string;
  bodyRegion?: BodyRegion;
  difficultyLevel?: DifficultyLevel;
  exercisePhases?: ExercisePhase[];
  equipment?: string;
  source?: ExerciseSource;
  organizationId?: string;
}

export async function getExercises(filters: ExerciseFilters = {}) {
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      ...(filters.bodyRegion && { bodyRegion: filters.bodyRegion }),
      ...(filters.difficultyLevel && { difficultyLevel: filters.difficultyLevel }),
      ...(filters.exercisePhases?.length && { exercisePhases: { hasSome: filters.exercisePhases } }),
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
      ...(filters.equipment && {
        equipmentRequired: { has: filters.equipment },
      }),
      ...(filters.source === "UNIVERSAL" && { source: "UNIVERSAL" as const }),
      ...(filters.source === "ORGANIZATION" && {
        source: "ORGANIZATION" as const,
        ...(filters.organizationId ? { organizationId: filters.organizationId } : { organizationId: "__none__" }),
      }),
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      exercisePhases: true,
      equipmentRequired: true,
      description: true,
      imageUrl: true,
      videoUrl: true,
      isActive: true,
      source: true,
      isPublic: true,
      organizationId: true,
    },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 2: Update `getExercisesForPicker`'s select**

```ts
// in getExercisesForPicker's select block, before
      exercisePhase: true,

// after
      exercisePhases: true,
```

- [ ] **Step 3: Update `createExercise`**

```ts
// before
export async function createExercise(data: {
  name: string;
  description?: string;
  bodyRegion: BodyRegion;
  equipmentRequired: string[];
  difficultyLevel: DifficultyLevel;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  createdById: string;
  source?: ExerciseSource;
  organizationId?: string;
  isPublic?: boolean;
  exercisePhase?: ExercisePhase;
}) {
  const videoUrl = data.videoUrl?.trim() || buildYouTubeSearchUrl(data.name);
  let imageUrl = data.imageUrl?.trim() || undefined;

  if (!imageUrl) {
    const ytId = extractYouTubeId(videoUrl);
    if (ytId) {
      imageUrl = getYouTubeThumbnail(ytId);
    }
  }

  return prisma.exercise.create({
    data: {
      name: data.name,
      description: data.description,
      bodyRegion: data.bodyRegion,
      equipmentRequired: data.equipmentRequired,
      difficultyLevel: data.difficultyLevel,
      contraindications: data.contraindications,
      instructions: data.instructions,
      videoUrl,
      videoProvider: data.videoProvider,
      imageUrl,
      createdById: data.createdById,
      source: data.source ?? "UNIVERSAL",
      organizationId: data.organizationId ?? null,
      isPublic: data.isPublic ?? true,
      exercisePhase: data.exercisePhase,
    },
  });
}

// after
export async function createExercise(data: {
  name: string;
  description?: string;
  bodyRegion: BodyRegion;
  equipmentRequired: string[];
  difficultyLevel: DifficultyLevel;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  createdById: string;
  source?: ExerciseSource;
  organizationId?: string;
  isPublic?: boolean;
  exercisePhases?: ExercisePhase[];
}) {
  const videoUrl = data.videoUrl?.trim() || buildYouTubeSearchUrl(data.name);
  let imageUrl = data.imageUrl?.trim() || undefined;

  if (!imageUrl) {
    const ytId = extractYouTubeId(videoUrl);
    if (ytId) {
      imageUrl = getYouTubeThumbnail(ytId);
    }
  }

  return prisma.exercise.create({
    data: {
      name: data.name,
      description: data.description,
      bodyRegion: data.bodyRegion,
      equipmentRequired: data.equipmentRequired,
      difficultyLevel: data.difficultyLevel,
      contraindications: data.contraindications,
      instructions: data.instructions,
      videoUrl,
      videoProvider: data.videoProvider,
      imageUrl,
      createdById: data.createdById,
      source: data.source ?? "UNIVERSAL",
      organizationId: data.organizationId ?? null,
      isPublic: data.isPublic ?? true,
      exercisePhases: data.exercisePhases ?? [],
    },
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep exercise.service`
Expected: no output (errors elsewhere in the codebase from not-yet-updated consumers are expected at this point in the plan and are fixed by later tasks).

---

### Task 4: Update `exercise.service.test.ts` for array-based phase

**Files:**
- Modify: `lib/services/__tests__/exercise.service.test.ts`

**Interfaces:**
- Consumes: `getExercises`, `getExercisesForPicker` from Task 3.

- [ ] **Step 1: Update fixtures to the array shape**

Replace every `exercisePhase: null,` in the three fixtures (`universalEx`, `publicOrganizationEx`, `privateOrganizationEx`) with `exercisePhases: [],`.

- [ ] **Step 2: Add a failing test for multi-phase filtering**

Add this new `describe` block at the end of the file, after the existing `describe('getExercises', ...)` block:

```ts
describe('getExercises phase filtering', () => {
  it('matches exercises with any of the requested phases (hasSome)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ exercisePhases: ['MOBILITY', 'STRENGTHENING'] as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          exercisePhases: { hasSome: ['MOBILITY', 'STRENGTHENING'] },
        }),
      })
    )
  })

  it('omits the phase clause entirely when no phases are requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('exercisePhases')
  })
})
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/services/__tests__/exercise.service.test.ts`
Expected: all tests pass, including the two new ones.

---

### Task 5: `actions/exercise-actions.ts` + `actions/bulk-exercise-actions.ts`

**Files:**
- Modify: `actions/exercise-actions.ts:173-213`
- Modify: `actions/bulk-exercise-actions.ts:10-25, 42-76, 100-148`

**Interfaces:**
- Consumes: `createExercise({ exercisePhases })` from Task 3.
- Produces: `createOrganizationExerciseAction(input: { ..., exercisePhases?: string[] })`, `BulkExerciseInput.exercisePhases: string[]` — consumed by Task 7 (bulk import form) and Task 13 (picker dialog).

- [ ] **Step 1: Update `createOrganizationExerciseAction`**

```ts
// before
export async function createOrganizationExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  difficultyLevel: string;
  videoUrl?: string;
  isPublic: boolean;
  exercisePhase?: string;
}) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  try {
    const exercise = await exerciseService.createExercise({
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      bodyRegion: input.bodyRegion as BodyRegion,
      difficultyLevel: input.difficultyLevel as DifficultyLevel,
      equipmentRequired: [],
      contraindications: [],
      videoUrl: input.videoUrl?.trim() || undefined,
      createdById: dbUser.id,
      source: organizationOrgId ? "ORGANIZATION" : "UNIVERSAL",
      organizationId: organizationOrgId ?? undefined,
      isPublic: input.isPublic,
      exercisePhase: input.exercisePhase as ExercisePhase | undefined,
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create organization exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}

// after
export async function createOrganizationExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  difficultyLevel: string;
  videoUrl?: string;
  isPublic: boolean;
  exercisePhases?: string[];
}) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  try {
    const exercise = await exerciseService.createExercise({
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      bodyRegion: input.bodyRegion as BodyRegion,
      difficultyLevel: input.difficultyLevel as DifficultyLevel,
      equipmentRequired: [],
      contraindications: [],
      videoUrl: input.videoUrl?.trim() || undefined,
      createdById: dbUser.id,
      source: organizationOrgId ? "ORGANIZATION" : "UNIVERSAL",
      organizationId: organizationOrgId ?? undefined,
      isPublic: input.isPublic,
      exercisePhases: (input.exercisePhases as ExercisePhase[] | undefined) ?? [],
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create organization exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}
```

- [ ] **Step 2: Update `BulkExerciseInput` and `bulkCreateExercisesAction`**

```ts
// before
export interface BulkExerciseInput {
  name: string;
  description?: string;
  instructions?: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhase?: string;
  musclesTargeted: string[];
  equipmentRequired: string[];
  contraindications: string[];
  commonMistakes?: string;
  defaultSets?: number;
  defaultReps?: number;
  videoUrl?: string;
  imageUrl?: string;
}

// after
export interface BulkExerciseInput {
  name: string;
  description?: string;
  instructions?: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhases?: string[];
  musclesTargeted: string[];
  equipmentRequired: string[];
  contraindications: string[];
  commonMistakes?: string;
  defaultSets?: number;
  defaultReps?: number;
  videoUrl?: string;
  imageUrl?: string;
}
```

```ts
// in bulkCreateExercisesAction's prisma.exercise.create data block, before
            exercisePhase: (ex.exercisePhase as ExercisePhase) || null,

// after
            exercisePhases: (ex.exercisePhases as ExercisePhase[] | undefined) ?? [],
```

- [ ] **Step 3: Update `importExercisesFromCsvAction`**

```ts
// before
            exercisePhase: row.exercisePhase ? (row.exercisePhase as ExercisePhase) : null,

// after
            exercisePhases: (row.exercisePhases as ExercisePhase[] | undefined) ?? [],
```

- [ ] **Step 4: Typecheck the two files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "exercise-actions|bulk-exercise-actions"`
Expected: no errors in these two files (the `row.exercisePhases` reference will be fixed by Task 6; a temporary error there is expected until then).

---

### Task 6: CSV validator + import preview — semicolon-separated multi-phase

**Files:**
- Modify: `lib/validators/csv-exercise.ts:22, 37`
- Modify: `components/exercises/csv-import-form.tsx:18, 244`

**Interfaces:**
- Produces: `CsvExerciseRow.exercisePhases: string[]` — consumed by Task 5's `importExercisesFromCsvAction`.

- [ ] **Step 1: Update the CSV row schema to parse semicolon-separated phases**

```ts
// before
  exercisePhase: z.preprocess(emptyToUndefined, z.enum(EXERCISE_PHASES).optional()),

// after
  exercisePhases: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? [] : v),
    z.preprocess(
      (v) => (typeof v === "string" ? v.split(";").map((s) => s.trim()).filter(Boolean) : v),
      z.array(z.enum(EXERCISE_PHASES))
    )
  ),
```

- [ ] **Step 2: Run the existing CSV validator tests (if any) and typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep csv-exercise`
Expected: no errors.

- [ ] **Step 3: Update the CSV preview table**

```tsx
// before
const PREVIEW_COLUMNS = ["name", "bodyRegion", "difficultyLevel", "exercisePhase", "videoUrl"] as const;

// after
const PREVIEW_COLUMNS = ["name", "bodyRegion", "difficultyLevel", "exercisePhases", "videoUrl"] as const;
```

```tsx
// before
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.exercisePhase ?? "—"}</td>

// after
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.exercisePhases?.length ? row.exercisePhases.join(", ") : "—"}</td>
```

- [ ] **Step 4: Update the sample CSV template/docs if present**

Run: `grep -rln "exercisePhase\b" --include="*.csv" --include="*.md" .`
If any file lists `exercisePhase` as a CSV column header/example, update it to `exercisePhases` and show a semicolon-separated example value (e.g. `MOBILITY;STRENGTHENING`). If no results, skip this step.

---

### Task 7: `bulk-import-form.tsx` — multi-select phase pills

**Files:**
- Modify: `components/exercises/bulk-import-form.tsx:40-59, 61-82, 133-146, 264-295, 301-320, 700-728`

**Interfaces:**
- Consumes: `BulkExerciseInput.exercisePhases` (Task 5).
- Produces: `ExerciseRow.exercisePhases: string[]`.

- [ ] **Step 1: Change `ExerciseRow.exercisePhase` to `exercisePhases`**

```ts
// in the ExerciseRow interface, before
  exercisePhase: string;

// after
  exercisePhases: string[];
```

```ts
// in makeRow(), before
    exercisePhase: "",

// after
    exercisePhases: [],
```

- [ ] **Step 2: Update the AI-batch mapping in `processUrlBatch`**

```ts
// before
        newRow.exercisePhase = d.exercisePhase ?? "";

// after
        newRow.exercisePhases = d.exercisePhases ?? [];
```

- [ ] **Step 3: Update `generateMetadata`'s single-row AI call**

```ts
// before
        exercisePhase: d.exercisePhase ?? "",

// after
        exercisePhases: d.exercisePhases ?? [],
```

- [ ] **Step 4: Update the publish payload mapping**

```ts
// before
      exercisePhase: r.exercisePhase || undefined,

// after
      exercisePhases: r.exercisePhases,
```

- [ ] **Step 5: Replace the native single-select Phase `<select>` with a toggle-pill group**

```tsx
// before
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phase</Label>
              <select value={row.exercisePhase} onChange={(e) => onUpdate({ exercisePhase: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select…</option>
                {EXERCISE_PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

// after
            <div className="space-y-1.5 sm:col-span-3">
              <Label className="text-xs font-medium">Phase(s)</Label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_PHASES.map((p) => {
                  const active = row.exercisePhases.includes(p.value);
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => onUpdate({
                        exercisePhases: active
                          ? row.exercisePhases.filter((v) => v !== p.value)
                          : [...row.exercisePhases, p.value],
                      })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
```

Note this moves the Phase control out of the 3-column `Body Region / Difficulty / Phase` grid (since it now needs full width for the pill row) — the `sm:col-span-3` class makes it span the full grid width on the row directly below Body Region/Difficulty, which remain a 2-column pair. Update the enclosing grid from `sm:grid-cols-3` to `sm:grid-cols-2` at line 705 (`<div className="grid gap-3 sm:grid-cols-3">` → `sm:grid-cols-2`) so Body Region and Difficulty share one row and Phase(s) wraps to its own full-width row beneath.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep bulk-import-form`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, navigate to `/exercises/bulk-import`, paste a YouTube URL, let AI generate metadata, confirm the Phase pills reflect the AI's suggested phase(s) as active, and confirm clicking additional pills toggles them on/off independently. Publish and confirm the created exercise shows all selected phases.

---

### Task 8: `exercise-filters.tsx` — multi-select pill filter (page-level)

**Files:**
- Modify: `components/exercises/exercise-filters.tsx:11-18, 24-27, 58, 110-127`
- Modify: `app/(platform)/exercises/page.tsx:15-23, 36-44, 48-51, 118-120`

**Interfaces:**
- Consumes: `ExerciseFilters.exercisePhases` (Task 3).
- Produces: `?exercisePhase=WARMUP,MOBILITY` URL param (comma-separated, same query key as before).

- [ ] **Step 1: Update the pill row to support multiple active phases**

```tsx
// before
  const currentPhase      = searchParams.get("exercisePhase") || "";
  ...
  const hasFilters = currentSearch || currentRegion || currentDifficulty || currentPhase;
  ...
      <div className="flex flex-wrap gap-1.5">
        {EXERCISE_PHASES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => updateParam("exercisePhase", p.value)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              currentPhase === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

// after
  const currentPhases = (searchParams.get("exercisePhase") || "").split(",").filter(Boolean);
  ...
  const hasFilters = currentSearch || currentRegion || currentDifficulty || currentPhases.length > 0;
  ...
      <div className="flex flex-wrap gap-1.5">
        {EXERCISE_PHASES.filter((p) => p.value !== "").map((p) => {
          const active = currentPhases.includes(p.value);
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                const next = active
                  ? currentPhases.filter((v) => v !== p.value)
                  : [...currentPhases, p.value];
                updateParam("exercisePhase", next.join(","));
              }}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
```

Note the `EXERCISE_PHASES` array's first entry (`{ value: "", label: "All Categories" }`) is filtered out since "clear all" is now handled by the existing "Clear" button (`hasFilters` block) rather than an "All" pill — with multi-select, an explicit "All" pill has no single well-defined toggle behavior.

- [ ] **Step 2: Update the page that consumes this filter**

```tsx
// app/(platform)/exercises/page.tsx, Props interface, before
    exercisePhase?: string;

// after
    exercisePhase?: string; // comma-separated ExercisePhase values
```

```tsx
// before
  const exercises = await getExercises({
    search: params.search,
    bodyRegion: params.bodyRegion as BodyRegion | undefined,
    difficultyLevel: params.difficultyLevel as DifficultyLevel | undefined,
    exercisePhase: params.exercisePhase as ExercisePhase | undefined,
    equipment: params.equipment,
    source: activeSource as ExerciseSource,
    organizationId: activeSource === "ORGANIZATION" ? organizationOrgId : undefined,
  });

// after
  const exercisePhases = params.exercisePhase
    ? (params.exercisePhase.split(",").filter(Boolean) as ExercisePhase[])
    : undefined;

  const exercises = await getExercises({
    search: params.search,
    bodyRegion: params.bodyRegion as BodyRegion | undefined,
    difficultyLevel: params.difficultyLevel as DifficultyLevel | undefined,
    exercisePhases,
    equipment: params.equipment,
    source: activeSource as ExerciseSource,
    organizationId: activeSource === "ORGANIZATION" ? organizationOrgId : undefined,
  });
```

The `tabUrl` function (lines 48-51) needs no change — it already forwards `params.exercisePhase` as an opaque string, which now happens to be comma-separated.

- [ ] **Step 3: Update the `ExerciseCard` prop passed from this page**

```tsx
// before
              exercisePhase={exercise.exercisePhase}

// after
              exercisePhases={exercise.exercisePhases}
```

(This prop rename is completed on the `ExerciseCard` side in Task 9 — both sides must land together.)

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, navigate to `/exercises`, click two different phase pills, confirm both stay visually active and the list shows exercises matching either phase, then click "Clear" and confirm both deactivate.

---

### Task 9: Multi-badge display — `exercise-card.tsx`, exercise detail page, admin table

**Files:**
- Modify: `components/exercises/exercise-card.tsx:15-31, 39-67, 92-97`
- Modify: `app/(platform)/exercises/[id]/page.tsx:46-50`
- Modify: `app/admin/exercises/page.tsx:134-138`

**Interfaces:**
- Consumes: `Exercise.exercisePhases: string[]` (raw Prisma field, Task 1).

- [ ] **Step 1: Update `ExerciseCardProps` and phase badge rendering**

```tsx
// before
interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhase?: string | null;
  equipmentRequired: string[];
  ...
}
...
  const phase = exercisePhase
    ? (phaseConfig[exercisePhase] ?? { label: exercisePhase, className: "bg-black/60 text-white" })
    : null;

// after
interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhases?: string[];
  equipmentRequired: string[];
  ...
}
...
  const phases = (exercisePhases ?? []).map(
    (p) => phaseConfig[p] ?? { label: p, className: "bg-black/60 text-white" }
  );
```

Update the destructured props list accordingly:

```tsx
// before
export function ExerciseCard({
  id, name, bodyRegion, difficultyLevel, exercisePhase, equipmentRequired,

// after
export function ExerciseCard({
  id, name, bodyRegion, difficultyLevel, exercisePhases, equipmentRequired,
```

- [ ] **Step 2: Render multiple badges**

```tsx
// before
          {phase && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${phase.className}`}>
              {phase.label}
            </span>
          )}

// after
          {phases.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phases.map((phase) => (
                <span key={phase.label} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${phase.className}`}>
                  {phase.label}
                </span>
              ))}
            </div>
          )}
```

- [ ] **Step 3: Update the exercise detail page badges**

```tsx
// before
                {exercise.exercisePhase && (
                  <Badge className="bg-indigo-100 text-indigo-700 border-0">
                    {exercise.exercisePhase.charAt(0) + exercise.exercisePhase.slice(1).toLowerCase()}
                  </Badge>
                )}

// after
                {exercise.exercisePhases?.map((phase) => (
                  <Badge key={phase} className="bg-indigo-100 text-indigo-700 border-0">
                    {phase.charAt(0) + phase.slice(1).toLowerCase()}
                  </Badge>
                ))}
```

- [ ] **Step 4: Update the admin exercises table**

```tsx
// before
                  <td className="px-5 py-3 hidden md:table-cell">
                    {ex.exercisePhase
                      ? <span className="text-xs text-muted-foreground">{phaseLabel[ex.exercisePhase] ?? ex.exercisePhase}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>

// after
                  <td className="px-5 py-3 hidden md:table-cell">
                    {ex.exercisePhases?.length
                      ? <span className="text-xs text-muted-foreground">
                          {ex.exercisePhases.map((p: string) => phaseLabel[p] ?? p).join(", ")}
                        </span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
```

- [ ] **Step 5: Typecheck all three files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "exercise-card|exercises/\[id\]/page|admin/exercises/page"`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, view an exercise with 2+ phases (create one via Task 13 once complete, or manually update a document) on `/exercises`, `/exercises/[id]`, and `/admin/exercises` — confirm all phases render as separate badges/text in each view.

---

### Task 10: Read-only phase consumers — `ai.service.ts`, `workout-editor-actions.ts`, `workout-editor-panel.tsx`

**Files:**
- Modify: `lib/services/ai.service.ts:20, 184, 429, 565, 582, 773`
- Modify: `actions/workout-editor-actions.ts:241`
- Modify: `components/calendar/workout-editor-panel.tsx:89`

**Interfaces:**
- Consumes: `Exercise.exercisePhases: string[]` (Task 1).

- [ ] **Step 1: `ai.service.ts` — inline type at line 20**

```ts
// before
  exercisePhase: string | null

// after
  exercisePhases: string[]
```

- [ ] **Step 2: `ai.service.ts` — `EXERCISE_POOL_SELECT` at line 184**

```ts
// before
  musclesTargeted: true, exercisePhase: true, commonMistakes: true,

// after
  musclesTargeted: true, exercisePhases: true, commonMistakes: true,
```

- [ ] **Step 3: `ai.service.ts` — prompt pool string at line 429**

```ts
// before
              `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhase ?? 'STRENGTHENING'} | Region: ${e.bodyRegion} | ...`

// after
              `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhases.length ? e.exercisePhases.join('/') : 'STRENGTHENING'} | Region: ${e.bodyRegion} | ...`
```

(Keep the rest of the template string identical — only the `Phase:` segment changes.)

- [ ] **Step 4: `ai.service.ts` — select + inline type + prompt string around lines 565, 582, 773**

```ts
// select block, before
      exercisePhase: true,

// after
      exercisePhases: true,
```

```ts
// inline array type, before
    exercisePhase: string | null;

// after
    exercisePhases: string[];
```

```ts
// prompt string, before
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhase ?? "STRENGTHENING"} | Region: ${e.bodyRegion} | ...`

// after
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhases.length ? e.exercisePhases.join("/") : "STRENGTHENING"} | Region: ${e.bodyRegion} | ...`
```

- [ ] **Step 5: `actions/workout-editor-actions.ts`**

```ts
// before
      exercisePhase: true,

// after
      exercisePhases: true,
```

- [ ] **Step 6: `components/calendar/workout-editor-panel.tsx`**

```ts
// before
  exercisePhase?: string | null;

// after
  exercisePhases?: string[];
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "ai.service|workout-editor"`
Expected: no errors.

---

### Task 11: Seed scripts — mechanical field rename

**Files:**
- Modify: `lib/db/seed/exercises-v2.ts` (interface + ~104 literal occurrences)
- Modify: `lib/db/seed/exercises-v3.ts` (~97 literal occurrences)
- Modify: `lib/db/seed/import-athletic-program.ts` (type + ~72 literal occurrences)
- Modify: `lib/db/seed/seed.ts:19`
- Modify: `lib/db/seed/tag-exercises-ai.ts:21, 32, 76`

**Interfaces:**
- Produces: `SeedExercise.exercisePhases: ExercisePhase[]` — consumed by `seed.ts`'s spread-based create/update calls.

- [ ] **Step 1: Rename the shared `SeedExercise` interface field**

In `lib/db/seed/exercises-v2.ts`:

```ts
// before
  exercisePhase: ExercisePhase;

// after
  exercisePhases: ExercisePhase[];
```

- [ ] **Step 2: Codemod the per-exercise literals in `exercises-v2.ts` (no `as ExercisePhase` cast in this file)**

Run (macOS/BSD sed — note the empty `-i ''` argument):

```bash
sed -i '' -E 's/exercisePhase: "([A-Z]+)",/exercisePhases: ["\1"],/' lib/db/seed/exercises-v2.ts
```

Verify no old references remain:

Run: `grep -c "exercisePhase:" lib/db/seed/exercises-v2.ts`
Expected: `0`

- [ ] **Step 3: Codemod the per-exercise literals in `exercises-v3.ts` (has `as ExercisePhase` casts)**

Run:

```bash
sed -i '' -E 's/exercisePhase: "([A-Z]+)" as ExercisePhase,/exercisePhases: ["\1"] as ExercisePhase[],/' lib/db/seed/exercises-v3.ts
```

Verify: `grep -c "exercisePhase:" lib/db/seed/exercises-v3.ts`
Expected: `0`

- [ ] **Step 4: Rename the inline union type in `import-athletic-program.ts`**

```ts
// before
  exercisePhase: "WARMUP" | "ACTIVATION" | "STRENGTHENING" | "MOBILITY" | "COOLDOWN";

// after
  exercisePhases: ("WARMUP" | "ACTIVATION" | "STRENGTHENING" | "MOBILITY" | "COOLDOWN")[];
```

- [ ] **Step 5: Codemod the per-exercise literals in `import-athletic-program.ts`**

Run:

```bash
sed -i '' -E 's/exercisePhase: "([A-Z]+)",/exercisePhases: ["\1"],/' lib/db/seed/import-athletic-program.ts
```

Verify: `grep -c "exercisePhase:" lib/db/seed/import-athletic-program.ts`
Expected: `0`

- [ ] **Step 6: Update `seed.ts`'s explicit update-branch field**

```ts
// before
        exercisePhase: exercise.exercisePhase,

// after
        exercisePhases: exercise.exercisePhases,
```

- [ ] **Step 7: Update `tag-exercises-ai.ts`**

```ts
// type, before
  exercisePhase: string | null

// after
  exercisePhases: string[]
```

```ts
// prompt line, before
Phase: ${e.exercisePhase ?? 'N/A'}

// after
Phase: ${e.exercisePhases.length ? e.exercisePhases.join(', ') : 'N/A'}
```

```ts
// select, before
      exercisePhase: true,

// after
      exercisePhases: true,
```

- [ ] **Step 8: Typecheck all seed files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "lib/db/seed"`
Expected: no errors.

- [ ] **Step 9: Verify no old field name remains anywhere in `lib/db/seed`**

Run: `grep -rn "exercisePhase:" lib/db/seed/`
Expected: no output.

---

### Task 12: `/api/ai/generate-exercise-metadata` — multi-phase output

**Files:**
- Modify: `app/api/ai/generate-exercise-metadata/route.ts:11-23`

**Interfaces:**
- Produces: `{ success: true, data: { exercisePhases: string[], ... } }` — consumed by Task 7 (already updated) and Task 13.

- [ ] **Step 1: Update the shared metadata schema field**

```ts
// before
  exercisePhase: z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]).describe("Workout phase this exercise best fits"),

// after
  exercisePhases: z.array(z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]))
    .min(1)
    .describe("Workout phase(s) this exercise fits — an exercise can belong to more than one, e.g. mobility and strength. Return every phase that genuinely applies."),
```

This field is shared by both `nameSchema` and `youtubeSchema` (via the `metadataFields` spread), so both flows automatically produce `exercisePhases` — no other change needed in this file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep generate-exercise-metadata`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, POST to `/api/ai/generate-exercise-metadata` with a real YouTube URL (e.g. via the bulk-import page from Task 7, which already calls this route) and confirm the response's `data.exercisePhases` is a non-empty array.

---

### Task 13: `exercise-picker-dialog.tsx` — AI/Manual tabs + multi-select phase

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx` (full create-view rewrite, lines 29-43, 199-203, 242-347, 376-483)

**Interfaces:**
- Consumes: `createOrganizationExerciseAction({ exercisePhases })` (Task 5), `/api/ai/generate-exercise-metadata` response shape `{ exerciseName, description, bodyRegion, difficultyLevel, exercisePhases, videoUrl, imageUrl, videoProvider }` (Task 12).
- Produces: nothing consumed elsewhere — this is the outermost UI layer for exercise creation.

- [ ] **Step 1: Update the `Exercise` interface and phase badge in the list view**

```ts
// before
  exercisePhase?: string | null;

// after
  exercisePhases?: string[];
```

```tsx
// before (list-view phase badge, ~line 199)
                  {ex.exercisePhase && ex.exercisePhase !== "STRENGTHENING" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                      {ex.exercisePhase.charAt(0) + ex.exercisePhase.slice(1).toLowerCase()}
                    </Badge>
                  )}

// after
                  {ex.exercisePhases?.filter((p) => p !== "STRENGTHENING").map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </Badge>
                  ))}
```

- [ ] **Step 2: Update the list-view phase filter predicate to any-of matching**

```ts
// before (in applyFilters)
      if (phase !== "all" && (ex.exercisePhase ?? "STRENGTHENING") !== phase) return false;

// after
      if (phase !== "all") {
        const phases = ex.exercisePhases?.length ? ex.exercisePhases : ["STRENGTHENING"];
        if (!phases.includes(phase)) return false;
      }
```

(The `phase`/`setPhase` state here stays single-select — it's a quick single-category filter over the read-only list, distinct from the multi-select phase *picker* in the create form below. Filtering by "does this exercise include phase X" naturally supports exercises with multiple phases without changing this filter's own UI.)

- [ ] **Step 3: Add the shared `PhaseMultiSelect`, `CreateExerciseFields`, and `emptyFormShape` helpers**

Add this above `ExercisePickerDialog` (these are referenced by the state and JSX added in the next steps):

```tsx
function PhaseMultiSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const options = [
    { value: "WARMUP", label: "Warm-up" },
    { value: "ACTIVATION", label: "Activation" },
    { value: "STRENGTHENING", label: "Strengthening" },
    { value: "MOBILITY", label: "Mobility" },
    { value: "COOLDOWN", label: "Cool-down" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? value.filter((v) => v !== opt.value) : [...value, opt.value])}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function emptyFormShape() {
  return {
    name: "",
    description: "",
    bodyRegion: "",
    difficultyLevel: "",
    exercisePhases: [] as string[],
    videoUrl: "",
    isPublic: true,
  };
}

function CreateExerciseFields({
  form,
  setForm,
}: {
  form: ReturnType<typeof emptyFormShape>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyFormShape>>>;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ex-name" className="text-xs font-semibold">Name *</Label>
        <Input
          id="ex-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Seated Hip Flexor Stretch"
          className="h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Body Region *</Label>
          <Select value={form.bodyRegion} onValueChange={(v) => setForm((f) => ({ ...f, bodyRegion: v ?? f.bodyRegion }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
              <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
              <SelectItem value="CORE">Core</SelectItem>
              <SelectItem value="FULL_BODY">Full Body</SelectItem>
              <SelectItem value="BALANCE">Balance</SelectItem>
              <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Difficulty *</Label>
          <Select value={form.difficultyLevel} onValueChange={(v) => setForm((f) => ({ ...f, difficultyLevel: v ?? f.difficultyLevel }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BEGINNER">Beginner</SelectItem>
              <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
              <SelectItem value="ADVANCED">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Phase(s)</Label>
        <PhaseMultiSelect
          value={form.exercisePhases}
          onChange={(next) => setForm((f) => ({ ...f, exercisePhases: next }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ex-desc" className="text-xs font-semibold">Description</Label>
        <Textarea
          id="ex-desc"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Brief description..."
          className="text-sm resize-none h-16"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Visible to all organizations</p>
          <p className="text-xs text-muted-foreground">When on, this exercise appears in the Universal tab for all organizations</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.isPublic}
          onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            form.isPublic ? "bg-primary" : "bg-input"
          )}
        >
          <span className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
            form.isPublic ? "translate-x-4" : "translate-x-0"
          )} />
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Replace the single shared `createForm` state with two independent per-tab states**

```ts
// before
  const [view, setView] = useState<"list" | "create">("list");
  const [localExercises, setLocalExercises] = useState<Exercise[]>([]);
  const [publicOverrides, setPublicOverrides] = useState<Map<string, boolean>>(new Map());
  const [isPending, startTransition] = useTransition();

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    bodyRegion: "",
    difficultyLevel: "",
    exercisePhase: "",
    videoUrl: "",
    isPublic: true,
  });

// after
  const [view, setView] = useState<"list" | "create">("list");
  const [localExercises, setLocalExercises] = useState<Exercise[]>([]);
  const [publicOverrides, setPublicOverrides] = useState<Map<string, boolean>>(new Map());
  const [isPending, startTransition] = useTransition();
  const [createTab, setCreateTab] = useState<"ai" | "manual">("ai");

  const [aiForm, setAiForm] = useState(emptyFormShape());
  const [aiVideoUrl, setAiVideoUrl] = useState("");
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState(emptyFormShape());
```

- [ ] **Step 5: Add the AI-generate handler and reset logic**

```ts
// add near handleCreate
  async function handleGenerateWithAi() {
    setAiStatus("loading");
    setAiError(null);
    try {
      const res = await fetch("/api/ai/generate-exercise-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: aiVideoUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to generate exercise metadata");
      }
      const d = json.data;
      setAiForm({
        name: d.exerciseName ?? "",
        description: d.description ?? "",
        bodyRegion: d.bodyRegion ?? "",
        difficultyLevel: d.difficultyLevel ?? "",
        exercisePhases: d.exercisePhases ?? [],
        videoUrl: d.videoUrl ?? aiVideoUrl,
        isPublic: true,
      });
      setAiStatus("done");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Failed to generate exercise metadata");
      setAiStatus("error");
    }
  }
```

```ts
// replace handleClose's form reset, before
  function handleClose() {
    setView("list");
    setCreateForm({ name: "", description: "", bodyRegion: "", difficultyLevel: "", exercisePhase: "", videoUrl: "", isPublic: true });
    onOpenChange(false);
  }

// after
  function handleClose() {
    setView("list");
    setCreateTab("ai");
    setAiForm(emptyFormShape());
    setAiVideoUrl("");
    setAiStatus("idle");
    setAiError(null);
    setManualForm(emptyFormShape());
    onOpenChange(false);
  }
```

- [ ] **Step 6: Update `handleCreate` to submit whichever tab is active**

```ts
// before
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name || !createForm.bodyRegion || !createForm.difficultyLevel) {
      toast.error("Name, body region, and difficulty are required");
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationExerciseAction({
        name: createForm.name,
        description: createForm.description || undefined,
        bodyRegion: createForm.bodyRegion,
        difficultyLevel: createForm.difficultyLevel,
        exercisePhase: createForm.exercisePhase || undefined,
        videoUrl: createForm.videoUrl || undefined,
        isPublic: createForm.isPublic,
      });

      if (result.success) {
        const newEx: Exercise = {
          id: result.data.id,
          name: result.data.name,
          bodyRegion: result.data.bodyRegion,
          difficultyLevel: result.data.difficultyLevel,
          exercisePhase: result.data.exercisePhase ?? null,
          videoUrl: result.data.videoUrl ?? null,
          videoProvider: result.data.videoProvider ?? null,
          description: result.data.description ?? null,
          source: "ORGANIZATION",
          organizationId: result.data.organizationId ?? null,
          isPublic: result.data.isPublic,
        };
        setLocalExercises((prev) => [...prev, newEx]);
        toast.success("Exercise created and added");
        onSelect(newEx);
        handleClose();
      } else {
        toast.error(result.error);
      }
    });
  }

// after
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const form = createTab === "ai" ? aiForm : manualForm;
    if (!form.name || !form.bodyRegion || !form.difficultyLevel) {
      toast.error("Name, body region, and difficulty are required");
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationExerciseAction({
        name: form.name,
        description: form.description || undefined,
        bodyRegion: form.bodyRegion,
        difficultyLevel: form.difficultyLevel,
        exercisePhases: form.exercisePhases,
        videoUrl: form.videoUrl || undefined,
        isPublic: form.isPublic,
      });

      if (result.success) {
        const newEx: Exercise = {
          id: result.data.id,
          name: result.data.name,
          bodyRegion: result.data.bodyRegion,
          difficultyLevel: result.data.difficultyLevel,
          exercisePhases: result.data.exercisePhases ?? [],
          videoUrl: result.data.videoUrl ?? null,
          videoProvider: result.data.videoProvider ?? null,
          description: result.data.description ?? null,
          source: "ORGANIZATION",
          organizationId: result.data.organizationId ?? null,
          isPublic: result.data.isPublic,
        };
        setLocalExercises((prev) => [...prev, newEx]);
        toast.success("Exercise created and added");
        onSelect(newEx);
        handleClose();
      } else {
        toast.error(result.error);
      }
    });
  }
```

- [ ] **Step 7: Replace the create-view JSX (lines 376-483) with the tabbed layout**

```tsx
// before (entire block from `{view === "create" ? (` through its matching `) : (`)
          {view === "create" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {/* ... old single-form fields ... */}
              </form>
            </div>
          ) : (

// after
          {view === "create" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "ai" | "manual")}>
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="ai">AI Generate</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>

                <TabsContent value="ai" className="mt-0">
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-video" className="text-xs font-semibold">YouTube Video URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id="ai-video"
                          value={aiVideoUrl}
                          onChange={(e) => setAiVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs shrink-0"
                          disabled={!isYouTubeUrl(aiVideoUrl) || aiStatus === "loading"}
                          onClick={handleGenerateWithAi}
                        >
                          {aiStatus === "loading" ? "Generating..." : "Generate with AI"}
                        </Button>
                      </div>
                      {aiStatus === "error" && (
                        <p className="text-xs text-destructive">{aiError} — check the link and try again.</p>
                      )}
                    </div>

                    {aiStatus === "done" && (
                      <>
                        <CreateExerciseFields form={aiForm} setForm={setAiForm} />
                        <div className="flex gap-2 pt-2">
                          <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                          <Button type="submit" className="flex-1 h-8 text-xs" disabled={isPending}>
                            {isPending ? "Creating..." : "Create & Add to Program"}
                          </Button>
                        </div>
                      </>
                    )}
                  </form>
                </TabsContent>

                <TabsContent value="manual" className="mt-0">
                  <form onSubmit={handleCreate} className="space-y-4">
                    <CreateExerciseFields form={manualForm} setForm={setManualForm} />
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-video" className="text-xs font-semibold">Video URL</Label>
                      <Input
                        id="ex-video"
                        value={manualForm.videoUrl}
                        onChange={(e) => setManualForm((f) => ({ ...f, videoUrl: e.target.value }))}
                        placeholder="YouTube or Vimeo URL"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                      <Button type="submit" className="flex-1 h-8 text-xs" disabled={isPending}>
                        {isPending ? "Creating..." : "Create & Add to Program"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
```

Note the AI tab's `CreateExerciseFields` includes a Video URL field only implicitly via `aiForm.videoUrl` (set from the AI response) — it is not re-rendered as an editable input on the AI tab since the video is what was just generated from; the Manual tab keeps its own explicit Video URL input as before.

Add the missing import at the top of the file:

```ts
// add to the lucide-react import line or as its own import
import { isYouTubeUrl } from "@/lib/utils/video";
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep exercise-picker-dialog`
Expected: no errors.

- [ ] **Step 9: Manual verification**

Run: `npm run dev`, open a program builder, click "Add Exercise" → "Create New", confirm the AI Generate tab is selected by default, paste a real YouTube URL, click "Generate with AI", confirm fields populate with multiple phase pills active where applicable, edit a field, submit, and confirm the exercise is created and added to the program. Then repeat via the Manual tab from a blank form with 2+ phases selected manually. Confirm switching tabs before generating does not leak data between the two forms.

---

### Task 14: Calendar popup scroll fix

**Files:**
- Modify: `components/programs/program-schedule-view.tsx:967, 1807`

**Interfaces:** none — isolated CSS fix.

- [ ] **Step 1: Cap the dialog height**

```tsx
// before
        <DialogContent className="max-w-lg p-0 flex flex-col overflow-hidden gap-0">

// after
        <DialogContent className="max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden gap-0">
```

- [ ] **Step 2: Let the body actually shrink and scroll**

```tsx
// before
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">

// after
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-5">
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open a program's schedule calendar as a trainer, click a workout day whose workout has enough exercise blocks to overflow ~85% of the viewport height, and confirm the popup no longer grows past the viewport — the header/save controls stay visible and the exercise list scrolls internally with the mouse wheel or trackpad.

---

### Task 15: Final verification — no old field name, full build passes

**Files:** none (verification only)

- [ ] **Step 1: Confirm zero remaining references to the old field name**

Run: `grep -rln "exercisePhase\b" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v ".claude/worktrees" | grep -v "exercisePhases"`
Expected: no output. (This grep pattern matches `exercisePhase` as a whole word, so it won't false-positive on `exercisePhases`.)

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build completes successfully with no type or lint errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.
