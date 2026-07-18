# Self-Serve Program Sales Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a stranger buy a program from a per-trainer public link, pay via Stripe, and be auto-provisioned an account with the program(s) assigned — no manual trainer action.

**Architecture:** A public sales page (`/p/[slug]`) resolves a `CoachPackage` (trainer + program template + price). "Buy" hits a public checkout endpoint that builds a Stripe Checkout Session (mode `payment`) on the **platform** Stripe account via a single isolated seam (`createProgramCheckoutSession`). On `checkout.session.completed`, an idempotent fulfillment service creates/links the Clerk user + DB `User` (role CLIENT, in the trainer's org, `onboarded: true`), clones each purchased template and assigns the copy, records a `ProgramPurchase`, and sends a welcome email. A success page auto-signs the buyer in via a Clerk sign-in token and lets them set a password.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + MongoDB, Clerk (`@clerk/nextjs` ^7), Stripe (`stripe` ^22), Resend (^6), Vitest (^4).

## Global Constraints

- **Package manager / test runner:** `npm test` → `vitest run`. Run a single file/test with `npx vitest run <path> -t "<name>"`.
- **DB is MongoDB via Prisma** — schema changes are applied with `npm run db:push` (NOT SQL migrations). `prisma generate` runs on `postinstall` and is also triggered by `db:push`.
- **No git commits by the agent.** Per project rule, the **user reviews and commits** all changes. Every task ends at a green checkpoint; do NOT run `git commit`.
- **Money routing = Model A** (platform Stripe account collects). Keep all Stripe-session construction inside `createProgramCheckoutSession` so Stripe Connect can be added later without touching the rest of the funnel.
- **Prisma field-name mapping:** the DB uses legacy names via `@map` (`clinicianId` for `trainerId`, `patientId` for `clientId`, `CLINIC`/`CLINICIAN`/`PATIENT` enum values). Use the **Prisma (TypeScript) names** (`trainerId`, `clientId`, `TRAINER`, `CLIENT`) in code.
- **Env vars (all already exist):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (fallback `noreply@inmotusrx.com`), `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. No new env vars are required for v1.
- **Never assign a template directly.** Always `duplicateProgram(templateId, trainerId, false)` then `assignProgram(copy.id, clientId, startDate)`.

---

## File Structure

**Create:**
- `lib/utils/slug.ts` — slug generation/uniqueness helper
- `lib/services/sellable-package.service.ts` — create/read `CoachPackage` sellable offerings
- `lib/services/__tests__/sellable-package.service.test.ts`
- `lib/email/templates/program-welcome.tsx` — welcome email (new-buyer + existing-account variants)
- `lib/email/send-program-welcome.ts` — thin send helper
- `lib/services/program-purchase.service.ts` — the fulfillment core (idempotent)
- `lib/services/__tests__/program-purchase.service.test.ts`
- `lib/payments/program-checkout.ts` — `createProgramCheckoutSession` (Model A / Connect seam)
- `app/api/checkout/program/route.ts` — public checkout endpoint
- `app/p/[slug]/page.tsx` — public sales page
- `app/p/[slug]/buy-button.tsx` — client component (upsell checkbox + buy)
- `app/p/[slug]/success/page.tsx` — success (server: issue sign-in token)
- `app/p/[slug]/success/claim-account.tsx` — client component (ticket sign-in + set password)

**Modify:**
- `prisma/schema.prisma` — extend `CoachPackage`; add `ProgramPurchase`
- `app/api/stripe/webhook/route.ts` — branch on `metadata.purchaseType === "program"`; handle `charge.refunded`
- `proxy.ts` — add public routes `/p(*)` and `/api/checkout/program`

---

## Task 1: Schema — extend CoachPackage + add ProgramPurchase

**Files:**
- Modify: `prisma/schema.prisma:736-750` (CoachPackage) and append `ProgramPurchase`

**Interfaces:**
- Produces: `CoachPackage` gains `programTemplateId?`, `slug?` (unique), `kind` (default `"program"`), `upsellPackageId?`. New model `ProgramPurchase` with unique `stripeCheckoutSessionId`.

- [ ] **Step 1: Extend `CoachPackage`**

In `prisma/schema.prisma`, add these fields to the `CoachPackage` model (keep existing fields):

```prisma
model CoachPackage {
  id             String               @id @default(auto()) @map("_id") @db.ObjectId
  trainerId      String               @map("clinicianId") @db.ObjectId
  trainer        User                 @relation("Packages", fields: [trainerId], references: [id])
  name           String
  description    String?
  priceInCents   Int
  currency       String               @default("usd")
  intervalMonths Int                  @default(1)
  isActive       Boolean              @default(true)
  stripePriceId  String?
  // --- self-serve program sales ---
  programTemplateId String? @db.ObjectId
  slug              String? @unique
  kind              String  @default("program") // "program" | "bundle"
  upsellPackageId   String? @db.ObjectId
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  subscriptions  ClientSubscription[]

  @@index([slug])
}
```

- [ ] **Step 2: Add the `ProgramPurchase` model**

Append to `prisma/schema.prisma`:

```prisma
model ProgramPurchase {
  id                      String   @id @default(auto()) @map("_id") @db.ObjectId
  stripeCheckoutSessionId String   @unique
  buyerEmail              String
  buyerUserId             String?  @db.ObjectId
  buyerClerkId            String?
  trainerId               String   @db.ObjectId
  orgId                   String
  packageIds              String[] @db.ObjectId
  assignedProgramIds      String[] @db.ObjectId
  amountInCents           Int      @default(0)
  currency                String   @default("usd")
  status                  String   @default("PENDING") // PENDING | COMPLETED | REFUNDED
  accountClaimedAt        DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@index([trainerId, createdAt])
  @@index([buyerEmail])
}
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Push the schema + regenerate the client**

Run: `npm run db:push`
Expected: completes with "Your database is now in sync with your Prisma schema" and "Generated Prisma Client".

- [ ] **Step 5: Confirm generated types**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no errors referencing `ProgramPurchase` or `CoachPackage` (unrelated pre-existing errors, if any, are out of scope — note them but do not fix).

- [ ] **Step 6: Checkpoint (user commits).** Schema compiles and is pushed. Pause for user review.

---

## Task 2: Slug helper + sellable-package service

**Files:**
- Create: `lib/utils/slug.ts`
- Create: `lib/services/sellable-package.service.ts`
- Test: `lib/services/__tests__/sellable-package.service.test.ts`

**Interfaces:**
- Produces:
  - `slugify(input: string): string`
  - `createSellablePackage(args: { trainerId: string; name: string; description?: string; priceInCents: number; programTemplateId: string; kind?: "program" | "bundle"; upsellPackageId?: string }): Promise<CoachPackage>` — generates a unique slug and creates the row.
  - `getSellablePackageBySlug(slug: string): Promise<(CoachPackage & { upsell: CoachPackage | null }) | null>` — active package + resolved upsell.

- [ ] **Step 1: Write the failing slug test**

Create `lib/services/__tests__/sellable-package.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { slugify } from '@/lib/utils/slug'

describe('slugify', () => {
  it('lowercases, trims, and hyphenates', () => {
    expect(slugify('  Golf Back Pain! Program ')).toBe('golf-back-pain-program')
  })
  it('collapses repeated separators', () => {
    expect(slugify('Jane   & Co --- Golf')).toBe('jane-co-golf')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run lib/services/__tests__/sellable-package.service.test.ts -t "slugify"`
Expected: FAIL — cannot find module `@/lib/utils/slug`.

- [ ] **Step 3: Implement `slugify`**

Create `lib/utils/slug.ts`:

```typescript
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run lib/services/__tests__/sellable-package.service.test.ts -t "slugify"`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing service tests**

Append to the same test file (add mocks at top of file — put the `vi.mock` calls above the imports):

```typescript
import { vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachPackage: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { createSellablePackage, getSellablePackageBySlug } from '../sellable-package.service'

const mockFindFirst = vi.mocked(prisma.coachPackage.findFirst)
const mockFindUnique = vi.mocked(prisma.coachPackage.findUnique)
const mockCreate = vi.mocked(prisma.coachPackage.create)

beforeEach(() => vi.clearAllMocks())

describe('createSellablePackage', () => {
  it('creates a package with a unique slug derived from the name', async () => {
    mockFindUnique.mockResolvedValue(null) // slug is free
    mockCreate.mockImplementation(async (args: any) => ({ id: 'pkg1', ...args.data }))

    const pkg = await createSellablePackage({
      trainerId: 'trainer1',
      name: 'Golf Back Pain',
      priceInCents: 7999,
      programTemplateId: 'tmpl1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trainerId: 'trainer1',
          name: 'Golf Back Pain',
          priceInCents: 7999,
          programTemplateId: 'tmpl1',
          slug: 'golf-back-pain',
          kind: 'program',
        }),
      })
    )
    expect(pkg.id).toBe('pkg1')
  })

  it('appends a numeric suffix when the base slug is taken', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'existing' } as any) // 'golf-back-pain' taken
      .mockResolvedValueOnce(null)                       // 'golf-back-pain-2' free
    mockCreate.mockImplementation(async (args: any) => ({ id: 'pkg2', ...args.data }))

    await createSellablePackage({
      trainerId: 'trainer1',
      name: 'Golf Back Pain',
      priceInCents: 7999,
      programTemplateId: 'tmpl1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'golf-back-pain-2' }) })
    )
  })
})

describe('getSellablePackageBySlug', () => {
  it('returns null for an inactive or missing package', async () => {
    mockFindFirst.mockResolvedValue(null)
    expect(await getSellablePackageBySlug('nope')).toBeNull()
  })

  it('resolves the upsell package when present', async () => {
    mockFindFirst.mockResolvedValue({ id: 'pkg1', slug: 'golf', upsellPackageId: 'pkg2', isActive: true } as any)
    mockFindUnique.mockResolvedValue({ id: 'pkg2', slug: 'bundle', isActive: true } as any)

    const result = await getSellablePackageBySlug('golf')
    expect(result?.id).toBe('pkg1')
    expect(result?.upsell?.id).toBe('pkg2')
  })
})
```

- [ ] **Step 6: Run the service tests, verify they fail**

Run: `npx vitest run lib/services/__tests__/sellable-package.service.test.ts`
Expected: FAIL — cannot find module `../sellable-package.service`.

- [ ] **Step 7: Implement the service**

Create `lib/services/sellable-package.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils/slug";
import type { CoachPackage } from "@prisma/client";

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "package";
  let candidate = root;
  let n = 1;
  // findUnique on the unique `slug` field
  while (await prisma.coachPackage.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export async function createSellablePackage(args: {
  trainerId: string;
  name: string;
  description?: string;
  priceInCents: number;
  programTemplateId: string;
  kind?: "program" | "bundle";
  upsellPackageId?: string;
}): Promise<CoachPackage> {
  const slug = await uniqueSlug(args.name);
  return prisma.coachPackage.create({
    data: {
      trainerId: args.trainerId,
      name: args.name,
      description: args.description,
      priceInCents: args.priceInCents,
      programTemplateId: args.programTemplateId,
      kind: args.kind ?? "program",
      upsellPackageId: args.upsellPackageId,
      slug,
    },
  });
}

export async function getSellablePackageBySlug(
  slug: string
): Promise<(CoachPackage & { upsell: CoachPackage | null }) | null> {
  const pkg = await prisma.coachPackage.findFirst({
    where: { slug, isActive: true },
  });
  if (!pkg) return null;
  const upsell = pkg.upsellPackageId
    ? await prisma.coachPackage.findUnique({ where: { id: pkg.upsellPackageId } })
    : null;
  return { ...pkg, upsell };
}
```

- [ ] **Step 8: Run all tests in the file, verify they pass**

Run: `npx vitest run lib/services/__tests__/sellable-package.service.test.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Checkpoint (user commits).**

---

## Task 3: Welcome email

**Files:**
- Create: `lib/email/templates/program-welcome.tsx`
- Create: `lib/email/send-program-welcome.ts`
- Test: none (thin wrapper; verified via the purchase-service test which mocks it)

**Interfaces:**
- Produces: `sendProgramWelcomeEmail(args: { to: string; firstName?: string; programName: string; loginUrl: string; isNewAccount: boolean }): Promise<void>`

- [ ] **Step 1: Create the email template**

Create `lib/email/templates/program-welcome.tsx`:

```tsx
import * as React from "react";

export function ProgramWelcomeEmail(props: {
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}) {
  const { firstName, programName, loginUrl, isNewAccount } = props;
  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", color: "#111", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20 }}>
        {firstName ? `Welcome, ${firstName}!` : "Welcome!"}
      </h1>
      <p>Your purchase is confirmed and <strong>{programName}</strong> is ready in your account.</p>
      <p>
        {isNewAccount
          ? "Click below to set your password and start your program:"
          : "Click below to log in and view your new program:"}
      </p>
      <p>
        <a
          href={loginUrl}
          style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, textDecoration: "none", display: "inline-block" }}
        >
          {isNewAccount ? "Set Up My Account" : "Access My Program"}
        </a>
      </p>
      <p style={{ fontSize: 12, color: "#666" }}>
        If the button doesn't work, copy this link into your browser:<br />
        {loginUrl}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the send helper**

