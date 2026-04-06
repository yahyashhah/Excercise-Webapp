---

# AI Home Exercise Platform -- Technical Architecture & Implementation Strategy

> **Note:** We are actively migrating to a TrueCoach-like architectural model. Please see [TRUECOACH_MIGRATION_PLAN.md](TRUECOACH_MIGRATION_PLAN.md) for the detailed execution blueprint, phase strategy, and new data model changes covering Calendar-Based Assignment, Modular Programs, AI-Driven Generation, Video Integration, and Granular Workout Construction.

---

## 1. Feature / Project Overview

### Problem Being Solved

Clinicians (physiotherapists, occupational therapists, exercise physiologists) prescribe home exercise programs on paper or through fragmented tools that lack personalization, adherence tracking, and feedback loops. Patients receive generic PDFs, forget exercises, perform them incorrectly, or drop off without anyone knowing. There is no structured mechanism for progression, regression, or two-way communication tied to the exercise plan.

### What the Final System Accomplishes

A web platform where:

1. **Clinicians** input patient profiles and constraints, then use AI (Claude API) to generate structured exercise programs drawn exclusively from a curated exercise library. They assign plans to patients, monitor adherence, review feedback, and adjust programs over time.
2. **Patients** view assigned plans, optionally generate their own AI-assisted workouts, track completed sessions, provide per-exercise feedback (pain, comfort, confusion), and complete periodic outcome assessments.
3. **The AI engine** selects, sequences, and parameterizes exercises from the library based on patient limitations, goals, equipment, and duration -- never inventing exercises outside the library.
4. **A progression/regression engine** automatically suggests exercise adjustments based on patient feedback and adherence data.
5. **A communication layer** enables messaging between patients and clinicians, with notes attachable to exercise plans.

### Target Users

- **Primary:** Licensed clinicians (physiotherapists, OTs, exercise physiologists) managing patient caseloads of 20-200 patients.
- **Secondary:** Patients (ages 18-85+, varying technical literacy) performing prescribed home exercises.

### Key Success Criteria

- AI-generated programs contain only exercises from the curated library (zero hallucinated exercises).
- Clinicians can generate, review, modify, and assign a program in under 5 minutes.
- Patients can view their plan, log a workout, and leave feedback in under 3 minutes.
- Adherence data is visible to clinicians within 1 minute of patient submission.
- System handles 500 concurrent users with sub-2-second page loads.

---

## 2. High-Level System Architecture

```
+------------------------------------------------------------------+
|                        CLIENT BROWSER                            |
|  Next.js App Router (RSC + Client Components)                   |
|  Tailwind CSS v4 | React 19                                     |
+------------------------------------------------------------------+
          |                    |                     |
          | RSC Streaming      | API Routes          | WebSocket/SSE
          |                    |                     |
+------------------------------------------------------------------+
|                     NEXT.JS SERVER (Node.js)                     |
|                                                                  |
|  +----------------+  +----------------+  +--------------------+  |
|  | Server         |  | API Route      |  | Server Actions     |  |
|  | Components     |  | Handlers       |  | (mutations)        |  |
|  | (data fetch)   |  | /api/*         |  |                    |  |
|  +----------------+  +----------------+  +--------------------+  |
|          |                    |                     |             |
|  +-----------------------------------------------------------+   |
|  |              SERVICE LAYER (Business Logic)                |   |
|  |  AuthService | WorkoutService | ExerciseService            |   |
|  |  FeedbackService | AdherenceService | MessageService       |   |
|  |  AIService | OutcomeService | ProgressionEngine            |   |
|  +-----------------------------------------------------------+   |
|          |                    |                     |             |
|  +-----------------------------------------------------------+   |
|  |              DATA ACCESS LAYER (Drizzle ORM)               |   |
|  |  Type-safe queries | Migrations | Connection pooling       |   |
|  +-----------------------------------------------------------+   |
|          |                    |                     |             |
+------------------------------------------------------------------+
          |                    |                     |
+-----------------+  +------------------+  +---------------------+
| PostgreSQL      |  | Anthropic        |  | Uploadthing / S3    |
| (Neon or        |  | Claude API       |  | (media storage)     |
| Supabase DB)    |  | (workout gen)    |  | exercise videos     |
+-----------------+  +------------------+  +---------------------+
```

### Key Architectural Decisions

- **Monolithic Next.js application** -- appropriate for the scale (sub-1000 concurrent users initially). No premature microservices decomposition.
- **React Server Components (RSC)** as the default rendering strategy. Client Components only where interactivity demands it (forms, real-time feedback, charts).
- **Server Actions** for all mutations (creating workouts, submitting feedback, sending messages). This eliminates the need for most custom API routes.
- **API Routes** reserved for: webhook endpoints, the AI streaming response, and any external integrations.
- **Service Layer** separates business logic from both the transport layer (routes/actions) and the data layer (ORM). This is the most critical architectural boundary in the system.

---

## 3. Technology Considerations

### Already Established (from project scaffold)

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.1.6 | Full-stack framework, App Router |
| React | 19.2.3 | UI library, RSC + Client Components |
| TypeScript | 5.x | Type safety, strict mode |
| Tailwind CSS | 4.x | Utility-first styling |

### Recommended Additions

