---
name: Exercise Platform Architecture
description: Core architecture decisions and tech stack for the AI Home Exercise Platform
type: project
---

## Tech Stack
- Next.js 16.1.6 (App Router), React 19, TypeScript strict, Tailwind CSS v4
- Drizzle ORM + Neon Postgres (HTTP driver via @neondatabase/serverless)
- NextAuth v5 (credentials provider, JWT sessions, role-based access)
- Claude API via @anthropic-ai/sdk with tool_use for constrained exercise selection
- Vercel AI SDK for streaming, shadcn/ui for components, Recharts for charts
- Uploadthing for media, Resend for email, Zod for validation

## Key Architecture Patterns
- Server Actions for all mutations, RSC for data fetching
- Service layer between actions/routes and DB (lib/services/*.service.ts)
- Validators at API boundary (lib/validators/*.ts)
- ActionResponse<T> discriminated union for all action returns
- Three-layer auth: middleware (authn), server component (role), action (role+ownership)

## HIPAA: No PII sent to Claude API. No health data in localStorage/console.log.

**Why:** The strategy doc specifies a monolithic Next.js app with strict service layer separation, HIPAA-conscious data handling, and AI constrained to curated exercise library via tool_use validation.

**How to apply:** All future planning and implementation must respect these boundaries. Service layer is the most critical separation.
