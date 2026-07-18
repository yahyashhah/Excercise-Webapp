# Self-Serve Program Sales Funnel (Multi-Trainer) — Design

- **Date:** 2026-07-17
- **Status:** Draft (pending user review)
- **Author:** Yahya + Claude (brainstorming session)

## Goal

Let a stranger buy a fitness program directly (e.g. from a Facebook ad) and, with **zero manual work**, automatically get an account and the purchased program assigned. First use case: a **$79.99 "Golf Back Pain" 12-week program** with a **$29.99 bundle upsell** (pre-round warm-up, post-round cool-down, in-round pain-relief).

This adds a **self-serve (direct-to-consumer) path** on top of the app's existing **B2B trainer-driven** model. Payment plays the role a trainer plays today: it triggers account creation and program assignment.

Crucially, this is a **multi-trainer platform**: many trainers, each with their own Clerk organization, can each run their own funnel selling their own programs. The buyer is always linked to the **specific trainer who sold to them**.

## Locked decisions (from brainstorming)

1. **Multi-trainer / per-trainer funnels:** Each trainer gets a **unique public sales link**. A buyer from Jane's link becomes a client in **Jane's org** with **Jane's program**; the seller identity rides through the whole funnel (link → checkout metadata → webhook).
2. **Buyer identity:** Buyers become **CLIENT** users inside the **selling trainer's** Clerk organization — like an invited client, but onboarded automatically by payment. They appear in that trainer's client list and can be messaged/tracked/upsold later.
3. **Sellable offering = `CoachPackage`:** A trainer's offering is a `CoachPackage` record tying together **trainer + program template + price + public slug**. It generates the sales link and drives checkout. The $29.99 bundle is a **second `CoachPackage`** owned by the same trainer, linked as an upsell.
4. **Assessment role:** The external assessment is a **lead-magnet / marketing** step only. **Every buyer of a given package receives that package's program** in v1 (no answer-based branching yet).
5. **Checkout home:** A **public sales page inside the app** (per package) with an "Add the bundle" checkbox, handing off to **Stripe-hosted Checkout** (`mode: "payment"`, one-time). The app never handles card data.
6. **Money routing — launch:** **Model A — the platform's single Stripe account collects all payments** (platform is merchant of record; trainer payouts handled separately/manually for now). Chosen to launch fast while validating.
7. **Money routing — future-proofing:** Checkout-session creation is **isolated behind one seam** so **Stripe Connect** (money routed directly to each trainer, platform takes a % fee) can be dropped in later **without touching the rest of the funnel**. Every sale is recorded against its trainer so payout reconciliation (and the later Connect migration) is clean.
8. **First login:** The webhook **creates the account at payment**. The success page shows a **"Set your password"** screen (email locked, pre-filled) landing them on the dashboard. A welcome email with a backup sign-in link is also sent.

## End-to-end flow

```
Facebook Ad  ┐
Landing Page ├─ external free site (out of scope for this app)
Assessment   │
Results      ┘
   │  "See Your Program" button links to →
   ▼
/p/<package-slug>   (NEW public sales page; resolves the CoachPackage →
   │                 trainer, org, program template, price)
   │  offer + [✓] Add bundle ($29.99) + [Buy Now]
   ▼
POST /api/checkout/program   (NEW public endpoint)
   │  { packageSlug, withBundle }  — NO amounts from the client
   │  loads CoachPackage(s) SERVER-SIDE → price, template, trainerId, orgId
   ▼
createProgramCheckoutSession(...)   (NEW — the Model A / Connect SEAM)
   │  today: Checkout Session on the PLATFORM Stripe account (mode: payment)
   │  metadata: { purchaseType:"program", packageIds, trainerId, orgId, templateIds }
   ▼
Stripe-hosted Checkout  →  checkout.session.completed
   ▼
Webhook: program-purchase handler   (NEW logic; the heart)
   1. Idempotency check (ProgramPurchase keyed by checkout.session.id) — skip if seen
   2. Find-or-create Clerk user by buyer email
   3. Upsert DB User (role CLIENT, clerkOrgId = seller's org) + org membership
   4. Pre-fill minimal ClientProfile, mark onboarded = true
   5. For each purchased package → duplicateProgram(template) then assignProgram(copy → client)   [REUSE]
   6. Record ProgramPurchase against the CoachPackage(s) + trainer (payout accounting)
   7. Send welcome email (Resend)
   ▼
/p/<package-slug>/success   (NEW)  → "Set your password" → dashboard
   ▼
Existing client dashboard + daily engagement   (REUSE, unchanged)

[Future] Membership upsell; assessment branching; Stripe Connect payouts.
```

## Components

### 1. Public sales page — `/p/<package-slug>` (NEW)
- **Does:** Resolves the `CoachPackage` by slug; renders the trainer's offer, price, and an "Add the bundle" checkbox (shown only if the package has a linked upsell package); "Buy Now" POSTs to the checkout endpoint and redirects to the returned Stripe URL.
- **Depends on:** `CoachPackage` lookup; the checkout endpoint; `proxy.ts` public-route list.
- **Change:** add `/p(*)` and `/api/checkout/program` to the public matcher in `proxy.ts` (alongside `/`, `/sign-up`, `/api/stripe/webhook`).
- **Note:** distinct commerce page from the marketing homepage (`app/page.tsx`).

