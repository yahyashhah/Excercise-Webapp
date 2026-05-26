# AI Program Generation — Clinical PT Design Spec

**Date:** 2026-05-27  
**Status:** Approved  
**Primary Use Case:** Clinical physical therapy (post-injury, post-surgical, musculoskeletal rehab)

---

## Problem Statement

The current AI program generation system has three root-cause failures:

1. **Repetitive exercise selection** — The AI draws from a body-region-filtered pool with no clinical specificity. Every program for a "lower body" patient pulls from the same ~80 exercises regardless of diagnosis, resulting in the same exercises appearing across every generated program.

2. **No clinical reasoning** — The AI receives all patient data in one dump and generates immediately. There is no "think first" step — no analysis of what rehab phase the patient is in, what's appropriate this week vs next, or what the week-over-week progression should be.

3. **Flat single-week structure** — Programs generate one week of sessions which repeats indefinitely. There is no true multi-week progression — no escalation of difficulty, load, or functional complexity over time.

---

## Solution Overview

Two parallel improvements that reinforce each other:

1. **Exercise library clinical tagging** — Add `indicationTags` and `rehabStage` to every exercise so the AI gets a precision-filtered pool instead of a generic body-region bucket.

2. **Two-step AI generation engine** — Step 1 produces a week-by-week clinical plan (fast, cheap). Step 2 uses that plan to populate each week with appropriately staged exercises from the tagged pool.

---

## Architecture

```
[Form Input]
  Patient profile + diagnosis + duration (weeks) + circuit config
        │
        ▼
[Step 1 — Clinical Reasoning Call]  (GPT-4o-mini, ~2-3s)
  Input:  Full patient profile, program parameters, duration in weeks
  Output: Week-by-week clinical plan (rehab stage, focus, guidance, contraindications per week)
        │
        ▼
[UI: Plan Review Step]
  Clinician reads the week plan, optionally edits, then approves
        │
        ▼
[Step 2 — Exercise Population Call]  (GPT-4o, ~8-12s)
  For each week:
    - Query DB: exercises filtered by rehabStage + indicationTags + contraindications
    - Pass tight pool (40-60 exercises) to AI
    - AI generates sessions for that week using the week's clinical guidance
    - Track used exercise IDs globally — no repeats across weeks
        │
        ▼
[Multi-Week Program Saved to DB]
  Program → Workouts (weekIndex 0..N) → Blocks → Exercises
```

---

## Layer 1: Exercise Library — Clinical Tagging

### New Fields on `Exercise` Model (Prisma)

```prisma
indicationTags  String[]   // e.g. ["ACL", "knee", "post-surgical", "quad-strengthening"]
rehabStage      String?    // EARLY_REHAB | MID_REHAB | LATE_REHAB | MAINTENANCE
```

### Rehab Stage Definitions

| Stage | Typical Timing | Clinical Focus |
|---|---|---|
| `EARLY_REHAB` | Weeks 1-2 post-injury/surgery | Pain control, ROM, gentle activation, swelling management |
| `MID_REHAB` | Weeks 3-6 | Progressive strengthening, neuromuscular control, load introduction |
| `LATE_REHAB` | Weeks 7+ | Functional loading, sport/activity-specific, power development |
| `MAINTENANCE` | Ongoing | General fitness, prevention, performance, non-acute conditions |

### Indication Tag Conventions

Tags are lowercase hyphenated strings. Common clusters:

- **Knee:** `ACL`, `knee`, `post-surgical`, `quad-strengthening`, `VMO`, `meniscus`, `patellofemoral`, `knee-OA`
- **Shoulder:** `rotator-cuff`, `shoulder-impingement`, `scapular-stability`, `shoulder-instability`, `post-surgical`
- **Spine:** `low-back-pain`, `lumbar`, `core-stability`, `disc`, `spondylosis`
- **Hip:** `hip`, `hip-OA`, `glute-strengthening`, `THA`, `hip-impingement`
- **Ankle/foot:** `ankle`, `ankle-instability`, `plantar-fasciitis`
- **General:** `balance`, `proprioception`, `flexibility`, `cardio`, `general-strength`

### Bulk Tagging Migration

