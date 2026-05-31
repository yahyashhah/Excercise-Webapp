# Clerk Organizations Migration Design

**Date:** 2026-05-31
**Status:** Approved
**Scope:** Replace custom clinic/patient auth with Clerk Organizations. Clinics = Clerk Orgs. Patients join only via invitation. Clean slate rebuild (no data migration).

---

## Overview

Migrate the authentication and organization system so that:
- Clinics are **Clerk Organizations**
- The clinician is the **org admin** (one per org)
- Patients are **Clerk users** who join the clinic exclusively via email invitation
- The manual patient linking screen and role-selection onboarding step are removed
- Clerk handles auth, invitation delivery, and org identity; the DB handles all queryable data

---

## Architecture & Data Flow

### Clinician Journey
1. Signs up via Clerk (`/sign-up`) → redirected to `/onboarding`
2. Onboarding form: enters name + clinic name
3. Server action: calls `clerkClient().organizations.createOrganization()` → creates DB `User` with `role=CLINICIAN`, `clerkOrgId` set to the new org's ID, `onboarded=true`
4. Redirects to `/dashboard`

### Patient Journey
1. Clinician invites patient by email from their dashboard → `invitePatientAction` calls `clerkClient().organizations.createOrganizationInvitation()` — Clerk sends the invitation email natively
2. Patient clicks invitation link → Clerk's hosted sign-up flow → Clerk user created
3. `organizationMembership.created` webhook fires → server upserts DB `User` with `role=PATIENT`, `clerkOrgId` set to clinic's org ID, `onboarded=false`
4. Patient is redirected to `/onboarding/patient` — clinical intake form (no role selection, no clinic selection)
5. Server action: upserts `PatientProfile`, sets `onboarded=true`
6. Redirects to `/dashboard`

### Webhook Events
| Event | Action |
|---|---|
| `organizationMembership.created` | Upsert DB `User` with `role=PATIENT`, `clerkOrgId` |
| `organizationMembership.deleted` | Set `clerkOrgId=null` on patient (soft removal from clinic) |
| `user.updated` | Sync `email`, `imageUrl` (existing) |
| `user.deleted` | Delete DB `User` (existing) |

---

## Data Model Changes

### Removed Models
- **`PatientClinicianLink`** — replaced by `clerkOrgId` field on `User`
- **`ClinicProfile`** — clinic identity lives in Clerk Organization; extra metadata (phone, address, tagline, website) stored in Clerk Organization `publicMetadata`

### Modified Models

**`User`** — add one field:
```prisma
clerkOrgId  String?   // Clerk Organization ID — clinician: their own org, patient: the org that invited them
```

All other models (`Program`, `WorkoutPlan`, `Assessment`, `PatientProfile`, `WorkoutSessionV2`, etc.) are untouched.

### Query Pattern Change
```ts
// Before (PatientClinicianLink join)
prisma.patientClinicianLink.findMany({ where: { clinicianId, status: "active" }, include: { patient: true } })

// After (direct User query)
prisma.user.findMany({ where: { clerkOrgId: clinician.clerkOrgId, role: "PATIENT" } })
```

### Clinic Metadata Storage
Clerk Organization stores `name` and `imageUrl` natively. Extra fields (phone, address, website, tagline) are stored in `organization.publicMetadata`:
```ts
{ phone: string, address: string, website: string, tagline: string }
```

---

## Onboarding Flows

### Clinician Onboarding (`/onboarding`)
- Fields: first name, last name, clinic name
- No role selection — the `/onboarding` route is exclusively for clinicians
- On submit: create Clerk org → create DB User → redirect to `/dashboard`

### Patient Onboarding (`/onboarding/patient`)
- Triggered after accepting invitation (webhook sets `onboarded=false`)
- Fields: first name, last name, phone, DOB + full clinical intake (diagnosis, pain score, equipment, goals, activity level, injury date, surgery history, occupation, limitations, comorbidities, functional challenges)
- On submit: upsert `PatientProfile` → set `onboarded=true` → redirect to `/dashboard`

### Invitation Redirect URL
Clerk org invitations are created with `redirectUrl: "/onboarding/patient"`. After Clerk creates the account, the user lands directly on `/onboarding/patient` — no race condition with the webhook. The webhook fires in parallel and upserts the DB record; the patient onboarding action does its own upsert so it's idempotent regardless of webhook timing.

The platform layout's fallback for "no DB user found": check `auth().orgId` — if present, redirect to `/onboarding/patient`; otherwise redirect to `/onboarding` (clinician path).

### What's Removed
- Role selection step ("Are you a Clinician or Patient?") from onboarding
- Manual patient search/link screen
- `searchPatientsAction`, `linkPatientAction`, `unlinkPatientAction`

---

## Route & Middleware Changes

### New `middleware.ts`
```ts
// Clerk's clerkMiddleware with createRouteMatcher
// Public: /sign-in, /sign-up, /api/webhooks/clerk, /onboarding, /onboarding/patient
// Protected: everything else → redirect to /sign-in if unauthenticated
```
Replaces per-layout `auth()` + `redirect()` duplication.

### Route Changes
| Route | Change |
|---|---|
| `/onboarding` | Clinician only — create name + clinic name, no role picker |
| `/onboarding/patient` | New — patient clinical intake after invitation acceptance |
| `/settings/clinic` | Reads/writes Clerk Organization metadata instead of `ClinicProfile` DB model |
| `/patients` | Invite button replaces link-by-email search |

### Removed Files
- `actions/patient-actions.ts` — `linkPatientAction`, `unlinkPatientAction`, `searchPatientsAction`
- `actions/clinic-actions.ts` — replaced by Clerk org API calls
- `lib/services/clinic.service.ts`
- `lib/validators/clinic.ts` (if only used by clinic-actions)
- Patient link/search UI components

---

## Role Derivation

`role` field stays in DB (`CLINICIAN | PATIENT`), set once:
- Clinician: set during clinician onboarding
- Patient: set by `organizationMembership.created` webhook

No Clerk API call is needed at request time to know the user's role — it's always in the DB record.

---

## Auth Guard Logic (Post-Migration)

```
Request to /(platform)/*
  → middleware: unauthenticated? → /sign-in
  → layout: no DB user? → /onboarding (clinician) or /onboarding/patient (patient)
  → layout: onboarded=false? → correct onboarding path
  → render page
```

Role-based page access (e.g. only CLINICIAN sees /patients) stays as-is via `requireRole()` helper.
