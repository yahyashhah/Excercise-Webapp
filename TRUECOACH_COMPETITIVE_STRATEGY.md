# TrueCoach Competitive Strategy: Complete Technical Architecture & Execution Plan

> **Document Version:** 1.0 | **Date:** 2026-04-02 | **Status:** Active
> **Purpose:** Full technical strategy to evolve the exercise-webapp into a TrueCoach-competitive coaching platform. This is the authoritative reference for all development phases.

---

## Table of Contents

1. [Gap Analysis](#1-gap-analysis)
2. [Revised Data Model](#2-revised-data-model)
3. [Phased Execution Roadmap](#3-phased-execution-roadmap)
4. [New App Routes](#4-new-app-routes)
5. [Component Architecture](#5-component-architecture)
6. [AI Integration Strategy](#6-ai-integration-strategy)
7. [Video Strategy](#7-video-strategy)
8. [Technical Risks & Mitigations](#8-technical-risks--mitigations)

---

## 1. Gap Analysis

### Feature Comparison Matrix

| # | TrueCoach Feature | Current State | Gap Severity | Notes |
|---|---|---|---|---|
| 1 | **Client Management Dashboard** | Partial -- `/patients` has list, profile, adherence, outcomes | Medium | Missing: search/filter, compliance %, last activity timestamp, active program badge |
| 2 | **Calendar-Based Programming** | Partial -- `react-big-calendar` renders sessions, drag-to-reschedule works | High | Missing: drag workouts FROM sidebar ONTO calendar, color-coded status, week view optimization, client-facing calendar |
| 3 | **Program Library (Templates)** | Partial -- `WorkoutPlan.isTemplate` exists but no `/programs` route | High | Missing: dedicated template CRUD, browse/search library, deep-copy assignment with date offset |
| 4 | **Workout Builder (Hierarchy)** | Partial -- `ProgramBuilder` component exists (dnd-kit) but UI-only | Critical | Missing: DB persistence for builder, block types (CIRCUIT/SUPERSET/AMRAP), set-level granularity (weight, RPE, duration), nested drag-drop |
| 5 | **Exercise Library** | Strong -- 56 seeded exercises, CRUD, filters, video player | Low | Missing: muscle group thumbnails in search, coach private exercises scoping |
| 6 | **AI Program Generation** | Partial -- two implementations (OpenAI in `ai.service.ts`, Anthropic in API route) | Medium | Missing: save-to-DB flow from AI output, multi-week program generation, block-aware output schema |
| 7 | **Client Portal (mobile-friendly)** | Minimal -- patient dashboard exists | Critical | Missing: dedicated client calendar view, tap-to-log workout, set/rep/weight logging, streak tracking, mobile-optimized session flow |
| 8 | **Progress Tracking** | Partial -- `Assessment` model tracks values over time | High | Missing: body weight tracking, body measurements, progress photos, custom metrics, visual charts per metric |
| 9 | **Check-ins** | Not built | Critical | Missing: questionnaire builder, periodic scheduling, coach review dashboard, AI analysis |
| 10 | **Messaging** | Built -- thread-based, exercise/plan attachments | Low | Missing: attach workouts inline, unread count in nav, real-time updates |
| 11 | **Notifications** | Not built | High | Missing: in-app notification center, email notifications (Resend is installed but unused for this), push notification groundwork |
| 12 | **Nutrition Logging** | Not built | Medium | Missing: macro targets, daily food log, calorie tracking |
| 13 | **Habit Tracking** | Not built | Medium | Missing: daily habit definitions, check-off, streak tracking |
| 14 | **Coach Business Tools** | Partial -- `ClinicProfile` has name/logo | Medium | Missing: custom branding (colors applied to client portal), client count dashboard, revenue tracking |
| 15 | **Billing/Subscriptions** | Not built | High | Missing: Stripe integration, package creation, recurring billing, invoice management |
| 16 | **Reports/Analytics** | Partial -- adherence stats exist | Medium | Missing: compliance rate aggregation, client progress charts, revenue reports, exportable data |

### Critical Path Items (Must Fix First)

1. **Workout Builder persistence** -- The ProgramBuilder UI exists but writes nothing to the database. This is the single most blocking gap.
2. **Client portal with session logging** -- Patients have no way to log weights, RPE, or mark individual sets complete. This is the core client-facing value proposition.
3. **Calendar drag-from-sidebar** -- Clinicians need to visually schedule workouts by dragging from a sidebar onto calendar dates.
4. **Check-in system** -- Zero implementation exists. Required for coaching workflow parity.

---

## 2. Revised Data Model

### Design Principles

- All IDs use `@id @default(auto()) @map("_id") @db.ObjectId` for MongoDB compatibility.
- Existing models (`User`, `Exercise`, `Message`, `Assessment`, `PatientProfile`, `PatientClinicianLink`, `ClinicProfile`) are preserved and extended, not replaced.
- The flat `PlanExercise` model is deprecated in favor of the hierarchical `Program > Workout > WorkoutBlock > BlockExercise > ExerciseSet` structure. A migration path is provided.
- New enums are added inline. Prisma MongoDB does not support `@default` on enums directly in all cases; defaults are enforced at the application layer where needed.

### New & Modified Enums

```prisma
enum BlockType {
  NORMAL
  SUPERSET
  CIRCUIT
  AMRAP
  EMOM
}

enum SessionStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  MISSED
  SKIPPED
}

enum SetType {
  NORMAL
  WARMUP
  DROP_SET
  FAILURE
}

enum CheckInFrequency {
  DAILY
  WEEKLY
  BIWEEKLY
  MONTHLY
  CUSTOM
}

enum NotificationType {
  WORKOUT_ASSIGNED
  WORKOUT_REMINDER
  MESSAGE_RECEIVED
  CHECKIN_DUE
  CHECKIN_SUBMITTED
  PROGRESS_MILESTONE
  PAYMENT_DUE
  PAYMENT_RECEIVED
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  CANCELLED
  PAST_DUE
  TRIALING
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  OVERDUE
  CANCELLED
}
```

### New Models

```prisma
// ============================================================
// PROGRAM & WORKOUT HIERARCHY (replaces flat PlanExercise)
// ============================================================

model Program {
  id            String      @id @default(auto()) @map("_id") @db.ObjectId
  name          String
  description   String?
  isTemplate    Boolean     @default(false)
  sourceTemplateId String?  @db.ObjectId   // If cloned from a template, references original
  clinicianId   String      @db.ObjectId
  clinician     User        @relation("ProgramsCreated", fields: [clinicianId], references: [id])
  patientId     String?     @db.ObjectId   // Null for templates, set for assigned programs
  patient       User?       @relation("ProgramsAssigned", fields: [patientId], references: [id])
  status        PlanStatus  @default(DRAFT)
  durationWeeks Int?
  daysPerWeek   Int?
  tags          String[]
  aiGenerationParams Json?
  startDate     DateTime?   // When assigned: the date the program begins
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  workouts      Workout[]
}

model Workout {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  programId   String   @db.ObjectId
  program     Program  @relation(fields: [programId], references: [id], onDelete: Cascade)
  name        String                     // e.g., "Day 1 - Upper Body Push"
  description String?
  dayIndex    Int                        // 0-based day within the program (Day 0, Day 1, ...)
  weekIndex   Int      @default(0)       // Which week this workout belongs to (0-based)
  orderIndex  Int                        // Sort order within the same day/week
  estimatedMinutes Int?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  blocks      WorkoutBlockV2[]
  sessions    WorkoutSessionV2[]
}

model WorkoutBlockV2 {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  workoutId   String    @db.ObjectId
  workout     Workout   @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  name        String?                    // "Warm-up", "Superset A", "Finisher"
  type        BlockType @default(NORMAL) // Stored as String in MongoDB; validated at app layer
  orderIndex  Int
  rounds      Int       @default(1)      // For CIRCUIT/AMRAP: how many rounds
  restBetweenRounds Int?                 // Seconds rest between circuit rounds
  timeCap     Int?                       // For AMRAP/EMOM: time cap in seconds
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  exercises   BlockExerciseV2[]
}

model BlockExerciseV2 {
  id            String         @id @default(auto()) @map("_id") @db.ObjectId
  blockId       String         @db.ObjectId
  block         WorkoutBlockV2 @relation(fields: [blockId], references: [id], onDelete: Cascade)
  exerciseId    String         @db.ObjectId
  exercise      Exercise       @relation("BlockExercisesV2", fields: [exerciseId], references: [id])
  orderIndex    Int
  restSeconds   Int?
  notes         String?                   // Coach cues specific to this prescription
  supersetGroup String?                   // For grouping within a SUPERSET block: "A", "B"
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  sets          ExerciseSet[]
}

model ExerciseSet {
  id               String          @id @default(auto()) @map("_id") @db.ObjectId
  blockExerciseId  String          @db.ObjectId
  blockExercise    BlockExerciseV2 @relation(fields: [blockExerciseId], references: [id], onDelete: Cascade)
  orderIndex       Int
  setType          String          @default("NORMAL")  // NORMAL, WARMUP, DROP_SET, FAILURE
  targetReps       Int?
  targetWeight     Float?
  targetDuration   Int?            // Seconds (for holds, timed exercises)
  targetDistance    Float?          // Meters (for carries, runs)
  targetRPE        Int?            // 1-10 rate of perceived exertion
  restAfter        Int?            // Seconds rest after this specific set

  // Client-logged actuals (filled during session)
  actualReps       Int?
  actualWeight     Float?
  actualDuration   Int?
  actualRPE        Int?
  completedAt      DateTime?
}

// ============================================================
// SESSIONS & SCHEDULING (Calendar-based)
// ============================================================

model WorkoutSessionV2 {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  workoutId      String    @db.ObjectId
  workout        Workout   @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  patientId      String    @db.ObjectId
  patient        User      @relation("SessionsV2", fields: [patientId], references: [id])
  scheduledDate  DateTime
  startedAt      DateTime?
  completedAt    DateTime?
  status         String    @default("SCHEDULED")  // SCHEDULED, IN_PROGRESS, COMPLETED, MISSED, SKIPPED
  overallRPE     Int?
  overallNotes   String?
  durationMinutes Int?     // Actual workout duration
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  exerciseLogs   SessionExerciseLog[]
  feedback       SessionFeedback[]
}

model SessionExerciseLog {
  id               String           @id @default(auto()) @map("_id") @db.ObjectId
  sessionId        String           @db.ObjectId
  session          WorkoutSessionV2 @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  blockExerciseId  String           @db.ObjectId
  orderIndex       Int
  status           String           @default("PENDING") // PENDING, COMPLETED, SKIPPED
  completedAt      DateTime?

  setLogs          SetLog[]
}

model SetLog {
  id                    String             @id @default(auto()) @map("_id") @db.ObjectId
  sessionExerciseLogId  String             @db.ObjectId
  sessionExerciseLog    SessionExerciseLog @relation(fields: [sessionExerciseLogId], references: [id], onDelete: Cascade)
  setIndex              Int
  actualReps            Int?
  actualWeight          Float?
  actualDuration        Int?
  actualRPE             Int?
  completedAt           DateTime?
  notes                 String?
}

model SessionFeedback {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  sessionId       String           @db.ObjectId
  session         WorkoutSessionV2 @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  patientId       String           @db.ObjectId
  rating          FeedbackRating
  comment         String?
  clinicianResponse String?
  respondedAt     DateTime?
  createdAt       DateTime         @default(now())
}

// ============================================================
// CHECK-INS
// ============================================================

model CheckInTemplate {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId   String   @db.ObjectId
  clinician     User     @relation("CheckInTemplatesCreated", fields: [clinicianId], references: [id])
  name          String                     // "Weekly Wellness Check", "Recovery Questionnaire"
  description   String?
  frequency     String   @default("WEEKLY") // DAILY, WEEKLY, BIWEEKLY, MONTHLY, CUSTOM
  customDays    Int?                        // If CUSTOM: every N days
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  questions     CheckInQuestion[]
  assignments   CheckInAssignment[]
}

model CheckInQuestion {
  id           String           @id @default(auto()) @map("_id") @db.ObjectId
  templateId   String           @db.ObjectId
  template     CheckInTemplate  @relation(fields: [templateId], references: [id], onDelete: Cascade)
  orderIndex   Int
  questionText String
  questionType String           // SCALE_1_10, TEXT, YES_NO, MULTIPLE_CHOICE
  options      String[]         // For MULTIPLE_CHOICE: the available options
  isRequired   Boolean          @default(true)
}

model CheckInAssignment {
  id           String           @id @default(auto()) @map("_id") @db.ObjectId
  templateId   String           @db.ObjectId
  template     CheckInTemplate  @relation(fields: [templateId], references: [id], onDelete: Cascade)
  patientId    String           @db.ObjectId
  patient      User             @relation("CheckInAssignments", fields: [patientId], references: [id])
  clinicianId  String           @db.ObjectId
  startDate    DateTime
  endDate      DateTime?
  isActive     Boolean          @default(true)
  nextDueDate  DateTime
  createdAt    DateTime         @default(now())

  responses    CheckInResponse[]
}

model CheckInResponse {
  id            String             @id @default(auto()) @map("_id") @db.ObjectId
  assignmentId  String             @db.ObjectId
  assignment    CheckInAssignment  @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  patientId     String             @db.ObjectId
  patient       User               @relation("CheckInResponses", fields: [patientId], references: [id])
  submittedAt   DateTime           @default(now())
  answers       Json               // Array of { questionId, value } -- flexible for all question types
  aiSummary     String?            // AI-generated summary of this response
  coachNotes    String?            // Clinician can annotate
  isReviewed    Boolean            @default(false)
  reviewedAt    DateTime?
}

// ============================================================
// BODY METRICS & PROGRESS PHOTOS
// ============================================================

model BodyMetric {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId  String   @db.ObjectId
  patient    User     @relation("BodyMetrics", fields: [patientId], references: [id])
  metricType String   // WEIGHT, BODY_FAT, WAIST, HIPS, CHEST, ARM_L, ARM_R, THIGH_L, THIGH_R, CUSTOM
  value      Float
  unit       String   // kg, lbs, cm, in, %
  notes      String?
  recordedAt DateTime @default(now())
}

model ProgressPhoto {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId  String   @db.ObjectId
  patient    User     @relation("ProgressPhotos", fields: [patientId], references: [id])
  imageUrl   String                       // Uploadthing URL
  angle      String?                      // FRONT, SIDE_LEFT, SIDE_RIGHT, BACK
  notes      String?
  isPrivate  Boolean  @default(true)      // Only visible to patient + their clinician
  recordedAt DateTime @default(now())
}

// ============================================================
// HABIT TRACKING
// ============================================================

model HabitDefinition {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId     String   @db.ObjectId
  patient       User     @relation("Habits", fields: [patientId], references: [id])
  clinicianId   String?  @db.ObjectId  // Null if patient-created
  name          String                 // "Drink 8 glasses of water", "Sleep 8 hours"
  icon          String?                // Lucide icon name
  targetValue   Float?                 // e.g., 8 (glasses), 10000 (steps)
  unit          String?                // "glasses", "steps", "hours"
  frequency     String   @default("DAILY") // DAILY, WEEKLY
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  logs          HabitLog[]
}

model HabitLog {
  id           String          @id @default(auto()) @map("_id") @db.ObjectId
  habitId      String          @db.ObjectId
  habit        HabitDefinition @relation(fields: [habitId], references: [id], onDelete: Cascade)
  date         DateTime                   // Date of the log entry (date only, no time)
  value        Float           @default(1) // 1 = done (boolean habit), or actual value
  completed    Boolean         @default(false)
  notes        String?
  createdAt    DateTime        @default(now())

  @@unique([habitId, date])              // One log per habit per day
}

// ============================================================
// NUTRITION LOGGING
// ============================================================

model NutritionTarget {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId   String   @unique @db.ObjectId
  patient     User     @relation("NutritionTarget", fields: [patientId], references: [id])
  calories    Int?
  proteinG    Int?
  carbsG      Int?
  fatG        Int?
  fiberG      Int?
  waterMl     Int?
  updatedAt   DateTime @updatedAt
}

model NutritionLog {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId   String   @db.ObjectId
  patient     User     @relation("NutritionLogs", fields: [patientId], references: [id])
  date        DateTime                    // Date of this log
  mealType    String                      // BREAKFAST, LUNCH, DINNER, SNACK
  description String                      // Free text: "Grilled chicken with rice"
  calories    Int?
  proteinG    Float?
  carbsG      Float?
  fatG        Float?
  photoUrl    String?                     // Optional meal photo via Uploadthing
  createdAt   DateTime @default(now())
}

// ============================================================
// NOTIFICATIONS
// ============================================================

model Notification {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String   @db.ObjectId
  user        User     @relation("Notifications", fields: [userId], references: [id])
  type        String                      // See NotificationType enum
  title       String
  body        String?
  link        String?                     // In-app route to navigate to
  isRead      Boolean  @default(false)
  metadata    Json?                       // Flexible payload (e.g., { sessionId, patientName })
  createdAt   DateTime @default(now())
}

// ============================================================
// BILLING & SUBSCRIPTIONS
// ============================================================

model CoachPackage {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId     String   @db.ObjectId
  clinician       User     @relation("Packages", fields: [clinicianId], references: [id])
  name            String                   // "Monthly Coaching", "12-Week Transformation"
  description     String?
  priceInCents    Int                      // Store as cents to avoid floating point
  currency        String   @default("usd")
  intervalMonths  Int      @default(1)     // Billing cycle: 1 = monthly, 3 = quarterly, 12 = annual
  isActive        Boolean  @default(true)
  stripePriceId   String?                  // Synced Stripe Price ID
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  subscriptions   ClientSubscription[]
}

model ClientSubscription {
  id                 String   @id @default(auto()) @map("_id") @db.ObjectId
  packageId          String   @db.ObjectId
  package            CoachPackage @relation(fields: [packageId], references: [id])
  patientId          String   @db.ObjectId
  patient            User     @relation("Subscriptions", fields: [patientId], references: [id])
  clinicianId        String   @db.ObjectId
  status             String   @default("ACTIVE") // See SubscriptionStatus enum
  stripeSubscriptionId String?
  stripeCustomerId   String?
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelledAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  invoices           Invoice[]
}

model Invoice {
  id               String             @id @default(auto()) @map("_id") @db.ObjectId
  subscriptionId   String             @db.ObjectId
  subscription     ClientSubscription @relation(fields: [subscriptionId], references: [id])
  amountInCents    Int
  currency         String             @default("usd")
  status           String             @default("DRAFT") // See InvoiceStatus enum
  stripeInvoiceId  String?
  paidAt           DateTime?
  dueDate          DateTime
  createdAt        DateTime           @default(now())
}

// ============================================================
// COACH BRANDING (extends ClinicProfile)
// ============================================================

model CoachBranding {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId     String   @unique @db.ObjectId
  clinician       User     @relation("Branding", fields: [clinicianId], references: [id])
  primaryColor    String   @default("#2563eb")   // Hex color
  accentColor     String   @default("#f59e0b")
  fontFamily      String   @default("Inter")
  logoUrl         String?
  faviconUrl      String?
  welcomeMessage  String?                        // Shown to clients on their portal
  customDomain    String?                        // Future: custom subdomain
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### User Model Relation Additions

The `User` model requires these additional relation fields:

```prisma
model User {
  // ... existing fields ...

  // New relations
  programsCreated        Program[]             @relation("ProgramsCreated")
  programsAssigned       Program[]             @relation("ProgramsAssigned")
  sessionsV2             WorkoutSessionV2[]    @relation("SessionsV2")
  checkInTemplates       CheckInTemplate[]     @relation("CheckInTemplatesCreated")
  checkInAssignments     CheckInAssignment[]   @relation("CheckInAssignments")
  checkInResponses       CheckInResponse[]     @relation("CheckInResponses")
  bodyMetrics            BodyMetric[]          @relation("BodyMetrics")
  progressPhotos         ProgressPhoto[]       @relation("ProgressPhotos")
  habits                 HabitDefinition[]     @relation("Habits")
  nutritionTarget        NutritionTarget?      @relation("NutritionTarget")
  nutritionLogs          NutritionLog[]        @relation("NutritionLogs")
  notifications          Notification[]        @relation("Notifications")
  packages               CoachPackage[]        @relation("Packages")
  subscriptions          ClientSubscription[]  @relation("Subscriptions")
  branding               CoachBranding?        @relation("Branding")
}
```

### Exercise Model Addition

```prisma
model Exercise {
  // ... existing fields ...

  blockExercisesV2  BlockExerciseV2[]  @relation("BlockExercisesV2")
}
```

### Migration Strategy (Old to New)

The existing `WorkoutPlan`, `PlanExercise`, `WorkoutBlock`, `BlockExercise`, `WorkoutSession`, and `SessionExercise` models are **not deleted immediately**. Instead:

1. **Phase 1:** Add all new models alongside existing ones. The V2 suffix disambiguates during transition.
2. **Phase 1:** Write a one-time migration script (`lib/db/seed/migrate-to-v2.ts`) that:
   - Reads each `WorkoutPlan` and creates a corresponding `Program`.
   - For plans with `PlanExercise` entries, creates a single `Workout` per unique `dayOfWeek`, a single `NORMAL` block per workout, and maps exercises into `BlockExerciseV2` with `ExerciseSet` records derived from the existing `sets`/`reps`.
   - Maps existing `WorkoutSession` records to `WorkoutSessionV2`.
3. **Phase 2:** Once all features reference the new models, mark old models as `@@map("_deprecated_workout_plan")` and stop querying them.
4. **Phase 3:** Drop deprecated collections via a cleanup script after verifying no references remain.

### Indexing Strategy

```prisma
// Add to WorkoutSessionV2
@@index([patientId, scheduledDate])
@@index([status])

// Add to Program
@@index([clinicianId, isTemplate])
@@index([patientId, status])

// Add to CheckInResponse
@@index([patientId, submittedAt])

// Add to BodyMetric
@@index([patientId, metricType, recordedAt])

// Add to HabitLog
@@index([habitId, date])

// Add to NutritionLog
@@index([patientId, date])

// Add to Notification
@@index([userId, isRead, createdAt])

// Add to ClientSubscription
@@index([clinicianId, status])
@@index([patientId])
```

---

## 3. Phased Execution Roadmap

### Phase 1: Core Calendar + Program Builder (MVP Parity)

**Duration:** 4-5 weeks
**Goal:** Wire the ProgramBuilder to the database, implement the hierarchical workout model, and deliver calendar-based scheduling with drag-from-sidebar.

| Task | Description | Complexity | Dependencies |
|------|-------------|------------|--------------|
| 1.1 | Add `Program`, `Workout`, `WorkoutBlockV2`, `BlockExerciseV2`, `ExerciseSet` models to Prisma schema. Run `prisma db push`. | Medium | None |
| 1.2 | Write migration script to convert existing `WorkoutPlan` data into `Program` + `Workout` hierarchy. | Medium | 1.1 |
| 1.3 | Create `lib/services/program.service.ts` with full CRUD: create program, add/remove workouts, add/remove blocks, add/remove exercises, add/remove sets. All operations return the full nested tree. | High | 1.1 |
| 1.4 | Create `actions/program-actions.ts` server actions wrapping the service layer. Include `createProgram`, `updateProgram`, `deleteProgram`, `cloneTemplateToPatient`, `addWorkout`, `removeWorkout`, `addBlock`, `removeBlock`, `reorderBlocks`, `addExerciseToBlock`, `removeExerciseFromBlock`, `reorderExercisesInBlock`, `updateSet`. | High | 1.3 |
| 1.5 | Create `lib/validators/program.ts` Zod schemas for all program-related mutations. | Medium | 1.4 |
| 1.6 | Build `/programs` page -- list templates with search/filter by tags, body region, duration. | Medium | 1.4 |
| 1.7 | Build `/programs/new` page -- create template from scratch. | Medium | 1.6 |
| 1.8 | Build `/programs/[id]` page -- view program detail with full hierarchy. | Medium | 1.6 |
| 1.9 | Build `/programs/[id]/edit` page -- integrate the existing ProgramBuilder component, wire to DB via server actions. Add block type selector (NORMAL, SUPERSET, CIRCUIT, AMRAP, EMOM). Add inline set editing (reps, weight, duration, RPE, rest). | High | 1.6, 1.4 |
| 1.10 | Refactor ProgramBuilder component to accept `onSave`, `onBlockAdd`, `onExerciseAdd`, `onSetUpdate` callbacks that call server actions. Add block type badges, circuit round config, AMRAP time cap input. | High | 1.9 |
| 1.11 | Build "Assign Program" dialog: select patient, choose start date, deep-copy template into patient-specific program with sessions auto-generated on correct dates. | High | 1.4 |
| 1.12 | Add `WorkoutSessionV2` model. Create `lib/services/session.service.ts` with schedule, reschedule, cancel. | Medium | 1.1 |
| 1.13 | Refactor `WorkoutCalendar` component to support drag-from-sidebar. Add a workout sidebar panel listing unscheduled workouts. Use `@dnd-kit/core` with droppable calendar date cells. On drop, create a `WorkoutSessionV2` record. | High | 1.12 |
| 1.14 | Add color-coded session status to calendar events: blue=SCHEDULED, green=COMPLETED, red=MISSED, gray=SKIPPED. | Low | 1.13 |
| 1.15 | Update clinician dashboard to show active programs per patient, last activity, compliance %. | Medium | 1.12 |

**Deliverables:**
- `/programs` route with full template CRUD
- ProgramBuilder connected to database with hierarchical blocks and sets
- Calendar with drag-from-sidebar scheduling
- Template-to-patient assignment with date mapping
- Data migration from old WorkoutPlan structure

---

### Phase 2: Enhanced Client Portal + Session Logging

**Duration:** 3-4 weeks
**Goal:** Build a mobile-optimized client experience where patients can view their calendar, tap into workouts, and log sets/reps/weight/RPE in real time.

| Task | Description | Complexity | Dependencies |
|------|-------------|------------|--------------|
| 2.1 | Create `app/(client)/` route group with a client-specific layout (simplified nav, mobile-first). | Medium | Phase 1 |
| 2.2 | Build client calendar page (`/client/calendar`) -- month/week view showing scheduled sessions with color-coded status. Tap a day to see workouts. | Medium | 1.13 |
| 2.3 | Build client workout session page (`/client/session/[id]`) -- displays blocks and exercises in order. Each exercise shows target sets/reps/weight. Client taps each set to log actual values. | High | 2.2 |
| 2.4 | Build `SessionLogger` component -- a mobile-optimized, swipeable interface. For each exercise: show video thumbnail, exercise name, target prescription. Below: a row per set with inputs for actual reps, weight, RPE. "Complete Set" button per row. Timer for rest periods. | High | 2.3 |
| 2.5 | Create `lib/services/session-log.service.ts` -- `startSession`, `logSet`, `completeExercise`, `completeSession`. Each mutation writes to `WorkoutSessionV2`, `SessionExerciseLog`, `SetLog`. | High | 1.12 |
| 2.6 | Create `actions/session-log-actions.ts` wrapping the service. | Medium | 2.5 |
| 2.7 | Build post-workout summary screen -- shows completed/skipped exercises, total volume (sets x reps x weight), session duration, optional overall RPE and notes input. | Medium | 2.4 |
| 2.8 | Build `SessionFeedback` inline component -- after session completion, prompt for overall rating (FeedbackRating enum) and optional comment. | Low | 2.7 |
| 2.9 | Build client dashboard (`/client/dashboard`) -- today's workout card, streak counter, upcoming sessions list, recent messages. | Medium | 2.2 |
| 2.10 | Implement streak tracking logic in `session-log.service.ts` -- count consecutive days with at least one COMPLETED session. Store as computed value, not a separate model. | Medium | 2.5 |
| 2.11 | Add exercise video inline display in session logger -- tap exercise name to expand and show `UniversalVideoPlayer` with the exercise video. | Low | 2.4 |

**Deliverables:**
- Client-facing route group with mobile-optimized layout
- Calendar view for patients
- Full session logging with set-level granularity
- Post-workout summary and feedback
- Streak tracking
- Client dashboard

---

### Phase 3: Progress Tracking + Check-ins + Habits

**Duration:** 3-4 weeks
**Goal:** Implement the full progress tracking suite (body metrics, photos, check-ins, habits) that differentiates a coaching platform from a simple workout tracker.

| Task | Description | Complexity | Dependencies |
|------|-------------|------------|--------------|
| 3.1 | Add `BodyMetric`, `ProgressPhoto` models to schema. Push. | Low | None |
| 3.2 | Create `lib/services/body-metrics.service.ts` -- CRUD for body metrics, grouped by type, with time-series query support. | Medium | 3.1 |
| 3.3 | Build `/client/progress` page -- tabs for Weight, Measurements, Photos. Each tab shows a Recharts line chart over time + data entry form. | Medium | 3.2 |
| 3.4 | Build progress photo upload via Uploadthing -- client uploads from mobile camera. Photos stored with angle tag (FRONT, SIDE, BACK). Side-by-side comparison view with date picker. | Medium | 3.3 |
| 3.5 | Build `/patients/[id]/progress` page for clinicians -- view patient's body metrics charts and progress photos. Read-only with annotation ability. | Medium | 3.2 |
| 3.6 | Add `CheckInTemplate`, `CheckInQuestion`, `CheckInAssignment`, `CheckInResponse` models. Push. | Low | None |
| 3.7 | Create `lib/services/checkin.service.ts` -- template CRUD, assignment management, response submission, AI summary generation. | High | 3.6 |
| 3.8 | Build `/settings/check-ins` page for clinicians -- create/edit check-in templates. Drag-to-reorder questions. Question types: SCALE_1_10, TEXT, YES_NO, MULTIPLE_CHOICE. | Medium | 3.7 |
| 3.9 | Build "Assign Check-in" dialog -- select template, select patient, set frequency and start date. Creates `CheckInAssignment` with computed `nextDueDate`. | Medium | 3.7 |
| 3.10 | Build `/client/check-in/[assignmentId]` page -- renders questions based on template, client fills in answers, submits. | Medium | 3.7 |
| 3.11 | Build `/patients/[id]/check-ins` page for clinicians -- list of submitted responses with review status. Click to expand full response with AI summary. Coach can add notes. | Medium | 3.7 |
| 3.12 | Add `HabitDefinition`, `HabitLog` models. Push. | Low | None |
| 3.13 | Create `lib/services/habit.service.ts` -- CRUD habits, log daily, streak calculation. | Medium | 3.12 |
| 3.14 | Build `/client/habits` page -- daily habit checklist, tap to toggle completion, streak badges. Coach can also define habits for patients. | Medium | 3.13 |
| 3.15 | Build habit streak widget for client dashboard -- shows current streak per habit, weekly completion grid (GitHub contribution graph style). | Low | 3.14 |

**Deliverables:**
- Body weight and measurement tracking with charts
- Progress photo upload and comparison
- Check-in template builder for coaches
- Client check-in submission flow
- Coach check-in review dashboard with AI summaries
- Habit tracking with streaks

---

### Phase 4: Nutrition + Body Metrics Dashboard + Analytics

**Duration:** 3 weeks
**Goal:** Add basic nutrition logging and build comprehensive analytics dashboards for both coaches and clients.

| Task | Description | Complexity | Dependencies |
|------|-------------|------------|--------------|
| 4.1 | Add `NutritionTarget`, `NutritionLog` models. Push. | Low | None |
| 4.2 | Create `lib/services/nutrition.service.ts` -- set targets, log meals, daily totals aggregation, weekly averages. | Medium | 4.1 |
| 4.3 | Build `/client/nutrition` page -- daily view with meal logging form (description, calories, macros). Running total bar showing progress toward daily targets. | Medium | 4.2 |
| 4.4 | Build `/client/nutrition/targets` page -- set daily macro and calorie goals. Clinician can also set these for patients. | Low | 4.2 |
| 4.5 | Build `/patients/[id]/nutrition` page for clinicians -- view client's daily/weekly nutrition adherence charts. | Medium | 4.2 |
| 4.6 | Build `/analytics` page (clinician) with tabs: | High | Phase 2, 3 |
| 4.6a | -- **Compliance tab:** Per-client compliance rate (completed sessions / scheduled sessions), sortable table, sparkline trends. | Medium | |
| 4.6b | -- **Progress tab:** Select patient, view overlaid charts for any tracked metric (weight, measurements, pain score, check-in scores) over time. | Medium | |
| 4.6c | -- **Activity tab:** Heatmap of platform activity (sessions logged, check-ins submitted) across all clients for the past 30/90 days. | Medium | |
| 4.7 | Build `/client/analytics` page -- personal stats: total workouts, volume progression (total weight lifted over time), body metric trends, habit completion rates. | Medium | Phase 2, 3 |
| 4.8 | Implement CSV export for analytics data -- compliance reports, body metrics, session history. Use server action that generates CSV and returns as downloadable blob. | Medium | 4.6 |

**Deliverables:**
- Nutrition logging with macro tracking
- Coach analytics dashboard (compliance, progress, activity)
- Client personal analytics
- CSV export

---

### Phase 5: Billing + Coach Branding + Notifications

**Duration:** 4-5 weeks
**Goal:** Monetization infrastructure, coach branding, and real-time notification system.

| Task | Description | Complexity | Dependencies |
|------|-------------|------------|--------------|
| 5.1 | Add `CoachPackage`, `ClientSubscription`, `Invoice`, `CoachBranding`, `Notification` models. Push. | Low | None |
| 5.2 | Install `stripe` npm package. Create `lib/services/stripe.service.ts` -- account creation (Stripe Connect Standard), product/price sync, subscription management, webhook handling. | High | 5.1 |
| 5.3 | Create `app/api/webhooks/stripe/route.ts` -- handle `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Svix can verify webhook signatures. | High | 5.2 |
| 5.4 | Build `/settings/billing` page for clinicians -- CRUD pricing packages, view active subscriptions, revenue summary. | Medium | 5.2 |
| 5.5 | Build "Subscribe" flow for patients -- `/client/billing` shows available packages from their coach, initiates Stripe Checkout session, handles redirect. | Medium | 5.2 |
| 5.6 | Build `/settings/billing/invoices` page -- list invoices with status, link to Stripe hosted invoice page. | Low | 5.3 |
| 5.7 | Create `lib/services/notification.service.ts` -- `createNotification`, `markAsRead`, `getUnreadCount`, `getNotificationsForUser` (paginated). | Medium | 5.1 |
| 5.8 | Build `NotificationBell` component in header -- shows unread count badge, dropdown with recent notifications, "Mark all read" action, link to `/notifications`. | Medium | 5.7 |
| 5.9 | Build `/notifications` page -- full notification history with filters by type. | Low | 5.7 |
| 5.10 | Integrate notification triggers into existing flows: session assigned (from 1.11), message received (existing message actions), check-in due (cron job), check-in submitted (from 3.10), payment events (from 5.3). | High | 5.7, all prior phases |
| 5.11 | Create email notification layer using Resend -- for critical notifications (workout assigned, payment failed, check-in due). Use `lib/services/email.service.ts` with templates. | Medium | 5.10 |
| 5.12 | Add `CoachBranding` model. Build `/settings/branding` page -- upload logo, set primary/accent colors, set welcome message. | Medium | 5.1 |
| 5.13 | Apply coach branding to client portal -- inject custom CSS variables based on the patient's linked clinician's branding settings. Use a server component that reads branding and passes as CSS custom properties. | Medium | 5.12 |
| 5.14 | Build `/settings/billing/revenue` page -- monthly revenue chart (Recharts), total active subscribers, MRR calculation, churn rate. | Medium | 5.3 |
| 5.15 | Implement cron-based jobs for: marking overdue sessions as MISSED (daily), sending check-in reminders (daily), sending payment reminders (3 days before due). Use Vercel Cron or an API route triggered by external cron. | High | 5.10 |

**Deliverables:**
- Stripe integration with Stripe Connect for coach payments
- Package creation and subscription management
- Invoice tracking
- In-app + email notification system
- Coach branding applied to client portal
- Revenue analytics
- Automated cron jobs for reminders and status updates

---

## 4. New App Routes

### Clinician-Facing Routes (within `(platform)` group)

| Route | Purpose | Phase |
|-------|---------|-------|
| `/programs` | List all program templates with search/filter | 1 |
| `/programs/new` | Create new program template | 1 |
| `/programs/[id]` | View program detail (full hierarchy) | 1 |
| `/programs/[id]/edit` | Edit program with ProgramBuilder | 1 |
| `/patients/[id]/progress` | View patient body metrics, photos | 3 |
| `/patients/[id]/check-ins` | Review patient check-in responses | 3 |
| `/patients/[id]/nutrition` | View patient nutrition logs | 4 |
| `/patients/[id]/calendar` | View/manage patient's workout calendar | 1 |
| `/settings/check-ins` | Manage check-in templates | 3 |
| `/settings/billing` | Manage pricing packages, subscriptions | 5 |
| `/settings/billing/invoices` | View all invoices | 5 |
| `/settings/billing/revenue` | Revenue analytics dashboard | 5 |
| `/settings/branding` | Coach branding customization | 5 |
| `/analytics` | Comprehensive analytics dashboard | 4 |
| `/notifications` | Full notification history | 5 |

### Client-Facing Routes (within `(client)` group)

| Route | Purpose | Phase |
|-------|---------|-------|
| `/client/dashboard` | Client home: today's workout, streaks, messages | 2 |
| `/client/calendar` | Monthly/weekly view of scheduled workouts | 2 |
| `/client/session/[id]` | Active workout session with set logging | 2 |
| `/client/progress` | Body metrics, measurements, progress photos | 3 |
| `/client/check-in/[assignmentId]` | Submit check-in questionnaire | 3 |
| `/client/habits` | Daily habit tracker | 3 |
| `/client/nutrition` | Daily nutrition logging | 4 |
| `/client/nutrition/targets` | View/set nutrition targets | 4 |
| `/client/analytics` | Personal stats and trends | 4 |
| `/client/billing` | View subscription, make payments | 5 |

### API Routes

| Route | Purpose | Phase |
|-------|---------|-------|
| `api/ai/generate-program` | Already exists -- extend to output V2 hierarchy | 1 |
| `api/ai/analyze-checkin` | AI analysis of check-in responses | 3 |
| `api/ai/exercise-recommendation` | AI exercise recommendations based on patient profile | 1 |
| `api/webhooks/stripe` | Stripe webhook handler | 5 |
| `api/cron/session-status` | Mark overdue sessions as MISSED | 5 |
| `api/cron/checkin-reminders` | Send check-in due reminders | 5 |
| `api/cron/payment-reminders` | Send payment due reminders | 5 |

---

## 5. Component Architecture

### Phase 1 Components

#### `ProgramBuilder` (refactored)
```typescript
interface ProgramBuilderProps {
  programId: string;
  initialData: ProgramWithFullHierarchy; // Program + Workouts + Blocks + Exercises + Sets
  exerciseLibrary: ExerciseSummary[];    // For the exercise picker
  onSave: () => void;                   // Refresh after mutation
  readOnly?: boolean;
}
```
**Responsibility:** Full hierarchical CRUD for a program. Renders workout tabs, block cards with type badges, sortable exercise rows, inline set editing grid. All mutations fire server actions.

#### `WorkoutBlockCard`
```typescript
interface WorkoutBlockCardProps {
  block: BlockWithExercises;
  onTypeChange: (type: BlockType) => void;
  onAddExercise: () => void;
  onRemoveBlock: () => void;
  onReorder: (exerciseIds: string[]) => void;
}
```
**Responsibility:** Renders a single block with its type indicator, exercise list, and configuration (rounds for circuits, time cap for AMRAP).

#### `ExerciseSetGrid`
```typescript
interface ExerciseSetGridProps {
  sets: ExerciseSet[];
  onUpdateSet: (setId: string, data: Partial<ExerciseSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  readOnly?: boolean;
}
```
**Responsibility:** Inline spreadsheet-like grid for editing sets. Columns: Set #, Reps, Weight, Duration, RPE, Rest. Auto-duplicates last row values when adding new set.

#### `CalendarWithSidebar`
```typescript
interface CalendarWithSidebarProps {
  patientId: string;
  sessions: WorkoutSessionV2[];
  unscheduledWorkouts: Workout[];      // From assigned programs without sessions
  onSchedule: (workoutId: string, date: Date) => void;
  onReschedule: (sessionId: string, newDate: Date) => void;
  isClinician: boolean;
}
```
**Responsibility:** Wraps `react-big-calendar` with a droppable sidebar. Sidebar lists unscheduled workouts as draggable cards. Calendar date cells are drop targets. Handles both scheduling and rescheduling.

#### `AssignProgramDialog`
```typescript
interface AssignProgramDialogProps {
  templateId: string;
  templateName: string;
  patients: PatientSummary[];
  onAssign: (patientId: string, startDate: Date) => void;
}
```
**Responsibility:** Modal for selecting a patient and start date. Previews the generated calendar before confirming.

#### `ExercisePicker`
```typescript
interface ExercisePickerProps {
  onSelect: (exercise: ExerciseSummary) => void;
  filters?: { bodyRegion?: BodyRegion; difficulty?: DifficultyLevel };
  excludeIds?: string[];  // Already in the block
}
```
**Responsibility:** Searchable exercise library dialog with filters by body region, equipment, difficulty. Shows video thumbnail, name, target muscles. Used inside ProgramBuilder and AI generation review.

### Phase 2 Components

#### `SessionLogger`
```typescript
interface SessionLoggerProps {
  session: WorkoutSessionV2WithFullHierarchy;
  onLogSet: (logId: string, setIndex: number, data: SetLogInput) => void;
  onCompleteExercise: (logId: string) => void;
  onCompleteSession: (overallRPE?: number, notes?: string) => void;
}
```
**Responsibility:** Mobile-optimized workout execution screen. Displays exercises sequentially with expandable set logging rows. Shows rest timer between sets. Tracks session duration. Persists state on each set completion (no data loss on app close).

#### `WorkoutSummaryCard`
```typescript
interface WorkoutSummaryCardProps {
  session: CompletedSessionSummary;
  // CompletedSessionSummary includes: totalSets, totalReps, totalVolume, duration, completionRate
}
```
**Responsibility:** Post-workout summary showing key stats. Used on client dashboard and in clinician's patient view.

#### `StreakBadge`
```typescript
interface StreakBadgeProps {
  currentStreak: number;
  longestStreak: number;
}
```
**Responsibility:** Visual streak display with flame icon, current count, and personal best.

### Phase 3 Components

#### `BodyMetricChart`
```typescript
interface BodyMetricChartProps {
  data: { date: string; value: number }[];
  metricType: string;
  unit: string;
  targetValue?: number;
}
```
**Responsibility:** Recharts line chart with optional target line. Used for weight, measurements, and custom metrics.

#### `ProgressPhotoCompare`
```typescript
interface ProgressPhotoCompareProps {
  photos: ProgressPhoto[];
  // Renders date picker to select two dates, shows side-by-side with same angle
}
```

#### `CheckInForm`
```typescript
interface CheckInFormProps {
  questions: CheckInQuestion[];
  onSubmit: (answers: { questionId: string; value: string | number }[]) => void;
}
```
**Responsibility:** Renders check-in questions dynamically based on type (slider for SCALE_1_10, textarea for TEXT, radio for YES_NO/MULTIPLE_CHOICE).

#### `HabitTracker`
```typescript
interface HabitTrackerProps {
  habits: HabitWithTodayLog[];
  onToggle: (habitId: string, value: number) => void;
}
```
**Responsibility:** Daily checklist with completion state, streak count per habit, and a weekly heatmap grid.

### Phase 5 Components

#### `NotificationBell`
```typescript
interface NotificationBellProps {
  // No props -- fetches own data via server action on mount and via polling/SSE
}
```
**Responsibility:** Header icon with unread count badge. Dropdown with recent notifications. Each notification links to relevant page.

#### `PricingPackageForm`
```typescript
interface PricingPackageFormProps {
  existingPackage?: CoachPackage;
  onSave: (data: PackageInput) => void;
}
```

---

## 6. AI Integration Strategy

### A. Program Generation (Enhanced)

**Current State:** Two disconnected implementations -- `lib/services/ai.service.ts` (OpenAI GPT-4o, flat exercise list output) and `app/api/ai/generate-program/route.ts` (Anthropic Claude Haiku via Vercel AI SDK `streamObject`, block-aware but minimal context).

**Target State:** A single, unified AI generation pipeline using Vercel AI SDK with Anthropic Claude (specifically `claude-sonnet-4-20250514` for the balance of quality and speed), outputting the full V2 hierarchy, with streaming preview in the UI.

**Implementation Plan:**

1. **Consolidate to one route:** `app/api/ai/generate-program/route.ts`. Remove the OpenAI dependency from `ai.service.ts` for generation (keep it if used elsewhere, but the generation path uses Anthropic exclusively).

2. **Enhanced Zod schema for structured output:**

```typescript
const exerciseSetSchema = z.object({
  targetReps: z.number().optional(),
  targetWeight: z.number().optional(),
  targetDuration: z.number().optional(),
  targetRPE: z.number().min(1).max(10).optional(),
  restAfter: z.number().optional(),
});

const blockExerciseSchema = z.object({
  exerciseId: z.string(),
  notes: z.string().optional(),
  sets: z.array(exerciseSetSchema),
});

const workoutBlockSchema = z.object({
  name: z.string(),
  type: z.enum(["NORMAL", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"]),
  rounds: z.number().default(1),
  timeCap: z.number().optional(),
  exercises: z.array(blockExerciseSchema),
});

const workoutSchema = z.object({
  name: z.string(),
  dayIndex: z.number(),
  weekIndex: z.number(),
  blocks: z.array(workoutBlockSchema),
});

const programSchema = z.object({
  name: z.string(),
  description: z.string(),
  workouts: z.array(workoutSchema),
});
```

3. **Context injection:** Fetch the patient profile (full `PatientProfile` with all fields), their clinician's exercise library (filtered by equipment match and contraindication exclusion as in the current `ai.service.ts`), and send as structured context. Limit to 80 exercises max to stay within token budget.

4. **Prompt strategy:**
   - **System prompt:** Evidence-based rehabilitation specialist persona with strict rules (phase ordering, contraindication compliance, equipment compliance, volume scaling, variety enforcement). Retain the excellent clinical rules from the current `ai.service.ts` system prompt.
   - **User prompt:** Patient context block + program parameters + exercise catalog with IDs. Explicitly state: "Output must reference ONLY exercise IDs from the provided catalog."
   - **Post-processing:** Validate all `exerciseId` values against the catalog. Strip any that do not match. If fewer than 3 valid exercises remain, throw and prompt retry.

5. **Streaming UI:** The existing `ai-stream-preview.tsx` component consumes the stream. Extend it to render the hierarchical structure as it arrives -- show workouts as tabs, blocks as cards, exercises as rows. Once streaming completes, show an "Edit in Builder" button that opens the ProgramBuilder pre-populated with the AI output. A "Save as Template" button persists directly.

6. **Multi-week support:** The current implementation generates a single-week plan. Extend the prompt to accept `durationWeeks` parameter. The AI outputs workouts with both `dayIndex` and `weekIndex`. For programs longer than 2 weeks, generate weeks 1-2 in detail, then instruct the AI to provide progression notes for weeks 3+ (e.g., "increase weight by 5%", "add 1 set") to keep token usage manageable.

### B. Check-in Analysis

**Route:** `api/ai/analyze-checkin`

**Purpose:** When a client submits a check-in response, the coach can trigger an AI summary that:
- Extracts key trends (e.g., "Sleep quality decreased from 7 to 4 over the last 3 weeks")
- Flags concerns (e.g., "Pain score 8/10 -- consider program modification")
- Suggests action items (e.g., "Reduce training volume, add recovery-focused sessions")

**Implementation:**
1. On check-in submission, optionally auto-generate summary (configurable per coach).
2. Fetch the last 4 check-in responses for the same assignment to provide trend context.
3. Use `generateText` (not streaming -- summaries are short) with `claude-sonnet-4-20250514`.
4. Store the summary in `CheckInResponse.aiSummary`.
5. Prompt includes: current response answers, previous response answers with dates, patient profile, current active program name.

### C. Exercise Recommendation

**Route:** `api/ai/exercise-recommendation`

**Purpose:** Given a patient's current profile (pain, limitations, equipment, goals), suggest the top 5-10 exercises from the library that would be most appropriate, with reasoning.

**Implementation:**
1. Fetch full patient profile + exercise catalog (filtered by equipment and contraindications, same as generation).
2. Use `generateObject` with a schema: `z.array(z.object({ exerciseId: z.string(), reasoning: z.string(), priority: z.number() }))`.
3. Surface this in the ProgramBuilder as an "AI Suggest" button within a block -- adds recommended exercises directly.
4. Use `claude-haiku-4-20250514` for speed since this is a simpler task.

---

## 7. Video Strategy

### Current State

- `Exercise` model has `videoUrl` (String) and `videoProvider` (String) fields.
- `UniversalVideoPlayer` component exists at `components/exercises/universal-video-player.tsx` -- detects YouTube, Vimeo, and direct MP4 URLs using regex.
- `react-player` is installed (v3.4.0) and handles YouTube/Vimeo embeds.
- `exercise-video-player.tsx` is the older player component.
- Uploadthing is configured for file uploads.

### Target Architecture

#### Three Video Source Types

| Source | Storage | Playback | Use Case |
|--------|---------|----------|----------|
| **YouTube** | External (YouTube servers) | `react-player` with YouTube URL | Free exercises, public content coaches link to |
| **Vimeo** | External (Vimeo servers) | `react-player` with Vimeo URL | Pro coaches who host on Vimeo for privacy controls |
| **Custom Upload** | Uploadthing (utfs.io CDN) | HTML5 `<video>` tag with Uploadthing URL | Coach-created proprietary exercise demos |

#### Implementation Details

1. **Video URL Detection (already exists, verify):** `lib/utils/video.ts` should export:
   ```typescript
   export function detectVideoProvider(url: string): 'youtube' | 'vimeo' | 'uploadthing' | 'direct' | null
   ```
   - YouTube: match `youtube.com/watch`, `youtu.be/`, `youtube.com/embed`
   - Vimeo: match `vimeo.com/` (numeric ID or `/video/` path)
   - Uploadthing: match `utfs.io/` or `uploadthing.com/`
   - Direct: match `.mp4`, `.webm`, `.mov` extensions
   - The `videoProvider` field on `Exercise` is set automatically based on detection when saving.

2. **UniversalVideoPlayer (refine):**
   - Accept `url` and optional `provider` override.
   - For YouTube/Vimeo: render `<ReactPlayer>` with `controls={true}`, `width="100%"`, `height="100%"`, wrapped in a 16:9 aspect ratio container.
   - For Uploadthing/Direct: render `<video>` tag with `controls`, `preload="metadata"`, poster frame from first frame.
   - Add loading skeleton while player initializes.
   - Add error boundary with fallback message ("Video unavailable").

3. **Exercise Form Video Input:**
   - Text input field for YouTube/Vimeo URL paste.
   - "Or upload custom video" button that opens Uploadthing uploader.
   - Preview player below the input showing the current video.
   - Max upload size: 100MB (configure in Uploadthing file router).
   - Accepted formats: MP4, WebM, MOV.

4. **Video Thumbnails:**
   - YouTube: extract thumbnail via `https://img.youtube.com/vi/{VIDEO_ID}/mqdefault.jpg`.
   - Vimeo: requires an API call to `https://vimeo.com/api/oembed.json?url={URL}` to get `thumbnail_url`. Cache this in `Exercise.imageUrl` on save.
   - Uploadthing: generate a poster frame on upload or use a placeholder. Consider using the first frame via a Vercel Edge function if needed, or simply use the exercise's `imageUrl` field.

5. **Legal and Ethical Boundaries:**
   - **Do NOT scrape Vimeo or YouTube** for video content, metadata, or thumbnails beyond their public oEmbed/API endpoints.
   - **YouTube Data API v3** may be used for thumbnail retrieval and video metadata lookup (title, duration) with proper API key. The existing `yt-search` package in `package.json` is acceptable for search functionality only.
   - **Vimeo oEmbed endpoint** is public and does not require authentication for public videos.
   - Coaches are responsible for ensuring they have rights to any video they link or upload.
   - Add a disclaimer in the exercise form: "Only link videos you own or have permission to use."

6. **Video in Session Logger:**
   - In the client's session logger, exercise videos are shown as a collapsed thumbnail. Tap to expand and play.
   - Videos are NOT auto-played to save bandwidth.
   - Preload `metadata` only (not the full video) to minimize data usage on mobile.

---

## 8. Technical Risks & Mitigations

### Risk 1: MongoDB Document Size Limits on Deeply Nested Queries

**Risk:** Programs with many workouts, blocks, exercises, and sets create deeply nested queries. MongoDB's 16MB document limit could be hit when fetching a full program hierarchy in a single query.

**Likelihood:** Low (a program would need thousands of exercises to approach 16MB)
**Impact:** High (query failure breaks the entire program view)

**Mitigation:**
- Fetch hierarchy in two queries: (1) Program + Workouts + Blocks, (2) BlockExercises + Sets for the currently viewed workout only.
- Never fetch the full hierarchy for list views -- only fetch program-level metadata.
- Add pagination to the Workout level -- load one week at a time for multi-week programs.

### Risk 2: ProgramBuilder Performance with Large Programs

**Risk:** `@dnd-kit` performance degrades with 100+ sortable items in the DOM. A 4-week program with 5 days/week, 4 blocks/day, 5 exercises/block = 400 exercise rows.

**Likelihood:** Medium
**Impact:** Medium (sluggish UI, poor coach experience)

**Mitigation:**
- Virtualize exercise lists within blocks using `react-window` or `@tanstack/react-virtual` (only render visible items).
- Load one workout at a time in the builder (tabbed interface by day/week).
- Debounce drag-and-drop reorder mutations (batch reorder calls with a 500ms debounce).

### Risk 3: Data Loss During Session Logging on Mobile

**Risk:** Clients log sets during workouts on mobile. Network interruptions, app closures, or browser crashes can lose unsaved set data.

**Likelihood:** High (mobile + gym environment = frequent interruptions)
**Impact:** High (client frustration, data integrity)

**Mitigation:**
- Save each set individually on completion (fire server action per set, not per session). This is the primary persistence mechanism.
- Additionally, maintain a `localStorage` buffer of the current session state. On reconnect or page reload, reconcile local state with server state.
- Show a "Saving..." indicator with optimistic UI updates. If a set save fails, queue it for retry.
- The session page should work offline using service worker caching for the exercise data (names, videos) and queue mutations for when connectivity returns. Full PWA support is a Phase 2+ stretch goal.

### Risk 4: AI Generation Quality and Consistency

**Risk:** Claude may generate exercise IDs that do not exist in the catalog (hallucination), repeat exercises across days, or produce clinically inappropriate prescriptions.

**Likelihood:** Medium
**Impact:** High (clinical safety concern, coach trust)

**Mitigation:**
- **Post-processing validation** (already partially implemented): Strip any `exerciseId` not found in the provided catalog. Log dropped exercises for monitoring.
- **Retry logic:** If fewer than 50% of generated exercises pass validation, auto-retry once with a stronger constraint in the prompt ("You previously hallucinated exercise IDs. Use ONLY the IDs from the list.").
- **Coach review gate:** AI-generated programs are ALWAYS created in DRAFT status. They cannot be assigned to a patient until a clinician explicitly reviews and approves.
- **Duplicate detection:** Post-process to remove cross-day duplicate exercises. If removed, log and optionally surface to the coach ("2 duplicate exercises were removed -- consider adding alternatives").
- **Clinical safety disclaimer:** Display a persistent banner on AI-generated programs: "AI-generated program -- review all exercises and prescriptions before assigning."

### Risk 5: Stripe Integration Complexity with Stripe Connect

**Risk:** Stripe Connect (for coaches to receive payments) has significant complexity: onboarding flow, payout schedules, tax reporting, dispute handling, platform fees.

**Likelihood:** High (Stripe Connect is inherently complex)
**Impact:** Medium (delays Phase 5, but does not block core functionality)

**Mitigation:**
- Use **Stripe Connect Standard** (not Express or Custom) -- coaches manage their own Stripe dashboard, reducing platform liability.
- Start with a simple flow: coach creates packages, client pays via Stripe Checkout (hosted by Stripe), platform takes a flat % fee via `application_fee_percent`.
- Defer advanced billing features (proration, trials, coupons) to a post-launch iteration.
- Use Stripe's test mode exhaustively before going live. Create a `lib/services/__tests__/stripe.service.test.ts` integration test suite using Stripe's test API keys.

### Risk 6: Calendar Performance with Many Patients

**Risk:** A clinician with 100+ patients, each with 3-5 sessions/week, means the calendar could need to render 300-500 events in a month view.

**Likelihood:** Medium
**Impact:** Medium (slow render, cluttered UI)

**Mitigation:**
- The calendar always shows ONE patient at a time (never an aggregate view of all patients).
- For the clinician's "overview" dashboard, show a summary table (patient name, scheduled this week, completed, missed) rather than a calendar.
- Paginate session fetches by month. Use the `@@index([patientId, scheduledDate])` index.
- Consider lazy-loading session details (only fetch workout name + status for calendar tiles, full hierarchy on click).

### Risk 7: Mobile UX for Session Logging

**Risk:** The session logging interface requires rapid input (reps, weight) between sets in a gym environment. Small touch targets, complex forms, or slow loads will cause abandonment.

**Likelihood:** High
**Impact:** Critical (this IS the core client value proposition)

**Mitigation:**
- Design the SessionLogger as a mobile-first, single-column layout with large touch targets (minimum 44px tap targets per Apple HIG).
- Use numeric input types with `inputmode="decimal"` for weight and `inputmode="numeric"` for reps.
- Pre-fill inputs with target values -- client only needs to tap "Done" if they hit the target, or adjust the number if different.
- Minimize navigation: the session flows linearly through exercises. "Next Exercise" button advances, no need to navigate back to a list.
- Rest timer: auto-start countdown between sets with audio/vibration notification when rest is complete.
- Test on actual mobile devices in portrait orientation. Target: complete a set log in under 5 seconds.

### Risk 8: Data Model Migration from V1 to V2

**Risk:** Existing production data in `WorkoutPlan`, `PlanExercise`, `WorkoutSession`, `SessionExercise` must be migrated without data loss or downtime.

**Likelihood:** Medium (migration scripts can have edge cases)
**Impact:** High (data loss is unacceptable)

**Mitigation:**
- Run both models in parallel during Phase 1. New features write to V2 models; legacy pages continue reading V1 models.
- Migration script runs as a one-time seed script (`lib/db/seed/migrate-to-v2.ts`), not as a destructive migration.
- Migration script is idempotent -- can be run multiple times safely (uses `sourceTemplateId` or a `migratedFromId` field to track what has been migrated).
- Test migration on a database clone before running on production.
- Keep V1 models for at least 30 days after migration. Only remove after verifying all V2 data integrity.

---

## Appendix A: Development Checklist

### Phase 1: Core Calendar + Program Builder

- [ ] Add new enums (`BlockType`, `SetType`) to Prisma schema
- [ ] Add `Program`, `Workout`, `WorkoutBlockV2`, `BlockExerciseV2`, `ExerciseSet` models
- [ ] Add `WorkoutSessionV2`, `SessionExerciseLog`, `SetLog` models
- [ ] Add indexes for new models
- [ ] Run `prisma db push` and verify schema
- [ ] Write V1-to-V2 data migration script
- [ ] Create `lib/services/program.service.ts` (CRUD + deep clone)
- [ ] Create `lib/services/session-v2.service.ts` (schedule, reschedule, cancel)
- [ ] Create `lib/validators/program.ts` Zod schemas
- [ ] Create `actions/program-actions.ts` server actions
- [ ] Build `/programs` list page with search/filter
- [ ] Build `/programs/new` create page
- [ ] Build `/programs/[id]` view page
- [ ] Build `/programs/[id]/edit` page with wired ProgramBuilder
- [ ] Refactor `ProgramBuilder` to persist to DB
- [ ] Add block type selector (NORMAL, SUPERSET, CIRCUIT, AMRAP, EMOM)
- [ ] Add inline set editing grid
- [ ] Build `ExercisePicker` dialog component
- [ ] Build `AssignProgramDialog` with deep-copy and date mapping
- [ ] Refactor `WorkoutCalendar` with drag-from-sidebar
- [ ] Add color-coded session status to calendar events
- [ ] Update clinician dashboard (active programs, compliance %)
- [ ] Add sidebar navigation links for `/programs`

### Phase 2: Enhanced Client Portal

- [ ] Create `app/(client)/layout.tsx` with mobile-first nav
- [ ] Build `/client/dashboard` page
- [ ] Build `/client/calendar` page
- [ ] Build `/client/session/[id]` page
- [ ] Build `SessionLogger` component (mobile-optimized)
- [ ] Create `lib/services/session-log.service.ts`
- [ ] Create `actions/session-log-actions.ts`
- [ ] Build post-workout summary screen
- [ ] Build `SessionFeedback` component
- [ ] Implement streak tracking logic
- [ ] Add exercise video inline display in session logger
- [ ] Test on mobile devices (iOS Safari, Android Chrome)

### Phase 3: Progress Tracking + Check-ins + Habits

- [ ] Add `BodyMetric`, `ProgressPhoto` models
- [ ] Add `CheckInTemplate`, `CheckInQuestion`, `CheckInAssignment`, `CheckInResponse` models
- [ ] Add `HabitDefinition`, `HabitLog` models
- [ ] Create `lib/services/body-metrics.service.ts`
- [ ] Create `lib/services/checkin.service.ts`
- [ ] Create `lib/services/habit.service.ts`
- [ ] Build `/client/progress` page (metrics + photos)
- [ ] Build `/patients/[id]/progress` page
- [ ] Build `/settings/check-ins` template builder
- [ ] Build assign check-in dialog
- [ ] Build `/client/check-in/[assignmentId]` page
- [ ] Build `/patients/[id]/check-ins` review page
- [ ] Integrate AI check-in analysis (`api/ai/analyze-checkin`)
- [ ] Build `/client/habits` page
- [ ] Build habit streak widget

### Phase 4: Nutrition + Analytics

- [ ] Add `NutritionTarget`, `NutritionLog` models
- [ ] Create `lib/services/nutrition.service.ts`
- [ ] Build `/client/nutrition` page
- [ ] Build `/client/nutrition/targets` page
- [ ] Build `/patients/[id]/nutrition` page
- [ ] Build `/analytics` dashboard (compliance, progress, activity tabs)
- [ ] Build `/client/analytics` personal stats page
- [ ] Implement CSV export for reports

### Phase 5: Billing + Branding + Notifications

- [ ] Install `stripe` package
- [ ] Add `CoachPackage`, `ClientSubscription`, `Invoice` models
- [ ] Add `CoachBranding`, `Notification` models
- [ ] Create `lib/services/stripe.service.ts`
- [ ] Create `app/api/webhooks/stripe/route.ts`
- [ ] Create `lib/services/notification.service.ts`
- [ ] Create `lib/services/email.service.ts` (Resend templates)
- [ ] Build `/settings/billing` page
- [ ] Build `/client/billing` page
- [ ] Build `/settings/billing/invoices` page
- [ ] Build `/settings/billing/revenue` page
- [ ] Build `NotificationBell` component
- [ ] Build `/notifications` page
- [ ] Integrate notification triggers across all features
- [ ] Build `/settings/branding` page
- [ ] Apply coach branding CSS variables to client portal
- [ ] Implement cron jobs (session status, check-in reminders, payment reminders)
- [ ] End-to-end Stripe test mode verification

---

## Appendix B: Assumptions

1. **Auth remains Clerk.** No migration to NextAuth. The `clerkId` on `User` is the identity anchor.
2. **MongoDB remains the database.** No migration to PostgreSQL. All schema uses `@db.ObjectId` and MongoDB-compatible patterns.
3. **Deployment is on Vercel.** Cron jobs use Vercel Cron (vercel.json `crons` config) or external cron services hitting API routes.
4. **AI provider is Anthropic Claude** via Vercel AI SDK (`@ai-sdk/anthropic`). The OpenAI dependency in `ai.service.ts` is deprecated for generation and will be removed.
5. **Stripe Connect Standard** is the billing model (coaches onboard their own Stripe accounts).
6. **No native mobile app** is planned. The client portal is a mobile-optimized web app. PWA capabilities (offline, push notifications) are stretch goals.
7. **Single-tenant per clinician.** Multi-clinician clinics share an exercise library via `createdById` scoping but each clinician manages their own patient roster.
8. **HIPAA compliance** is a concern but not formally audited at this stage. Progress photos and health data are stored with appropriate access controls (patient + their clinician only). Formal HIPAA compliance (BAA with hosting providers, encryption at rest audit) is deferred to a compliance-specific phase.

---

## Appendix C: Technology Decisions Summary

| Decision | Choice | Justification |
|----------|--------|---------------|
| Database | MongoDB (via Prisma) | Already established. Schema flexibility suits the varied document structures (check-in answers, AI params). |
| Auth | Clerk | Already established. Handles user management, webhooks, and session management. |
| AI | Anthropic Claude via Vercel AI SDK | Already installed. `streamObject` enables structured output streaming. Claude Sonnet for generation quality, Haiku for lightweight tasks. |
| Payments | Stripe Connect Standard | Industry standard. Standard type minimizes platform liability. Coaches manage their own Stripe dashboard. |
| File Upload | Uploadthing | Already established. Handles video and image uploads with CDN delivery. |
| Email | Resend | Already installed. Transactional email for notifications. |
| Charts | Recharts | Already installed. Sufficient for line charts, bar charts, and area charts needed for analytics. |
| Calendar | react-big-calendar | Already installed. Drag-and-drop addon supports the scheduling workflow. |
| Drag-and-Drop | @dnd-kit/core + @dnd-kit/sortable | Already installed. Handles both in-builder reordering and calendar drag-to-schedule. |
| State Management | Server Components + Server Actions | No additional state library needed. React 19 server actions for mutations, RSC for reads. Client state for interactive components only. |
| Form Handling | React Hook Form + Zod | Already established. All new forms follow this pattern. |
| Styling | Tailwind CSS v4 + shadcn/ui | Already established. All new components use shadcn primitives. |
