# Stripe Platform Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Stripe Checkout + Customer Portal to gate trainers behind a tiered SaaS subscription (Starter $29, Pro $79, Unlimited $149) with a 14-day free trial.

**Architecture:** Trainer onboarding creates a Stripe Customer and a `TrainerSubscription` DB record with `status: TRIALING`. The platform layout server component checks subscription status on every render and redirects ungated trainers to `/billing`. Four API routes handle checkout, portal, webhooks, and status. Stripe webhooks are the single source of truth for subscription state.

**Tech Stack:** Next.js 16 App Router, Prisma + MongoDB, Clerk v7, `stripe` Node.js SDK, Vitest for unit tests, Chrome browser automation for E2E flows.

## Global Constraints

- MongoDB + Prisma — no SQL migrations, use `npx prisma db push` to sync schema changes.
- Clerk v7 — use `auth()` from `@clerk/nextjs/server` for server-side auth. No middleware.ts needed; billing gate lives in `app/(platform)/layout.tsx`.
- All Stripe calls are server-side only — never import `lib/stripe.ts` in client components.
- Webhook route must read raw body (`req.text()`) before verifying signature — never call `req.json()` first.
- `PlanTier` and `SubStatus` are defined as string union types in `lib/stripe-config.ts` to avoid circular imports with Prisma enums in client components.
- Never `git add` or `git commit` — the user commits manually.
- Test file location: `actions/__tests__/` for service unit tests (matches existing pattern).

---

## File Map

**Create:**
- `lib/stripe.ts` — Stripe singleton client
- `lib/stripe-config.ts` — tier config (labels, prices, limits, price ID env mapping)
- `lib/services/stripe-billing.service.ts` — subscription state sync logic (testable)
- `scripts/stripe-seed.ts` — idempotent Stripe product/price seeder
- `app/api/stripe/checkout/route.ts` — POST: create Checkout Session
- `app/api/stripe/portal/route.ts` — POST: create Customer Portal Session
- `app/api/stripe/webhook/route.ts` — POST: handle Stripe events
- `app/api/stripe/status/route.ts` — GET: return trainer's subscription
- `app/billing/layout.tsx` — minimal layout (no sidebar) for billing pages
- `app/billing/page.tsx` — paywall pricing page
- `app/billing/success/page.tsx` — post-checkout confirmation (polls for activation)
- `app/billing/cancel/page.tsx` — abandoned checkout return page
- `components/billing/pricing-cards.tsx` — client component: three tier cards
- `app/(platform)/settings/billing/page.tsx` — subscription management for active trainers
- `components/billing/subscription-status.tsx` — client component: plan info + manage button
- `actions/__tests__/stripe-billing.test.ts` — unit tests for billing service

**Modify:**
- `prisma/schema.prisma` — add `TrainerSubscription`, `PlanTier`, `SubStatus`
- `actions/onboarding-actions.ts` — create Stripe Customer + TrainerSubscription after trainer onboards
- `app/(platform)/layout.tsx` — add billing gate for TRAINER role

---

## Task 1: Install stripe and configure environment variables

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.local` (if not exists — add new vars)

**Interfaces:**
- Produces: `stripe` npm package available, env vars defined

- [ ] **Step 1: Install stripe**

```bash
npm install stripe
```

Expected: `stripe` appears in `package.json` dependencies.

- [ ] **Step 2: Add env vars to `.env.local`**

Open `.env.local` and add these lines (fill in real values from your Stripe Dashboard → Developers → API keys and Webhooks):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_UNLIMITED=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Note: `STRIPE_PRICE_*` values come from running the seed script in Task 4. Leave them as `price_placeholder` for now and update after seeding.

- [ ] **Step 3: Verify install**

```bash
node -e "const Stripe = require('stripe'); console.log('stripe ok:', typeof Stripe)"
```

Expected: `stripe ok: function`

---

## Task 2: Prisma schema — add TrainerSubscription model

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `prisma.trainerSubscription` Prisma client methods, `PlanTier` and `SubStatus` Prisma enums

- [ ] **Step 1: Add enums and model to schema**

Open `prisma/schema.prisma`. Add the following block **after** the existing enums (e.g. after `enum SessionStatus`):

```prisma
enum PlanTier {
  STARTER
  PRO
  UNLIMITED
}

