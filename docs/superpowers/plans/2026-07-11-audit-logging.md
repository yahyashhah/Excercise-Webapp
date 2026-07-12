# Audit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated audit log that records high-value actions (auth, user management, clinical notes, programs, global programs, exercises, clinic settings) and surface it as a platform-wide view in the super admin panel and a clinic-scoped view for trainers.

**Architecture:** A single `AuditLog` Prisma model + a small service layer (`lib/services/audit-log.service.ts`) exposing `logAudit()` (write) and `getAuditLogs()` (paginated read). `logAudit()` is called explicitly from ~10 existing server actions/webhook handlers after their mutation succeeds — no generic interception. Two thin page-level UIs (`app/admin/audit-log`, `app/(platform)/settings/audit-log`) share one presentational table component.

**Tech Stack:** Next.js App Router server actions, Prisma (MongoDB provider), Clerk (auth + webhooks via svix), Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-07-11-audit-logging-design.md`

## Global Constraints

- DB is MongoDB via Prisma — ids use `@id @default(auto()) @map("_id") @db.ObjectId`. Push schema changes with `npx prisma db push` (matches existing `db:push` script), not migrations.
- `logAudit()` must never throw to its caller — wrap the Prisma write in try/catch, `console.error` on failure, and always return normally so the underlying business action can't be broken by a logging failure.
- **Clinical notes contain PHI.** `CLINICAL_NOTE_*` audit entries must NOT include field text (subjective/objective/assessment/plan/privateNotes) in `metadata` — only a `changedFields: string[]` list of which fields changed, never their values. All other entity types (programs, exercises, clinic settings) may include full before/after values since they're non-health metadata.
- Every instrumented action's existing return shape (`{ success, error? }` etc.) and existing behavior on failure must be unchanged — audit logging is additive only.
- Test framework is Vitest (`npm run test`, config already present). Follow the existing mocking convention seen in `actions/__tests__/admin-actions.test.ts`: `vi.mock('@/lib/prisma', () => ({ prisma: { <model>: { <method>: vi.fn() } } }))`.
- Use `@/` path alias for all imports, matching the rest of the codebase.

---

### Task 1: Prisma schema — `AuditLog` model

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `AuditActorType` enum (`SUPER_ADMIN | TRAINER | CLIENT | SYSTEM`) and `AuditLog` model, both consumed by Task 2's service layer.

- [ ] **Step 1: Add the enum and model**

Add near the other enums (after `enum ExerciseSource { ... }`, around line 104):

```prisma
enum AuditActorType {
  SUPER_ADMIN
  TRAINER
  CLIENT
  SYSTEM
}
```

Add as a new top-level model (e.g. after the `User` model block):

```prisma
model AuditLog {
  id          String         @id @default(auto()) @map("_id") @db.ObjectId
  createdAt   DateTime       @default(now())

  actorId     String?        @db.ObjectId
  actorType   AuditActorType
  actorName   String

  action      String
  targetType  String?
  targetId    String?
  targetLabel String?

  orgId       String?
  metadata    Json?

  @@index([orgId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

`actorId` is `@db.ObjectId` since it always references a local `User.id`. `targetId` is a plain `String` (no `@db.ObjectId`) because it's a polymorphic, non-relational reference to whatever entity was acted on (`Program`, `Exercise`, `ClinicalNote`, `User`) — there is no Prisma `@relation` here by design, so it doesn't need the Mongo type annotation.

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma format && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

Run: `npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 3: Verify the new types are importable**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no new errors related to `AuditLog`/`AuditActorType` (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add AuditLog model for audit logging"
```

---

### Task 2: Audit log service layer

**Files:**
- Create: `lib/services/audit-log.service.ts`
- Test: `lib/services/__tests__/audit-log.service.test.ts`

**Interfaces:**
- Consumes: `prisma.auditLog` (Task 1), `AuditActorType`/`User` types from `@prisma/client`.
- Produces (consumed by every later task):
  - `AUDIT_ACTIONS` const object and `AuditAction` type
  - `logAudit(params: LogAuditParams): Promise<void>`
  - `deriveActorType(user: { role: "TRAINER" | "CLIENT"; email: string }): AuditActorType`
  - `diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: (keyof T)[]): { before: Partial<T>; after: Partial<T> } | undefined`
  - `getAuditLogs(params: GetAuditLogsParams): Promise<{ entries: AuditLog[]; total: number; page: number; pageSize: number; totalPages: number }>`

- [ ] **Step 1: Write the failing tests**

Create `lib/services/__tests__/audit-log.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  logAudit,
  diffFields,
  deriveActorType,
  getAuditLogs,
  AUDIT_ACTIONS,
} from '../audit-log.service'

const mockCreate = vi.mocked(prisma.auditLog.create)
const mockFindMany = vi.mocked(prisma.auditLog.findMany)
const mockCount = vi.mocked(prisma.auditLog.count)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logAudit', () => {
  it('writes an audit log row with the given fields', async () => {
    mockCreate.mockResolvedValue({} as never)
    await logAudit({
      actorId: 'user_1',
      actorType: 'TRAINER',
      actorName: 'Jane Doe',
      action: AUDIT_ACTIONS.PROGRAM_CREATED,
      targetType: 'Program',
      targetId: 'prog_1',
      targetLabel: 'Shoulder Rehab',
      orgId: 'org_1',
      metadata: { foo: 'bar' },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user_1',
        actorType: 'TRAINER',
        actorName: 'Jane Doe',
        action: 'PROGRAM_CREATED',
        targetType: 'Program',
        targetId: 'prog_1',
        targetLabel: 'Shoulder Rehab',
        orgId: 'org_1',
        metadata: { foo: 'bar' },
      },
    })
  })

  it('never throws when the write fails', async () => {
    mockCreate.mockRejectedValue(new Error('db down'))
    await expect(
      logAudit({ actorType: 'SYSTEM', actorName: 'System', action: 'LOGIN' })
    ).resolves.toBeUndefined()
  })
})

describe('diffFields', () => {
  it('returns only changed keys', () => {
    const before = { name: 'Old', status: 'DRAFT', unchanged: 'x' }
    const after = { name: 'New', status: 'DRAFT' }
    const diff = diffFields(before, after, ['name', 'status'])
    expect(diff).toEqual({ before: { name: 'Old' }, after: { name: 'New' } })
  })

  it('returns undefined when nothing changed', () => {
    const before = { name: 'Same' }
    const after = { name: 'Same' }
    expect(diffFields(before, after, ['name'])).toBeUndefined()
  })
})

describe('deriveActorType', () => {
  const originalEnv = process.env.SUPER_ADMIN_EMAILS
  afterEach(() => { process.env.SUPER_ADMIN_EMAILS = originalEnv })

  it('returns SUPER_ADMIN when email is in the allowlist', () => {
    process.env.SUPER_ADMIN_EMAILS = 'admin@example.com'
    expect(deriveActorType({ role: 'TRAINER', email: 'ADMIN@example.com' })).toBe('SUPER_ADMIN')
  })

  it('falls back to role otherwise', () => {
    process.env.SUPER_ADMIN_EMAILS = ''
    expect(deriveActorType({ role: 'TRAINER', email: 'trainer@example.com' })).toBe('TRAINER')
    expect(deriveActorType({ role: 'CLIENT', email: 'client@example.com' })).toBe('CLIENT')
  })
})

describe('getAuditLogs', () => {
  it('paginates and scopes by orgId', async () => {
    mockFindMany.mockResolvedValue([{ id: '1' }] as never)
    mockCount.mockResolvedValue(1)

    const result = await getAuditLogs({ orgId: 'org_1', page: 2, pageSize: 10 })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    })
    expect(result).toEqual({ entries: [{ id: '1' }], total: 1, page: 2, pageSize: 10, totalPages: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/audit-log.service.test.ts`
Expected: FAIL — `Cannot find module '../audit-log.service'`

- [ ] **Step 3: Implement the service**

Create `lib/services/audit-log.service.ts`:

```ts
import { prisma } from "@/lib/prisma";
import type { AuditActorType, Prisma } from "@prisma/client";

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  USER_INVITED: "USER_INVITED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USER_REACTIVATED: "USER_REACTIVATED",
  USER_DELETED: "USER_DELETED",
  CLINICAL_NOTE_CREATED: "CLINICAL_NOTE_CREATED",
  CLINICAL_NOTE_UPDATED: "CLINICAL_NOTE_UPDATED",
  CLINICAL_NOTE_DELETED: "CLINICAL_NOTE_DELETED",
  PROGRAM_CREATED: "PROGRAM_CREATED",
  PROGRAM_UPDATED: "PROGRAM_UPDATED",
  PROGRAM_DELETED: "PROGRAM_DELETED",
  GLOBAL_PROGRAM_CREATED: "GLOBAL_PROGRAM_CREATED",
  GLOBAL_PROGRAM_UPDATED: "GLOBAL_PROGRAM_UPDATED",
  GLOBAL_PROGRAM_DELETED: "GLOBAL_PROGRAM_DELETED",
  EXERCISE_CREATED: "EXERCISE_CREATED",
  EXERCISE_UPDATED: "EXERCISE_UPDATED",
  EXERCISE_DELETED: "EXERCISE_DELETED",
  CLINIC_SETTINGS_UPDATED: "CLINIC_SETTINGS_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface LogAuditParams {
  actorId?: string | null;
  actorType: AuditActorType;
  actorName: string;
  action: AuditAction | string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  orgId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorType: params.actorType,
        actorName: params.actorName,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetLabel: params.targetLabel,
        orgId: params.orgId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log entry:", error, params);
  }
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[]
): { before: Partial<T>; after: Partial<T> } | undefined {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  let hasChanges = false;

  for (const key of keys) {
    if (key in after && after[key] !== before[key]) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
      hasChanges = true;
    }
  }

  return hasChanges ? { before: changedBefore, after: changedAfter } : undefined;
}

export function deriveActorType(user: { role: "TRAINER" | "CLIENT"; email: string }): AuditActorType {
  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.includes(user.email.toLowerCase())) return "SUPER_ADMIN";
  return user.role === "TRAINER" ? "TRAINER" : "CLIENT";
}

export interface GetAuditLogsParams {
  orgId?: string;
  actorId?: string;
  action?: string;
  targetType?: string;
  actorNameSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export async function getAuditLogs(params: GetAuditLogsParams) {
  const {
    orgId,
    actorId,
    action,
    targetType,
    actorNameSearch,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 25,
  } = params;

  const where = {
    ...(orgId && { orgId }),
    ...(actorId && { actorId }),
    ...(action && { action }),
    ...(targetType && { targetType }),
    ...(actorNameSearch && {
      actorName: { contains: actorNameSearch, mode: "insensitive" as const },
    }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    }),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/audit-log.service.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add lib/services/audit-log.service.ts lib/services/__tests__/audit-log.service.test.ts
git commit -m "feat: add audit log service (logAudit/getAuditLogs)"
```

---

### Task 3: Clerk webhook — LOGIN/LOGOUT events

**Files:**
- Modify: `app/api/webhooks/clerk/route.ts`
- Test: `app/api/webhooks/clerk/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `deriveActorType`, `AUDIT_ACTIONS` from Task 2.
- Produces: nothing new for later tasks — this is a leaf instrumentation site.

**Note:** Clerk's `session.created`/`session.ended` webhook payloads do not include organization or Clerk-metadata context, so `orgId` is taken from the local `User.clerkOrgId` and `actorType` is derived from the local `User` row (`deriveActorType`) — a super admin granted access purely via Clerk `publicMetadata` (not the `SUPER_ADMIN_EMAILS` env var) will be recorded with their DB role instead of `SUPER_ADMIN` for login/logout events specifically. This is a known, accepted limitation (see spec's "Out of scope").

- [ ] **Step 1: Write the failing test**

Create `app/api/webhooks/clerk/__tests__/route.test.ts` (only covering the new session handling — assumes svix verification is mocked to pass through):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn((body: string) => JSON.parse(body)),
  })),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([
    ['svix-id', 'id'],
    ['svix-timestamp', 'ts'],
    ['svix-signature', 'sig'],
  ])),
}))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { deleteMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

process.env.CLERK_WEBHOOK_SECRET = 'test_secret'

import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuditCreate = vi.mocked(prisma.auditLog.create)

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('session webhook events', () => {
  it('logs LOGIN on session.created for a known user', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: 'org_1',
    } as never)

    await POST(makeRequest({ type: 'session.created', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user_1',
        actorType: 'TRAINER',
        action: 'LOGIN',
        orgId: 'org_1',
      }),
    })
  })

  it('logs LOGOUT on session.ended', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: null,
    } as never)

    await POST(makeRequest({ type: 'session.ended', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOGOUT' }),
    })
  })

  it('does nothing when the user is not found locally', async () => {
    mockFindUnique.mockResolvedValue(null)
    await POST(makeRequest({ type: 'session.created', data: { user_id: 'unknown' } }))
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/webhooks/clerk/__tests__/route.test.ts`
Expected: FAIL — no `session.created`/`session.ended` handling yet, `auditLog.create` never called.

- [ ] **Step 3: Implement the handler**

In `app/api/webhooks/clerk/route.ts`, add the import and new block right before the final `return new NextResponse("OK", { status: 200 });`:

```ts
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

```ts
  if (evt.type === "session.created" || evt.type === "session.ended") {
    const sessionData = evt.data as { user_id?: string };
    const clerkUserId = sessionData.user_id;

    if (clerkUserId) {
      const dbUser = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
      if (dbUser) {
        await logAudit({
          actorId: dbUser.id,
          actorType: deriveActorType(dbUser),
          actorName: `${dbUser.firstName} ${dbUser.lastName}`,
          action: evt.type === "session.created" ? AUDIT_ACTIONS.LOGIN : AUDIT_ACTIONS.LOGOUT,
          orgId: dbUser.clerkOrgId,
        });
      }
    }
  }
```

`evt.type` comparisons use the SDK's `WebhookEvent` union type as-is; if TypeScript flags `"session.created"`/`"session.ended"` as not part of that union (SDK version dependent), widen the check with `(evt.type as string)` on both sides of each `===` instead of changing the payload handling logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/webhooks/clerk/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/clerk/route.ts app/api/webhooks/clerk/__tests__/route.test.ts
git commit -m "feat: log LOGIN/LOGOUT audit events from Clerk session webhooks"
```

---

### Task 4: Instrument user management actions (`admin-actions.ts`)

**Files:**
- Modify: `actions/admin-actions.ts`
- Modify: `actions/__tests__/admin-actions.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `deriveActorType`, `AUDIT_ACTIONS` from Task 2. `requireSuperAdmin()` already returns the acting `User`.

- [ ] **Step 1: Extend the failing tests**

Add to `actions/__tests__/admin-actions.test.ts` (extend the existing mocks and add assertions):

```ts
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'SUPER_ADMIN'),
  AUDIT_ACTIONS: {
    USER_DEACTIVATED: 'USER_DEACTIVATED',
    USER_REACTIVATED: 'USER_REACTIVATED',
    USER_DELETED: 'USER_DELETED',
  },
}))
```
Add this mock alongside the existing `vi.mock` calls at the top of the file, and update `prisma.user` mock to include `findUnique` (needed to fetch the target user for `targetLabel`/`orgId`):

```ts
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
```

Then add, importing `logAudit` at the top:

```ts
import { logAudit } from '@/lib/services/audit-log.service'
const mockLogAudit = vi.mocked(logAudit)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
```

And inside `beforeEach`, mock a target user lookup used by all three actions:

```ts
mockUserFindUnique.mockResolvedValue({
  id: 'user_1', firstName: 'Sam', lastName: 'Client', email: 'sam@example.com',
  role: 'CLIENT', clerkOrgId: 'org_9',
} as any)
```

Add one assertion per `describe` block, e.g. inside `archiveUserAction`'s success test:

```ts
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_DEACTIVATED',
      targetType: 'User',
      targetId: 'user_1',
      orgId: 'org_9',
    }))
