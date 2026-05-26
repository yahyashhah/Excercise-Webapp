# AI Program Generation — Clinical PT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, repetitive AI program generator with a two-step system that produces true multi-week progressive programs tailored to each patient's clinical diagnosis and rehab stage.

**Architecture:** Step 1 (fast GPT-4o-mini call) analyzes the patient and produces a week-by-week clinical phase plan. Step 2 (GPT-4o call) uses that plan to query condition-tagged exercises per week and populate all sessions in one combined call. The DB already supports multi-week programs via `weekIndex` on `Workout`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma (MongoDB), OpenAI SDK (`openai` npm package), Zod, shadcn/ui, Vitest (added in Task 1)

**Spec:** `docs/superpowers/specs/2026-05-27-ai-program-generation-design.md`

---

## File Map

**Create:**
- `lib/ai/types/program-generation.ts` — Shared types: `WeekPlan`, `ClinicalPlan`, `ClinicalPlanParams`
- `lib/ai/utils/exercise-pool.ts` — Pure helpers: `filterByContraindications`, `buildWeekPoolQuery`
- `lib/ai/utils/__tests__/exercise-pool.test.ts` — Unit tests for pool helpers
- `app/api/ai/generate-clinical-plan/route.ts` — Step 1 API endpoint (calls `generateClinicalPlan`)
- `components/programs/plan-review-step.tsx` — Week plan review UI between Step 1 and Step 2
- `lib/db/seed/tag-exercises-ai.ts` — One-time bulk exercise tagging script

**Modify:**
- `prisma/schema.prisma` — Add `indicationTags String[]` and `rehabStage String?` to `Exercise`
- `lib/services/ai.service.ts` — Add `generateClinicalPlan()`, refactor `generateWorkoutPlan()` to accept `weekPlan[]`
- `actions/program-actions.ts` — Accept `weekPlan` + `durationWeeks` in `generateProgramAction`
- `components/programs/generate-program-form.tsx` — Add duration field, patient profile summary, new CONFIGURE→PLANNING→REVIEWING→GENERATING state machine

---

## Task 1: Test Setup + Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest @vitejs/plugin-react
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts` at the project root:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add `indicationTags` and `rehabStage` to the Exercise model in `prisma/schema.prisma`**

Find the `model Exercise {` block. After the `cuesThumbnail String?` line, add:

```prisma
  indicationTags     String[]
  rehabStage         String?
```

The two new fields go between `cuesThumbnail` and `isActive`. The block should look like:

```prisma
  cuesThumbnail      String?
  indicationTags     String[]
  rehabStage         String?
  isActive           Boolean         @default(true)
```

- [ ] **Step 5: Regenerate Prisma client and push schema**

```bash
npx prisma generate && npx prisma db push
```

Expected output ends with: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma package.json vitest.config.ts package-lock.json
git commit -m "feat: add indicationTags and rehabStage to Exercise, add vitest"
```

---

## Task 2: Shared Types + Pure Exercise Pool Helpers

**Files:**
- Create: `lib/ai/types/program-generation.ts`
- Create: `lib/ai/utils/exercise-pool.ts`
- Create: `lib/ai/utils/__tests__/exercise-pool.test.ts`

- [ ] **Step 1: Create the types directory and shared types file**

```bash
mkdir -p lib/ai/types lib/ai/utils/\_\_tests\_\_
```

Create `lib/ai/types/program-generation.ts`:

```typescript
export interface WeekPlan {
  week: number
  title: string
  rehabStage: 'EARLY_REHAB' | 'MID_REHAB' | 'LATE_REHAB' | 'MAINTENANCE'
  focusAreas: string[]
  difficultyLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  clinicalGuidance: string
  contraindicationsThisWeek: string[]
  progressionGoal: string
  derivedIndicationTags: string[]
}

export interface ClinicalPlan {
  clinicalAssessment: string
  weeklyPlan: WeekPlan[]
}

export interface ClinicalPlanParams {
  patientId?: string | null
  focusAreas: string[]
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

- [ ] **Step 2: Write the failing tests**

Create `lib/ai/utils/__tests__/exercise-pool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  filterByContraindications,
  buildWeekPoolWhereClause,
} from '../exercise-pool'

describe('filterByContraindications', () => {
  const exercises = [
    { id: '1', name: 'Squat', contraindications: ['knee flexion >90°', 'impact'] },
    { id: '2', name: 'Quad Set', contraindications: [] },
    { id: '3', name: 'Leg Press', contraindications: ['post-surgical knee flexion'] },
  ]

  it('returns all exercises when patient has no limitations', () => {
    const result = filterByContraindications(exercises, [])
    expect(result).toHaveLength(3)
  })

  it('excludes exercises whose contraindications overlap with patient limitations', () => {
    const result = filterByContraindications(exercises, ['knee flexion'])
    const names = result.map(e => e.name)
    expect(names).toContain('Quad Set')
    expect(names).not.toContain('Squat')
    expect(names).not.toContain('Leg Press')
  })

  it('is case-insensitive', () => {
    const result = filterByContraindications(exercises, ['IMPACT'])
    expect(result.map(e => e.name)).not.toContain('Squat')
  })
})

