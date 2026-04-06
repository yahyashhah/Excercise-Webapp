# EXECUTION BLUEPRINT V2 -- TrueCoach Competitor Platform

> **Generated:** 2026-04-02
> **Status:** Master Implementation Reference
> **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Prisma + MongoDB Atlas, Clerk, shadcn/ui, Vercel AI SDK + Anthropic, Uploadthing, Recharts, react-big-calendar, @dnd-kit, date-fns, React Hook Form + Zod, Resend, Sonner

---

## Table of Contents

1. [Prerequisites and Setup](#1-prerequisites-and-setup)
2. [Phase 1 -- Program Builder + Calendar Scheduling](#2-phase-1--program-builder--calendar-scheduling)
3. [Phase 2 -- Client Portal + Session Logging](#3-phase-2--client-portal--session-logging)
4. [Phase 3 -- Progress Tracking + Check-ins + Habits](#4-phase-3--progress-tracking--check-ins--habits)
5. [Phase 4 -- Nutrition + Analytics](#5-phase-4--nutrition--analytics)
6. [Phase 5 -- Billing + Notifications + Branding](#6-phase-5--billing--notifications--branding)
7. [Component Reference](#7-component-reference)
8. [Service Layer Reference](#8-service-layer-reference)
9. [Testing Checklist](#9-testing-checklist)

---

## 1. Prerequisites and Setup

### 1.1 New npm Packages to Install

```bash
npm install stripe @stripe/stripe-js
```

No other new packages are needed. The project already has all required dependencies:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (drag-drop)
- `react-big-calendar` (calendar)
- `recharts` (charts)
- `resend` (email)
- `uploadthing`, `@uploadthing/react` (file uploads)
- `react-hook-form`, `@hookform/resolvers`, `zod` (forms/validation)
- `sonner` (toasts)
- `date-fns` (date utilities)
- `lucide-react` (icons)
- `ai`, `@ai-sdk/anthropic` (AI)

### 1.2 New Environment Variables

Add to `.env.local`:

```env
# Phase 5 -- Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

These are only needed for Phase 5. Phases 1-4 require no new environment variables.

### 1.3 Post-Schema-Change Commands

After every Prisma schema modification:

```bash
npx prisma db push
npx prisma generate
```

The `postinstall` script in `package.json` already runs `prisma generate` on `npm install`.

### 1.4 Existing Codebase Patterns (MUST follow)

| Pattern | Convention |
|---|---|
| Prisma client import | `import { prisma } from "@/lib/prisma"` |
| Current user helper | `import { getCurrentUser, requireRole } from "@/lib/current-user"` |
| Server action auth | Call `auth()` from `@clerk/nextjs/server`, look up `dbUser` via `prisma.user.findUnique({ where: { clerkId: userId } })` |
| Server action return | `{ success: true as const, data }` or `{ success: false as const, error: string }` |
| Path revalidation | `revalidatePath("/path")` after mutations |
| Toast notifications | `import { toast } from "sonner"` |
| Client components | `"use client"` directive at top |
| Server actions | `"use server"` directive at top |
| Service layer | Pure functions in `lib/services/*.service.ts`, no auth checks (auth is in actions) |
| Validators | Zod schemas in `lib/validators/*.ts` |
| Pages | Async server components by default, fetch data at page level, pass to client components as props |

### 1.5 Shared Type Convention

Create a shared types file for cross-module types:

**File:** `lib/types/index.ts`

```typescript
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

---

## 2. Phase 1 -- Program Builder + Calendar Scheduling

**Goal:** Replace the old `WorkoutPlan`/`WorkoutBlock`/`BlockExercise` data model with the new `Program`/`Workout`/`WorkoutBlockV2`/`BlockExerciseV2`/`ExerciseSet` hierarchy. Build the full program CRUD, a production-ready ProgramBuilder with drag-drop and inline set editing, program assignment, session scheduling, and calendar integration.

**Dependencies:** None (this is the first phase)

---

### P1-T1: Prisma Schema Update -- New Models

**Files to modify:**
- `prisma/schema.prisma`

**Step-by-step:**

1. Add new enums after the existing `SessionStatus` enum:

```prisma
enum BlockType {
  NORMAL
  SUPERSET
  CIRCUIT
  AMRAP
  EMOM
}

enum SetType {
  NORMAL
  WARMUP
  DROP_SET
  FAILURE
}
```

2. Add the following relation fields to the existing `User` model (append after `clinicProfile`):

```prisma
  programsCreated    Program[]            @relation("ProgramsCreated")
  programsAssigned   Program[]            @relation("ProgramsAssigned")
  sessionsV2         WorkoutSessionV2[]   @relation("SessionsV2")
  checkInTemplates   CheckInTemplate[]    @relation("CheckInTemplatesCreated")
  checkInAssignments CheckInAssignment[]  @relation("CheckInAssignments")
  checkInResponses   CheckInResponse[]    @relation("CheckInResponses")
  bodyMetrics        BodyMetric[]         @relation("BodyMetrics")
  progressPhotos     ProgressPhoto[]      @relation("ProgressPhotos")
  habits             HabitDefinition[]    @relation("Habits")
  nutritionTarget    NutritionTarget?     @relation("NutritionTarget")
  nutritionLogs      NutritionLog[]       @relation("NutritionLogs")
  notifications      Notification[]       @relation("Notifications")
  packages           CoachPackage[]       @relation("Packages")
  subscriptions      ClientSubscription[] @relation("Subscriptions")
  branding           CoachBranding?       @relation("Branding")
```

3. Add to the existing `Exercise` model (after `media` relation):

```prisma
  blockExercisesV2 BlockExerciseV2[] @relation("BlockExercisesV2")
```

4. Add all Phase 1 models after the existing models. Add them in this exact order:

```prisma
model Program {
  id               String     @id @default(auto()) @map("_id") @db.ObjectId
  name             String
  description      String?
  isTemplate       Boolean    @default(false)
  sourceTemplateId String?    @db.ObjectId
  clinicianId      String     @db.ObjectId
  clinician        User       @relation("ProgramsCreated", fields: [clinicianId], references: [id])
  patientId        String?    @db.ObjectId
  patient          User?      @relation("ProgramsAssigned", fields: [patientId], references: [id])
  status           PlanStatus @default(DRAFT)
  durationWeeks    Int?
  daysPerWeek      Int?
  tags             String[]
  aiGenerationParams Json?
  startDate        DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  workouts         Workout[]

  @@index([clinicianId])
  @@index([patientId])
}

model Workout {
  id               String           @id @default(auto()) @map("_id") @db.ObjectId
  programId        String           @db.ObjectId
  program          Program          @relation(fields: [programId], references: [id], onDelete: Cascade)
  name             String
  description      String?
  dayIndex         Int
  weekIndex        Int              @default(0)
  orderIndex       Int
  estimatedMinutes Int?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  blocks           WorkoutBlockV2[]
  sessions         WorkoutSessionV2[]
}

model WorkoutBlockV2 {
  id                String           @id @default(auto()) @map("_id") @db.ObjectId
  workoutId         String           @db.ObjectId
  workout           Workout          @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  name              String?
  type              String           @default("NORMAL")
  orderIndex        Int
  rounds            Int              @default(1)
  restBetweenRounds Int?
  timeCap           Int?
  notes             String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  exercises         BlockExerciseV2[]
}

model BlockExerciseV2 {
  id            String         @id @default(auto()) @map("_id") @db.ObjectId
  blockId       String         @db.ObjectId
  block         WorkoutBlockV2 @relation(fields: [blockId], references: [id], onDelete: Cascade)
  exerciseId    String         @db.ObjectId
  exercise      Exercise       @relation("BlockExercisesV2", fields: [exerciseId], references: [id])
  orderIndex    Int
  restSeconds   Int?
  notes         String?
  supersetGroup String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  sets          ExerciseSet[]
}

model ExerciseSet {
  id              String         @id @default(auto()) @map("_id") @db.ObjectId
  blockExerciseId String         @db.ObjectId
  blockExercise   BlockExerciseV2 @relation(fields: [blockExerciseId], references: [id], onDelete: Cascade)
  orderIndex      Int
  setType         String         @default("NORMAL")
  targetReps      Int?
  targetWeight    Float?
  targetDuration  Int?
  targetDistance   Float?
  targetRPE       Int?
  restAfter       Int?
}

model WorkoutSessionV2 {
  id              String              @id @default(auto()) @map("_id") @db.ObjectId
  workoutId       String              @db.ObjectId
  workout         Workout             @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  patientId       String              @db.ObjectId
  patient         User                @relation("SessionsV2", fields: [patientId], references: [id])
  scheduledDate   DateTime
  startedAt       DateTime?
  completedAt     DateTime?
  status          String              @default("SCHEDULED")
  overallRPE      Int?
  overallNotes    String?
  durationMinutes Int?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  exerciseLogs    SessionExerciseLog[]
  feedback        SessionFeedback[]

  @@index([patientId, scheduledDate])
}

model SessionExerciseLog {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  sessionId       String           @db.ObjectId
  session         WorkoutSessionV2 @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  blockExerciseId String           @db.ObjectId
  orderIndex      Int
  status          String           @default("PENDING")
  completedAt     DateTime?
  setLogs         SetLog[]
}

model SetLog {
  id                   String             @id @default(auto()) @map("_id") @db.ObjectId
  sessionExerciseLogId String             @db.ObjectId
  sessionExerciseLog   SessionExerciseLog @relation(fields: [sessionExerciseLogId], references: [id], onDelete: Cascade)
  setIndex             Int
  actualReps           Int?
  actualWeight         Float?
  actualDuration       Int?
  actualRPE            Int?
  completedAt          DateTime?
  notes                String?
}

model SessionFeedback {
  id                String           @id @default(auto()) @map("_id") @db.ObjectId
  sessionId         String           @db.ObjectId
  session           WorkoutSessionV2 @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  patientId         String           @db.ObjectId
  rating            FeedbackRating
  comment           String?
  clinicianResponse String?
  respondedAt       DateTime?
  createdAt         DateTime         @default(now())
}
```

5. Also add all Phase 3, 4, 5 models now (so we only do one schema push). Paste them below the Phase 1 models:

```prisma
// --- Phase 3 Models ---

model CheckInTemplate {
  id           String              @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId  String              @db.ObjectId
  clinician    User                @relation("CheckInTemplatesCreated", fields: [clinicianId], references: [id])
  name         String
  description  String?
  frequency    String              @default("WEEKLY")
  customDays   Int?
  isActive     Boolean             @default(true)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  questions    CheckInQuestion[]
  assignments  CheckInAssignment[]
}

model CheckInQuestion {
  id           String          @id @default(auto()) @map("_id") @db.ObjectId
  templateId   String          @db.ObjectId
  template     CheckInTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  orderIndex   Int
  questionText String
  questionType String
  options      String[]
  isRequired   Boolean         @default(true)
}

model CheckInAssignment {
  id          String            @id @default(auto()) @map("_id") @db.ObjectId
  templateId  String            @db.ObjectId
  template    CheckInTemplate   @relation(fields: [templateId], references: [id], onDelete: Cascade)
  patientId   String            @db.ObjectId
  patient     User              @relation("CheckInAssignments", fields: [patientId], references: [id])
  clinicianId String            @db.ObjectId
  startDate   DateTime
  endDate     DateTime?
  isActive    Boolean           @default(true)
  nextDueDate DateTime
  createdAt   DateTime          @default(now())
  responses   CheckInResponse[]
}

model CheckInResponse {
  id           String            @id @default(auto()) @map("_id") @db.ObjectId
  assignmentId String            @db.ObjectId
  assignment   CheckInAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  patientId    String            @db.ObjectId
  patient      User              @relation("CheckInResponses", fields: [patientId], references: [id])
  submittedAt  DateTime          @default(now())
  answers      Json
  aiSummary    String?
  coachNotes   String?
  isReviewed   Boolean           @default(false)
  reviewedAt   DateTime?

  @@index([patientId, submittedAt])
}

model BodyMetric {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId  String   @db.ObjectId
  patient    User     @relation("BodyMetrics", fields: [patientId], references: [id])
  metricType String
  value      Float
  unit       String
  notes      String?
  recordedAt DateTime @default(now())

  @@index([patientId, metricType, recordedAt])
}

model ProgressPhoto {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId  String   @db.ObjectId
  patient    User     @relation("ProgressPhotos", fields: [patientId], references: [id])
  imageUrl   String
  angle      String?
  notes      String?
  isPrivate  Boolean  @default(true)
  recordedAt DateTime @default(now())
}

model HabitDefinition {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  patientId   String    @db.ObjectId
  patient     User      @relation("Habits", fields: [patientId], references: [id])
  clinicianId String?   @db.ObjectId
  name        String
  icon        String?
  targetValue Float?
  unit        String?
  frequency   String    @default("DAILY")
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  logs        HabitLog[]
}

model HabitLog {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  habitId   String   @db.ObjectId
  habit     HabitDefinition @relation(fields: [habitId], references: [id], onDelete: Cascade)
  date      DateTime
  value     Float    @default(1)
  completed Boolean  @default(false)
  notes     String?
  createdAt DateTime @default(now())

  @@unique([habitId, date])
  @@index([habitId, date])
}

// --- Phase 4 Models ---

model NutritionTarget {
  id        String @id @default(auto()) @map("_id") @db.ObjectId
  patientId String @unique @db.ObjectId
  patient   User   @relation("NutritionTarget", fields: [patientId], references: [id])
  calories  Int?
  proteinG  Int?
  carbsG    Int?
  fatG      Int?
  fiberG    Int?
  waterMl   Int?
  updatedAt DateTime @updatedAt
}

model NutritionLog {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  patientId   String   @db.ObjectId
  patient     User     @relation("NutritionLogs", fields: [patientId], references: [id])
  date        DateTime
  mealType    String
  description String
  calories    Int?
  proteinG    Float?
  carbsG      Float?
  fatG        Float?
  photoUrl    String?
  createdAt   DateTime @default(now())

  @@index([patientId, date])
}

// --- Phase 5 Models ---

model Notification {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @db.ObjectId
  user      User     @relation("Notifications", fields: [userId], references: [id])
  type      String
  title     String
  body      String?
  link      String?
  isRead    Boolean  @default(false)
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([userId, isRead, createdAt])
}

model CoachPackage {
  id             String              @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId    String              @db.ObjectId
  clinician      User                @relation("Packages", fields: [clinicianId], references: [id])
  name           String
  description    String?
  priceInCents   Int
  currency       String              @default("usd")
  intervalMonths Int                 @default(1)
  isActive       Boolean             @default(true)
  stripePriceId  String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  subscriptions  ClientSubscription[]
}

model ClientSubscription {
  id                    String        @id @default(auto()) @map("_id") @db.ObjectId
  packageId             String        @db.ObjectId
  package               CoachPackage  @relation(fields: [packageId], references: [id])
  patientId             String        @db.ObjectId
  patient               User          @relation("Subscriptions", fields: [patientId], references: [id])
  clinicianId           String        @db.ObjectId
  status                String        @default("ACTIVE")
  stripeSubscriptionId  String?
  stripeCustomerId      String?
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  cancelledAt           DateTime?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt
  invoices              Invoice[]

  @@index([clinicianId, status])
  @@index([patientId])
}

model Invoice {
  id              String             @id @default(auto()) @map("_id") @db.ObjectId
  subscriptionId  String             @db.ObjectId
  subscription    ClientSubscription @relation(fields: [subscriptionId], references: [id])
  amountInCents   Int
  currency        String             @default("usd")
  status          String             @default("DRAFT")
  stripeInvoiceId String?
  paidAt          DateTime?
  dueDate         DateTime
  createdAt       DateTime           @default(now())
}

model CoachBranding {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId    String   @unique @db.ObjectId
  clinician      User     @relation("Branding", fields: [clinicianId], references: [id])
  primaryColor   String   @default("#2563eb")
  accentColor    String   @default("#f59e0b")
  fontFamily     String   @default("Inter")
  logoUrl        String?
  faviconUrl     String?
  welcomeMessage String?
  customDomain   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

6. Run:

```bash
npx prisma db push
npx prisma generate
```

**Dependencies:** None
**Acceptance criteria:**
- `npx prisma db push` completes without errors
- `npx prisma generate` completes without errors
- All new models are available via `import { ... } from "@prisma/client"`

---

### P1-T2: Migration Script -- Old WorkoutPlan to Program

**Files to create:**
- `lib/db/seed/migrate-plans-to-programs.ts`

**Step-by-step:**

1. Create a standalone script (run via `npx tsx lib/db/seed/migrate-plans-to-programs.ts`):

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.workoutPlan.findMany({
    include: {
      blocks: {
        include: { exercises: true },
        orderBy: { orderIndex: "asc" },
      },
      exercises: { orderBy: { orderIndex: "asc" } },
    },
  });

  console.log(`Found ${plans.length} plans to migrate`);

  for (const plan of plans) {
    // Create a Program from each WorkoutPlan
    const program = await prisma.program.create({
      data: {
        name: plan.title,
        description: plan.description,
        isTemplate: plan.isTemplate,
        clinicianId: plan.createdById,
        patientId: plan.patientId,
        status: plan.status,
        daysPerWeek: plan.daysPerWeek,
        tags: plan.tags,
        aiGenerationParams: plan.aiGenerationParams ?? undefined,
        createdAt: plan.createdAt,
      },
    });

    // If plan has blocks, migrate block structure
    if (plan.blocks.length > 0) {
      // Group blocks by day (use orderIndex as dayIndex)
      // Create one Workout per unique day, containing the blocks
      const workout = await prisma.workout.create({
        data: {
          programId: program.id,
          name: plan.title,
          dayIndex: 0,
          weekIndex: 0,
          orderIndex: 0,
        },
      });

      for (const block of plan.blocks) {
        const newBlock = await prisma.workoutBlockV2.create({
          data: {
            workoutId: workout.id,
            name: block.name,
            type: "NORMAL",
            orderIndex: block.orderIndex,
          },
        });

        for (const ex of block.exercises) {
          await prisma.blockExerciseV2.create({
            data: {
              blockId: newBlock.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              sets: {
                create: Array.from({ length: ex.sets || 1 }, (_, i) => ({
                  orderIndex: i,
                  setType: "NORMAL",
                  targetReps: ex.reps,
                  targetDuration: ex.durationSeconds,
                })),
              },
            },
          });
        }
      }
    } else if (plan.exercises.length > 0) {
      // Plans with only PlanExercise (no blocks)
      // Group by dayOfWeek
      const byDay = new Map<number, typeof plan.exercises>();
      for (const ex of plan.exercises) {
        const day = ex.dayOfWeek ?? 0;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(ex);
      }

      let workoutIdx = 0;
      for (const [dayIdx, exercises] of byDay) {
        const workout = await prisma.workout.create({
          data: {
            programId: program.id,
            name: `Day ${dayIdx + 1}`,
            dayIndex: dayIdx,
            weekIndex: 0,
            orderIndex: workoutIdx++,
          },
        });

        const block = await prisma.workoutBlockV2.create({
          data: {
            workoutId: workout.id,
            name: "Main",
            type: "NORMAL",
            orderIndex: 0,
          },
        });

        for (const ex of exercises) {
          await prisma.blockExerciseV2.create({
            data: {
              blockId: block.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              sets: {
                create: Array.from({ length: ex.sets || 1 }, (_, i) => ({
                  orderIndex: i,
                  setType: "NORMAL",
                  targetReps: ex.reps,
                  targetDuration: ex.durationSeconds,
                })),
              },
            },
          });
        }
      }
    }

    console.log(`Migrated plan "${plan.title}" -> program "${program.name}"`);
  }

  console.log("Migration complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

2. Add a script entry in `package.json`:

```json
"db:migrate-programs": "npx tsx lib/db/seed/migrate-plans-to-programs.ts"
```

**Dependencies:** P1-T1
**Acceptance criteria:**
- Script runs without error
- Every existing WorkoutPlan has a corresponding Program
- Block/exercise structure is preserved
- Old data is NOT deleted (read-only migration)

---

### P1-T3: Zod Validators for Programs

**Files to create:**
- `lib/validators/program.ts`

**Step-by-step:**

Create the file with these schemas:

```typescript
import { z } from "zod";

// --- Set schema ---
export const exerciseSetSchema = z.object({
  id: z.string().optional(),
  orderIndex: z.number().int().min(0),
  setType: z.enum(["NORMAL", "WARMUP", "DROP_SET", "FAILURE"]).default("NORMAL"),
  targetReps: z.number().int().positive().optional().nullable(),
  targetWeight: z.number().positive().optional().nullable(),
  targetDuration: z.number().int().positive().optional().nullable(),
  targetDistance: z.number().positive().optional().nullable(),
  targetRPE: z.number().int().min(1).max(10).optional().nullable(),
  restAfter: z.number().int().min(0).optional().nullable(),
});

// --- Block exercise schema ---
export const blockExerciseSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1, "Exercise is required"),
  orderIndex: z.number().int().min(0),
  restSeconds: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  supersetGroup: z.string().optional().nullable(),
  sets: z.array(exerciseSetSchema).min(1, "At least one set is required"),
});

// --- Block schema ---
export const workoutBlockSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(100).optional().nullable(),
  type: z.enum(["NORMAL", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"]).default("NORMAL"),
  orderIndex: z.number().int().min(0),
  rounds: z.number().int().min(1).default(1),
  restBetweenRounds: z.number().int().min(0).optional().nullable(),
  timeCap: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  exercises: z.array(blockExerciseSchema),
});

// --- Workout schema ---
export const workoutSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Workout name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  dayIndex: z.number().int().min(0),
  weekIndex: z.number().int().min(0).default(0),
  orderIndex: z.number().int().min(0),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  blocks: z.array(workoutBlockSchema),
});

// --- Program schema ---
export const createProgramSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isTemplate: z.boolean().default(false),
  sourceTemplateId: z.string().optional().nullable(),
  durationWeeks: z.number().int().positive().optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  tags: z.array(z.string()).default([]),
  startDate: z.string().datetime().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});

export const updateProgramSchema = createProgramSchema.partial().extend({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
});

export const assignProgramSchema = z.object({
  programId: z.string().min(1),
  patientId: z.string().min(1),
  startDate: z.string().datetime(),
});

export const programFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
  isTemplate: z.boolean().optional(),
  patientId: z.string().optional(),
});

// --- Inferred types ---
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type AssignProgramInput = z.infer<typeof assignProgramSchema>;
export type ProgramFilterInput = z.infer<typeof programFilterSchema>;
export type WorkoutInput = z.infer<typeof workoutSchema>;
export type WorkoutBlockInput = z.infer<typeof workoutBlockSchema>;
export type BlockExerciseInput = z.infer<typeof blockExerciseSchema>;
export type ExerciseSetInput = z.infer<typeof exerciseSetSchema>;
```

**Dependencies:** None
**Acceptance criteria:**
- All schemas parse valid data without error
- Invalid data (missing required fields, out-of-range values) is rejected with descriptive messages

---

### P1-T4: Program Service Layer

**Files to create:**
- `lib/services/program.service.ts`

**Step-by-step:**

Create the service with these functions. Every function takes plain data (no auth) and returns Prisma results.

```typescript
import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";
import type {
  CreateProgramInput,
  ProgramFilterInput,
} from "@/lib/validators/program";

// --- Include presets ---
const programListInclude = {
  clinician: { select: { id: true, firstName: true, lastName: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { workouts: true } },
} satisfies Prisma.ProgramInclude;

const programDetailInclude = {
  clinician: { select: { id: true, firstName: true, lastName: true } },
  patient: { select: { id: true, firstName: true, lastName: true, patientProfile: true } },
  workouts: {
    orderBy: { orderIndex: "asc" as const },
    include: {
      blocks: {
        orderBy: { orderIndex: "asc" as const },
        include: {
          exercises: {
            orderBy: { orderIndex: "asc" as const },
            include: {
              exercise: { include: { media: true } },
              sets: { orderBy: { orderIndex: "asc" as const } },
            },
          },
        },
      },
      _count: { select: { sessions: true } },
    },
  },
} satisfies Prisma.ProgramInclude;

// --- CRUD ---

export async function createProgram(clinicianId: string, data: CreateProgramInput) {
  const { workouts, startDate, ...rest } = data;

  return prisma.program.create({
    data: {
      ...rest,
      clinicianId,
      startDate: startDate ? new Date(startDate) : undefined,
      workouts: {
        create: workouts.map((w) => ({
          name: w.name,
          description: w.description,
          dayIndex: w.dayIndex,
          weekIndex: w.weekIndex,
          orderIndex: w.orderIndex,
          estimatedMinutes: w.estimatedMinutes,
          blocks: {
            create: w.blocks.map((b) => ({
              name: b.name,
              type: b.type,
              orderIndex: b.orderIndex,
              rounds: b.rounds,
              restBetweenRounds: b.restBetweenRounds,
              timeCap: b.timeCap,
              notes: b.notes,
              exercises: {
                create: b.exercises.map((e) => ({
                  exerciseId: e.exerciseId,
                  orderIndex: e.orderIndex,
                  restSeconds: e.restSeconds,
                  notes: e.notes,
                  supersetGroup: e.supersetGroup,
                  sets: {
                    create: e.sets.map((s) => ({
                      orderIndex: s.orderIndex,
                      setType: s.setType,
                      targetReps: s.targetReps,
                      targetWeight: s.targetWeight,
                      targetDuration: s.targetDuration,
                      targetDistance: s.targetDistance,
                      targetRPE: s.targetRPE,
                      restAfter: s.restAfter,
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
    include: programDetailInclude,
  });
}

export async function getProgramById(id: string) {
  return prisma.program.findUnique({
    where: { id },
    include: programDetailInclude,
  });
}

export async function getPrograms(clinicianId: string, filters: ProgramFilterInput = {}) {
  const where: Prisma.ProgramWhereInput = {
    clinicianId,
    ...(filters.status && { status: filters.status as PlanStatus }),
    ...(filters.isTemplate !== undefined && { isTemplate: filters.isTemplate }),
    ...(filters.patientId && { patientId: filters.patientId }),
    ...(filters.search && {
      name: { contains: filters.search, mode: "insensitive" as const },
    }),
  };

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  // If workouts are provided, do a full replace (delete existing, create new)
  if (workouts) {
    // Delete all existing workouts (cascades to blocks -> exercises -> sets)
    await prisma.workout.deleteMany({ where: { programId: id } });

    return prisma.program.update({
      where: { id },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        workouts: {
          create: workouts.map((w) => ({
            name: w.name,
            description: w.description,
            dayIndex: w.dayIndex,
            weekIndex: w.weekIndex,
            orderIndex: w.orderIndex,
            estimatedMinutes: w.estimatedMinutes,
            blocks: {
              create: w.blocks.map((b) => ({
                name: b.name,
                type: b.type,
                orderIndex: b.orderIndex,
                rounds: b.rounds,
                restBetweenRounds: b.restBetweenRounds,
                timeCap: b.timeCap,
                notes: b.notes,
                exercises: {
                  create: b.exercises.map((e) => ({
                    exerciseId: e.exerciseId,
                    orderIndex: e.orderIndex,
                    restSeconds: e.restSeconds,
                    notes: e.notes,
                    supersetGroup: e.supersetGroup,
                    sets: {
                      create: e.sets.map((s) => ({
                        orderIndex: s.orderIndex,
                        setType: s.setType,
                        targetReps: s.targetReps,
                        targetWeight: s.targetWeight,
                        targetDuration: s.targetDuration,
                        targetDistance: s.targetDistance,
                        targetRPE: s.targetRPE,
                        restAfter: s.restAfter,
                      })),
                    },
                  })),
                },
              })),
            },
          })),
        },
      },
      include: programDetailInclude,
    });
  }

  return prisma.program.update({
    where: { id },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
    },
    include: programDetailInclude,
  });
}

export async function deleteProgram(id: string) {
  return prisma.program.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

export async function duplicateProgram(id: string, clinicianId: string, asTemplate = false) {
  const source = await getProgramById(id);
  if (!source) throw new Error("Program not found");

  const workouts = source.workouts.map((w, wi) => ({
    name: w.name,
    description: w.description,
    dayIndex: w.dayIndex,
    weekIndex: w.weekIndex,
    orderIndex: wi,
    estimatedMinutes: w.estimatedMinutes,
    blocks: w.blocks.map((b, bi) => ({
      name: b.name,
      type: b.type,
      orderIndex: bi,
      rounds: b.rounds,
      restBetweenRounds: b.restBetweenRounds,
      timeCap: b.timeCap,
      notes: b.notes,
      exercises: b.exercises.map((e, ei) => ({
        exerciseId: e.exerciseId,
        orderIndex: ei,
        restSeconds: e.restSeconds,
        notes: e.notes,
        supersetGroup: e.supersetGroup,
        sets: e.sets.map((s, si) => ({
          orderIndex: si,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetDistance: s.targetDistance,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      })),
    })),
  }));

  return createProgram(clinicianId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    isTemplate: asTemplate,
    sourceTemplateId: source.id,
    durationWeeks: source.durationWeeks,
    daysPerWeek: source.daysPerWeek,
    tags: source.tags,
    workouts,
  });
}

export async function assignProgram(
  programId: string,
  patientId: string,
  startDate: Date
) {
  // Update program with patient and start date, set status to ACTIVE
  const program = await prisma.program.update({
    where: { id: programId },
    data: {
      patientId,
      startDate,
      status: "ACTIVE",
    },
    include: programDetailInclude,
  });

  // Create WorkoutSessionV2 records for each workout
  const sessions: { workoutId: string; scheduledDate: Date }[] = [];

  for (const workout of program.workouts) {
    // Calculate scheduled date: startDate + weekIndex weeks + dayIndex days
    const scheduledDate = new Date(startDate);
    scheduledDate.setDate(
      scheduledDate.getDate() + workout.weekIndex * 7 + workout.dayIndex
    );

    sessions.push({ workoutId: workout.id, scheduledDate });
  }

  if (sessions.length > 0) {
    await prisma.workoutSessionV2.createMany({
      data: sessions.map((s) => ({
        workoutId: s.workoutId,
        patientId,
        scheduledDate: s.scheduledDate,
        status: "SCHEDULED",
      })),
    });
  }

  return program;
}

export async function getProgramsForPatient(patientId: string) {
  return prisma.program.findMany({
    where: { patientId, status: { in: ["ACTIVE", "PAUSED"] } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplates(clinicianId: string) {
  return prisma.program.findMany({
    where: { clinicianId, isTemplate: true, status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}
```

**Dependencies:** P1-T1, P1-T3
**Acceptance criteria:**
- All CRUD operations work against the database
- `createProgram` creates full nested hierarchy (Program -> Workout -> Block -> Exercise -> Set) in one call
- `assignProgram` creates `WorkoutSessionV2` records with correct scheduled dates
- `duplicateProgram` creates an independent copy with no shared references

---

### P1-T5: Program Server Actions

**Files to create:**
- `actions/program-actions.ts`

**Step-by-step:**

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as programService from "@/lib/services/program.service";
import {
  createProgramSchema,
  updateProgramSchema,
  assignProgramSchema,
} from "@/lib/validators/program";
import type { CreateProgramInput, UpdateProgramInput } from "@/lib/validators/program";

async function getClinicianUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "CLINICIAN") return null;
  return dbUser;
}

export async function createProgramAction(input: CreateProgramInput) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const program = await programService.createProgram(user.id, parsed.data);
    revalidatePath("/programs");
    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to create program:", error);
    return { success: false as const, error: "Failed to create program" };
  }
}

export async function updateProgramAction(programId: string, input: UpdateProgramInput) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { clinicianId: true },
  });
  if (!program || program.clinicianId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    revalidatePath("/programs");
    revalidatePath(`/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program:", error);
    return { success: false as const, error: "Failed to update program" };
  }
}

export async function deleteProgramAction(programId: string) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { clinicianId: true },
  });
  if (!program || program.clinicianId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await programService.deleteProgram(programId);
    revalidatePath("/programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete program:", error);
    return { success: false as const, error: "Failed to delete program" };
  }
}

export async function duplicateProgramAction(programId: string, asTemplate = false) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const program = await programService.duplicateProgram(programId, user.id, asTemplate);
    revalidatePath("/programs");
    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to duplicate program:", error);
    return { success: false as const, error: "Failed to duplicate program" };
  }
}

export async function assignProgramAction(input: {
  programId: string;
  patientId: string;
  startDate: string;
}) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = assignProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const program = await prisma.program.findUnique({
    where: { id: parsed.data.programId },
    select: { clinicianId: true },
  });
  if (!program || program.clinicianId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const result = await programService.assignProgram(
      parsed.data.programId,
      parsed.data.patientId,
      new Date(parsed.data.startDate)
    );
    revalidatePath("/programs");
    revalidatePath(`/programs/${parsed.data.programId}`);
    revalidatePath(`/patients/${parsed.data.patientId}`);
    revalidatePath("/dashboard");
    return { success: true as const, data: result };
  } catch (error) {
    console.error("Failed to assign program:", error);
    return { success: false as const, error: "Failed to assign program" };
  }
}

export async function getProgramsAction(filters?: {
  search?: string;
  status?: string;
  isTemplate?: boolean;
}) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const programs = await programService.getPrograms(user.id, filters);
    return { success: true as const, data: programs };
  } catch (error) {
    console.error("Failed to fetch programs:", error);
    return { success: false as const, error: "Failed to fetch programs" };
  }
}

export async function getProgramAction(programId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const program = await programService.getProgramById(programId);
    if (!program) return { success: false as const, error: "Program not found" };

    // Authorization: clinician who created it OR assigned patient
    if (program.clinicianId !== dbUser.id && program.patientId !== dbUser.id) {
      return { success: false as const, error: "Forbidden" };
    }

    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to fetch program:", error);
    return { success: false as const, error: "Failed to fetch program" };
  }
}
```

**Dependencies:** P1-T3, P1-T4
**Acceptance criteria:**
- Every action validates auth (Clerk), validates ownership, validates input (Zod), and returns the standard `{ success, data/error }` shape
- `revalidatePath` is called on all relevant paths after mutations

---

### P1-T6: Programs List Page

**Files to create:**
- `app/(platform)/programs/page.tsx`

**Step-by-step:**

This is a server component that fetches programs and renders them in a filterable grid.

```typescript
// app/(platform)/programs/page.tsx
import { getCurrentUser, requireRole } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { ProgramListClient } from "@/components/programs/program-list-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
  }>;
}

export default async function ProgramsPage({ searchParams }: Props) {
  const user = await requireRole("CLINICIAN");
  const params = await searchParams;

  const programs = await programService.getPrograms(user.id, {
    search: params.search,
    status: params.status as any,
    isTemplate: params.template === "true" ? true : undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Programs</h1>
          <p className="text-muted-foreground">
            Create, manage, and assign training programs to your clients.
          </p>
        </div>
      </div>
      <ProgramListClient programs={programs} />
    </div>
  );
}
```

**Client component to create:**
- `components/programs/program-list-client.tsx`

This component renders:
- Search input (filters by name, updates URL search params via `useRouter`)
- Status filter dropdown (DRAFT, ACTIVE, PAUSED, COMPLETED, ARCHIVED)
- Template toggle (Switch component)
- "New Program" button linking to `/programs/new`
- Grid of program cards (use Card component), each showing: name, status badge, patient name or "Template"/"Unassigned", workout count, last updated date
- Each card links to `/programs/[id]`
- Dropdown menu on each card: Edit, Duplicate, Assign, Archive

```typescript
// components/programs/program-list-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Copy, UserPlus, Archive } from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction, deleteProgramAction } from "@/actions/program-actions";
import { formatDistanceToNow } from "date-fns";

// Props type: the array returned by programService.getPrograms
interface ProgramListItem {
  id: string;
  name: string;
  status: string;
  isTemplate: boolean;
  tags: string[];
  updatedAt: Date;
  clinician: { id: string; firstName: string; lastName: string };
  patient: { id: string; firstName: string; lastName: string } | null;
  _count: { workouts: number };
}

export function ProgramListClient({ programs }: { programs: ProgramListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateOnly, setTemplateOnly] = useState(false);

  const filtered = programs.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (templateOnly && !p.isTemplate) return false;
    return true;
  });

  const statusColor: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    ACTIVE: "bg-green-100 text-green-700",
    PAUSED: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-blue-100 text-blue-700",
    ARCHIVED: "bg-red-100 text-red-700",
  };

  async function handleDuplicate(id: string) {
    const result = await duplicateProgramAction(id);
    if (result.success) {
      toast.success("Program duplicated");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleArchive(id: string) {
    const result = await deleteProgramAction(id);
    if (result.success) {
      toast.success("Program archived");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={templateOnly} onCheckedChange={setTemplateOnly} />
            <span className="text-sm text-muted-foreground">Templates only</span>
          </div>
        </div>
        <Button asChild>
          <Link href="/programs/new">
            <Plus className="mr-2 h-4 w-4" />
            New Program
          </Link>
        </Button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No programs found. Create your first program to get started.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => (
            <Card key={program.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <Link href={`/programs/${program.id}`} className="flex-1">
                  <CardTitle className="text-lg font-semibold line-clamp-1 group-hover:underline">
                    {program.name}
                  </CardTitle>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}/edit`)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(program.id)}>
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    {!program.patientId && (
                      <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}?assign=true`)}>
                        <UserPlus className="mr-2 h-4 w-4" /> Assign
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleArchive(program.id)} className="text-destructive">
                      <Archive className="mr-2 h-4 w-4" /> Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={statusColor[program.status] || ""}>
                    {program.status}
                  </Badge>
                  {program.isTemplate && <Badge variant="outline">Template</Badge>}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    {program.patient
                      ? `${program.patient.firstName} ${program.patient.lastName}`
                      : "Unassigned"}
                  </p>
                  <p>{program._count.workouts} workout{program._count.workouts !== 1 ? "s" : ""}</p>
                  <p>Updated {formatDistanceToNow(new Date(program.updatedAt), { addSuffix: true })}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Dependencies:** P1-T4, P1-T5
**Acceptance criteria:**
- Page loads with all programs for the logged-in clinician
- Search, status filter, and template toggle work client-side
- Cards display name, status, patient, workout count
- Dropdown actions work (Edit navigates, Duplicate creates copy, Archive soft-deletes)

---

### P1-T7: New Program Page

**Files to create:**
- `app/(platform)/programs/new/page.tsx`

**Step-by-step:**

This page renders a form for program metadata and then the ProgramBuilder (P1-T10) for workout/block/exercise structure.

```typescript
// app/(platform)/programs/new/page.tsx
import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ProgramEditor } from "@/components/programs/program-editor";

export default async function NewProgramPage() {
  await requireRole("CLINICIAN");
  const exercises = await getExercises();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Program</h1>
        <p className="text-muted-foreground">
          Build a new training program from scratch or start from a template.
        </p>
      </div>
      <ProgramEditor exercises={exercises} />
    </div>
  );
}
```

The `ProgramEditor` component is the combined metadata form + ProgramBuilder. See P1-T10 for its full specification.

**Dependencies:** P1-T5, P1-T10
**Acceptance criteria:**
- Page loads for clinicians, redirects patients to /dashboard
- Full exercise library is loaded and passed to the builder
- Creating a program with workouts, blocks, exercises, and sets persists to DB

---

### P1-T8: Program Detail Page

**Files to create:**
- `app/(platform)/programs/[id]/page.tsx`
- `components/programs/program-detail-view.tsx`

**Step-by-step:**

Server component fetches program with full hierarchy, renders a read-only detail view.

```typescript
// app/(platform)/programs/[id]/page.tsx
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { ProgramDetailView } from "@/components/programs/program-detail-view";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assign?: string }>;
}

export default async function ProgramDetailPage({ params, searchParams }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { assign } = await searchParams;

  const program = await programService.getProgramById(id);
  if (!program) notFound();

  // Authorization
  if (program.clinicianId !== user.id && program.patientId !== user.id) {
    notFound();
  }

  // If clinician, load patients for assignment dialog
  let patients: { id: string; firstName: string; lastName: string }[] = [];
  if (user.role === "CLINICIAN") {
    const links = await prisma.patientClinicianLink.findMany({
      where: { clinicianId: user.id, status: "active" },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
    patients = links.map((l) => l.patient);
  }

  return (
    <ProgramDetailView
      program={program}
      isClinician={user.role === "CLINICIAN"}
      patients={patients}
      showAssignDialog={assign === "true"}
    />
  );
}
```

Note: Add `import { prisma } from "@/lib/prisma"` at the top of the file.

The `ProgramDetailView` client component renders:
- Program header: name, status badge, patient name, dates, tags
- Action buttons: Edit, Duplicate, Assign, Archive (clinician only)
- Tabbed view: "Overview" (workout list) and "Calendar" (sessions)
- For each workout: collapsible card showing blocks, exercises, and set details
- `AssignProgramDialog` component triggered by assign button or `showAssignDialog` prop

```typescript
// components/programs/program-detail-view.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Copy, UserPlus, Archive, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction, deleteProgramAction } from "@/actions/program-actions";
import { AssignProgramDialog } from "@/components/programs/assign-program-dialog";
import { format } from "date-fns";

// Type matches programDetailInclude from program.service.ts
interface ProgramDetailViewProps {
  program: any; // Full program with workouts, blocks, exercises, sets
  isClinician: boolean;
  patients: { id: string; firstName: string; lastName: string }[];
  showAssignDialog?: boolean;
}

export function ProgramDetailView({
  program,
  isClinician,
  patients,
  showAssignDialog = false,
}: ProgramDetailViewProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(showAssignDialog);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set(program.workouts.map((w: any) => w.id))
  );

  function toggleWorkout(id: string) {
    setExpandedWorkouts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{program.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge>{program.status}</Badge>
            {program.isTemplate && <Badge variant="outline">Template</Badge>}
            {program.patient && (
              <span className="text-sm text-muted-foreground">
                Assigned to {program.patient.firstName} {program.patient.lastName}
              </span>
            )}
            {program.startDate && (
              <span className="text-sm text-muted-foreground">
                Starts {format(new Date(program.startDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {program.description && (
            <p className="text-muted-foreground mt-2">{program.description}</p>
          )}
        </div>
        {isClinician && (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/programs/${program.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button variant="outline" onClick={async () => {
              const r = await duplicateProgramAction(program.id);
              if (r.success) { toast.success("Duplicated"); router.refresh(); }
              else toast.error(r.error);
            }}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </Button>
            {!program.patientId && (
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 mt-4">
          {program.workouts.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No workouts yet. Edit this program to add workouts.</p>
            </Card>
          ) : (
            program.workouts.map((workout: any) => {
              const isExpanded = expandedWorkouts.has(workout.id);
              return (
                <Card key={workout.id}>
                  <CardHeader
                    className="cursor-pointer flex flex-row items-center gap-2"
                    onClick={() => toggleWorkout(workout.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <CardTitle className="text-lg">{workout.name}</CardTitle>
                    <span className="text-sm text-muted-foreground ml-auto">
                      Week {workout.weekIndex + 1}, Day {workout.dayIndex + 1}
                      {workout.estimatedMinutes && ` | ~${workout.estimatedMinutes} min`}
                    </span>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="space-y-4">
                      {workout.blocks.map((block: any) => (
                        <div key={block.id} className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="font-semibold">{block.name || "Block"}</span>
                            {block.type !== "NORMAL" && (
                              <Badge variant="outline">{block.type}</Badge>
                            )}
                            {block.rounds > 1 && (
                              <Badge variant="secondary">{block.rounds} rounds</Badge>
                            )}
                          </div>
                          <div className="space-y-3">
                            {block.exercises.map((be: any) => (
                              <div key={be.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                                <div className="flex-1">
                                  <p className="font-medium">{be.exercise.name}</p>
                                  {be.notes && <p className="text-sm text-muted-foreground">{be.notes}</p>}
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {be.sets.map((set: any) => (
                                      <Badge key={set.id} variant="secondary" className="text-xs">
                                        {set.setType !== "NORMAL" && `${set.setType} `}
                                        {set.targetReps && `${set.targetReps} reps`}
                                        {set.targetWeight && ` @ ${set.targetWeight}lb`}
                                        {set.targetDuration && ` ${set.targetDuration}s`}
                                        {set.targetRPE && ` RPE ${set.targetRPE}`}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                {be.restSeconds && (
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    Rest: {be.restSeconds}s
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          {/* Render WorkoutCalendarV2 here -- see P1-T13 */}
          <p className="text-muted-foreground">Calendar view will be rendered here.</p>
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      <AssignProgramDialog
        programId={program.id}
        patients={patients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </div>
  );
}
```

**Dependencies:** P1-T5, P1-T11
**Acceptance criteria:**
- Page loads with full program hierarchy
- Workouts are collapsible
- Block types, rounds, and set details are visible
- Assign dialog opens and works

---

### P1-T9: Program Edit Page

**Files to create:**
- `app/(platform)/programs/[id]/edit/page.tsx`

**Step-by-step:**

```typescript
// app/(platform)/programs/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { getExercises } from "@/lib/services/exercise.service";
import { ProgramEditor } from "@/components/programs/program-editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProgramPage({ params }: Props) {
  const user = await requireRole("CLINICIAN");
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    programService.getProgramById(id),
    getExercises(),
  ]);

  if (!program || program.clinicianId !== user.id) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Program</h1>
        <p className="text-muted-foreground">Modify "{program.name}"</p>
      </div>
      <ProgramEditor program={program} exercises={exercises} />
    </div>
  );
}
```

The `ProgramEditor` component (P1-T10) handles both create and edit modes based on whether a `program` prop is provided.

**Dependencies:** P1-T5, P1-T10
**Acceptance criteria:**
- Page loads with program data pre-filled
- Saving updates the existing program (does not create a new one)
- Redirects back to `/programs/[id]` on successful save

---

### P1-T10: ProgramEditor + ProgramBuilder Component (Refactored)

**Files to create:**
- `components/programs/program-editor.tsx`
- `components/programs/program-builder.tsx` (replaces old `components/workout/program-builder.tsx`)
- `components/programs/exercise-picker-dialog.tsx`
- `components/programs/set-editor.tsx`

**Step-by-step:**

This is the most complex task. Break it into sub-components:

#### 10a. ProgramEditor (metadata form + builder wrapper)

```typescript
// components/programs/program-editor.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createProgramSchema, type CreateProgramInput } from "@/lib/validators/program";
import { createProgramAction, updateProgramAction } from "@/actions/program-actions";
import { ProgramBuilder } from "./program-builder";
import type { WorkoutInput } from "@/lib/validators/program";

interface Props {
  program?: any; // Full program from getProgramById (null for create)
  exercises: any[]; // Full exercise list from getExercises
}

export function ProgramEditor({ program, exercises }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutInput[]>(
    program
      ? program.workouts.map(mapWorkoutToInput)
      : []
  );

  const form = useForm<CreateProgramInput>({
    resolver: zodResolver(createProgramSchema),
    defaultValues: {
      name: program?.name || "",
      description: program?.description || "",
      isTemplate: program?.isTemplate || false,
      durationWeeks: program?.durationWeeks || undefined,
      daysPerWeek: program?.daysPerWeek || undefined,
      tags: program?.tags || [],
      workouts: [],
    },
  });

  async function onSubmit(data: CreateProgramInput) {
    setSaving(true);
    try {
      data.workouts = workouts;

      if (program) {
        const result = await updateProgramAction(program.id, data);
        if (result.success) {
          toast.success("Program updated");
          router.push(`/programs/${program.id}`);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createProgramAction(data);
        if (result.success) {
          toast.success("Program created");
          router.push(`/programs/${result.data.id}`);
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Metadata Card */}
        <Card>
          <CardHeader>
            <CardTitle>Program Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Program Name</FormLabel>
                  <FormControl><Input placeholder="e.g., 12-Week Strength Program" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea placeholder="Program description..." {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="durationWeeks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (weeks)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="daysPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Days per week</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={(v) => field.onChange(parseInt(v))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isTemplate"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 sm:col-span-2">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="!mt-0">Save as template</FormLabel>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Program Builder */}
        <ProgramBuilder
          workouts={workouts}
          onChange={setWorkouts}
          exerciseLibrary={exercises}
        />

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : program ? "Update Program" : "Create Program"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Helper to map DB workout to input type
function mapWorkoutToInput(w: any): WorkoutInput {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    dayIndex: w.dayIndex,
    weekIndex: w.weekIndex,
    orderIndex: w.orderIndex,
    estimatedMinutes: w.estimatedMinutes,
    blocks: w.blocks.map((b: any, bi: number) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      orderIndex: bi,
      rounds: b.rounds,
      restBetweenRounds: b.restBetweenRounds,
      timeCap: b.timeCap,
      notes: b.notes,
      exercises: b.exercises.map((e: any, ei: number) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        orderIndex: ei,
        restSeconds: e.restSeconds,
        notes: e.notes,
        supersetGroup: e.supersetGroup,
        sets: e.sets.map((s: any, si: number) => ({
          id: s.id,
          orderIndex: si,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetDistance: s.targetDistance,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      })),
    })),
  };
}
```

#### 10b. ProgramBuilder (workout/block/exercise DnD)

```typescript
// components/programs/program-builder.tsx
"use client";

// This component manages the workout->block->exercise->set hierarchy with drag-drop.
// It receives `workouts` state and `onChange` callback from ProgramEditor.
//
// Structure:
// - Each workout is a Card
// - Inside each workout: list of blocks (sortable via @dnd-kit)
// - Inside each block: list of exercises (sortable via @dnd-kit)
// - Each exercise row has inline set editing (SetEditor sub-component)
// - "Add Workout" button at the bottom
// - "Add Block" button inside each workout
// - "Add Exercise" button inside each block (opens ExercisePickerDialog)

import { useState, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { ExercisePickerDialog } from "./exercise-picker-dialog";
import { SetEditor } from "./set-editor";
import type { WorkoutInput, WorkoutBlockInput, BlockExerciseInput, ExerciseSetInput } from "@/lib/validators/program";

interface Props {
  workouts: WorkoutInput[];
  onChange: (workouts: WorkoutInput[]) => void;
  exerciseLibrary: any[];
}

export function ProgramBuilder({ workouts, onChange, exerciseLibrary }: Props) {
  // State for exercise picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    workoutIdx: number;
    blockIdx: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // --- Workout operations ---
  function addWorkout() {
    const idx = workouts.length;
    onChange([
      ...workouts,
      {
        name: `Day ${idx + 1}`,
        dayIndex: idx,
        weekIndex: 0,
        orderIndex: idx,
        blocks: [
          { name: "Main", type: "NORMAL", orderIndex: 0, rounds: 1, exercises: [] },
        ],
      },
    ]);
  }

  function removeWorkout(idx: number) {
    const next = workouts.filter((_, i) => i !== idx).map((w, i) => ({
      ...w, orderIndex: i, dayIndex: i,
    }));
    onChange(next);
  }

  function updateWorkoutField(idx: number, field: string, value: any) {
    const next = [...workouts];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  // --- Block operations ---
  function addBlock(workoutIdx: number) {
    const next = [...workouts];
    const w = next[workoutIdx];
    w.blocks = [
      ...w.blocks,
      {
        name: "New Block",
        type: "NORMAL",
        orderIndex: w.blocks.length,
        rounds: 1,
        exercises: [],
      },
    ];
    onChange(next);
  }

  function removeBlock(workoutIdx: number, blockIdx: number) {
    const next = [...workouts];
    next[workoutIdx].blocks = next[workoutIdx].blocks
      .filter((_, i) => i !== blockIdx)
      .map((b, i) => ({ ...b, orderIndex: i }));
    onChange(next);
  }

  function updateBlockField(workoutIdx: number, blockIdx: number, field: string, value: any) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx] = {
      ...next[workoutIdx].blocks[blockIdx],
      [field]: value,
    };
    onChange(next);
  }

  // --- Exercise operations ---
  function openExercisePicker(workoutIdx: number, blockIdx: number) {
    setPickerTarget({ workoutIdx, blockIdx });
    setPickerOpen(true);
  }

  function addExerciseToBlock(exercise: any) {
    if (!pickerTarget) return;
    const { workoutIdx, blockIdx } = pickerTarget;
    const next = [...workouts];
    const block = next[workoutIdx].blocks[blockIdx];
    block.exercises = [
      ...block.exercises,
      {
        exerciseId: exercise.id,
        orderIndex: block.exercises.length,
        restSeconds: 60,
        notes: null,
        supersetGroup: null,
        sets: [
          {
            orderIndex: 0,
            setType: "NORMAL",
            targetReps: exercise.defaultReps || 10,
            targetWeight: null,
            targetDuration: null,
            targetDistance: null,
            targetRPE: null,
            restAfter: null,
          },
        ],
        // Store exercise name for display (not persisted, just for UI)
        _exerciseName: exercise.name,
        _exerciseBodyRegion: exercise.bodyRegion,
      } as any,
    ];
    onChange(next);
    setPickerOpen(false);
  }

  function removeExercise(workoutIdx: number, blockIdx: number, exIdx: number) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises = next[workoutIdx].blocks[blockIdx].exercises
      .filter((_, i) => i !== exIdx)
      .map((e, i) => ({ ...e, orderIndex: i }));
    onChange(next);
  }

  function updateExerciseSets(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number,
    sets: ExerciseSetInput[]
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises[exIdx].sets = sets;
    onChange(next);
  }

  // --- DnD for blocks within a workout ---
  function handleBlockDragEnd(workoutIdx: number, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = [...workouts];
    const blocks = next[workoutIdx].blocks;
    const oldIdx = blocks.findIndex((b) => `block-${workoutIdx}-${b.orderIndex}` === active.id);
    const newIdx = blocks.findIndex((b) => `block-${workoutIdx}-${b.orderIndex}` === over.id);

    if (oldIdx !== -1 && newIdx !== -1) {
      next[workoutIdx].blocks = arrayMove(blocks, oldIdx, newIdx).map((b, i) => ({
        ...b,
        orderIndex: i,
      }));
      onChange(next);
    }
  }

  // --- DnD for exercises within a block ---
  function handleExerciseDragEnd(
    workoutIdx: number,
    blockIdx: number,
    event: DragEndEvent
  ) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = [...workouts];
    const exercises = next[workoutIdx].blocks[blockIdx].exercises;
    const oldIdx = exercises.findIndex(
      (e) => `ex-${workoutIdx}-${blockIdx}-${e.orderIndex}` === active.id
    );
    const newIdx = exercises.findIndex(
      (e) => `ex-${workoutIdx}-${blockIdx}-${e.orderIndex}` === over.id
    );

    if (oldIdx !== -1 && newIdx !== -1) {
      next[workoutIdx].blocks[blockIdx].exercises = arrayMove(
        exercises,
        oldIdx,
        newIdx
      ).map((e, i) => ({ ...e, orderIndex: i }));
      onChange(next);
    }
  }

  // --- Look up exercise name from library ---
  function getExerciseName(exerciseId: string, fallback?: string): string {
    const ex = exerciseLibrary.find((e) => e.id === exerciseId);
    return ex?.name || fallback || "Unknown Exercise";
  }

  // --- Render ---
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-card p-4 rounded-lg border">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Workouts</h2>
          <p className="text-sm text-muted-foreground">
            Build your program's workout structure. Drag to reorder.
          </p>
        </div>
      </div>

      {workouts.map((workout, wi) => (
        <Card key={wi} className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-3 flex-1">
              <Input
                value={workout.name}
                onChange={(e) => updateWorkoutField(wi, "name", e.target.value)}
                className="text-lg font-bold max-w-xs"
              />
              <Input
                type="number"
                value={workout.estimatedMinutes ?? ""}
                onChange={(e) =>
                  updateWorkoutField(wi, "estimatedMinutes", e.target.value ? parseInt(e.target.value) : null)
                }
                placeholder="Est. min"
                className="w-24"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeWorkout(wi)} className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleBlockDragEnd(wi, e)}
            >
              <SortableContext
                items={workout.blocks.map((b) => `block-${wi}-${b.orderIndex}`)}
                strategy={verticalListSortingStrategy}
              >
                {workout.blocks.map((block, bi) => (
                  <div key={bi} className="border rounded-lg p-4 bg-muted/30">
                    {/* Block header */}
                    <div className="flex items-center gap-3 mb-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <Input
                        value={block.name || ""}
                        onChange={(e) => updateBlockField(wi, bi, "name", e.target.value)}
                        placeholder="Block name"
                        className="max-w-[200px]"
                      />
                      <Select
                        value={block.type}
                        onValueChange={(v) => updateBlockField(wi, bi, "type", v)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NORMAL">Normal</SelectItem>
                          <SelectItem value="SUPERSET">Superset</SelectItem>
                          <SelectItem value="CIRCUIT">Circuit</SelectItem>
                          <SelectItem value="AMRAP">AMRAP</SelectItem>
                          <SelectItem value="EMOM">EMOM</SelectItem>
                        </SelectContent>
                      </Select>
                      {(block.type === "CIRCUIT" || block.type === "AMRAP") && (
                        <Input
                          type="number"
                          value={block.rounds}
                          onChange={(e) => updateBlockField(wi, bi, "rounds", parseInt(e.target.value) || 1)}
                          className="w-20"
                          min={1}
                          placeholder="Rounds"
                        />
                      )}
                      {block.type === "AMRAP" && (
                        <Input
                          type="number"
                          value={block.timeCap ?? ""}
                          onChange={(e) => updateBlockField(wi, bi, "timeCap", e.target.value ? parseInt(e.target.value) : null)}
                          className="w-24"
                          placeholder="Time cap (s)"
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBlock(wi, bi)}
                        className="ml-auto text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Exercises in this block */}
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleExerciseDragEnd(wi, bi, e)}
                    >
                      <SortableContext
                        items={block.exercises.map((e) => `ex-${wi}-${bi}-${e.orderIndex}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {block.exercises.map((ex, ei) => (
                            <div
                              key={ei}
                              className="border rounded-md p-3 bg-background"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                <span className="font-medium flex-1">
                                  {getExerciseName(ex.exerciseId, (ex as any)._exerciseName)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeExercise(wi, bi, ei)}
                                  className="text-destructive h-7 w-7"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              {/* Inline Set Editor */}
                              <SetEditor
                                sets={ex.sets}
                                onChange={(sets) => updateExerciseSets(wi, bi, ei, sets)}
                              />
                            </div>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => openExercisePicker(wi, bi)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Exercise
                    </Button>
                  </div>
                ))}
              </SortableContext>
            </DndContext>

            <Button variant="secondary" size="sm" onClick={() => addBlock(wi)} className="w-full border-dashed border-2">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Block
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button variant="secondary" onClick={addWorkout} className="w-full border-dashed border-2 bg-background hover:bg-muted">
        <Plus className="mr-2 h-4 w-4" /> Add Workout Day
      </Button>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        onSelect={addExerciseToBlock}
      />
    </div>
  );
}
```

#### 10c. ExercisePickerDialog

```typescript
// components/programs/exercise-picker-dialog.tsx
"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: any[];
  onSelect: (exercise: any) => void;
}

export function ExercisePickerDialog({ open, onOpenChange, exercises, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [bodyRegion, setBodyRegion] = useState<string>("all");

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (bodyRegion !== "all" && ex.bodyRegion !== bodyRegion) return false;
      return true;
    });
  }, [exercises, search, bodyRegion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Exercise</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={bodyRegion} onValueChange={setBodyRegion}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Body region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
              <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
              <SelectItem value="CORE">Core</SelectItem>
              <SelectItem value="FULL_BODY">Full Body</SelectItem>
              <SelectItem value="BALANCE">Balance</SelectItem>
              <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="space-y-1">
            {filtered.map((ex) => (
              <Button
                key={ex.id}
                variant="ghost"
                className="w-full justify-start h-auto py-3"
                onClick={() => onSelect(ex)}
              >
                <div className="text-left">
                  <p className="font-medium">{ex.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {ex.bodyRegion.replace("_", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {ex.difficultyLevel}
                    </Badge>
                  </div>
                </div>
              </Button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                No exercises found.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

#### 10d. SetEditor (inline set editing)

```typescript
// components/programs/set-editor.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Copy } from "lucide-react";
import type { ExerciseSetInput } from "@/lib/validators/program";

interface Props {
  sets: ExerciseSetInput[];
  onChange: (sets: ExerciseSetInput[]) => void;
}

export function SetEditor({ sets, onChange }: Props) {
  function addSet() {
    const last = sets[sets.length - 1];
    onChange([
      ...sets,
      {
        orderIndex: sets.length,
        setType: last?.setType || "NORMAL",
        targetReps: last?.targetReps || 10,
        targetWeight: last?.targetWeight || null,
        targetDuration: last?.targetDuration || null,
        targetDistance: last?.targetDistance || null,
        targetRPE: last?.targetRPE || null,
        restAfter: last?.restAfter || null,
      },
    ]);
  }

  function removeSet(idx: number) {
    if (sets.length <= 1) return; // Must have at least 1 set
    onChange(
      sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, orderIndex: i }))
    );
  }

  function updateSet(idx: number, field: string, value: any) {
    const next = [...sets];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      {/* Header row */}
      <div className="grid grid-cols-[60px_70px_70px_70px_50px_32px] gap-1.5 text-xs text-muted-foreground font-medium px-1">
        <span>Type</span>
        <span>Reps</span>
        <span>Weight</span>
        <span>Duration</span>
        <span>RPE</span>
        <span></span>
      </div>
      {sets.map((set, si) => (
        <div key={si} className="grid grid-cols-[60px_70px_70px_70px_50px_32px] gap-1.5 items-center">
          <Select value={set.setType} onValueChange={(v) => updateSet(si, "setType", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="WARMUP">Warmup</SelectItem>
              <SelectItem value="DROP_SET">Drop</SelectItem>
              <SelectItem value="FAILURE">Failure</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={set.targetReps ?? ""}
            onChange={(e) => updateSet(si, "targetReps", e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 text-xs"
            placeholder="Reps"
            min={0}
          />
          <Input
            type="number"
            value={set.targetWeight ?? ""}
            onChange={(e) => updateSet(si, "targetWeight", e.target.value ? parseFloat(e.target.value) : null)}
            className="h-8 text-xs"
            placeholder="lbs"
            min={0}
            step={2.5}
          />
          <Input
            type="number"
            value={set.targetDuration ?? ""}
            onChange={(e) => updateSet(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 text-xs"
            placeholder="sec"
            min={0}
          />
          <Input
            type="number"
            value={set.targetRPE ?? ""}
            onChange={(e) => updateSet(si, "targetRPE", e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 text-xs"
            placeholder="RPE"
            min={1}
            max={10}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => removeSet(si)}
            disabled={sets.length <= 1}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addSet} className="text-xs h-7">
        <Plus className="mr-1 h-3 w-3" /> Add Set
      </Button>
    </div>
  );
}
```

**Dependencies:** P1-T3, P1-T5
**Acceptance criteria:**
- Can add/remove workouts, blocks, exercises, sets
- Block type selector changes between NORMAL, SUPERSET, CIRCUIT, AMRAP, EMOM
- AMRAP shows time cap field, CIRCUIT shows rounds field
- Exercise picker filters by name and body region
- Set editor supports reps, weight, duration, RPE, set type
- Adding a set copies values from the previous set
- Saving persists the full hierarchy to the database

---

### P1-T11: AssignProgramDialog Component

**Files to create:**
- `components/programs/assign-program-dialog.tsx`

**Step-by-step:**

```typescript
// components/programs/assign-program-dialog.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignProgramAction } from "@/actions/program-actions";
import { format } from "date-fns";

interface Props {
  programId: string;
  patients: { id: string; firstName: string; lastName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignProgramDialog({ programId, patients, open, onOpenChange }: Props) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  async function handleAssign() {
    if (!patientId) { toast.error("Select a client"); return; }
    setSaving(true);
    try {
      const result = await assignProgramAction({
        programId,
        patientId,
        startDate: new Date(startDate).toISOString(),
      });
      if (result.success) {
        toast.success("Program assigned and sessions scheduled");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Program to Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAssign} disabled={saving}>
            {saving ? "Assigning..." : "Assign Program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Dependencies:** P1-T5
**Acceptance criteria:**
- Dialog shows client list and date picker
- On assign, creates WorkoutSessionV2 records for each workout
- Status transitions to ACTIVE
- Toast confirmation on success

---

### P1-T12: Session Service (WorkoutSessionV2)

**Files to create:**
- `lib/services/session.service.ts`

**Step-by-step:**

```typescript
import { prisma } from "@/lib/prisma";

export async function getSessionsForPatient(
  patientId: string,
  options?: { from?: Date; to?: Date }
) {
  return prisma.workoutSessionV2.findMany({
    where: {
      patientId,
      ...(options?.from || options?.to
        ? {
            scheduledDate: {
              ...(options.from && { gte: options.from }),
              ...(options.to && { lte: options.to }),
            },
          }
        : {}),
    },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
          blocks: {
            include: {
              exercises: {
                include: {
                  exercise: true,
                  sets: { orderBy: { orderIndex: "asc" } },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: { orderBy: { setIndex: "asc" } } },
        orderBy: { orderIndex: "asc" },
      },
      feedback: true,
    },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function getSessionById(sessionId: string) {
  return prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
          blocks: {
            include: {
              exercises: {
                include: {
                  exercise: { include: { media: true } },
                  sets: { orderBy: { orderIndex: "asc" } },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: { orderBy: { setIndex: "asc" } } },
        orderBy: { orderIndex: "asc" },
      },
      feedback: true,
    },
  });
}

export async function rescheduleSession(sessionId: string, newDate: Date) {
  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: { scheduledDate: newDate },
  });
}

export async function updateSessionStatus(
  sessionId: string,
  status: string,
  data?: { startedAt?: Date; completedAt?: Date; overallRPE?: number; overallNotes?: string; durationMinutes?: number }
) {
  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: { status, ...data },
  });
}

export async function logExercise(
  sessionId: string,
  blockExerciseId: string,
  orderIndex: number,
  setLogs: {
    setIndex: number;
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    actualRPE?: number;
    notes?: string;
  }[]
) {
  return prisma.sessionExerciseLog.create({
    data: {
      sessionId,
      blockExerciseId,
      orderIndex,
      status: "COMPLETED",
      completedAt: new Date(),
      setLogs: {
        create: setLogs.map((sl) => ({
          ...sl,
          completedAt: new Date(),
        })),
      },
    },
    include: { setLogs: true },
  });
}

export async function submitSessionFeedback(
  sessionId: string,
  patientId: string,
  rating: string,
  comment?: string
) {
  return prisma.sessionFeedback.create({
    data: {
      sessionId,
      patientId,
      rating: rating as any,
      comment,
    },
  });
}

export async function getSessionsForClinician(
  clinicianId: string,
  options?: { from?: Date; to?: Date; patientId?: string }
) {
  return prisma.workoutSessionV2.findMany({
    where: {
      workout: {
        program: { clinicianId },
      },
      ...(options?.patientId && { patientId: options.patientId }),
      ...(options?.from || options?.to
        ? {
            scheduledDate: {
              ...(options?.from && { gte: options.from }),
              ...(options?.to && { lte: options.to }),
            },
          }
        : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      workout: {
        include: {
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function getUpcomingSessions(patientId: string, limit = 5) {
  return prisma.workoutSessionV2.findMany({
    where: {
      patientId,
      status: "SCHEDULED",
      scheduledDate: { gte: new Date() },
    },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
    take: limit,
  });
}
```

**Dependencies:** P1-T1
**Acceptance criteria:**
- All functions correctly query/mutate WorkoutSessionV2
- Includes necessary relations for calendar and session logging
- `logExercise` creates nested SessionExerciseLog + SetLog

---

### P1-T13: Calendar Component with Sidebar (CalendarWithSidebar)

**Files to create:**
- `components/calendar/calendar-with-sidebar.tsx`
- `actions/session-actions.ts`

**Step-by-step:**

First, create the server actions for sessions:

```typescript
// actions/session-actions.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as sessionService from "@/lib/services/session.service";

export async function rescheduleSessionAction(sessionId: string, newDate: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const session = await sessionService.rescheduleSession(sessionId, new Date(newDate));
    revalidatePath("/dashboard");
    revalidatePath("/programs");
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to reschedule session:", error);
    return { success: false as const, error: "Failed to reschedule session" };
  }
}

export async function getClinicianSessionsAction(from: string, to: string, patientId?: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "CLINICIAN") return { success: false as const, error: "Unauthorized" };

  try {
    const sessions = await sessionService.getSessionsForClinician(dbUser.id, {
      from: new Date(from),
      to: new Date(to),
      patientId,
    });
    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}

export async function getPatientSessionsAction(from?: string, to?: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const sessions = await sessionService.getSessionsForPatient(dbUser.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}
```

Now the calendar component:

```typescript
// components/calendar/calendar-with-sidebar.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, dateFnsLocalizer, Views, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { rescheduleSessionAction } from "@/actions/session-actions";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

const DnDCalendar = withDragAndDrop(Calendar);

interface SessionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  patientName?: string;
  programName?: string;
  resource: any;
}

interface Props {
  sessions: any[];
  isClinician: boolean;
  onSessionClick?: (sessionId: string) => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "hsl(var(--primary))", text: "hsl(var(--primary-foreground))" },
  IN_PROGRESS: { bg: "#f59e0b", text: "#fff" },
  COMPLETED: { bg: "#22c55e", text: "#fff" },
  MISSED: { bg: "#ef4444", text: "#fff" },
  SKIPPED: { bg: "#6b7280", text: "#fff" },
};

export function CalendarWithSidebar({ sessions, isClinician, onSessionClick }: Props) {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const events: SessionEvent[] = sessions.map((s: any) => ({
    id: s.id,
    title: s.workout?.program?.name || "Workout",
    start: new Date(s.scheduledDate),
    end: new Date(new Date(s.scheduledDate).getTime() + 60 * 60 * 1000),
    status: s.status,
    patientName: s.patient ? `${s.patient.firstName} ${s.patient.lastName}` : undefined,
    programName: s.workout?.program?.name,
    resource: s,
  }));

  const handleEventDrop = useCallback(
    async ({ event, start }: any) => {
      if (!isClinician) {
        toast.error("Only coaches can reschedule sessions");
        return;
      }
      const result = await rescheduleSessionAction(event.id, new Date(start).toISOString());
      if (result.success) {
        toast.success("Session rescheduled");
      } else {
        toast.error(result.error);
      }
    },
    [isClinician]
  );

  return (
    <div className="h-[650px] w-full rounded-md border p-4 bg-card">
      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {Object.entries(statusColors).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.bg }}
            />
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        ))}
      </div>

      <DnDCalendar
        localizer={localizer}
        events={events}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        onEventDrop={handleEventDrop}
        onSelectEvent={(event: any) => onSessionClick?.(event.id)}
        resizable={false}
        draggableAccessor={() => isClinician}
        style={{ height: "calc(100% - 40px)" }}
        eventPropGetter={(event: any) => {
          const colors = statusColors[event.status] || statusColors.SCHEDULED;
          return {
            style: {
              backgroundColor: colors.bg,
              color: colors.text,
              borderRadius: "4px",
              border: "none",
              fontSize: "0.75rem",
            },
          };
        }}
        tooltipAccessor={(event: any) => {
          let tip = event.title;
          if (event.patientName) tip += ` | ${event.patientName}`;
          tip += ` | ${event.status}`;
          return tip;
        }}
      />
    </div>
  );
}
```

**Dependencies:** P1-T12
**Acceptance criteria:**
- Calendar renders sessions with color-coded status
- Drag-to-reschedule works for clinicians, blocked for patients
- Legend shows all status colors
- Click on session triggers callback

---

### P1-T14: Calendar Color-Coding by Session Status

This is handled within P1-T13 via the `statusColors` map and `eventPropGetter`. The colors are:
- SCHEDULED: primary blue
- IN_PROGRESS: amber (#f59e0b)
- COMPLETED: green (#22c55e)
- MISSED: red (#ef4444)
- SKIPPED: gray (#6b7280)

**Dependencies:** P1-T13
**Acceptance criteria:** Already covered in P1-T13.

---

### P1-T15: Clinician Dashboard Updates

**Files to modify:**
- `app/(platform)/dashboard/page.tsx`
- `components/dashboard/clinician-dashboard.tsx`

**Step-by-step:**

1. In `app/(platform)/dashboard/page.tsx`, add queries for new data (inside the CLINICIAN branch):

```typescript
// Add these to the Promise.all for clinicians:
import * as sessionService from "@/lib/services/session.service";
import { startOfWeek, endOfWeek } from "date-fns";

// Inside the CLINICIAN branch, add to the Promise.all:
const now = new Date();
const weekStart = startOfWeek(now);
const weekEnd = endOfWeek(now);

// Add these queries:
const [programCount, upcomingSessions] = await Promise.all([
  prisma.program.count({
    where: { clinicianId: user.id, status: "ACTIVE" },
  }),
  sessionService.getSessionsForClinician(user.id, {
    from: weekStart,
    to: weekEnd,
  }),
]);
```

2. Pass new props to `ClinicianDashboard`:

```typescript
<ClinicianDashboard
  // ... existing props
  activePrograms={programCount}
  upcomingSessions={upcomingSessions}
/>
```

3. Update `ClinicianDashboard` component to show:
- New stat card: "Active Programs" count (links to `/programs`)
- "This Week's Sessions" section showing upcoming sessions in a list
- Quick action button: "Create Program" linking to `/programs/new`

**Dependencies:** P1-T4, P1-T12
**Acceptance criteria:**
- Dashboard shows program count stat card
- Upcoming sessions list renders this week's scheduled sessions
- Navigation links to `/programs` and `/programs/new` work

---

### P1 Navigation Update

**Files to modify:**
- `components/layout/sidebar.tsx` (add "Programs" link for clinicians, route: `/programs`, icon: `Dumbbell` from lucide-react)

Ensure the link appears in the sidebar for CLINICIAN users, between "Exercises" and "Clients" (or equivalent position).

---

## 3. Phase 2 -- Client Portal + Session Logging

**Goal:** Build the patient-facing experience. Patients see their assigned programs, log workouts in real time, track streaks, and provide session feedback. A new `app/(client)/` route group provides a dedicated client portal layout.

**Dependencies:** Phase 1 complete

---

### P2-T1: Client Portal Route Group and Layout

**Files to create:**
- `app/(client)/layout.tsx`
- `app/(client)/home/page.tsx`

**Step-by-step:**

The `(client)` route group uses a simplified layout for the patient experience. It reuses Clerk auth but has its own navigation.

```typescript
// app/(client)/layout.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientSidebar } from "@/components/client/client-sidebar";
import { Header } from "@/components/layout/header";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/onboarding");
  if (!user.onboarded) redirect("/onboarding");
  if (user.role !== "PATIENT") redirect("/dashboard");

  const unreadCount = await prisma.message.count({
    where: { recipientId: user.id, isRead: false },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(0.97_0.005_247)]">
      <ClientSidebar
        unreadMessageCount={unreadCount}
        userName={`${user.firstName} ${user.lastName}`}
        userImageUrl={user.imageUrl}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} unreadMessageCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

**Files to create:**
- `components/client/client-sidebar.tsx`

The sidebar has these nav items: Home (`/home`), My Workouts (`/my-workouts`), Progress (`/progress`), Messages (`/messages`), Settings (`/settings`).

**Dependencies:** P1-T1
**Acceptance criteria:**
- `/home` loads for PATIENT users
- CLINICIAN users are redirected to `/dashboard`
- Client-specific sidebar renders

---

### P2-T2: Client Home / Dashboard Page

**Files to create:**
- `app/(client)/home/page.tsx`
- `components/client/client-home-dashboard.tsx`

**Step-by-step:**

Server component fetches: active programs, upcoming sessions, recent session feedback, streak data.

```typescript
// app/(client)/home/page.tsx
import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import * as sessionService from "@/lib/services/session.service";
import { ClientHomeDashboard } from "@/components/client/client-home-dashboard";

export default async function ClientHomePage() {
  const user = await getCurrentUser();

  const [programs, upcomingSessions, recentSessions] = await Promise.all([
    programService.getProgramsForPatient(user.id),
    sessionService.getUpcomingSessions(user.id, 3),
    sessionService.getSessionsForPatient(user.id),
  ]);

  // Calculate streak
  const completedDates = recentSessions
    .filter((s) => s.status === "COMPLETED" && s.completedAt)
    .map((s) => new Date(s.completedAt!).toDateString());
  const uniqueDates = [...new Set(completedDates)].sort().reverse();

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    if (uniqueDates[i] === expected.toDateString()) {
      streak++;
    } else {
      break;
    }
  }

  return (
    <ClientHomeDashboard
      programs={programs}
      upcomingSessions={upcomingSessions}
      streak={streak}
      totalCompleted={completedDates.length}
    />
  );
}
```

The `ClientHomeDashboard` component renders:
- Greeting header with user name
- Stat cards: streak count, total workouts completed, active programs count
- "Today's Workout" card (first upcoming session, with "Start Workout" button linking to `/my-workouts/session/[id]`)
- Upcoming sessions list (next 3)

**Dependencies:** P1-T4, P1-T12
**Acceptance criteria:**
- Dashboard shows streak, stats, and upcoming workouts
- "Start Workout" links to the session logger

---

### P2-T3: My Workouts Page

**Files to create:**
- `app/(client)/my-workouts/page.tsx`
- `components/client/my-workouts-list.tsx`

**Step-by-step:**

Lists all assigned programs with their sessions. Uses Tabs: "Upcoming", "Completed", "All".

```typescript
// app/(client)/my-workouts/page.tsx
import { getCurrentUser } from "@/lib/current-user";
import * as sessionService from "@/lib/services/session.service";
import { MyWorkoutsList } from "@/components/client/my-workouts-list";

export default async function MyWorkoutsPage() {
  const user = await getCurrentUser();
  const sessions = await sessionService.getSessionsForPatient(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">My Workouts</h1>
      <MyWorkoutsList sessions={sessions} />
    </div>
  );
}
```

`MyWorkoutsList` client component:
- Tabs: Upcoming (SCHEDULED), Completed (COMPLETED), All
- Each session card shows: workout name, program name, scheduled date, status badge
- Click navigates to `/my-workouts/session/[id]`

**Dependencies:** P1-T12
**Acceptance criteria:**
- All sessions for the patient are displayed
- Tabs filter by status
- Navigation to session detail works

---

### P2-T4: Session Logger Page and Component

**Files to create:**
- `app/(client)/my-workouts/session/[id]/page.tsx`
- `components/client/session-logger.tsx`
- `actions/session-log-actions.ts`

**Step-by-step:**

This is the core client-facing feature. The session logger walks the patient through each exercise in order, letting them log actual reps/weight/duration per set.

```typescript
// app/(client)/my-workouts/session/[id]/page.tsx
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import * as sessionService from "@/lib/services/session.service";
import { SessionLogger } from "@/components/client/session-logger";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;

  const session = await sessionService.getSessionById(id);
  if (!session || session.patientId !== user.id) notFound();

  return <SessionLogger session={session} />;
}
```

```typescript
// actions/session-log-actions.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as sessionService from "@/lib/services/session.service";

export async function startSessionAction(sessionId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const session = await sessionService.updateSessionStatus(sessionId, "IN_PROGRESS", {
      startedAt: new Date(),
    });
    revalidatePath("/my-workouts");
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to start session:", error);
    return { success: false as const, error: "Failed to start session" };
  }
}

export async function logExerciseAction(input: {
  sessionId: string;
  blockExerciseId: string;
  orderIndex: number;
  setLogs: {
    setIndex: number;
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    actualRPE?: number;
    notes?: string;
  }[];
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  try {
    const log = await sessionService.logExercise(
      input.sessionId,
      input.blockExerciseId,
      input.orderIndex,
      input.setLogs
    );
    return { success: true as const, data: log };
  } catch (error) {
    console.error("Failed to log exercise:", error);
    return { success: false as const, error: "Failed to log exercise" };
  }
}

export async function completeSessionAction(
  sessionId: string,
  data: { overallRPE?: number; overallNotes?: string }
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  try {
    const startedSession = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId },
      select: { startedAt: true },
    });
    const durationMinutes = startedSession?.startedAt
      ? Math.round((Date.now() - new Date(startedSession.startedAt).getTime()) / 60000)
      : undefined;

    const session = await sessionService.updateSessionStatus(sessionId, "COMPLETED", {
      completedAt: new Date(),
      overallRPE: data.overallRPE,
      overallNotes: data.overallNotes,
      durationMinutes,
    });
    revalidatePath("/my-workouts");
    revalidatePath("/home");
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to complete session:", error);
    return { success: false as const, error: "Failed to complete session" };
  }
}

export async function submitSessionFeedbackAction(input: {
  sessionId: string;
  rating: string;
  comment?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const feedback = await sessionService.submitSessionFeedback(
      input.sessionId,
      dbUser.id,
      input.rating,
      input.comment
    );
    return { success: true as const, data: feedback };
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    return { success: false as const, error: "Failed to submit feedback" };
  }
}
```

The `SessionLogger` client component (`components/client/session-logger.tsx`):

**Props interface:**
```typescript
interface SessionLoggerProps {
  session: Awaited<ReturnType<typeof sessionService.getSessionById>>;
}
```

**Behavior:**
- If session status is SCHEDULED, show "Start Workout" button that calls `startSessionAction`
- If IN_PROGRESS, show the exercise flow:
  - Progress bar at top (X of Y exercises completed)
  - Current exercise card with: name, video (if available), instructions, target sets
  - For each set: input fields for actual reps, weight, duration (matching what the target has)
  - "Log Set" button per set, "Complete Exercise" button to advance
  - Timer display showing session elapsed time
- After all exercises: completion screen with RPE selector (1-10), notes textarea, "Finish Workout" button
- If COMPLETED, show read-only summary of logged data

**Dependencies:** P1-T12
**Acceptance criteria:**
- Patient can start, log exercises, and complete a session
- Set log data persists to DB
- Session duration is calculated automatically
- Feedback is captured at the end

---

### P2-T5: Session Summary View (Post-Completion)

After a session is completed, the session page shows a summary. This is handled inside `SessionLogger` by checking `session.status === "COMPLETED"` and rendering:
- Total duration
- Exercises completed count
- Per-exercise: logged sets vs target sets
- Overall RPE
- Feedback given

**Dependencies:** P2-T4
**Acceptance criteria:** Already covered in P2-T4.

---

### P2-T6: Streak Tracking Logic

Streak logic lives in the client home page (P2-T2). The algorithm:
1. Get all COMPLETED sessions for the patient
2. Extract unique completion dates
3. Sort descending
4. Starting from today, check if each consecutive day has a completed session
5. Break on first gap

This is a server-side calculation done at page render time. No additional service or model needed.

**Dependencies:** P2-T2
**Acceptance criteria:** Streak number is accurate and updates on page load.

---

### P2-T7: Client Calendar View

**Files to create:**
- `app/(client)/my-workouts/calendar/page.tsx`

**Step-by-step:**

Reuse `CalendarWithSidebar` from P1-T13, passing `isClinician={false}`.

```typescript
// app/(client)/my-workouts/calendar/page.tsx
import { getCurrentUser } from "@/lib/current-user";
import * as sessionService from "@/lib/services/session.service";
import { CalendarWithSidebar } from "@/components/calendar/calendar-with-sidebar";

export default async function ClientCalendarPage() {
  const user = await getCurrentUser();
  const sessions = await sessionService.getSessionsForPatient(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Workout Calendar</h1>
      <CalendarWithSidebar sessions={sessions} isClinician={false} />
    </div>
  );
}
```

**Dependencies:** P1-T13
**Acceptance criteria:**
- Calendar shows all patient sessions with color-coded statuses
- Dragging is disabled for patients

---

### P2-T8: Client Program Detail View

**Files to create:**
- `app/(client)/my-workouts/program/[id]/page.tsx`

Reuses `ProgramDetailView` from P1-T8 with `isClinician={false}`.

**Dependencies:** P1-T8
**Acceptance criteria:** Patients can view their assigned program's full workout structure.

---

### P2-T9: Client Navigation in (platform) Layout

Patients who access the `(platform)` route group should still be able to navigate. Update the existing sidebar to show a "My Portal" link for PATIENT users that navigates to `/home`.

**Dependencies:** P2-T1
**Acceptance criteria:** PATIENT users see "My Portal" in the platform sidebar.

---

### P2-T10: Session Feedback Component

**Files to create:**
- `components/client/session-feedback-form.tsx`

Simple form with:
- RPE slider (1-10)
- Rating selector (FELT_GOOD, MILD_DISCOMFORT, PAINFUL, UNSURE_HOW_TO_PERFORM)
- Comment textarea
- Submit calls `submitSessionFeedbackAction`

**Dependencies:** P2-T4
**Acceptance criteria:** Feedback saves to DB and shows confirmation toast.

---

### P2-T11: Update Patient Detail Page for Clinicians

**Files to modify:**
- `app/(platform)/patients/[id]/page.tsx`

Add tabs or sections for:
- Active programs assigned to this patient (from Program model)
- Upcoming sessions (from WorkoutSessionV2)
- Mini calendar (CalendarWithSidebar filtered to this patient)
- Recent session logs with feedback

Query data using `programService.getProgramsForPatient` and `sessionService.getSessionsForPatient`.

**Dependencies:** P1-T4, P1-T12
**Acceptance criteria:**
- Clinician can see all programs, sessions, and feedback for a specific patient
- Calendar is patient-scoped

---

## 4. Phase 3 -- Progress Tracking + Check-ins + Habits

**Goal:** Enable comprehensive progress tracking: body metrics, progress photos, structured check-ins with AI analysis, and daily habit tracking.

**Dependencies:** Phase 2 complete

---

### P3-T1: Body Metrics Service

**Files to create:**
- `lib/services/body-metric.service.ts`
- `lib/validators/body-metric.ts`
- `actions/body-metric-actions.ts`

**Service functions:**
- `recordMetric(patientId, data: { metricType, value, unit, notes? })` -- creates BodyMetric
- `getMetrics(patientId, metricType?: string, from?: Date, to?: Date)` -- queries with filters
- `getLatestMetrics(patientId)` -- gets latest value per metricType
- `deleteMetric(id)` -- deletes by ID

**Zod schema:**
```typescript
export const bodyMetricSchema = z.object({
  metricType: z.enum(["WEIGHT", "BODY_FAT", "CHEST", "WAIST", "HIPS", "BICEP", "THIGH", "CALF", "NECK"]),
  value: z.number().positive(),
  unit: z.string().min(1),
  notes: z.string().max(500).optional(),
});
```

**Server actions:** `recordMetricAction`, `getMetricsAction`, `deleteMetricAction` -- follow existing pattern.

**Dependencies:** P1-T1
**Acceptance criteria:**
- Metrics are stored and retrievable
- Can query by type and date range
- Latest metric per type is efficiently queryable

---

### P3-T2: Body Metrics Page (Client)

**Files to create:**
- `app/(client)/progress/page.tsx`
- `components/progress/body-metrics-chart.tsx`
- `components/progress/record-metric-dialog.tsx`

**Page structure:**
- Header with "Record Metric" button
- Tabs per metric type showing Recharts line charts (date on X axis, value on Y)
- Latest values summary cards at top
- Table of recent recordings below chart

**Dependencies:** P3-T1
**Acceptance criteria:**
- Patient can record and view body metrics
- Charts update after new recording
- Supports all metric types

---

### P3-T3: Progress Photos Upload

**Files to create:**
- `lib/services/progress-photo.service.ts`
- `actions/progress-photo-actions.ts`
- `components/progress/progress-photos.tsx`
- `components/progress/upload-photo-dialog.tsx`

**Service functions:**
- `uploadPhoto(patientId, data: { imageUrl, angle?, notes?, isPrivate? })` -- creates ProgressPhoto
- `getPhotos(patientId, from?: Date, to?: Date)` -- queries with date range
- `deletePhoto(id)` -- deletes by ID

**Photo upload uses Uploadthing.** The `UploadPhotoDialog` component uses the existing `@uploadthing/react` UploadButton, then calls `uploadPhotoAction` with the returned URL.

**The progress photos component** renders a gallery grid with date/angle labels, click to expand in a dialog.

**Dependencies:** P1-T1
**Acceptance criteria:**
- Photos upload via Uploadthing
- Gallery view displays photos sorted by date
- Clinician can view patient photos (if not private)

---

### P3-T4: Check-In Template Builder (Clinician)

**Files to create:**
- `lib/services/checkin.service.ts`
- `lib/validators/checkin.ts`
- `actions/checkin-actions.ts`
- `app/(platform)/check-ins/page.tsx`
- `app/(platform)/check-ins/new/page.tsx`
- `components/checkins/checkin-template-builder.tsx`

**Service functions:**
- `createTemplate(clinicianId, data)` -- creates CheckInTemplate + questions
- `getTemplates(clinicianId)` -- lists templates
- `getTemplateById(id)` -- full template with questions
- `assignTemplate(data: { templateId, patientId, clinicianId, startDate, frequency })` -- creates CheckInAssignment
- `getAssignments(clinicianId, patientId?)` -- lists assignments
- `submitResponse(assignmentId, patientId, answers: Json)` -- creates CheckInResponse

**Zod schemas:**
```typescript
export const checkInQuestionSchema = z.object({
  questionText: z.string().min(1).max(500),
  questionType: z.enum(["TEXT", "SCALE", "MULTIPLE_CHOICE", "YES_NO", "PHOTO"]),
  options: z.array(z.string()).default([]),
  isRequired: z.boolean().default(true),
});

export const createCheckInTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"]).default("WEEKLY"),
  customDays: z.number().int().positive().optional(),
  questions: z.array(checkInQuestionSchema).min(1),
});
```

**Template builder UI:** Form with name, description, frequency selector. Questions section with "Add Question" button. Each question has: type selector, question text input, options list (for MULTIPLE_CHOICE), required toggle. Questions are sortable via @dnd-kit.

**Dependencies:** P1-T1
**Acceptance criteria:**
- Clinician can create check-in templates with multiple question types
- Templates are saved to DB
- Questions are ordered and configurable

---

### P3-T5: Check-In Assignment Flow

**Files to modify:**
- `components/checkins/assign-checkin-dialog.tsx` (new)
- `app/(platform)/check-ins/page.tsx` (add assignment view)

**AssignCheckInDialog** props: templateId, patients list. On assign, calls `assignTemplateAction` which creates the assignment and calculates `nextDueDate` based on frequency.

**Dependencies:** P3-T4
**Acceptance criteria:**
- Clinician selects template and patient, sets start date
- Assignment created with correct next due date
- Assignment shows in check-in management list

---

### P3-T6: Check-In Submission Page (Client)

**Files to create:**
- `app/(client)/check-ins/page.tsx`
- `app/(client)/check-ins/[id]/page.tsx`
- `components/checkins/checkin-form.tsx`

**`/check-ins` page:** Lists active assignments with due dates. Highlights overdue check-ins.

**`/check-ins/[id]` page:** Renders the check-in form based on template questions. Each question type renders the appropriate input (text area, 1-10 scale slider, radio group, yes/no toggle, photo upload). Submit calls `submitResponseAction`.

**Dependencies:** P3-T4, P3-T5
**Acceptance criteria:**
- Patient sees due check-ins
- Form renders correct input types per question
- Submission updates nextDueDate on the assignment

---

### P3-T7: AI Check-In Analysis API Route

**Files to create:**
- `app/api/ai/analyze-checkin/route.ts`

**Step-by-step:**

POST endpoint that takes a check-in response and generates an AI summary.

```typescript
// app/api/ai/analyze-checkin/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { responseId } = await req.json();

  const response = await prisma.checkInResponse.findUnique({
    where: { id: responseId },
    include: {
      assignment: {
        include: {
          template: { include: { questions: { orderBy: { orderIndex: "asc" } } } },
        },
      },
    },
  });

  if (!response) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const answers = response.answers as Record<string, any>;
  const questions = response.assignment.template.questions;

  const qaPairs = questions.map((q) => ({
    question: q.questionText,
    answer: answers[q.id] || "No response",
  }));

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: "You are a health and fitness coach assistant. Analyze the following client check-in and provide a brief summary highlighting key observations, potential concerns, and suggestions. Be concise and actionable.",
    prompt: `Client check-in responses:\n${qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n\n")}`,
  });

  await prisma.checkInResponse.update({
    where: { id: responseId },
    data: { aiSummary: text },
  });

  return NextResponse.json({ summary: text });
}
```

**Dependencies:** P3-T6
**Acceptance criteria:**
- AI summary is generated and stored
- Response includes actionable insights
- Clinician can view the summary on the response detail page

---

### P3-T8: Check-In Review Page (Clinician)

**Files to create:**
- `app/(platform)/check-ins/responses/page.tsx`
- `components/checkins/response-review-card.tsx`

Lists all pending check-in responses for the clinician's patients. Each card shows: patient name, template name, submitted date, AI summary (if available), and coach notes input. "Mark Reviewed" button updates `isReviewed` and `reviewedAt`.

**Dependencies:** P3-T7
**Acceptance criteria:**
- Clinician sees all unreviewed responses
- Can add coach notes
- Can mark as reviewed

---

### P3-T9: Habit Definition CRUD

**Files to create:**
- `lib/services/habit.service.ts`
- `lib/validators/habit.ts`
- `actions/habit-actions.ts`

**Service functions:**
- `createHabit(patientId, data)` -- creates HabitDefinition
- `getHabits(patientId)` -- lists active habits
- `updateHabit(id, data)` -- updates habit
- `deleteHabit(id)` -- soft delete (isActive = false)
- `logHabit(habitId, date, value?, completed?)` -- creates/upserts HabitLog
- `getHabitLogs(habitId, from, to)` -- queries logs for date range
- `getHabitLogsForPatient(patientId, date)` -- all habit logs for a specific date

**Zod schema:**
```typescript
export const createHabitSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(10).optional(),
  targetValue: z.number().positive().optional(),
  unit: z.string().max(20).optional(),
  frequency: z.enum(["DAILY", "WEEKLY"]).default("DAILY"),
});
```

**Dependencies:** P1-T1
**Acceptance criteria:**
- Habits are created and listed
- Logging uses upsert on the unique constraint [habitId, date]

---

### P3-T10: Habit Tracking UI (Client)

**Files to create:**
- `app/(client)/habits/page.tsx`
- `components/habits/habit-tracker.tsx`
- `components/habits/habit-card.tsx`
- `components/habits/add-habit-dialog.tsx`

**Page layout:**
- Date navigator at top (prev/next day buttons, defaults to today)
- Grid of habit cards for the selected date
- Each card shows: habit name, icon, target, current value, toggle/increment button
- Clicking toggle/increment calls `logHabitAction`
- Weekly streak indicator per habit
- "Add Habit" button opens dialog

**Dependencies:** P3-T9
**Acceptance criteria:**
- Habits show for the current day
- Toggling a habit creates/updates the log
- Navigating between days shows correct state
- Weekly streak is calculated client-side

---

### P3-T11: Clinician Habit Overview

**Files to modify:**
- `app/(platform)/patients/[id]/page.tsx` -- add habits tab/section

Shows habit compliance overview for a specific patient: habit names, weekly completion rates as a bar chart (Recharts), and current streaks.

**Dependencies:** P3-T9, P3-T10
**Acceptance criteria:**
- Clinician sees habit compliance data for each patient
- Chart renders correctly

---

### P3-T12: Body Metrics Clinician View

**Files to modify:**
- `app/(platform)/patients/[id]/page.tsx` -- add body metrics tab

Same charting component as P3-T2 but fetching for a specific patient (clinician views the patient's data).

**Dependencies:** P3-T1, P3-T2
**Acceptance criteria:** Clinician sees patient body metric charts.

---

### P3-T13: Progress Photos Clinician View

**Files to modify:**
- `app/(platform)/patients/[id]/page.tsx` -- add photos tab

Gallery view of patient photos (only non-private or all if the clinician-patient relationship allows).

**Dependencies:** P3-T3
**Acceptance criteria:** Clinician can view patient progress photos.

---

### P3-T14: Progress Page Layout

**Files to modify:**
- `app/(client)/progress/page.tsx`

This becomes a tabbed page with: Body Metrics (P3-T2), Photos (P3-T3), Habits (link to /habits).

**Dependencies:** P3-T2, P3-T3
**Acceptance criteria:** Tabs navigate between progress sub-views.

---

### P3-T15: Check-In Sidebar Navigation

Update client sidebar to include "Check-ins" link (`/check-ins`). Update clinician sidebar to include "Check-ins" link (`/check-ins`).

**Dependencies:** P3-T4, P3-T6
**Acceptance criteria:** Navigation links appear and route correctly.

---

## 5. Phase 4 -- Nutrition + Analytics

**Goal:** Add nutrition logging and comprehensive analytics dashboards.

**Dependencies:** Phase 3 complete

---

### P4-T1: Nutrition Service

**Files to create:**
- `lib/services/nutrition.service.ts`
- `lib/validators/nutrition.ts`
- `actions/nutrition-actions.ts`

**Service functions:**
- `setTargets(patientId, data: { calories?, proteinG?, carbsG?, fatG?, fiberG?, waterMl? })` -- upserts NutritionTarget
- `getTargets(patientId)` -- returns NutritionTarget or null
- `logMeal(patientId, data: { date, mealType, description, calories?, proteinG?, carbsG?, fatG?, photoUrl? })` -- creates NutritionLog
- `getMealLogs(patientId, date: Date)` -- returns logs for a specific day
- `getMealLogRange(patientId, from: Date, to: Date)` -- returns logs for date range
- `deleteMealLog(id)` -- deletes by ID

**Zod schemas:**
```typescript
export const nutritionTargetSchema = z.object({
  calories: z.number().int().positive().optional().nullable(),
  proteinG: z.number().int().positive().optional().nullable(),
  carbsG: z.number().int().positive().optional().nullable(),
  fatG: z.number().int().positive().optional().nullable(),
  fiberG: z.number().int().positive().optional().nullable(),
  waterMl: z.number().int().positive().optional().nullable(),
});

export const nutritionLogSchema = z.object({
  date: z.string().datetime(),
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  description: z.string().min(1).max(500),
  calories: z.number().int().positive().optional().nullable(),
  proteinG: z.number().positive().optional().nullable(),
  carbsG: z.number().positive().optional().nullable(),
  fatG: z.number().positive().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
});
```

**Dependencies:** P1-T1
**Acceptance criteria:**
- Nutrition targets are upserted (one per patient)
- Meal logs are created and queryable by date
- Macro totals can be summed for daily views

---

### P4-T2: Nutrition Logging Page (Client)

**Files to create:**
- `app/(client)/nutrition/page.tsx`
- `components/nutrition/daily-nutrition-view.tsx`
- `components/nutrition/log-meal-dialog.tsx`
- `components/nutrition/macro-ring-chart.tsx`

**Page layout:**
- Date navigator (same pattern as habits)
- Macro summary at top: donut/ring charts (Recharts PieChart) showing consumed vs target for calories, protein, carbs, fat
- Meal list for the day grouped by meal type (Breakfast, Lunch, Dinner, Snack)
- Each meal card: description, macros, optional photo
- "Log Meal" floating action button

**Dependencies:** P4-T1
**Acceptance criteria:**
- Patient can log meals and see daily macro totals
- Ring charts show progress toward targets
- Date navigation works

---

### P4-T3: Nutrition Targets Settings (Client)

**Files to modify:**
- `app/(client)/nutrition/page.tsx` -- add "Set Targets" button/dialog

or

**Files to create:**
- `components/nutrition/set-targets-dialog.tsx`

Dialog form with inputs for daily targets (calories, protein, carbs, fat, fiber, water). Saves via `setTargetsAction`.

**Dependencies:** P4-T1
**Acceptance criteria:**
- Targets are saved and reflected in the ring charts
- Defaults to empty (no target) until set

---

### P4-T4: Coach Analytics Dashboard

**Files to create:**
- `app/(platform)/analytics/page.tsx`
- `components/analytics/coach-analytics-dashboard.tsx`
- `components/analytics/stat-card.tsx`
- `components/analytics/adherence-chart.tsx`
- `components/analytics/client-activity-table.tsx`

**Page layout:**
- Header: "Analytics" with date range selector (this week, this month, last 30 days, custom)
- Stat cards row: total active clients, total active programs, sessions completed this period, average adherence rate
- Adherence chart: bar chart showing per-client adherence (completed sessions / scheduled sessions) for the period
- Client activity table: sortable table with columns: Client Name, Active Program, Sessions Completed, Sessions Missed, Adherence %, Last Active

**Queries needed (build into a `lib/services/analytics.service.ts`):**
- `getClinicianStats(clinicianId, from, to)` -- aggregates session data
- `getClientAdherence(clinicianId, from, to)` -- per-client adherence

**Dependencies:** P1-T12
**Acceptance criteria:**
- Dashboard shows accurate aggregated stats
- Charts render with real data
- Date range filter updates all data

---

### P4-T5: Client Analytics Page

**Files to create:**
- `app/(client)/analytics/page.tsx`
- `components/analytics/client-analytics-dashboard.tsx`

**Page layout:**
- Stat cards: total workouts completed, current streak, average RPE, total volume lifted
- Workout frequency chart: bar chart showing workouts per week over time (Recharts)
- RPE trend chart: line chart showing average RPE over time
- Body metrics trend chart (reuse from P3-T2)
- Nutrition adherence chart: daily calories vs target over the past 2 weeks

**Dependencies:** P3-T1, P4-T1
**Acceptance criteria:**
- Client sees their personal analytics
- Charts render with real data
- Empty states are handled gracefully

---

### P4-T6: CSV Export

**Files to create:**
- `app/api/export/sessions/route.ts`
- `app/api/export/metrics/route.ts`

**Step-by-step:**

Each route is a GET endpoint that:
1. Authenticates via Clerk
2. Queries the relevant data
3. Formats as CSV string
4. Returns with `Content-Type: text/csv` and `Content-Disposition: attachment` headers

```typescript
// app/api/export/sessions/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId") || dbUser.id;

  const sessions = await prisma.workoutSessionV2.findMany({
    where: { patientId },
    include: {
      workout: { include: { program: { select: { name: true } } } },
      exerciseLogs: { include: { setLogs: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const rows = [
    ["Date", "Program", "Workout", "Status", "Duration (min)", "RPE"].join(","),
  ];

  for (const s of sessions) {
    rows.push(
      [
        s.scheduledDate.toISOString().split("T")[0],
        s.workout.program.name,
        s.workout.name,
        s.status,
        s.durationMinutes ?? "",
        s.overallRPE ?? "",
      ].join(",")
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sessions-export.csv"`,
    },
  });
}
```

Apply the same pattern for metrics export.

**Dependencies:** P1-T12, P3-T1
**Acceptance criteria:**
- CSV downloads with correct data
- Auth is enforced
- Clinician can export for any of their patients

---

### P4-T7: Analytics Navigation

Update clinician sidebar with "Analytics" link (`/analytics`).
Update client sidebar with "Analytics" link (`/analytics`).

**Dependencies:** P4-T4, P4-T5
**Acceptance criteria:** Links appear and route correctly.

---

### P4-T8: Nutrition Clinician View

**Files to modify:**
- `app/(platform)/patients/[id]/page.tsx` -- add nutrition tab

Shows client's nutrition logs and macro trends for clinician review. Reuses `DailyNutritionView` with a `patientId` prop override.

**Dependencies:** P4-T1, P4-T2
**Acceptance criteria:** Clinician sees patient nutrition data.

---

## 6. Phase 5 -- Billing + Notifications + Branding

**Goal:** Stripe billing integration, in-app and email notifications, and coach branding/white-labeling.

**Dependencies:** Phase 4 complete

---

### P5-T1: Stripe Configuration

**Files to create:**
- `lib/stripe.ts`

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});
```

**Dependencies:** Stripe npm package installed (prerequisites)
**Acceptance criteria:** Stripe client initializes without error.

---

### P5-T2: Stripe Service

**Files to create:**
- `lib/services/stripe.service.ts`

**Functions:**
- `createConnectedAccount(clinicianId, email)` -- creates Stripe Connect Express account, stores account ID on ClinicProfile
- `createAccountLink(accountId, returnUrl, refreshUrl)` -- generates onboarding link
- `createProduct(name, description)` -- creates Stripe product
- `createPrice(productId, amountInCents, currency, intervalMonths)` -- creates recurring price
- `createCustomer(email, name, metadata)` -- creates Stripe customer
- `createSubscription(customerId, priceId, connectedAccountId)` -- creates subscription
- `cancelSubscription(subscriptionId)` -- cancels subscription
- `createBillingPortalSession(customerId, returnUrl)` -- client billing portal

**Dependencies:** P5-T1
**Acceptance criteria:** All Stripe API calls function correctly in test mode.

---

### P5-T3: Billing Service (DB layer)

**Files to create:**
- `lib/services/billing.service.ts`
- `lib/validators/billing.ts`
- `actions/billing-actions.ts`

**Service functions:**
- `createPackage(clinicianId, data)` -- creates CoachPackage + Stripe price
- `getPackages(clinicianId)` -- lists packages
- `updatePackage(id, data)` -- updates package
- `deletePackage(id)` -- deactivates package
- `createSubscription(packageId, patientId, clinicianId)` -- creates ClientSubscription + Stripe subscription
- `cancelSubscription(subscriptionId)` -- cancels
- `getSubscriptions(clinicianId?, patientId?)` -- lists subscriptions
- `createInvoice(subscriptionId, amountInCents, dueDate)` -- creates Invoice

**Zod schemas:**
```typescript
export const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priceInCents: z.number().int().positive(),
  currency: z.string().default("usd"),
  intervalMonths: z.number().int().min(1).max(12).default(1),
});
```

**Dependencies:** P5-T2
**Acceptance criteria:**
- Packages are created with corresponding Stripe prices
- Subscriptions sync with Stripe
- Invoice records are created

---

### P5-T4: Stripe Webhook Handler

**Files to create:**
- `app/api/webhooks/stripe/route.ts`

**Step-by-step:**

```typescript
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "invoice.paid": {
      const invoice = event.data.object;
      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: invoice.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: invoice.id },
        data: { status: "OVERDUE" },
      });
      // Update subscription status
      if (invoice.subscription) {
        await prisma.clientSubscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: { status: "PAST_DUE" },
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      await prisma.clientSubscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: subscription.status === "active" ? "ACTIVE" : subscription.status.toUpperCase(),
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
      });
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await prisma.clientSubscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

**Dependencies:** P5-T1, P5-T3
**Acceptance criteria:**
- Webhook verifies Stripe signatures
- Invoice and subscription statuses sync with DB
- Handles: invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted

---

### P5-T5: Coach Packages Page (Clinician)

**Files to create:**
- `app/(platform)/settings/billing/page.tsx`
- `components/billing/package-manager.tsx`
- `components/billing/create-package-dialog.tsx`

**Page layout:**
- Package list with cards showing: name, price, interval, active client count
- Create/edit/deactivate actions
- Stripe Connect onboarding status

**Dependencies:** P5-T3
**Acceptance criteria:**
- Clinician can create and manage packages
- Stripe Connect onboarding flow works

---

### P5-T6: Client Subscription Management

**Files to create:**
- `components/billing/subscribe-dialog.tsx`
- `app/(platform)/patients/[id]/billing/page.tsx`

**Subscribe dialog:** Shown when assigning a client to a package. Creates the subscription.

**Patient billing page:** Shows subscription status, invoices, and billing portal link.

**Dependencies:** P5-T3
**Acceptance criteria:**
- Clinician can subscribe a client to a package
- Invoice history is visible
- Client can access Stripe billing portal

---

### P5-T7: Notification Service

**Files to create:**
- `lib/services/notification.service.ts`
- `actions/notification-actions.ts`

**Service functions:**
- `createNotification(userId, data: { type, title, body?, link?, metadata? })` -- creates Notification
- `getNotifications(userId, limit?)` -- lists most recent, unread first
- `markAsRead(notificationId)` -- sets isRead = true
- `markAllAsRead(userId)` -- bulk update
- `getUnreadCount(userId)` -- count of unread
- `deleteOldNotifications(userId, olderThan: Date)` -- cleanup

**Notification types:** WORKOUT_ASSIGNED, WORKOUT_REMINDER, MESSAGE_RECEIVED, CHECKIN_DUE, CHECKIN_SUBMITTED, PROGRESS_MILESTONE, PAYMENT_DUE, PAYMENT_RECEIVED

**Dependencies:** P1-T1
**Acceptance criteria:**
- Notifications are created and queryable
- Unread count is efficient (indexed query)

---

### P5-T8: Notification Bell Component

**Files to create:**
- `components/notifications/notification-bell.tsx`
- `components/notifications/notification-panel.tsx`

**NotificationBell:** Renders a bell icon with unread count badge in the header. On click, opens a Sheet (from the right) listing recent notifications.

**NotificationPanel:** Lists notifications with: title, body snippet, time ago, read/unread indicator. "Mark all read" button at top. Click on notification navigates to its `link` and marks it as read.

**Integration:** Add `<NotificationBell />` to `components/layout/header.tsx`.

**Dependencies:** P5-T7
**Acceptance criteria:**
- Bell shows unread count
- Panel lists notifications
- Click navigates and marks as read
- "Mark all read" works

---

### P5-T9: Email Notification Service

**Files to create:**
- `lib/services/email.service.ts`

Uses `resend` (already installed) to send transactional emails.

**Functions:**
- `sendWorkoutAssignedEmail(toEmail, patientName, programName)` -- notifies patient
- `sendCheckInReminderEmail(toEmail, patientName, templateName)` -- reminds patient
- `sendCheckInSubmittedEmail(toEmail, clinicianName, patientName)` -- notifies clinician
- `sendPaymentReceivedEmail(toEmail, amount, currency)` -- confirms payment

Each function uses a consistent HTML template with the app branding.

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWorkoutAssignedEmail(
  toEmail: string,
  patientName: string,
  programName: string
) {
  await resend.emails.send({
    from: "notifications@yourdomain.com",
    to: toEmail,
    subject: `New Program Assigned: ${programName}`,
    html: `<p>Hi ${patientName},</p><p>Your coach has assigned you a new program: <strong>${programName}</strong>.</p><p>Log in to your portal to get started!</p>`,
  });
}
```

**Dependencies:** None (uses existing Resend setup)
**Acceptance criteria:**
- Emails are sent via Resend
- No errors when API key is configured
- Graceful failure when email service is unavailable (log error, do not crash)

---

### P5-T10: Notification Triggers (Integration)

**Files to modify:**
- `actions/program-actions.ts` -- trigger WORKOUT_ASSIGNED notification + email after `assignProgramAction`
- `actions/session-log-actions.ts` -- trigger PROGRESS_MILESTONE notification if streak reaches 7, 30, etc.
- `actions/checkin-actions.ts` -- trigger CHECKIN_SUBMITTED notification to clinician
- `actions/billing-actions.ts` -- trigger PAYMENT_RECEIVED notification

**Pattern:** After the primary action succeeds, call `notificationService.createNotification()` and optionally `emailService.send*Email()`. Wrap in try/catch to prevent notification failures from breaking the primary action.

**Dependencies:** P5-T7, P5-T9
**Acceptance criteria:**
- Notifications are created at the right moments
- Emails are sent for key events
- Primary actions are not affected by notification failures

---

### P5-T11: Coach Branding Settings

**Files to create:**
- `app/(platform)/settings/branding/page.tsx`
- `components/settings/branding-form.tsx`
- `lib/services/branding.service.ts`
- `actions/branding-actions.ts`

**Service functions:**
- `getBranding(clinicianId)` -- returns CoachBranding or null
- `upsertBranding(clinicianId, data)` -- creates/updates branding

**Branding form:** Color pickers for primary/accent, font selector (dropdown of web-safe fonts + Inter), logo upload (Uploadthing), welcome message textarea.

**Dependencies:** P1-T1
**Acceptance criteria:**
- Branding settings save to DB
- Logo uploads via Uploadthing

---

### P5-T12: Apply Branding to Client Portal

**Files to modify:**
- `app/(client)/layout.tsx`

**Step-by-step:**

1. In the client layout, after fetching the user, find their clinician and load branding:

```typescript
const link = await prisma.patientClinicianLink.findFirst({
  where: { patientId: user.id, status: "active" },
  select: { clinicianId: true },
});

let branding = null;
if (link) {
  branding = await prisma.coachBranding.findUnique({
    where: { clinicianId: link.clinicianId },
  });
}
```

2. Apply branding as CSS custom properties via a `<style>` tag or inline styles on the root div:

```typescript
const brandingStyles = branding
  ? {
      "--brand-primary": branding.primaryColor,
      "--brand-accent": branding.accentColor,
    } as React.CSSProperties
  : {};
```

3. Pass branding to the sidebar for logo display.

**Dependencies:** P5-T11
**Acceptance criteria:**
- Client portal colors reflect coach branding
- Logo appears in the client sidebar
- Fallback to default colors when no branding is set

---

### P5-T13: Cron Jobs (Vercel Cron)

**Files to create:**
- `app/api/cron/check-in-reminders/route.ts`
- `app/api/cron/session-reminders/route.ts`
- `app/api/cron/missed-sessions/route.ts`
- `vercel.json` (add cron configuration)

**check-in-reminders (daily at 8am UTC):**
1. Find all active CheckInAssignments where `nextDueDate <= today`
2. Create CHECKIN_DUE notification for the patient
3. Send reminder email

**session-reminders (daily at 7am UTC):**
1. Find all WorkoutSessionV2 with `scheduledDate = today` and `status = SCHEDULED`
2. Create WORKOUT_REMINDER notification

**missed-sessions (daily at 11pm UTC):**
1. Find all WorkoutSessionV2 where `scheduledDate < today` and `status = SCHEDULED`
2. Update status to MISSED

**vercel.json:**
```json
{
  "crons": [
    { "path": "/api/cron/check-in-reminders", "schedule": "0 8 * * *" },
    { "path": "/api/cron/session-reminders", "schedule": "0 7 * * *" },
    { "path": "/api/cron/missed-sessions", "schedule": "0 23 * * *" }
  ]
}
```

Each route should verify a `CRON_SECRET` header for security:
```typescript
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... cron logic
}
```

**Dependencies:** P5-T7, P5-T9
**Acceptance criteria:**
- Cron routes execute correctly
- Notifications and emails are sent
- Missed sessions are marked
- Routes are secured with a secret

---

### P5-T14: Revenue Dashboard (Clinician)

**Files to create:**
- `app/(platform)/settings/billing/revenue/page.tsx`
- `components/billing/revenue-dashboard.tsx`

**Page layout:**
- Stat cards: MRR (monthly recurring revenue), active subscriptions, total collected this month
- Revenue chart: line chart showing monthly revenue over time (Recharts)
- Recent invoices table: date, client, amount, status

**Queries:**
- Sum of `priceInCents` for active subscriptions = MRR
- Sum of paid invoices for current month
- Invoices list with subscription -> package -> client joins

**Dependencies:** P5-T3
**Acceptance criteria:**
- Revenue stats are accurate
- Chart renders with real data
- Invoice table is sortable

---

### P5-T15: Navigation Updates for Phase 5

**Clinician sidebar additions:**
- "Billing" sub-menu under Settings (links: /settings/billing, /settings/billing/revenue)
- "Branding" link under Settings (/settings/branding)

**Client sidebar additions:**
- "Nutrition" link (/nutrition)

**Header update:**
- Add NotificationBell component (P5-T8)

**Dependencies:** All Phase 5 tasks
**Acceptance criteria:** All new sections are accessible via navigation.

---

## 7. Component Reference

### Major New Components

| Component | File Path | Props Interface | Calls |
|---|---|---|---|
| `ProgramEditor` | `components/programs/program-editor.tsx` | `{ program?: ProgramDetail; exercises: Exercise[] }` | `createProgramAction`, `updateProgramAction` |
| `ProgramBuilder` | `components/programs/program-builder.tsx` | `{ workouts: WorkoutInput[]; onChange: (w: WorkoutInput[]) => void; exerciseLibrary: Exercise[] }` | None (state lifted to parent) |
| `ProgramListClient` | `components/programs/program-list-client.tsx` | `{ programs: ProgramListItem[] }` | `duplicateProgramAction`, `deleteProgramAction` |
| `ProgramDetailView` | `components/programs/program-detail-view.tsx` | `{ program: any; isClinician: boolean; patients: PatientMinimal[]; showAssignDialog?: boolean }` | `duplicateProgramAction`, `deleteProgramAction` |
| `AssignProgramDialog` | `components/programs/assign-program-dialog.tsx` | `{ programId: string; patients: PatientMinimal[]; open: boolean; onOpenChange: (b: boolean) => void }` | `assignProgramAction` |
| `ExercisePickerDialog` | `components/programs/exercise-picker-dialog.tsx` | `{ open: boolean; onOpenChange: (b: boolean) => void; exercises: Exercise[]; onSelect: (e: Exercise) => void }` | None |
| `SetEditor` | `components/programs/set-editor.tsx` | `{ sets: ExerciseSetInput[]; onChange: (s: ExerciseSetInput[]) => void }` | None |
| `CalendarWithSidebar` | `components/calendar/calendar-with-sidebar.tsx` | `{ sessions: SessionV2[]; isClinician: boolean; onSessionClick?: (id: string) => void }` | `rescheduleSessionAction` |
| `SessionLogger` | `components/client/session-logger.tsx` | `{ session: SessionDetail }` | `startSessionAction`, `logExerciseAction`, `completeSessionAction`, `submitSessionFeedbackAction` |
| `ClientHomeDashboard` | `components/client/client-home-dashboard.tsx` | `{ programs: ProgramListItem[]; upcomingSessions: SessionV2[]; streak: number; totalCompleted: number }` | None |
| `HabitTracker` | `components/habits/habit-tracker.tsx` | `{ habits: HabitDefinition[]; logs: HabitLog[]; selectedDate: Date }` | `logHabitAction` |
| `BodyMetricsChart` | `components/progress/body-metrics-chart.tsx` | `{ metrics: BodyMetric[]; metricType: string }` | None |
| `CheckInTemplateBuilder` | `components/checkins/checkin-template-builder.tsx` | `{ template?: CheckInTemplate }` | `createTemplateAction`, `updateTemplateAction` |
| `CheckInForm` | `components/checkins/checkin-form.tsx` | `{ assignment: CheckInAssignment; template: CheckInTemplate }` | `submitResponseAction` |
| `DailyNutritionView` | `components/nutrition/daily-nutrition-view.tsx` | `{ logs: NutritionLog[]; targets: NutritionTarget | null; date: Date }` | None |
| `NotificationBell` | `components/notifications/notification-bell.tsx` | `{ initialCount: number }` | `getNotificationsAction`, `markAsReadAction`, `markAllAsReadAction` |
| `PackageManager` | `components/billing/package-manager.tsx` | `{ packages: CoachPackage[] }` | `createPackageAction`, `updatePackageAction`, `deletePackageAction` |
| `BrandingForm` | `components/settings/branding-form.tsx` | `{ branding: CoachBranding | null }` | `upsertBrandingAction` |
| `CoachAnalyticsDashboard` | `components/analytics/coach-analytics-dashboard.tsx` | `{ stats: ClinicianStats; adherence: ClientAdherence[]; dateRange: DateRange }` | None |
| `ClientAnalyticsDashboard` | `components/analytics/client-analytics-dashboard.tsx` | `{ stats: ClientStats; workoutFrequency: WeeklyCount[]; rpeTrend: RPEPoint[] }` | None |

---

## 8. Service Layer Reference

### `lib/services/program.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `createProgram` | `(clinicianId: string, data: CreateProgramInput) => Promise<ProgramDetail>` | Program, Workout, WorkoutBlockV2, BlockExerciseV2, ExerciseSet |
| `getProgramById` | `(id: string) => Promise<ProgramDetail \| null>` | Program (with full includes) |
| `getPrograms` | `(clinicianId: string, filters?: ProgramFilterInput) => Promise<ProgramListItem[]>` | Program |
| `updateProgram` | `(id: string, data: Partial<CreateProgramInput> & { status?: string }) => Promise<ProgramDetail>` | Program, Workout (cascade delete + recreate) |
| `deleteProgram` | `(id: string) => Promise<Program>` | Program |
| `duplicateProgram` | `(id: string, clinicianId: string, asTemplate?: boolean) => Promise<ProgramDetail>` | Program (read + create) |
| `assignProgram` | `(programId: string, patientId: string, startDate: Date) => Promise<ProgramDetail>` | Program, WorkoutSessionV2 |
| `getProgramsForPatient` | `(patientId: string) => Promise<ProgramListItem[]>` | Program |
| `getTemplates` | `(clinicianId: string) => Promise<ProgramListItem[]>` | Program |

### `lib/services/session.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `getSessionsForPatient` | `(patientId: string, options?: { from?: Date; to?: Date }) => Promise<SessionDetail[]>` | WorkoutSessionV2 |
| `getSessionById` | `(sessionId: string) => Promise<SessionDetail \| null>` | WorkoutSessionV2 (with full includes) |
| `rescheduleSession` | `(sessionId: string, newDate: Date) => Promise<WorkoutSessionV2>` | WorkoutSessionV2 |
| `updateSessionStatus` | `(sessionId: string, status: string, data?: {...}) => Promise<WorkoutSessionV2>` | WorkoutSessionV2 |
| `logExercise` | `(sessionId: string, blockExerciseId: string, orderIndex: number, setLogs: [...]) => Promise<SessionExerciseLog>` | SessionExerciseLog, SetLog |
| `submitSessionFeedback` | `(sessionId: string, patientId: string, rating: string, comment?: string) => Promise<SessionFeedback>` | SessionFeedback |
| `getSessionsForClinician` | `(clinicianId: string, options?: {...}) => Promise<SessionV2[]>` | WorkoutSessionV2 |
| `getUpcomingSessions` | `(patientId: string, limit?: number) => Promise<SessionV2[]>` | WorkoutSessionV2 |

### `lib/services/body-metric.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `recordMetric` | `(patientId, data) => Promise<BodyMetric>` | BodyMetric |
| `getMetrics` | `(patientId, metricType?, from?, to?) => Promise<BodyMetric[]>` | BodyMetric |
| `getLatestMetrics` | `(patientId) => Promise<Record<string, BodyMetric>>` | BodyMetric |
| `deleteMetric` | `(id) => Promise<void>` | BodyMetric |

### `lib/services/checkin.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `createTemplate` | `(clinicianId, data) => Promise<CheckInTemplate>` | CheckInTemplate, CheckInQuestion |
| `getTemplates` | `(clinicianId) => Promise<CheckInTemplate[]>` | CheckInTemplate |
| `getTemplateById` | `(id) => Promise<CheckInTemplate \| null>` | CheckInTemplate, CheckInQuestion |
| `assignTemplate` | `(data) => Promise<CheckInAssignment>` | CheckInAssignment |
| `submitResponse` | `(assignmentId, patientId, answers) => Promise<CheckInResponse>` | CheckInResponse, CheckInAssignment (nextDueDate update) |
| `getResponsesForClinician` | `(clinicianId, unreviewed?) => Promise<CheckInResponse[]>` | CheckInResponse |

### `lib/services/habit.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `createHabit` | `(patientId, data) => Promise<HabitDefinition>` | HabitDefinition |
| `getHabits` | `(patientId) => Promise<HabitDefinition[]>` | HabitDefinition |
| `logHabit` | `(habitId, date, value?, completed?) => Promise<HabitLog>` | HabitLog (upsert) |
| `getHabitLogs` | `(habitId, from, to) => Promise<HabitLog[]>` | HabitLog |
| `getHabitLogsForPatient` | `(patientId, date) => Promise<HabitLog[]>` | HabitLog |

### `lib/services/nutrition.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `setTargets` | `(patientId, data) => Promise<NutritionTarget>` | NutritionTarget (upsert) |
| `getTargets` | `(patientId) => Promise<NutritionTarget \| null>` | NutritionTarget |
| `logMeal` | `(patientId, data) => Promise<NutritionLog>` | NutritionLog |
| `getMealLogs` | `(patientId, date) => Promise<NutritionLog[]>` | NutritionLog |
| `getMealLogRange` | `(patientId, from, to) => Promise<NutritionLog[]>` | NutritionLog |
| `deleteMealLog` | `(id) => Promise<void>` | NutritionLog |

### `lib/services/notification.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `createNotification` | `(userId, data) => Promise<Notification>` | Notification |
| `getNotifications` | `(userId, limit?) => Promise<Notification[]>` | Notification |
| `markAsRead` | `(id) => Promise<void>` | Notification |
| `markAllAsRead` | `(userId) => Promise<void>` | Notification |
| `getUnreadCount` | `(userId) => Promise<number>` | Notification |

### `lib/services/billing.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `createPackage` | `(clinicianId, data) => Promise<CoachPackage>` | CoachPackage |
| `getPackages` | `(clinicianId) => Promise<CoachPackage[]>` | CoachPackage |
| `createSubscription` | `(packageId, patientId, clinicianId) => Promise<ClientSubscription>` | ClientSubscription, Invoice |
| `cancelSubscription` | `(subscriptionId) => Promise<void>` | ClientSubscription |
| `getSubscriptions` | `(clinicianId?, patientId?) => Promise<ClientSubscription[]>` | ClientSubscription |

### `lib/services/branding.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `getBranding` | `(clinicianId) => Promise<CoachBranding \| null>` | CoachBranding |
| `upsertBranding` | `(clinicianId, data) => Promise<CoachBranding>` | CoachBranding (upsert) |

### `lib/services/analytics.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `getClinicianStats` | `(clinicianId, from, to) => Promise<ClinicianStats>` | WorkoutSessionV2, Program, PatientClinicianLink |
| `getClientAdherence` | `(clinicianId, from, to) => Promise<ClientAdherence[]>` | WorkoutSessionV2, User |
| `getClientStats` | `(patientId, from, to) => Promise<ClientStats>` | WorkoutSessionV2, BodyMetric |

### `lib/services/email.service.ts`

| Function | Signature | Models Touched |
|---|---|---|
| `sendWorkoutAssignedEmail` | `(toEmail, patientName, programName) => Promise<void>` | None |
| `sendCheckInReminderEmail` | `(toEmail, patientName, templateName) => Promise<void>` | None |
| `sendCheckInSubmittedEmail` | `(toEmail, clinicianName, patientName) => Promise<void>` | None |
| `sendPaymentReceivedEmail` | `(toEmail, amount, currency) => Promise<void>` | None |

---

## 9. Testing Checklist

### Phase 1 -- Program Builder + Calendar

- [ ] Create a program with 3 workouts, each having 2 blocks with exercises and sets
- [ ] Verify program appears in the programs list page
- [ ] Open program detail -- confirm all workouts, blocks, exercises, sets are displayed
- [ ] Edit program -- change name, add a workout, remove an exercise, modify sets
- [ ] Verify edited program reflects changes in detail view
- [ ] Duplicate a program -- verify copy is created with "(Copy)" suffix
- [ ] Create a template (isTemplate = true) -- verify it shows with template badge
- [ ] Assign a program to a patient with a start date
- [ ] Verify WorkoutSessionV2 records are created with correct scheduled dates
- [ ] Verify program status changes to ACTIVE
- [ ] Open calendar -- verify sessions appear with correct dates and colors
- [ ] Drag a session to a new date -- verify it updates in DB
- [ ] Verify clinician dashboard shows active programs count and upcoming sessions
- [ ] Archive a program -- verify it disappears from default list (but appears with status filter)
- [ ] Test block types: create SUPERSET, CIRCUIT (with rounds), AMRAP (with time cap), EMOM blocks
- [ ] Test exercise picker: search by name, filter by body region
- [ ] Test set types: WARMUP, DROP_SET, FAILURE alongside NORMAL

### Phase 2 -- Client Portal + Session Logging

- [ ] Log in as a PATIENT user -- verify redirect to client portal (/home)
- [ ] Client dashboard shows: streak, completed count, upcoming sessions
- [ ] Navigate to My Workouts -- verify all assigned sessions are listed
- [ ] Filter by Upcoming/Completed/All tabs
- [ ] Open a SCHEDULED session -- see "Start Workout" button
- [ ] Start workout -- verify status changes to IN_PROGRESS
- [ ] Log sets for each exercise (enter actual reps, weight)
- [ ] Complete workout -- verify status changes to COMPLETED
- [ ] Submit session feedback (RPE + rating + comment)
- [ ] Verify session duration is calculated
- [ ] Verify streak increments after completing a session today
- [ ] Navigate to calendar view -- verify color coding matches session status
- [ ] View completed session -- verify logged data shows in summary
- [ ] As clinician, view patient detail page -- verify sessions and feedback appear
- [ ] Verify CLINICIAN cannot access /home (redirects to /dashboard)

### Phase 3 -- Progress Tracking + Check-ins + Habits

- [ ] Record a body metric (weight) -- verify it appears in the chart
- [ ] Record multiple metrics over different dates -- verify chart trend
- [ ] Upload a progress photo -- verify it appears in the gallery
- [ ] Create a check-in template with TEXT, SCALE, MULTIPLE_CHOICE, YES_NO questions
- [ ] Assign the template to a patient
- [ ] As patient, see the check-in on the check-ins page
- [ ] Submit the check-in with answers
- [ ] Verify AI summary is generated (if AI route is configured)
- [ ] As clinician, review the response -- add coach notes, mark reviewed
- [ ] Create a daily habit (e.g., "Drink 8 glasses of water")
- [ ] Log the habit for today -- verify completion state
- [ ] Navigate to previous days -- verify habit logs are date-specific
- [ ] Verify habit streak calculation is correct
- [ ] As clinician, verify patient habit compliance chart renders

### Phase 4 -- Nutrition + Analytics

- [ ] Set nutrition targets (calories, protein, carbs, fat)
- [ ] Log a meal (Breakfast) -- verify it appears in daily view
- [ ] Log meals for all types -- verify macro rings update
- [ ] Navigate between dates -- verify correct data per day
- [ ] Open coach analytics dashboard -- verify stat cards show accurate numbers
- [ ] Verify adherence bar chart renders per client
- [ ] Verify client activity table is sortable
- [ ] Change date range -- verify data updates
- [ ] Open client analytics page -- verify personal stats and charts
- [ ] Export sessions CSV -- verify file downloads with correct data
- [ ] Export metrics CSV -- verify file downloads with correct data

### Phase 5 -- Billing + Notifications + Branding

- [ ] Set up Stripe Connect (clinician onboarding) -- verify redirect flow
- [ ] Create a coaching package with price and interval
- [ ] Subscribe a client to the package -- verify Stripe subscription is created
- [ ] Verify invoice record is created in DB
- [ ] Simulate webhook: invoice.paid -- verify invoice status updates
- [ ] Simulate webhook: customer.subscription.deleted -- verify cancellation
- [ ] Verify notification bell appears in header
- [ ] Trigger a notification (assign a program) -- verify bell count updates
- [ ] Open notification panel -- verify notifications list
- [ ] Click notification -- verify navigation and mark as read
- [ ] Mark all as read -- verify count resets
- [ ] Configure coach branding (colors, logo)
- [ ] Log in as assigned patient -- verify client portal uses coach branding
- [ ] Verify cron job routes are accessible with correct auth
- [ ] Verify revenue dashboard shows accurate MRR and invoice data
- [ ] Test email delivery for workout assignment and check-in reminder

---

## Implementation Order Summary

```
P1-T1  Schema update (all models)
  |
P1-T2  Migration script (parallel with T3)
P1-T3  Zod validators (parallel with T2)
  |
P1-T4  Program service
  |
P1-T5  Server actions
  |
P1-T10 ProgramEditor + ProgramBuilder + ExercisePickerDialog + SetEditor
P1-T12 Session service (parallel with T10)
  |
P1-T6  Programs list page
P1-T7  New program page
P1-T8  Program detail page (parallel with T6, T7)
P1-T9  Edit program page
P1-T11 AssignProgramDialog
P1-T13 CalendarWithSidebar (parallel with T6-T11)
P1-T14 Calendar color-coding (included in T13)
P1-T15 Dashboard updates
  |
P2-T1  Client portal layout
P2-T2  Client home dashboard
P2-T3  My Workouts page
P2-T4  Session logger (critical path)
P2-T5  Session summary (included in T4)
P2-T6  Streak tracking (included in T2)
P2-T7  Client calendar
P2-T8  Client program detail
P2-T9  Navigation update
P2-T10 Session feedback component (included in T4)
P2-T11 Patient detail page updates
  |
P3-T1  Body metrics service        P3-T9  Habit service
P3-T2  Body metrics page           P3-T10 Habit tracking UI
P3-T3  Progress photos             P3-T4  Check-in template builder
P3-T4  Check-in template builder   P3-T5  Check-in assignment
P3-T5  Check-in assignment         P3-T6  Check-in submission (client)
P3-T6  Check-in submission         P3-T7  AI analysis
P3-T7  AI analysis                 P3-T8  Check-in review (clinician)
P3-T8  Check-in review
(P3-T1 through P3-T10 can be parallelized in 3 workstreams: metrics, check-ins, habits)
P3-T11 Clinician habit view
P3-T12 Clinician metrics view
P3-T13 Clinician photos view
P3-T14 Progress page layout
P3-T15 Navigation updates
  |
P4-T1  Nutrition service
P4-T2  Nutrition logging page
P4-T3  Nutrition targets
P4-T4  Coach analytics dashboard (parallel with T1-T3)
P4-T5  Client analytics page
P4-T6  CSV export
P4-T7  Navigation updates
P4-T8  Nutrition clinician view
  |
P5-T1  Stripe config
P5-T2  Stripe service
P5-T3  Billing service + actions
P5-T4  Stripe webhook handler
P5-T5  Packages page
P5-T6  Subscription management
P5-T7  Notification service (parallel with T1-T6)
P5-T8  Notification bell
P5-T9  Email service (parallel with T7-T8)
P5-T10 Notification triggers
P5-T11 Branding settings
P5-T12 Apply branding to client portal
P5-T13 Cron jobs
P5-T14 Revenue dashboard
P5-T15 Navigation updates
```

**Critical path:** P1-T1 -> P1-T4 -> P1-T5 -> P1-T10 -> P1-T7 -> P2-T4 (Session Logger is the highest-value client feature)

---

**End of Execution Blueprint V2**