```
(mirror for `restoreUserAction` → `USER_REACTIVATED` and `deleteUserAction` → `USER_DELETED`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/admin-actions.test.ts`
Expected: FAIL — `logAudit` not called yet.

- [ ] **Step 3: Implement instrumentation**

Rewrite `actions/admin-actions.ts`:

```ts
"use server";

import type { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

async function logUserAction(action: string, admin: { id: string; firstName: string; lastName: string; email: string; role: "TRAINER" | "CLIENT" }, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  await logAudit({
    actorId: admin.id,
    actorType: deriveActorType(admin),
    actorName: `${admin.firstName} ${admin.lastName}`,
    action,
    targetType: "User",
    targetId: userId,
    targetLabel: target ? `${target.firstName} ${target.lastName}` : undefined,
    orgId: target?.clerkOrgId ?? null,
  });
}

export async function archiveUserAction(userId: string) {
  try {
    const admin = await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await logUserAction(AUDIT_ACTIONS.USER_DEACTIVATED, admin, userId);
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function restoreUserAction(userId: string) {
  try {
    const admin = await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    await logUserAction(AUDIT_ACTIONS.USER_REACTIVATED, admin, userId);
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    const admin = await requireSuperAdmin();
    await logUserAction(AUDIT_ACTIONS.USER_DELETED, admin, userId);
    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    const isPrismaRelationError =
      e instanceof Error &&
      "code" in e &&
      (e as Prisma.PrismaClientKnownRequestError).code?.startsWith("P2");
    const msg = isPrismaRelationError
      ? "Cannot delete: this user has existing data. Archive them instead."
      : "Failed to delete user.";
    return { success: false as const, error: msg };
  }
}
```

