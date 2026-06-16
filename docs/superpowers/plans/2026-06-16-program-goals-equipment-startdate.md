# Program Goals, Equipment Selector & Start Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Focus Areas" body-region selector with "Program Goals", add an equipment multi-select (DB-sourced) that filters exercises to only those achievable with available gear, and require a start date on the generate form when a client is selected.

**Architecture:** Equipment filtering is added as a pure utility function (`filterByEquipment`) called in `buildExercisePoolForWeek` inside `ai.service.ts`. Program goals replace `focusAreas` in `ClinicalPlanParams` and the AI prompts — the AI still returns per-week `focusAreas` (body regions) in its clinical plan response, which continue to drive the DB query. Start date is a conditional field in the form only, the action already accepts it.

**Tech Stack:** Next.js App Router, Server Actions, Prisma, OpenAI, shadcn/ui (Popover + Command), Vitest

---

## File Map

| File | Change |
|------|--------|
| `lib/ai/utils/exercise-pool.ts` | Add `filterByEquipment` pure function |
| `lib/ai/utils/__tests__/exercise-pool.test.ts` | Add tests for `filterByEquipment` |
| `lib/ai/types/program-generation.ts` | Add `programGoals` and `availableEquipment` to `ClinicalPlanParams` |
| `lib/services/ai.service.ts` | Add fields to `GenerateWorkoutParams`; call `filterByEquipment` in `buildExercisePoolForWeek`; update both AI prompts |
| `actions/program-actions.ts` | Add `getDistinctEquipmentAction` |
| `components/programs/generate-program-form.tsx` | Full UI swap: remove Focus Areas, add Goals + Equipment + Start Date |
| `components/calendar/ai-generate-program-dialog.tsx` | Replace `focusAreas` / `selectedAreas` with `programGoals` / `selectedGoals` |
| `app/admin/global-programs/generate/global-generate-wrapper.tsx` | No code change needed — handler cast is already loose-typed |

---

## Task 1: Add `filterByEquipment` utility (TDD)

**Files:**
- Modify: `lib/ai/utils/exercise-pool.ts`
- Test: `lib/ai/utils/__tests__/exercise-pool.test.ts`

- [ ] **Step 1.1: Write the failing test**

Open `lib/ai/utils/__tests__/exercise-pool.test.ts` and append this block after the existing `buildWeekPoolWhereClause` describe block:

```typescript
import {
  filterByContraindications,
  buildWeekPoolWhereClause,
  filterByEquipment,
} from '../exercise-pool'

// (keep existing tests, then add:)

describe('filterByEquipment', () => {
  const exercises = [
    { id: '1', name: 'Squat', equipmentRequired: [] },
    { id: '2', name: 'Dumbbell Curl', equipmentRequired: ['Dumbbells'] },
    { id: '3', name: 'Band Pull Apart', equipmentRequired: ['Resistance Band'] },
    { id: '4', name: 'Barbell Deadlift', equipmentRequired: ['Barbell'] },
    { id: '5', name: 'Chair Sit-to-Stand', equipmentRequired: ['None'] },
    { id: '6', name: 'DB Shoulder Press', equipmentRequired: ['Dumbbells', 'Chair'] },
  ]

  it('returns all exercises when availableEquipment is empty (no filter)', () => {
    expect(filterByEquipment(exercises, [])).toHaveLength(6)
  })

  it('always includes bodyweight exercises (empty equipmentRequired)', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).toContain('Squat')
  })

  it('always includes exercises with only "None" as equipment', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).toContain('Chair Sit-to-Stand')
  })

  it('includes exercises whose equipment is fully covered by the available set', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).toContain('Dumbbell Curl')
  })

  it('excludes exercises needing equipment not in the available set', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).not.toContain('Band Pull Apart')
    expect(names).not.toContain('Barbell Deadlift')
  })

  it('includes exercises only when ALL required equipment is available', () => {
    // DB Shoulder Press needs both Dumbbells and Chair
    const withChairOnly = filterByEquipment(exercises, ['Chair'])
    expect(withChairOnly.map(e => e.name)).not.toContain('DB Shoulder Press')

    const withBoth = filterByEquipment(exercises, ['Dumbbells', 'Chair'])
    expect(withBoth.map(e => e.name)).toContain('DB Shoulder Press')
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run lib/ai/utils/__tests__/exercise-pool.test.ts
```

