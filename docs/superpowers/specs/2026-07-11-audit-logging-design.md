# Audit Logging — Design

**Goal:** Track who did what across the platform for accountability/compliance, security monitoring, super-admin oversight of trainer activity, and login/logout tracking. Visible in two places: a platform-wide log in the super admin panel, and a clinic-scoped log for trainers.

## Scope decisions (from brainstorming)

- **Detail level:** action description + key field diffs (`{ before, after }` on changed fields only), not full record snapshots.
- **Action set:** curated high-value actions only, not every mutation (see list below).
- **Viewers:** super admin sees everything across all clinics; trainers see only activity scoped to their own org (`clerkOrgId`).
- **Retention:** indefinite, no auto-purge job for now.
- **Auth events:** successful login/logout only, via Clerk session webhooks. Failed-login attempts are not tracked (Clerk doesn't expose them cleanly via webhook).
- **Mechanism:** explicit `logAudit(...)` calls added at each instrumented call site — no generic Prisma middleware/interception.

## Data model

```prisma
enum AuditActorType {
  SUPER_ADMIN
  TRAINER
  CLIENT
  SYSTEM
}

model AuditLog {
  id          String         @id @default(cuid())
  createdAt   DateTime       @default(now())

  actorId     String?        // User.id; null for SYSTEM events (e.g. webhook-driven)
  actorType   AuditActorType
  actorName   String         // denormalized snapshot of name/email at time of action

  action      String         // e.g. "CLINICAL_NOTE_UPDATED", "LOGIN"
  targetType  String?        // e.g. "ClinicalNote", "User", "Program"
  targetId    String?
  targetLabel String?        // denormalized snapshot, e.g. client's display name

  orgId       String?        // clerkOrgId; scopes trainer-visible entries. Null for platform-only actions (e.g. global program edits, super-admin user moderation)
  metadata    Json?          // { before: {...}, after: {...} } for changed fields only

  @@index([orgId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

Denormalized `actorName`/`targetLabel` keep entries readable even after the underlying user/record is deleted.

## Curated action list & instrumentation sites

| Action | Trigger site | orgId source |
|---|---|---|
| `LOGIN` / `LOGOUT` | Clerk webhook: `session.created` / `session.ended` (extend `app/api/webhooks/clerk/route.ts`) | session's org, else null |
| `USER_INVITED` | `actions/invite-client-action.ts`, `actions/bulk-invite-action.ts` | inviting trainer's org |
| `USER_DEACTIVATED` / `USER_REACTIVATED` / `USER_DELETED` | `actions/admin-actions.ts` | target user's org (null if platform-level) |
| `CLINICAL_NOTE_CREATED` / `_UPDATED` / `_DELETED` | `actions/clinical-note-actions.ts` (→ `lib/services/clinical-note.service.ts`) | trainer's org |
| `PROGRAM_CREATED` / `_UPDATED` / `_DELETED` | `actions/program-actions.ts`, `lib/services/program.service.ts` | trainer's org |
| `GLOBAL_PROGRAM_CREATED` / `_UPDATED` / `_DELETED` | `actions/global-program-actions.ts`, `actions/admin-program-actions.ts` | null (platform-level, super-admin only) |
| `EXERCISE_CREATED` / `_UPDATED` / `_DELETED` | `actions/exercise-actions.ts`, `actions/bulk-exercise-actions.ts` | null (shared exercise library is platform-level) |
| `CLINIC_SETTINGS_UPDATED` | `actions/organization-actions.ts::saveOrganizationProfile` | trainer's org |

This list is deliberately not exhaustive — it covers the actions identified as compliance/security/oversight relevant. Extending it later just means adding a new `logAudit()` call plus a row in this table.

## Service layer

New `lib/services/audit-log.service.ts`:

```ts
logAudit({ actorId, actorType, actorName, action, targetType?, targetId?, targetLabel?, orgId?, metadata? }): Promise<void>
getAuditLogs({ orgId?, actorId?, action?, dateFrom?, dateTo?, page, pageSize }): Promise<{ entries, total }>
```

`logAudit` is called after the primary mutation succeeds, wrapped in try/catch — a logging failure is `console.error`'d but never rolls back or blocks the underlying action (audit logging is best-effort, not transactional). This matches how the rest of the codebase handles non-critical side effects.

`getAuditLogs` is shared by both UI surfaces; the trainer route always passes its own `orgId`, the super-admin route omits it (or passes one as an optional filter) for a platform-wide view.

## Auth event capture

Extend the existing `app/api/webhooks/clerk/route.ts` handler to also process `session.created` and `session.ended` webhook events: resolve the Clerk user to a local `User` via `clerkUserId`, and call `logAudit` with `action: "LOGIN"`/`"LOGOUT"`, `actorType` derived from the user's role (or `SUPER_ADMIN` if their `publicMetadata.superAdmin` is set), `orgId` from the session's active org if present.

## UI

- **Super admin:** new page `app/admin/audit-log/page.tsx`, added to `components/admin/admin-sidebar.tsx` nav. Paginated table with filters: actor, action type, target type, org/clinic, date range. Gated by existing `requireSuperAdmin()`.
- **Trainer:** new page `app/(platform)/settings/audit-log/page.tsx` (alongside the existing `settings/clinic` page), gated by `requireRole("TRAINER")`. Same table component, fewer filters (action type, date range) — no org filter since it's implicitly their own org.
- Both reuse a shared `components/audit-log/audit-log-table.tsx` client component, parameterized by which filters are shown.

## Error handling

- `logAudit` never throws to its caller — internal errors are caught and logged via `console.error`, so a broken audit write cannot break the underlying business action (e.g. deactivating a user still succeeds even if the audit insert fails).
- Webhook-driven `LOGIN`/`LOGOUT` logging follows the same pattern as the existing Clerk webhook handler's other event types (best-effort, returns 200 regardless of internal logging outcome, per existing webhook conventions in that file).

## Testing

- Unit tests for `logAudit` / `getAuditLogs` (service layer, mocked Prisma).
- Integration-style tests for a couple of instrumented actions (e.g. clinical note update, user deactivation) asserting an `AuditLog` row is created with expected fields.
- No UI/e2e tests required beyond existing project conventions unless the user requests them.

## Out of scope (for this pass)

- Failed-login tracking.
- Retention/purge automation.
- Full before/after record snapshots (only changed-field diffs).
- A generic/automatic instrumentation mechanism (Prisma middleware) — curated call sites only.
