# Global Programs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the super admin to create global programs that all clinics can browse in a Template Library and copy into their own library, with "Update available" notifications when the master is updated.

**Architecture:** Add `isGlobal` + `globalUpdatedAt` fields to the existing `Program` model (making `clinicianId` nullable for global programs). Global programs are created/edited only by super admins via new admin actions. Clinics copy them via `duplicateProgram`, setting `sourceTemplateId` for lineage tracking. Update detection compares `master.globalUpdatedAt > copy.createdAt`.

**Tech Stack:** Next.js App Router, Prisma (MongoDB), Clerk auth, React Hook Form, Zod, Tailwind, shadcn/ui, Sonner (toast), Lucide icons

---

## File Map

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Make `clinicianId` nullable; add `isGlobal`, `globalUpdatedAt` |
| `lib/services/program.service.ts` | Add `getGlobalPrograms`, `createGlobalProgram`, `updateGlobalProgram`, `pushGlobalProgramUpdate`, `deleteGlobalProgram` |
| `lib/services/admin.service.ts` | Add `getAdminGlobalPrograms` for paginated admin list |
| `actions/global-program-actions.ts` | New — super admin CRUD for global programs |
| `actions/program-actions.ts` | Add `copyGlobalProgramAction` |
| `components/programs/program-editor.tsx` | Add optional `onSave` + `redirectTo` props |
| `components/admin/admin-sidebar.tsx` | Add Global Programs nav link |
| `app/admin/global-programs/page.tsx` | New — list + Push Update + Delete |
| `app/admin/global-programs/new/page.tsx` | New — create global program |
| `app/admin/global-programs/[id]/edit/page.tsx` | New — edit global program |
| `app/(platform)/programs/page.tsx` | Pass global programs + update-available info to client |
| `components/programs/program-list-client.tsx` | Add "Template Library" tab, Copy button, Update badge |

---

## Task 1: Schema — make clinicianId nullable, add isGlobal + globalUpdatedAt

**Files:**
- Modify: `prisma/schema.prisma:361-384`

- [ ] **Step 1: Update Program model**

Replace the current `Program` model block in `prisma/schema.prisma`:

```prisma
model Program {
  id               String     @id @default(auto()) @map("_id") @db.ObjectId
  name             String
  description      String?
  isTemplate       Boolean    @default(false)
  isGlobal         Boolean    @default(false)
  globalUpdatedAt  DateTime?
  sourceTemplateId String?    @db.ObjectId
  clinicianId      String?    @db.ObjectId
  clinician        User?      @relation("ProgramsCreated", fields: [clinicianId], references: [id])
  patientId        String?    @db.ObjectId
  patient          User?      @relation("ProgramsAssigned", fields: [patientId], references: [id])
  status           PlanStatus @default(DRAFT)
  durationWeeks    Int?
  daysPerWeek      Int?
  tags             String[]
  equipmentRequired String[] @default([])
  aiGenerationParams Json?
  startDate        DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  workouts         Workout[]

  @@index([clinicianId])
  @@index([patientId])
  @@index([isGlobal])
}
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

Expected output: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: make clinicianId nullable, add isGlobal and globalUpdatedAt to Program"
```

---

## Task 2: Service layer — global program CRUD

**Files:**
- Modify: `lib/services/program.service.ts`

- [ ] **Step 1: Add global program service functions**

Append to the bottom of `lib/services/program.service.ts`:

