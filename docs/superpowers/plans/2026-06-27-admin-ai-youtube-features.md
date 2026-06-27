# Admin Panel + AI 1-Day + YouTube Org Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trainer-with-clients admin view + archive/delete, 1-day AI program preset + no-equipment toggle, and route trainer YouTube uploads to their org library.

**Architecture:** Admin panel gets schema + service + action + component layers following existing patterns. AI form changes are pure UI in one file. Bulk exercise action gets one conditional branch to route uploads by org.

**Tech Stack:** Next.js 15 App Router, Prisma (MongoDB), Clerk auth, Vitest, Tailwind CSS, base-ui/react (DropdownMenu, AlertDialog), sonner (toasts)

## Global Constraints

- MongoDB: use `npx prisma db push` (not `prisma migrate dev`) to sync schema
- Super admin guard: import `requireSuperAdmin` from `@/lib/current-user` — throws redirect if not admin
- Server actions: `"use server"` directive, return `{ success: true }` or `{ success: false, error: string }`
- Revalidate `/admin/users` after any user mutation via `revalidatePath("/admin/users")`
- Client components: `"use client"` directive; use `useTransition` for server action calls
- Toast notifications via `import { toast } from "sonner"`
- Test framework: Vitest — run with `npm test`, mock `@clerk/nextjs/server`, `@/lib/prisma`, `@/lib/current-user`, `next/cache`
- No `asChild` on `DropdownMenuTrigger` — pass `className` directly (base-ui render pattern)

---

### Task 1: Prisma Schema — Add isActive to User

**Files:**
- Modify: `prisma/schema.prisma` — add `isActive` field to `User` model

**Interfaces:**
- Produces: `User.isActive: boolean` available on all Prisma User queries

- [ ] **Step 1: Add isActive to the User model**

Open `prisma/schema.prisma`. Find the `User` model (starts around line 106). Add `isActive` after `onboarded`:

```prisma
model User {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  clerkId     String   @unique
  email       String   @unique
  firstName   String
  lastName    String
  role        UserRole
  phone       String?
  dateOfBirth String?
  imageUrl    String?
  clerkOrgId  String?
  onboarded   Boolean  @default(false)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  // ... relations unchanged
```

- [ ] **Step 2: Push schema to database**

```bash
npx prisma db push
```

Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected output: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors about `isActive` being unknown on `User`.

---

### Task 2: Admin Server Actions

**Files:**
- Create: `actions/admin-actions.ts`
- Create: `actions/__tests__/admin-actions.test.ts`

**Interfaces:**
- Produces:
  - `archiveUserAction(userId: string): Promise<{ success: true } | { success: false, error: string }>`
  - `restoreUserAction(userId: string): Promise<{ success: true } | { success: false, error: string }>`
  - `deleteUserAction(userId: string): Promise<{ success: true } | { success: false, error: string }>`

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/admin-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireSuperAdmin } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { archiveUserAction, restoreUserAction, deleteUserAction } from '../admin-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockUserUpdate = vi.mocked(prisma.user.update)
const mockUserDelete = vi.mocked(prisma.user.delete)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1' } as any)
})

describe('archiveUserAction', () => {
  it('sets isActive false and returns success', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    const result = await archiveUserAction('user_1')
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: false },
    })
    expect(result.success).toBe(true)
  })

  it('returns error when not super admin', async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error('Forbidden'))
    const result = await archiveUserAction('user_1')
    expect(result.success).toBe(false)
    expect((result as any).error).toBeDefined()
  })
})

describe('restoreUserAction', () => {
  it('sets isActive true and returns success', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    const result = await restoreUserAction('user_1')
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: true },
    })
    expect(result.success).toBe(true)
  })
})