describe('buildWeekPoolWhereClause', () => {
  it('includes rehabStage and indicationTags when provided', () => {
    const weekPlan = {
      rehabStage: 'EARLY_REHAB' as const,
      focusAreas: ['LOWER_BODY'],
      derivedIndicationTags: ['ACL', 'knee'],
    }
    const usedIds = new Set(['abc', 'def'])
    const clause = buildWeekPoolWhereClause(weekPlan, usedIds)

    expect(clause.rehabStage).toBe('EARLY_REHAB')
    expect(clause.bodyRegion).toEqual({ in: ['LOWER_BODY'] })
    expect(clause.indicationTags).toEqual({ hasSome: ['ACL', 'knee'] })
    expect(clause.id).toEqual({ notIn: ['abc', 'def'] })
    expect(clause.isActive).toBe(true)
  })

  it('omits indicationTags filter when derivedIndicationTags is empty', () => {
    const weekPlan = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['UPPER_BODY'],
      derivedIndicationTags: [],
    }
    const clause = buildWeekPoolWhereClause(weekPlan, new Set())
    expect(clause.indicationTags).toBeUndefined()
  })

  it('omits used IDs from the query when set is empty', () => {
    const weekPlan = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['CORE'],
      derivedIndicationTags: ['low-back-pain'],
    }
    const clause = buildWeekPoolWhereClause(weekPlan, new Set())
    expect(clause.id).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run failing tests**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../exercise-pool'`

- [ ] **Step 4: Implement the pure helpers**

Create `lib/ai/utils/exercise-pool.ts`:

```typescript
import type { WeekPlan } from '../types/program-generation'

interface ExerciseWithContraindications {
  id: string
  name: string
  contraindications: string[]
}

export function filterByContraindications<T extends ExerciseWithContraindications>(
  exercises: T[],
  patientLimitations: string[]
): T[] {
  if (patientLimitations.length === 0) return exercises
  return exercises.filter(exercise => {
    const contraLower = exercise.contraindications.map(c => c.toLowerCase())
    return !patientLimitations.some(limitation =>
      contraLower.some(
        contra => contra.includes(limitation.toLowerCase()) || limitation.toLowerCase().includes(contra)
      )
    )
  })
}

interface WeekPoolInput {
  rehabStage: string
  focusAreas: string[]
  derivedIndicationTags: string[]
}

export function buildWeekPoolWhereClause(
  weekPlan: WeekPoolInput,
  usedIds: Set<string>
): Record<string, unknown> {
  const clause: Record<string, unknown> = {
    isActive: true,
    rehabStage: weekPlan.rehabStage,
    bodyRegion: { in: weekPlan.focusAreas },
  }

  if (weekPlan.derivedIndicationTags.length > 0) {
    clause.indicationTags = { hasSome: weekPlan.derivedIndicationTags }
  }

  if (usedIds.size > 0) {
    clause.id = { notIn: [...usedIds] }
  }

  return clause
}
```

- [ ] **Step 5: Run tests and confirm passing**

```bash
npm test
```

Expected: PASS — all 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/types/program-generation.ts lib/ai/utils/exercise-pool.ts lib/ai/utils/__tests__/exercise-pool.test.ts
git commit -m "feat: add shared AI types and exercise pool pure helpers with tests"
```

---

## Task 3: `generateClinicalPlan()` Function + API Route

**Files:**
- Modify: `lib/services/ai.service.ts` (add `generateClinicalPlan` at the bottom)
- Create: `app/api/ai/generate-clinical-plan/route.ts`

- [ ] **Step 1: Add imports and the `generateClinicalPlan` function to `lib/services/ai.service.ts`**

At the top of `lib/services/ai.service.ts`, after the existing imports, add:

```typescript
import type { ClinicalPlan, ClinicalPlanParams, WeekPlan } from '@/lib/ai/types/program-generation'
```

At the very bottom of `lib/services/ai.service.ts`, append:

```typescript
export async function generateClinicalPlan(
  params: ClinicalPlanParams
): Promise<ClinicalPlan> {
  const patient = params.patientId
    ? await prisma.user.findUnique({
        where: { id: params.patientId },
        include: { patientProfile: true },
      })
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = patient?.patientProfile as any ?? null

  const patientContext = patient
    ? `Patient: ${patient.firstName} ${patient.lastName}
Primary Diagnosis: ${profile?.primaryDiagnosis ?? 'Not specified'}
Secondary Conditions: ${profile?.secondaryDiagnoses?.length ? profile.secondaryDiagnoses.join(', ') : 'None'}
Pain Score: ${profile?.painScore != null ? `${profile.painScore}/10` : 'Not assessed'}
Activity Level: ${profile?.activityLevel ?? 'Not assessed'}
Physical Limitations: ${profile?.limitations ?? 'None documented'}
Comorbidities: ${profile?.comorbidities ?? 'None'}
Functional Challenges: ${profile?.functionalChallenges ?? 'None'}
Surgery/Injury History: ${profile?.surgeryHistory ?? 'None documented'}
Time Since Injury/Surgery: ${profile?.injuryDate ? Math.round((Date.now() - new Date(profile.injuryDate).getTime()) / (1000 * 60 * 60 * 24 * 7)) + ' weeks ago' : 'Not specified'}
Goals: ${profile?.fitnessGoals?.length ? profile.fitnessGoals.join(', ') : 'General fitness'}`
    : 'No specific patient — create a general program.'

  const circuitSummary = params.circuits
    .map(c => `  - ${c.name} (${c.focusType}): ${c.exerciseCount} exercises, ${c.rounds} sets`)
    .join('\n')

  const systemPrompt = `You are an expert Doctor of Physical Therapy (DPT). Analyze the patient profile and program parameters, then produce a week-by-week clinical rehabilitation plan as JSON.

Think step-by-step:
1. Identify the patient's current rehabilitation phase based on diagnosis, time post-injury, pain score, and limitations.
2. Plan each week as a clinically distinct, progressive stage toward the patient's goals.
3. Assign an appropriate rehabStage to each week: EARLY_REHAB (pain control, ROM, gentle activation), MID_REHAB (progressive strengthening, neuromuscular control), LATE_REHAB (functional loading, activity-specific), or MAINTENANCE (general fitness, prevention).
4. For each week, specify what is contraindicated THIS specific week — this may differ from the global contraindications.
5. Derive indication tags (lowercase, hyphenated clinical keywords) that should be used to find appropriate exercises for each week.

Respond with valid JSON only. No markdown, no explanation.`

  const userPrompt = `${patientContext}

Program Parameters:
- Duration: ${params.durationWeeks} weeks
- Days per week: ${params.daysPerWeek}
- Focus areas: ${params.focusAreas.join(', ')}
- Difficulty level: ${params.difficultyLevel}
- Circuits per session:
${circuitSummary}
${params.subjective ? `\nClinician Subjective:\n${params.subjective}` : ''}
${params.clinicianPrompt ? `\nClinician Instructions:\n${params.clinicianPrompt}` : ''}
${params.additionalNotes ? `\nAdditional Notes:\n${params.additionalNotes}` : ''}

Produce this exact JSON structure:
{
  "clinicalAssessment": "2-3 sentence clinical assessment of this patient's current state and appropriate rehabilitation approach",
  "weeklyPlan": [
    {
      "week": 1,
      "title": "Short descriptive week title",
      "rehabStage": "EARLY_REHAB",
      "focusAreas": ["LOWER_BODY"],
      "difficultyLevel": "BEGINNER",
      "clinicalGuidance": "What to prioritize this week, specific technique or loading guidance",
      "contraindicationsThisWeek": ["loaded knee flexion >60°"],
      "progressionGoal": "What should the patient achieve or improve by end of this week",
      "derivedIndicationTags": ["ACL", "knee", "quad-strengthening", "VMO"]
    }
  ]
}

Generate exactly ${params.durationWeeks} entries in weeklyPlan (weeks 1 through ${params.durationWeeks}).`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const raw = response.choices[0].message.content ?? '{}'
  const parsed = JSON.parse(raw) as ClinicalPlan

  if (!parsed.weeklyPlan || parsed.weeklyPlan.length === 0) {
    throw new Error('Clinical plan generation returned no weekly plan. Please try again.')
  }

  return parsed
}
```

- [ ] **Step 2: Create the Step 1 API route**

Create `app/api/ai/generate-clinical-plan/route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateClinicalPlan } from '@/lib/services/ai.service'

export const maxDuration = 30

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!dbUser || dbUser.role !== 'CLINICIAN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const plan = await generateClinicalPlan(body)
    return NextResponse.json({ success: true, data: plan })
  } catch (error) {
    console.error('Clinical plan generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate clinical plan' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Manual test — call Step 1 via curl with a sample patient**

Start the dev server:

```bash
npm run dev
```

In a separate terminal, sign in and get a session cookie, then:

```bash
curl -X POST http://localhost:3000/api/ai/generate-clinical-plan \
  -H "Content-Type: application/json" \
  -b "<your-session-cookie>" \
  -d '{
    "focusAreas": ["LOWER_BODY"],
    "durationWeeks": 4,
    "daysPerWeek": 3,
    "difficultyLevel": "BEGINNER",
    "circuits": [
      {"name":"Warm Up","focusType":"WARMUP","exerciseCount":3,"rounds":1,"restBetweenRounds":null},
      {"name":"Main","focusType":"LOWER_BODY","exerciseCount":5,"rounds":3,"restBetweenRounds":60}
    ],
    "subjective": "Post-ACL reconstruction, 6 weeks post-op, quad weakness, limited flexion to 80 degrees"
  }'
```

Expected: JSON response with `clinicalAssessment` string and `weeklyPlan` array of 4 objects with `week`, `title`, `rehabStage`, `derivedIndicationTags`, etc.

- [ ] **Step 4: Commit**

```bash
git add lib/services/ai.service.ts app/api/ai/generate-clinical-plan/route.ts
git commit -m "feat: add generateClinicalPlan (Step 1) and /api/ai/generate-clinical-plan route"
```

---

## Task 4: Refactor `generateWorkoutPlan()` for Multi-Week + Indication Filtering

**Files:**
- Modify: `lib/services/ai.service.ts`

This task refactors `generateWorkoutPlan()` to accept an optional `weekPlan: WeekPlan[]`. When provided, it queries a per-week exercise pool filtered by rehab stage and indication tags, then generates all weeks in one combined GPT-4o call. The existing `sessionBlueprint` path and the existing single-step path (no `weekPlan`) are preserved unchanged.

- [ ] **Step 1: Update `GenerateWorkoutParams` interface to accept `weekPlan` and `durationWeeks`**

In `lib/services/ai.service.ts`, find the `interface GenerateWorkoutParams` block (around line 17). Add two new optional fields at the end of the interface:

```typescript
  weekPlan?: WeekPlan[]
  durationWeeks?: number
```

The interface block should end with:

```typescript
  sessionBlueprint?: { ... }[]
  weekPlan?: WeekPlan[]
  durationWeeks?: number
}
```

- [ ] **Step 2: Add `buildExercisePoolForWeek` helper inside `ai.service.ts`**

After the existing `normalizeExerciseName` function (around line 138), add this new helper function:

```typescript
async function buildExercisePoolForWeek(
  weekPlan: WeekPlan,
  usedIds: Set<string>,
  patientLimitations: string[]
): Promise<typeof allExercisesShape> {
  const baseSelect = {
    id: true, name: true, bodyRegion: true, difficultyLevel: true,
    equipmentRequired: true, contraindications: true, description: true,
    musclesTargeted: true, exercisePhase: true, commonMistakes: true,
    defaultSets: true, defaultReps: true, defaultHoldSeconds: true,
    cuesThumbnail: true, videoUrl: true,
  }

  // Primary query: indication tags + rehab stage filtered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool = (await (prisma.exercise.findMany as any)({
    where: {
      isActive: true,
      rehabStage: weekPlan.rehabStage,
      bodyRegion: { in: weekPlan.focusAreas },
      ...(weekPlan.derivedIndicationTags.length > 0
        ? { indicationTags: { hasSome: weekPlan.derivedIndicationTags } }
        : {}),
      ...(usedIds.size > 0 ? { id: { notIn: [...usedIds] } } : {}),
    },
    select: baseSelect,
    take: 60,
  })) as typeof allExercisesShape

  // Fallback: if primary pool too small, use body-region-only filter
  if (pool.length < 20) {
    pool = (await (prisma.exercise.findMany as any)({
      where: {
        isActive: true,
        bodyRegion: { in: weekPlan.focusAreas },
        ...(usedIds.size > 0 ? { id: { notIn: [...usedIds] } } : {}),
      },
      select: baseSelect,
      take: 60,
    })) as typeof allExercisesShape
  }

  // Apply patient contraindication filter
  if (patientLimitations.length === 0) return pool
  return pool.filter(exercise => {
    const contraLower = exercise.contraindications.map((c: string) => c.toLowerCase())
    return !patientLimitations.some((limitation: string) =>
      contraLower.some(
        (contra: string) =>
          contra.includes(limitation.toLowerCase()) ||
          limitation.toLowerCase().includes(contra)
      )
    )
  })
}

// Placeholder type for the exercise shape returned by findMany
type typeof allExercisesShape = Array<{
  id: string; name: string; bodyRegion: string; difficultyLevel: string;
  equipmentRequired: string[]; contraindications: string[]; description: string | null;
  musclesTargeted: string[]; exercisePhase: string | null; commonMistakes: string | null;
  defaultSets: number | null; defaultReps: number | null; defaultHoldSeconds: number | null;
  cuesThumbnail: string | null; videoUrl: string | null;
}>
```

**Important:** The `allExercisesShape` type already exists inline in `generateWorkoutPlan`. Replace the placeholder type alias with a proper named type at the top of the file. Add this after the imports:

```typescript
type ExercisePoolItem = {
  id: string; name: string; bodyRegion: string; difficultyLevel: string;
  equipmentRequired: string[]; contraindications: string[]; description: string | null;
  musclesTargeted: string[]; exercisePhase: string | null; commonMistakes: string | null;
  defaultSets: number | null; defaultReps: number | null; defaultHoldSeconds: number | null;
  cuesThumbnail: string | null; videoUrl: string | null;
}
```

And update `buildExercisePoolForWeek` to return `Promise<ExercisePoolItem[]>`.

- [ ] **Step 3: Add the multi-week generation path to `generateWorkoutPlan()`**

In `generateWorkoutPlan()`, find the block that begins with `if (params.sessionBlueprint?.length) {` (around line 332). Before that block, add the new multi-week path:

```typescript
  // === NEW: Two-step multi-week generation path ===
  if (params.weekPlan && params.weekPlan.length > 0) {
    const weekPlans = params.weekPlan
    const globalUsedIds = new Set<string>()
    const patientLimitations = profile?.limitations
      ? profile.limitations.toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean)
      : []

    // Build per-week exercise pools (parallel DB queries)
    const weekPools: ExercisePoolItem[][] = await Promise.all(
      weekPlans.map(wPlan => buildExercisePoolForWeek(wPlan, globalUsedIds, patientLimitations))
    )

    // Build the combined multi-week prompt
    const weekSections = weekPlans.map((wPlan, idx) => {
      const pool = weekPools[idx]
      const poolStr = pool
        .map(
          e =>
            `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhase ?? 'STRENGTHENING'} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(', ')} | Equipment: ${e.equipmentRequired.join(', ') || 'None'} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + 's hold' : '10'}`
        )
        .join('\n')

      return `=== WEEK ${wPlan.week}: ${wPlan.title} (${wPlan.rehabStage}) ===