```ts
// --- Global Programs (super admin) ---

export async function getGlobalPrograms() {
  return prisma.program.findMany({
    where: { isGlobal: true, status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function createGlobalProgram(data: CreateProgramInput) {
  const { workouts, startDate, ...rest } = data;

  return prisma.program.create({
    data: {
      ...rest,
      isGlobal: true,
      clinicianId: null,
      startDate: startDate ? new Date(startDate) : undefined,
      workouts: {
        create: workouts.map((w) => ({
          name: w.name,
          description: w.description,
          dayIndex: w.dayIndex,
          weekIndex: w.weekIndex,
          orderIndex: w.orderIndex,
          estimatedMinutes: w.estimatedMinutes,
          blocks: {
            create: w.blocks.map((b) => ({
              name: b.name,
              type: b.type,
              orderIndex: b.orderIndex,
              rounds: b.rounds,
              restBetweenRounds: b.restBetweenRounds,
              timeCap: b.timeCap,
              notes: b.notes,
              exercises: {
                create: b.exercises.map((e) => ({
                  exerciseId: e.exerciseId,
                  orderIndex: e.orderIndex,
                  restSeconds: e.restSeconds,
                  notes: e.notes,
                  supersetGroup: e.supersetGroup,
                  sets: {
                    create: e.sets.map((s) => ({
                      orderIndex: s.orderIndex,
                      setType: s.setType,
                      targetReps: s.targetReps,
                      targetWeight: s.targetWeight,
                      targetDuration: s.targetDuration,
                      targetDistance: s.targetDistance,
                      targetRPE: s.targetRPE,
                      restAfter: s.restAfter,
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
    include: programDetailInclude,
  });
}

export async function updateGlobalProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  if (workouts) {
    await prisma.workout.deleteMany({ where: { programId: id } });

    return prisma.program.update({
      where: { id },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        workouts: {
          create: workouts.map((w) => ({
            name: w.name,
            description: w.description,
            dayIndex: w.dayIndex,
            weekIndex: w.weekIndex,
            orderIndex: w.orderIndex,
            estimatedMinutes: w.estimatedMinutes,
            blocks: {
              create: w.blocks.map((b) => ({
                name: b.name,
                type: b.type,
                orderIndex: b.orderIndex,
                rounds: b.rounds,
                restBetweenRounds: b.restBetweenRounds,
                timeCap: b.timeCap,
                notes: b.notes,
                exercises: {
                  create: b.exercises.map((e) => ({
                    exerciseId: e.exerciseId,
                    orderIndex: e.orderIndex,
                    restSeconds: e.restSeconds,
                    notes: e.notes,
                    supersetGroup: e.supersetGroup,
                    sets: {
                      create: e.sets.map((s) => ({
                        orderIndex: s.orderIndex,
                        setType: s.setType,
                        targetReps: s.targetReps,
                        targetWeight: s.targetWeight,
                        targetDuration: s.targetDuration,
                        targetDistance: s.targetDistance,
                        targetRPE: s.targetRPE,
                        restAfter: s.restAfter,
                      })),
                    },
                  })),
                },
              })),
            },
          })),
        },
      },
      include: programDetailInclude,
    });
  }

  return prisma.program.update({
    where: { id },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
    },
    include: programDetailInclude,
  });
}

export async function pushGlobalProgramUpdate(id: string) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { globalUpdatedAt: new Date() },
    select: { id: true, globalUpdatedAt: true },
  });
}

export async function deleteGlobalProgram(id: string) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { status: "ARCHIVED" },
  });
}

export async function copyGlobalProgramToClinic(
  globalProgramId: string,
  clinicianId: string
) {
  return duplicateProgram(globalProgramId, clinicianId, false);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `program.service.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/services/program.service.ts