A one-time migration script (`lib/db/seed/tag-exercises-ai.ts`) reads each exercise's name, description, musclesTargeted, contraindications, and exercisePhase, then calls GPT-4o to assign `indicationTags` and `rehabStage`. Output reviewed and committed. New exercises tagged at creation time via the exercise form.

---

## Layer 2: Two-Step AI Generation Engine

### Step 1 — `generateClinicalPlan()`

**Location:** `lib/services/ai.service.ts`  
**Model:** GPT-4o-mini (fast, cheap — this call is a planning call, not generation)  
**New API Route:** `app/api/ai/generate-clinical-plan/route.ts`

**Input:**
```typescript
interface ClinicalPlanParams {
  patientId?: string | null
  focusAreas: string[]
  durationWeeks: number        // NEW — e.g. 4
  daysPerWeek: number
  difficultyLevel: string
  circuits: CircuitConfig[]
  subjective?: string
  clinicianPrompt?: string
  additionalNotes?: string
}
```

**Output (structured JSON):**
```typescript
interface ClinicalPlan {
  clinicalAssessment: string       // 2-3 sentence patient summary
  weeklyPlan: WeekPlan[]
}

interface WeekPlan {
  week: number                     // 1-based
  title: string                    // e.g. "Pain Control & ROM Restoration"
  rehabStage: string               // EARLY_REHAB | MID_REHAB | LATE_REHAB | MAINTENANCE
  focusAreas: string[]             // body regions for this week
  difficultyLevel: string          // may escalate week over week
  clinicalGuidance: string         // what to prioritize, technique cues context
  contraindicationsThisWeek: string[]
  progressionGoal: string          // what should improve by end of week
  derivedIndicationTags: string[]  // used to filter exercise pool for this week
}
```

**Prompt structure:**
```
System: You are an expert DPT. Given a patient profile and program parameters, produce a 
        week-by-week clinical rehabilitation plan. Think step by step: assess the patient's 
        current rehab phase, then plan each week as a progressive stage toward their goals.
        
User:   [Full patient profile]
        [Program parameters including durationWeeks]
        
        Produce a JSON clinical plan with one WeekPlan per week. Each week must:
        - Be clinically distinct from the previous week
        - Escalate in difficulty/load appropriately
        - Specify which exercises are contraindicated THIS week (may differ from global)
        - Name the specific progression goal for the week
```

---

### Step 2 — `generateWorkoutPlan()` (Refactored)

**Location:** `lib/services/ai.service.ts`  
**Model:** GPT-4o

**Key changes from current implementation:**
- Accepts a `weekPlan: WeekPlan[]` parameter (from Step 1 output)
- **Server pre-queries the DB once per week** (fast, parallel) — each week gets its own filtered pool of 40-60 exercises based on `rehabStage` + `indicationTags` + contraindications + global dedup
- **One combined GPT-4o call** — all weeks and their respective exercise pools are sent together in a single prompt. The AI sees "Week 1 pool: [...], Week 2 pool: [...]" and generates all weeks in one pass. This avoids N serial AI calls for an N-week program.
- Tracks a `globalUsedIds: Set<string>` built server-side before the AI call — exercises already assigned to earlier weeks are excluded from later weeks' pools at the DB query level, not just in post-processing
- Each week section in the prompt includes that week's `clinicalGuidance` and `progressionGoal` so the AI has full context per week

**Per-week exercise pool query:**
```typescript
const weekPool = await prisma.exercise.findMany({
  where: {
    isActive: true,
    rehabStage: weekPlan.rehabStage,
    bodyRegion: { in: weekPlan.focusAreas },
    indicationTags: { hasSome: weekPlan.derivedIndicationTags },
    id: { notIn: [...globalUsedIds] },       // global dedup
    // contraindication filtering (existing logic)
  },
  take: 60,
})
```

**Fallback:** If the tagged pool is too small (<20 exercises), fall back to body-region-only filter (current behavior) to avoid generation failures.

---

## Layer 3: Multi-Week Program Output

The DB schema already supports multi-week programs via `weekIndex` on the `Workout` model. The current generation only ever produces `weekIndex: 0`. This spec uses `weekIndex: 0..N-1` for a true N-week program.

