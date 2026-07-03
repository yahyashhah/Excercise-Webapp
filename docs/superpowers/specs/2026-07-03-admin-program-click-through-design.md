# Admin Program Click-Through: Edit & Assign

## Problem

In the super admin panel (`/admin`), two program lists are not interactive:

1. **Global Programs** (`/admin/global-programs`) — "universal" programs available to every trainer. Rows already support Edit via a ⋮ dropdown menu, but the row itself isn't clickable, and clicking the program name does nothing.
2. **All Programs** (`/admin/programs`) — a platform-wide oversight table of every trainer's programs. Rows are entirely static: no click, no edit, no assign. Editing or assigning any of these programs today only works from the owning trainer's own account, because `updateProgramAction` and `assignProgramAction` in `actions/program-actions.ts` enforce `program.trainerId === currentUser.id`.

Super admins need to click into a program from either list and act on it directly.

## Goals

- Global Programs: clicking a row's program name navigates to the existing edit page.
- All Programs: clicking a row's program name opens a detail page where a super admin can view the program, edit it with the full program editor (same one trainers use — every workout/block/exercise), and assign it to a client.
- No change to trainer-facing behavior, permissions, or UI for their own programs.

## Non-goals

- No "assign" concept for Global Programs (they're copied into a trainer's library first, then assigned — that flow already exists via `copyGlobalProgramAction`).
- No new `ProgramAssignment` join table — assignment stays the existing 1:1 (`Program.clientId`/`startDate`/`status`) model.
- No changes to Duplicate, Share/PDF, or voice-memo actions for the admin context — those stay trainer-only.
- Admins are not restricted to clients they personally manage; the assign dropdown is scoped to *the program's own trainer's* clients (fetched via `getClientsForTrainer(program.trainerId)`), matching how assignment already works for the owning trainer.

## Part 1 — Global Programs row click-through

**File:** `app/admin/global-programs/page.tsx`

Wrap the program name/description block (inside the first `<td>`) in a `next/link` `<Link href={`/admin/global-programs/${prog.id}/edit`}>`. No new route — `app/admin/global-programs/[id]/edit/page.tsx` already exists and is reused as-is. The ⋮ dropdown (`GlobalProgramActions`) keeps Push Update and Archive; its "Edit" item can remain for discoverability.

## Part 2 — All Programs: view, edit, assign

### New routes

**`app/admin/programs/[id]/page.tsx`** (new)
- `await requireSuperAdmin()`.
- Fetch `programService.getProgramById(id)`; `notFound()` if missing.
- If `program.isGlobal`, redirect to `/admin/global-programs/${id}/edit` (global programs are managed there, not here).
- If `program.trainerId` is set, fetch clients via `getClientsForTrainer(program.trainerId)` for the assign dropdown; otherwise pass `[]`.
- Fetch `sessions` the same way `app/(platform)/programs/[id]/page.tsx` does today (by `workoutIds`).
- Render `<ProgramDetailView program={...} clients={...} sessions={...} adminMode editHref={`/admin/programs/${id}/edit`} assignAction={assignAdminProgramAction} trainerName={...} />`.

**`app/admin/programs/[id]/edit/page.tsx`** (new)
- `await requireSuperAdmin()`.
- Fetch `program` via `getProgramById(id)` and `exercises` via `getExercises()`, in parallel (mirrors `EditGlobalProgramPage`).
- `notFound()` if missing or if `program.isGlobal` (global programs are edited via the Global Programs section, not here).
- Render `<AdminProgramEditorWrapper program={...} exercises={...} />` (new thin client wrapper, mirrors `GlobalProgramEditorWrapper`).

**`app/admin/programs/[id]/admin-program-editor-wrapper.tsx`** (new, client component)
- Wraps `ProgramEditor` with `onSave` calling `updateAdminProgramAction(programId, data)` and `redirectTo={`/admin/programs/${id}`}`. Since this route only ever edits an existing program, `onSave` doesn't need a create branch.

### New actions — `actions/admin-program-actions.ts` (new file)

Mirrors the existing `actions/global-program-actions.ts` pattern: gate with `requireSuperAdmin()` instead of trainer-ownership checks.

- `updateAdminProgramAction(programId, input: UpdateProgramInput)` — validates with `updateProgramSchema`, calls `programService.updateProgram(programId, parsed.data)` (same service function the trainer flow uses), revalidates `/admin/programs` and `/admin/programs/${programId}`.
- `assignAdminProgramAction({ programId, clientId, startDate })` — validates with `assignProgramSchema`, calls `programService.assignProgram(...)` (same service function the trainer flow uses), revalidates `/admin/programs` and `/admin/programs/${programId}`.

Neither checks `trainerId` ownership — `requireSuperAdmin()` is the authorization boundary, matching how `global-program-actions.ts` already works for global programs.

### Component changes (additive only — existing trainer behavior unchanged)

**`components/programs/program-detail-view.tsx`**
- New optional props: `adminMode?: boolean`, `editHref?: string`, `assignAction?: typeof assignProgramAction`.
- When `adminMode` is true, render a compact header action bar (Edit + Assign only — no Duplicate/Share/voice-memo, since those actions aren't wired for admin use and aren't in scope) independent of the existing `isTrainer`-gated bar. Edit links to `editHref`; Assign opens `AssignProgramDialog` passing `assignAction` through.
- When `adminMode` is true, also show the owning trainer's name in the header (e.g. "Owned by {trainerName}"), since the admin is viewing someone else's program.
- When `adminMode` is omitted/false, behavior is 100% unchanged from today.

**`components/programs/assign-program-dialog.tsx`**
- New optional prop `assignAction?: (input: { programId: string; clientId: string; startDate: string }) => Promise<{ success: boolean; error?: string; data?: unknown }>`, defaulting to the existing imported `assignProgramAction`. The trainer flow doesn't pass this prop, so its behavior is unchanged.

### Table change

**`app/admin/programs/page.tsx`**
- Wrap the program name/description block in `<Link href={`/admin/programs/${prog.id}`}>`, same treatment as Part 1.

## Testing

- As a super admin: click a Global Program row → lands on its existing edit page, save works.
- As a super admin: click an All Programs row → lands on the new detail page, shows the owning trainer's name, shows Edit + Assign only (no Duplicate/Share/mic buttons).
- Edit a trainer-owned program as admin → full editor loads with existing workouts, save persists, redirects back to the admin detail page.
- Assign a trainer-owned, unassigned program as admin → dropdown lists only that trainer's clients, assigning sets `clientId`/`startDate`/`status: ACTIVE` and creates `WorkoutSessionV2` rows, same as the trainer-side flow.
- Assign button is hidden once a program already has a `clientId` (existing rule, reused unchanged).
- A program with `isGlobal: true` visited at `/admin/programs/[id]` redirects to `/admin/global-programs/[id]/edit`.
- As a regular trainer, verify `/programs/[id]` and `/programs/[id]/edit` behavior is byte-for-byte unchanged (no `adminMode`/`assignAction` props passed, so the additive branches don't execute).
- Non-super-admin users hitting `/admin/programs/[id]` or `/admin/programs/[id]/edit` directly are redirected by `requireSuperAdmin()`, same as every other `/admin/*` route.