| Technology | Role | Justification |
|---|---|---|
| **PostgreSQL (via Neon)** | Primary database | Relational data model fits perfectly (users, exercises, plans, feedback are all heavily relational). Neon provides serverless Postgres with branching for dev/preview environments, zero cold-start via their HTTP driver, and a generous free tier. Compatible with Vercel's edge and serverless deployment model. |
| **Drizzle ORM** | Data access layer | Type-safe SQL with zero runtime overhead. Unlike Prisma, Drizzle generates no client, has no engine binary, and produces predictable SQL. Its schema-as-code approach with `drizzle-kit` provides excellent migration tooling. Pairs naturally with Next.js server components. |
| **NextAuth.js v5 (Auth.js)** | Authentication & authorization | Purpose-built for Next.js App Router. Supports credential-based auth (email/password) and OAuth providers. Middleware-based route protection. Role-based access control via session callbacks. JWT sessions avoid extra DB lookups on every request. |
| **Anthropic SDK (`@anthropic-ai/sdk`)** | AI workout generation | Official TypeScript SDK for Claude API. Supports streaming responses, structured output via tool use, and content moderation. Direct integration without wrapper libraries. |
| **Vercel AI SDK (`ai`)** | AI response streaming | Provides `streamText` and `useChat` hooks that handle streaming Claude responses to the client with built-in React 19 integration. Eliminates manual SSE/WebSocket plumbing. |
| **Zod** | Runtime validation | Validates all user inputs (workout parameters, feedback, patient profiles) at API boundaries. Integrates with Drizzle for schema inference and with Server Actions for type-safe form handling. |
| **Uploadthing** | File/media storage | Purpose-built file upload for Next.js. Handles exercise video and image uploads with presigned URLs, automatic optimization, and CDN delivery. Simpler than raw S3 for this use case. |
| **Recharts** | Data visualization | Lightweight charting for adherence dashboards and outcome progress charts. Works well as a client component within RSC layouts. No heavy dependencies. |
| **shadcn/ui** | UI component library | Not a dependency -- generates source code into the project. Provides accessible, well-designed components (dialogs, forms, tables, tabs) built on Radix UI primitives. Fully customizable via Tailwind. Avoids vendor lock-in. |
| **React Hook Form** | Form management | Handles complex multi-step forms (patient intake, workout generation parameters) with validation, error states, and Zod integration. Minimal re-renders via uncontrolled components. |
| **Resend** | Transactional email | For password reset, workout assignment notifications, and weekly adherence summaries. Simple API, React email templates, reliable delivery. |

### What Was Considered and Rejected

| Option | Reason for rejection |
|---|---|
| **MongoDB** | The data model is deeply relational (exercises belong to plans, plans belong to patients, feedback links exercises to patients). Document stores create painful join patterns here. |
| **Prisma** | Engine binary adds cold-start latency in serverless. Drizzle is lighter, faster, and produces more predictable SQL for this use case. |
| **tRPC** | Adds complexity for a monolithic Next.js app where Server Actions already provide type-safe mutations and RSC provides type-safe data fetching. tRPC shines in multi-client scenarios. |
| **Socket.io** | Overkill for the messaging feature. Server-Sent Events or polling with SWR/React Query is sufficient for the message read pattern (clinician checks dashboard periodically, not real-time chat). |
| **Supabase (full platform)** | While Supabase Postgres is viable as a database, the full platform (auth, realtime, storage) creates coupling. Prefer composing best-of-breed tools (Auth.js + Neon + Uploadthing) for flexibility. |

---

## 4. Core System Components

### 4.1 Authentication & Authorization Module

- **Purpose:** Manage user identity, sessions, and role-based access control.
- **Responsibilities:** User registration, login/logout, password reset, session management, role enforcement (clinician vs. patient), middleware-based route protection.
- **Interfaces:** NextAuth.js session available in all Server Components via `auth()`. Middleware protects route groups. `useSession()` on client where needed.
- **Dependencies:** PostgreSQL (user table), Resend (password reset emails).

### 4.2 Exercise Library Service

- **Purpose:** CRUD operations on the curated exercise database. This is the foundation the AI selects from.
- **Responsibilities:** Exercise creation/editing (clinician-only), search and filtering by body region/equipment/difficulty, managing exercise media (videos, images), maintaining progression/regression chains between exercises.
- **Interfaces:** `ExerciseService.search(filters)`, `ExerciseService.getById(id)`, `ExerciseService.getProgressionChain(exerciseId)`. Consumed by AIService and directly by UI components.
- **Dependencies:** PostgreSQL (exercises table, progression_chains table), Uploadthing (media).

### 4.3 AI Workout Generation Service

- **Purpose:** Accept patient parameters and generate a structured exercise program using Claude, constrained to the exercise library.
- **Responsibilities:** Constructing the AI prompt with patient context + exercise library data, calling the Claude API with structured output (tool use), validating that all returned exercises exist in the library, streaming the generation progress to the client, parameterizing sets/reps/duration per exercise.
- **Interfaces:** `AIService.generateWorkout(patientProfile, preferences)` returns a streaming response. Uses the Vercel AI SDK `streamObject` pattern to produce a typed workout plan.
- **Dependencies:** Anthropic SDK, Exercise Library Service (provides the exercise catalog as context), Zod (output schema validation).

### 4.4 Workout Plan Service

- **Purpose:** Manage the lifecycle of workout plans -- creation, assignment, modification, archival.
- **Responsibilities:** Saving AI-generated plans, allowing clinician edits (swap exercises, adjust parameters), assigning plans to patients, versioning plans when modified, tracking plan status (active, paused, completed, archived).
- **Interfaces:** `WorkoutPlanService.create(plan)`, `WorkoutPlanService.assignToPatient(planId, patientId)`, `WorkoutPlanService.updateExercise(planId, exerciseSlotId, changes)`.
- **Dependencies:** PostgreSQL (workout_plans, plan_exercises tables), Exercise Library Service.

### 4.5 Feedback Service

- **Purpose:** Capture and surface per-exercise patient feedback.
- **Responsibilities:** Recording feedback (felt good / mild discomfort / painful / unsure how to perform), associating feedback with specific exercise instances within a plan, surfacing feedback on clinician dashboard with timestamps and trends, triggering progression/regression suggestions based on feedback patterns.
- **Interfaces:** `FeedbackService.submit(patientId, planExerciseId, feedback)`, `FeedbackService.getForPlan(planId)`, `FeedbackService.getForPatient(patientId)`.
- **Dependencies:** PostgreSQL (exercise_feedback table), Workout Plan Service.

### 4.6 Adherence Tracking Service

