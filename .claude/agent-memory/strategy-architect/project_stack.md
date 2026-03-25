---
name: Project Tech Stack
description: Confirmed tech stack, package versions, and tooling for the exercise-webapp
type: project
---

**Confirmed Stack (verified from package.json and code, 2026-03-24):**
- Next.js 16.1.6 (App Router), React 19.2.3, TypeScript 5
- Tailwind CSS v4, shadcn/ui, Radix via @base-ui/react
- MongoDB via Prisma ORM (@prisma/client 6.19.2)
- Auth: Clerk (@clerk/nextjs 7.0.4) — clerkId on User model
- AI: OpenAI GPT-4o (openai 6.29.0) — also has @ai-sdk/anthropic + Vercel AI SDK installed but unused for generation
- File upload: Uploadthing (uploadthing 7.7.4, @uploadthing/react 7.3.3), images served from utfs.io
- Forms: React Hook Form 7.71.2 + Zod 4.3.6
- Charts: Recharts 3.8.0
- Email: Resend 6.9.3
- Webhooks: Svix 1.88.0
- Package manager: npm
- Windows 11 dev environment

**Why:** Decisions about new features must align with these exact versions and libraries.
**How to apply:** Never recommend conflicting libraries (e.g., NextAuth, Drizzle, S3). Build on existing patterns.