### 2. Checkout endpoint — `POST /api/checkout/program` (NEW)
- **Does:** Accepts `{ packageSlug, withBundle }` (no amounts). Loads the `CoachPackage` (and its linked bundle package if `withBundle`) server-side, derives price + template + trainer + org, and calls the checkout seam. Returns the hosted Checkout URL.
- **Security:** price, program template, and seller all come from the server-side `CoachPackage` record — client input can never set price or choose which program/trainer.
- **Modeled on:** existing `app/api/stripe/checkout/route.ts`, minus the `role !== "TRAINER"` guard, and payment (not subscription) mode.

### 3. Checkout seam — `createProgramCheckoutSession(...)` (NEW)
- **Does:** The **single place** that knows how money is routed. **Today (Model A):** creates a Checkout Session on the platform Stripe account with 1–2 line items (inline `price_data` from `CoachPackage.priceInCents`, or a pre-made `stripePriceId`), stamping metadata `{ purchaseType, packageIds, trainerId, orgId, templateIds }`.
- **Future (Connect):** same signature; adds `payment_intent_data.application_fee_amount` + `transfer_data.destination` (or direct charges on the connected account) using the trainer's stored `stripeConnectAccountId`. **Nothing else in the funnel changes.**

### 4. `CoachPackage` — the sellable offering (WIRE UP existing model)
- **Does:** Represents "Trainer X's program Y at price Z, sold at public slug S."
- **Fields (reuse `prisma/schema.prisma:736` + add as needed):** `trainerId` (owner), `programTemplateId`, `priceInCents`, `stripePriceId?`, `slug` (public, unique), `title`, `kind` (`program` | `bundle`), `upsellPackageId?` (links a program package to its bundle), `active`.
- **Created by:** a trainer-facing action (see §8). For v1 (mostly the platform owner selling), packages may be seeded/created via a minimal form or admin — full trainer self-service UI can be a fast follow.

### 5. Program-purchase webhook handler (NEW logic in existing route)
- **Where:** extend `app/api/stripe/webhook/route.ts`; branch on `session.metadata.purchaseType === "program"` so trainer-subscription logic is untouched.
- **Algorithm (idempotent, retry-safe):**
  1. **Idempotency:** if a `ProgramPurchase` with status COMPLETED already exists for this `checkout.session.id`, return 200 and stop.
  2. **User:** find Clerk user by the Stripe checkout email; else `clerkClient().users.createUser(...)`. Upsert DB `User` with `role: CLIENT`, `clerkOrgId = metadata.orgId`, `clerkId`.
  3. **Membership:** ensure the user is a member of the seller's Clerk org (same effect as `organizationMembership.created`).
  4. **Onboarding skip:** create a minimal `ClientProfile`, set `onboarded = true` → buyer bypasses the client onboarding wizard and lands on the dashboard.
  5. **Assign:** for each purchased package (re-loaded from `metadata.packageIds`), call `duplicateProgram(programTemplateId, trainerId)` then `assignProgram(copyId, clientId, now)` (clone + materialize the 12-week schedule). `assignProgram` mutates in place, so the clone is mandatory — never assign a template directly.
  6. **Record:** write/complete the `ProgramPurchase` (idempotency key + payout accounting + Connect-migration seam), storing `trainerId`, `packageIds`, `assignedProgramIds`, and the resolved buyer.
  7. **Email:** send welcome email (new-buyer vs existing-account variant) via Resend.
  - **On any post-payment failure:** return non-2xx → Stripe retries; all steps idempotent so retries never duplicate the account, assignment, or record.

### 6. Success / claim-account page — `/p/<package-slug>/success` (NEW)
- **Does:** Reached via Stripe `success_url`. Shows "Welcome! Set your password" (email locked to the purchase email) via Clerk to claim the pre-created account, then redirects to the dashboard. If they leave, the welcome-email backup link still works.

### 7. Welcome email (REUSE Resend)
- **Does:** Confirms purchase, links to the program, includes a backup sign-in link. Variants: **new buyer** ("set your password") vs **existing account** ("your new program is ready").

### 8. Trainer "create a sellable package" (NEW, minimal for v1)
- **Does:** Lets a trainer turn one of their program templates into a `CoachPackage` (set price, generate public slug/link, optionally attach a bundle upsell). For v1 this can be a minimal form or seeded records; full self-service is a fast follow once the funnel is validated.

## Data model