Create `lib/email/send-program-welcome.ts`:

```typescript
import * as React from "react";
import { getResend } from "@/lib/email/resend";
import { ProgramWelcomeEmail } from "@/lib/email/templates/program-welcome";

export async function sendProgramWelcomeEmail(args: {
  to: string;
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
    to: args.to,
    subject: args.isNewAccount
      ? `Welcome — set up your ${args.programName} account`
      : `Your new program: ${args.programName}`,
    react: React.createElement(ProgramWelcomeEmail, {
      firstName: args.firstName,
      programName: args.programName,
      loginUrl: args.loginUrl,
      isNewAccount: args.isNewAccount,
    }),
  });
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit 2>&1 | grep -E "program-welcome|send-program-welcome" || echo "no errors in new files"`
Expected: `no errors in new files`.

- [ ] **Step 4: Checkpoint (user commits).**

---

## Task 4: Program-purchase fulfillment service (core)

**Files:**
- Create: `lib/services/program-purchase.service.ts`
- Test: `lib/services/__tests__/program-purchase.service.test.ts`

**Interfaces:**
- Consumes: `getSellablePackageBySlug` is NOT used here (packages loaded by id); uses `duplicateProgram`/`assignProgram` from `@/lib/services/program.service`, `sendProgramWelcomeEmail`, `clerkClient`, `prisma`.
- Produces: `fulfillProgramPurchase(session: { id: string; email: string | null; amountTotal: number | null; currency: string | null; packageIds: string[] }): Promise<{ clerkUserId: string } | null>` — idempotent; returns the resolved Clerk user id (or `null` if it early-returned as already completed).