Note `deleteUserAction` logs *before* deleting (so the `findUnique` inside `logUserAction` can still find the target user's name/org).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/admin-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/admin-actions.ts actions/__tests__/admin-actions.test.ts
git commit -m "feat: log audit events for user archive/restore/delete"
```

---

### Task 5: Instrument clinical note actions

**Files:**
- Modify: `lib/services/clinical-note.service.ts`
- Modify: `actions/clinical-note-actions.ts`
- Create: `lib/services/__tests__/clinical-note.service.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `AUDIT_ACTIONS`, `deriveActorType` from Task 2.
- Per the Global Constraints privacy rule, metadata for these three actions is `{ changedFields: string[] }` only — never field values.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/__tests__/clinical-note.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clinicalNote: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  AUDIT_ACTIONS: {
    CLINICAL_NOTE_CREATED: 'CLINICAL_NOTE_CREATED',
    CLINICAL_NOTE_UPDATED: 'CLINICAL_NOTE_UPDATED',
    CLINICAL_NOTE_DELETED: 'CLINICAL_NOTE_DELETED',
  },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { createNote, updateNote, deleteNote } from '../clinical-note.service'

const mockCreate = vi.mocked(prisma.clinicalNote.create)
const mockUpdate = vi.mocked(prisma.clinicalNote.update)
const mockDelete = vi.mocked(prisma.clinicalNote.delete)
const mockFindUnique = vi.mocked(prisma.clinicalNote.findUnique)
const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

describe('createNote', () => {
  it('logs CLINICAL_NOTE_CREATED with no field values in metadata', async () => {
    mockCreate.mockResolvedValue({ id: 'note_1', clientId: 'client_1' } as never)
    await createNote({
      clientId: 'client_1', trainerId: 'trainer_1', appointmentDate: new Date(),
      subjective: 'pain', trainerOrgId: 'org_1',
    } as never)

    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CLINICAL_NOTE_CREATED',
      targetType: 'ClinicalNote',
      targetId: 'note_1',
    }))
    const call = mockLogAudit.mock.calls[0][0]
    expect(JSON.stringify(call.metadata ?? {})).not.toContain('pain')
  })
})

describe('updateNote', () => {
  it('logs only changed field names, never values', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'note_1', trainerId: 'trainer_1', clientId: 'client_1',
      subjective: 'old pain', objective: 'same',
    } as never)
    mockUpdate.mockResolvedValue({ id: 'note_1' } as never)

    await updateNote('note_1', 'trainer_1', { subjective: 'new pain', objective: 'same' }, 'org_1')

    const call = mockLogAudit.mock.calls[0][0]
    expect(call.metadata).toEqual({ changedFields: ['subjective'] })
  })
})

