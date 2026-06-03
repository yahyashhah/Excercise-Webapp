# Clinic Exercise Library Design

**Date:** 2026-06-03  
**Status:** Approved

## Problem

Clinicians must leave the program builder to add exercises they don't see in the picker. There is no way to add custom exercises to the clinic's library inline, no distinction between platform (admin) exercises and clinic-created exercises, and no publish/visibility control.

## Goals

1. Inline exercise creation from within the Add Exercise picker modal
2. Two-tab UI: Universal (admin + public clinic exercises) and My Clinic (current clinic's exercises)
3. Clinicians can toggle visibility: public (visible to all clinics in Universal tab) or private (own clinic only)
4. AI program generation automatically includes both exercise sources

---

## Schema Changes

Add 3 fields and 1 enum to `Exercise`:

```prisma
enum ExerciseSource {
  UNIVERSAL
  CLINIC
}

model Exercise {
  // ...existing fields unchanged...
  source         ExerciseSource @default(UNIVERSAL)
  organizationId String?        // Clerk org ID; null for UNIVERSAL exercises
  isPublic       Boolean        @default(true)
}
```

- All existing exercises migrate to `source=UNIVERSAL`, `organizationId=null`, `isPublic=true`
- New clinic exercises: `source=CLINIC`, `organizationId=<clerkOrgId>`, `isPublic=true` by default

---

## Service Layer

### `getExercisesForPicker(organizationId?: string)`

Returns exercises visible to the calling clinic — a union of:
1. All `UNIVERSAL` exercises
2. `CLINIC` exercises where `isPublic = true` (any org)
3. `CLINIC` exercises where `organizationId = callerOrgId` (even if private)

Deduplication handled at the query level with an `OR` clause. Returns a `source` and `isPublic` field alongside existing fields so the UI can render tabs and badges.

### `createClinicExerciseAction(input)`

- Validates caller is a `CLINICIAN` with a Clerk org ID
- Creates exercise with `source=CLINIC`, `organizationId` from Clerk auth, `isPublic=true` by default
- Returns the created exercise (so the picker can immediately add it to the program)
- Revalidates `/exercises`

### `toggleExercisePublicAction(exerciseId)`

- Validates caller belongs to the same `organizationId` as the exercise
- Flips `isPublic`
- Revalidates `/exercises`

---

## UI Changes

### ExercisePickerDialog (`components/programs/exercise-picker-dialog.tsx`)

- Add two tabs: **Universal** and **My Clinic**
  - Universal: `source=UNIVERSAL` exercises + `source=CLINIC` where `isPublic=true`
  - My Clinic: `source=CLINIC` where `organizationId` = caller's org (public + private)
- Category and Body Region filters apply within the active tab
- "**+ Create New Exercise**" button in the dialog header
  - Opens an inline Sheet (slide-in panel)
  - Fields: name, body region, difficulty level, exercise phase, description, video URL, isPublic toggle (default on)
  - On submit: calls `createClinicExerciseAction`, immediately adds returned exercise to the program block, closes Sheet
- Clinic exercises show a **Public** / **Private** badge; clicking it calls `toggleExercisePublicAction` inline

### Exercise Library Page (`app/(platform)/exercises/page.tsx`)

- Add tab switcher: **Universal** | **My Clinic**
- Tab drives a new `source` URL search param passed to `getExercises()`
- My Clinic tab: each card shows publish toggle (calls `toggleExercisePublicAction`)
- Existing `/exercises/new` flow updated: saves as `CLINIC` exercise with org ID

### `getExercises()` service

- Accept optional `source` filter for the library page tabs

---

## AI Program Generation

No changes required. The AI generation already calls `getExercisesForPicker()`. Once that function returns both UNIVERSAL and CLINIC exercises, the AI will automatically analyze both sources.

---

## Out of Scope

- Admins publishing clinic exercises on their behalf
- Exercise approval/moderation workflow
- Per-clinician (vs per-clinic) exercise ownership