Clinical Guidance: ${wPlan.clinicalGuidance}
Progression Goal: ${wPlan.progressionGoal}
Contraindicated This Week: ${wPlan.contraindicationsThisWeek.join(', ') || 'None'}
Available Exercises for Week ${wPlan.week} (use ONLY these IDs for this week):
${poolStr || 'No tagged exercises found — use general bodyweight exercises appropriate for this rehab stage.'}`
    }).join('\n\n')

    const hasCircuits = params.circuits && params.circuits.length > 0
    const circuits = params.circuits ?? []
    const totalExercisesPerSession = hasCircuits
      ? circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
      : (params.exercisesPerSession ?? 6)

    const circuitStructureStr = hasCircuits
      ? circuits
          .map((c, i) => `  Circuit ${i} "${c.name}" (${c.focusType}): EXACTLY ${c.exerciseCount} exercises per session/day`)
          .join('\n')
      : null

    const weekdayToIndex: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
      friday: 4, saturday: 5, sunday: 6,
    }
    const preferredDayIndices = (params.preferredWeekdays ?? [])
      .map(d => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d))
    const effectiveDayIndices = preferredDayIndices.length > 0
      ? preferredDayIndices
      : Array.from({ length: Math.max(1, Math.min(params.daysPerWeek, 7)) }, (_, i) => i)
    const uniqueDayIndices = Array.from(new Set(effectiveDayIndices)).sort((a, b) => a - b)

    const totalWeeks = weekPlans.length
    const totalSessions = totalWeeks * params.daysPerWeek
    const totalExercisesAll = totalSessions * totalExercisesPerSession

    const multiWeekSystemPrompt = `You are an expert DPT and strength & conditioning coach. Generate a complete multi-week rehabilitation program following the provided week-by-week clinical plan. Each week is clinically distinct — use ONLY the exercises provided for that week. Never use the same exerciseId in more than one week.