- **Purpose:** Track workout completion and compliance metrics.
- **Responsibilities:** Recording workout session completions, tracking which exercises were completed vs. skipped, calculating weekly/monthly compliance percentages, aggregating pain reports, surfacing adherence data on clinician dashboard.
- **Interfaces:** `AdherenceService.logSession(patientId, planId, sessionData)`, `AdherenceService.getWeeklyCompliance(patientId)`, `AdherenceService.getDashboardMetrics(clinicianId)`.
- **Dependencies:** PostgreSQL (workout_sessions, session_exercises tables), Workout Plan Service.

### 4.7 Outcome Tracking Service

- **Purpose:** Manage baseline and periodic functional assessments.
- **Responsibilities:** Defining assessment types (single-leg balance, pain scores, functional mobility), recording assessment results with timestamps, calculating deltas and trends, rendering progress charts.
- **Interfaces:** `OutcomeService.recordAssessment(patientId, assessmentData)`, `OutcomeService.getProgressTimeline(patientId, assessmentType)`.
- **Dependencies:** PostgreSQL (assessments table), Recharts (visualization).

### 4.8 Progression/Regression Engine

- **Purpose:** Suggest or automatically apply exercise difficulty adjustments.
- **Responsibilities:** Maintaining exercise progression chains (e.g., sit-to-stand -> sit-to-stand arms crossed -> weighted sit-to-stand), analyzing feedback and adherence data to determine when progression or regression is appropriate, generating suggestions for clinician review (not auto-applying without approval in MVP).
- **Interfaces:** `ProgressionEngine.evaluate(patientId, planId)` returns `Suggestion[]`. Each suggestion includes the current exercise, the recommended replacement, and the reasoning.
- **Dependencies:** Exercise Library Service (progression chains), Feedback Service, Adherence Service.

### 4.9 Messaging Service

- **Purpose:** Enable communication between patients and clinicians.
- **Responsibilities:** Sending and receiving messages within a patient-clinician thread, attaching messages to specific exercise plans or exercises, marking messages read/unread, notification of new messages.
- **Interfaces:** `MessageService.send(fromId, toId, content, context?)`, `MessageService.getThread(patientId, clinicianId)`, `MessageService.getUnreadCount(userId)`.
- **Dependencies:** PostgreSQL (messages table), Resend (email notification for new messages).

---

## 5. Data Architecture

### 5.1 Entity-Relationship Overview

```
users 1---* patient_clinician_links *---1 users
  |                                        |
  |   (patient)                  (clinician)|
  |                                        |
  +---* workout_plans *---1 users (created_by)
  |         |
  |         +---* plan_exercises *---1 exercises
  |         |         |
  |         |         +---* exercise_feedback
  |         |
  |         +---* workout_sessions
  |                   |
  |                   +---* session_exercises
  |
  +---* assessments
  |
  +---* messages *---1 users (recipient)

exercises 1---* exercise_progressions *---1 exercises (next_exercise)
exercises 1---* exercise_media
```

### 5.2 Data Models

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| email | varchar(255) | unique, not null |
| password_hash | varchar(255) | bcrypt hash |
| role | enum('clinician','patient') | not null |
| first_name | varchar(100) | not null |
| last_name | varchar(100) | not null |
| phone | varchar(20) | nullable |
| date_of_birth | date | nullable, relevant for patients |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Index:** `email` (unique), `role`.

#### `patient_profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK -> users.id, unique |
| limitations | text | free text: pain, injuries, mobility restrictions |
| comorbidities | text | medical considerations |
| functional_challenges | text | balance, weakness, instability |
| available_equipment | text[] | array of equipment strings |
| fitness_goals | text[] | array: strength, balance, mobility, etc. |
| preferred_duration_minutes | int | default 25 |
| preferred_days_per_week | int | default 3 |
| updated_at | timestamptz | |

**Index:** `user_id` (unique).

#### `patient_clinician_links`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| patient_id | uuid | FK -> users.id |
| clinician_id | uuid | FK -> users.id |
| status | enum('active','archived') | |
| created_at | timestamptz | |

**Index:** Composite unique on `(patient_id, clinician_id)`.

#### `exercises`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | varchar(200) | not null |
| description | text | detailed instructions |
| body_region | varchar(50) | e.g., lower_body, upper_body, core, full_body |
| equipment_required | text[] | array, e.g., ['resistance_band', 'chair'] |
| difficulty_level | enum('beginner','intermediate','advanced') | |
| contraindications | text[] | conditions where exercise is unsafe |
| video_url | varchar(500) | nullable |
| image_url | varchar(500) | nullable |
| instructions | text | step-by-step |
| is_active | boolean | default true, soft delete |
| created_by | uuid | FK -> users.id (clinician who added it) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `body_region`, `difficulty_level`, GIN index on `equipment_required`, full-text index on `name` + `description`.

#### `exercise_progressions`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| exercise_id | uuid | FK -> exercises.id |
| next_exercise_id | uuid | FK -> exercises.id |
| direction | enum('progression','regression') | |
| order_index | int | position in chain |

**Index:** `(exercise_id, direction)`.

#### `workout_plans`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| patient_id | uuid | FK -> users.id |
| created_by | uuid | FK -> users.id (clinician or patient) |
| title | varchar(200) | |
| description | text | |
| status | enum('draft','active','paused','completed','archived') | |
| duration_minutes | int | target duration |
| days_per_week | int | |
| ai_generation_params | jsonb | snapshot of inputs used for AI generation |
| version | int | incremented on modification |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `patient_id`, `created_by`, `status`.

#### `plan_exercises`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| plan_id | uuid | FK -> workout_plans.id |
| exercise_id | uuid | FK -> exercises.id |
| day_of_week | int | 1-7, nullable (for any-day plans) |
| order_index | int | sequence within the day |
| sets | int | |
| reps | int | nullable (if duration-based) |
| duration_seconds | int | nullable (if rep-based) |
| rest_seconds | int | rest between sets |
| notes | text | clinician notes for this specific prescription |
| is_active | boolean | default true, allows soft-removal |

**Index:** `(plan_id, day_of_week, order_index)`.

