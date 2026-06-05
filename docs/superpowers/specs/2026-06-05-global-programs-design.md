# Global Programs — Design Spec

**Date:** 2026-06-05  
**Status:** Approved

## Summary

Super admins can create global (master) programs that clinics can browse and copy into their own library. Clinics always work on their own copy — the master is never editable by clinics. When a super admin updates a global program and pushes the change, clinics that have a copy see an "Update available" notification and can pull a fresh copy.

---

## Data Model

**Changes to `Program` in `prisma/schema.prisma`:**

```prisma
isGlobal        Boolean   @default(false)  // true = super admin master program
globalUpdatedAt DateTime?                  // bumped when super admin pushes an update
```

- `clinicianId` made nullable — global programs have no clinic owner
- `sourceTemplateId` (already exists) — tracks which master a clinic copy came from
- Update detection: `master.globalUpdatedAt > copy.createdAt`
- No new models needed; full `Program → Workout → Block → Exercise → Set` chain reused as-is

---

## Super Admin UI (`/admin/programs`)

- Existing admin programs list gains a **"Global Programs"** tab alongside the current all-programs view
- **"New Global Program"** button → opens the existing `ProgramEditor` component with `isGlobal: true` pre-set
- Each global program row shows:
  - Name, tags, workout count, created date
  - **"Push Update"** button — bumps `globalUpdatedAt` to now, which triggers notifications for all clinics that have a copy
  - Edit / Delete actions
- Super admin can edit global programs freely (they own the master)

---

## Clinic UI (`/programs`)

- Programs list gains a **"Template Library"** tab (alongside "My Programs")
- Template Library shows all `isGlobal: true` programs in read-only cards
- Each card has a **"Copy to My Library"** button → creates a new `Program` with:
  - `clinicianId` set to the acting clinician
  - `sourceTemplateId` pointing to the master
  - `isGlobal: false`
  - Full deep copy of all Workouts / Blocks / Exercises / Sets
- Copied programs appear in "My Programs" and behave exactly like any clinic-created program (fully editable, assignable to patients)

### Update Notifications

- Any program in "My Programs" that has a `sourceTemplateId` where `master.globalUpdatedAt > copy.createdAt` shows an **"Update available"** badge
- Clicking it shows a confirmation: "Pull a fresh copy of the master? Your current version will remain unchanged — a new copy will be added to your library."
- Pulling creates a new copy (does not overwrite the existing one)

---

## API / Server Actions

| Action | Description |
|---|---|
| `createGlobalProgramAction` | Super admin creates a program with `isGlobal: true`, `clinicianId: null` |
| `updateGlobalProgramAction` | Super admin edits a global program |
| `pushGlobalProgramUpdateAction` | Bumps `globalUpdatedAt` on a global program |
| `copyGlobalProgramAction` | Clinician copies a global program into their library (deep clone) |
| `getGlobalPrograms` | Returns all `isGlobal: true` programs (used by clinic Template Library) |

`copyGlobalProgramAction` reuses the existing deep-copy logic already used by `createProgramFromGeneratedPlan` (parallel inserts for workouts/blocks/exercises/sets).

---

## Authorization

- Only `superAdmin` users can create/edit/push global programs
- Any authenticated clinician can read global programs and copy them
- Clinics cannot edit, delete, or push updates to global programs — only their own copies

---

## Out of Scope

- Auto-copying all global programs on clinic join (can be added later)
- Clinic-to-clinic program sharing
- Version history / diff view for updates