RULES:
1. Use ONLY exercise IDs from each week's provided pool. Never invent IDs.
2. Each week must use COMPLETELY DIFFERENT exercise IDs from all other weeks.
3. Every training day must have EXACTLY ${totalExercisesPerSession} exercises.
4. Follow the clinical guidance and contraindications for each week strictly.
5. Write 1-2 specific technique cues per exercise relevant to that week's clinical goals.
6. Distribute sessions using ONLY these weekday indexes: ${uniqueDayIndices.join(', ')}.
7. Session names must reflect the actual week focus — not generic labels.
${hasCircuits ? `8. Each exercise MUST include circuitIndex (0-based). Circuit structure per session:\n${circuitStructureStr}` : ''}

Respond with valid JSON only.`

    const multiWeekUserPrompt = `${clientContext}

Program: ${totalWeeks} weeks, ${params.daysPerWeek} days/week, ~${params.durationMinutes} min/session
Total exercises in output: EXACTLY ${totalExercisesAll} (${totalExercisesPerSession} per session × ${params.daysPerWeek} days × ${totalWeeks} weeks)
${params.subjective ? `Clinician Subjective: ${params.subjective}` : ''}
${params.clinicianPrompt ? `Clinician Instructions: ${params.clinicianPrompt}` : ''}

${weekSections}