#### `exercise_feedback`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| plan_exercise_id | uuid | FK -> plan_exercises.id |
| patient_id | uuid | FK -> users.id |
| rating | enum('felt_good','mild_discomfort','painful','unsure_how_to_perform') | |
| comment | text | optional free text |
| clinician_response | text | nullable, clinician reply |
| responded_at | timestamptz | nullable |
| created_at | timestamptz | |

**Index:** `plan_exercise_id`, `patient_id`, `created_at`.

#### `workout_sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| plan_id | uuid | FK -> workout_plans.id |
| patient_id | uuid | FK -> users.id |
| started_at | timestamptz | |
| completed_at | timestamptz | nullable |
| status | enum('in_progress','completed','abandoned') | |
| overall_pain_level | int | 0-10 scale, nullable |
| notes | text | patient notes |

**Index:** `(patient_id, plan_id, started_at)`.

#### `session_exercises`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK -> workout_sessions.id |
| plan_exercise_id | uuid | FK -> plan_exercises.id |
| status | enum('completed','skipped','modified') | |
| actual_sets | int | nullable |
| actual_reps | int | nullable |
| completed_at | timestamptz | nullable |

**Index:** `session_id`.

#### `assessments`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| patient_id | uuid | FK -> users.id |
| assessment_type | varchar(100) | e.g., 'single_leg_balance', 'pain_score', 'tug_test' |
| value | decimal | numeric result |
| unit | varchar(50) | e.g., 'seconds', 'score_0_10', 'meters' |
| notes | text | nullable |
| assessed_by | uuid | FK -> users.id, nullable (self-assessed or clinician) |
| created_at | timestamptz | |

**Index:** `(patient_id, assessment_type, created_at)`.

#### `messages`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| sender_id | uuid | FK -> users.id |
| recipient_id | uuid | FK -> users.id |
| plan_id | uuid | FK -> workout_plans.id, nullable (contextual) |
| plan_exercise_id | uuid | FK -> plan_exercises.id, nullable |
| content | text | not null |
| is_read | boolean | default false |
| created_at | timestamptz | |

**Index:** `(sender_id, recipient_id, created_at)`, `recipient_id` (for unread counts).

#### `exercise_media`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| exercise_id | uuid | FK -> exercises.id |
| media_type | enum('image','video') | |
| url | varchar(500) | |
| thumbnail_url | varchar(500) | nullable |
| alt_text | varchar(300) | accessibility |
| created_at | timestamptz | |

**Index:** `exercise_id`.

### 5.3 Storage & Indexing Strategy

- **PostgreSQL on Neon** with connection pooling via `@neondatabase/serverless`. Use Neon's HTTP driver for serverless-friendly queries that avoid persistent TCP connections.
- **Drizzle ORM** with `drizzle-kit` for migration management. Schema defined in TypeScript at `lib/db/schema/`.
- **GIN indexes** on array columns (`equipment_required`, `contraindications`) for efficient `@>` (contains) queries.
- **Full-text search** on `exercises.name` and `exercises.description` using PostgreSQL `tsvector` -- avoids needing a separate search service for the exercise library.
- **JSONB column** on `workout_plans.ai_generation_params` to store the snapshot of AI inputs. This is intentionally denormalized -- it is write-once audit data, not queryable in aggregate.

### 5.4 Migration Strategy

Use `drizzle-kit` with the following workflow:
1. Define schema in `lib/db/schema/*.ts` files.
2. Run `npx drizzle-kit generate` to produce SQL migration files in `drizzle/migrations/`.
3. Run `npx drizzle-kit migrate` to apply.
4. Seed the exercise library from a structured JSON file (`lib/db/seed/exercises.json`) via a seed script.

---

## 6. API Design & Application Structure

### 6.1 Next.js App Router Folder Structure

```
app/
  (auth)/
    login/page.tsx
    register/page.tsx
    forgot-password/page.tsx
    layout.tsx                    -- minimal layout, no sidebar
  (platform)/
    layout.tsx                    -- authenticated layout with sidebar + header
    dashboard/
      page.tsx                    -- role-aware: shows clinician or patient dashboard
    exercises/
      page.tsx                    -- exercise library browser
      [id]/page.tsx               -- exercise detail view
      new/page.tsx                -- add exercise (clinician only)
    workout-plans/
      page.tsx                    -- list plans (my plans or assigned plans)
      [id]/
        page.tsx                  -- plan detail view
        edit/page.tsx             -- edit plan (clinician only)
        session/page.tsx          -- active workout session (patient)
      generate/page.tsx           -- AI workout generation form
    patients/                     -- clinician only
      page.tsx                    -- patient list
      [id]/
        page.tsx                  -- patient detail (profile, plans, adherence)
        adherence/page.tsx        -- detailed adherence view
        outcomes/page.tsx         -- outcome tracking charts
    messages/
      page.tsx                    -- message inbox
      [threadId]/page.tsx         -- conversation thread
    assessments/
      page.tsx                    -- assessment history
      new/page.tsx                -- record new assessment
    settings/
      page.tsx                    -- user profile settings
  api/
    auth/[...nextauth]/route.ts   -- NextAuth.js handler
    ai/
      generate-workout/route.ts   -- streaming AI workout generation
    uploadthing/route.ts          -- file upload handler
    webhooks/route.ts             -- external webhook receiver

lib/
  db/
    index.ts                      -- Drizzle client + connection
    schema/
      users.ts
      exercises.ts
      workout-plans.ts
      feedback.ts
      adherence.ts
      assessments.ts
      messages.ts
      index.ts                    -- barrel export
    seed/
      exercises.json
      seed.ts
  services/
    auth.service.ts
    exercise.service.ts
    ai.service.ts
    workout-plan.service.ts
    feedback.service.ts
    adherence.service.ts
    outcome.service.ts
    progression.service.ts
    message.service.ts
  ai/
    prompts/
      workout-generation.ts       -- system prompt + prompt builder
      exercise-selection.ts       -- exercise filtering prompt
    schemas/
      workout-output.ts           -- Zod schema for AI output validation
    tools/
      exercise-lookup.ts          -- Claude tool_use for exercise search
  auth/
    auth.config.ts                -- NextAuth configuration
    middleware.ts                  -- route protection
  validators/
    workout.ts                    -- Zod schemas for workout forms
    patient.ts                    -- Zod schemas for patient profile
    feedback.ts                   -- Zod schemas for feedback
  utils/
    cn.ts                         -- clsx + twMerge utility
    dates.ts
    formatting.ts

components/
  ui/                             -- shadcn/ui generated components
  layout/
    sidebar.tsx
    header.tsx
    role-guard.tsx
  exercises/
    exercise-card.tsx
    exercise-detail.tsx
    exercise-form.tsx
    exercise-filter.tsx
  workout/
    workout-generator-form.tsx
    workout-plan-view.tsx
    workout-session-tracker.tsx
    exercise-slot.tsx
  feedback/
    feedback-form.tsx
    feedback-summary.tsx
  adherence/
    compliance-chart.tsx
    session-history.tsx
  outcomes/
    progress-chart.tsx
    assessment-form.tsx
  messages/
    message-thread.tsx
    message-input.tsx
  dashboard/
    clinician-dashboard.tsx
    patient-dashboard.tsx

actions/
  workout-actions.ts              -- Server Actions for workout CRUD
  feedback-actions.ts
  exercise-actions.ts
  adherence-actions.ts
  assessment-actions.ts
  message-actions.ts
  patient-actions.ts
```

