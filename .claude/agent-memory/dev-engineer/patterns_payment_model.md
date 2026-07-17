---
name: RehabAI Payment / Billing Data Model
description: The two distinct payment concepts in the schema and which one is actually populated — critical for any revenue/billing metric work
metadata:
  type: project
---

## Two separate payment concepts (schema, 2026-07-14)

There are TWO unrelated billing models in `prisma/schema.prisma`. Do not conflate them.

1. **`TrainerSubscription`** (+ `lib/services/stripe-billing.service.ts`, `app/api/stripe/webhook/route.ts`, checkout/portal routes, `lib/stripe-config.ts` tiers STARTER/…): trainer pays the *platform* a SaaS subscription. This is money the trainer PAYS OUT, not revenue they earn. Fully wired end-to-end.

2. **`CoachPackage` → `ClientSubscription` → `Invoice`**: models clients paying the *trainer* through the platform. `CoachPackage.priceInCents`, `ClientSubscription` (has `trainerId`, `status`, `currentPeriodStart/End`), `Invoice.amountInCents`/`status`/`paidAt`.

**Why it matters:** As of 2026-07-14, NO application code writes to CoachPackage/ClientSubscription/Invoice — grep confirms zero `.create` calls; the Stripe webhook only touches `TrainerSubscription`. So these tables are schema scaffolding with no data pipeline yet. Any trainer-facing "revenue"/"programs sold" metric sourced from them will correctly read 0 until a client-billing ingestion path is built.

**How to apply:** For trainer-earned revenue, query the `Invoice`/`ClientSubscription` tables (semantically correct source) — but expect 0 and don't fabricate. For platform-billing status, use `TrainerSubscription`. Org-scoping for client-billing goes via `ClientSubscription.trainerId ∈ (trainers in the org)`.

## Org-scoping convention

Everything trainer-facing is scoped by Clerk org: `User.clerkOrgId`. Clients = `User { role: "CLIENT", clerkOrgId }`, trainers = `role: "TRAINER"`. Pages resolve org as `sessionOrgId ?? dbUser.clerkOrgId` (session preferred — old accounts may have null `clerkOrgId` in DB). See `lib/services/client.service.ts`, `app/(platform)/exercises/page.tsx`.

## Session models: V1 vs V2

Active session model is **`WorkoutSessionV2`** (statuses: `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `MISSED`, `SKIPPED`; scoped to client via `clientId`, to trainer via `workout.program.trainerId`). `WorkoutSession` (V1) is legacy. Reusable pure helper `computeAdherenceStats(sessions)` in `lib/services/session.service.ts` returns `{ total, completed, missed, skipped, completionRate, avgRPE }`.