Respond with this exact JSON:
{
  "title": "Program title",
  "description": "2-3 sentence clinical program description",
  "sessions": [
    { "dayOfWeek": 0, "weekIndex": 0, "name": "Clinical session name" }
  ],
  "exercises": [
    {
      "exerciseId": "id from that week's pool",
      "exerciseName": "exercise name",
      "phase": "ACTIVATION",
      ${hasCircuits ? '"circuitIndex": 0,' : ''}
      "sets": 3,
      "reps": 15,
      "durationSeconds": null,
      "restSeconds": 30,
      "dayOfWeek": 0,
      "weekIndex": 0,
      "orderIndex": 0,
      "notes": "1-2 specific technique cues for this week's clinical goal"
    }
  ]
}`

    const multiWeekResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 16000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: multiWeekSystemPrompt },
        { role: 'user', content: multiWeekUserPrompt },
      ],
    })

    const rawParsed = JSON.parse(multiWeekResponse.choices[0].message.content ?? '{}') as GeneratedPlan

    // Build a per-week ID set for validation
    const allPoolIds = new Set(weekPools.flatMap(pool => pool.map(e => e.id)))
    const validExercises = rawParsed.exercises.filter(e => allPoolIds.has(e.exerciseId))

    if (validExercises.length === 0) {
      throw new Error('AI generated no valid exercises for the multi-week program. Please try again.')
    }

    // Warn about cross-week duplicates but allow
    const usedAcrossWeeks = new Map<string, number>()
    for (const ex of validExercises) {
      const week = ex.weekIndex ?? 0
      if (usedAcrossWeeks.has(ex.exerciseId)) {
        console.warn(`[AI] Exercise ${ex.exerciseId} used in week ${usedAcrossWeeks.get(ex.exerciseId)} AND week ${week}`)
      } else {
        usedAcrossWeeks.set(ex.exerciseId, week)
      }
    }

    // Sort by week, then day, then phase, then orderIndex
    const sorted = [...validExercises].sort((a, b) => {
      const weekDiff = (a.weekIndex ?? 0) - (b.weekIndex ?? 0)
      if (weekDiff !== 0) return weekDiff
      const dayDiff = (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0)
      if (dayDiff !== 0) return dayDiff
      const phaseA = PHASE_ORDER[a.phase] ?? 2
      const phaseB = PHASE_ORDER[b.phase] ?? 2
      if (phaseA !== phaseB) return phaseA - phaseB
      return a.orderIndex - b.orderIndex
    })

    // Reassign orderIndex per day
    let lastKey = ''
    let dayOrder = 0
    for (const ex of sorted) {
      const key = `${ex.weekIndex ?? 0}_${ex.dayOfWeek ?? 0}`
      if (key !== lastKey) { lastKey = key; dayOrder = 0 }
      ex.orderIndex = dayOrder++
    }

    return { ...rawParsed, exercises: sorted }
  }
  // === END new multi-week path ===
```

**Note:** `clientContext` is already defined later in the existing function. Move its construction before this new block, or duplicate the construction here. The simplest approach: extract `clientContext` into a variable at the top of `generateWorkoutPlan()` before the `if (params.sessionBlueprint?.length)` check. The existing `clientContext` template literal (lines ~477-492 in the original file) should be hoisted to run before both the `sessionBlueprint` check and the new `weekPlan` check.

- [ ] **Step 4: Update `GeneratedPlan` interface to include `weekIndex` on exercises**

Find `interface GeneratedPlan` in `ai.service.ts`. Ensure `exercises` items have `weekIndex?: number`. The existing `GeneratedExercise` interface already has `weekIndex?: number` — confirm it's there. If not, add it:

```typescript
interface GeneratedExercise {
  exerciseId: string
  exerciseName: string
  phase: string
  circuitIndex?: number
  sets: number
  reps?: number
  durationSeconds?: number
  restSeconds?: number
  weekIndex?: number      // ← confirm this exists
  dayOfWeek?: number
  orderIndex: number
  notes?: string
}
```

- [ ] **Step 5: Update `generateProgram()` to pass `weekPlan` through**

In `generateProgram()` (starts around line 703), the function calls `generateWorkoutPlan(params)`. Change this to:

```typescript
const generatedPlan = await generateWorkoutPlan(params)
```

This already passes `params` including the new `weekPlan` field — no change needed since `generateProgram` just forwards `params`. Verify `generateProgram`'s signature accepts the extended params:

```typescript
export async function generateProgram(
  params: GenerateWorkoutParams
): Promise<GeneratedProgram> {
```

`GenerateWorkoutParams` now includes `weekPlan?: WeekPlan[]` and `durationWeeks?: number` — so this passes through automatically. ✓

- [ ] **Step 6: Verify the app still compiles**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 7: Commit**

```bash
git add lib/services/ai.service.ts
git commit -m "feat: refactor generateWorkoutPlan for multi-week indication-filtered generation"
```

---

## Task 5: Update `generateProgramAction` to Accept `weekPlan`

**Files:**
- Modify: `actions/program-actions.ts`

- [ ] **Step 1: Add the import and update the action signature**

At the top of `actions/program-actions.ts`, add this import:

```typescript
import type { WeekPlan, ClinicalPlanParams } from '@/lib/ai/types/program-generation'
```

Find the existing `generateProgramAction` function. It currently accepts a params object matching `GenerateWorkoutParams`. Add `weekPlan` and `durationWeeks` to its input type.

Find the function signature (it will look like `export async function generateProgramAction(params: {...})`) and add the two new fields to the parameter type:

```typescript
export async function generateProgramAction(params: {
  patientId?: string | null
  focusAreas: string[]
  durationMinutes: number
  daysPerWeek: number
  durationWeeks?: number          // NEW
  circuits?: {
    name: string
    focusType: string
    exerciseCount: number
    rounds: number
    restBetweenRounds: number | null
  }[]
  preferredWeekdays?: string[]
  difficultyLevel: string
  additionalNotes?: string
  subjective?: string
  clinicianPrompt?: string
  weekPlan?: WeekPlan[]           // NEW
  startDate?: string | null
}): Promise<{ success: true; data: string } | { success: false; error: string }>
```

- [ ] **Step 2: Pass `weekPlan` and `durationWeeks` into the `generateProgram` call**

Inside `generateProgramAction`, find the call to `generateProgram(...)`. It currently passes a params object. Add the new fields:

```typescript
const aiPlan = await generateProgram({
  patientId: params.patientId,
  focusAreas: params.focusAreas,
  durationMinutes: params.durationMinutes,
  daysPerWeek: params.daysPerWeek,
  durationWeeks: params.durationWeeks,     // NEW
  circuits: params.circuits,
  preferredWeekdays: params.preferredWeekdays,
  difficultyLevel: params.difficultyLevel,
  additionalNotes: params.additionalNotes,
  subjective: params.subjective,
  clinicianPrompt: params.clinicianPrompt,
  weekPlan: params.weekPlan,               // NEW
})
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add actions/program-actions.ts
git commit -m "feat: pass weekPlan and durationWeeks through generateProgramAction"
```

---

## Task 6: `PlanReviewStep` Component

**Files:**
- Create: `components/programs/plan-review-step.tsx`

- [ ] **Step 1: Create the component**