### 6.2 Server Actions (Primary Mutation Pattern)

All write operations use Server Actions. Example signatures:

```
// actions/workout-actions.ts
"use server"
generateWorkout(formData: WorkoutGenerationInput): AsyncGenerator<StreamChunk>
saveWorkoutPlan(plan: CreatePlanInput): Promise<WorkoutPlan>
assignPlanToPatient(planId: string, patientId: string): Promise<void>
updatePlanExercise(planExerciseId: string, changes: UpdateExerciseInput): Promise<void>

// actions/feedback-actions.ts
"use server"
submitFeedback(input: SubmitFeedbackInput): Promise<void>
respondToFeedback(feedbackId: string, response: string): Promise<void>

// actions/adherence-actions.ts
"use server"
startSession(planId: string): Promise<WorkoutSession>
completeExercise(sessionId: string, exerciseId: string, data: ExerciseCompletionInput): Promise<void>
completeSession(sessionId: string, overallPain: number, notes?: string): Promise<void>
```

### 6.3 API Routes (Streaming & Webhooks Only)

**`POST /api/ai/generate-workout`** -- Streaming endpoint for AI workout generation.
- Request body: `{ patientProfile, preferences, exerciseFilters }`
- Response: Server-Sent Events stream using Vercel AI SDK `streamObject`.
- Auth: Requires authenticated session (clinician or patient role).
- The route handler calls `AIService.generateWorkout()` which constructs the prompt, embeds relevant exercises from the library as context, and streams structured output.

**`POST /api/uploadthing`** -- Uploadthing file upload handler.
- Auth: Clinician role only.
- Accepts image and video uploads for the exercise library.

### 6.4 Error Handling Strategy

- Server Actions return a discriminated union: `{ success: true, data: T } | { success: false, error: string, field?: string }`.
- Zod validation errors are caught at the action boundary and returned as field-level errors.
- Database errors are caught, logged, and returned as generic user-facing messages (never expose SQL details).
- AI generation failures (rate limit, timeout, invalid output) are caught and surfaced with a retry option.
- Use React 19 `useActionState` on the client to handle pending/error/success states.

### 6.5 Authorization Enforcement

Authorization is enforced at three layers:

1. **Middleware** (`middleware.ts`): Redirects unauthenticated users from `/(platform)/*` to `/login`. No role checking at this layer -- only authentication.
2. **Server Components**: Each page server component calls `auth()` and checks the user role. Clinician-only pages (e.g., `/patients`) return `notFound()` for patient role users.
3. **Server Actions**: Every action begins with `const session = await auth(); if (!session) throw new Error("Unauthorized");` followed by role and ownership checks (e.g., a patient can only submit feedback for their own plans).

---

## 7. AI Integration Strategy

### 7.1 Architecture: Constrained Generation via Tool Use

The central design principle: **Claude must select exercises from the library, never invent them.** This is enforced through Claude's tool_use feature, not through prompt engineering alone.

**Approach:**

1. When a workout generation request arrives, the service queries the exercise library filtered by the patient's equipment, body regions of interest, and difficulty level. This produces a candidate set of 30-80 exercises.

2. The candidate exercises are provided to Claude in two ways:
   - As **system prompt context**: A structured list of exercises with IDs, names, body regions, equipment, difficulty, and contraindications.
   - As a **tool definition**: `select_exercise(exercise_id: string, sets: number, reps?: number, duration_seconds?: number, rest_seconds: number, rationale: string)` -- Claude must call this tool for each exercise it wants to include in the plan.

3. Claude receives a user prompt containing the patient profile (limitations, comorbidities, functional challenges, goals, duration, frequency) and is instructed to build a workout plan by calling `select_exercise` for each exercise, in order.

4. Every `select_exercise` call is validated server-side:
   - The `exercise_id` must exist in the candidate set.
   - The exercise must not have contraindications matching the patient's conditions.
   - Sets/reps/duration must fall within reasonable bounds for the exercise's difficulty level.

5. If validation fails for any exercise selection, the invalid selection is rejected and Claude is prompted to choose an alternative.

### 7.2 Prompt Architecture

```
SYSTEM PROMPT:
  You are an exercise prescription assistant for a physiotherapy platform.
  You MUST only select exercises from the provided library using the
  select_exercise tool. Never suggest exercises not in the library.

  Patient safety rules:
  - Never prescribe exercises contraindicated for the patient's conditions
  - Start conservative: prefer beginner/intermediate for new patients
  - Ensure balanced muscle group coverage
  - Include warm-up and cool-down exercises
  - Respect the target duration and frequency

  Available exercises: [structured JSON array of candidate exercises]

USER PROMPT:
  Generate a {duration}-minute workout plan for {days_per_week} days/week.
  Patient profile:
  - Limitations: {limitations}
  - Comorbidities: {comorbidities}
  - Functional challenges: {functional_challenges}
  - Equipment: {equipment}
  - Goals: {goals}

  For each exercise, call select_exercise with appropriate parameters.
  Aim for {duration_minutes / 3-5 exercises per session} exercises per session.
```