describe('deleteNote', () => {
  it('logs CLINICAL_NOTE_DELETED before deleting', async () => {
    mockFindUnique.mockResolvedValue({ id: 'note_1', trainerId: 'trainer_1', clientId: 'client_1' } as never)
    mockDelete.mockResolvedValue({} as never)

    await deleteNote('note_1', 'trainer_1', 'org_1')

    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICAL_NOTE_DELETED' }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/clinical-note.service.test.ts`
Expected: FAIL — current `createNote`/`updateNote`/`deleteNote` don't call `logAudit` and don't accept a `trainerOrgId`/`orgId` param yet.

- [ ] **Step 3: Implement instrumentation**

Rewrite `lib/services/clinical-note.service.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { logAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

export interface CreateClinicalNoteData {
  clientId: string;
  trainerId: string;
  sessionId?: string;
  appointmentDate: Date;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  privateNotes?: string;
}

export type UpdateClinicalNoteData = Partial<
  Omit<CreateClinicalNoteData, "clientId" | "trainerId">
>;

const DIFFABLE_NOTE_FIELDS = ["subjective", "objective", "assessment", "plan", "privateNotes", "appointmentDate", "sessionId"] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getNotesForClient(
  clientId: string,
  trainerId: string
) {
  return prisma.clinicalNote.findMany({
    where: { clientId, trainerId },
    orderBy: { appointmentDate: "desc" },
  });
}

export async function getNoteById(id: string) {
  return prisma.clinicalNote.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createNote(
  data: CreateClinicalNoteData,
  actor: { id: string; name: string; actorType: "TRAINER" | "SUPER_ADMIN"; orgId: string | null }
) {
  const note = await prisma.clinicalNote.create({ data });
  await logAudit({
    actorId: actor.id,
    actorType: actor.actorType,
    actorName: actor.name,
    action: AUDIT_ACTIONS.CLINICAL_NOTE_CREATED,
    targetType: "ClinicalNote",
    targetId: note.id,
    orgId: actor.orgId,
  });
  return note;
}

export async function updateNote(
  id: string,
  trainerId: string,
  data: UpdateClinicalNoteData,
  actor: { name: string; actorType: "TRAINER" | "SUPER_ADMIN"; orgId: string | null }
) {
  // Ensure the trainer owns this note before allowing edits
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Note not found or access denied");
  }

  const changedFields = DIFFABLE_NOTE_FIELDS.filter(
    (key) => key in data && (data as Record<string, unknown>)[key] !== (existing as Record<string, unknown>)[key]
  );

  const updated = await prisma.clinicalNote.update({ where: { id }, data });

  await logAudit({
    actorId: trainerId,
    actorType: actor.actorType,
    actorName: actor.name,
    action: AUDIT_ACTIONS.CLINICAL_NOTE_UPDATED,
    targetType: "ClinicalNote",
    targetId: id,
    orgId: actor.orgId,
    metadata: changedFields.length ? { changedFields } : undefined,
  });

  return updated;
}

export async function deleteNote(
  id: string,
  trainerId: string,
  orgId: string | null,
  actor?: { name: string; actorType: "TRAINER" | "SUPER_ADMIN" }
) {
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Note not found or access denied");
  }

  await logAudit({
    actorId: trainerId,
    actorType: actor?.actorType ?? "TRAINER",
    actorName: actor?.name ?? "",
    action: AUDIT_ACTIONS.CLINICAL_NOTE_DELETED,
    targetType: "ClinicalNote",
    targetId: id,
    orgId,
  });

  return prisma.clinicalNote.delete({ where: { id } });
}
```

Update `actions/clinical-note-actions.ts` call sites to pass the actor info (trainer is always the actor for this domain today, so `actorType` is always `"TRAINER"`):

```ts
export async function createClinicalNoteAction(
  clientId: string,
  data: ClinicalNoteFormData
) {
  const trainer = await requireRole("TRAINER");

  if (!data.appointmentDate) {
    return { success: false as const, error: "Appointment date is required" };
  }

  try {
    const note = await noteService.createNote(
      {
        clientId,
        trainerId: trainer.id,
        sessionId: data.sessionId,
        appointmentDate: new Date(data.appointmentDate),
        subjective: data.subjective,
        objective: data.objective,
        assessment: data.assessment,
        plan: data.plan,
        privateNotes: data.privateNotes,
      },
      { id: trainer.id, name: `${trainer.firstName} ${trainer.lastName}`, actorType: "TRAINER", orgId: trainer.clerkOrgId }
    );
    revalidatePath(`/clients/${clientId}/progress`);
    return { success: true as const, data: note };
  } catch (error) {
    console.error("Failed to create clinical note:", error);
    return { success: false as const, error: "Failed to create clinical note" };
  }
}
```

Apply the analogous change to `updateClinicalNoteAction` (pass `trainer` actor info as the 4th arg to `updateNote`) and `deleteClinicalNoteAction` (pass `trainer.clerkOrgId` and `{ name, actorType: "TRAINER" }` to `deleteNote`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/clinical-note.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/clinical-note.service.ts actions/clinical-note-actions.ts lib/services/__tests__/clinical-note.service.test.ts
git commit -m "feat: log audit events for clinical note changes (field names only, no PHI)"
```

---

### Task 6: Instrument client invitations

**Files:**
- Modify: `actions/invite-client-action.ts`
- Modify: `actions/bulk-invite-action.ts`
- Test: `actions/__tests__/invite-client-action.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `AUDIT_ACTIONS`, `deriveActorType` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/invite-client-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: { createOrganizationInvitation: vi.fn().mockResolvedValue({}) },
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1',
        firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      }),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { USER_INVITED: 'USER_INVITED' },
}))

import { logAudit } from '@/lib/services/audit-log.service'
import { inviteClientAction } from '../invite-client-action'

const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

it('logs USER_INVITED on a successful invite', async () => {
  const result = await inviteClientAction('client@example.com')
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'USER_INVITED',
    orgId: 'org_1',
    targetLabel: 'client@example.com',
  }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/invite-client-action.test.ts`
Expected: FAIL — `logAudit` not called yet.

- [ ] **Step 3: Implement instrumentation**

In `actions/invite-client-action.ts`, add the import and a call right after the successful invitation:

```ts
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

```ts
    await client.organizations.createOrganizationInvitation({
      organizationId: dbUser.clerkOrgId,
      inviterUserId: userId,
      emailAddress: trimmedEmail,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
    });

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.USER_INVITED,
      targetType: "User",
      targetLabel: trimmedEmail,
      orgId: dbUser.clerkOrgId,
    });

    revalidatePath("/clients");
    return { success: true as const };
```

In `actions/bulk-invite-action.ts`, add the same import, and log per successful invite inside the loop, using whichever actor resolved the org (`isAdmin` branch has no `dbUser` fetched today — fetch one for the audit actor name):

```ts
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

Replace the `if (clerkOrgId) { ... }` branch to also capture an actor user, and log inside the loop:

```ts
  let orgId: string;
  let isAdmin = false;
  let actorUser: { id: string; firstName: string; lastName: string; email: string; role: "TRAINER" | "CLIENT" };

  if (clerkOrgId) {
    actorUser = await requireSuperAdmin(); // redirects if not authorized
    orgId = clerkOrgId;
    isAdmin = true;
  } else {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };
    if (dbUser.role !== "TRAINER") return { success: false, error: "Forbidden" };
    if (!dbUser.clerkOrgId) return { success: false, error: "Organization not set up" };
    orgId = dbUser.clerkOrgId;
    actorUser = dbUser;
  }
```

(add `import { requireSuperAdmin } from "@/lib/current-user";` — it's a superset of the existing bare `auth()` import already present in this file, keep both). Then inside the `for` loop, after `results.push({ email, success: true })`:

```ts
      await logAudit({
        actorId: actorUser.id,
        actorType: isAdmin ? "SUPER_ADMIN" : deriveActorType(actorUser),
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        action: AUDIT_ACTIONS.USER_INVITED,
        targetType: "User",
        targetLabel: email,
        orgId,
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/invite-client-action.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/invite-client-action.ts actions/bulk-invite-action.ts actions/__tests__/invite-client-action.test.ts
git commit -m "feat: log audit events for client invitations"
```

---

### Task 7: Instrument clinic/organization settings

**Files:**
- Modify: `actions/organization-actions.ts`
- Test: `actions/__tests__/organization-actions.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `diffFields`, `AUDIT_ACTIONS` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/organization-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: {
      getOrganization: vi.fn().mockResolvedValue({
        name: 'Old Name',
        publicMetadata: { tagline: 'Old tagline' },
      }),
      updateOrganization: vi.fn().mockResolvedValue({}),
    },
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1',
        firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      }),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  AUDIT_ACTIONS: { CLINIC_SETTINGS_UPDATED: 'CLINIC_SETTINGS_UPDATED' },
}))