Create `components/programs/plan-review-step.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Pencil, Sparkles, Check } from 'lucide-react'
import type { ClinicalPlan, WeekPlan } from '@/lib/ai/types/program-generation'

const REHAB_STAGE_LABELS: Record<string, { label: string; color: string }> = {
  EARLY_REHAB: { label: 'Early Rehab', color: 'bg-blue-100 text-blue-800' },
  MID_REHAB: { label: 'Mid Rehab', color: 'bg-yellow-100 text-yellow-800' },
  LATE_REHAB: { label: 'Late Rehab', color: 'bg-green-100 text-green-800' },
  MAINTENANCE: { label: 'Maintenance', color: 'bg-purple-100 text-purple-800' },
}

interface PlanReviewStepProps {
  plan: ClinicalPlan
  onConfirm: (updatedPlan: ClinicalPlan) => void
  onBack: () => void
  isGenerating: boolean
}

export function PlanReviewStep({ plan, onConfirm, onBack, isGenerating }: PlanReviewStepProps) {
  const [weeklyPlan, setWeeklyPlan] = useState<WeekPlan[]>(plan.weeklyPlan)
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [editGuidance, setEditGuidance] = useState('')

  function startEdit(week: WeekPlan) {
    setEditingWeek(week.week)
    setEditGuidance(week.clinicalGuidance)
  }

  function saveEdit(weekNumber: number) {
    setWeeklyPlan(prev =>
      prev.map(w => w.week === weekNumber ? { ...w, clinicalGuidance: editGuidance } : w)
    )
    setEditingWeek(null)
  }

  function handleConfirm() {
    onConfirm({ ...plan, weeklyPlan })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Clinical Program Plan</h3>
        <p className="text-sm text-muted-foreground mt-1">{plan.clinicalAssessment}</p>
      </div>

      <div className="space-y-2">
        {weeklyPlan.map(week => {
          const stage = REHAB_STAGE_LABELS[week.rehabStage] ?? { label: week.rehabStage, color: 'bg-gray-100 text-gray-800' }
          const isEditing = editingWeek === week.week

          return (
            <Card key={week.week} className="border">
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">Week {week.week} — {week.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>
                        {stage.label}
                      </span>
                      <span className="text-xs text-muted-foreground">· {week.difficultyLevel}</span>
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editGuidance}
                          onChange={e => setEditGuidance(e.target.value)}
                          rows={3}
                          className="text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveEdit(week.week)}>
                          <Check className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">{week.clinicalGuidance}</p>
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Goal:</span> {week.progressionGoal}
                    </p>

                    {week.contraindicationsThisWeek.length > 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        <span className="font-medium">Avoid:</span> {week.contraindicationsThisWeek.join(', ')}
                      </p>
                    )}
                  </div>

                  {!isEditing && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => startEdit(week)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isGenerating}>
          ← Back
        </Button>
        <Button onClick={handleConfirm} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Exercises...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Exercises
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/programs/plan-review-step.tsx
git commit -m "feat: add PlanReviewStep component for clinical plan review UI"
```

---

## Task 7: Update `GenerateProgramForm` — State Machine + Duration + Patient Summary

**Files:**
- Modify: `components/programs/generate-program-form.tsx`

The form gains a `durationWeeks` field, a patient profile inline summary, and a new state machine: `CONFIGURE → PLANNING → REVIEWING → GENERATING`.

- [ ] **Step 1: Add imports to the form**

At the top of `components/programs/generate-program-form.tsx`, add these imports:

```typescript
import { PlanReviewStep } from '@/components/programs/plan-review-step'
import type { ClinicalPlan } from '@/lib/ai/types/program-generation'
```

- [ ] **Step 2: Add the state machine type and new state variables**

Inside `GenerateProgramForm`, after the existing `useState` calls, add:

```typescript
type GenerateState =
  | 'CONFIGURE'
  | 'PLANNING'
  | 'REVIEWING'
  | 'GENERATING'

const [generateState, setGenerateState] = useState<GenerateState>('CONFIGURE')
const [clinicalPlan, setClinicalPlan] = useState<ClinicalPlan | null>(null)
const [durationWeeks, setDurationWeeks] = useState(4)
```

Remove the existing `const [loading, setLoading] = useState(false)` — replace all uses of `loading` with `generateState !== 'CONFIGURE'` and `setLoading(true/false)` with the appropriate state transitions below.

- [ ] **Step 3: Add `durationWeeks` to the patient prop type and form**

The `GenerateProgramFormProps` interface currently has:

```typescript
interface GenerateProgramFormProps {
  patients: { id: string; firstName: string; lastName: string }[];
  initialPatientId?: string;
}
```

Extend it to include optional patient profile data:

```typescript
interface PatientSummary {
  id: string
  firstName: string
  lastName: string
  primaryDiagnosis?: string | null
  painScore?: number | null
  limitations?: string | null
  availableEquipment?: string[]
}

interface GenerateProgramFormProps {
  patients: PatientSummary[]
  initialPatientId?: string
}
```

- [ ] **Step 4: Update `app/(platform)/programs/generate/page.tsx` to fetch patient profile data**

In `app/(platform)/programs/generate/page.tsx`, replace the call to `getPatientsForClinician` with a direct Prisma query that includes profile data:

```typescript
const patients = await prisma.user.findMany({
  where: {
    role: 'PATIENT',
    patientLinks: { some: { clinicianId: user.id, status: 'active' } },
  },
  select: {
    id: true,
    firstName: true,
    lastName: true,
    patientProfile: {
      select: {
        primaryDiagnosis: true,
        painScore: true,
        limitations: true,
        availableEquipment: true,
      },
    },
  },
})

const patientsForForm = patients.map(p => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  primaryDiagnosis: p.patientProfile?.primaryDiagnosis ?? null,
  painScore: p.patientProfile?.painScore ?? null,
  limitations: p.patientProfile?.limitations ?? null,
  availableEquipment: p.patientProfile?.availableEquipment ?? [],
}))
```

Then pass `patients={patientsForForm}` to `<GenerateProgramForm />`.

- [ ] **Step 5: Add the two-step submission handlers**

Replace the existing `handleGenerate` function with two separate handlers:

```typescript
async function handleRequestPlan(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  if (selectedAreas.length === 0) {
    toast.error('Please select at least one focus area')
    return
  }
  if (selectedWeekdays.length === 0) {
    toast.error('Please select at least one training day')
    return
  }
  if (selectedWeekdays.length !== daysPerWeek) {
    toast.error('Days per week must match your selected weekdays')
    return
  }
  if (circuits.some(c => c.exerciseCount < 1)) {
    toast.error('Each circuit must have at least 1 exercise')
    return
  }

  setGenerateState('PLANNING')
  const formData = new FormData(e.currentTarget)

  try {
    const res = await fetch('/api/ai/generate-clinical-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: selectedPatient || null,
        focusAreas: selectedAreas,
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
    })

    if (!res.ok) throw new Error('Failed to generate clinical plan')
    const json = await res.json()
    setClinicalPlan(json.data)
    setGenerateState('REVIEWING')
  } catch {
    toast.error('Failed to generate clinical plan. Please try again.')
    setGenerateState('CONFIGURE')
  }
}

async function handleGenerateExercises(approvedPlan: ClinicalPlan) {
  setGenerateState('GENERATING')

  const result = await generateProgramAction({
    patientId: selectedPatient || null,
    focusAreas: selectedAreas,
    durationMinutes: duration,
    daysPerWeek,
    durationWeeks,
    circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
      name, focusType, exerciseCount, rounds, restBetweenRounds,
    })),
    preferredWeekdays: selectedWeekdays,
    difficultyLevel: difficulty,
    weekPlan: approvedPlan.weeklyPlan,
  })

  if (result.success) {
    toast.success('Program generated successfully!')
    router.push(`/programs/${result.data}`)
  } else {
    toast.error(result.error)
    setGenerateState('CONFIGURE')
  }
}
```

- [ ] **Step 6: Update the form JSX to handle all four states**

Wrap the existing `<form>` content so that when `generateState === 'REVIEWING'`, the `PlanReviewStep` is shown instead of the form, and when `generateState === 'PLANNING'`, a loading indicator is shown:

```tsx
// In the return statement, replace the outermost element with:
return (
  <div>
    {generateState === 'REVIEWING' && clinicalPlan ? (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Review Clinical Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PlanReviewStep
            plan={clinicalPlan}
            onConfirm={handleGenerateExercises}
            onBack={() => setGenerateState('CONFIGURE')}
            isGenerating={generateState === 'GENERATING'}
          />
        </CardContent>
      </Card>
    ) : (
      <form onSubmit={handleRequestPlan}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              AI Program Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Patient selector — keep existing JSX unchanged */}

            {/* Patient profile summary — add this block after the patient selector */}
            {selectedPatient && (() => {
              const p = patients.find(pt => pt.id === selectedPatient)
              if (!p) return null
              return (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                  <p className="font-medium">{p.firstName} {p.lastName}</p>
                  {p.primaryDiagnosis && (
                    <p className="text-muted-foreground">Dx: {p.primaryDiagnosis}</p>
                  )}
                  {p.painScore != null && (
                    <p className="text-muted-foreground">Pain: {p.painScore}/10</p>
                  )}
                  {p.limitations && (
                    <p className="text-muted-foreground">Limitations: {p.limitations}</p>
                  )}
                </div>
              )
            })()}

            {/* Program Duration — add this new field after the patient block */}
            <div className="space-y-2">
              <Label>Program Duration</Label>
              <div className="flex gap-2 flex-wrap">
                {[2, 4, 6, 8, 12].map(w => (
                  <Button
                    key={w}
                    type="button"
                    variant={durationWeeks === w ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDurationWeeks(w)}
                  >
                    {w} weeks
                  </Button>
                ))}
              </div>
            </div>

            {/* All existing form fields: Focus Areas, Difficulty, Duration, etc. — keep unchanged */}

            {/* Update the submit button */}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={generateState !== 'CONFIGURE'}>
                {generateState === 'PLANNING' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Planning...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Plan Program
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    )}
  </div>
)
```

- [ ] **Step 7: Test the full flow manually**

1. Navigate to `/programs/generate` in the running dev server
2. Select a patient with a diagnosis in their profile
3. Pick focus areas, difficulty, 4 weeks duration, 3 days/week
4. Hit **Plan Program** — confirm the UI transitions to a loading state, then shows the Clinical Plan review cards
5. Read the week cards — confirm they describe a progressive rehab arc
6. Hit **Generate Exercises** — confirm the GENERATING state shows and the program is created
7. Verify the created program in `/programs/[id]` shows workouts across multiple weeks (week 1, week 2, etc.)

- [ ] **Step 8: Commit**

```bash
git add components/programs/generate-program-form.tsx app/(platform)/programs/generate/page.tsx
git commit -m "feat: two-step generate form with clinical plan review, duration selector, patient summary"
```

---

## Task 8: Bulk Exercise Tagging Migration Script

**Files:**
- Create: `lib/db/seed/tag-exercises-ai.ts`

This script runs once. It reads all exercises from the DB and calls GPT-4o to assign `indicationTags` and `rehabStage` to each one. Run it after all code changes are deployed.

- [ ] **Step 1: Create the script**

Create `lib/db/seed/tag-exercises-ai.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const BATCH_SIZE = 10

interface TaggingResult {
  exerciseId: string
  indicationTags: string[]
  rehabStage: 'EARLY_REHAB' | 'MID_REHAB' | 'LATE_REHAB' | 'MAINTENANCE'
}

async function tagBatch(exercises: {
  id: string
  name: string
  description: string | null
  musclesTargeted: string[]
  contraindications: string[]
  exercisePhase: string | null
  difficultyLevel: string
}[]): Promise<TaggingResult[]> {
  const exerciseList = exercises
    .map(
      e =>
        `ID: ${e.id}