Expected: FAIL — `filterByEquipment is not a function` (or similar import error)

- [ ] **Step 1.3: Implement `filterByEquipment` in exercise-pool.ts**

Append to `lib/ai/utils/exercise-pool.ts`:

```typescript
interface ExerciseWithEquipment {
  id: string
  equipmentRequired: string[]
}

export function filterByEquipment<T extends ExerciseWithEquipment>(
  exercises: T[],
  availableEquipment: string[]
): T[] {
  if (availableEquipment.length === 0) return exercises
  return exercises.filter(exercise => {
    const required = exercise.equipmentRequired.filter(
      e => e && e.toLowerCase() !== 'none'
    )
    if (required.length === 0) return true
    return required.every(e => availableEquipment.includes(e))
  })
}
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run lib/ai/utils/__tests__/exercise-pool.test.ts
```

Expected: All tests pass including the new `filterByEquipment` describe block.

---

## Task 2: Update type definitions

**Files:**
- Modify: `lib/ai/types/program-generation.ts`

- [ ] **Step 2.1: Add `programGoals` and `availableEquipment` to `ClinicalPlanParams`**

Replace the entire `ClinicalPlanParams` interface in `lib/ai/types/program-generation.ts`:

```typescript
export interface ClinicalPlanParams {
  patientId?: string | null
  programGoals: string[]
  availableEquipment?: string[]
  durationWeeks: number
  daysPerWeek: number
  difficultyLevel: string
  circuits: {
    name: string
    focusType: string
    exerciseCount: number
    rounds: number
    restBetweenRounds: number | null
  }[]
  preferredWeekdays?: string[]
  subjective?: string
  clinicianPrompt?: string
  additionalNotes?: string
}
```

Note: `focusAreas: string[]` is removed. `programGoals: string[]` replaces it. `availableEquipment?: string[]` is new.

---

## Task 3: Add `getDistinctEquipmentAction` server action

**Files:**
- Modify: `actions/program-actions.ts`

- [ ] **Step 3.1: Add the action at the bottom of `actions/program-actions.ts`**

Append after the last export in the file:

```typescript
export async function getDistinctEquipmentAction(): Promise<{ success: true; data: string[] } | { success: false; error: string }> {
  try {
    const exercises = await prisma.exercise.findMany({
      where: { isActive: true },
      select: { equipmentRequired: true },
    })
    const all = exercises.flatMap(e => e.equipmentRequired)
    const distinct = [...new Set(all)]
      .filter(e => e && e.toLowerCase() !== 'none' && e.trim() !== '')
      .sort()
    return { success: true, data: distinct }
  } catch {
    return { success: false, error: 'Failed to load equipment list' }
  }
}
```

---

## Task 4: Update `ai.service.ts` — equipment filter + prompt changes

**Files:**
- Modify: `lib/services/ai.service.ts`

- [ ] **Step 4.1: Add `filterByEquipment` import**

At the top of `lib/services/ai.service.ts`, after the existing imports, add:

```typescript
import { filterByContraindications, filterByEquipment } from '@/lib/ai/utils/exercise-pool'
```

Also remove the inline `filterByContraindications` logic from `buildExercisePoolForWeek` if it's duplicated — the utility module is the source of truth.

- [ ] **Step 4.2: Add `programGoals` and `availableEquipment` to `GenerateWorkoutParams`**

In the `GenerateWorkoutParams` interface (around line 36), add two new optional fields:

```typescript
interface GenerateWorkoutParams {
  patientId?: string | null;
  programGoals?: string[];         // replaces focusAreas at the form level
  focusAreas?: string[];           // keep for backward compat (brief upload flow still uses it)
  availableEquipment?: string[];   // filters exercise pool to matching gear + bodyweight
  durationMinutes: number;
  daysPerWeek: number;
  // ... rest of existing fields unchanged
```

- [ ] **Step 4.3: Apply equipment filter in `buildExercisePoolForWeek`**

