---
name: Exercise Platform Architecture
description: Core tech stack, architecture patterns, and verified file structure for the AI Home Exercise Platform (verified 2026-04-02)
type: project
---

## Tech Stack (verified from package.json + code 2026-04-02)
- Next.js 16.1.6 App Router, React 19.2.3, TypeScript 5, Tailwind CSS v4
- MongoDB via Prisma ORM 6.19.x (`provider = "mongodb"`)
- Auth: Clerk 7.x (`clerkId` on User, `auth()` from `@clerk/nextjs/server`)
- AI: Vercel AI SDK + Anthropic Claude (`ai` + `@ai-sdk/anthropic`); also OpenAI (`openai` npm)
- File storage: Uploadthing 7.7.x (`@uploadthing/react` 7.3.x)
- UI: shadcn/ui + Radix, Tailwind CSS v4
- Forms: React Hook Form 7.x + Zod 4.x
- Calendar: react-big-calendar with DnD addon
- Drag-drop: @dnd-kit/core + @dnd-kit/sortable
- Charts: Recharts
- Email: Resend
- Toasts: Sonner (NOT react-hot-toast)
- No Redux, No Zustand, No tRPC

## Key Architecture Patterns
- Server Actions in `actions/*.ts` (auth: `auth()` -> findUnique by clerkId -> role check)
- Action return shape: `{ success: true as const, data }` or `{ success: false as const, error: string }`
- Service layer in `lib/services/*.service.ts` (thin Prisma wrappers, no auth)
- Validators in `lib/validators/*.ts` (Zod schemas)
- Server Components by default; `"use client"` only when interactive
- `lib/current-user.ts`: `getCurrentUser()`, `requireRole()` helpers
- `lib/prisma.ts`: singleton PrismaClient
- Platform pages under `app/(platform)/` with auth-gated layout
- Client portal under `app/(client)/` (Phase 2+)

## Data Model Evolution
- V1 models: WorkoutPlan, PlanExercise, WorkoutBlock, BlockExercise, WorkoutSession, SessionExercise
- V2 models (EXECUTION-BLUEPRINT-V2.md): Program, Workout, WorkoutBlockV2, BlockExerciseV2, ExerciseSet, WorkoutSessionV2, SessionExerciseLog, SetLog
- V2 adds: check-ins, habits, body metrics, nutrition, notifications, billing (Stripe), branding

## HIPAA: No PII sent to AI APIs. No health data in localStorage/console.log.

**Why:** Foundation for all execution plans.
**How to apply:** All new features must follow service-layer separation, action auth pattern, and file structure conventions. New features target V2 models per EXECUTION-BLUEPRINT-V2.md.
