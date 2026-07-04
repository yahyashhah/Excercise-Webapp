# Clinic Visibility at Program Creation — Design

**Goal:** Let a super admin choose a global program's clinic visibility ("All Clinics" or a specific set) at the moment they create it, in both the manual builder and the AI generation wizard — instead of always creating universal and requiring a separate post-creation dialog trip.

**Builds on:** `docs/superpowers/plans/2026-07-04-assign-global-program-to-clinics.md` (already implemented) — `Program.organizationIds: String[]`, `listClerkOrganizations()`, `assignGlobalProgramOrganizations`, `AssignClinicsDialog`, all already in place.

## Scope decisions

- Restriction level: clinic-level (`organizationIds`), same semantics as the existing feature. No per-trainer granularity.
- Applies to both global-program creation paths: the manual builder (`/admin/global-programs/new`) and the AI wizard (`/admin/global-programs/generate`).
- The existing post-creation `AssignClinicsDialog` gets retrofitted to use the same UI component, for one consistent visibility control across the whole feature.

## Component: `ClinicVisibilitySelector`

New file: `components/programs/clinic-visibility-selector.tsx`.

```ts
interface Props {
  clinics: { id: string; name: string }[];
  value: string[];             // organizationIds — [] means "All Clinics"
  onChange: (ids: string[]) => void;
}
```

Behavior:
- Radio group: "All Clinics" / "Specific Clinics". Active radio is local UI state seeded from `value.length > 0 ? "specific" : "all"` — it cannot be derived purely from `value` on every render, because "Specific, nothing checked yet" and "All" both look like `[]`.
- Selecting "All Clinics" clears `value` to `[]` immediately.
- Selecting "Specific Clinics" reveals the checkbox list (same visual pattern as today's `AssignClinicsDialog`: scrollable list, checkbox + label per clinic).
- Validation: if "Specific Clinics" is active and zero clinics are checked, show an inline message ("Select at least one clinic, or choose All Clinics") and block submit — no silent fallback to "All".

## Manual builder path

- `app/admin/global-programs/new/page.tsx` fetches `listClerkOrganizations()` alongside `exercises`, passes `clinics` into `GlobalProgramEditorWrapper` → `ProgramEditor`.
- `ProgramEditor` (`components/programs/program-editor.tsx`) gains an optional `clinics?: {id,name}[]` prop. When present, it renders `ClinicVisibilitySelector` in the Program Details card and includes the selected `organizationIds` in the `data` object passed to `onSave`. When absent (the regular trainer-program editor never passes it), nothing changes — this is what distinguishes "global creation context" without adding a separate `isGlobal`/`mode` flag.
- `lib/validators/program.ts`'s `createProgramSchema` gains an optional `organizationIds: z.array(z.string()).default([])`.
- `lib/services/program.service.ts::createGlobalProgram` needs no code change — `organizationIds` already rides through its existing `...rest` spread into the Prisma `create` call.
- `lib/services/program.service.ts::createProgram` (the regular, non-global path) explicitly destructures and discards `organizationIds` from its input before building the Prisma `create` data, so a trainer's own program can never end up with a stray value in that column — keeping intact the existing constraint that `organizationIds` is only meaningful for `isGlobal: true` rows.
- `actions/global-program-actions.ts::createGlobalProgramAction` needs no change beyond the schema update — it already parses with `createProgramSchema` and forwards `parsed.data` to `programService.createGlobalProgram`.

## AI wizard path

- `app/admin/global-programs/generate/page.tsx` fetches `listClerkOrganizations()`, passes `clinics` into `GlobalGenerateWrapper` → `GenerateProgramForm`.
- `GenerateProgramForm` (`components/programs/generate-program-form.tsx`) gains an optional `clinics?: {id,name}[]` prop, rendered in the same conditional slot as the (already admin-hidden) client selector — i.e. shown only when `clients.length === 0`. Selected `organizationIds` state is added to the `genParams` object built in `handleGenerateExercises`.
- `GlobalGenerateWrapper`'s existing `params as Parameters<typeof generateGlobalProgramAction>[0]` cast carries the new key through unchanged — no wrapper code change needed beyond passing the `clinics` prop it fetched.
- `actions/global-program-actions.ts::generateGlobalProgramAction`'s inline `prisma.program.create` call gains `organizationIds: (params.organizationIds as string[]) ?? []`.

## Retrofit: `AssignClinicsDialog`

- `app/admin/global-programs/assign-clinics-dialog.tsx` swaps its bare checkbox list for `ClinicVisibilitySelector`, passing through its existing `clinics`/`currentOrganizationIds` props as `value`/`onChange`. Save behavior (calling `assignGlobalProgramOrganizationsAction`) is unchanged.

## Testing

This codebase only unit-tests server-side logic via Vitest — no component tests for `.tsx` files (established constraint, unchanged). New/updated coverage:
- `lib/validators/__tests__/program.test.ts` (or wherever `createProgramSchema` tests live) — accepts `organizationIds`, defaults to `[]` when omitted.
- `lib/services/__tests__/program.service.test.ts` — `createGlobalProgram` passes `organizationIds` through; `createProgram` (regular) never writes it even if present in input.
- `actions/__tests__/global-program-actions.test.ts` — `generateGlobalProgramAction`'s create call includes `organizationIds` from `params`.

`.tsx` changes (the new selector, the three call sites) are verified via `npx tsc --noEmit` and manual dev-server pass, same as the original feature.

## Out of scope

- Per-trainer (as opposed to per-clinic) restriction.
- Changing how `getGlobalPrograms`/trainer-facing filtering works — already correct from the prior feature, untouched here.
