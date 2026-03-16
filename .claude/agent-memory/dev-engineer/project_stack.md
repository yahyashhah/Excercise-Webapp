---
name: RehabAI Tech Stack and Architecture
description: Core tech stack decisions, version constraints, and build-verified patterns for the AI Home Exercise Platform (RehabAI)
type: project
---

## Tech Stack (build-verified 2026-03-15)

- **Framework:** Next.js 16.1.6 (Turbopack, app router)
- **Auth:** Clerk v7 (`@clerk/nextjs ^7.0.4`)
- **Database:** MongoDB Atlas via Prisma v6 (`@prisma/client ^6.19.2`, `prisma ^6.19.2`)
- **UI:** shadcn/ui v4 with base-ui (NOT Radix) — `@base-ui/react`
- **AI:** Anthropic Claude via `@anthropic-ai/sdk`
- **Styling:** Tailwind v4 with `tw-animate-css`
- **Validation:** Zod v4

## Key Version Constraints

**Why:** Prisma v7 requires driver adapters for all databases. There is NO official MongoDB adapter for Prisma v7 as of March 2026. Must use Prisma v6 which supports direct `url = env("DATABASE_URL")` in schema.

**How to apply:** Never upgrade to Prisma v7 until `@prisma/mongo-adapter` is published. If upgrading, need to add adapter pattern.

## shadcn/ui Base-UI Patterns

- Button component uses `@base-ui/react/button`, NOT Radix. Does NOT have native `asChild` prop.
- We added custom `asChild` support to Button via `React.cloneElement` pattern.
- Sheet/Dialog/Trigger components do NOT support `asChild` — use direct className styling on the trigger element.

## Zod v4 Breaking Change

- `parsed.error.errors[0]` is now `parsed.error.issues[0]` in Zod v4.

## Clerk v7 Changes

- `UserButton` prop is `signInUrl` not `afterSignOutUrl`
- Auth: `const { userId } = await auth()` from `@clerk/nextjs/server` (async)
- `WebhookEvent` imported from `@clerk/nextjs/server`

## Enum Values

All Prisma enums are UPPERCASE: CLINICIAN, PATIENT, ACTIVE, DRAFT, FELT_GOOD, LOWER_BODY, BEGINNER, etc.

## Next.js 16 Notes

- Middleware file convention deprecated in favor of "proxy" — shows warning but still works
- `searchParams` and `params` in page components are Promises — must `await` them