enum SubStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
}

model TrainerSubscription {
  id                   String    @id @default(auto()) @map("_id") @db.ObjectId
  trainerId            String    @unique @db.ObjectId
  trainer              User      @relation("TrainerSubscription", fields: [trainerId], references: [id])
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
```

Also add the relation field to the `User` model — find the `User` model and add this line in the fields block (alongside other relation fields like `subscriptions`, `plansCreated`, etc.):

```prisma
  trainerSubscription  TrainerSubscription? @relation("TrainerSubscription")
```

- [ ] **Step 2: Push schema to MongoDB**

```bash
npx prisma db push
```

Expected output includes: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` message.

- [ ] **Step 4: Verify types are available**

```bash
npx tsc --noEmit 2>&1 | grep -i "TrainerSubscription" | head -5
```

Expected: no output (no type errors related to TrainerSubscription).

---

## Task 3: Stripe singleton + tier config

**Files:**
- Create: `lib/stripe.ts`
- Create: `lib/stripe-config.ts`

**Interfaces:**
- Produces:
  - `stripe` — `Stripe` instance, imported as `import { stripe } from "@/lib/stripe"`
  - `TIER_CONFIG` — `Record<PlanTier, TierConfig>`, imported as `import { TIER_CONFIG } from "@/lib/stripe-config"`
  - `tierFromPriceId(priceId: string): PlanTier | null`
  - `type PlanTier = "STARTER" | "PRO" | "UNLIMITED"`

- [ ] **Step 1: Create `lib/stripe.ts`**

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  maxNetworkRetries: 2,
});
```

- [ ] **Step 2: Create `lib/stripe-config.ts`**

```typescript
export type PlanTier = "STARTER" | "PRO" | "UNLIMITED";

export interface TierConfig {
  label: string;
  priceInCents: number;
  clientLimit: number | null;
  description: string;
  priceId: () => string;
}

export const TIER_CONFIG: Record<PlanTier, TierConfig> = {
  STARTER: {
    label: "Starter",
    priceInCents: 2900,
    clientLimit: 10,
    description: "Up to 10 clients",
    priceId: () => process.env.STRIPE_PRICE_STARTER!,
  },
  PRO: {
    label: "Pro",
    priceInCents: 7900,
    clientLimit: 50,
    description: "Up to 50 clients",
    priceId: () => process.env.STRIPE_PRICE_PRO!,
  },
  UNLIMITED: {
    label: "Unlimited",
    priceInCents: 14900,
    clientLimit: null,
    description: "Unlimited clients",
    priceId: () => process.env.STRIPE_PRICE_UNLIMITED!,
  },
};

export const VALID_TIERS: PlanTier[] = ["STARTER", "PRO", "UNLIMITED"];

export function isValidTier(t: string): t is PlanTier {
  return VALID_TIERS.includes(t as PlanTier);
}

