# TrueCoach-Like Functionality: Execution Blueprint & Strategy Migration

This document outlines the architectural strategy, phase-by-phase execution plan, and data model changes required to implement TrueCoach-like functionalities. These changes shift the platform from a rigid day-of-week model to a robust, calendar-based, modular, and AI-driven coaching ecosystem.

---

## 1. Architectural Changes & Strategy (Updates for `STRATEGY.md`)

### A. Calendar-Based Assignment
- **Shift:** Move away from assigning routines "per day of the week" to scheduling discrete `Session` records on specific dates.
- **Tools:** Use `@dnd-kit/core` for drag-and-drop interactions across a calendar grid, paired with `date-fns` for robust date manipulation.
- **Outcome:** Clinicians can visually drag workouts onto a patient's calendar.

### B. Modular Programs (Templates)
- **Shift:** Introduce a dual-nature for `WorkoutPlan`s: _Templates_ and _Active Plans_.
- **Mechanism:** Clinicians build and save reusable "Programs" (Templates). When assigned to a patient, the system deep-copies the template's hierarchy (Blocks, Exercises, Sets) into a new editable instance tied directly to the patient, ensuring modifications to one patient's plan don't affect the master template.

### C. AI-Driven Program Generation
- **Shift:** Implement deterministic, strictly-structured AI generation to prevent hallucinations.
- **Tools:** Vercel AI SDK (`streamObject`) paired with Anthropic Claude (or OpenAI).
- **Mechanism:** Feed the AI the patient's profile constraints (injury, pain level, equipment) and the curated database (`exercises-v2.ts`). Enforce a strict JSON schema output representing the nested Blocks/Circuits hierarchy.

### D. Video Integration
- **Shift:** Centralize multimedia handling on the `Exercise` model.
- **Tools:** `react-player` for reliable cross-platform playback (YouTube, Vimeo) and Uploadthing for custom MP4 uploads.
- **Mechanism:** Build a `UniversalVideoPlayer` component that intelligently detects the source URL structure and renders the appropriate player wrapper gracefully.

### E. Granular Workout Construction (Hierarchy)
- **Shift:** Introduce structural groupings within a single workout session.
- **Hierarchy:** `Workout` → contains multiple `Blocks` (e.g., Warmup, Circuit, Superset, Cooldown) → contains multiple `Exercises` → contains multiple `Sets` (Reps, Weight, RPE).

---

## 2. Updated Data Model (Prisma Schema Changes)

```prisma
// 1. Program / WorkoutPlan (Template vs Assigned Instance)
model Program {
  id          String   @id @default(cuid())
  name        String
  description String?
  isTemplate  Boolean  @default(false)      // True = reusable library program
  clinicianId String                        // Creator of the template
  patientId   String?                       // Null if template, set if active instance
  
  workouts    Workout[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// 2. Workout (A distinct routine within a Program)
model Workout {
  id          String   @id @default(cuid())
  name        String
  programId   String
  program     Program  @relation(fields: [programId], references: [id], onDelete: Cascade)
  
  blocks      Block[]  // Replaces direct Exercise mapping
  sessions    Session[] // Scheduled instances on the calendar
}

// 3. Calendar Session (The actual scheduled event)
model Session {
  id          String   @id @default(cuid())
  scheduledAt DateTime // The date on the calendar
  isCompleted Boolean  @default(false)
  
  workoutId   String
  workout     Workout  @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  patientId   String
}

// 4. Block (Superset, Circuit, Warmup)
model Block {
  id           String   @id @default(cuid())
  name         String?  // e.g., "Superset A", "Warm-up"
  type         String   // ENUM: 'NORMAL', 'SUPERSET', 'CIRCUIT'
  order        Int
  rounds       Int      @default(1) // For circuits
  
  workoutId    String
  workout      Workout  @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  
  exercises    BlockExercise[]
}

// 5. BlockExercise (Mapping an Exercise into a Block with Sets)
model BlockExercise {
  id          String   @id @default(cuid())
  order       Int
  restSeconds Int?
  
  blockId     String
  block       Block    @relation(fields: [blockId], references: [id], onDelete: Cascade)
  exerciseId  String
  exercise    Exercise @relation(fields: [exerciseId], references: [id])
  
  sets        Set[]
}

// 6. Set (Granular tracking)
model Set {
  id              String   @id @default(cuid())
  order           Int
  targetReps      Int?
  targetWeight    Float?
  targetDuration  Int?     // seconds
  
  blockExerciseId String
  blockExercise   BlockExercise @relation(fields: [blockExerciseId], references: [id], onDelete: Cascade)
}

// 7. Exercise Library (Updated for Video)
model Exercise {
  id          String   @id @default(cuid())
  name        String
  videoUrl    String?  // Can be YouTube, Vimeo, or Uploadthing URL
  customVideo Boolean  @default(false) // True if hosted via Uploadthing
  
  // existing fields...
  blockMappings BlockExercise[]
}
```

---

## 3. Execution Blueprint & Phases (`EXECUTION-BLUEPRINT.md`)

### Phase 1: Data Model Migration & UI Scaffolding
- **Task 1.1:** Update `schema.prisma` with the new hierarchical models (`Program`, `Workout`, `Block`, `BlockExercise`, `Set`, `Session`).
- **Task 1.2:** Run prisma generate and migration scripts. Write a data migration script (e.g., `temp-migrate-workouts.ts`) to convert old `WorkoutPlan` data into the new structure (converting single lists of exercises into a single `NORMAL` Block).
- **Task 1.3:** Create basic CRUD server actions for the new hierarchy (`actions/workout-builder-actions.ts`).

### Phase 2: Media & Video Integration
- **Task 2.1:** Implement `UniversalVideoPlayer.tsx` in `components/exercises/`. Use regex/utility functions to detect YouTube vs. Vimeo vs. direct MP4 URLs.
- **Task 2.2:** Update `exercise-form.tsx` to handle `videoUrl` inputs and integrate `@uploadthing/react` for custom direct video uploads to the platform.

### Phase 3: The Workout Builder (Hierarchy UI)
- **Task 3.1:** Build the `WorkoutBuilder` component. Implement drag-and-drop within a workout to reorder `Blocks` and reorder `Exercises` inside Blocks using `@dnd-kit/sortable`.
- **Task 3.2:** Add UI controls to group exercises into "Circuits" or "Supersets" (translating to the `Block.type` property).
- **Task 3.3:** Add granular inline inputs for `Sets` (Reps, Weight, Rest).

### Phase 4: Calendar & Scheduling
- **Task 4.1:** Build the `CalendarGrid` component using `date-fns` for month/week views.
- **Task 4.2:** Implement `@dnd-kit/core` on the calendar to allow dragging a `Workout` from a sidebar onto a specific date, triggering the creation of a `Session` record.
- **Task 4.3:** Build the "Assign Program" workflow. Deep-copy a `Program` (where `isTemplate = true`) into a patient-specific instance, mapping the dates out mechanically based on user input.

### Phase 5: AI Program Generation API
- **Task 5.1:** Set up `app/api/ai/generate-program/route.ts` utilizing Vercel AI SDK (`streamObject`).
- **Task 5.2:** Define the Zod schema for the expected response, perfectly mapping to the new `Block` -> `BlockExercise` -> `Set` hierarchy.
- **Task 5.3:** Create the prompt. Inject stringified patient contextual data and the `exercises-v2.ts` allowed reference IDs. Ensure the system prompt strictly forbids hallucinating external exercises.
- **Task 5.4:** Build the frontend loading UI to consume the streamed object, presenting the draft program to the clinician for editing before saving.