import { logAudit } from '@/lib/services/audit-log.service'
import { saveOrganizationProfile } from '../organization-actions'

const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

it('logs CLINIC_SETTINGS_UPDATED with a before/after diff', async () => {
  const result = await saveOrganizationProfile({ organizationName: 'New Name', tagline: 'Old tagline' })
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'CLINIC_SETTINGS_UPDATED',
    orgId: 'org_1',
    metadata: { before: { organizationName: 'Old Name' }, after: { organizationName: 'New Name' } },
  }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/organization-actions.test.ts`
Expected: FAIL — `logAudit` not called yet.

- [ ] **Step 3: Implement instrumentation**

In `actions/organization-actions.ts`, add the import and capture the "before" profile prior to updating:

```ts
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

```ts
export async function saveOrganizationProfile(input: OrganizationMetadata) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Organization not set up" };

  if (!input.organizationName?.trim()) {
    return { success: false as const, error: "Organization name is required" };
  }

  try {
    const before = (await getOrganizationProfile()) ?? {} as OrganizationMetadata;

    const client = await clerkClient();
    await client.organizations.updateOrganization(dbUser.clerkOrgId, {
      name: input.organizationName.trim(),
      publicMetadata: {
        tagline: input.tagline ?? "",
        logoUrl: input.logoUrl ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        website: input.website ?? "",
        address: input.address ?? "",
      },
    });

    const diff = diffFields(
      before as unknown as Record<string, unknown>,
      input as unknown as Record<string, unknown>,
      ["organizationName", "tagline", "logoUrl", "phone", "email", "website", "address"]
    );

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.CLINIC_SETTINGS_UPDATED,
      targetType: "Organization",
      targetId: dbUser.clerkOrgId,
      orgId: dbUser.clerkOrgId,
      metadata: diff,
    });

    revalidatePath("/settings/organization");
    return { success: true as const };
  } catch (err) {
    console.error("Failed to save organization profile:", err);
    return { success: false as const, error: "Failed to save organization profile" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/organization-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/organization-actions.ts actions/__tests__/organization-actions.test.ts
git commit -m "feat: log audit events for clinic settings changes"
```

---

### Task 8: Instrument trainer program actions

**Files:**
- Modify: `actions/program-actions.ts`
- Test: `actions/__tests__/program-actions-audit.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `diffFields`, `deriveActorType`, `AUDIT_ACTIONS` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/program-actions-audit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  createProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'New Program' }),
  updateProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Updated', status: 'ACTIVE' }),
  deleteProgram: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (k in after && after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { PROGRAM_CREATED: 'PROGRAM_CREATED', PROGRAM_UPDATED: 'PROGRAM_UPDATED', PROGRAM_DELETED: 'PROGRAM_DELETED' },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { createProgramAction, updateProgramAction, deleteProgramAction } from '../program-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockLogAudit = vi.mocked(logAudit)

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('logs PROGRAM_CREATED', async () => {
  const result = await createProgramAction({ name: 'New Program' } as never)
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'PROGRAM_CREATED', targetType: 'Program', targetId: 'prog_1', orgId: 'org_1',
  }))
})

it('logs PROGRAM_UPDATED with a diff', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old', status: 'DRAFT' } as never)
  await updateProgramAction('prog_1', { name: 'Updated' } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('PROGRAM_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Old' }, after: { name: 'Updated' } })
})

it('logs PROGRAM_DELETED', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  await deleteProgramAction('prog_1')
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROGRAM_DELETED' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/program-actions-audit.test.ts`
Expected: FAIL — `logAudit` not called yet.

- [ ] **Step 3: Implement instrumentation**

In `actions/program-actions.ts`, add the import:

```ts
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

Update `createProgramAction`:

```ts
export async function createProgramAction(input: CreateProgramInput) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const program = await programService.createProgram(user.id, parsed.data);
    await logAudit({
      actorId: user.id,
      actorType: deriveActorType(user),
      actorName: `${user.firstName} ${user.lastName}`,
      action: AUDIT_ACTIONS.PROGRAM_CREATED,
      targetType: "Program",
      targetId: program.id,
      targetLabel: program.name,
      orgId: user.clerkOrgId,
    });
    revalidatePath("/programs");
    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to create program:", error);
    return { success: false as const, error: "Failed to create program" };
  }
}
```

Update `updateProgramAction` — expand the ownership-check `select` to include diffable fields, then diff after the update:

```ts
export async function updateProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { trainerId: true, name: true, description: true, status: true },
  });
  if (!program || program.trainerId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    const diff = diffFields(
      program as unknown as Record<string, unknown>,
      parsed.data as unknown as Record<string, unknown>,
      ["name", "description", "status"]
    );
    await logAudit({
      actorId: user.id,
      actorType: deriveActorType(user),
      actorName: `${user.firstName} ${user.lastName}`,
      action: AUDIT_ACTIONS.PROGRAM_UPDATED,
      targetType: "Program",
      targetId: programId,
      targetLabel: updated.name,
      orgId: user.clerkOrgId,
      metadata: diff,
    });
    revalidatePath("/programs");
    revalidatePath(`/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program:", error);
    return { success: false as const, error: "Failed to update program" };
  }
}
```

Update `deleteProgramAction`:

```ts
export async function deleteProgramAction(programId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { trainerId: true, name: true },
  });
  if (!program || program.trainerId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await logAudit({
      actorId: user.id,
      actorType: deriveActorType(user),
      actorName: `${user.firstName} ${user.lastName}`,
      action: AUDIT_ACTIONS.PROGRAM_DELETED,
      targetType: "Program",
      targetId: programId,
      targetLabel: program.name,
      orgId: user.clerkOrgId,
    });
    await programService.deleteProgram(programId);
    revalidatePath("/programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete program:", error);
    return { success: false as const, error: "Failed to delete program" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/program-actions-audit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/program-actions.ts actions/__tests__/program-actions-audit.test.ts
git commit -m "feat: log audit events for trainer program create/update/delete"
```

---

### Task 9: Instrument global & admin-managed program actions

**Files:**
- Modify: `actions/global-program-actions.ts`
- Modify: `actions/admin-program-actions.ts`
- Test: `actions/__tests__/global-program-actions-audit.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `diffFields`, `AUDIT_ACTIONS` from Task 2. `requireSuperAdmin()` returns the acting `User`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/global-program-actions-audit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const superAdmin = { id: 'admin_1', firstName: 'Ada', lastName: 'Min', email: 'admin@example.com', role: 'TRAINER', clerkOrgId: null }

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn().mockResolvedValue(superAdmin) }))
vi.mock('@/lib/prisma', () => ({ prisma: { program: { findUnique: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  createGlobalProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Global Program' }),
  updateGlobalProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Updated Global' }),
  deleteGlobalProgram: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (k in after && after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  AUDIT_ACTIONS: {
    GLOBAL_PROGRAM_CREATED: 'GLOBAL_PROGRAM_CREATED',
    GLOBAL_PROGRAM_UPDATED: 'GLOBAL_PROGRAM_UPDATED',
    GLOBAL_PROGRAM_DELETED: 'GLOBAL_PROGRAM_DELETED',
  },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { createGlobalProgramAction, updateGlobalProgramAction, deleteGlobalProgramAction } from '../global-program-actions'

const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

it('logs GLOBAL_PROGRAM_CREATED', async () => {
  await createGlobalProgramAction({ name: 'Global Program' } as never)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'GLOBAL_PROGRAM_CREATED', targetId: 'prog_1', orgId: null,
  }))
})

it('logs GLOBAL_PROGRAM_UPDATED with a diff', async () => {
  mockProgramFindUnique.mockResolvedValue({ name: 'Global Program', description: null, status: 'DRAFT' } as never)
  await updateGlobalProgramAction('prog_1', { name: 'Updated Global' } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('GLOBAL_PROGRAM_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Global Program' }, after: { name: 'Updated Global' } })
})

it('logs GLOBAL_PROGRAM_DELETED', async () => {
  mockProgramFindUnique.mockResolvedValue({ name: 'Global Program' } as never)
  await deleteGlobalProgramAction('prog_1')
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'GLOBAL_PROGRAM_DELETED' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/global-program-actions-audit.test.ts`
Expected: FAIL — `logAudit` not called yet.

- [ ] **Step 3: Implement instrumentation**

In `actions/global-program-actions.ts`, add the import and instrument the three actions:

```ts
import { logAudit, diffFields, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

```ts
export async function createGlobalProgramAction(input: CreateProgramInput) {
  const admin = await requireSuperAdmin();

  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const program = await programService.createGlobalProgram(parsed.data);
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.GLOBAL_PROGRAM_CREATED,
      targetType: "Program",
      targetId: program.id,
      targetLabel: program.name,
      orgId: null,
    });
    revalidatePath("/admin/global-programs");
    return { success: true as const, data: { id: program.id } };
  } catch (error) {
    console.error("Failed to create global program:", error);
    return { success: false as const, error: "Failed to create global program" };
  }
}