Name: ${e.name}
Description: ${e.description ?? 'N/A'}
Muscles: ${e.musclesTargeted.join(', ')}
Contraindications: ${e.contraindications.join(', ') || 'None'}
Phase: ${e.exercisePhase ?? 'N/A'}
Difficulty: ${e.difficultyLevel}`
    )
    .join('\n\n---\n\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a clinical exercise classification expert. For each exercise, assign:
1. indicationTags: lowercase hyphenated clinical keywords indicating which conditions/diagnoses benefit from this exercise.
   Use tags from: ACL, knee, knee-OA, patellofemoral, meniscus, rotator-cuff, shoulder-impingement, shoulder-instability, 
   post-surgical, low-back-pain, lumbar, disc, spondylosis, hip, hip-OA, THA, hip-impingement, ankle, ankle-instability,
   plantar-fasciitis, balance, proprioception, flexibility, core-stability, quad-strengthening, hamstring, glute,
   scapular-stability, cervical, general-strength, cardio. Add others as clinically appropriate.
2. rehabStage: one of EARLY_REHAB (pain control/ROM), MID_REHAB (progressive strengthening), LATE_REHAB (functional/sport), MAINTENANCE (general fitness/prevention).

Respond with JSON: { "results": [{ "exerciseId": "...", "indicationTags": [...], "rehabStage": "..." }] }`,
      },
      {
        role: 'user',
        content: `Tag these ${exercises.length} exercises:\n\n${exerciseList}`,
      },
    ],
  })

  const raw = JSON.parse(response.choices[0].message.content ?? '{}') as {
    results: TaggingResult[]
  }
  return raw.results ?? []
}

async function main() {
  console.log('Fetching all exercises...')
  const allExercises = await prisma.exercise.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      musclesTargeted: true,
      contraindications: true,
      exercisePhase: true,
      difficultyLevel: true,
    },
  })

  console.log(`Found ${allExercises.length} exercises. Tagging in batches of ${BATCH_SIZE}...`)

  let updated = 0
  let failed = 0

  for (let i = 0; i < allExercises.length; i += BATCH_SIZE) {
    const batch = allExercises.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(allExercises.length / BATCH_SIZE)
    console.log(`Batch ${batchNum}/${totalBatches}...`)

    try {
      const results = await tagBatch(batch)

      await Promise.all(
        results.map(r =>
          prisma.exercise.update({
            where: { id: r.exerciseId },
            data: {
              indicationTags: r.indicationTags,
              rehabStage: r.rehabStage,
            },
          })
        )
      )

      updated += results.length
      console.log(`  ✓ Tagged ${results.length} exercises`)
    } catch (err) {
      console.error(`  ✗ Batch ${batchNum} failed:`, err)
      failed += batch.length
    }

    // Small delay to respect rate limits
    if (i + BATCH_SIZE < allExercises.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Add a script to `package.json` to run the tagger**

In `package.json`, in the `"scripts"` block, add:

```json
"tag-exercises": "npx ts-node --compiler-options '{\"module\":\"CommonJS\"}' lib/db/seed/tag-exercises-ai.ts"
```

- [ ] **Step 3: Run the tagging script**

```bash
npm run tag-exercises
```

Expected output:
```
Fetching all exercises...
Found 201 exercises. Tagging in batches of 10...
Batch 1/21...
  ✓ Tagged 10 exercises
Batch 2/21...
  ✓ Tagged 10 exercises
...
Done. Updated: 201, Failed: 0
```

If any batches fail, re-run — the script is safe to re-run (it just overwrites existing tags).

- [ ] **Step 4: Verify in the database**

Open Prisma Studio to spot-check a few exercises have `indicationTags` populated:

```bash
npx prisma studio
```

Navigate to the Exercise table. Confirm exercises like "Shoulder External Rotation with Resistance Band" have tags like `["rotator-cuff", "shoulder-impingement", "scapular-stability"]` and `rehabStage: "MID_REHAB"`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/seed/tag-exercises-ai.ts package.json
git commit -m "feat: add bulk exercise indication tagging script"
```

---

## Task 9: End-to-End Integration Test

No code changes — just systematic manual verification.

- [ ] **Step 1: Test with a post-ACL patient**

1. Create or select a patient with `primaryDiagnosis: "Post-ACL reconstruction"`, `painScore: 5`, `limitations: "no loaded knee flexion past 90 degrees"`, `surgeryHistory: "ACL reconstruction 6 weeks ago"`
2. Navigate to `/programs/generate`
3. Select that patient — confirm the profile summary shows diagnosis and limitations
4. Select: Focus Areas = Lower Body, Duration = 4 weeks, Difficulty = Beginner, 3 days/week (Mon/Wed/Fri), default circuit structure
5. Hit **Plan Program**
6. Verify Step 1 response: week 1 should be `EARLY_REHAB`, week 3-4 should progress to `MID_REHAB` or `LATE_REHAB`. Week 1 contraindications should mention loaded knee flexion.
7. Hit **Generate Exercises**
8. On the created program page, confirm: 12 total workouts (4 weeks × 3 days), different exercises each week, no exercise ID appears in more than one week

- [ ] **Step 2: Test the fallback path (no indication tags yet)**

If the tagging script hasn't been run yet, generate a program and verify it still completes without errors (fallback to body-region filter).

- [ ] **Step 3: Test without a patient (template program)**

Generate with no patient selected — verify it still generates a sensible multi-week general fitness program.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
# Confirm only expected files remain untracked/modified
git commit -m "feat: complete two-step clinical AI program generation system"
```

---

## Self-Review Checklist

- ✅ **Schema** (Task 1) adds `indicationTags` and `rehabStage` to Exercise ← spec section: Exercise Library
- ✅ **Types** (Task 2) define `WeekPlan`, `ClinicalPlan`, `ClinicalPlanParams` — used consistently in Tasks 3-7
- ✅ **generateClinicalPlan** (Task 3) is the Step 1 fast call — spec section: Step 1
- ✅ **generateWorkoutPlan refactor** (Task 4) accepts `weekPlan[]`, queries per-week pools, one combined GPT-4o call, global dedup — spec section: Step 2
- ✅ **generateProgramAction** (Task 5) passes `weekPlan` and `durationWeeks` through — spec section: Form & UX
- ✅ **PlanReviewStep** (Task 6) renders week cards with edit capability — spec section: State 2
- ✅ **GenerateProgramForm** (Task 7) adds duration selector, patient summary, CONFIGURE→PLANNING→REVIEWING→GENERATING states — spec section: Form & UX
- ✅ **Tagging script** (Task 8) bulk-tags all exercises with indication tags and rehab stage — spec section: Bulk Tagging Migration
- ✅ **Fallback** covered in Task 4 Step 2 — pool < 20 exercises falls back to body-region filter
- ✅ **Existing brief upload path** preserved — `sessionBlueprint` path in `generateWorkoutPlan` is untouched
- ✅ **`durationWeeks` already exists** in `createProgramSchema` — no validator changes needed