In `buildExercisePoolForWeek` (around line 186), add equipment filtering after the existing contraindication filter. The function signature needs `availableEquipment` passed through. Change it from:

```typescript
async function buildExercisePoolForWeek(
  weekPlan: WeekPlan,
  usedIds: Set<string>,
  patientLimitations: string[]
): Promise<ExercisePoolItem[]>
```

to:

```typescript
async function buildExercisePoolForWeek(
  weekPlan: WeekPlan,
  usedIds: Set<string>,
  patientLimitations: string[],
  availableEquipment?: string[]
): Promise<ExercisePoolItem[]>
```

Then at the end of the function, after the contraindication filter, add the equipment filter:

```typescript
  // Apply patient contraindication filter
  const afterContraFilter = patientLimitations.length === 0
    ? pool
    : filterByContraindications(pool, patientLimitations)

  // Apply equipment filter
  return filterByEquipment(afterContraFilter, availableEquipment ?? [])
```

(Remove the inline contraindication filter code that was there before and replace with the above two steps — `filterByContraindications` is already exported from `exercise-pool.ts`.)

- [ ] **Step 4.4: Pass `availableEquipment` when calling `buildExercisePoolForWeek`**

In `generateWorkoutPlan`, where `buildExercisePoolForWeek` is called inside the `Promise.all` (around line 356):

```typescript
const weekPools: ExercisePoolItem[][] = await Promise.all(
  weekPlans.map(wPlan =>
    buildExercisePoolForWeek(wPlan, globalUsedIds, patientLimitations, params.availableEquipment)
  )
)
```

- [ ] **Step 4.5: Update `generateClinicalPlan` AI prompt to use `programGoals`**

In `generateClinicalPlan` (around line 1120), change the `userPrompt` variable. Replace:

```typescript
- Focus areas: ${params.focusAreas.join(', ')}
```

with:

```typescript
- Program Goals: ${params.programGoals.join(', ')}
${params.availableEquipment?.length ? `- Available Equipment: ${params.availableEquipment.join(', ')}` : '- Available Equipment: Any (no restriction)'}
```

- [ ] **Step 4.6: Update `generateWorkoutPlan` AI prompt to use programGoals**

In `generateWorkoutPlan` (around line 783), the single-week prompt references `params.focusAreas`. Update it to:

```typescript
- Program Goals: ${(params.programGoals ?? params.focusAreas ?? []).join(", ")}
```

This keeps backward compatibility with the brief upload flow that still passes `focusAreas`.

---

## Task 5: Update the main generate form

**Files:**
- Modify: `components/programs/generate-program-form.tsx`

This is the largest change. Replace the entire file with the following:

- [ ] **Step 5.1: Update imports, types, and state**

Replace the import line for constants:
```typescript
// BEFORE
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
// AFTER
import { DIFFICULTY_LEVELS, FITNESS_GOALS } from "@/lib/utils/constants";
```

Add new imports at the top of the file:
```typescript
import { useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { getDistinctEquipmentAction } from "@/actions/program-actions";
```

- [ ] **Step 5.2: Update `GenerateExercisesHandler` type**

Replace the exported type (lines 48–58):

```typescript
export type GenerateExercisesHandler = (params: {
  patientId: string | null;
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
```

- [ ] **Step 5.3: Replace state variables**

Inside `GenerateProgramForm`, remove `selectedAreas` and its setter. Add:

```typescript
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
```

- [ ] **Step 5.4: Add `useEffect` to fetch equipment options**

After the state declarations, add:

```typescript
  useEffect(() => {
    getDistinctEquipmentAction().then(res => {
      if (res.success) setEquipmentOptions(res.data);
    });
  }, []);
```

- [ ] **Step 5.5: Replace `toggleArea` with `toggleGoal` and `toggleEquipment`**

Remove `toggleArea`. Add:

```typescript
  function toggleGoal(goal: string) {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  }

  function toggleEquipment(item: string) {
    setSelectedEquipment(prev =>
      prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item]
    );
  }
```

- [ ] **Step 5.6: Update `handleRequestPlan` validation and body**

Replace the validation block (remove the `selectedAreas` check, add goals + startDate):