export async function updateGlobalProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  const admin = await requireSuperAdmin();

  const existing = await prisma.program.findUnique({
    where: { id: programId },
    select: { name: true, description: true, status: true },
  });

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateGlobalProgram(programId, parsed.data);
    const diff = existing
      ? diffFields(
          existing as unknown as Record<string, unknown>,
          parsed.data as unknown as Record<string, unknown>,
          ["name", "description", "status"]
        )
      : undefined;
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.GLOBAL_PROGRAM_UPDATED,
      targetType: "Program",
      targetId: updated.id,
      targetLabel: updated.name,
      orgId: null,
      metadata: diff,
    });
    revalidatePath("/admin/global-programs");
    revalidatePath(`/admin/global-programs/${programId}/edit`);
    return { success: true as const, data: { id: updated.id } };
  } catch (error) {
    console.error("Failed to update global program:", error);
    return { success: false as const, error: "Failed to update global program" };
  }
}
```

```ts
export async function deleteGlobalProgramAction(programId: string) {
  const admin = await requireSuperAdmin();

  const existing = await prisma.program.findUnique({ where: { id: programId }, select: { name: true } });

  try {
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.GLOBAL_PROGRAM_DELETED,
      targetType: "Program",
      targetId: programId,
      targetLabel: existing?.name,
      orgId: null,
    });
    await programService.deleteGlobalProgram(programId);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete global program:", error);
    return { success: false as const, error: "Failed to delete global program" };
  }
}
```

In `actions/admin-program-actions.ts` (a super admin editing a *non-global* program on a trainer's behalf), instrument `updateAdminProgramAction` as `PROGRAM_UPDATED` scoped to the target program's trainer's org:

```ts
import { logAudit, diffFields, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

```ts
export async function updateAdminProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  const admin = await requireSuperAdmin();

  const existing = await prisma.program.findUnique({
    where: { id: programId },
    select: { isGlobal: true, name: true, description: true, status: true, trainer: { select: { clerkOrgId: true } } },
  });
  if (!existing) {
    return { success: false as const, error: "Program not found" };
  }
  if (existing.isGlobal) {
    return {
      success: false as const,
      error: "Use the Global Programs section to edit this program",
    };
  }

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    const diff = diffFields(
      existing as unknown as Record<string, unknown>,
      parsed.data as unknown as Record<string, unknown>,
      ["name", "description", "status"]
    );
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.PROGRAM_UPDATED,
      targetType: "Program",
      targetId: programId,
      targetLabel: updated.name,
      orgId: existing.trainer?.clerkOrgId ?? null,
      metadata: diff,
    });
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program (admin):", error);
    return { success: false as const, error: "Failed to update program" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/global-program-actions-audit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/global-program-actions.ts actions/admin-program-actions.ts actions/__tests__/global-program-actions-audit.test.ts
git commit -m "feat: log audit events for global and admin-managed program changes"
```

---

### Task 10: Instrument exercise actions

**Files:**
- Modify: `actions/exercise-actions.ts`
- Modify: `actions/bulk-exercise-actions.ts`
- Test: `actions/__tests__/exercise-actions-audit.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `diffFields`, `deriveActorType`, `AUDIT_ACTIONS` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/exercise-actions-audit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' }) }))
vi.mock('@/lib/current-user', () => ({ isSuperAdmin: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, exercise: { findUnique: vi.fn() } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/exercise.service', () => ({
  createExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Squat' }),
  updateExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Squat Updated' }),
  deleteExercise: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/validators/exercise', () => ({
  createExerciseSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  updateExerciseSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (k in after && after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { EXERCISE_CREATED: 'EXERCISE_CREATED', EXERCISE_UPDATED: 'EXERCISE_UPDATED', EXERCISE_DELETED: 'EXERCISE_DELETED' },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { createExerciseAction, updateExerciseAction, deleteExerciseAction } from '../exercise-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockExerciseFindUnique = vi.mocked(prisma.exercise.findUnique)
const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('logs EXERCISE_CREATED', async () => {
  await createExerciseAction({ name: 'Squat', bodyRegion: 'KNEE', equipmentRequired: [], difficultyLevel: 'BEGINNER', contraindications: [] } as never)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXERCISE_CREATED', targetId: 'ex_1' }))
})

it('logs EXERCISE_UPDATED with a diff', async () => {
  mockExerciseFindUnique.mockResolvedValue({ name: 'Squat', bodyRegion: 'KNEE', difficultyLevel: 'BEGINNER', isPublic: true, source: 'ORGANIZATION', organizationId: 'org_1' } as never)
  await updateExerciseAction('ex_1', { name: 'Squat Updated' })
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('EXERCISE_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Squat' }, after: { name: 'Squat Updated' } })
})

it('logs EXERCISE_DELETED', async () => {
  mockExerciseFindUnique.mockResolvedValue({ id: 'ex_1', name: 'Squat', source: 'ORGANIZATION', organizationId: 'org_1' } as never)
  await deleteExerciseAction('ex_1')
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXERCISE_DELETED' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/exercise-actions-audit.test.ts`
Expected: FAIL — `logAudit` not called yet.

- [ ] **Step 3: Implement instrumentation**

In `actions/exercise-actions.ts`, add the import:

```ts
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

In `createExerciseAction`, after the exercise is created:

```ts
      const exercise = await exerciseService.createExercise({
        ...parsed.data,
        bodyRegion: parsed.data.bodyRegion as BodyRegion,
        difficultyLevel: parsed.data.difficultyLevel as DifficultyLevel,
        videoUrl: parsed.data.videoUrl || undefined,
        videoProvider: parsed.data.videoProvider || undefined,
        createdById: dbUser.id,
        source: organizationOrgId ? "ORGANIZATION" : "UNIVERSAL",
        organizationId: organizationOrgId ?? undefined,
        isPublic: parsed.data.isPublic ?? true,
      });

      await logAudit({
        actorId: dbUser.id,
        actorType: deriveActorType(dbUser),
        actorName: `${dbUser.firstName} ${dbUser.lastName}`,
        action: AUDIT_ACTIONS.EXERCISE_CREATED,
        targetType: "Exercise",
        targetId: exercise.id,
        targetLabel: exercise.name,
        orgId: organizationOrgId,
      });

      revalidatePath("/exercises");
      return { success: true as const, data: exercise };
```

In `updateExerciseAction`, fetch the existing exercise before updating for the diff and org scope:

```ts
export async function updateExerciseAction(
  exerciseId: string,
  input: Record<string, unknown>
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const existing = await prisma.exercise.findUnique({ where: { id: exerciseId } });

  const parsed = updateExerciseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const exercise = await exerciseService.updateExercise(exerciseId, parsed.data as Parameters<typeof exerciseService.updateExercise>[1]);
    const diff = existing
      ? diffFields(
          existing as unknown as Record<string, unknown>,
          parsed.data as unknown as Record<string, unknown>,
          ["name", "bodyRegion", "difficultyLevel", "isPublic"]
        )
      : undefined;
    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_UPDATED,
      targetType: "Exercise",
      targetId: exerciseId,
      targetLabel: exercise.name,
      orgId: existing?.organizationId ?? null,
      metadata: diff,
    });
    revalidatePath("/exercises");
    revalidatePath(`/exercises/${exerciseId}`);
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to update exercise:", error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}
```

In `deleteExerciseAction`, log using the `exercise` already fetched for the authorization check, before deleting:

```ts
  try {
    await logAudit({
      actorId: dbUser.id,
      actorType: superAdmin ? "SUPER_ADMIN" : deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_DELETED,
      targetType: "Exercise",
      targetId: exerciseId,
      targetLabel: exercise.name,
      orgId: exercise.organizationId ?? null,
    });
    await exerciseService.deleteExercise(exerciseId);
    revalidatePath("/exercises");
    revalidatePath("/admin/exercises");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete exercise:", error);
    return { success: false as const, error: "Failed to delete exercise" };
  }