### 7.3 Streaming Response Handling

Using the Vercel AI SDK `streamObject` pattern:

1. The `/api/ai/generate-workout` route creates a streaming response.
2. On the client, the `useObject` hook from `ai/react` consumes the stream and provides partial results as exercises are selected.
3. Each exercise appears in the UI as Claude selects it, giving immediate feedback to the clinician/patient.
4. Once the stream completes, the full workout plan is presented for review before saving.

### 7.4 AI Safety Guardrails

| Risk | Mitigation |
|---|---|
| Hallucinated exercises | Tool use with server-side ID validation. If an ID does not exist, the tool call fails. |
| Contraindicated exercises | Server-side cross-reference of exercise contraindications against patient conditions before accepting the tool call. |
| Unreasonable parameters | Zod validation on sets (1-10), reps (1-50), duration (5-300 seconds). Reject and re-prompt if out of bounds. |
| Inappropriate medical advice | System prompt explicitly states: "You prescribe exercises, not medical diagnoses. Never suggest the patient has a condition. Never suggest discontinuing medical treatment." |
| Model downtime / rate limits | Implement retry with exponential backoff (max 3 retries). Surface clear error to user with "try again" option. Consider caching recently generated plans as templates. |

---

## 8. Development Phases

### Phase 1 -- Foundation & Core MVP (Weeks 1-4)

**Goals:** Establish the technical foundation, authentication, exercise library, and basic AI workout generation. A clinician can log in, browse exercises, generate a workout with AI, and save it.

**Deliverables:**
- [ ] Project scaffolding: install all dependencies, configure Drizzle, set up Neon database
- [ ] Database schema: `users`, `exercises`, `exercise_progressions`, `exercise_media` tables with migrations
- [ ] Authentication: NextAuth.js v5 with email/password, role-based sessions, middleware protection
- [ ] Exercise library: CRUD for exercises (clinician only), search/filter UI, seed data (30-50 exercises)
- [ ] AI workout generation: Claude integration with tool_use, streaming response, workout review UI
- [ ] `workout_plans` and `plan_exercises` tables with migrations
- [ ] Basic workout plan save and view functionality
- [ ] Layout shell: authenticated layout with sidebar, role-aware navigation

**Dependencies:** None (this is the foundation).
**Estimated complexity:** High

### Phase 2 -- Patient Portal & Plan Assignment (Weeks 5-7)

**Goals:** Patients can register, receive assigned plans, view workout details, and run workout sessions. Clinicians can manage patients and assign plans.

**Deliverables:**
- [ ] Patient registration flow with profile setup (limitations, equipment, goals)
- [ ] `patient_profiles`, `patient_clinician_links` tables with migrations
- [ ] Clinician patient management: add/link patients, view patient list
- [ ] Plan assignment: clinician assigns plan to patient
- [ ] Patient dashboard: view assigned plans
- [ ] Workout plan detail view with exercise demonstrations (video/image)
- [ ] Active workout session tracker: start session, mark exercises complete/skipped, end session
- [ ] `workout_sessions`, `session_exercises` tables with migrations
- [ ] Patient self-service AI workout generation (with guardrails)

**Dependencies:** Phase 1 complete.
**Estimated complexity:** Medium

### Phase 3 -- Feedback, Adherence & Communication (Weeks 8-10)

**Goals:** Close the feedback loop. Patients provide per-exercise feedback. Clinicians see adherence data and can communicate with patients.

**Deliverables:**
- [ ] `exercise_feedback` table with migrations
- [ ] Per-exercise feedback UI (felt good / mild discomfort / painful / unsure)
- [ ] Clinician feedback dashboard: view feedback by patient, by plan, by exercise
- [ ] Clinician response to feedback (text reply + exercise adjustment)
- [ ] Adherence tracking: weekly compliance calculation, exercises skipped, pain reports
- [ ] Clinician adherence dashboard with charts (Recharts)
- [ ] `messages` table with migrations
- [ ] Patient-clinician messaging UI: send, receive, mark read
- [ ] Message notifications via email (Resend)

**Dependencies:** Phase 2 complete.
**Estimated complexity:** Medium

### Phase 4 -- Progression Engine & Outcome Tracking (Weeks 11-13)

**Goals:** Intelligent exercise adjustments and measurable outcome tracking over time.

**Deliverables:**
- [ ] Progression/regression chain data model populated for all library exercises
- [ ] Progression engine: analyze feedback + adherence patterns, generate suggestions
- [ ] Clinician approval workflow for progression/regression suggestions
- [ ] One-click exercise swap (apply progression/regression to a plan)
- [ ] `assessments` table with migrations
- [ ] Assessment recording UI (baseline + periodic)
- [ ] Outcome progress charts: visual timeline of assessment results
- [ ] Assessment comparison view (baseline vs. current)

**Dependencies:** Phase 3 complete.
**Estimated complexity:** Medium-High

### Phase 5 -- Polish, Performance & Production Readiness (Weeks 14-16)

**Goals:** Production-grade reliability, performance, and user experience polish.

**Deliverables:**
- [ ] Error boundary implementation across all route segments
- [ ] Loading states with skeleton UI for all data-fetching pages
- [ ] Optimistic updates for feedback submission and message sending
- [ ] Input sanitization audit (XSS prevention on all user-generated text)
- [ ] Rate limiting on AI generation endpoint (per-user: 10 generations/hour)
- [ ] Database query performance audit: add missing indexes, optimize slow queries
- [ ] Responsive design audit: ensure all pages work on mobile (patients may use phones)
- [ ] Accessibility audit: ARIA labels, keyboard navigation, screen reader testing
- [ ] Email notification preferences (opt-in/out for patients)
- [ ] Data export: clinician can export patient adherence data as CSV
- [ ] Deployment pipeline: Vercel project setup, environment variables, preview deployments
- [ ] Monitoring: Vercel Analytics + error tracking (Sentry)

