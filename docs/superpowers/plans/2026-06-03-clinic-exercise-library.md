# Clinic Exercise Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clinic-owned exercises with a Universal/My Clinic two-tab picker, inline exercise creation inside the program builder, and a per-exercise public/private toggle.

**Architecture:** Add `source`, `organizationId`, and `isPublic` to the `Exercise` model. Update `getExercisesForPicker` to accept a clinic org ID and return a deduplicated union of universal + visible clinic exercises annotated with their source. Augment the `ExercisePickerDialog` with tabs and an inline create view (no nested dialogs — toggle between list and form inside the existing dialog). Wire everything through the existing data flow: patient page → calendar → picker.

**Tech Stack:** Prisma (MongoDB), Next.js server actions, Vitest, Tailwind, shadcn/ui Tabs

---

## File Map

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `ExerciseSource` enum + 3 fields to `Exercise` |
| `lib/services/exercise.service.ts` | Update `getExercisesForPicker`, `getExercises`, `createExercise`; add `toggleExercisePublic` |
| `lib/services/__tests__/exercise.service.test.ts` | New: unit tests for updated service functions |
| `lib/validators/exercise.ts` | Add `isPublic` to `createExerciseSchema` |
| `actions/exercise-actions.ts` | Update `createExerciseAction`; add `createClinicExerciseAction`, `toggleExercisePublicAction` |
| `components/programs/exercise-picker-dialog.tsx` | Add Universal/My Clinic tabs + inline create form view |
| `components/exercises/exercise-card.tsx` | Add `source`, `isPublic`, `organizationId` props + publish toggle |
| `app/(platform)/exercises/page.tsx` | Add tab switcher (Universal / My Clinic), pass `source` + `organizationId` to `getExercises` |
| `app/(platform)/patients/[id]/page.tsx` | Pass `user.clerkOrgId` to `getExercisesForPicker` |
| `components/calendar/client-calendar.tsx` | Extend `ExerciseSummary` type with new fields |
| `components/calendar/workout-editor-panel.tsx` | Extend `ExerciseSummary` type with new fields |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add ExerciseSource enum and new fields**

In `prisma/schema.prisma`, add the enum before the `Exercise` model, then add the three fields inside `Exercise`:

```prisma
enum ExerciseSource {
  UNIVERSAL
  CLINIC
}
```

Inside `model Exercise { ... }`, add after `isActive Boolean @default(true)`:

```prisma
  source         ExerciseSource @default(UNIVERSAL)
  organizationId String?
  isPublic       Boolean        @default(true)
```

- [ ] **Step 2: Push the schema**

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

---

## Task 2: Update Exercise Service

**Files:**
- Modify: `lib/services/exercise.service.ts`
- Create: `lib/services/__tests__/exercise.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/services/__tests__/exercise.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/utils/video', () => ({
  buildYouTubeSearchUrl: vi.fn((name: string) => `https://youtube.com/search?q=${name}`),
  extractYouTubeId: vi.fn(() => null),
  getYouTubeThumbnail: vi.fn(() => null),
}))

import { prisma } from '@/lib/prisma'
import {
  getExercisesForPicker,
  toggleExercisePublic,
} from '../exercise.service'

const mockFindMany = vi.mocked(prisma.exercise.findMany)
const mockUpdate = vi.mocked(prisma.exercise.update)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getExercisesForPicker', () => {
  const universalEx = {
    id: '1', name: 'Squat', source: 'UNIVERSAL', organizationId: null,
    isPublic: true, bodyRegion: 'LOWER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 10, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhase: null,
  }
  const publicClinicEx = {
    id: '2', name: 'Band Pull', source: 'CLINIC', organizationId: 'org_other',
    isPublic: true, bodyRegion: 'UPPER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 12, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhase: null,
  }
  const privateClinicEx = {
    id: '3', name: 'Custom Hold', source: 'CLINIC', organizationId: 'org_mine',
    isPublic: false, bodyRegion: 'CORE', difficultyLevel: 'INTERMEDIATE',
    defaultReps: null, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhase: null,
  }

  it('returns all exercises for the calling clinic (universal + public + own private)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicClinicEx, privateClinicEx] as any)
    const result = await getExercisesForPicker('org_mine')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'CLINIC', isPublic: true },
            { source: 'CLINIC', organizationId: 'org_mine' },
          ]),
        }),
      })
    )
    expect(result).toHaveLength(3)
  })

  it('works without an organizationId (falls back to universal + public only)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicClinicEx] as any)
    await getExercisesForPicker()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'CLINIC', isPublic: true },
          ]),
        }),
      })
    )
  })
})