```

In `actions/bulk-exercise-actions.ts`, add one summary `EXERCISE_CREATED` entry per bulk operation (not one per row, to avoid flooding the log) — add the import and, after each successful `prisma.$transaction` call:

```ts
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
```

In `bulkCreateExercisesAction`, after `const created = await prisma.$transaction(...)`:

```ts
    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_CREATED,
      targetType: "Exercise",
      orgId: dbUser.clerkOrgId,
      metadata: { count: created.length, names: created.slice(0, 20).map((e) => e.name) },
    });
```

In `importExercisesFromCsvAction`, after its own `const created = await prisma.$transaction(...)`:

```ts
    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_CREATED,
      targetType: "Exercise",
      orgId: dbUser.clerkOrgId,
      metadata: { count: created.length, names: created.slice(0, 20).map((e) => e.name), source: "csv_import" },
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/exercise-actions-audit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/exercise-actions.ts actions/bulk-exercise-actions.ts actions/__tests__/exercise-actions-audit.test.ts
git commit -m "feat: log audit events for exercise create/update/delete and bulk import"
```

---

### Task 11: Super admin audit log page

**Files:**
- Create: `app/admin/audit-log/page.tsx`
- Create: `components/audit-log/audit-log-table.tsx`
- Modify: `components/admin/admin-sidebar.tsx`
- Modify: `lib/services/admin.service.ts`
- Test: `lib/services/__tests__/admin.service.test.ts` (extend)

**Interfaces:**
- Consumes: `getAuditLogs` from Task 2.
- Produces: `AuditLogTable` component (also consumed by Task 12).

- [ ] **Step 1: Write the failing test**

Add to `lib/services/__tests__/admin.service.test.ts` (append; follow the existing file's mocking style — check the current mocks first and extend `prisma` with `auditLog`):

```ts
describe('getTrainersForOrgFilter reuse for audit log org dropdown', () => {
  it('is exported and callable', () => {
    expect(typeof getTrainersForOrgFilter).toBe('function')
  })
})
```

(This module doesn't need new logic of its own — `getAuditLogs` already lives in `audit-log.service.ts` from Task 2. This step just confirms `getTrainersForOrgFilter`, already used by `/admin/users`, is reusable for the audit log page's org filter dropdown — skip adding new service code here.)

- [ ] **Step 2: Build the shared table component**

Create `components/audit-log/audit-log-table.tsx`:

```tsx
import { format } from "date-fns";
import type { AuditLog } from "@prisma/client";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Logged in",
  LOGOUT: "Logged out",
  USER_INVITED: "Invited user",
  USER_DEACTIVATED: "Deactivated user",
  USER_REACTIVATED: "Reactivated user",
  USER_DELETED: "Deleted user",
  CLINICAL_NOTE_CREATED: "Created clinical note",
  CLINICAL_NOTE_UPDATED: "Updated clinical note",
  CLINICAL_NOTE_DELETED: "Deleted clinical note",
  PROGRAM_CREATED: "Created program",
  PROGRAM_UPDATED: "Updated program",
  PROGRAM_DELETED: "Deleted program",
  GLOBAL_PROGRAM_CREATED: "Created global program",
  GLOBAL_PROGRAM_UPDATED: "Updated global program",
  GLOBAL_PROGRAM_DELETED: "Deleted global program",
  EXERCISE_CREATED: "Created exercise(s)",
  EXERCISE_UPDATED: "Updated exercise",
  EXERCISE_DELETED: "Deleted exercise",
  CLINIC_SETTINGS_UPDATED: "Updated clinic settings",
};

interface AuditLogTableProps {
  entries: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
  basePath: string;
  queryString: string; // current filters, without page — e.g. "action=LOGIN&search=jane"
}

