# Feature Design: Admin Panel Improvements, AI 1-Day Plans, YouTube → Org Library

**Date:** 2026-06-27

---

## 1. Admin Panel — Trainers with Clients + Archive/Delete

### Overview

Extend the existing `/admin/users` page to support (a) a grouped "By Organization" view showing trainers alongside their clients and (b) archive/delete actions on every user.

### Schema Change

Add `isActive Boolean @default(true)` to the `User` model in `prisma/schema.prisma`. This is consistent with how other models (Exercise, WorkoutBlockV2, etc.) handle soft deletion.

### UI: Two-Tab Layout

The Users page gains two tabs rendered as pill-style toggles (matching the existing rounded-2xl border chrome):

- **All Users** — existing flat table, unchanged except for the new Actions column.
- **By Organization** — grouped view: one trainer row, then indented client sub-rows below. Uses the same table row styles (`hover:bg-muted/40`); client rows are indented 20px with `bg-muted/20` and a subtle left border accent. A chevron on the trainer row expands/collapses their clients.

### Actions Column

A `···` dropdown (Radix `DropdownMenu`) on every row. Options depend on state:

| User state | Available actions |
|---|---|
| Active | Archive |
| Archived | Restore, Delete |

- **Archive** — calls `archiveUserAction(userId)` → sets `isActive: false`. Row is immediately grayed out (opacity-50 + italic name). Toast: "User archived."
- **Restore** — calls `restoreUserAction(userId)` → sets `isActive: true`.
- **Delete** — opens an inline confirm (AlertDialog). Calls `deleteUserAction(userId)` → hard deletes the user record. Toast: "User permanently deleted."

Archived users remain visible in both tabs (grayed) unless a new "Show archived" toggle (off by default) is unchecked.

### New Server Actions

Located in `actions/admin-actions.ts`:

- `archiveUserAction(userId: string)` — auth check (super admin only), sets `isActive: false`, revalidates `/admin/users`.
- `restoreUserAction(userId: string)` — same guard, sets `isActive: true`.
- `deleteUserAction(userId: string)` — same guard, `prisma.user.delete({ where: { id: userId } })`.

### Service Change

`getAllUsers` in `admin.service.ts` gains an optional `includeArchived: boolean` param (default `false`) that adds `isActive: true` to the where clause when false.

New function `getTrainersWithClients()` — fetches all trainers (with `clerkOrgId`) and for each fetches their clients (same `clerkOrgId`, role CLIENT). Returns `TrainerWithClients[]`.

---

## 2. AI Program Generation — 1-Day Plan + No Equipment Option

### 1-Day Plan

**Change:** Add `1` to the duration preset buttons array: `[1, 2, 4, 6, 8, 12]`.

The button label is context-sensitive:
- When `daysPerWeek === 1` and the button value is `1`: renders as **"1 day"**
- All other cases: render as `"{n} wk"` / `"{n} wks"` as today.

No schema or AI service changes needed — `durationWeeks: 1` with `daysPerWeek: 1` already produces a single-workout program through the existing generation pipeline.

### No Equipment Option

**Change:** Add a **"No Equipment (Bodyweight only)"** toggle chip rendered above the existing equipment combobox, using the same pill style as the goal/difficulty chips.

Behavior:
- When toggled ON: sets `selectedEquipment = ["none"]` (sentinel value), disables the combobox (opacity-50).
- When toggled OFF: sets `selectedEquipment = []`, re-enables the combobox.
- The sentinel `"none"` is passed as `availableEquipment: ["none"]` to the generation action.

`filterByEquipment` in `lib/ai/utils/exercise-pool.ts` already strips `"none"` from an exercise's `equipmentRequired` list before checking. So any exercise requiring real equipment fails the check (not in `["none"]`), while bodyweight exercises (empty or `["none"]` required) pass. No changes to `ai.service.ts` or `exercise-pool.ts` needed.

---

## 3. YouTube Upload → Organization Exercise Library

### Problem

`bulkCreateExercisesAction` in `actions/bulk-exercise-actions.ts` creates every exercise with the Prisma default `source: UNIVERSAL` and `organizationId: null`. Exercises uploaded by a trainer should belong to their organization.

### Change

In `bulkCreateExercisesAction`, after fetching `dbUser`, check `dbUser.clerkOrgId`. If present, include in each `prisma.exercise.create`:

```ts
source: "ORGANIZATION",
organizationId: dbUser.clerkOrgId,
isPublic: false,
```

If `clerkOrgId` is null (trainer without an org), fall back to the current behavior (`source: UNIVERSAL`).

No UI changes. The `BulkImportForm` already routes to the trainer's exercises page after publish; the exercise library query for trainers already filters to include `source = ORGANIZATION AND organizationId = trainer.clerkOrgId` alongside universal exercises.

### Exercise Library Query Verification

Confirm that the trainer-facing exercises query in the exercise library includes org-scoped exercises. If it currently only fetches `source: UNIVERSAL`, add an `OR` clause: `{ source: "UNIVERSAL" } OR { source: "ORGANIZATION", organizationId: dbUser.clerkOrgId }`.

---

## Files Touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `isActive Boolean @default(true)` to `User` |
| `actions/admin-actions.ts` | New file: archive, restore, delete user actions |
| `lib/services/admin.service.ts` | Add `includeArchived` param; add `getTrainersWithClients()` |
| `app/admin/users/page.tsx` | Add tabs, By Organization view, Actions column |
| `components/admin/user-actions-menu.tsx` | New client component: `···` dropdown with archive/restore/delete |
| `components/programs/generate-program-form.tsx` | Add `1` preset button; add No Equipment toggle |
| `actions/bulk-exercise-actions.ts` | Set `source/organizationId` from `dbUser.clerkOrgId` |
| `lib/services/exercise.service.ts` (if exists) | Verify org exercise query includes org-scoped rows |