**Dependencies:** Phase 4 substantially complete.
**Estimated complexity:** Medium

---

## 9. Potential Risks & Challenges

### Risk 1: AI Generates Unsafe Exercises for Patient Conditions

- **Likelihood:** Medium
- **Impact:** Critical (patient injury, liability)
- **Mitigation:** Triple-layer defense: (1) Pre-filter exercise candidates by removing those with matching contraindications before sending to Claude. (2) Claude tool_use with server-side validation rejects contraindicated selections. (3) All AI-generated plans for patients are flagged as "pending clinician review" unless the clinician themselves generated it. Add a disclaimer: "This AI-generated program is not a substitute for professional medical advice."

### Risk 2: HIPAA Compliance Exposure

- **Likelihood:** High (if operating in the US healthcare context)
- **Impact:** Critical (legal, financial)
- **Mitigation:** (1) Use Neon Postgres with encryption at rest and in transit. (2) Never log patient health data to application logs or third-party analytics. (3) Anthropic Claude API: review their BAA (Business Associate Agreement) availability -- as of early 2026, Anthropic offers BAA for enterprise customers. If BAA is not in place, do not send identifiable patient health information in prompts; anonymize or strip PII before AI calls. (4) Implement audit logging for all data access (who viewed which patient's data, when). (5) Session timeout after 30 minutes of inactivity. (6) Do not store patient data in browser localStorage or cookies beyond the session token. (7) Consult a HIPAA compliance specialist before launch.

### Risk 3: Claude API Availability and Latency

- **Likelihood:** Medium
- **Impact:** Medium (degraded UX, not data loss)
- **Mitigation:** (1) Implement retry with exponential backoff (3 attempts, 1s/2s/4s delays). (2) Show a clear loading state with progress indication during generation. (3) Cache previously generated workout structures as templates that can be quickly cloned and modified without AI. (4) Design the UX so that manual workout creation (selecting exercises by hand) is always available as a fallback.

### Risk 4: Exercise Library Data Quality

- **Likelihood:** Medium
- **Impact:** High (garbage in, garbage out for AI generation)
- **Mitigation:** (1) Invest heavily in seed data quality -- engage a physiotherapist to curate the initial 50-100 exercises with correct contraindications, progression chains, and difficulty ratings. (2) Build an exercise review workflow for clinicians to flag issues. (3) Validate that every exercise has complete data (instructions, difficulty, at least one media asset) before making it available to the AI.

### Risk 5: Complex Multi-Role Authorization Bugs

- **Likelihood:** Medium
- **Impact:** High (patients seeing other patients' data, or patients accessing clinician functions)
- **Mitigation:** (1) Enforce authorization at the service layer, not just the UI layer. Every service method checks ownership and role. (2) Write integration tests for authorization boundaries: "patient A cannot see patient B's workout plan", "patient cannot access /patients route", "clinician can only see their own patients". (3) Use the `RoleGuard` component pattern to prevent rendering clinician-only UI for patients even before the server check.

### Risk 6: Database Performance Degradation at Scale

- **Likelihood:** Low (within the first year)
- **Impact:** Medium
- **Mitigation:** (1) Design indexes from day one based on known query patterns (documented in the data architecture section above). (2) Use `EXPLAIN ANALYZE` on key queries during Phase 5 performance audit. (3) Neon supports read replicas if read-heavy dashboard queries become a bottleneck. (4) Adherence aggregation queries (weekly compliance calculations) should be computed and cached, not recalculated on every dashboard load.

---

## 10. Future Scalability Considerations

### Near-term (6-12 months post-launch)

- **Redis caching layer**: Cache exercise library queries, adherence aggregations, and dashboard metrics. The exercise library changes infrequently and is read on every AI generation request -- ideal for caching with a 1-hour TTL.
- **Background job processing**: Move email notifications and adherence aggregation calculations to a job queue (Inngest or Trigger.dev, both integrate natively with Next.js). This prevents slow side effects from blocking user-facing requests.
- **Multi-tenant clinician practices**: Support clinician organizations where multiple clinicians share a patient pool with different permission levels (admin, clinician, assistant).

### Medium-term (1-2 years)

- **Mobile app (React Native)**: The service layer is already decoupled from the transport layer. Add API routes that expose the same service methods for a mobile client. Share Zod validation schemas between web and mobile.
- **Exercise video generation**: Use AI video generation or 3D avatar rendering to automatically create exercise demonstration videos from text instructions, reducing the content creation burden.
- **Smart scheduling**: Based on adherence patterns, suggest optimal workout times and send push notifications.
- **Wearable integration**: Accept heart rate, movement, and recovery data from Apple Watch / Fitbit to enhance adherence tracking and personalize intensity recommendations.

### Long-term architecture evolution

- **Extract AI service**: If AI generation becomes compute-intensive or requires GPU inference for custom models, extract it into a separate service behind an internal API.
- **Event-driven architecture**: As the feedback-progression-adherence loop becomes more sophisticated, consider an event bus (e.g., Inngest) where "feedback submitted" and "session completed" events trigger progression evaluation asynchronously.
- **Read replicas + materialized views**: For clinician dashboards aggregating data across hundreds of patients, use PostgreSQL materialized views refreshed on a schedule, backed by read replicas.

---

## 11. Development Checklist

### Foundation

- [ ] Install dependencies: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`, `next-auth@beta`, `@auth/drizzle-adapter`, `@anthropic-ai/sdk`, `ai`, `zod`, `bcryptjs`, `uploadthing`, `recharts`, `react-hook-form`, `@hookform/resolvers`, `resend`
- [ ] Install dev dependencies: `@types/bcryptjs`, `drizzle-kit`
- [ ] Initialize shadcn/ui: `npx shadcn@latest init`
- [ ] Create `lib/db/index.ts` with Drizzle client and Neon connection
- [ ] Create Neon project and store `DATABASE_URL` in `.env.local`
- [ ] Create `.env.local` with: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ANTHROPIC_API_KEY`, `UPLOADTHING_TOKEN`, `RESEND_API_KEY`
- [ ] Add `.env.local` to `.gitignore` (already present in Next.js default)

### Database & Schema

- [ ] Define all Drizzle schema files in `lib/db/schema/`
- [ ] Generate and run initial migration with `drizzle-kit`
- [ ] Create seed script with 50+ curated exercises (engage physiotherapist for content)
- [ ] Validate all foreign keys, indexes, and constraints
- [ ] Create `drizzle.config.ts` configuration file

### Authentication

- [ ] Configure NextAuth.js v5 with credentials provider
- [ ] Implement Drizzle adapter for session/account storage
- [ ] Add `role` field to session via `callbacks.session`
- [ ] Create `middleware.ts` for route protection
- [ ] Build login page at `app/(auth)/login/page.tsx`
- [ ] Build registration page with role selection
- [ ] Implement password hashing with bcryptjs
- [ ] Build forgot-password flow with Resend

### Exercise Library

- [ ] Build exercise CRUD service (`lib/services/exercise.service.ts`)
- [ ] Build exercise browser page with search and filters
- [ ] Build exercise detail page with media display
- [ ] Build exercise creation/edit form (clinician only)
- [ ] Implement Uploadthing integration for exercise media
- [ ] Populate progression/regression chains in seed data

### AI Workout Generation

- [ ] Build AI service (`lib/services/ai.service.ts`)
- [ ] Define workout output Zod schema (`lib/ai/schemas/workout-output.ts`)
- [ ] Build Claude tool_use definition for `select_exercise`
- [ ] Build prompt construction logic with patient context + exercise library
- [ ] Implement server-side validation of AI exercise selections
- [ ] Build streaming API route at `/api/ai/generate-workout`
- [ ] Build workout generator form UI component
- [ ] Build streaming workout preview component
- [ ] Implement contraindication cross-checking

### Workout Plans

- [ ] Build workout plan service (`lib/services/workout-plan.service.ts`)
- [ ] Build plan creation flow (save AI-generated plan)
- [ ] Build plan detail view with exercise cards
- [ ] Build plan editing UI (swap exercises, adjust parameters)
- [ ] Build plan assignment to patients
- [ ] Build plan list views (clinician: all plans, patient: my plans)

### Patient Management

- [ ] Build patient profile setup flow
- [ ] Build patient-clinician linking
- [ ] Build clinician patient list page
- [ ] Build patient detail page (profile, plans, adherence summary)

### Workout Sessions

- [ ] Build workout session tracker component
- [ ] Implement session start/complete/abandon flow
- [ ] Build per-exercise completion tracking
- [ ] Display exercise instructions and media during session

### Feedback

- [ ] Build feedback submission UI (per-exercise rating + comment)
- [ ] Build clinician feedback dashboard
- [ ] Implement clinician response to feedback
- [ ] Build feedback trends visualization

### Adherence

- [ ] Build adherence calculation logic (weekly compliance %)
- [ ] Build clinician adherence dashboard with charts
- [ ] Build per-patient adherence detail view
- [ ] Implement pain report aggregation

### Messaging

- [ ] Build message service
- [ ] Build message thread UI
- [ ] Build inbox with unread counts
- [ ] Implement contextual messages (linked to plan/exercise)
- [ ] Set up email notifications for new messages via Resend

### Progression Engine

- [ ] Build progression evaluation logic
- [ ] Build suggestion UI for clinicians
- [ ] Build one-click exercise swap (apply suggestion)
- [ ] Test progression chains end-to-end

### Outcomes

- [ ] Build assessment recording UI
- [ ] Build assessment history page
- [ ] Build progress charts with Recharts
- [ ] Build baseline vs. current comparison view

### Production Readiness

- [ ] Implement error boundaries for all route segments
- [ ] Add loading.tsx skeleton states for all pages
- [ ] Implement rate limiting on AI endpoint
- [ ] Conduct input sanitization audit
- [ ] Conduct responsive design audit (mobile)
- [ ] Conduct accessibility audit
- [ ] Set up Vercel deployment with environment variables
- [ ] Configure Sentry for error tracking
- [ ] Configure Vercel Analytics
- [ ] Write authorization integration tests
- [ ] Database performance audit with `EXPLAIN ANALYZE`
- [ ] Add medical disclaimer to all AI-generated content

---

## Key Technical Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Database | PostgreSQL (Neon) | Deeply relational data model; serverless-compatible; HTTP driver avoids connection issues |
| ORM | Drizzle | Zero runtime overhead, predictable SQL, TypeScript-native schema, excellent migration tooling |
| Auth | NextAuth.js v5 | Purpose-built for Next.js App Router; JWT sessions; role-based callbacks; middleware integration |
| AI Integration | Claude API via tool_use | Constrains output to library exercises; server-side validation on every tool call; streaming support |
| AI Streaming | Vercel AI SDK | Handles SSE plumbing, provides React hooks for partial results, framework-native |
| Mutations | Server Actions | Type-safe, no API route boilerplate, native React 19 integration with `useActionState` |
| UI Components | shadcn/ui (source code) | No dependency lock-in; accessible Radix primitives; full Tailwind customization |
| File Storage | Uploadthing | Next.js-native file uploads; CDN delivery; simpler than raw S3 for exercise media |
| State Management | React 19 built-ins + URL state | `useActionState` for mutations, `useOptimistic` for UI, search params for filters -- no Redux/Zustand needed |
| Email | Resend | Simple API, React email templates, reliable delivery for transactional messages |

---

This plan is structured for a team of 1-3 engineers working over approximately 16 weeks. Phase 1 alone produces a demonstrable MVP where a clinician can log in, browse exercises, generate an AI-powered workout, and save it -- which is sufficient for early stakeholder feedback and validation. Each subsequent phase adds a complete, testable feature layer without requiring rework of prior phases.