- [ ] **Step 1: Write the failing tests**

Create `lib/services/__tests__/program-purchase.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    programPurchase: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    coachPackage: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    clientProfile: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/services/program.service', () => ({
  duplicateProgram: vi.fn(),
  assignProgram: vi.fn(),
}))
vi.mock('@/lib/email/send-program-welcome', () => ({ sendProgramWelcomeEmail: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUserList: vi.fn(async () => ({ data: [] })),
      createUser: vi.fn(async () => ({ id: 'clerk_new', firstName: 'Pat', lastName: 'Buyer', imageUrl: '' })),
    },
    organizations: { createOrganizationMembership: vi.fn(async () => ({})) },
  })),
}))

import { prisma } from '@/lib/prisma'
import { duplicateProgram, assignProgram } from '@/lib/services/program.service'
import { sendProgramWelcomeEmail } from '@/lib/email/send-program-welcome'
import { fulfillProgramPurchase } from '../program-purchase.service'

const session = {
  id: 'cs_test_1', email: 'buyer@example.com',
  amountTotal: 7999, currency: 'usd', packageIds: ['pkg1'],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.programPurchase.create).mockResolvedValue({ id: 'pp1' } as any)
  vi.mocked(prisma.programPurchase.update).mockResolvedValue({ id: 'pp1' } as any)
  vi.mocked(prisma.coachPackage.findMany).mockResolvedValue([
    { id: 'pkg1', name: 'Golf Back Pain', programTemplateId: 'tmpl1',
      trainerId: 'trainer1', priceInCents: 7999 } as any,
  ])
  vi.mocked(prisma.user.findUnique)
    .mockResolvedValueOnce({ id: 'trainer1', clerkOrgId: 'org_jane' } as any) // trainer lookup
    .mockResolvedValue(null) // buyer does not exist yet
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: 'user_buyer', firstName: 'Pat' } as any)
  vi.mocked(prisma.clientProfile.upsert).mockResolvedValue({} as any)
  vi.mocked(duplicateProgram).mockResolvedValue({ id: 'prog_copy1' } as any)
  vi.mocked(assignProgram).mockResolvedValue({ id: 'prog_copy1' } as any)
})

describe('fulfillProgramPurchase', () => {
  it('is idempotent: skips when a COMPLETED purchase already exists', async () => {
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({ id: 'pp1', status: 'COMPLETED' } as any)
    const result = await fulfillProgramPurchase(session)
    expect(result).toBeNull()
    expect(assignProgram).not.toHaveBeenCalled()
    expect(sendProgramWelcomeEmail).not.toHaveBeenCalled()
  })

  it('clones the template then assigns the copy (never the template)', async () => {
    await fulfillProgramPurchase(session)
    expect(duplicateProgram).toHaveBeenCalledWith('tmpl1', 'trainer1', false)
    expect(assignProgram).toHaveBeenCalledWith('prog_copy1', 'user_buyer', expect.any(Date))
  })

  it('creates the DB user as an onboarded CLIENT in the trainer org', async () => {
    await fulfillProgramPurchase(session)
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: 'CLIENT', clerkOrgId: 'org_jane', onboarded: true }),
        update: expect.objectContaining({ onboarded: true }),
      })
    )
  })

  it('records the purchase as COMPLETED and sends a welcome email', async () => {
    await fulfillProgramPurchase(session)
    expect(prisma.programPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    )
    expect(sendProgramWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@example.com', isNewAccount: true })
    )
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run lib/services/__tests__/program-purchase.service.test.ts`
Expected: FAIL — cannot find module `../program-purchase.service`.