```typescript
  async function handleRequestPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedGoals.length === 0) {
      toast.error('Please select at least one program goal');
      return;
    }
    if (selectedPatient && !startDate) {
      toast.error('Please select a start date for this client');
      return;
    }
    if (selectedWeekdays.length === 0) {
      toast.error('Please select at least one training day');
      return;
    }
    if (circuits.some(c => c.exerciseCount < 1)) {
      toast.error('Each circuit must have at least 1 exercise');
      return;
    }

    setGenerateState('PLANNING');
    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch('/api/ai/generate-clinical-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient || null,
          programGoals: selectedGoals,
          availableEquipment: selectedEquipment,
          durationWeeks,
          daysPerWeek,
          difficultyLevel: difficulty,
          circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
            name, focusType, exerciseCount, rounds, restBetweenRounds,
          })),
          preferredWeekdays: selectedWeekdays,
          subjective: (formData.get('subjective') as string) || undefined,
          clinicianPrompt: (formData.get('clinicianPrompt') as string) || undefined,
          additionalNotes: (formData.get('notes') as string) || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate clinical plan');
      const json = await res.json();
      setClinicalPlan(json.data);
      setGenerateState('REVIEWING');
    } catch {
      toast.error('Failed to generate clinical plan. Please try again.');
      setGenerateState('CONFIGURE');
    }
  }
```

- [ ] **Step 5.7: Update `handleGenerateExercises` params**

Replace `focusAreas: selectedAreas` with `programGoals: selectedGoals` in the `genParams` object, and add `availableEquipment` and `startDate`:

```typescript
  async function handleGenerateExercises(approvedPlan: ClinicalPlan) {
    setGenerateState('GENERATING');

    const genParams = {
      patientId: selectedPatient || null,
      programGoals: selectedGoals,
      availableEquipment: selectedEquipment,
      startDate: selectedPatient ? startDate : null,
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

    if (onGenerateExercises) {
      const result = await onGenerateExercises(genParams);
      if (result.success) {
        toast.success('Program generated successfully!');
        router.push(redirectTo ?? (result.data ? `/programs/${result.data}` : '/programs'));
      } else {
        toast.error(result.error);
        setGenerateState('CONFIGURE');
      }
      return;
    }

    const result = await generateProgramAction({
      ...genParams,
      weekPlan: approvedPlan.weeklyPlan,
    });

    if (result.success) {
      toast.success('Program generated successfully!');
      router.push(`/programs/${result.data}`);
    } else {
      toast.error(result.error);
      setGenerateState('CONFIGURE');
    }
  }
```

- [ ] **Step 5.8: Replace "Focus Areas" JSX section with "Program Goals"**

In the JSX, find the `{/* Focus Areas */}` section and replace it entirely with:

```tsx
              {/* Program Goals */}
              <div className="space-y-2">
                <Label>Program Goals *</Label>
                <div className="flex flex-wrap gap-2">
                  {FITNESS_GOALS.map((goal) => (
                    <Button
                      key={goal}
                      type="button"
                      variant={selectedGoals.includes(goal) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleGoal(goal)}
                    >
                      {goal}
                    </Button>
                  ))}
                </div>
              </div>
```

- [ ] **Step 5.9: Add Equipment selector section after Program Goals**

Insert immediately after the Program Goals section (before Difficulty Level):

```tsx
              {/* Equipment */}
              <div className="space-y-2">
                <Label>Available Equipment</Label>
                <p className="text-xs text-muted-foreground">
                  Only exercises using these items (plus bodyweight) will be selected. Leave empty to allow any equipment.
                </p>
                <Popover open={equipmentOpen} onOpenChange={setEquipmentOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {selectedEquipment.length === 0
                        ? "Select equipment..."
                        : `${selectedEquipment.length} item${selectedEquipment.length === 1 ? "" : "s"} selected`}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search equipment..." />
                      <CommandEmpty>No equipment found.</CommandEmpty>
                      <CommandGroup>
                        {equipmentOptions.map(item => (
                          <CommandItem
                            key={item}
                            value={item}
                            onSelect={() => {
                              toggleEquipment(item);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedEquipment.includes(item) ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            {item}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedEquipment.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedEquipment.map(item => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => toggleEquipment(item)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
```