export function tierFromPriceId(priceId: string): PlanTier | null {
  for (const [tier, config] of Object.entries(TIER_CONFIG) as [PlanTier, TierConfig][]) {
    if (config.priceId() === priceId) return tier;
  }
  return null;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "stripe\.ts|stripe-config\.ts" | head -10
```

Expected: no output.

---

## Task 4: Stripe seed script

**Files:**
- Create: `scripts/stripe-seed.ts`

**Interfaces:**
- Consumes: `STRIPE_SECRET_KEY` env var, `stripe` npm package
- Produces: Three Stripe products + prices. Prints `STRIPE_PRICE_*` values to copy into `.env.local`.

- [ ] **Step 1: Create `scripts/stripe-seed.ts`**

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  maxNetworkRetries: 2,
});

const PLANS = [
  { name: "Starter", amount: 2900, key: "STARTER" },
  { name: "Pro", amount: 7900, key: "PRO" },
  { name: "Unlimited", amount: 14900, key: "UNLIMITED" },
] as const;

async function seed() {
  console.log("Seeding Stripe products and prices...\n");

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `metadata['inmotus_seed_key']:'${plan.key}'`,
    });

    let product: Stripe.Product;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`Product already exists: ${plan.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: `INMOTUS RX — ${plan.name}`,
        metadata: { inmotus_seed_key: plan.key },
      });
      console.log(`Created product: ${plan.name} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    let price: Stripe.Price;
    if (prices.data.length > 0) {
      price = prices.data[0];
      console.log(`Price already exists: $${plan.amount / 100}/mo (${price.id})`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amount,
        currency: "usd",
        recurring: { interval: "month" },
      });
      console.log(`Created price: $${plan.amount / 100}/mo (${price.id})`);
    }

    console.log(`  → STRIPE_PRICE_${plan.key}=${price.id}\n`);
  }

  console.log("Done! Copy the STRIPE_PRICE_* values above into your .env.local");
}

seed().catch(console.error);
```

- [ ] **Step 2: Run the seed script**

```bash
npx tsx scripts/stripe-seed.ts
```

Expected output:
```
Seeding Stripe products and prices...

Created product: INMOTUS RX — Starter (prod_...)
Created price: $29.00/mo (price_...)
  → STRIPE_PRICE_STARTER=price_...

Created product: INMOTUS RX — Pro (prod_...)
Created price: $79.00/mo (price_...)
  → STRIPE_PRICE_PRO=price_...

Created product: INMOTUS RX — Unlimited (prod_...)
Created price: $149.00/mo (price_...)
  → STRIPE_PRICE_UNLIMITED=price_...

Done! Copy the STRIPE_PRICE_* values above into your .env.local
```

- [ ] **Step 3: Update `.env.local` with the printed price IDs**

Replace the `price_placeholder` values from Task 1 Step 2 with the real `price_...` IDs printed above.

---

## Task 5: Billing service + unit tests

**Files:**
- Create: `lib/services/stripe-billing.service.ts`
- Create: `actions/__tests__/stripe-billing.test.ts`

**Interfaces:**
- Consumes: `stripe` from `lib/stripe`, `prisma` from `lib/prisma`, `tierFromPriceId` from `lib/stripe-config`
- Produces:
  - `syncSubscriptionFromStripe(stripeCustomerId: string, subscription: Stripe.Subscription): Promise<void>`
  - `activateSubscriptionFromCheckout(session: Stripe.Checkout.Session): Promise<void>`

- [ ] **Step 1: Write the failing tests first**

Create `actions/__tests__/stripe-billing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainerSubscription: {
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn() },
  },
}))

vi.mock('@/lib/stripe-config', () => ({
  tierFromPriceId: vi.fn((id: string) => {
    if (id === 'price_starter') return 'STARTER'
    if (id === 'price_pro') return 'PRO'
    if (id === 'price_unlimited') return 'UNLIMITED'
    return null
  }),
}))

import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import {
  syncSubscriptionFromStripe,
  activateSubscriptionFromCheckout,
} from '@/lib/services/stripe-billing.service'
import type Stripe from 'stripe'

const mockUpdate = vi.mocked(prisma.trainerSubscription.update)
const mockRetrieve = vi.mocked(stripe.subscriptions.retrieve)

beforeEach(() => vi.clearAllMocks())

describe('syncSubscriptionFromStripe', () => {
  it('maps active status and syncs period end and plan', async () => {
    const sub = {
      id: 'sub_123',
      status: 'active',
      current_period_end: 1800000000,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro' } }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_123', sub)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_123' },
      data: {
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro',
        plan: 'PRO',
        status: 'ACTIVE',
        currentPeriodEnd: new Date(1800000000 * 1000),
        cancelAtPeriodEnd: false,
      },
    })
  })

  it('maps past_due to PAST_DUE', async () => {
    const sub = {
      id: 'sub_456',
      status: 'past_due',
      current_period_end: 1800000000,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_starter' } }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_456', sub)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAST_DUE' }),
      })
    )
  })

  it('maps canceled to CANCELED', async () => {
    const sub = {
      id: 'sub_789',
      status: 'canceled',
      current_period_end: 1800000000,
      cancel_at_period_end: false,
      items: { data: [] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_789', sub)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELED' }),
      })
    )
  })

  it('falls back to STARTER plan when priceId is unknown', async () => {
    const sub = {
      id: 'sub_000',
      status: 'active',
      current_period_end: 1800000000,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_unknown' } }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_000', sub)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'STARTER' }),
      })
    )
  })
})

describe('activateSubscriptionFromCheckout', () => {
  it('retrieves full subscription and sets ACTIVE status', async () => {
    const mockSub = {
      id: 'sub_new',
      status: 'active',
      current_period_end: 1900000000,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro' } }] },
    } as unknown as Stripe.Subscription

    mockRetrieve.mockResolvedValue(mockSub as Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>)

    const session = {
      customer: 'cus_new',
      subscription: 'sub_new',
    } as unknown as Stripe.Checkout.Session

    await activateSubscriptionFromCheckout(session)

    expect(mockRetrieve).toHaveBeenCalledWith('sub_new')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_new' },
      data: expect.objectContaining({
        stripeSubscriptionId: 'sub_new',
        plan: 'PRO',
        status: 'ACTIVE',
      }),
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run actions/__tests__/stripe-billing.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/services/stripe-billing.service'`

- [ ] **Step 3: Implement `lib/services/stripe-billing.service.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { tierFromPriceId } from "@/lib/stripe-config";
import type Stripe from "stripe";

function stripeStatusToSubStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active": return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled": return "CANCELED";
    case "unpaid": return "UNPAID";
    default: return "ACTIVE";
  }
}

export async function syncSubscriptionFromStripe(
  stripeCustomerId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? tierFromPriceId(priceId) : null;

  await prisma.trainerSubscription.update({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: plan ?? "STARTER",
      status: stripeStatusToSubStatus(subscription.status),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export async function activateSubscriptionFromCheckout(
  session: Stripe.Checkout.Session
): Promise<void> {
  const stripeCustomerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? tierFromPriceId(priceId) : null;

  await prisma.trainerSubscription.update({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      plan: plan ?? "STARTER",
      status: "ACTIVE",
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run actions/__tests__/stripe-billing.test.ts
```

Expected: All 5 tests PASS.

---

## Task 6: Stripe API routes

**Files:**
- Create: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/portal/route.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `app/api/stripe/status/route.ts`

**Interfaces:**
- Consumes: `stripe` from `lib/stripe`, `prisma`, `TIER_CONFIG`, `isValidTier`, `syncSubscriptionFromStripe`, `activateSubscriptionFromCheckout`
- Produces: Four HTTP endpoints as described in the spec

- [ ] **Step 1: Create `app/api/stripe/checkout/route.ts`**

```typescript
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { TIER_CONFIG, isValidTier } from "@/lib/stripe-config";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json() as { tier?: string };
  if (!body.tier || !isValidTier(body.tier)) {
    return new NextResponse("Invalid tier", { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "TRAINER") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });
  if (!sub) {
    return new NextResponse("Subscription record not found", { status: 404 });
  }

  const session = await stripe.checkout.sessions.create({
    customer: sub.stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [{ price: TIER_CONFIG[body.tier].priceId(), quantity: 1 }],
    mode: "subscription",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Create `app/api/stripe/portal/route.ts`**

```typescript
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "TRAINER") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });
  if (!sub) {
    return new NextResponse("No subscription found", { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 3: Create `app/api/stripe/webhook/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  syncSubscriptionFromStripe,
  activateSubscriptionFromCheckout,
} from "@/lib/services/stripe-billing.service";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new NextResponse(`Webhook signature verification failed: ${err}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await activateSubscriptionFromCheckout(session);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(sub.customer as string, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.trainerSubscription.update({
          where: { stripeCustomerId: sub.customer as string },
          data: { status: "CANCELED" },
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await prisma.trainerSubscription.update({
          where: { stripeCustomerId: invoice.customer as string },
          data: { status: "PAST_DUE" },
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    return new NextResponse("Internal error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: Create `app/api/stripe/status/route.ts`**

```typescript
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return new NextResponse("User not found", { status: 404 });

  const subscription = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  return NextResponse.json({ subscription });
}
```

- [ ] **Step 5: Type-check all four routes**

```bash
npx tsc --noEmit 2>&1 | grep -E "app/api/stripe" | head -20
```

Expected: no output.

---

## Task 7: Trainer onboarding — create Stripe Customer + TrainerSubscription

**Files:**
- Modify: `actions/onboarding-actions.ts`

**Interfaces:**
- Consumes: `stripe` from `lib/stripe`, new `TrainerSubscription` Prisma model
- Produces: Every new trainer has a `stripeCustomerId` and `TrainerSubscription` record with `status: TRIALING` and `trialEndsAt: now + 14 days`

- [ ] **Step 1: Add stripe import to onboarding-actions.ts**

At the top of `actions/onboarding-actions.ts`, add after the existing imports:

```typescript
import { stripe } from "@/lib/stripe";
```

- [ ] **Step 2: Modify `completeTrainerOnboarding` to create Stripe Customer + TrainerSubscription**

The current function ends at line 53 with `redirect("/dashboard")`. Replace the entire `try` block (lines 19–51) with the following extended version:

```typescript
  try {
    const client = await clerkClient();
    const org = await client.organizations.createOrganization({
      name: data.organizationName,
      createdBy: userId,
    });

    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        role: "TRAINER",
        phone: data.phone ?? null,
        clerkOrgId: org.id,
        onboarded: true,
      },
      create: {
        clerkId: userId,
        email: clerkUser.emailAddresses[0].emailAddress,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "TRAINER",
        phone: data.phone ?? null,
        imageUrl: clerkUser.imageUrl,
        clerkOrgId: org.id,
        onboarded: true,
      },
    });

    // Idempotent: skip if subscription record already exists
    const existingSub = await prisma.trainerSubscription.findUnique({
      where: { trainerId: user.id },
    });

    if (!existingSub) {
      const customer = await stripe.customers.create({
        email: clerkUser.emailAddresses[0].emailAddress,
        name: `${data.firstName} ${data.lastName}`,
        metadata: { trainerId: user.id },
      });

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      await prisma.trainerSubscription.create({
        data: {
          trainerId: user.id,
          stripeCustomerId: customer.id,
          status: "TRIALING",
          trialEndsAt,
        },
      });
    }
  } catch (err) {
    console.error("Failed to complete trainer onboarding:", err);
    return { success: false as const, error: "Failed to set up organization. Please try again." };
  }
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "onboarding-actions" | head -10
```

Expected: no output.

---

## Task 8: Platform layout billing gate

**Files:**
- Modify: `app/(platform)/layout.tsx`

**Interfaces:**
- Consumes: `prisma.trainerSubscription.findUnique`
- Produces: Trainers without an active/trialing subscription are redirected to `/billing`

- [ ] **Step 1: Add billing gate to `app/(platform)/layout.tsx`**

In `app/(platform)/layout.tsx`, find the block after the `!user.onboarded` check (around line 17) and add the billing gate immediately after it, before the `Promise.all` block:

```typescript
  // Billing gate: redirect trainers who have no active subscription
  if (user.role === "TRAINER") {
    const sub = await prisma.trainerSubscription.findUnique({
      where: { trainerId: user.id },
    });

    const now = new Date();
    const isTrialExpired =
      !sub ||
      sub.status === "CANCELED" ||
      (sub.status === "TRIALING" && sub.trialEndsAt < now);
    const isPaymentFailed =
      sub?.status === "PAST_DUE" || sub?.status === "UNPAID";

    if (isTrialExpired) redirect("/billing?reason=trial_expired");
    if (isPaymentFailed) redirect("/billing?reason=payment_failed");
  }
```

Note: `redirect` from `next/navigation` is already imported in this file. No new import needed.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "(platform)/layout" | head -10
```

Expected: no output.

---

## Task 9: Billing UI pages

**Files:**
- Create: `app/billing/layout.tsx`
- Create: `app/billing/page.tsx`
- Create: `app/billing/success/page.tsx`
- Create: `app/billing/cancel/page.tsx`
- Create: `components/billing/pricing-cards.tsx`

**Interfaces:**
- Consumes: `TIER_CONFIG` from `lib/stripe-config`, `/api/stripe/checkout` POST endpoint, `/api/stripe/status` GET endpoint
- Produces: `/billing`, `/billing/success`, `/billing/cancel` pages

- [ ] **Step 1: Create `app/billing/layout.tsx`**

```typescript
export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Create `components/billing/pricing-cards.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";
import { Check } from "lucide-react";

export function PricingCards() {
  const [loading, setLoading] = useState<PlanTier | null>(null);

  async function handleSelectPlan(tier: PlanTier) {
    setLoading(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error("Failed to create checkout session");
      const data = await res.json() as { url: string };
      window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  }

  const tiers: PlanTier[] = ["STARTER", "PRO", "UNLIMITED"];

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {tiers.map((tier) => {
        const config = TIER_CONFIG[tier];
        const isPopular = tier === "PRO";
        return (
          <Card
            key={tier}
            className={isPopular ? "border-blue-500 shadow-lg relative" : "relative"}
          >
            {isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                  Most Popular
                </span>
              </div>
            )}
            <CardHeader className="pt-8">
              <CardTitle className="text-xl">{config.label}</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold">
                  ${config.priceInCents / 100}
                </span>
                <span className="text-slate-500">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                  {config.description}
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                  AI workout generation
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                  Client progress tracking
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                  Assessments &amp; check-ins
                </li>
              </ul>
              <Button
                className="w-full"
                onClick={() => handleSelectPlan(tier)}
                disabled={loading !== null}
                variant={isPopular ? "default" : "outline"}
              >
                {loading === tier ? "Redirecting…" : "Start Plan"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/billing/page.tsx`**

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/billing/pricing-cards";
import { differenceInDays } from "date-fns";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "TRAINER") redirect("/dashboard");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const { reason } = await searchParams;

  const trialDaysRemaining =
    sub?.status === "TRIALING" && sub.trialEndsAt > new Date()
      ? differenceInDays(sub.trialEndsAt, new Date())
      : null;

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.005_247)] py-16 px-4">
      <div className="mx-auto max-w-5xl">
        {reason === "payment_failed" && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Your last payment failed — please update your billing details.
          </div>
        )}
        {reason === "trial_expired" && (
          <div className="mb-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Your free trial has ended. Choose a plan to continue.
          </div>
        )}
        {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
          <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            You have {trialDaysRemaining} day
            {trialDaysRemaining !== 1 ? "s" : ""} left in your free trial.
          </div>
        )}

        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-slate-900">
            Choose your plan
          </h1>
          <p className="mt-3 text-lg text-slate-500">
            All plans include a 14-day free trial
          </p>
        </div>

        <PricingCards />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/billing/success/page.tsx`**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function BillingSuccessPage() {
  const router = useRouter();
  const attempts = useRef(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      attempts.current += 1;
      try {
        const res = await fetch("/api/stripe/status");
        const data = await res.json() as { subscription?: { status: string } };
        if (
          data.subscription?.status === "ACTIVE" ||
          attempts.current >= 10
        ) {
          clearInterval(poll);
          router.push("/dashboard");
        }
      } catch {
        if (attempts.current >= 10) {
          clearInterval(poll);
          router.push("/dashboard");
        }
      }
    }, 1000);

    return () => clearInterval(poll);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.97_0.005_247)]">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">You&apos;re all set!</h1>
        <p className="text-slate-500">
          Your subscription is now active. Redirecting to dashboard…
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/billing/cancel/page.tsx`**

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.97_0.005_247)]">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">No problem</h1>
        <p className="text-slate-500">
          You can choose a plan whenever you&apos;re ready.
        </p>
        <Button asChild>
          <Link href="/billing">View Plans</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check billing pages**

```bash
npx tsc --noEmit 2>&1 | grep -E "app/billing|components/billing" | head -20
```

Expected: no output.

---

## Task 10: Settings billing tab

**Files:**
- Create: `components/billing/subscription-status.tsx`
- Create: `app/(platform)/settings/billing/page.tsx`

**Interfaces:**
- Consumes: `TrainerSubscription` Prisma type, `/api/stripe/portal` POST, `TIER_CONFIG`
- Produces: `/settings/billing` page showing plan info and manage button

- [ ] **Step 1: Create `components/billing/subscription-status.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";
import { format } from "date-fns";

interface SubscriptionStatusProps {
  plan: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export function SubscriptionStatus({
  plan,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: SubscriptionStatusProps) {
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json() as { url: string };
    window.location.href = data.url;
  }

  const tierLabel =
    TIER_CONFIG[plan as PlanTier]?.label ?? plan;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Current Plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{tierLabel}</span>
          <Badge variant="secondary">Active</Badge>
        </div>
        {currentPeriodEnd && (
          <p className="text-sm text-muted-foreground">
            Next billing date:{" "}
            {format(new Date(currentPeriodEnd), "MMMM d, yyyy")}
          </p>
        )}
        {cancelAtPeriodEnd && (
          <p className="text-sm text-yellow-600">
            Your subscription will cancel at the end of the current billing
            period.
          </p>
        )}
        <Button onClick={handleManage} disabled={loading} variant="outline">
          {loading ? "Redirecting…" : "Manage Subscription"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `app/(platform)/settings/billing/page.tsx`**

```typescript
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SubscriptionStatus } from "@/components/billing/subscription-status";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function BillingSettingsPage() {
  const user = await requireRole("TRAINER");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  if (!sub || sub.status !== "ACTIVE") redirect("/billing");

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">Billing</h2>
        <p className="text-muted-foreground">Manage your subscription</p>
      </div>
      <SubscriptionStatus
        plan={sub.plan}
        currentPeriodEnd={sub.currentPeriodEnd}
        cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "settings/billing|subscription-status" | head -10
```

Expected: no output.

---

## Task 11: E2E testing with Chrome browser automation

**Pre-requisites before running any flow:**

1. Dev server running: `npm run dev`
2. Stripe CLI installed and webhook forwarding active:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the `whsec_...` value printed and update `STRIPE_WEBHOOK_SECRET` in `.env.local`. Restart dev server.
3. A trainer account exists in the app (completed onboarding).

---

### Flow 1 — Trial Gate

**Goal:** Confirm that a trainer with an expired trial is redirected to `/billing`.

- [ ] **Step 1: Expire the trial in the DB**

Open a temporary script (run and discard — do not commit):

```bash
npx tsx -e "
const { prisma } = require('./lib/prisma');
async function run() {
  const result = await prisma.trainerSubscription.updateMany({
    where: { status: 'TRIALING' },
    data: { trialEndsAt: new Date('2020-01-01') }
  });
  console.log('Updated:', result);
  await prisma.\$disconnect();
}
run();
"
```

- [ ] **Step 2: Open Chrome and navigate to dashboard**

Use Chrome automation to navigate to `http://localhost:3000/dashboard`.

- [ ] **Step 3: Verify redirect to `/billing?reason=trial_expired`**

Confirm the URL is `http://localhost:3000/billing?reason=trial_expired` and the page shows:
- "Your free trial has ended. Choose a plan to continue." banner
- Three pricing cards (Starter $29, Pro $79, Unlimited $149)

---

### Flow 2 — Checkout & Access Restored

**Goal:** Complete Stripe Checkout with a test card and confirm the trainer regains dashboard access.

- [ ] **Step 1: Click "Start Plan" on Pro**

From `/billing`, click the "Start Plan" button on the Pro ($79/mo) card.

- [ ] **Step 2: Verify redirect to Stripe Checkout**

Confirm the URL contains `checkout.stripe.com`.

- [ ] **Step 3: Fill the test card**

In the Stripe Checkout form:
- Card number: `4242 4242 4242 4242`
- Expiry: `12/28`
- CVC: `123`
- Name: anything
- Submit payment.

- [ ] **Step 4: Verify success page**

Confirm redirect to `http://localhost:3000/billing/success` showing "You're all set!" message.

- [ ] **Step 5: Verify redirect to dashboard**

Confirm auto-redirect to `/dashboard` within ~5 seconds (success page polls `/api/stripe/status` until `ACTIVE`).

- [ ] **Step 6: Verify billing gate is gone**

Navigate to `http://localhost:3000/dashboard` directly. Confirm no redirect to `/billing`.

---

### Flow 3 — Customer Portal

**Goal:** Access the Stripe Customer Portal from Settings and verify cancel-at-period-end is reflected back in the app.

- [ ] **Step 1: Navigate to Settings → Billing**

Navigate to `http://localhost:3000/settings/billing`. Confirm the page shows current plan (Pro), next billing date, and "Manage Subscription" button.

- [ ] **Step 2: Open Customer Portal**

Click "Manage Subscription". Confirm redirect to Stripe Customer Portal (`billing.stripe.com`).

- [ ] **Step 3: Cancel subscription**

In the portal, click "Cancel plan" → confirm cancellation (subscription cancels at period end).

- [ ] **Step 4: Return to app and verify state**

Click "Return to INMOTUS RX" in the portal (returns to `/settings/billing`). Confirm the page now shows the yellow "Your subscription will cancel at the end of the current billing period." warning.