- **Extend `CoachPackage`** (`prisma/schema.prisma:736`) with the new optional fields `programTemplateId`, `slug @unique`, `kind` ("program" | "bundle"), `upsellPackageId` — making it the sellable-offering entity. Existing fields (`name`, `priceInCents`, `currency`, `stripePriceId`, `isActive`) are reused. Additions are optional so the existing (unused) subscription relation is untouched.
- **New `ProgramPurchase` model** is the per-sale record + idempotency key (`stripeCheckoutSessionId @unique`). The existing `Invoice`/`ClientSubscription` trio is subscription-shaped (`Invoice.subscriptionId` is required → `ClientSubscription`) and is **not** reused for one-time program sales — it's reserved for the future membership phase.
- **Program assignment** must **clone the template first** (`duplicateProgram`) then `assignProgram` the copy, because `assignProgram` mutates the program row in place (sets `clientId`). No change to the `Program` model.
- **Payout accounting:** each `ProgramPurchase` records `trainerId` + `packageIds` + `amountInCents` so platform-collected revenue can be reconciled per trainer (and later migrated to Connect).

## Reuse map (what already exists)

| Capability | Existing code |
|---|---|
| Assign program + build 12-week schedule | `programService.assignProgram` (`lib/services/program.service.ts:285`) |
| Clone template → instance | `programService.duplicateProgram` (`lib/services/program.service.ts:224`) |
| Create Clerk user / org invite pattern | `actions/invite-client-action.ts` |
| Create DB client from org membership | `app/api/webhooks/clerk/route.ts:59` |
| Stripe checkout session creation pattern | `app/api/stripe/checkout/route.ts` |
| Stripe webhook receiver + signature verify | `app/api/stripe/webhook/route.ts` |
| Client-payment data models (unwired) | `prisma/schema.prisma:736-784` |
| Transactional email | Resend (already integrated) |
| Client dashboard + daily experience | existing `(platform)` routes |

## Payments architecture: Model A now, Connect later

- **Now (Model A):** one platform Stripe account collects everything; platform is merchant of record; trainer payouts reconciled from `ProgramPurchase` records. Lowest effort to first sale.
- **Isolation:** only `createProgramCheckoutSession(...)` (§3) and payout reconciliation are Model-A-specific. The sales page, webhook account-creation, program assignment, success page, and emails are payment-model-agnostic.
- **Later (Connect):** add trainer Stripe-onboarding + `stripeConnectAccountId`, switch the seam to destination/direct charges with an `application_fee`, and listen for connected-account events. The rest of the funnel is unchanged.
- **Trade-offs that drove this** (for the record): Model A means platform holds funds, issues 1099s, owes sales tax on the whole amount, does payouts manually, and carries chargeback + money-transmitter risk — acceptable at low volume / mostly-owner selling, painful at scale. Connect offloads payouts, taxes, and liability to each trainer but needs onboarding + more plumbing. Migrate before recruiting outside trainers.

## One-time setup (per trainer / per offering)

1. Build the program in-app, saved as a **template**.
2. Build the bundle as a **second template**.
3. Create a **`CoachPackage`** for each (price + slug), linking the bundle as the program package's upsell → this produces the public sales link.
4. (Model A) ensure the platform Stripe account + webhook signing secret are configured (env).

## Edge cases (all handled)

- **Retry safety:** post-payment failure → non-2xx → Stripe retries; idempotency prevents duplicates.
- **Idempotency:** duplicate `checkout.session.completed` events are no-ops after the first.
- **Locked prices/seller:** public endpoint accepts only a `packageSlug`; price, template, and trainer come from the server-side record.
- **Repeat / existing buyer:** find-or-create by email → assign to existing account; "new program ready" email (no duplicate account). Works even if they already belong to a different trainer's org (a new membership/assignment is added).
- **Onboarding skip:** minimal profile + `onboarded = true` → straight to dashboard.
- **Abandoned password:** account pre-created; welcome-email backup link recovers access.
- **Independent line items:** program-only, bundle-only, or both all work.
- **Email as source of truth:** the Stripe checkout email is authoritative for identity.
- **Refunds/disputes:** `charge.refunded` pauses/archives the assigned program (default: pause; final behavior confirmed in planning).

## Out of scope (v1)

- Stripe Connect / direct trainer payouts (designed-for, built later).
- Membership/subscription upsell after the program (future phase).
- Assessment-based program branching (everyone buying a package gets that package's program).
- Fully custom in-app card form (Stripe-hosted checkout is used).
- The external landing page / assessment (built on a free third-party site).
- Full trainer self-service package-builder UI (minimal/seeded for v1).

## Prerequisites & open items for planning

- Program + bundle templates and their `CoachPackage`s must exist before launch.
- `ProgramPurchase.stripeCheckoutSessionId @unique` is the idempotency key (settled during planning).
- Decide refund default (pause vs revoke vs keep) — draft assumes pause.
- Decide v1 package-creation mechanism (minimal form vs seed vs admin).
- Confirm welcome-email copy/variants.

## Future phases

1. **Stripe Connect** — direct trainer payouts + platform fee; onboard trainers before recruiting them.
2. **Membership upsell** — recurring subscription after the 12-week program (uses `ClientSubscription`).
3. **Assessment branching** — map assessment answers to one of several program templates.
4. **Trainer self-service** — full package-builder + funnel analytics per trainer.