describe('deleteUserAction', () => {
  it('hard deletes the user and returns success', async () => {
    mockUserDelete.mockResolvedValue({} as any)
    const result = await deleteUserAction('user_1')
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: 'user_1' } })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- admin-actions
```

Expected: FAIL — `Cannot find module '../admin-actions'`

- [ ] **Step 3: Create actions/admin-actions.ts**

```typescript
"use server";

import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function archiveUserAction(userId: string) {
  try {
    await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function restoreUserAction(userId: string) {
  try {
    await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    await requireSuperAdmin();
    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- admin-actions
```

Expected: 5 tests PASS.

---

### Task 3: Admin Service — includeArchived + getTrainersWithClients

**Files:**
- Modify: `lib/services/admin.service.ts`

**Interfaces:**
- Consumes: `prisma.user` with `isActive` field (Task 1)
- Produces:
  - `getAllUsers(params)` — `params` gains `includeArchived?: boolean` (default `false`); now includes `isActive` in select
  - `getTrainersWithClients(): Promise<TrainerWithClients[]>` — exported type + function
  - `TrainerWithClients` — exported interface

- [ ] **Step 1: Add includeArchived param to getAllUsers**

In `lib/services/admin.service.ts`, find the `getAllUsers` function. Update its params type and where clause:

```typescript
export async function getAllUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "TRAINER" | "CLIENT" | "ALL";
  includeArchived?: boolean;
}) {
  const { page = 1, pageSize = 20, search, role = "ALL", includeArchived = false } = params;

  const where = {
    ...(!includeArchived && { isActive: true }),
    ...(role !== "ALL" && { role }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };
```

Also add `isActive: true` to the `select` block inside `getAllUsers`:

```typescript
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      onboarded: true,
      isActive: true,         // add this line
      imageUrl: true,
      createdAt: true,
      clerkOrgId: true,
    },
```

- [ ] **Step 2: Add TrainerWithClients type and getTrainersWithClients function**

Append to the bottom of `lib/services/admin.service.ts`:

```typescript
export interface TrainerWithClients {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl: string | null;
  clerkOrgId: string | null;
  onboarded: boolean;
  isActive: boolean;
  createdAt: Date;
  clients: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl: string | null;
    onboarded: boolean;
    isActive: boolean;
    createdAt: Date;
  }>;
}

export async function getTrainersWithClients(): Promise<TrainerWithClients[]> {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      imageUrl: true,
      clerkOrgId: true,
      onboarded: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    trainers.map(async (trainer) => {
      const clients = trainer.clerkOrgId
        ? await prisma.user.findMany({
            where: { clerkOrgId: trainer.clerkOrgId, role: "CLIENT" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              imageUrl: true,
              onboarded: true,
              isActive: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : [];
      return { ...trainer, clients };
    })
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no type errors.

---

### Task 4: UserActionsMenu Client Component

**Files:**
- Create: `components/admin/user-actions-menu.tsx`

**Interfaces:**
- Consumes: `archiveUserAction`, `restoreUserAction`, `deleteUserAction` from `@/actions/admin-actions` (Task 2)
- Produces: `<UserActionsMenu userId isActive userName />` — renders `···` button with dropdown

- [ ] **Step 1: Create components/admin/user-actions-menu.tsx**

```typescript
"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Archive, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  archiveUserAction,
  restoreUserAction,
  deleteUserAction,
} from "@/actions/admin-actions";

interface UserActionsMenuProps {
  userId: string;
  isActive: boolean;
  userName: string;
}

export function UserActionsMenu({ userId, isActive, userName }: UserActionsMenuProps) {
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveUserAction(userId);
      if (result.success) toast.success("User archived.");
      else toast.error("Failed to archive user.");
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreUserAction(userId);
      if (result.success) toast.success("User restored.");
      else toast.error("Failed to restore user.");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUserAction(userId);
      if (result.success) toast.success("User permanently deleted.");
      else toast.error("Failed to delete user.");
      setShowDeleteDialog(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          disabled={isPending}
          aria-label="User actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-40">
          {isActive ? (
            <DropdownMenuItem
              onClick={handleArchive}
              className="gap-2 text-amber-600"
            >
              <Archive className="h-4 w-4" />
              Archive
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={handleRestore} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Restore
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => !open && setShowDeleteDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the user and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "user-actions-menu" | head -10
```

Expected: no errors.

---

### Task 5: Admin Users Page — Tabs + By Organization View + Actions Column

**Files:**
- Modify: `app/admin/users/page.tsx` — full rewrite
- Create: `components/admin/trainers-with-clients-table.tsx` — client component for expand/collapse

**Interfaces:**
- Consumes:
  - `getAllUsers` with `includeArchived` param (Task 3)
  - `getTrainersWithClients(): Promise<TrainerWithClients[]>` (Task 3)
  - `TrainerWithClients` type (Task 3)
  - `<UserActionsMenu userId isActive userName />` (Task 4)
- Produces: updated `/admin/users` page with two tabs and actions column

- [ ] **Step 1: Create TrainersWithClientsTable client component**

Create `components/admin/trainers-with-clients-table.tsx`:

```typescript
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrainerWithClients } from "@/lib/services/admin.service";
import { UserActionsMenu } from "@/components/admin/user-actions-menu";

interface Props {
  trainers: TrainerWithClients[];
}

function UserAvatar({ imageUrl, firstName, lastName }: { imageUrl: string | null; firstName: string; lastName: string }) {
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill className="object-cover" />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {firstName[0]}{lastName[0]}
        </span>
      )}
    </div>
  );
}

export function TrainersWithClientsTable({ trainers }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(trainers.map((t) => t.id))
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (trainers.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No trainers found.</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">User</th>
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Role</th>
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Status</th>
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Joined</th>
          <th className="px-5 py-3 w-10" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {trainers.map((trainer) => {
          const isExpanded = expanded.has(trainer.id);
          return (
            <React.Fragment key={trainer.id}>
              {/* Trainer row */}
              <tr
                className={`hover:bg-muted/40 transition-colors ${!trainer.isActive ? "opacity-50" : ""}`}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(trainer.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <UserAvatar imageUrl={trainer.imageUrl} firstName={trainer.firstName} lastName={trainer.lastName} />
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${!trainer.isActive ? "italic text-muted-foreground" : "text-foreground"}`}>
                        {trainer.firstName} {trainer.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{trainer.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600 text-[10px]">
                    Trainer · {trainer.clients.length} client{trainer.clients.length !== 1 ? "s" : ""}
                  </Badge>
                </td>
                <td className="px-5 py-3 hidden lg:table-cell">
                  {trainer.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Archived
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {format(new Date(trainer.createdAt), "MMM d, yyyy")}
                </td>
                <td className="px-5 py-3 text-right">
                  <UserActionsMenu
                    userId={trainer.id}
                    isActive={trainer.isActive}
                    userName={`${trainer.firstName} ${trainer.lastName}`}
                  />
                </td>
              </tr>

              {/* Client sub-rows */}
              {isExpanded && trainer.clients.map((client) => (
                <tr
                  key={`${trainer.id}-${client.id}`}
                  className={`bg-muted/20 hover:bg-muted/40 transition-colors ${!client.isActive ? "opacity-50" : ""}`}
                >
                  <td className="py-2.5 pr-5" style={{ paddingLeft: "3.5rem" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-px h-4 bg-border shrink-0" />
                      <UserAvatar imageUrl={client.imageUrl} firstName={client.firstName} lastName={client.lastName} />
                      <div className="min-w-0">
                        <p className={`font-medium text-sm truncate ${!client.isActive ? "italic text-muted-foreground" : "text-foreground"}`}>
                          {client.firstName} {client.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-600 text-[10px]">
                      Client
                    </Badge>
                  </td>
                  <td className="px-5 py-2.5 hidden lg:table-cell">
                    {client.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Archived
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(client.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <UserActionsMenu
                      userId={client.id}
                      isActive={client.isActive}
                      userName={`${client.firstName} ${client.lastName}`}
                    />
                  </td>
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Rewrite app/admin/users/page.tsx**

Replace the entire file with:

```typescript
import { getAllUsers, getTrainersWithClients } from "@/lib/services/admin.service";
import { format } from "date-fns";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users } from "lucide-react";
import { UserActionsMenu } from "@/components/admin/user-actions-menu";
import { TrainersWithClientsTable } from "@/components/admin/trainers-with-clients-table";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    role?: string;
    page?: string;
    view?: string;
    archived?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const role = (params.role as "TRAINER" | "CLIENT" | "ALL") ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);
  const view = params.view === "orgs" ? "orgs" : "all";
  const includeArchived = params.archived === "1";

  const [allUsersData, trainersData] = await Promise.all([
    view === "all"
      ? getAllUsers({ page, pageSize: 25, search, role, includeArchived })
      : Promise.resolve(null),
    view === "orgs" ? getTrainersWithClients() : Promise.resolve(null),
  ]);

  const users = allUsersData?.items ?? [];
  const total = allUsersData?.total ?? 0;
  const totalPages = allUsersData?.totalPages ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage trainers and clients on the platform.
        </p>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1 w-fit">
        <a
          href={`?view=all`}
          className={[
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            view === "all"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          All Users
        </a>
        <a
          href={`?view=orgs`}
          className={[
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            view === "orgs"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          By Organization
        </a>
      </div>

      {/* All Users view */}
      {view === "all" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
              <input type="hidden" name="view" value="all" />
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={search}
                  placeholder="Search name or email…"
                  className="pl-9"
                />
              </div>
              <Select name="role" defaultValue={role}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  <SelectItem value="TRAINER">Trainer</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="submit"
                className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors"
              >
                Filter
              </button>
            </form>
            <a
              href={includeArchived ? `?view=all&search=${search}&role=${role}` : `?view=all&search=${search}&role=${role}&archived=1`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              {includeArchived ? "Hide archived" : "Show archived"}
            </a>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">User</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Role</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Connections</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Status</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Joined</th>
                    <th className="px-5 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={`hover:bg-muted/40 transition-colors ${!u.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
                            {u.imageUrl ? (
                              <Image src={u.imageUrl} alt="" fill className="object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-muted-foreground">
                                {u.firstName[0]}{u.lastName[0]}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-medium truncate ${!u.isActive ? "italic text-muted-foreground" : "text-foreground"}`}>
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant="outline"
                          className={
                            u.role === "TRAINER"
                              ? "border-blue-500/30 bg-blue-500/10 text-blue-600 text-[10px]"
                              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 text-[10px]"
                          }
                        >
                          {u.role === "TRAINER" ? "Trainer" : "Client"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {u.role === "TRAINER"
                          ? `${u.connectionCount} client${u.connectionCount !== 1 ? "s" : ""}`
                          : `${u.connectionCount} trainer${u.connectionCount !== 1 ? "s" : ""}`}
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        {!u.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Archived
                          </span>
                        ) : u.onboarded ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Onboarding
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {format(new Date(u.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <UserActionsMenu
                          userId={u.id}
                          isActive={u.isActive}
                          userName={`${u.firstName} ${u.lastName}`}
                        />
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Users className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No users found.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total.toLocaleString()} users
                </p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <a href={`?view=all&search=${search}&role=${role}&page=${page - 1}${includeArchived ? "&archived=1" : ""}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                      ← Prev
                    </a>
                  )}
                  {page < totalPages && (
                    <a href={`?view=all&search=${search}&role=${role}&page=${page + 1}${includeArchived ? "&archived=1" : ""}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                      Next →
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* By Organization view */}
      {view === "orgs" && trainersData && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <TrainersWithClientsTable trainers={trainersData} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "admin/users|trainers-with-clients" | head -10
```

Expected: no errors.

---

### Task 6: Program Form — 1-Day Preset + No Equipment Toggle

**Files:**
- Modify: `components/programs/generate-program-form.tsx`

**Interfaces:**
- No interface changes — pure UI in one component

- [ ] **Step 1: Add 1 to program duration presets**

In `components/programs/generate-program-form.tsx`, find the "Program Duration" section (around line 395). Change:

```typescript
{[2, 4, 6, 8, 12].map(w => (
  <Button
    key={w}
    type="button"
    variant={durationWeeks === w ? 'default' : 'outline'}
    size="sm"
    onClick={() => setDurationWeeks(w)}
  >
    {w} wks
  </Button>
))}
```

Replace with:

```typescript
{[1, 2, 4, 6, 8, 12].map(w => (
  <Button
    key={w}
    type="button"
    variant={durationWeeks === w ? 'default' : 'outline'}
    size="sm"
    onClick={() => setDurationWeeks(w)}
  >
    {w === 1 && daysPerWeek === 1 ? "1 day" : w === 1 ? "1 wk" : `${w} wks`}
  </Button>
))}
```

- [ ] **Step 2: Add bodyweightOnly state**

In the component state declarations (around line 98, after `const [equipmentOpen, setEquipmentOpen] = useState(false);`), add:

```typescript
const [bodyweightOnly, setBodyweightOnly] = useState(false);
```

- [ ] **Step 3: Add No Equipment toggle above the equipment combobox**

Find the "Equipment" section (around line 445). It currently starts with:

```typescript
{/* Equipment */}
<div className="space-y-2">
  <Label>Available Equipment</Label>
  <p className="text-xs text-muted-foreground">
    Only exercises using these items (plus bodyweight) will be selected. Leave empty to allow any equipment.
  </p>
  <Popover ...>
```

Replace the entire Equipment `<div>` block (from `{/* Equipment */}` to the closing `</div>` of the chips after the Popover, around line 512) with:

```typescript
{/* Equipment */}
<div className="space-y-2">
  <Label>Available Equipment</Label>
  <p className="text-xs text-muted-foreground">
    Only exercises using this equipment (plus bodyweight) will be selected. Leave empty to allow any equipment.
  </p>

  {/* Bodyweight-only toggle */}
  <Button
    type="button"
    variant={bodyweightOnly ? "default" : "outline"}
    size="sm"
    onClick={() => {
      const next = !bodyweightOnly;
      setBodyweightOnly(next);
      if (next) {
        setSelectedEquipment(["none"]);
      } else {
        setSelectedEquipment([]);
      }
    }}
  >
    No Equipment (Bodyweight only)
  </Button>

  <Popover open={equipmentOpen} onOpenChange={setEquipmentOpen}>
    <PopoverTrigger
      render={
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
          disabled={bodyweightOnly}
        />
      }
    >
      {bodyweightOnly
        ? "Bodyweight only — no equipment"
        : selectedEquipment.length === 0
        ? "Select equipment..."
        : `${selectedEquipment.length} item${selectedEquipment.length === 1 ? "" : "s"} selected`}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </PopoverTrigger>
    <PopoverContent className="w-72 p-0" align="start">
      <Command>
        <CommandInput placeholder="Search equipment..." />
        <CommandList>
          <CommandEmpty>No equipment found.</CommandEmpty>
          <CommandGroup>
            {equipmentOptions.map(item => (
              <CommandItem
                key={item}
                value={item}
                onSelect={() => {
                  toggleEquipment(item);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    selectedEquipment.includes(item) ? "opacity-100" : "opacity-0"
                  }`}
                />
                {item}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
  {!bodyweightOnly && selectedEquipment.length > 0 && (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {selectedEquipment.map(item => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium"
        >
          {item}
          <button
            type="button"
            onClick={() => toggleEquipment(item)}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "generate-program-form" | head -10
```

Expected: no errors.

---

### Task 7: Bulk Exercise Action → Organization Library

**Files:**
- Modify: `actions/bulk-exercise-actions.ts`
- Modify: `actions/__tests__/bulk-exercise-actions.test.ts` (create if missing)

**Interfaces:**
- No interface changes — behavior change only in `bulkCreateExercisesAction`

- [ ] **Step 1: Write the failing test**

Create (or open) `actions/__tests__/bulk-exercise-actions.test.ts`. Add a test verifying org exercises get `source: "ORGANIZATION"`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    exercise: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { bulkCreateExercisesAction } from '../bulk-exercise-actions'

const mockAuth = vi.mocked(auth)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)

const TRAINER_WITH_ORG = {
  id: 'trainer_1',
  role: 'TRAINER',
  clerkOrgId: 'org_abc123',
}

const TRAINER_NO_ORG = {
  id: 'trainer_2',
  role: 'TRAINER',
  clerkOrgId: null,
}

const EXERCISE = {
  name: 'Squat',
  bodyRegion: 'LOWER_BODY',
  difficultyLevel: 'BEGINNER',
  musclesTargeted: [],
  equipmentRequired: [],
  contraindications: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk_1' } as any)
  mockTransaction.mockImplementation(async (ops: unknown) => {
    const arr = ops as unknown[]
    return arr.map(() => ({ id: 'ex_1' }))
  })
})

describe('bulkCreateExercisesAction — org routing', () => {
  it('sets source ORGANIZATION and organizationId when trainer has clerkOrgId', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_WITH_ORG as any)
    let capturedOps: ReturnType<typeof prisma.exercise.create>[] = []
    mockTransaction.mockImplementationOnce(async (ops: unknown) => {
      capturedOps = ops as ReturnType<typeof prisma.exercise.create>[]
      return [{ id: 'ex_1' }]
    })

    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([EXERCISE])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'ORGANIZATION',
          organizationId: 'org_abc123',
          isPublic: false,
        }),
      })
    )
  })

  it('does not set organizationId when trainer has no clerkOrgId', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([EXERCISE])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          source: 'ORGANIZATION',
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- bulk-exercise-actions
```

Expected: FAIL — `source: 'ORGANIZATION'` assertion fails (current code doesn't set it).

- [ ] **Step 3: Update bulkCreateExercisesAction to set org fields**

In `actions/bulk-exercise-actions.ts`, find the `prisma.exercise.create` call inside `bulkCreateExercisesAction` (around line 40). Before the `prisma.$transaction(...)` call, add an org data block:

```typescript
export async function bulkCreateExercisesAction(exercises: BulkExerciseInput[]) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  if (!exercises.length) return { success: false as const, error: "No exercises provided" };

  // Route to org library if the trainer belongs to an org
  const orgData = dbUser.clerkOrgId
    ? { source: "ORGANIZATION" as const, organizationId: dbUser.clerkOrgId, isPublic: false }
    : {};

  try {
    const created = await prisma.$transaction(
      exercises.map((ex) =>
        prisma.exercise.create({
          data: {
            name: ex.name.trim(),
            description: ex.description?.trim() || null,
            instructions: ex.instructions?.trim() || null,
            bodyRegion: ex.bodyRegion as BodyRegion,
            difficultyLevel: ex.difficultyLevel as DifficultyLevel,
            exercisePhase: (ex.exercisePhase as ExercisePhase) || null,
            musclesTargeted: ex.musclesTargeted,
            equipmentRequired: ex.equipmentRequired,
            contraindications: ex.contraindications,
            commonMistakes: ex.commonMistakes?.trim() || null,
            defaultSets: ex.defaultSets || null,
            defaultReps: ex.defaultReps || null,
            videoUrl: ex.videoUrl?.trim() || null,
            imageUrl: ex.imageUrl?.trim() || null,
            videoProvider: ex.videoUrl ? "youtube" : null,
            createdById: dbUser.id,
            isActive: true,
            ...orgData,
          },
        })
      )
    );

    revalidatePath("/exercises");
    return { success: true as const, count: created.length };
  } catch (error) {
    console.error("Failed to bulk create exercises:", error);
    return { success: false as const, error: "Failed to create exercises" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- bulk-exercise-actions
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all existing tests continue to pass.

---

### Final: Manual Smoke Test Checklist

After all tasks are complete, verify in the browser:

- [ ] `/admin/users` — "All Users" tab loads, shows existing users
- [ ] `/admin/users` — `···` menu on an active user shows "Archive"; click archives the user (row grays out on next load)
- [ ] `/admin/users?archived=1` — archived user appears grayed/italic; `···` shows "Restore" and "Delete"
- [ ] `/admin/users?view=orgs` — trainers listed with chevron, click expands/collapses client sub-rows
- [ ] Program generation form — duration presets show `[1 day / 1 wk, 2 wks, 4 wks, 6 wks, 8 wks, 12 wks]`; "No Equipment" toggle grays out combobox and clears chips
- [ ] Trainer bulk YouTube import — after publishing, navigate to `/exercises?source=ORGANIZATION`; verify new exercises appear there rather than in the UNIVERSAL tab