- [ ] **Step 3: Implement the service**

Create `lib/services/program-purchase.service.ts`:

```typescript
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { duplicateProgram, assignProgram } from "@/lib/services/program.service";
import { sendProgramWelcomeEmail } from "@/lib/email/send-program-welcome";

export interface FulfillSessionInput {
  id: string;
  email: string | null;
  amountTotal: number | null;
  currency: string | null;
  packageIds: string[];
}

export async function fulfillProgramPurchase(
  session: FulfillSessionInput
): Promise<{ clerkUserId: string } | null> {
  // 1. Idempotency
  const existing = await prisma.programPurchase.findUnique({
    where: { stripeCheckoutSessionId: session.id },
  });
  if (existing?.status === "COMPLETED") return null;

  const email = session.email?.trim().toLowerCase();
  if (!email) throw new Error("Checkout session has no buyer email");
  if (session.packageIds.length === 0) throw new Error("No packages in session metadata");

  // 2. Load packages (source of truth for template + trainer + price)
  const packages = await prisma.coachPackage.findMany({
    where: { id: { in: session.packageIds } },
  });
  if (packages.length === 0) throw new Error("Purchased packages not found");
  const trainerId = packages[0].trainerId;

  const trainer = await prisma.user.findUnique({ where: { id: trainerId } });
  if (!trainer?.clerkOrgId) throw new Error("Selling trainer has no organization");
  const orgId = trainer.clerkOrgId;

  // 3. Ensure a pending purchase row exists (created once; reused on retry)
  if (!existing) {
    await prisma.programPurchase.create({
      data: {
        stripeCheckoutSessionId: session.id,
        buyerEmail: email,
        trainerId,
        orgId,
        packageIds: session.packageIds,
        amountInCents: session.amountTotal ?? 0,
        currency: session.currency ?? "usd",
        status: "PENDING",
      },
    });
  }

  // 4. Resolve or create the buyer (Clerk + DB), idempotently
  const clerk = await clerkClient();
  const dbExisting = await prisma.user.findUnique({ where: { email } });
  const isNewAccount = !dbExisting;

  let clerkUserId = dbExisting?.clerkId ?? null;
  let clerkFirstName = dbExisting?.firstName ?? undefined;

  if (!clerkUserId) {
    const found = await clerk.users.getUserList({ emailAddress: [email] });
    if (found.data.length > 0) {
      clerkUserId = found.data[0].id;
      clerkFirstName = found.data[0].firstName ?? undefined;
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [email],
        skipPasswordRequirement: true,
      });
      clerkUserId = created.id;
      clerkFirstName = created.firstName ?? undefined;
    }
  }

  // Ensure org membership (ignore "already a member" errors)
  try {
    await clerk.organizations.createOrganizationMembership({
      organizationId: orgId,
      userId: clerkUserId,
      role: "org:member",
    });
  } catch {
    // already a member — fine
  }

  // Upsert DB user as an onboarded CLIENT in the trainer's org
  const dbUser = await prisma.user.upsert({
    where: { email },
    update: { clerkId: clerkUserId, clerkOrgId: orgId, onboarded: true },
    create: {
      clerkId: clerkUserId,
      email,
      firstName: clerkFirstName ?? "",
      lastName: "",
      role: "CLIENT",
      clerkOrgId: orgId,
      onboarded: true,
    },
  });

  // Minimal profile so the client onboarding wizard is skipped
  await prisma.clientProfile.upsert({
    where: { userId: dbUser.id },
    update: {},
    create: { userId: dbUser.id },
  });

  // 5. Clone each template and assign the copy
  const startDate = new Date();
  const assignedProgramIds: string[] = [];
  for (const pkg of packages) {
    if (!pkg.programTemplateId) continue;
    const copy = await duplicateProgram(pkg.programTemplateId, trainerId, false);
    await assignProgram(copy.id, dbUser.id, startDate);
    assignedProgramIds.push(copy.id);
  }

  // 6. Complete the purchase record
  await prisma.programPurchase.update({
    where: { stripeCheckoutSessionId: session.id },
    data: {
      status: "COMPLETED",
      buyerUserId: dbUser.id,
      buyerClerkId: clerkUserId,
      assignedProgramIds,
    },
  });

  // 7. Welcome email
  const programName = packages.map((p) => p.name).join(" + ");
  await sendProgramWelcomeEmail({
    to: email,
    firstName: dbUser.firstName || undefined,
    programName,
    loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/p/claim?session_id=${session.id}`,
    isNewAccount,
  });

  return { clerkUserId };
}
```

> Note: the `ClientProfile` unique field is assumed to be `userId`. If `prisma.clientProfile.upsert` errors on the `where`, check the real unique field name in `prisma/schema.prisma` (search `model ClientProfile`) and adjust the `where`. This is the one spot to verify against the live schema during implementation.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run lib/services/__tests__/program-purchase.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint (user commits).**

---

## Task 5: Checkout seam + public checkout endpoint

**Files:**
- Create: `lib/payments/program-checkout.ts`
- Create: `app/api/checkout/program/route.ts`
- Modify: `proxy.ts` (add public routes)

**Interfaces:**
- Consumes: `getSellablePackageBySlug` (Task 2), `stripe` (`@/lib/stripe`).
- Produces: `createProgramCheckoutSession(args: { packages: { name: string; priceInCents: number; currency: string }[]; packageIds: string[]; successSlug: string }): Promise<{ url: string }>` (the Model A / Connect seam).

- [ ] **Step 1: Implement the checkout seam**

Create `lib/payments/program-checkout.ts`:

```typescript
import { stripe } from "@/lib/stripe";