**No schema migration needed.** The `Program.durationWeeks` field is already present.

**Generated structure for a 4-week, 3-day program:**
```
Program
  └── Workout (weekIndex: 0, dayIndex: 0) "Pain Control — Monday"
  └── Workout (weekIndex: 0, dayIndex: 2) "Pain Control — Wednesday"  
  └── Workout (weekIndex: 0, dayIndex: 4) "Pain Control — Friday"
  └── Workout (weekIndex: 1, dayIndex: 0) "Early Activation — Monday"
  ... (12 total workouts for a 4-week, 3-day program)
```

---

## Layer 4: Form & UX Changes

### `GenerateProgramForm` additions

**New field: Program Duration**
```
Duration: [2 weeks] [4 weeks] [6 weeks] [8 weeks] [12 weeks]
           (default: 4 weeks)
```

**Patient profile inline summary** — when a patient is selected, show a compact read-only card:
```
John Doe · Diagnosis: Post-ACL reconstruction (6 wks) · Pain: 4/10
Limitations: No loaded knee flexion past 90° · Equipment: Resistance bands, bodyweight
```

### New `PlanReviewStep` Component

Rendered after Step 1 completes, before Step 2 starts.

```
┌─────────────────────────────────────────────────────┐
│  Clinical Plan — John Doe (4 weeks)                  │
│                                                       │
│  Week 1 — Pain Control & ROM Restoration              │
│  Stage: Early Rehab · Difficulty: Beginner            │
│  Focus: Lower Body, Flexibility                       │
│  Goal: Achieve 0–90° flexion, activate VMO            │
│  Note: No loaded knee flexion past 60°                │
│                                                       │
│  Week 2 — Early Activation & Proprioception           │
│  Stage: Mid Rehab · Difficulty: Beginner-Intermediate │
│  ...                                                  │
│                                                       │
│  [Edit Plan]          [Generate Exercises →]          │
└─────────────────────────────────────────────────────┘
```

**Edit Plan** — makes each week's `clinicalGuidance` and `contraindicationsThisWeek` editable inline before committing to Step 2.

### Generation State Machine

```
CONFIGURE → PLANNING (Step 1 running) → REVIEWING (clinician sees plan)
         → GENERATING (Step 2 running) → redirect to program
```

---

## Files Affected

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `indicationTags String[]` and `rehabStage String?` to Exercise |
| `lib/services/ai.service.ts` | Add `generateClinicalPlan()`, refactor `generateWorkoutPlan()` to accept `weekPlan[]` |
| `app/api/ai/generate-clinical-plan/route.ts` | New — Step 1 endpoint |
| `app/api/ai/generate-workout/route.ts` | Update to accept `weekPlan` in body |
| `components/programs/generate-program-form.tsx` | Add duration field, patient summary, plan review state |
| `components/programs/plan-review-step.tsx` | New — week plan review UI |
| `actions/program-actions.ts` | Update `generateProgramAction` to pass `weekPlan` to Step 2 |
| `lib/db/seed/tag-exercises-ai.ts` | New — one-time bulk tagging migration script |
| `lib/validators/program.ts` | Add `durationWeeks` to program schema |

---

## What Does NOT Change

- The `Program`, `Workout`, `WorkoutBlockV2`, `BlockExerciseV2`, `ExerciseSet` DB models — no migration needed beyond Exercise fields
- The program builder, program editor, and program detail view — output format is the same
- The circuit structure configuration in the form — preserved as-is
- The brief upload flow (`program-brief-upload.tsx`) — unaffected
- Authentication, clinician role checks, `createProgramFromGeneratedPlan()` — unchanged

---

## Success Criteria

1. A generated 4-week program for a post-ACL patient has zero repeated exercises across all weeks
2. Week 1 exercises are drawn from `EARLY_REHAB` stage; Week 3-4 from `MID_REHAB` or `LATE_REHAB`
3. The Step 1 clinical plan correctly identifies the rehab phase from the patient profile and does not prescribe contraindicated exercises
4. Generation completes in under 20 seconds total (Step 1 + Step 2)
5. Fallback to body-region filter when tagged pool is too small — no generation failures