export function AuditLogTable({ entries, total, page, totalPages, basePath, queryString }: AuditLogTableProps) {
  const withPage = (p: number) => `${basePath}?${queryString ? queryString + "&" : ""}page=${p}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">When</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Actor</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Action</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium text-foreground">{entry.actorName}</p>
                  <p className="text-xs text-muted-foreground">{entry.actorType}</p>
                </td>
                <td className="px-5 py-3 text-foreground">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {entry.targetLabel ?? entry.targetId ?? <span className="italic">—</span>}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No audit log entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total.toLocaleString()} entries
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={withPage(page - 1)} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a href={withPage(page + 1)} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build the super admin page**

Create `app/admin/audit-log/page.tsx`:

```tsx
import { getAuditLogs } from "@/lib/services/audit-log.service";
import { getTrainersForOrgFilter } from "@/lib/services/admin.service";
import { AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PageProps {
  searchParams: Promise<{ action?: string; org?: string; page?: string }>;
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const action = params.action && params.action !== "ALL" ? params.action : undefined;
  const orgId = params.org && params.org !== "ALL" ? params.org : undefined;
  const page = parseInt(params.page ?? "1", 10);

  const [{ entries, total, totalPages }, trainersForFilter] = await Promise.all([
    getAuditLogs({ action, orgId, page, pageSize: 25 }),
    getTrainersForOrgFilter(),
  ]);

  const queryString = [
    action ? `action=${action}` : "",
    orgId ? `org=${orgId}` : "",
  ].filter(Boolean).join("&");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide activity across all clinics.</p>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <Select name="action" defaultValue={action ?? "ALL"}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {Object.values(AUDIT_ACTIONS).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="org" defaultValue={orgId ?? "ALL"}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All organizations</SelectItem>
            {trainersForFilter.map((t) => (
              <SelectItem key={t.clerkOrgId!} value={t.clerkOrgId!}>{t.firstName} {t.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <AuditLogTable
        entries={entries}
        total={total}
        page={page}
        totalPages={totalPages}
        basePath="/admin/audit-log"
        queryString={queryString}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add the sidebar nav link**

In `components/admin/admin-sidebar.tsx`, import `ScrollText` from `lucide-react` and add a row to `adminLinks`:

```ts
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Dumbbell,
  Library,
  Shield,
  ExternalLink,
  Globe,
  ScrollText,
} from "lucide-react";

const adminLinks = [
  { href: "/admin",                  label: "Overview",        icon: LayoutDashboard, exact: true },
  { href: "/admin/users",            label: "Users",           icon: Users },
  { href: "/admin/analytics",        label: "Analytics",       icon: BarChart3 },
  { href: "/admin/exercises",        label: "Exercises",       icon: Dumbbell },
  { href: "/admin/programs",         label: "All Programs",    icon: Library },
  { href: "/admin/global-programs",  label: "Global Programs", icon: Globe },
  { href: "/admin/audit-log",        label: "Audit Log",       icon: ScrollText },
];
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, sign in as a super admin, visit `/admin/audit-log`.
Expected: page renders with filters and an (initially empty, until later tasks generate entries) table, no console errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/audit-log/page.tsx components/audit-log/audit-log-table.tsx components/admin/admin-sidebar.tsx lib/services/__tests__/admin.service.test.ts
git commit -m "feat: add super admin audit log page"
```

---

### Task 12: Trainer-scoped audit log page

**Files:**
- Create: `app/(platform)/settings/audit-log/page.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/header.tsx`

**Interfaces:**
- Consumes: `getAuditLogs` from Task 2, `AuditLogTable` from Task 11, `requireRole` from `lib/current-user.ts`.

- [ ] **Step 1: Build the trainer page**

Create `app/(platform)/settings/audit-log/page.tsx`:

```tsx
import { requireRole } from "@/lib/current-user";
import { getAuditLogs, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PageProps {
  searchParams: Promise<{ action?: string; page?: string }>;
}

export default async function TrainerAuditLogPage({ searchParams }: PageProps) {
  const trainer = await requireRole("TRAINER");
  const params = await searchParams;
  const action = params.action && params.action !== "ALL" ? params.action : undefined;
  const page = parseInt(params.page ?? "1", 10);

  const { entries, total, totalPages } = await getAuditLogs({
    orgId: trainer.clerkOrgId ?? undefined,
    action,
    page,
    pageSize: 25,
  });

  const queryString = action ? `action=${action}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Activity across your clinic.</p>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <Select name="action" defaultValue={action ?? "ALL"}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {Object.values(AUDIT_ACTIONS).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <AuditLogTable
        entries={entries}
        total={total}
        page={page}
        totalPages={totalPages}
        basePath="/settings/audit-log"
        queryString={queryString}
      />
    </div>
  );
}
```

If `trainer.clerkOrgId` is `null` (org not set up yet), `getAuditLogs` receives `orgId: undefined`, which per Task 2's `where` builder omits the org filter entirely — **this would incorrectly show all orgs' entries**. Guard against it explicitly:

```tsx
  if (!trainer.clerkOrgId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set up your organization to see activity here.</p>
        </div>
      </div>
    );
  }
```

Insert this check immediately after `const trainer = await requireRole("TRAINER");`, before calling `getAuditLogs`.

- [ ] **Step 2: Add the sidebar nav link**

In `components/layout/sidebar.tsx`, import `History` from `lucide-react` (avoid reusing `Activity`, which is already the brand logo icon) and add the link next to Billing:

```ts
import {
  LayoutDashboard,
  Dumbbell,
  ClipboardList,
  Users,
  MessageSquare,
  BarChart3,
  Settings,
  Activity,
  Library,
  ClipboardCheck,
  Flame,
  TrendingUp,
  Shield,
  CreditCard,
  Mic,
  History,
} from "lucide-react";
```

```tsx
        {navItem("/settings", "Settings", Settings)}
        {role === "TRAINER" && navItem("/settings/billing", "Billing", CreditCard)}
        {role === "TRAINER" && navItem("/settings/audit-log", "Audit Log", History)}
```

Also add `"/settings/audit-log"` to the `accountHrefs` array (near the top of the component) so the "most specific wins" active-link logic picks it up:

```ts
  const accountHrefs = [
    "/settings",
    ...(role === "TRAINER" ? ["/settings/billing", "/settings/audit-log"] : []),
  ];
```

- [ ] **Step 3: Add the page title**

In `components/layout/header.tsx`, add to `exactMap`:

```ts
    "/settings/audit-log": "Audit Log",
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, sign in as a trainer, visit `/settings/audit-log`.
Expected: page renders scoped to the trainer's own org, sidebar shows "Audit Log" under Account, header shows "Audit Log" as the page title.

- [ ] **Step 5: Commit**

```bash
git add "app/(platform)/settings/audit-log/page.tsx" components/layout/sidebar.tsx components/layout/header.tsx
git commit -m "feat: add trainer-scoped audit log page"
```

---

### Task 13: End-to-end verification

**Files:** none (manual verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including every test file added in Tasks 2–10.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors introduced by this feature.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. As a trainer: invite a client, create/edit/delete a program, create/edit/delete an exercise, update clinic settings, add a clinical note. Then visit `/settings/audit-log` and confirm each action appears with a readable description and correct timestamp.

As a super admin: visit `/admin/audit-log`, confirm the same entries appear (unscoped), plus create/edit/delete a global program and confirm those appear with `orgId: null` (visible to super admin, correctly absent from any trainer's scoped view).

Sign out and back in as a trainer; confirm a `LOGIN`/`LOGOUT` pair appears (webhook-driven — requires `CLERK_WEBHOOK_SECRET` configured and the webhook endpoint reachable from Clerk, e.g. via `ngrok` in local dev, or test against a deployed preview).

- [ ] **Step 4: No commit for this task** — it's verification only.