export async function createProgramCheckoutSession(args: {
  packages: { name: string; priceInCents: number; currency: string }[];
  packageIds: string[];
  successSlug: string;
}): Promise<{ url: string }> {
  // MODEL A: charge on the platform account. The Connect upgrade lives ONLY here:
  // add payment_intent_data.application_fee_amount + transfer_data.destination later.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: args.packages.map((p) => ({
      price_data: {
        currency: p.currency,
        product_data: { name: p.name },
        unit_amount: p.priceInCents,
      },
      quantity: 1,
    })),
    metadata: {
      purchaseType: "program",
      packageIds: args.packageIds.join(","),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/p/${args.successSlug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/p/${args.successSlug}`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}
```

- [ ] **Step 2: Implement the public endpoint**

Create `app/api/checkout/program/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { createProgramCheckoutSession } from "@/lib/payments/program-checkout";

export async function POST(req: Request) {
  const body = (await req.json()) as { slug?: string; withBundle?: boolean };
  if (!body.slug) return new NextResponse("Missing slug", { status: 400 });

  const pkg = await getSellablePackageBySlug(body.slug);
  if (!pkg || !pkg.programTemplateId) {
    return new NextResponse("Package not found", { status: 404 });
  }

  // Prices + templates are ALL server-derived from the package record.
  const packages = [{ name: pkg.name, priceInCents: pkg.priceInCents, currency: pkg.currency }];
  const packageIds = [pkg.id];

  if (body.withBundle && pkg.upsell && pkg.upsell.programTemplateId) {
    packages.push({
      name: pkg.upsell.name,
      priceInCents: pkg.upsell.priceInCents,
      currency: pkg.upsell.currency,
    });
    packageIds.push(pkg.upsell.id);
  }

  try {
    const { url } = await createProgramCheckoutSession({
      packages,
      packageIds,
      successSlug: pkg.slug!,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("program checkout error", err);
    return new NextResponse("Checkout error", { status: 500 });
  }
}
```

- [ ] **Step 3: Add public routes to `proxy.ts`**

In `proxy.ts`, extend the `createRouteMatcher` public-routes list to include `"/p(.*)"` and `"/api/checkout/program"`. Example (match the existing array's exact style):

```typescript
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/api/stripe/webhook",
  "/p(.*)",
  "/api/checkout/program",
]);
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "program-checkout|checkout/program|proxy" || echo "no errors in new/edited files"`
Expected: `no errors in new/edited files`.

- [ ] **Step 5: Checkpoint (user commits).**

---

## Task 6: Wire the webhook (program purchase + refund)

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

**Interfaces:**
- Consumes: `fulfillProgramPurchase` (Task 4).

- [ ] **Step 1: Branch `checkout.session.completed` on purchase type**

In `app/api/stripe/webhook/route.ts`, import the service and split the existing case. Replace the current `checkout.session.completed` case with:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.purchaseType === "program") {
    await fulfillProgramPurchase({
      id: session.id,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
      packageIds: (session.metadata.packageIds ?? "").split(",").filter(Boolean),
    });
  } else {
    await activateSubscriptionFromCheckout(session);
  }
  break;
}
```

Add the import near the top:

```typescript
import { fulfillProgramPurchase } from "@/lib/services/program-purchase.service";
```

- [ ] **Step 2: Add refund handling**

Add a new case in the same `switch` (default: pause the assigned programs). Note: `charge.refunded` carries a `payment_intent`, not the checkout session id — look the purchase up via Stripe, then pause its programs:

```typescript
case "charge.refunded": {
  const charge = event.data.object as Stripe.Charge;
  const piId = charge.payment_intent as string | null;
  if (piId) {
    // Find the checkout session for this payment intent
    const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 });
    const sessionId = sessions.data[0]?.id;
    if (sessionId) {
      const purchase = await prisma.programPurchase.findUnique({
        where: { stripeCheckoutSessionId: sessionId },
      });
      if (purchase && purchase.assignedProgramIds.length > 0) {
        await prisma.program.updateMany({
          where: { id: { in: purchase.assignedProgramIds } },
          data: { status: "PAUSED" },
        });
        await prisma.programPurchase.update({
          where: { id: purchase.id },
          data: { status: "REFUNDED" },
        });
      }
    }
  }
  break;
}
```

> The existing `catch` in this route already returns HTTP 500 on any thrown error, which makes Stripe retry — the fulfillment service is idempotent, so retries are safe. No change needed to the error handling.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "stripe/webhook" || echo "no errors in webhook route"`
Expected: `no errors in webhook route`.