- [ ] **Step 5.10: Add conditional Start Date section**

Insert after the patient profile inline summary block (after the closing `</>` of the patient section, before the Session Duration grid):

```tsx
              {/* Start Date — shown only when a client is selected */}
              {selectedPatient && (
                <div className="space-y-2">
                  <Label htmlFor="startDate">
                    Program Start Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
              )}
```

---

## Task 6: Update `ai-generate-program-dialog.tsx`

**Files:**
- Modify: `components/calendar/ai-generate-program-dialog.tsx`

This dialog is used when generating a program directly from the calendar for a specific client. It already has a start date (`initialDate` prop). Update it to use `programGoals` instead of `focusAreas`.

- [ ] **Step 6.1: Update the import**

Replace:
```typescript
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
```
with:
```typescript
import { DIFFICULTY_LEVELS, FITNESS_GOALS } from "@/lib/utils/constants";
```

- [ ] **Step 6.2: Replace state variable**

Replace:
```typescript
const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
```
with:
```typescript
const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
```

- [ ] **Step 6.3: Replace `toggleArea` function**

Replace:
```typescript
function toggleArea(area: string) {
  setSelectedAreas((prev) =>
    prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
  );
}
```
with:
```typescript
function toggleGoal(goal: string) {
  setSelectedGoals((prev) =>
    prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
  );
}
```

- [ ] **Step 6.4: Update validation in the submit handler**

Replace:
```typescript
if (selectedAreas.length === 0) {
  toast.error("Please select at least one focus area");
  return;
}
```
with:
```typescript
if (selectedGoals.length === 0) {
  toast.error("Please select at least one program goal");
  return;
}
```

- [ ] **Step 6.5: Update the `generateProgramAction` call**

Replace:
```typescript
focusAreas: selectedAreas,
```
with:
```typescript
programGoals: selectedGoals,
```

- [ ] **Step 6.6: Replace the "Focus Areas" JSX section**

Find the `{/* Focus Areas */}` block in the JSX (around line 202) and replace it entirely:

```tsx
            {/* Program Goals */}
            <div className="space-y-2">
              <Label>Program Goals *</Label>
              <div className="flex flex-wrap gap-2">
                {FITNESS_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={selectedGoals.includes(goal) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleGoal(goal)}
                  >
                    {goal}
                  </Button>
                ))}
              </div>
            </div>
```

---

## Task 7: Verify TypeScript compiles

- [ ] **Step 7.1: Run the TypeScript compiler**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -40
```

Expected: Zero errors. Common issues to fix if they appear:
- `Property 'focusAreas' does not exist` — replace with `programGoals` at that callsite
- `Property 'programGoals' does not exist` — the `generateProgramAction` uses `[key: string]: unknown` so it already accepts any key; no change needed there
- If `ClinicalPlanParams` errors appear, confirm `programGoals` replaces `focusAreas` in all call sites that construct a `ClinicalPlanParams` object

- [ ] **Step 7.2: Run all tests**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run
```

Expected: All tests pass. The exercise-pool tests are the only test file affected by these changes.

---

## Self-Review Checklist

- [x] `filterByEquipment` covered by Task 1 tests
- [x] `programGoals` replaces `focusAreas` in: `ClinicalPlanParams`, `generateClinicalPlan` prompt, `generateWorkoutPlan` prompt, `generate-program-form.tsx`, `ai-generate-program-dialog.tsx`
- [x] `focusAreas` kept as optional fallback in `GenerateWorkoutParams` for the brief-upload flow (`actions/program-actions.ts:389`)
- [x] Equipment filter applied in `buildExercisePoolForWeek` (affects both the multi-week clinical plan flow and any direct workout generation)
- [x] Start date: required+visible when client selected, hidden when no client, passed as `startDate` in `genParams` (action already accepts it via spread)
- [x] `global-generate-wrapper.tsx` casts to `Parameters<typeof generateGlobalProgramAction>[0]` which accepts loose shape — no change needed
- [x] `getDistinctEquipmentAction` filters out `"None"` and empty strings so they don't appear in the picker