describe('toggleExercisePublic', () => {
  it('flips isPublic from true to false', async () => {
    mockUpdate.mockResolvedValue({ id: '3', isPublic: false } as any)
    await toggleExercisePublic('3', false)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: '3' },
      data: { isPublic: false },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/services/__tests__/exercise.service.test.ts
```

Expected: FAIL — `toggleExercisePublic is not a function` (or similar import error)

- [ ] **Step 3: Update the service**

Replace the contents of `lib/services/exercise.service.ts` with:

```typescript
import { prisma } from "@/lib/prisma";
import type { BodyRegion, DifficultyLevel, ExercisePhase, ExerciseSource } from "@prisma/client";
import {
  buildYouTubeSearchUrl,
  extractYouTubeId,
  getYouTubeThumbnail,
} from "@/lib/utils/video";

export interface ExerciseFilters {
  search?: string;
  bodyRegion?: BodyRegion;
  difficultyLevel?: DifficultyLevel;
  exercisePhase?: ExercisePhase;
  equipment?: string;
  source?: ExerciseSource;
  organizationId?: string;
}

export async function getExercises(filters: ExerciseFilters = {}) {
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      ...(filters.bodyRegion && { bodyRegion: filters.bodyRegion }),
      ...(filters.difficultyLevel && { difficultyLevel: filters.difficultyLevel }),
      ...(filters.exercisePhase && { exercisePhase: filters.exercisePhase }),
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
      ...(filters.equipment && {
        equipmentRequired: { has: filters.equipment },
      }),
      ...(filters.source === "UNIVERSAL" && { source: "UNIVERSAL" }),
      ...(filters.source === "CLINIC" && filters.organizationId && {
        source: "CLINIC",
        organizationId: filters.organizationId,
      }),
    },
    include: { media: true },
    orderBy: { name: "asc" },
  });
}

