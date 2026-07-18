# Trainer Self-Service "Sell This Program" — Design

- **Date:** 2026-07-18
- **Status:** Approved (brainstorm session, 2026-07-18)
- **Author:** Yahya + Claude

## Goal

Right now, making one of a trainer's program templates sellable (price, public `/p/<slug>` link, optional bundle upsell) requires a developer to run a database script by hand — every single package created so far in this project was created that way. This spec adds a **trainer-facing UI** so any trainer can do this themselves, with zero developer involvement, using the funnel already built (`docs/superpowers/specs/2026-07-17-golf-program-self-serve-funnel-design.md`).

## Locked decisions (from brainstorming)

1. **Entry point:** A **"Sell this program"** button on the existing program detail page, shown under the exact same condition as the existing "Assign to Client" button (`program.isTemplate && !clientId` — i.e., only for a trainer's own unassigned templates).
2. **One button, two states:** Not-yet-sellable → button reads "Sell this program," opens a **create** dialog. Already-sellable → button reflects status ("Selling · Active" / "Selling · Off"), opens the **same dialog** pre-filled as a **manage** view (edit price/bundle, copy link, toggle active).
3. **Bundle setup:** In the same dialog, a trainer optionally picks **another of their own templates** as the bundle add-on and sets its price inline — no prerequisite that the bundle already be sellable on its own.
4. **Link:** Auto-generated from the program name using the existing slug logic (`slugify` + collision suffix). No custom-slug field in v1.
5. **Turned-off link:** Setting a package inactive (`isActive: false`) makes `/p/<slug>` 404 like any nonexistent route — no special "unavailable" page. This falls out for free from the existing `getSellablePackageBySlug` filter (`isActive: true`), so no new code is needed for it.
6. **No schema changes.** Every field this feature needs (`priceInCents`, `slug`, `kind`, `upsellPackageId`, `isActive`, `programTemplateId`) already exists on `CoachPackage` from the funnel work.

## Scope

**In scope:** create a sellable package for a template; optionally attach/edit/remove a bundle; edit price; toggle active/inactive; copy the public link. All from one dialog on the existing program detail page.

**Out of scope (explicitly deferred):**
- Custom slugs.
- A "my sellable programs" list/overview page — the button-on-each-program pattern is the only surface in v1.
- Any change to checkout, webhook, or fulfillment — this spec only adds the ability to *create/manage* `CoachPackage` rows through the UI; the self-serve funnel that consumes them is unchanged.
- Deleting a package outright (deactivating is sufficient and preserves history for past purchases).

## Flow

```
Program detail page (isTemplate && !clientId)
   │
   ▼
[Sell this program]  or  [Selling · Active]
   │  click
   ▼
Sell dialog
   │
   ├─ Not yet sellable → CREATE form
   │    Price: [_____]
   │    Add a bundle upsell? [ choose a template ▾ ]  Bundle price: [_____]
   │    → [Create sellable link]
   │
   └─ Already sellable → MANAGE form
        Link: yourapp.com/p/<slug>  [Copy]
        Price: [_____]  (editable)
        Bundle: [ choose a template ▾ ] Bundle price: [_____]  (editable / removable)
        Status: ( ) Active  ( ) Off
        → [Save changes]
```

## Components

### 1. Service layer additions — `lib/services/sellable-package.service.ts` (extend existing file)
- **`getSellablePackageByProgramTemplateId(programTemplateId: string, trainerId: string)`** — looks up the `CoachPackage` (if any) for this template owned by this trainer, `kind: "program"`, plus its resolved bundle (if `upsellPackageId` is set). Returns `null` if the template has never been made sellable. This is what the detail page uses to decide create-vs-manage state and to pre-fill the dialog.
- **`updateSellablePackage(packageId: string, trainerId: string, args: { priceInCents?: number; isActive?: boolean; bundle?: { programTemplateId: string; priceInCents: number } | null })`** — updates the main package's price/active flag. For `bundle`:
  - `null` → deactivate the existing bundle package (if any) and clear `upsellPackageId` on the main package.
  - an object → if a bundle package already exists, update its `programTemplateId`/`priceInCents` in place; if none exists yet, create one (mirroring `createSellablePackage`'s bundle-creation step) and set `upsellPackageId`.
  - Always scoped to `trainerId` ownership — throws/returns an error if the package doesn't belong to the calling trainer.
- **Reused as-is:** `createSellablePackage` (already exists, used for the initial create — creates the bundle package first when one is specified, then the main package with `upsellPackageId` set) and `getSellablePackageBySlug` (already exists, used by the public sales page — unchanged).

### 2. Server actions — `actions/sellable-package-actions.ts` (new file, mirrors `actions/program-actions.ts`)
- **`createSellablePackageAction(input: { programId: string; priceInCents: number; bundle?: { programTemplateId: string; priceInCents: number } })`** — verifies the calling user is a TRAINER and owns `programId` (must be `isTemplate: true`, `clientId: null`), then calls `createSellablePackage`. Returns `{ success, data }` or `{ success: false, error }`, following the existing action-result convention.
- **`updateSellablePackageAction(input: { packageId: string; priceInCents?: number; isActive?: boolean; bundle?: {...} | null })`** — verifies ownership, calls `updateSellablePackage`.
- **`getSellablePackageForProgramAction(programId: string)`** — verifies ownership, resolves the program's `trainerId`, calls `getSellablePackageByProgramTemplateId`. Used by the detail page/dialog to load current state.
- All three follow the existing `getTrainerUser()` + try/catch + `{ success, error }` shape already used throughout `program-actions.ts`.

### 3. Dialog component — `components/programs/sell-program-dialog.tsx` (new, modeled on `assign-program-dialog.tsx`)
- Props: `programId`, `programName`, `trainerTemplates` (the trainer's other templates, for the bundle picker — excludes the current program), `open`, `onOpenChange`.
- On open, calls `getSellablePackageForProgramAction` to determine create vs. manage state.
- **Create state:** price input, optional bundle picker (Select of `trainerTemplates`) + bundle price input, "Create sellable link" button → `createSellablePackageAction` → on success, re-fetches and switches to manage state, shows the link with a copy button and a success toast.
- **Manage state:** shows the link (readonly input + copy icon button), editable price, editable/removable bundle, an Active/Off switch (reusing `components/ui/switch.tsx` or a two-state toggle) — "Save changes" → `updateSellablePackageAction` → toast + `router.refresh()`.
- Validation: price must be a positive number; bundle price (if a bundle template is chosen) must be a positive number. Client-side validation before submit, mirroring `AssignProgramDialog`'s `toast.error(...)` pattern for missing fields.

### 4. Program detail page — `components/programs/program-detail-view.tsx` (modify)
- Add a "Sell this program" / "Selling · Active" / "Selling · Off" button in the same conditional block as the existing "Assign to Client" button (`!clientId` — both already require `isTemplate` given how that block is scoped).
- Button label/state is derived from a lightweight initial fetch (`getSellablePackageForProgramAction`) done once when the detail page loads, alongside its existing data loading — avoids an extra popped-in loading state on first render of the button itself.
- Opens `SellProgramDialog` on click, passing the trainer's other templates (already available to this page, or fetched via the existing programs-listing action filtered client-side) for the bundle picker.

## Edge cases

- **A template used as someone's bundle can also be sold on its own** (or vice versa) — no restriction; a `CoachPackage` row's `kind` is independent per package, so the same underlying template can be referenced by multiple packages.
- **Removing a bundle** deactivates that bundle's `CoachPackage` (not deleted) and clears `upsellPackageId` on the main package — any `ProgramPurchase.packageIds` referencing it historically are unaffected (they store the ids already used, not a live join).
- **Editing price** only affects *future* checkouts — `createProgramCheckoutSession` already builds Stripe line items from the package's current `priceInCents` at checkout time (inline `price_data`, not a persisted Stripe Price object), so past purchases are never retroactively changed.
- **Ownership:** every action re-verifies the calling trainer owns both the program and (for updates) the package — prevents one trainer from editing another's sellable package by guessing an id.
- **A trainer with zero other templates:** the bundle picker simply shows no options / is disabled with a short note ("Create another template first to offer a bundle") — not an error state.

## Reuse map

| Capability | Source |
|---|---|
| Slug generation + collision handling | `lib/utils/slug.ts`, `createSellablePackage` (existing) |
| Package → sales page resolution | `getSellablePackageBySlug` (existing, unchanged) |
| Checkout/webhook/fulfillment | unchanged — this spec only adds `CoachPackage` management, not funnel changes |
| Action-result / ownership-check pattern | `actions/program-actions.ts` (`getTrainerUser`, `{ success, error }` shape) |
| Dialog UI pattern | `components/programs/assign-program-dialog.tsx` |
| Button placement condition | `components/programs/program-detail-view.tsx` (`isTemplate && !clientId`) |

## Prerequisites & open items for planning

- Confirm whether `components/ui/switch.tsx` (already in the UI kit) or a simple two-button toggle reads better for Active/Off in the dialog — a UI-polish call, not a blocker.
- Confirm the exact wording of validation/error toasts during planning (kept consistent with `AssignProgramDialog`'s existing tone).
