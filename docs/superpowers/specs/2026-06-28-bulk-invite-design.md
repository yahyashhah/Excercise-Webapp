# Bulk Invite via CSV — Design Spec

**Date:** 2026-06-28  
**Status:** Approved

## Overview

Extend the existing single-email invite flow to support bulk invitations via CSV upload. Both trainers (inviting clients into their org) and super admins (inviting clients into any org) can use it. CSV contains email addresses only. A preview table shows validated emails before invitations are sent; a results table shows per-email success/failure after.

## Architecture

### New files

| File | Purpose |
|------|---------|
| `lib/validators/csv-invite.ts` | Zod schema for a single `email` column; returns `{ valid: string[], errors: CsvRowError[] }` |
| `actions/bulk-invite-action.ts` | Server action: accepts `emails: string[]` + `clerkOrgId: string`; loops Clerk invitations; returns per-email results |
| `components/shared/bulk-invite-tab.tsx` | Reusable CSV upload → preview → results UI; accepts `onInvite(emails) => Promise<InviteResult[]>` callback |

### Modified files

| File | Change |
|------|--------|
| `components/clients/add-client-dialog.tsx` | Add Tabs ("Single" / "Bulk CSV"); render `BulkInviteTab` in second tab; widen dialog to `sm:max-w-lg` |
| `components/admin/trainers-with-clients-table.tsx` | Add "Bulk Invite" button per org row; opens `AdminBulkInviteDialog` with that org's `clerkOrgId` |
| `components/admin/` | New `AdminBulkInviteDialog` component: thin wrapper around `BulkInviteTab`, calls bulk-invite-action with the org's `clerkOrgId` |

## CSV Format

Single column, header required:

```
email
alice@example.com
bob@example.com
```

A downloadable template (`/public/invite-template.csv`) is provided in the upload UI.

## State Machine (`BulkInviteTab`)

```
idle → (file uploaded, parsed, validated)
  ├─ errors   → show per-row error table; "Try again" resets to idle
  └─ preview  → show email list + count; "Send X Invitations" button
                  → sending (spinner)
                      → results → per-email success/failure table; "Done" closes dialog
```

## Data Flow

1. User uploads CSV → PapaParse parses in browser → `validateCsvInviteRows()` runs client-side
2. If errors: show row/column/message table, nothing sent
3. If valid: show email preview table, user confirms
4. On confirm: call `bulkInviteAction(emails, clerkOrgId)` server action
5. Server loops emails, calls `clerkClient().organizations.createOrganizationInvitation()` for each
6. Returns `Array<{ email: string; success: boolean; error?: string }>`
7. UI renders results table; `revalidatePath` called on success

## Server Action: `bulkInviteAction`

```ts
// Trainer path: clerkOrgId derived from caller's DB user (same as inviteClientAction)
// Admin path: clerkOrgId passed explicitly; requires requireSuperAdmin() guard
bulkInviteAction(emails: string[], clerkOrgId?: string): Promise<BulkInviteResult>
```

- If `clerkOrgId` not provided: looks up caller's org (trainer path)
- If `clerkOrgId` provided: validates caller is super admin
- Sends invitations sequentially (no parallel to avoid Clerk rate limits)
- Never throws — per-email errors are captured and returned
- Calls `revalidatePath("/clients")` after trainer invites; `/admin/users` after admin invites

## Error Handling

- **Client-side (pre-send):** Invalid email format, empty rows, missing header — shown in error table; nothing sent
- **Per-email (post-send):** Clerk errors (already invited, already member) captured per email and shown in results table
- **Action-level:** Auth failure, org not found — returned as `{ success: false, error }` before any invitations sent

## Auth

- Trainer flow: `auth()` → `dbUser.role === "TRAINER"` → `dbUser.clerkOrgId` (same guards as `inviteClientAction`)
- Admin flow: `requireSuperAdmin()` guard; `clerkOrgId` passed from UI

## Out of scope

- Inviting TRAINER role via CSV (admin can do this via single invite)
- Dry-run / validate-only mode
- Progress bar for large CSVs (sequential send is fast enough for typical batch sizes)
