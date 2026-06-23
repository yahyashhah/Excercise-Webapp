# Stripe Platform Subscription Integration

**Date:** 2026-06-20  
**Status:** Approved  
**Scope:** Platform billing — trainers pay a monthly SaaS fee to use the app. Clients access the platform for free as part of their trainer's subscription.

---

## 1. Business Rules

- All trainers get a **14-day free trial** starting at account creation. No Stripe interaction during trial.
- After trial expiry, trainers are hard-gated behind `/billing` until they subscribe.
- Clients are **never gated** — they always pass through middleware.
- If a trainer's payment fails, they are redirected to `/billing?reason=payment_failed`.
- If a trainer cancels, access continues until `currentPeriodEnd`, then they are gated.

### Pricing Tiers

| Tier | Price | Client Limit |
|---|---|---|
| Starter | $29/mo | Up to 10 clients |
| Pro | $79/mo | Up to 50 clients |
| Unlimited | $149/mo | Unlimited clients |

---

## 2. Data Model

New Prisma model added to schema (MongoDB):

```prisma
model TrainerSubscription {
  id                   String    @id @default(auto()) @map("_id") @db.ObjectId
  trainerId            String    @unique @db.ObjectId
  trainer              User      @relation(fields: [trainerId], references: [id])
  stripeCustomerId     String    @unique
  stripeSubscriptionId String?
  stripePriceId        String?
  plan                 PlanTier  @default(STARTER)
  status               SubStatus @default(TRIALING)
  trialEndsAt          DateTime
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}

enum PlanTier  { STARTER PRO UNLIMITED }
enum SubStatus { TRIALING ACTIVE PAST_DUE CANCELED UNPAID }
```

`TrainerSubscription` is created when a trainer completes onboarding, with `status: TRIALING` and `trialEndsAt: now + 14 days`. A Stripe Customer is created at this point (no payment method required) so the `stripeCustomerId` is always present before checkout.

The existing `CoachPackage` / `ClientSubscription` / `Invoice` models in the schema are for trainer-to-client billing (a separate future feature) and are untouched by this work.

---

## 3. Architecture

### Middleware (`middleware.ts`)

Runs on every `/(platform)/**` route. Logic:

1. If user role is `CLIENT` → pass through unconditionally.
2. Fetch `TrainerSubscription` for the trainer.
3. If `status === TRIALING` and `trialEndsAt > now` → pass through.
4. If `status === ACTIVE` → pass through.
5. If `status === PAST_DUE` or `UNPAID` → redirect to `/billing?reason=payment_failed`.
6. Otherwise (no record, trial expired, CANCELED) → redirect to `/billing?reason=trial_expired`.
7. `/billing/**` routes always pass through to avoid redirect loops.

Middleware reads subscription status from DB on every request (Prisma + MongoDB is fast enough; no Redis cache needed at this scale).

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `POST /api/stripe/checkout` | POST | Create Stripe Checkout Session for a given `tier`. Returns `{url}` for redirect. |
| `POST /api/stripe/portal` | POST | Create Stripe Customer Portal Session. Returns `{url}` for redirect. |
| `POST /api/stripe/webhook` | POST | Receive and verify Stripe webhook events. Syncs subscription state to DB. |
| `GET /api/stripe/status` | GET | Return trainer's current `TrainerSubscription` (used by `/billing` page). |

### Webhook Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Upsert `TrainerSubscription`: set `stripeSubscriptionId`, `stripePriceId`, `status: ACTIVE`, `currentPeriodEnd` |
| `customer.subscription.updated` | Sync `status`, `plan`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `stripePriceId` |
| `customer.subscription.deleted` | Set `status: CANCELED` |
| `invoice.payment_failed` | Set `status: PAST_DUE` |

All webhook calls verified with `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Raw body must be preserved (do not parse with `json()` before verification).

### Stripe Product Setup

A one-time seed script (`scripts/stripe-seed.ts`) creates the three products and prices in Stripe and prints the price IDs to be set as env vars. Does not re-create if already present (idempotent via metadata tag).

---

## 4. UI

### `/billing` (paywall page)
- Three pricing cards: Starter / Pro / Unlimited.
- Each card shows price, client limit, and a "Start Plan" CTA.
- If trainer is still trialing: show remaining trial days as a banner above the cards.
- If `reason=payment_failed`: show a red warning banner ("Your last payment failed — please update your billing details").
- If `reason=trial_expired`: show a neutral info banner ("Your free trial has ended").
- CTA click → POST `/api/stripe/checkout` with `{ tier }` → redirect to Stripe Checkout URL.

### `/billing/success`
- Shown after Stripe redirects back post-checkout.
- "You're all set!" confirmation message.
- Auto-redirects to `/dashboard` after 3 seconds.

### `/billing/cancel`
- Shown if trainer abandons Stripe Checkout.
- "No problem" message with a button back to `/billing`.

### Settings — Billing Tab (`/settings/billing`)
- Only shown to trainers with `status: ACTIVE`.
- Shows: current plan name, next billing date, `cancelAtPeriodEnd` warning if applicable.
- "Manage Subscription" button → POST `/api/stripe/portal` → redirect to Stripe Customer Portal.

---

## 5. Environment Variables

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_UNLIMITED=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 6. E2E Testing (Chrome Browser Automation)

Testing uses the app running in dev mode against Stripe test mode. `stripe listen --forward-to localhost:3000/api/stripe/webhook` must be running to forward webhooks locally.

### Flow 1 — Trial Gate
1. Sign in as a trainer whose `trialEndsAt` has been set to the past via a test DB script.
2. Navigate to `/dashboard`.
3. Verify redirect to `/billing?reason=trial_expired`.
4. Verify pricing cards render correctly.

### Flow 2 — Checkout & Access Restored
1. From `/billing`, click "Start Plan" on Pro tier.
2. Verify redirect to Stripe Checkout (URL contains `checkout.stripe.com`).
3. Fill test card `4242 4242 4242 4242`, expiry `12/28`, CVC `123`.
4. Submit payment.
5. Verify redirect to `/billing/success`.
6. Verify auto-redirect to `/dashboard` after 3 seconds.
7. Verify trainer can now access `/dashboard` without being redirected.

### Flow 3 — Customer Portal
1. Sign in as an active subscriber.
2. Navigate to `/settings/billing`.
3. Click "Manage Subscription".
4. Verify redirect to Stripe Customer Portal.
5. Cancel subscription in portal.
6. Return to app.
7. Verify `cancelAtPeriodEnd: true` is reflected in Settings UI.

---

## 7. Out of Scope

- Trainer-to-client billing (the existing `CoachPackage` / `ClientSubscription` models) — separate future feature.
- Annual pricing / discounts.
- Proration on mid-cycle plan upgrades (Stripe handles this automatically; no custom logic needed).
- Email notifications for payment failures (can be handled via Stripe's built-in dunning emails in the Dashboard).