export async function getExercisesForPicker(organizationId?: string) {
  const orClauses: object[] = [
    { source: "UNIVERSAL" },
    { source: "CLINIC", isPublic: true },
  ];
  if (organizationId) {
    orClauses.push({ source: "CLINIC", organizationId });
  }

  return prisma.exercise.findMany({
    where: {
      isActive: true,
      OR: orClauses,
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      defaultReps: true,
      musclesTargeted: true,
      description: true,
      videoUrl: true,
      videoProvider: true,
      exercisePhase: true,
      source: true,
      organizationId: true,
      isPublic: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getExerciseById(id: string) {
  return prisma.exercise.findUnique({
    where: { id },
    include: {
      media: true,
      progressionsFrom: {
        include: { nextExercise: true },
        orderBy: { orderIndex: "asc" },
      },
      progressionsTo: {
        include: { exercise: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
}

export async function createExercise(data: {
  name: string;
  description?: string;
  bodyRegion: BodyRegion;
  equipmentRequired: string[];
  difficultyLevel: DifficultyLevel;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  createdById: string;
  source?: ExerciseSource;
  organizationId?: string;
  isPublic?: boolean;
}) {
  const videoUrl = data.videoUrl?.trim() || buildYouTubeSearchUrl(data.name);
  let imageUrl = data.imageUrl?.trim() || undefined;

  if (!imageUrl) {
    const ytId = extractYouTubeId(videoUrl);
    if (ytId) {
      imageUrl = getYouTubeThumbnail(ytId);
    }
  }

  return prisma.exercise.create({
    data: {
      ...data,
      videoUrl,
      videoProvider: data.videoProvider,
      imageUrl,
      source: data.source ?? "UNIVERSAL",
      organizationId: data.organizationId ?? null,
      isPublic: data.isPublic ?? true,
    },
  });
}

export async function toggleExercisePublic(exerciseId: string, isPublic: boolean) {
  return prisma.exercise.update({
    where: { id: exerciseId },
    data: { isPublic },
  });
}

export async function updateExercise(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    bodyRegion: BodyRegion;
    equipmentRequired: string[];
    difficultyLevel: DifficultyLevel;
    contraindications: string[];
    instructions: string;
    videoUrl: string;
    videoProvider: string;
    imageUrl: string;
    isActive: boolean;
    isPublic: boolean;
  }>
) {
  const nextData = { ...data };
  if (typeof nextData.videoProvider === "string") {
    nextData.videoProvider = nextData.videoProvider.trim();
  }
  if (nextData.imageUrl === "") {
    nextData.imageUrl = undefined;
  }

  if (!nextData.videoUrl && typeof nextData.name === "string" && nextData.name.trim()) {
    nextData.videoUrl = buildYouTubeSearchUrl(nextData.name);
  }

  if (!nextData.imageUrl && nextData.videoUrl) {
    const ytId = extractYouTubeId(nextData.videoUrl);
    if (ytId) {
      nextData.imageUrl = getYouTubeThumbnail(ytId);
    }
  }

  return prisma.exercise.update({ where: { id }, data: nextData });
}

export async function deleteExercise(id: string) {
  return prisma.exercise.update({ where: { id }, data: { isActive: false } });
}

export async function getProgressionChain(exerciseId: string) {
  return prisma.exerciseProgression.findMany({
    where: { exerciseId },
    include: { nextExercise: true },
    orderBy: { orderIndex: "asc" },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/services/__tests__/exercise.service.test.ts
```

Expected: all tests PASS

---

## Task 3: Update Validator

**Files:**
- Modify: `lib/validators/exercise.ts`

- [ ] **Step 1: Add `isPublic` to createExerciseSchema**

Replace the contents of `lib/validators/exercise.ts` with:

```typescript
import { z } from "zod";

export const createExerciseSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]),
  equipmentRequired: z.array(z.string()).default([]),
  difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  contraindications: z.array(z.string()).default([]),
  instructions: z.string().max(5000).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoProvider: z.string().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  isPublic: z.boolean().optional().default(true),
});

export const updateExerciseSchema = createExerciseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const exerciseFilterSchema = z.object({
  search: z.string().optional(),
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]).optional(),
  difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  equipment: z.string().optional(),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
export type ExerciseFilterInput = z.infer<typeof exerciseFilterSchema>;
```

---

## Task 4: Update Exercise Actions

**Files:**
- Modify: `actions/exercise-actions.ts`

- [ ] **Step 1: Update `createExerciseAction` to set source=CLINIC**

Replace the existing `createExerciseAction` function with:

```typescript
export async function createExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  equipmentRequired: string[];
  difficultyLevel: string;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  isPublic?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const parsed = createExerciseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const exercise = await exerciseService.createExercise({
      ...parsed.data,
      bodyRegion: parsed.data.bodyRegion as BodyRegion,
      difficultyLevel: parsed.data.difficultyLevel as DifficultyLevel,
      videoUrl: parsed.data.videoUrl || undefined,
      videoProvider: parsed.data.videoProvider || undefined,
      createdById: dbUser.id,
      source: "CLINIC",
      organizationId: dbUser.clerkOrgId ?? undefined,
      isPublic: parsed.data.isPublic ?? true,
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}
```

- [ ] **Step 2: Add `createClinicExerciseAction` and `toggleExercisePublicAction` at end of file**

```typescript
export async function createClinicExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  difficultyLevel: string;
  videoUrl?: string;
  isPublic: boolean;
  exercisePhase?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "No clinic associated with your account" };

  try {
    const exercise = await exerciseService.createExercise({
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      bodyRegion: input.bodyRegion as BodyRegion,
      difficultyLevel: input.difficultyLevel as DifficultyLevel,
      equipmentRequired: [],
      contraindications: [],
      videoUrl: input.videoUrl?.trim() || undefined,
      exercisePhase: input.exercisePhase as import("@prisma/client").ExercisePhase | undefined,
      createdById: dbUser.id,
      source: "CLINIC",
      organizationId: dbUser.clerkOrgId,
      isPublic: input.isPublic,
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create clinic exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}

export async function toggleExercisePublicAction(exerciseId: string, isPublic: boolean) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) return { success: false as const, error: "Exercise not found" };
  if (exercise.organizationId !== dbUser.clerkOrgId) {
    return { success: false as const, error: "You can only modify your clinic's exercises" };
  }

  try {
    await exerciseService.toggleExercisePublic(exerciseId, isPublic);
    revalidatePath("/exercises");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to toggle exercise public:", error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

---

## Task 5: Update ExerciseSummary Types

**Files:**
- Modify: `components/calendar/client-calendar.tsx` (ExerciseSummary type around line 46)
- Modify: `components/calendar/workout-editor-panel.tsx` (ExerciseSummary type around line 65)

- [ ] **Step 1: Update ExerciseSummary in client-calendar.tsx**

Replace the `ExerciseSummary` type:

```typescript
type ExerciseSummary = {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  musclesTargeted?: string[];
  imageUrl?: string | null;
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
};
```

- [ ] **Step 2: Update ExerciseSummary in workout-editor-panel.tsx**

Replace the `ExerciseSummary` type:

```typescript
type ExerciseSummary = {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  targetRPE?: number | null;
  targetPercentage1RM?: number | null;
  tempo?: string | null;
  musclesTargeted?: string[];
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  exercisePhase?: string | null;
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
};
```

---

## Task 6: Update ExercisePickerDialog

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx`

- [ ] **Step 1: Replace the file entirely**

```typescript
"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Play, X, Plus, ArrowLeft, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import { createClinicExerciseAction, toggleExercisePublicAction } from "@/actions/exercise-actions";
import { toast } from "sonner";

interface Exercise {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  musclesTargeted?: string[];
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  exercisePhase?: string | null;
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  clinicOrganizationId?: string | null;
}

const PHASES = [
  { value: "all",           label: "All"          },
  { value: "WARMUP",        label: "Warm-up"      },
  { value: "ACTIVATION",    label: "Activation"   },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY",      label: "Mobility"     },
  { value: "COOLDOWN",      label: "Cool-down"    },
] as const;

const REGIONS = [
  { value: "all",         label: "All"         },
  { value: "UPPER_BODY",  label: "Upper"       },
  { value: "LOWER_BODY",  label: "Lower"       },
  { value: "CORE",        label: "Core"        },
  { value: "FULL_BODY",   label: "Full Body"   },
  { value: "BALANCE",     label: "Balance"     },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER:     "bg-green-100 text-green-700 border-green-200",
  INTERMEDIATE: "bg-amber-100 text-amber-700 border-amber-200",
  ADVANCED:     "bg-red-100 text-red-700 border-red-200",
};

export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
  clinicOrganizationId,
}: Props) {
  const [search, setSearch]     = useState("");
  const [phase, setPhase]       = useState<string>("all");
  const [bodyRegion, setRegion] = useState<string>("all");
  const [videoPreview, setVideoPreview] = useState<Exercise | null>(null);
  const [view, setView] = useState<"list" | "create">("list");
  const [localExercises, setLocalExercises] = useState<Exercise[]>([]);
  const [isPending, startTransition] = useTransition();

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    bodyRegion: "",
    difficultyLevel: "",
    exercisePhase: "",
    videoUrl: "",
    isPublic: true,
  });

  const allExercises = useMemo(() => [...exercises, ...localExercises], [exercises, localExercises]);

  const universalExercises = useMemo(
    () => allExercises.filter(
      (ex) => ex.source === "UNIVERSAL" || (ex.source === "CLINIC" && ex.isPublic)
    ),
    [allExercises]
  );

  const myClinicExercises = useMemo(
    () => allExercises.filter(
      (ex) => ex.source === "CLINIC" && ex.organizationId === clinicOrganizationId
    ),
    [allExercises, clinicOrganizationId]
  );

  function applyFilters(list: Exercise[]) {
    const q = search.toLowerCase();
    return list.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      if (phase !== "all" && (ex.exercisePhase ?? "STRENGTHENING") !== phase) return false;
      if (bodyRegion !== "all" && ex.bodyRegion !== bodyRegion) return false;
      return true;
    });
  }

  const filteredUniversal = useMemo(() => applyFilters(universalExercises), [universalExercises, search, phase, bodyRegion]);
  const filteredMyClinic  = useMemo(() => applyFilters(myClinicExercises),  [myClinicExercises,  search, phase, bodyRegion]);

  function handleClose() {
    setView("list");
    setCreateForm({ name: "", description: "", bodyRegion: "", difficultyLevel: "", exercisePhase: "", videoUrl: "", isPublic: true });
    onOpenChange(false);
  }

  function handleTogglePublic(ex: Exercise, next: boolean) {
    startTransition(async () => {
      const result = await toggleExercisePublicAction(ex.id, next);
      if (result.success) {
        setLocalExercises((prev) =>
          prev.map((e) => e.id === ex.id ? { ...e, isPublic: next } : e)
        );
        toast.success(next ? "Exercise is now public" : "Exercise is now private");
      } else {
        toast.error(result.error);
      }
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name || !createForm.bodyRegion || !createForm.difficultyLevel) {
      toast.error("Name, body region, and difficulty are required");
      return;
    }

    startTransition(async () => {
      const result = await createClinicExerciseAction({
        name: createForm.name,
        description: createForm.description || undefined,
        bodyRegion: createForm.bodyRegion,
        difficultyLevel: createForm.difficultyLevel,
        exercisePhase: createForm.exercisePhase || undefined,
        videoUrl: createForm.videoUrl || undefined,
        isPublic: createForm.isPublic,
      });

      if (result.success) {
        const newEx: Exercise = {
          id: result.data.id,
          name: result.data.name,
          bodyRegion: result.data.bodyRegion,
          difficultyLevel: result.data.difficultyLevel,
          exercisePhase: result.data.exercisePhase ?? null,
          videoUrl: result.data.videoUrl ?? null,
          videoProvider: result.data.videoProvider ?? null,
          description: result.data.description ?? null,
          source: "CLINIC",
          organizationId: result.data.organizationId ?? null,
          isPublic: result.data.isPublic,
        };
        setLocalExercises((prev) => [...prev, newEx]);
        toast.success("Exercise created and added");
        onSelect(newEx);
        handleClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function FilterBar() {
    return (
      <div className="px-4 pt-3 pb-2 space-y-2.5 shrink-0 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Category</p>
          <div className="flex flex-wrap gap-1">
            {PHASES.map((p) => (
              <button key={p.value} type="button" onClick={() => setPhase(p.value)}
                className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                  phase === p.value ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                )}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body Region</p>
          <div className="flex flex-wrap gap-1">
            {REGIONS.map((r) => (
              <button key={r.value} type="button" onClick={() => setRegion(r.value)}
                className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                  bodyRegion === r.value ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
                )}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function ExerciseList({ list, showClinicControls }: { list: Exercise[]; showClinicControls?: boolean }) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <p className="text-[11px] text-muted-foreground mb-1">{list.length} exercise{list.length !== 1 ? "s" : ""}</p>
        <div className="space-y-0.5">
          {list.map((ex) => (
            <button key={ex.id} type="button"
              className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => { onSelect(ex); handleClose(); }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{ex.name}</span>
                    {ex.videoUrl && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium shrink-0 hover:bg-blue-100 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setVideoPreview(ex); }}
                      >
                        <Play className="h-2.5 w-2.5" /> Video
                      </span>
                    )}
                    {showClinicControls && ex.source === "CLINIC" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleTogglePublic(ex, !ex.isPublic); }}
                        className={cn(
                          "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border transition-colors",
                          ex.isPublic
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {ex.isPublic ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                        {ex.isPublic ? "Public" : "Private"}
                      </button>
                    )}
                  </div>
                  {ex.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ex.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {ex.bodyRegion.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", DIFFICULTY_COLORS[ex.difficultyLevel])}>
                      {ex.difficultyLevel}
                    </Badge>
                    {ex.exercisePhase && ex.exercisePhase !== "STRENGTHENING" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                        {ex.exercisePhase.charAt(0) + ex.exercisePhase.slice(1).toLowerCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}

          {list.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">No exercises found.</p>
              {(phase !== "all" || bodyRegion !== "all") && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs"
                  onClick={() => { setPhase("all"); setRegion("all"); }}>
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              {view === "create" ? (
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Create New Exercise
                </button>
              ) : (
                <DialogTitle>Add Exercise</DialogTitle>
              )}
              {view === "list" && clinicOrganizationId && (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setView("create")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create New
                </Button>
              )}
            </div>
          </DialogHeader>

          {view === "create" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-name" className="text-xs font-semibold">Name *</Label>
                  <Input
                    id="ex-name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Seated Hip Flexor Stretch"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Body Region *</Label>
                    <Select value={createForm.bodyRegion} onValueChange={(v) => setCreateForm((f) => ({ ...f, bodyRegion: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
                        <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
                        <SelectItem value="CORE">Core</SelectItem>
                        <SelectItem value="FULL_BODY">Full Body</SelectItem>
                        <SelectItem value="BALANCE">Balance</SelectItem>
                        <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Difficulty *</Label>
                    <Select value={createForm.difficultyLevel} onValueChange={(v) => setCreateForm((f) => ({ ...f, difficultyLevel: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BEGINNER">Beginner</SelectItem>
                        <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                        <SelectItem value="ADVANCED">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Phase</Label>
                  <Select value={createForm.exercisePhase} onValueChange={(v) => setCreateForm((f) => ({ ...f, exercisePhase: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select phase..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WARMUP">Warm-up</SelectItem>
                      <SelectItem value="ACTIVATION">Activation</SelectItem>
                      <SelectItem value="STRENGTHENING">Strengthening</SelectItem>
                      <SelectItem value="MOBILITY">Mobility</SelectItem>
                      <SelectItem value="COOLDOWN">Cool-down</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ex-desc" className="text-xs font-semibold">Description</Label>
                  <Textarea
                    id="ex-desc"
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description..."
                    className="text-sm resize-none h-16"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ex-video" className="text-xs font-semibold">Video URL</Label>
                  <Input
                    id="ex-video"
                    value={createForm.videoUrl}
                    onChange={(e) => setCreateForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="YouTube or Vimeo URL"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Visible to all clinics</p>
                    <p className="text-xs text-muted-foreground">When on, this exercise appears in the Universal tab for all clinics</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createForm.isPublic}
                    onClick={() => setCreateForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      createForm.isPublic ? "bg-primary" : "bg-input"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                      createForm.isPublic ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                  <Button type="submit" className="flex-1 h-8 text-xs" disabled={isPending}>
                    {isPending ? "Creating..." : "Create & Add to Program"}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <FilterBar />
              {clinicOrganizationId ? (
                <Tabs defaultValue="universal" className="flex flex-col flex-1 overflow-hidden">
                  <TabsList className="shrink-0 mx-4 mt-2 mb-1 h-8 text-xs">
                    <TabsTrigger value="universal" className="flex-1 text-xs h-6">Universal</TabsTrigger>
                    <TabsTrigger value="my-clinic" className="flex-1 text-xs h-6">My Clinic</TabsTrigger>
                  </TabsList>
                  <TabsContent value="universal" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList list={filteredUniversal} />
                  </TabsContent>
                  <TabsContent value="my-clinic" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList list={filteredMyClinic} showClinicControls />
                  </TabsContent>
                </Tabs>
              ) : (
                <ExerciseList list={filteredUniversal} />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoPreview} onOpenChange={(o) => { if (!o) setVideoPreview(null); }}>
        <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-semibold text-sm truncate pr-4">{videoPreview?.name}</p>
            <button onClick={() => setVideoPreview(null)} className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="w-full bg-black">
            {videoPreview?.videoUrl && (
              <UniversalVideoPlayer url={videoPreview.videoUrl} provider={videoPreview.videoProvider} autoPlay />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

---

## Task 7: Update Patient Page to Pass orgId

**Files:**
- Modify: `app/(platform)/patients/[id]/page.tsx`

- [ ] **Step 1: Pass clerkOrgId to getExercisesForPicker**

Find:
```typescript
getExercisesForPicker(),
```

Replace with:
```typescript
getExercisesForPicker(user.clerkOrgId ?? undefined),
```

- [ ] **Step 2: Pass clinicOrganizationId to ClientCalendar**

Find where `<ClientCalendar` is rendered and add prop:

```tsx
clinicOrganizationId={user.clerkOrgId ?? undefined}
```

---

## Task 8: Wire clinicOrganizationId Through Calendar Components

**Files:**
- Modify: `components/calendar/client-calendar.tsx`
- Modify: `components/calendar/workout-editor-panel.tsx`

- [ ] **Step 1: Add prop to ClientCalendar props interface and pass to WorkoutEditorPanel**

In `components/calendar/client-calendar.tsx`, add to the props interface:

```typescript
clinicOrganizationId?: string;
```

Destructure it in the component and pass it to `<WorkoutEditorPanel`:

```tsx
clinicOrganizationId={clinicOrganizationId}
```

- [ ] **Step 2: Add prop to WorkoutEditorPanelProps and pass to ExercisePickerDialog**

In `components/calendar/workout-editor-panel.tsx`, add to `WorkoutEditorPanelProps`:

```typescript
clinicOrganizationId?: string;
```

Destructure it in the component and pass to `<ExercisePickerDialog`:

```tsx
clinicOrganizationId={clinicOrganizationId}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

---

## Task 9: Update Exercise Library Page

**Files:**
- Modify: `app/(platform)/exercises/page.tsx`

- [ ] **Step 1: Replace the page**

```typescript
import { Suspense } from "react";
import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { ExerciseFilters } from "@/components/exercises/exercise-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BodyRegion, DifficultyLevel, ExercisePhase, ExerciseSource } from "@prisma/client";

interface Props {
  searchParams: Promise<{
    search?: string;
    bodyRegion?: string;
    difficultyLevel?: string;
    exercisePhase?: string;
    equipment?: string;
    source?: string;
  }>;
}

export default async function ExercisesPage({ searchParams }: Props) {
  const user = await requireRole("CLINICIAN");
  const params = await searchParams;
  const activeSource = params.source === "CLINIC" ? "CLINIC" : "UNIVERSAL";

  const exercises = await getExercises({
    search: params.search,
    bodyRegion: params.bodyRegion as BodyRegion | undefined,
    difficultyLevel: params.difficultyLevel as DifficultyLevel | undefined,
    exercisePhase: params.exercisePhase as ExercisePhase | undefined,
    equipment: params.equipment,
    source: activeSource as ExerciseSource,
    organizationId: activeSource === "CLINIC" ? (user.clerkOrgId ?? undefined) : undefined,
  });

  const tabUrl = (source: string) => {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    sp.set("source", source);
    return `/exercises?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Exercise Library</h2>
        <p className="text-muted-foreground">{exercises.length} exercises</p>
      </div>

      <div className="flex gap-1 border-b">
        {(["UNIVERSAL", "CLINIC"] as const).map((src) => (
          <Link
            key={src}
            href={tabUrl(src)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeSource === src
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {src === "UNIVERSAL" ? "Universal" : "My Clinic"}
          </Link>
        ))}
      </div>

      <Suspense fallback={<Skeleton className="h-10 w-full max-w-lg" />}>
        <ExerciseFilters />
      </Suspense>

      {exercises.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Dumbbell className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No exercises found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeSource === "CLINIC"
              ? "Your clinic hasn't added any exercises yet."
              : "Try adjusting your filters, or add a new exercise to the library."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              id={exercise.id}
              name={exercise.name}
              bodyRegion={exercise.bodyRegion}
              difficultyLevel={exercise.difficultyLevel}
              exercisePhase={exercise.exercisePhase}
              equipmentRequired={exercise.equipmentRequired}
              description={exercise.description}
              imageUrl={exercise.imageUrl}
              videoUrl={exercise.videoUrl}
              isActive={exercise.isActive}
              isClinician
              source={exercise.source}
              isPublic={exercise.isPublic}
              organizationId={exercise.organizationId}
              clinicOrganizationId={user.clerkOrgId ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Task 10: Update ExerciseCard with Publish Toggle

**Files:**
- Modify: `components/exercises/exercise-card.tsx`

- [ ] **Step 1: Replace the file entirely**

```typescript
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, PlayCircle, ArrowRight, Globe, Lock } from "lucide-react";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { toggleExercisePublicAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhase?: string | null;
  equipmentRequired: string[];
  description?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isActive?: boolean;
  isClinician?: boolean;
  source?: string;
  isPublic?: boolean;
  organizationId?: string | null;
  clinicOrganizationId?: string | null;
}

const difficultyConfig: Record<string, { label: string; className: string }> = {
  BEGINNER: { label: "Beginner", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "Intermediate", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ADVANCED: { label: "Advanced", className: "bg-red-100 text-red-700 border-red-200" },
};

const phaseConfig: Record<string, { label: string; className: string }> = {
  WARMUP: { label: "Warmup", className: "bg-orange-900/70 text-orange-200" },
  ACTIVATION: { label: "Activation", className: "bg-yellow-900/70 text-yellow-200" },
  STRENGTHENING: { label: "Strengthening", className: "bg-blue-900/70 text-blue-200" },
  MOBILITY: { label: "Mobility", className: "bg-purple-900/70 text-purple-200" },
  COOLDOWN: { label: "Cooldown", className: "bg-teal-900/70 text-teal-200" },
};

export function ExerciseCard({
  id, name, bodyRegion, difficultyLevel, exercisePhase, equipmentRequired,
  description, imageUrl, videoUrl, isActive, isClinician,
  source, isPublic: initialIsPublic, organizationId, clinicOrganizationId,
}: ExerciseCardProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic ?? true);
  const [isPending, startTransition] = useTransition();

  const isMyClinicExercise =
    source === "CLINIC" && organizationId && organizationId === clinicOrganizationId;

  const difficulty = difficultyConfig[difficultyLevel] ?? { label: formatDifficulty(difficultyLevel), className: "bg-muted text-muted-foreground border-border" };
  const phase = exercisePhase ? (phaseConfig[exercisePhase] ?? { label: exercisePhase, className: "bg-black/60 text-white" }) : null;

  function handleTogglePublic() {
    const next = !isPublic;
    startTransition(async () => {
      const result = await toggleExercisePublicAction(id, next);
      if (result.success) {
        setIsPublic(next);
        toast.success(next ? "Exercise is now public" : "Exercise is now private");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className={`group relative flex flex-col overflow-hidden border-0 shadow-sm ring-1 ring-border/50 transition-all duration-250 hover:-translate-y-1 hover:shadow-xl hover:ring-border/80 ${isActive === false ? "opacity-60" : ""}`}>
      <Link href={`/exercises/${id}`} className="relative block h-44 overflow-hidden bg-muted">
        <ExerciseImage src={null} alt={name} bodyRegion={bodyRegion} videoUrl={videoUrl} label={name.split(" ").slice(0, 3).join(" ")} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur-sm">
            <ArrowRight className="h-3.5 w-3.5" />
            View Exercise
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5">
          {phase && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${phase.className}`}>{phase.label}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {videoUrl && (
              <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <PlayCircle className="h-3 w-3" />Video
              </span>
            )}
            {isActive === false && (
              <span className="rounded-full bg-slate-700/80 px-2 py-0.5 text-[10px] font-medium text-white">Inactive</span>
            )}
          </div>
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/exercises/${id}`} className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight transition-colors group-hover:text-primary">{name}</h3>
          </Link>
          <Badge className={`shrink-0 border text-[10px] font-semibold ${difficulty.className}`}>{difficulty.label}</Badge>
        </div>

        <p className="mt-1 text-xs font-medium text-muted-foreground/70">{formatBodyRegion(bodyRegion)}</p>

        {description && (
          <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}

        {equipmentRequired.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {equipmentRequired.slice(0, 3).map((eq) => (
              <Badge key={eq} variant="outline" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">{eq}</Badge>
            ))}
            {equipmentRequired.length > 3 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">+{equipmentRequired.length - 3}</Badge>
            )}
          </div>
        )}

        {isClinician && (
          <div className="mt-3 flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1 h-7 gap-1.5 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100" asChild>
              <Link href={`/exercises/${id}/edit`}><Edit className="h-3 w-3" />Edit</Link>
            </Button>
            {isMyClinicExercise && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100",
                  isPublic ? "text-green-700 border-green-200 hover:bg-green-50" : "text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
                onClick={handleTogglePublic}
                disabled={isPending}
              >
                {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {isPublic ? "Public" : "Private"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Task 11: Final Verification

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

---

## Self-Review Notes

- Spec: inline exercise creation in picker → Task 6 (inline create view inside dialog)
- Spec: Universal / My Clinic tabs in picker → Task 6
- Spec: Universal / My Clinic tabs in exercise library → Task 9
- Spec: public/private toggle → Task 6 (picker) + Task 10 (library card)
- Spec: AI generation sees both sources → automatic via updated `getExercisesForPicker` in Task 2
- `clinicOrganizationId` threaded through: patient page → ClientCalendar → WorkoutEditorPanel → ExercisePickerDialog (Tasks 7–8)
- All type changes are additive (optional fields) — no breaking changes to existing callers