- [ ] **Step 4: Manual verification (Stripe CLI)**

If the Stripe CLI is available: with the dev server running (`npm run dev`) and `stripe listen --forward-to localhost:3000/api/stripe/webhook`, trigger a real test checkout through the sales page (Task 7). Confirm in the DB (`npm run db:studio`) that a `ProgramPurchase` (COMPLETED), a CLIENT `User` (`onboarded: true`), and an ACTIVE cloned `Program` with `WorkoutSessionV2` rows all appear. If the CLI is not available, note this step as deferred to end-to-end verification.

- [ ] **Step 5: Checkpoint (user commits).**

---

## Task 7: Public sales page `/p/[slug]`

**Files:**
- Create: `app/p/[slug]/page.tsx`
- Create: `app/p/[slug]/buy-button.tsx`

**Interfaces:**
- Consumes: `getSellablePackageBySlug` (Task 2); POSTs to `/api/checkout/program`.

- [ ] **Step 1: Create the server page**

Create `app/p/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { BuyButton } from "./buy-button";

export default async function SalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pkg = await getSellablePackageBySlug(slug);
  if (!pkg || !pkg.programTemplateId) notFound();

  const price = (pkg.priceInCents / 100).toFixed(2);
  const bundle = pkg.upsell && pkg.upsell.programTemplateId ? pkg.upsell : null;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>{pkg.name}</h1>
      {pkg.description && <p style={{ color: "#444", marginTop: 12 }}>{pkg.description}</p>}
      <p style={{ fontSize: 22, fontWeight: 600, marginTop: 24 }}>${price}</p>
      <BuyButton
        slug={pkg.slug!}
        bundle={
          bundle
            ? { name: bundle.name, price: (bundle.priceInCents / 100).toFixed(2), description: bundle.description ?? "" }
            : null
        }
      />
    </main>
  );
}
```