git commit -m "feat: add global program service functions (create, update, push, delete, copy)"
```

---

## Task 3: Admin service — paginated global programs list

**Files:**
- Modify: `lib/services/admin.service.ts`

- [ ] **Step 1: Add getAdminGlobalPrograms**

Append to `lib/services/admin.service.ts`:

```ts
export async function getAdminGlobalPrograms(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const search = params.search ?? "";

  const where = {
    isGlobal: true,
    status: { not: "ARCHIVED" as const },
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      include: {
        _count: { select: { workouts: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / pageSize) };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/admin.service.ts
git commit -m "feat: add getAdminGlobalPrograms to admin service"
```

---

## Task 4: Admin server actions for global programs

**Files:**
- Create: `actions/global-program-actions.ts`

- [ ] **Step 1: Create the file**

```ts
"use server";

import { requireSuperAdmin } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { createProgramSchema, updateProgramSchema } from "@/lib/validators/program";
import type { CreateProgramInput, UpdateProgramInput } from "@/lib/validators/program";
import { revalidatePath } from "next/cache";

export async function createGlobalProgramAction(input: CreateProgramInput) {
  await requireSuperAdmin();

  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const program = await programService.createGlobalProgram(parsed.data);
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
  await requireSuperAdmin();

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateGlobalProgram(programId, parsed.data);
    revalidatePath("/admin/global-programs");
    revalidatePath(`/admin/global-programs/${programId}/edit`);
    return { success: true as const, data: { id: updated.id } };
  } catch (error) {
    console.error("Failed to update global program:", error);
    return { success: false as const, error: "Failed to update global program" };
  }
}

export async function pushGlobalProgramUpdateAction(programId: string) {
  await requireSuperAdmin();

  try {
    await programService.pushGlobalProgramUpdate(programId);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to push global program update:", error);
    return { success: false as const, error: "Failed to push update" };
  }
}

export async function deleteGlobalProgramAction(programId: string) {
  await requireSuperAdmin();

  try {
    await programService.deleteGlobalProgram(programId);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete global program:", error);
    return { success: false as const, error: "Failed to delete global program" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add actions/global-program-actions.ts
git commit -m "feat: add admin server actions for global program CRUD"
```

---

## Task 5: Clinic copy action

**Files:**
- Modify: `actions/program-actions.ts`

- [ ] **Step 1: Append copyGlobalProgramAction**

Add to the bottom of `actions/program-actions.ts`:

```ts
export async function copyGlobalProgramAction(globalProgramId: string) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const program = await programService.copyGlobalProgramToClinic(
      globalProgramId,
      user.id
    );
    revalidatePath("/programs");
    return { success: true as const, data: { id: program.id } };
  } catch (error) {
    console.error("Failed to copy global program:", error);
    return { success: false as const, error: "Failed to copy program" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add actions/program-actions.ts
git commit -m "feat: add copyGlobalProgramAction for clinics"
```

---

## Task 6: ProgramEditor — add onSave + redirectTo props

The `ProgramEditor` currently hard-codes calls to `createProgramAction` / `updateProgramAction` and redirects to `/programs/[id]`. For the admin global programs flow, it needs to call different actions and redirect to `/admin/global-programs`.

**Files:**
- Modify: `components/programs/program-editor.tsx:41-53` (Props interface)
- Modify: `components/programs/program-editor.tsx:178-224` (onSubmit function)

- [ ] **Step 1: Extend Props interface**

Find the `Props` interface (around line 41) and replace it with:

```ts
interface Props {
  program?: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
  }[];
  onSave?: (
    data: CreateProgramInput,
    programId?: string
  ) => Promise<{ success: boolean; error?: string; data?: { id: string } }>;
  redirectTo?: string;
}
```

- [ ] **Step 2: Update onSubmit to use onSave when provided**

Find the `onSubmit` function (around line 178) and replace the entire function body:

```ts
  async function onSubmit(data: CreateProgramInput) {
    setSaving(true);
    try {
      const cleanWorkouts = workouts.map((w) => ({
        ...w,
        blocks: w.blocks.map((b) => ({
          ...b,
          exercises: b.exercises.map((e) => {
            const { _exerciseName, _exerciseBodyRegion, ...rest } = e as Record<
              string,
              unknown
            > &
              typeof e;
            void _exerciseName;
            void _exerciseBodyRegion;
            return rest;
          }),
        })),
      }));
      data.workouts = cleanWorkouts;
      data.equipmentRequired = equipment;

      if (onSave) {
        const result = await onSave(data, program?.id as string | undefined);
        if (result.success) {
          toast.success(program ? "Program updated" : "Program created");
          router.push(redirectTo ?? (result.data?.id ? `/programs/${result.data.id}` : "/programs"));
        } else {
          toast.error(result.error);
        }
        return;
      }

      if (program) {
        const result = await updateProgramAction(program.id as string, data);
        if (result.success) {
          toast.success("Program updated");
          router.push(`/programs/${program.id}`);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createProgramAction(data);
        if (result.success) {
          toast.success("Program created");
          router.push(`/programs/${result.data.id}`);
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 3: Destructure new props in the component signature**

Find line `export function ProgramEditor({ program, exercises }: Props)` and change to:

```ts
export function ProgramEditor({ program, exercises, onSave, redirectTo }: Props)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/programs/program-editor.tsx
git commit -m "feat: add optional onSave and redirectTo props to ProgramEditor"
```

---

## Task 7: Admin sidebar — add Global Programs link

**Files:**
- Modify: `components/admin/admin-sidebar.tsx:18-24`

- [ ] **Step 1: Add Globe icon import and nav link**

Find the icon import block (line 7) and add `Globe` to the import:

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
} from "lucide-react";
```

Find the `adminLinks` array (line 18) and add the Global Programs entry:

```ts
const adminLinks = [
  { href: "/admin",                  label: "Overview",         icon: LayoutDashboard, exact: true },
  { href: "/admin/users",            label: "Users",            icon: Users },
  { href: "/admin/analytics",        label: "Analytics",        icon: BarChart3 },
  { href: "/admin/exercises",        label: "Exercises",        icon: Dumbbell },
  { href: "/admin/programs",         label: "All Programs",     icon: Library },
  { href: "/admin/global-programs",  label: "Global Programs",  icon: Globe },
];
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/admin-sidebar.tsx
git commit -m "feat: add Global Programs link to admin sidebar"
```

---

## Task 8: Admin Global Programs list page

**Files:**
- Create: `app/admin/global-programs/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { getAdminGlobalPrograms } from "@/lib/services/admin.service";
import { format } from "date-fns";
import { Globe, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { GlobalProgramActions } from "./global-program-actions";

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function AdminGlobalProgramsPage({ searchParams }: PageProps) {
  await requireSuperAdmin();
  const params = await searchParams;
  const search = params.search ?? "";
  const page = parseInt(params.page ?? "1", 10);

  const { items: programs, total, totalPages } = await getAdminGlobalPrograms({
    page,
    pageSize: 25,
    search,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Programs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total.toLocaleString()} master program{total !== 1 ? "s" : ""} available to all clinics.
          </p>
        </div>
        <Link
          href="/admin/global-programs/new"
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Global Program
        </Link>
      </div>

      <form method="GET" className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="search" defaultValue={search} placeholder="Search global programs…" className="pl-9" />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors"
        >
          Search
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Program</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Workouts</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Last Pushed</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Created</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {programs.map((prog) => (
                <tr key={prog.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{prog.name}</p>
                    {prog.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                    )}
                    {prog.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {prog.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">{prog._count.workouts}</span>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {prog.globalUpdatedAt
                        ? format(new Date(prog.globalUpdatedAt), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {format(new Date(prog.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <GlobalProgramActions programId={prog.id} programName={prog.name} />
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Globe className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No global programs yet.</p>
                    <Link href="/admin/global-programs/new" className="mt-2 inline-block text-sm text-primary hover:underline">
                      Create the first one →
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} programs</p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`?search=${search}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the GlobalProgramActions client component**

Create `app/admin/global-programs/global-program-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  pushGlobalProgramUpdateAction,
  deleteGlobalProgramAction,
} from "@/actions/global-program-actions";

interface Props {
  programId: string;
  programName: string;
}

export function GlobalProgramActions({ programId, programName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePushUpdate() {
    setLoading(true);
    try {
      const result = await pushGlobalProgramUpdateAction(programId);
      if (result.success) {
        toast.success(`Update pushed for "${programName}"`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Archive "${programName}"? It will no longer appear in the clinic library.`)) return;
    setLoading(true);
    try {
      const result = await deleteGlobalProgramAction(programId);
      if (result.success) {
        toast.success("Program archived");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={loading}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/global-programs/${programId}/edit`} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePushUpdate} className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          Push Update Notification
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="flex items-center gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/global-programs/
git commit -m "feat: add admin global programs list page with push update and delete actions"
```

---

## Task 9: Admin Global Programs — New page

**Files:**
- Create: `app/admin/global-programs/new/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { GlobalProgramEditorWrapper } from "../global-program-editor-wrapper";

export default async function NewGlobalProgramPage() {
  await requireSuperAdmin();
  const exercises = await getExercises();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Global Program</h1>
        <p className="text-muted-foreground">
          Create a master program that will be available to all clinics.
        </p>
      </div>
      <GlobalProgramEditorWrapper exercises={exercises} />
    </div>
  );
}
```

- [ ] **Step 2: Create the GlobalProgramEditorWrapper client component**

Create `app/admin/global-programs/global-program-editor-wrapper.tsx`:

```tsx
"use client";

import { ProgramEditor } from "@/components/programs/program-editor";
import {
  createGlobalProgramAction,
  updateGlobalProgramAction,
} from "@/actions/global-program-actions";
import type { CreateProgramInput } from "@/lib/validators/program";

interface Props {
  program?: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
  }[];
}

export function GlobalProgramEditorWrapper({ program, exercises }: Props) {
  async function handleSave(data: CreateProgramInput, programId?: string) {
    if (programId) {
      return updateGlobalProgramAction(programId, data);
    }
    return createGlobalProgramAction(data);
  }

  return (
    <ProgramEditor
      program={program}
      exercises={exercises}
      onSave={handleSave}
      redirectTo="/admin/global-programs"
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/global-programs/new/ app/admin/global-programs/global-program-editor-wrapper.tsx
git commit -m "feat: add admin new global program page"
```

---

## Task 10: Admin Global Programs — Edit page

**Files:**
- Create: `app/admin/global-programs/[id]/edit/page.tsx`

- [ ] **Step 1: Create the edit page**

```tsx
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { notFound } from "next/navigation";
import { GlobalProgramEditorWrapper } from "../../global-program-editor-wrapper";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditGlobalProgramPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    getProgramById(id),
    getExercises(),
  ]);

  if (!program || !program.isGlobal) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Global Program</h1>
        <p className="text-muted-foreground">Changes will be reflected for all clinics after pushing an update.</p>
      </div>
      <GlobalProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/global-programs/
git commit -m "feat: add admin edit global program page"
```

---

## Task 11: Clinic programs page — fetch global programs + update info

**Files:**
- Modify: `app/(platform)/programs/page.tsx`

- [ ] **Step 1: Update the page to fetch global programs and compute update-available flags**

Replace the entire file:

```tsx
import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { ProgramListClient } from "@/components/programs/program-list-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
    tab?: string;
  }>;
}

export default async function ProgramsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const params = await searchParams;

  const tab =
    params.tab === "templates"
      ? "templates"
      : params.tab === "library"
      ? "library"
      : "programs";

  const [programs, globalPrograms] = await Promise.all([
    user.role === "CLINICIAN"
      ? programService.getPrograms(user.id, {
          search: params.search,
          status: params.status as any,
          isTemplate: tab === "templates",
        })
      : programService.getProgramsForPatient(user.id),
    user.role === "CLINICIAN" ? programService.getGlobalPrograms() : Promise.resolve([]),
  ]);

  // For each clinic program that came from a global master, check if master has been updated
  const updatableIds = new Set<string>(
    programs
      .filter((p) => {
        if (!p.sourceTemplateId) return false;
        const master = globalPrograms.find((g) => g.id === p.sourceTemplateId);
        if (!master?.globalUpdatedAt) return false;
        return new Date(master.globalUpdatedAt) > new Date(p.createdAt);
      })
      .map((p) => p.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user.role === "CLINICIAN" ? "Programs" : "My Programs"}
          </h1>
          <p className="text-muted-foreground">
            {user.role === "CLINICIAN"
              ? "Create, manage, and assign training programs to your clients."
              : `You have ${programs.length} programs assigned.`}
          </p>
        </div>
      </div>
      <ProgramListClient
        programs={programs}
        globalPrograms={globalPrograms}
        updatableIds={[...updatableIds]}
        role={user.role}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(platform\)/programs/page.tsx
git commit -m "feat: fetch global programs and compute update-available flags on programs page"
```

---

## Task 12: ProgramListClient — Template Library tab + Copy + Update badge

**Files:**
- Modify: `components/programs/program-list-client.tsx`

- [ ] **Step 1: Update the Props interface**

Find the `ProgramListItem` interface and add `globalUpdatedAt` + `isGlobal`. Also add a new type for global programs and update the component props.

Find the block starting with `interface ProgramListItem` and replace with:

```ts
interface ProgramListItem {
  id: string;
  name: string;
  status: string;
  isTemplate: boolean;
  isGlobal: boolean;
  sourceTemplateId?: string | null;
  tags: string[];
  updatedAt: Date;
  createdAt: Date;
  patientId?: string | null;
  clinician: { id: string; firstName: string; lastName: string } | null;
  patient: { id: string; firstName: string; lastName: string } | null;
  _count: { workouts: number };
}

interface GlobalProgramItem {
  id: string;
  name: string;
  description?: string | null;
  tags: string[];
  globalUpdatedAt?: Date | null;
  _count: { workouts: number };
}
```

- [ ] **Step 2: Update the component signature**

Find `export function ProgramListClient({ programs, role }: { programs: ProgramListItem[]; role: string })` and replace with:

```ts
export function ProgramListClient({
  programs,
  globalPrograms,
  updatableIds,
  role,
}: {
  programs: ProgramListItem[];
  globalPrograms: GlobalProgramItem[];
  updatableIds: string[];
  role: string;
}) {
```

- [ ] **Step 3: Add copy action import**

Add `copyGlobalProgramAction` to the import at the top of the file:

```ts
import {
  duplicateProgramAction,
  deleteProgramAction,
  copyGlobalProgramAction,
} from "@/actions/program-actions";
```

- [ ] **Step 4: Add copy handler + updatable set inside the component**

After the existing state declarations, add:

```ts
  const updatableSet = new Set(updatableIds);
  const [copying, setCopying] = useState<string | null>(null);

  async function handleCopyGlobal(globalProgramId: string, name: string) {
    setCopying(globalProgramId);
    try {
      const result = await copyGlobalProgramAction(globalProgramId);
      if (result.success) {
        toast.success(`"${name}" copied to your library`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setCopying(null);
    }
  }
```

- [ ] **Step 5: Add "library" to the Tabs**

Find the `<Tabs>` component and add the library tab. The current tabs are `programs` and `templates`. Find where `tab` state is set from URL and make sure `library` is handled:

Find the existing tab default value logic (where `tab` searchParam is read) and ensure it handles "library":

```ts
  const tab = searchParams.get("tab") ?? "programs";
```

In the `<TabsList>` section, add:

```tsx
<TabsTrigger
  value="library"
  onClick={() => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", "library");
    router.push(`${pathname}?${p.toString()}`);
  }}
>
  Template Library
  {globalPrograms.length > 0 && (
    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      {globalPrograms.length}
    </span>
  )}
</TabsTrigger>
```

- [ ] **Step 6: Add the Template Library tab content**

After the existing `programs` and `templates` tab content blocks, add:

```tsx
{tab === "library" && (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {globalPrograms.length === 0 && (
      <div className="col-span-full py-12 text-center">
        <Globe className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No global programs available yet.</p>
      </div>
    )}
    {globalPrograms.map((prog) => (
      <Card key={prog.id} className="group relative overflow-hidden border-border/60 bg-card hover:border-primary/30 transition-all duration-200">
        <div className={`h-1.5 w-full bg-gradient-to-r from-primary to-primary/60`} />
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{prog.name}</p>
              {prog.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{prog.description}</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {prog.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{prog._count.workouts} workout{prog._count.workouts !== 1 ? "s" : ""}</p>
          <Button
            size="sm"
            className="mt-4 w-full"
            disabled={copying === prog.id}
            onClick={() => handleCopyGlobal(prog.id, prog.name)}
          >
            {copying === prog.id ? "Copying…" : "Copy to My Library"}
          </Button>
        </CardContent>
      </Card>
    ))}
  </div>
)}
```

- [ ] **Step 7: Add "Update available" badge to program cards**

In the existing program card rendering, find where the program name/status is shown, and add the badge. Locate the card for each program and add just before or after the status badge:

```tsx
{updatableSet.has(prog.id) && (
  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
    Update available
  </span>
)}
```

- [ ] **Step 8: Add Globe import to lucide imports**

Find the existing lucide-react import in the file and add `Globe`:

```ts
import {
  Plus,
  Search,
  MoreVertical,
  Copy,
  UserPlus,
  Archive,
  Sparkles,
  Library,
  Pencil,
  Users,
  Dumbbell,
  Upload,
  Globe,
} from "lucide-react";
```

- [ ] **Step 9: Verify the full page works**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add components/programs/program-list-client.tsx
git commit -m "feat: add Template Library tab, copy-to-library, and update-available badge to program list"
```

---

## Task 13: Fix getPrograms to exclude global programs from clinic list

The `getPrograms` in `program.service.ts` filters by `clinicianId`. Since global programs have `clinicianId: null`, they're already excluded. But add an explicit guard to be safe.

**Files:**
- Modify: `lib/services/program.service.ts:113-131`

- [ ] **Step 1: Add isGlobal: false filter**

Find the `getPrograms` function and update the `where` clause:

```ts
export async function getPrograms(
  clinicianId: string,
  filters: ProgramFilterInput = {}
) {
  const where: Prisma.ProgramWhereInput = {
    clinicianId,
    isGlobal: false,
    ...(filters.status && { status: filters.status as PlanStatus }),
    ...(filters.isTemplate !== undefined && { isTemplate: filters.isTemplate }),
    ...(filters.patientId && { patientId: filters.patientId }),
    ...(filters.search && {
      name: { contains: filters.search, mode: "insensitive" as const },
    }),
  };

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/program.service.ts
git commit -m "fix: explicitly exclude global programs from clinic getPrograms query"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Super admin creates global programs → Tasks 2, 4, 8, 9
- ✅ Super admin edits global programs → Tasks 2, 4, 10
- ✅ Super admin pushes update notification → Tasks 2, 4, 8 (Push Update button)
- ✅ Clinics browse global programs in Template Library → Tasks 11, 12
- ✅ Clinics copy global programs to their library → Tasks 2, 5, 12
- ✅ "Update available" badge → Tasks 11, 12
- ✅ Clinics never edit master programs → global programs only editable via admin actions that check `requireSuperAdmin()`
- ✅ Original programs unaffected → `getPrograms` explicitly excludes `isGlobal: true`
- ✅ `isGlobal` flag + `globalUpdatedAt` in schema → Task 1

**Placeholder scan:** No TBDs, no vague steps. All code blocks are complete.

**Type consistency:**
- `GlobalProgramItem` defined in Task 12, used in the component props — consistent
- `copyGlobalProgramToClinic` defined in Task 2, called via `copyGlobalProgramAction` in Task 5 — consistent
- `onSave` prop signature in Task 6 returns `{ success, error?, data? }` — matches what `createGlobalProgramAction` and `updateGlobalProgramAction` return in Task 4 — consistent
- `globalPrograms` and `updatableIds` passed from page (Task 11) to `ProgramListClient` (Task 12) — consistent
