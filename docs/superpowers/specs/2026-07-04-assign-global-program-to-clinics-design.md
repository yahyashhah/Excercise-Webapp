# Assign Global Programs to Specific Clinics

## Problem

Global (template) programs at `/admin/global-programs` are currently all-or-nothing: every one is "available to all organizations." There's no way for a super admin to make a template visible to only a subset of clinics (Clerk Organizations). There's also no first-class `Clinic`/`Organization` model in the schema — clinic identity today is just the string `User.clerkOrgId`, matched to real Clerk Organization records via the Clerk API.

## Goals

- A super admin can restrict a global program's visibility to a chosen set of clinics from `/admin/global-programs`.
- A trainer's Templates tab only shows global programs that are either fully universal (no restriction) or explicitly scoped to that trainer's clinic.
- No copying happens at assignment time — trainers still self-serve via the existing "Copy to My Library" flow. Assignment only changes *visibility*.
- No change to programs that stay universal (empty restriction list) — today's behavior is the default.

## Non-goals

- No new `Clinic`/`Organization` Prisma model — clinic identity stays `User.clerkOrgId` matched against live Clerk Organization records.
- No assignment concept for non-global programs (a program already tied to one `trainerId`/`clientId` isn't a candidate for clinic-scoping).
- No automatic push/copy into clinic trainers' libraries — assignment is visibility-only.
- No pagination UI for the clinic list; `listClerkOrganizations()` fetches up to 100 orgs in one call. If a clinic count ever exceeds that, the list will need pagination — out of scope for now.

## Data model

Add to `Program` in `prisma/schema.prisma`:

```prisma
organizationIds String[] @default([])
```

Semantics:
- `isGlobal: true`, `organizationIds: []` → visible to every organization (today's behavior, unchanged).
- `isGlobal: true`, `organizationIds: [orgId, ...]` → visible only to trainers whose `User.clerkOrgId` is in that list.
- Non-global programs never read or write this field.

## Service layer — `lib/services/program.service.ts`

- `getGlobalPrograms(clerkOrgId?: string)`: add the optional param. When provided, filter:
  ```ts
  where: {
    isGlobal: true,
    status: { not: "ARCHIVED" },
    OR: [{ organizationIds: { isEmpty: true } }, { organizationIds: { has: clerkOrgId } }],
  }
  ```
  When omitted, keep current behavior (no org filter) — used by admin-side `getAdminGlobalPrograms` (unaffected, separate function).
- New: `assignGlobalProgramOrganizations(programId: string, organizationIds: string[])`:
  ```ts
  return prisma.program.update({
    where: { id: programId, isGlobal: true },
    data: { organizationIds },
  });
  ```
  Scoping the `where` by `isGlobal: true` prevents accidentally organization-scoping a non-global program (mirrors `updateGlobalProgram`/`deleteGlobalProgram`).

## Clinic listing — `lib/services/admin.service.ts`

New function:
```ts
export async function listClerkOrganizations() {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationList({ limit: 100 });
  return data.map((org) => ({ id: org.id, name: org.name }));
}
```

## Admin action — `actions/global-program-actions.ts`

New action, following the existing file's pattern exactly (auth via `requireSuperAdmin()`, try/catch, `revalidatePath`):

```ts
export async function assignGlobalProgramOrganizationsAction(
  programId: string,
  organizationIds: string[]
) {
  await requireSuperAdmin();
  try {
    await programService.assignGlobalProgramOrganizations(programId, organizationIds);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to assign program to clinics:", error);
    return { success: false as const, error: "Failed to assign program to clinics" };
  }
}
```

## UI

**`app/admin/global-programs/page.tsx`**
- Fetch `listClerkOrganizations()` alongside `getAdminGlobalPrograms(...)`.
- Pass `clinics={clinics}` and `currentOrganizationIds={prog.organizationIds}` to `GlobalProgramActions`.

**`app/admin/global-programs/global-program-actions.tsx`**
- New prop `clinics: { id: string; name: string }[]` and `currentOrganizationIds: string[]`.
- New dropdown item "Assign to Clinics" (Building2 icon from lucide-react) that opens a new `AssignClinicsDialog`.

**`app/admin/global-programs/assign-clinics-dialog.tsx`** (new, client component, colocated with the actions component since it's global-programs-specific)
- Dialog with a scrollable checkbox list of `clinics`, pre-checked from `currentOrganizationIds`.
- If `clinics` is empty, show "No clinics found" instead of an empty list.
- Footer: Cancel / Save. Save calls `assignGlobalProgramOrganizationsAction(programId, selectedIds)`, toasts success/error, `router.refresh()` on success — same UX pattern as `AssignProgramDialog`.

## Trainer-facing call site

**`app/(platform)/programs/page.tsx:31`**
```ts
user.role === "TRAINER" ? programService.getGlobalPrograms(user.clerkOrgId ?? undefined) : Promise.resolve([]),
```

## Testing

- Unit: `program.service.ts` — `getGlobalPrograms` returns universal + org-matching programs, excludes programs scoped to a different org, when given a `clerkOrgId`; returns all non-archived globals when `clerkOrgId` omitted.
- Unit: `assignGlobalProgramOrganizations` updates `organizationIds`; a call against a non-global program id throws (Prisma `where` mismatch → not found).
- Unit: `assignGlobalProgramOrganizationsAction` — requires super admin, calls the service, revalidates, handles thrown errors.
- Manual: as super admin, open a global program's "Assign to Clinics," check one clinic, save. As a trainer in that clinic, confirm the template appears in Templates tab. As a trainer in a different clinic, confirm it does not appear. Confirm a program with no clinics assigned still appears for every trainer (regression check on default/empty case).