- [ ] **Step 2: Create the client buy component (upsell checkbox)**

Create `app/p/[slug]/buy-button.tsx`:

```tsx
"use client";

import { useState } from "react";

export function BuyButton({
  slug,
  bundle,
}: {
  slug: string;
  bundle: { name: string; price: string; description: string } | null;
}) {
  const [withBundle, setWithBundle] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleBuy() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, withBundle }),
      });
      if (!res.ok) throw new Error("Checkout failed");
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setLoading(false);
      alert("Something went wrong starting checkout. Please try again.");
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      {bundle && (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 16, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
          <input type="checkbox" checked={withBundle} onChange={(e) => setWithBundle(e.target.checked)} />
          <span>
            <strong>Add {bundle.name} — ${bundle.price}</strong>
            {bundle.description && <><br /><span style={{ color: "#555", fontSize: 14 }}>{bundle.description}</span></>}
          </span>
        </label>
      )}
      <button
        onClick={handleBuy}
        disabled={loading}
        style={{ background: "#2563eb", color: "#fff", padding: "14px 24px", borderRadius: 10, border: "none", fontSize: 16, cursor: "pointer", width: "100%" }}
      >
        {loading ? "Starting checkout…" : "Buy Now"}
      </button>
    </div>
  );
}
```

> The inline styles keep this task self-contained. If the project has a shared Button/Card UI kit under `components/ui`, swapping these for it is a reasonable polish follow-up — not required for the funnel to work.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, seed one `CoachPackage` (Task 2's `createSellablePackage` against a real template id via `npm run db:studio` or a throwaway script), and visit `/p/<slug>`. Confirm the page renders name, price, the bundle checkbox (if an upsell is linked), and that "Buy Now" redirects to a Stripe checkout URL.
Expected: redirect to `checkout.stripe.com`.

- [ ] **Step 4: Checkpoint (user commits).**

---

## Task 8: Success page — claim account + set password

**Files:**
- Create: `app/p/[slug]/success/page.tsx`
- Create: `app/p/[slug]/success/claim-account.tsx`

**Interfaces:**
- Consumes: `prisma.programPurchase`, `clerkClient().signInTokens.createSignInToken`.

- [ ] **Step 1: Create the server success page (issue a one-time sign-in token)**

Create `app/p/[slug]/success/page.tsx`:

```tsx
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ClaimAccount } from "./claim-account";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let ticket: string | null = null;
  let alreadyClaimed = false;

  if (session_id) {
    const purchase = await prisma.programPurchase.findUnique({
      where: { stripeCheckoutSessionId: session_id },
    });
    if (purchase?.buyerClerkId && purchase.status === "COMPLETED") {
      if (purchase.accountClaimedAt) {
        alreadyClaimed = true;
      } else {
        const clerk = await clerkClient();
        const token = await clerk.signInTokens.createSignInToken({
          userId: purchase.buyerClerkId,
          expiresInSeconds: 60 * 30,
        });
        ticket = token.token;
        await prisma.programPurchase.update({
          where: { id: purchase.id },
          data: { accountClaimedAt: new Date() },
        });
      }
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Payment successful 🎉</h1>
      <p style={{ color: "#444", marginTop: 12 }}>Your program is ready. Set a password to log in.</p>
      {ticket ? (
        <ClaimAccount ticket={ticket} />
      ) : (
        <p style={{ marginTop: 24 }}>
          {alreadyClaimed
            ? "This account is already set up — please "
            : "We're still setting up your account. Please check your email for a login link, or "}
          <a href="/sign-in">sign in</a>.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Create the client claim component (ticket sign-in + set password)**

Create `app/p/[slug]/success/claim-account.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSignIn, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export function ClaimAccount({ ticket }: { ticket: string }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user } = useUser();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoaded || signedIn) return;
    (async () => {
      try {
        const res = await signIn!.create({ strategy: "ticket", ticket });
        if (res.status === "complete") {
          await setActive!({ session: res.createdSessionId });
          setSignedIn(true);
        }
      } catch {
        setError("This link has expired. Please use the link in your welcome email or sign in.");
      }
    })();
  }, [isLoaded, ticket, signIn, setActive, signedIn]);

  async function handleSave() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await user!.updatePassword({ newPassword: password });
      router.push("/dashboard");
    } catch {
      setError("Could not set password. Please try again.");
      setSaving(false);
    }
  }

  if (error) return <p style={{ color: "#b91c1c", marginTop: 24 }}>{error} <a href="/sign-in">Sign in</a></p>;
  if (!signedIn) return <p style={{ marginTop: 24 }}>Setting up your account…</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>Create your password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
        style={{ width: "100%", padding: 12, border: "1px solid #ccc", borderRadius: 8 }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: 16, background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer", width: "100%" }}
      >
        {saving ? "Saving…" : "Go to my program"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "success/page|claim-account" || echo "no errors in success page files"`
Expected: `no errors in success page files`.

- [ ] **Step 4: Manual verification (end-to-end)**

With the dev server + `stripe listen` running, complete a test purchase using Stripe's test card `4242 4242 4242 4242`. Confirm: redirect to `/p/<slug>/success?session_id=...`, the "Create your password" form appears, setting a password lands you on `/dashboard`, and the assigned program is visible. Reloading the success URL shows "already set up" (token is one-time via `accountClaimedAt`).

- [ ] **Step 5: Checkpoint (user commits).**

---

## Task 9: Final full-funnel verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (including the new `sellable-package.service` and `program-purchase.service` suites).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this feature (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 3: End-to-end dry run (documented)**

Walk the full path once with Stripe test mode: external-style link → `/p/<slug>` → optional bundle → Stripe checkout (`4242…`) → webhook fulfillment → success page → set password → `/dashboard` with the program(s). Verify in `db:studio`: `ProgramPurchase` COMPLETED, CLIENT `User` onboarded in the trainer's org, one ACTIVE cloned `Program` per purchased package with `WorkoutSessionV2` rows, and the **template unchanged** (still `isTemplate: true`, `clientId: null`).

- [ ] **Step 4: Idempotency + refund spot checks**

Re-send the same `checkout.session.completed` event (via `stripe events resend <id>` or the CLI): confirm no duplicate account/program/purchase. Trigger a refund on the test payment: confirm the assigned program(s) flip to `PAUSED` and the `ProgramPurchase` to `REFUNDED`.

- [ ] **Step 5: Checkpoint (user commits).** Feature complete.

---

## Self-Review (completed by plan author)

- **Spec coverage:** sales page (T7), per-trainer link via slug (T2/T7), checkout + upsell (T5/T7), Stripe-hosted payment (T5), webhook fulfillment (T4/T6), account auto-create as onboarded CLIENT in trainer org (T4), clone-then-assign (T4), ProgramPurchase idempotency + payout accounting (T1/T4), set-password success (T8), welcome email (T3), refund handling (T6), Model-A/Connect seam (T5). ✔ All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step contains complete code. The single verify-against-schema note (ClientProfile unique field, T4) is an explicit, bounded check, not a placeholder.
- **Type consistency:** `fulfillProgramPurchase` input shape is identical in T4 (definition), T6 (caller); `createProgramCheckoutSession` args identical in T5 (definition) and its caller; `getSellablePackageBySlug` return (`… & { upsell }`) consumed consistently in T5/T7; `slug` non-null asserted only after the `programTemplateId` guard. ✔
- **Deviations from draft spec (grounded in real code, spec updated to match):** `ProgramPurchase` replaces `Invoice` as the purchase record; `duplicateProgram`+`assignProgram` replaces "assign template directly".
```
