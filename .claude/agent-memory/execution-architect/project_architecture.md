---
name: Exercise Platform Architecture
description: Core tech stack, architecture patterns, and verified file structure for the AI Home Exercise Platform (verified 2026-03-24)
type: project
---

## Tech Stack (verified from package.json + code 2026-03-24)
- Next.js 16.1.6 App Router, React 19.2.3, TypeScript 5, Tailwind CSS v4
- MongoDB via Prisma ORM 6.19.x (`provider = "mongodb"`)
- Auth: Clerk 7.x (`clerkId` on User, `auth()` from `@clerk/nextjs/server`)
- AI: OpenAI GPT-4o (`openai` npm 6.29, `gpt-4o` model)
- File storage: Uploadthing 7.7.x (`@uploadthing/react` 7.3.x)
- UI: shadcn/ui + Radix, Tailwind CSS v4
- Forms: React Hook Form 7.x + Zod 4.x
- No Redux, No Zustand, No tRPC

## Key Architecture Patterns
- Server Actions in `actions/*.ts` (auth check: `auth()` -> findUnique by clerkId -> role check)
- Service layer in `lib/services/*.service.ts` (thin Prisma wrappers)
- Validators in `lib/validators/*.ts` (Zod schemas)
- Server Components by default; `"use client"` only when interactive
- `lib/current-user.ts`: `getCurrentUser()`, `requireRole()` helpers
- `lib/prisma.ts`: singleton PrismaClient
- Platform pages under `app/(platform)/` with auth-gated layout
- Seed: `lib/db/seed/seed.ts` via `npx tsx lib/db/seed/seed.ts`

## HIPAA: No PII sent to AI APIs. No health data in localStorage/console.log.

**Why:** Foundation for all execution plans.
**How to apply:** All new features must follow service-layer separation, action auth pattern, and file structure conventions.
