# Execution Blueprint: Exercise Library Enrichment, AI Overhaul, PDF Export, and Video Integration

---

## 1. Implementation Overview

**What is being built:** Four interconnected features for the AI Home Exercise Platform:
1. Exercise Library Enrichment -- new schema fields, 100-120 enriched seed exercises, ClinicProfile model, and clinic settings page
2. AI Generation Overhaul -- phase-based exercise prescription with clinical prompts, pre-filtering, and post-processing
3. Professional PDF Export -- branded A4 PDF generation with `@react-pdf/renderer`, API route, and print preview page
4. Video Integration -- YouTube URL utilities, unified video player component, Uploadthing video uploads

**Final outcome:** Clinicians can generate clinically-structured workout plans (phase-ordered), view/embed exercise videos from YouTube or Uploadthing, configure their clinic branding, and export professional branded PDF handouts for their clients.

**Key constraints:**
- MongoDB with Prisma (no SQL migrations -- use `prisma db push`)
- `@react-pdf/renderer` v4.3.2 already in `package.json` -- no install needed
- `@uploadthing/react` already in deps but no `app/api/uploadthing/` route exists yet
- All new seed exercises must have `isActive: false` (clinician review required)
- Existing ~55 exercises in DB must be updated (upsert), not duplicated
- No PII sent to OpenAI

**Assumptions:**
- The `public/images/` directory does not exist yet and must be created
- The `app/(platform)/workout-plans/[id]/session/` route does not exist (session tracking is inline)
- The Uploadthing file router at `lib/uploadthing.ts` does not exist yet (file was not found)

---

## 2. Development Strategy

**Approach:** Foundation-first, then parallel feature branches.

Phase 1 (Foundation) must complete first because Phase 2 (AI) depends on the new Exercise fields, and Phase 4 (PDF) depends on ClinicProfile. Phase 3 (Video) has no dependency on Phase 1 schema changes and can run in parallel with Phase 2. Phase 4 depends on Phase 1 (ClinicProfile for branding) and Phase 3 (video thumbnails in PDFs).

**Build order:**
```
Phase 1 (Foundation) ──┬──> Phase 2 (AI Overhaul)
                       │
                       └──> Phase 4 (PDF) [after Phase 3 also completes]
                       
Phase 3 (Video) ───────────> [can start immediately, parallel with Phase 2]
```

---

## 3. Phase-by-Phase Implementation Plan

---

### PHASE 1: Foundation (Schema + Seed + Clinic Profile)

**Goals:** Extend the Exercise model, create ClinicProfile model, seed 100-120 enriched exercises, build clinic settings page.

**Estimated complexity:** Large

**Dependencies:** None (this is the foundation)

---

#### Task 1.1: Update Prisma Schema

**File:** `d:\exercise-webapp\prisma\schema.prisma`

**What to do:**

1. Add the `ExercisePhase` enum after the existing `BodyRegion` enum (after line 36):

```prisma
enum ExercisePhase {
  WARMUP
  ACTIVATION
  STRENGTHENING
  MOBILITY
  COOLDOWN
}
```

2. Add new fields to the `Exercise` model (after line 121, before `createdById`):

```prisma
  musclesTargeted    String[]
  exercisePhase      ExercisePhase?
  commonMistakes     String?
  defaultSets        Int?
  defaultReps        Int?
  defaultHoldSeconds Int?
  cuesThumbnail      String?
```

3. Add the `ClinicProfile` model at the end of the file (before the closing):

```prisma
model ClinicProfile {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  clinicianId String   @unique @db.ObjectId
  clinician   User     @relation(fields: [clinicianId], references: [id], onDelete: Cascade)
  clinicName  String
  tagline     String?
  logoUrl     String?
  phone       String?
  email       String?
  website     String?
  address     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

4. Add the relation field to the `User` model (after line 81, before the closing brace):

```prisma
  clinicProfile  ClinicProfile?
```

**Verification:** Run `npx prisma validate` -- should pass with no errors.

---

#### Task 1.2: Push Schema to MongoDB

**Commands to run (sequential):**

```bash
cd d:\exercise-webapp
npx prisma db push
npx prisma generate
```

**Verification:** `npx prisma studio` should show the new `ExercisePhase` field on Exercise and the new `ClinicProfile` collection.

---

#### Task 1.3: Create Enriched Exercise Seed Data

**File to create:** `d:\exercise-webapp\lib\db\seed\exercises-v2.ts`

This file exports a single array of 100-120 exercise objects. Every object must have ALL fields populated (new fields included). The `isActive` field must be `false` for all new exercises.

**Type definition for each exercise object:**

```typescript
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";

export interface SeedExercise {
  name: string;
  description: string;
  bodyRegion: BodyRegion;
  difficultyLevel: DifficultyLevel;
  exercisePhase: ExercisePhase;
  musclesTargeted: string[];
  equipmentRequired: string[];
  contraindications: string[];
  instructions: string;
  commonMistakes: string;
  defaultSets: number;
  defaultReps: number | null;
  defaultHoldSeconds: number | null;
  cuesThumbnail: string;
  imageUrl: string | null;
  videoUrl: string | null;
  isActive: boolean;
}
```

**Export signature:**

```typescript
export const exercisesV2: SeedExercise[] = [ ... ];
```

**Distribution requirements (total 100-120):**

| Body Region | Count | Phase Coverage |
|-------------|-------|----------------|
| LOWER_BODY | 25-30 | All 5 phases, all 3 difficulties |
| UPPER_BODY | 20-25 | All 5 phases, all 3 difficulties |
| CORE | 20-25 | All 5 phases, all 3 difficulties |
| BALANCE | 10-15 | WARMUP, ACTIVATION, STRENGTHENING, COOLDOWN |
| FLEXIBILITY | 10-15 | WARMUP, MOBILITY, COOLDOWN |
| FULL_BODY | 5-10 | WARMUP, STRENGTHENING, COOLDOWN |

**Rules for each exercise:**
- `defaultReps` is populated for dynamic exercises (WARMUP, ACTIVATION, STRENGTHENING). Set `defaultHoldSeconds` to `null`.
- `defaultHoldSeconds` is populated for isometric/stretch exercises (MOBILITY, COOLDOWN). Set `defaultReps` to `null`.
- `commonMistakes` must be 1-3 sentences describing the most frequent form errors.
- `cuesThumbnail` must be 2-3 short coaching cues separated by periods.
- `musclesTargeted` must list 2-5 specific muscles (e.g., `["gluteus medius", "gluteus minimus", "tensor fasciae latae"]`).
- `isActive: false` for all exercises (clinician must review before activating).
- `imageUrl: null` and `videoUrl: null` for all.

**Example entries the developer must follow as a pattern:**

```typescript
// LOWER_BODY - ACTIVATION - BEGINNER
{
  name: "Clamshells",
  description: "Hip external rotator and gluteus medius strengthening in side-lying position.",
  bodyRegion: "LOWER_BODY",
  difficultyLevel: "BEGINNER",
  exercisePhase: "ACTIVATION",
  musclesTargeted: ["gluteus medius", "gluteus minimus", "piriformis"],
  equipmentRequired: [],
  contraindications: ["acute hip labral tear"],
  instructions: "Lie on your side with hips stacked and knees bent at 45 degrees. Keep feet together. Rotate the top knee upward like a clamshell opening, then lower slowly. Do not let the pelvis roll backward.",
  commonMistakes: "Rolling the pelvis backward during the lift; lifting from the ankle instead of the knee; rushing the lowering phase.",
  defaultSets: 3,
  defaultReps: 15,
  defaultHoldSeconds: null,
  cuesThumbnail: "Keep feet together. Lift from the knee, not the ankle. Do not let hips roll back.",
  imageUrl: null,
  videoUrl: null,
  isActive: false,
},

// CORE - COOLDOWN - BEGINNER (hold-based)
{
  name: "Child's Pose",
  description: "Gentle spinal flexion stretch and relaxation position targeting the lower back and lats.",
  bodyRegion: "CORE",
  difficultyLevel: "BEGINNER",
  exercisePhase: "COOLDOWN",
  musclesTargeted: ["erector spinae", "latissimus dorsi", "quadratus lumborum"],
  equipmentRequired: ["mat"],
  contraindications: ["knee replacement (recent)"],
  instructions: "Kneel on the floor. Sit back on your heels and fold forward, reaching arms out in front. Rest forehead on the floor. Breathe deeply and hold.",
  commonMistakes: "Not sitting fully back on the heels; holding breath instead of breathing deeply; forcing the stretch.",
  defaultSets: 2,
  defaultReps: null,
  defaultHoldSeconds: 30,
  cuesThumbnail: "Sit fully back on heels. Breathe deeply. Let gravity do the work.",
  imageUrl: null,
  videoUrl: null,
  isActive: false,
},
```

**CRITICAL:** The developer must create 100-120 exercises following this exact pattern. Every single exercise must have all fields filled. The exercises must be real, clinically appropriate rehabilitation exercises. Do not use placeholder text.

**Verification:** The exported array length must be >= 100 and <= 120. Every object must have all fields from the `SeedExercise` interface. Run TypeScript compilation to verify.

---

#### Task 1.4: Update Seed Script

**File to modify:** `d:\exercise-webapp\lib\db\seed\seed.ts`

Replace the entire file with:

```typescript
import { PrismaClient } from "@prisma/client";
import { exercisesV2 } from "./exercises-v2";

const prisma = new PrismaClient();

async function main() {
  console.log(`Seeding exercise library with ${exercisesV2.length} exercises...`);

  let created = 0;
  let updated = 0;

  for (const exercise of exercisesV2) {
    const existing = await prisma.exercise.findFirst({
      where: { name: exercise.name },
    });

    if (existing) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: {
          description: exercise.description,
          bodyRegion: exercise.bodyRegion,
          difficultyLevel: exercise.difficultyLevel,
          exercisePhase: exercise.exercisePhase,
          musclesTargeted: exercise.musclesTargeted,
          equipmentRequired: exercise.equipmentRequired,
          contraindications: exercise.contraindications,
          instructions: exercise.instructions,
          commonMistakes: exercise.commonMistakes,
          defaultSets: exercise.defaultSets,
          defaultReps: exercise.defaultReps,
          defaultHoldSeconds: exercise.defaultHoldSeconds,
          cuesThumbnail: exercise.cuesThumbnail,
        },
      });
      updated++;
    } else {
      await prisma.exercise.create({
        data: exercise,
      });
      created++;
    }
  }

  console.log(
    `Done: ${created} exercises created, ${updated} exercises updated. Total: ${exercisesV2.length}`
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

**Key behavior change:** Uses upsert (match by `name`, update if exists). Existing exercises that match by name get their new fields populated. New exercises are created with `isActive: false`.

**Verification:** Run `npx tsx lib/db/seed/seed.ts`. Console output should show created + updated counts. Open Prisma Studio and verify a few exercises have `exercisePhase`, `musclesTargeted`, `commonMistakes`, etc. populated.

---

#### Task 1.5: Create Clinic Profile Service

**File to create:** `d:\exercise-webapp\lib\services\clinic.service.ts`

```typescript
import { prisma } from "@/lib/prisma";

export async function getClinicProfile(clinicianId: string) {
  return prisma.clinicProfile.findUnique({
    where: { clinicianId },
  });
}

export async function upsertClinicProfile(
  clinicianId: string,
  data: {
    clinicName: string;
    tagline?: string | null;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
  }
) {
  return prisma.clinicProfile.upsert({
    where: { clinicianId },
    update: {
      clinicName: data.clinicName,
      tagline: data.tagline ?? null,
      logoUrl: data.logoUrl ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      address: data.address ?? null,
    },
    create: {
      clinicianId,
      clinicName: data.clinicName,
      tagline: data.tagline ?? null,
      logoUrl: data.logoUrl ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      address: data.address ?? null,
    },
  });
}
```

**Verification:** TypeScript compiles without errors.

---

#### Task 1.6: Create Clinic Profile Validator

**File to create:** `d:\exercise-webapp\lib\validators\clinic.ts`

```typescript
import { z } from "zod";

export const clinicProfileSchema = z.object({
  clinicName: z.string().min(1, "Clinic name is required").max(200),
  tagline: z.string().max(500).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
});

export type ClinicProfileInput = z.infer<typeof clinicProfileSchema>;
```

---

#### Task 1.7: Create Clinic Profile Server Actions

**File to create:** `d:\exercise-webapp\actions\clinic-actions.ts`

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { clinicProfileSchema } from "@/lib/validators/clinic";
import * as clinicService from "@/lib/services/clinic.service";

export async function saveClinicProfileAction(input: {
  clinicName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN")
    return { success: false as const, error: "Forbidden" };

  const parsed = clinicProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const profile = await clinicService.upsertClinicProfile(dbUser.id, {
      clinicName: parsed.data.clinicName,
      tagline: parsed.data.tagline || null,
      logoUrl: parsed.data.logoUrl || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      website: parsed.data.website || null,
      address: parsed.data.address || null,
    });

    revalidatePath("/settings/clinic");
    return { success: true as const, data: profile };
  } catch (error) {
    console.error("Failed to save clinic profile:", error);
    return { success: false as const, error: "Failed to save clinic profile" };
  }
}
```

**Note:** The logo upload will use the Uploadthing `UploadButton` on the client side directly -- the uploaded URL is then saved via `saveClinicProfileAction` as `logoUrl`. No separate `uploadClinicLogoAction` is needed because Uploadthing handles uploads client-side and returns the URL.

---

#### Task 1.8: Create Uploadthing API Route

The `app/api/uploadthing/` route does not exist. It must be created for Uploadthing to work.

**File to create:** `d:\exercise-webapp\lib\uploadthing.ts`

Since this file was listed as existing but was not found, create it:

```typescript
import { createUploadthing, type FileRouter } from "uploadthing/server";
import { auth } from "@clerk/nextjs/server";

const f = createUploadthing();

export const ourFileRouter = {
  clinicLogo: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Clinic logo uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),

  exerciseVideo: f({ video: { maxFileSize: "64MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Exercise video uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),

  exerciseImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Exercise image uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
```

**File to create:** `d:\exercise-webapp\app\api\uploadthing\route.ts`

```typescript
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});
```

---

#### Task 1.9: Create Clinic Settings Page

**File to create:** `d:\exercise-webapp\app\(platform)\settings\clinic\page.tsx`

This is a server component that fetches the existing clinic profile (if any) and renders a client component form.

```typescript
import { requireRole } from "@/lib/current-user";
import { getClinicProfile } from "@/lib/services/clinic.service";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";

export default async function ClinicSettingsPage() {
  const user = await requireRole("CLINICIAN");
  const profile = await getClinicProfile(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Clinic Profile</h2>
        <p className="text-slate-600">
          Customize your clinic branding for PDF exports
        </p>
      </div>
      <ClinicProfileForm
        initialData={
          profile
            ? {
                clinicName: profile.clinicName,
                tagline: profile.tagline ?? "",
                logoUrl: profile.logoUrl ?? "",
                phone: profile.phone ?? "",
                email: profile.email ?? "",
                website: profile.website ?? "",
                address: profile.address ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
```

**Client component to create:** `d:\exercise-webapp\components\settings\clinic-profile-form.tsx`

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveClinicProfileAction } from "@/actions/clinic-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";
import Image from "next/image";

interface ClinicProfileFormProps {
  initialData?: {
    clinicName: string;
    tagline: string;
    logoUrl: string;
    phone: string;
    email: string;
    website: string;
    address: string;
  };
}

export function ClinicProfileForm({ initialData }: ClinicProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const result = await saveClinicProfileAction({
      clinicName: formData.get("clinicName") as string,
      tagline: (formData.get("tagline") as string) || undefined,
      logoUrl: logoUrl || undefined,
      phone: (formData.get("phone") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      website: (formData.get("website") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Clinic profile saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Clinic Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="clinicName">Clinic Name *</Label>
            <Input
              id="clinicName"
              name="clinicName"
              required
              defaultValue={initialData?.clinicName ?? ""}
              placeholder="e.g., Summit Physical Therapy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={initialData?.tagline ?? ""}
              placeholder="e.g., Evidence-based rehabilitation"
            />
          </div>

          <div className="space-y-2">
            <Label>Clinic Logo</Label>
            {logoUrl && (
              <div className="mb-2">
                <Image
                  src={logoUrl}
                  alt="Clinic logo"
                  width={80}
                  height={80}
                  className="rounded-md border"
                />
              </div>
            )}
            <UploadButton<OurFileRouter, "clinicLogo">
              endpoint="clinicLogo"
              onClientUploadComplete={(res) => {
                if (res?.[0]?.ufsUrl) {
                  setLogoUrl(res[0].ufsUrl);
                  toast.success("Logo uploaded");
                }
              }}
              onUploadError={(error: Error) => {
                toast.error(`Upload failed: ${error.message}`);
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={initialData?.phone ?? ""}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={initialData?.email ?? ""}
                placeholder="clinic@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={initialData?.website ?? ""}
              placeholder="https://www.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={initialData?.address ?? ""}
              placeholder="123 Main St, Suite 100, City, State ZIP"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
```

**Verification:** Navigate to `/settings/clinic`. The form should render. Submit with a clinic name. Check Prisma Studio for the new `ClinicProfile` document.

---

### PHASE 2: AI Service Overhaul

**Goals:** Update the AI generation to use phase-based exercise selection, clinical prompts, pre-filtering, and post-processing.

**Estimated complexity:** Medium

**Dependencies:** Phase 1 (new Exercise fields must exist in schema and be populated in seed data)

---

#### Task 2.1: Overhaul AI Service

**File to modify:** `d:\exercise-webapp\lib\services\ai.service.ts`

Replace the entire file contents:

```typescript
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { BodyRegion, ExercisePhase } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateWorkoutParams {
  patientId?: string | null;
  focusAreas: string[];
  durationMinutes: number;
  daysPerWeek: number;
  difficultyLevel: string;
  additionalNotes?: string;
}

interface GeneratedExercise {
  exerciseId: string;
  exerciseName: string;
  phase: string;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  restSeconds?: number;
  dayOfWeek?: number;
  orderIndex: number;
  notes?: string;
}

interface GeneratedPlan {
  title: string;
  description: string;
  exercises: GeneratedExercise[];
}

// Map focusAreas strings to BodyRegion enum values
function mapFocusAreasToBodyRegions(focusAreas: string[]): BodyRegion[] {
  const mapping: Record<string, BodyRegion> = {
    lower: "LOWER_BODY",
    "lower body": "LOWER_BODY",
    lower_body: "LOWER_BODY",
    leg: "LOWER_BODY",
    legs: "LOWER_BODY",
    hip: "LOWER_BODY",
    knee: "LOWER_BODY",
    ankle: "LOWER_BODY",
    upper: "UPPER_BODY",
    "upper body": "UPPER_BODY",
    upper_body: "UPPER_BODY",
    arm: "UPPER_BODY",
    arms: "UPPER_BODY",
    shoulder: "UPPER_BODY",
    wrist: "UPPER_BODY",
    core: "CORE",
    abdominal: "CORE",
    back: "CORE",
    "lower back": "CORE",
    balance: "BALANCE",
    flexibility: "FLEXIBILITY",
    stretch: "FLEXIBILITY",
    stretching: "FLEXIBILITY",
    "full body": "FULL_BODY",
    full_body: "FULL_BODY",
    general: "FULL_BODY",
  };

  const regions = new Set<BodyRegion>();
  for (const area of focusAreas) {
    const lower = area.toLowerCase().trim();
    if (mapping[lower]) {
      regions.add(mapping[lower]);
    }
    // Also check partial matches
    for (const [key, region] of Object.entries(mapping)) {
      if (lower.includes(key) || key.includes(lower)) {
        regions.add(region);
      }
    }
  }

  // If no mapping found, return all regions
  if (regions.size === 0) {
    return [
      "LOWER_BODY",
      "UPPER_BODY",
      "CORE",
      "FULL_BODY",
      "BALANCE",
      "FLEXIBILITY",
    ];
  }

  return Array.from(regions);
}

// Phase ordering for post-processing
const PHASE_ORDER: Record<string, number> = {
  WARMUP: 0,
  ACTIVATION: 1,
  STRENGTHENING: 2,
  MOBILITY: 3,
  COOLDOWN: 4,
};

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams
): Promise<GeneratedPlan> {
  // Fetch client profile for context
  const patient = params.patientId
    ? await prisma.user.findUnique({
        where: { id: params.patientId },
        include: { patientProfile: true },
      })
    : null;

  const profile = patient?.patientProfile ?? null;

  // Map focus areas to body regions for pre-filtering
  const targetRegions = mapFocusAreasToBodyRegions(params.focusAreas);

  // Parse patient limitations for contraindication filtering
  const patientLimitations = profile?.limitations
    ? profile.limitations
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Fetch exercises with enriched fields
  const allExercises = await prisma.exercise.findMany({
    where: {
      isActive: true,
      bodyRegion: { in: targetRegions },
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      equipmentRequired: true,
      contraindications: true,
      description: true,
      musclesTargeted: true,
      exercisePhase: true,
      commonMistakes: true,
      defaultSets: true,
      defaultReps: true,
      defaultHoldSeconds: true,
      cuesThumbnail: true,
    },
  });

  // Filter out exercises with contraindication overlap
  const filtered = allExercises.filter((exercise) => {
    if (patientLimitations.length === 0) return true;
    const contraLower = exercise.contraindications.map((c) => c.toLowerCase());
    return !patientLimitations.some((limitation) =>
      contraLower.some(
        (contra) =>
          contra.includes(limitation) || limitation.includes(contra)
      )
    );
  });

  // Limit to 60 exercises max to control token usage
  const exercises = filtered.slice(0, 60);

  if (exercises.length === 0) {
    throw new Error(
      "No suitable exercises found for the given focus areas and patient profile."
    );
  }

  const systemPrompt = `You are a licensed rehabilitation specialist creating evidence-based home exercise programs (HEPs). You produce programs following clinical exercise prescription standards:

1. Every session must follow this EXACT phase order by orderIndex: WARMUP (1-2 exercises) -> ACTIVATION (1-2 exercises) -> STRENGTHENING (2-4 exercises) -> MOBILITY (1-2 exercises) -> COOLDOWN (1 exercise).
2. NEVER repeat the same exercise across different days in the same program.
3. Vary muscle groups across days. Day 1 targeting hip abductors must not have Day 2 also targeting hip abductors as primary muscles.
4. Provide 2-3 specific clinical form cues per exercise in the notes field, referencing common mistakes to avoid.
5. Use the exercise's defaultSets/defaultReps/defaultHoldSeconds as baseline. Adjust down 20% for BEGINNER, use as-is for INTERMEDIATE, adjust up 20% for ADVANCED.
6. For stretch/isometric exercises (COOLDOWN, MOBILITY phase), use durationSeconds not reps. For dynamic exercises, use reps not durationSeconds.
7. Rest periods: WARMUP 15s, ACTIVATION 30s, STRENGTHENING 60s, MOBILITY 20s, COOLDOWN 0s.
8. Total session time must be within 5 minutes of the requested duration.

Respond with valid JSON only. No markdown, no explanation.`;

  const clientContext = patient
    ? `Client: ${patient.firstName} ${patient.lastName}
${profile?.limitations ? `Limitations: ${profile.limitations}` : ""}
${profile?.comorbidities ? `Comorbidities: ${profile.comorbidities}` : ""}
${profile?.functionalChallenges ? `Functional Challenges: ${profile.functionalChallenges}` : ""}
${profile?.availableEquipment?.length ? `Available Equipment: ${profile.availableEquipment.join(", ")}` : "No equipment"}
${profile?.fitnessGoals?.length ? `Goals: ${profile.fitnessGoals.join(", ")}` : ""}`
    : "No specific client assigned. Create a general program suitable for the parameters below.";

  const exerciseListStr = exercises
    .map(
      (e) =>
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhase ?? "STRENGTHENING"} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(", ")} | Equipment: ${e.equipmentRequired.join(", ") || "None"} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + "s hold" : "10"} | Mistakes: ${e.commonMistakes || "N/A"} | Cues: ${e.cuesThumbnail || "N/A"}`
    )
    .join("\n");

  const userPrompt = `Create an exercise program with the following details:

${clientContext}

Program Parameters:
- Focus Areas: ${params.focusAreas.join(", ")}
- Duration: ~${params.durationMinutes} minutes per session
- Days per Week: ${params.daysPerWeek}
- Difficulty Level: ${params.difficultyLevel}
${params.additionalNotes ? `- Additional Notes: ${params.additionalNotes}` : ""}

Available Exercises (use ONLY these exercise IDs):
${exerciseListStr}

Respond with this exact JSON structure:
{
  "title": "Program title",
  "description": "2-3 sentence clinical program description",
  "exercises": [
    {
      "exerciseId": "the exercise ID from the list above",
      "exerciseName": "exercise name",
      "phase": "ACTIVATION",
      "sets": 3,
      "reps": 15,
      "durationSeconds": null,
      "restSeconds": 30,
      "dayOfWeek": 1,
      "orderIndex": 2,
      "notes": "2-3 clinical form cues specific to this patient"
    }
  ]
}

Rules:
1. ONLY use exercise IDs from the list provided
2. Respect patient limitations and contraindications
3. Match the difficulty level requested
4. Distribute exercises across ${params.daysPerWeek} days (dayOfWeek: 1-${params.daysPerWeek})
5. Keep total session time around ${params.durationMinutes} minutes
6. Use either reps OR durationSeconds per exercise, not both (set unused to null)
7. Follow the phase ordering strictly`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const responseText = response.choices[0].message.content ?? "";
  const parsed = JSON.parse(responseText) as GeneratedPlan;

  // Validate that all exercise IDs exist
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const validExercises = parsed.exercises.filter((e) =>
    exerciseIds.has(e.exerciseId)
  );

  if (validExercises.length === 0) {
    throw new Error("AI generated no valid exercises. Please try again.");
  }

  // Post-processing: sort exercises per day by phase order
  const sortedExercises = [...validExercises].sort((a, b) => {
    // First sort by day
    const dayA = a.dayOfWeek ?? 0;
    const dayB = b.dayOfWeek ?? 0;
    if (dayA !== dayB) return dayA - dayB;

    // Then by phase order
    const phaseA = PHASE_ORDER[a.phase] ?? 2;
    const phaseB = PHASE_ORDER[b.phase] ?? 2;
    if (phaseA !== phaseB) return phaseA - phaseB;

    // Then by original orderIndex
    return a.orderIndex - b.orderIndex;
  });

  // Reassign orderIndex after sorting
  let currentDay = -1;
  let dayOrder = 0;
  for (const exercise of sortedExercises) {
    const day = exercise.dayOfWeek ?? 0;
    if (day !== currentDay) {
      currentDay = day;
      dayOrder = 0;
    }
    exercise.orderIndex = dayOrder++;
  }

  // Detect cross-day duplicates (log but allow)
  const exercisesByDay = new Map<number, Set<string>>();
  for (const ex of sortedExercises) {
    const day = ex.dayOfWeek ?? 0;
    if (!exercisesByDay.has(day)) exercisesByDay.set(day, new Set());
    exercisesByDay.get(day)!.add(ex.exerciseId);
  }
  const allUsedIds = sortedExercises.map((e) => e.exerciseId);
  const duplicateIds = allUsedIds.filter(
    (id, i) => allUsedIds.indexOf(id) !== i
  );
  if (duplicateIds.length > 0) {
    console.warn(
      `[AI] Cross-day duplicate exercises detected: ${[...new Set(duplicateIds)].join(", ")}`
    );
  }

  return {
    ...parsed,
    exercises: sortedExercises,
  };
}
```

**Verification:**
1. TypeScript compiles without errors.
2. Generate a plan via the UI (or call `generatePlanAction` directly). The resulting plan exercises should be sorted by phase within each day.
3. Check console for any duplicate warnings.

---

### PHASE 3: Video Integration (parallel with Phase 2)

**Goals:** YouTube URL utilities, video player component, exercise form update.

**Estimated complexity:** Small-Medium

**Dependencies:** None (can start immediately)

---

#### Task 3.1: Create Video Utility Functions

**File to create:** `d:\exercise-webapp\lib\utils\video.ts`

```typescript
export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "youtu.be" ||
      parsed.hostname === "www.youtube-nocookie.com" ||
      parsed.hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);

    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }

    // youtube.com/watch?v=VIDEO_ID
    const vParam = parsed.searchParams.get("v");
    if (vParam) return vParam;

    // youtube.com/embed/VIDEO_ID
    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];

    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];

    return null;
  } catch {
    return null;
  }
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
```

**Verification:** Write a quick test or run in a REPL:
- `extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")` returns `"dQw4w9WgXcQ"`
- `extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")` returns `"dQw4w9WgXcQ"`
- `extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")` returns `"dQw4w9WgXcQ"`

---

#### Task 3.2: Create Exercise Video Player Component

**File to create:** `d:\exercise-webapp\components\exercises\exercise-video-player.tsx`

```typescript
"use client";

import {
  isYouTubeUrl,
  extractYouTubeId,
  getYouTubeEmbedUrl,
} from "@/lib/utils/video";

interface MediaItem {
  id: string;
  mediaType: string;
  url: string;
  thumbnailUrl?: string | null;
  altText?: string | null;
}

interface ExerciseVideoPlayerProps {
  videoUrl?: string | null;
  mediaItems?: MediaItem[];
  className?: string;
}

export function ExerciseVideoPlayer({
  videoUrl,
  mediaItems,
  className = "",
}: ExerciseVideoPlayerProps) {
  // Priority 1: Check mediaItems for uploaded video
  const uploadedVideo = mediaItems?.find(
    (item) => item.mediaType === "video"
  );
  if (uploadedVideo) {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-lg ${className}`}>
        <video
          src={uploadedVideo.url}
          controls
          className="h-full w-full object-contain"
          preload="metadata"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  // Priority 2: YouTube URL
  if (videoUrl && isYouTubeUrl(videoUrl)) {
    const videoId = extractYouTubeId(videoUrl);
    if (videoId) {
      return (
        <div className={`relative aspect-video w-full overflow-hidden rounded-lg ${className}`}>
          <iframe
            src={getYouTubeEmbedUrl(videoId)}
            width="100%"
            height="100%"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full"
            title="Exercise video"
          />
        </div>
      );
    }
  }

  // Priority 3: Non-YouTube direct video URL
  if (videoUrl) {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-lg ${className}`}>
        <video
          src={videoUrl}
          controls
          className="h-full w-full object-contain"
          preload="metadata"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  // No video available -- render nothing
  return null;
}
```

---

#### Task 3.3: Update Exercise Form

**File to modify:** `d:\exercise-webapp\components\exercises\exercise-form.tsx`

Find the video URL input section (around lines 132-141):

```typescript
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL</Label>
              <Input id="videoUrl" name="videoUrl" type="url" placeholder="https://" />
            </div>
```

Replace with:

```typescript
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL</Label>
              <Input
                id="videoUrl"
                name="videoUrl"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="text-xs text-slate-500">
                Paste a YouTube URL, Vimeo URL, or any direct video link
              </p>
            </div>
            <div className="space-y-2">
              <Label>Or Upload Video</Label>
              <UploadButton<OurFileRouter, "exerciseVideo">
                endpoint="exerciseVideo"
                onClientUploadComplete={(res) => {
                  if (res?.[0]?.ufsUrl) {
                    toast.success("Video uploaded successfully");
                    // Store URL in a hidden input or state -- for now just show success
                    // The uploaded video URL will be stored as ExerciseMedia via the backend
                  }
                }}
                onUploadError={(error: Error) => {
                  toast.error(`Upload failed: ${error.message}`);
                }}
              />
              <p className="text-xs text-slate-500">
                Upload a video file directly (max 64MB)
              </p>
            </div>
          </div>
          <div className="space-y-2">
```

**Additional imports to add** at the top of the file:

```typescript
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";
```

**Note:** The `type="url"` on the imageUrl input is on the same grid row. Since we broke the grid, the imageUrl field needs to be handled. Keep the imageUrl field but outside the grid:

The original lines 132-141 are:
```
<div className="grid gap-4 sm:grid-cols-2">
  <div className="space-y-2">
    <Label htmlFor="videoUrl">Video URL</Label>
    <Input id="videoUrl" name="videoUrl" type="url" placeholder="https://" />
  </div>
  <div className="space-y-2">
    <Label htmlFor="imageUrl">Image URL</Label>
    <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://" />
  </div>
</div>
```

Replace the entire block with:

```typescript
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL</Label>
              <Input
                id="videoUrl"
                name="videoUrl"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="text-xs text-slate-500">
                Paste a YouTube URL, Vimeo URL, or any direct video link
              </p>
            </div>
            <div className="space-y-2">
              <Label>Or Upload Video Directly</Label>
              <UploadButton<OurFileRouter, "exerciseVideo">
                endpoint="exerciseVideo"
                onClientUploadComplete={(res) => {
                  if (res?.[0]?.ufsUrl) {
                    toast.success("Video uploaded successfully");
                  }
                }}
                onUploadError={(error: Error) => {
                  toast.error(`Upload failed: ${error.message}`);
                }}
              />
              <p className="text-xs text-slate-500">
                Upload a video file directly (max 64MB)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://" />
            </div>
          </div>
```

---

#### Task 3.4: Add ExerciseVideoPlayer to Plan Detail Page

**File to modify:** `d:\exercise-webapp\app\(platform)\workout-plans\[id]\page.tsx`

Add import at top:

```typescript
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
```

Inside the exercise card rendering (after the notes section, around line 225, after the `{pe.notes && ...}` block), add:

```typescript
                {/* Video player */}
                {(pe.exercise.videoUrl || (pe.exercise.media && pe.exercise.media.length > 0)) && (
                  <div className="ml-8 mt-3">
                    <ExerciseVideoPlayer
                      videoUrl={pe.exercise.videoUrl}
                      mediaItems={pe.exercise.media}
                      className="max-w-md"
                    />
                  </div>
                )}
```

This goes between the `{pe.notes && ...}` block and the `{pe.feedback.length > 0 && ...}` block.

---

#### Task 3.5: Update next.config.ts

**File to modify:** `d:\exercise-webapp\next.config.ts`

Add YouTube image hostnames to the `remotePatterns` array:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "utfs.io" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  serverExternalPackages: [],
};
```

---

### PHASE 4: Professional PDF Export

**Goals:** PDF components, API route, print preview page, placeholder image.

**Estimated complexity:** Large

**Dependencies:** Phase 1 (ClinicProfile model), Phase 3 (YouTube thumbnail utility for image fetching)

---

#### Task 4.1: Create Placeholder Image

**File to create:** `d:\exercise-webapp\public\images\exercise-placeholder.png`

Create a 200x200px gray placeholder PNG programmatically. The developer should use a script to generate this:

```typescript
// Run once: npx tsx scripts/generate-placeholder.ts
// File: scripts/generate-placeholder.ts

import { writeFileSync, mkdirSync, existsSync } from "fs";

// Minimal 200x200 gray PNG with a simple dumbbell icon
// For simplicity, generate a solid gray PNG
// A real implementation should use canvas or sharp

// Minimal valid PNG: 200x200 solid gray #E5E7EB
// Using the simplest approach -- create the file with a library or use a pre-encoded base64

// Alternative: Just create a simple SVG file instead and reference it
// For PDF, @react-pdf/renderer can handle images

const dir = "public/images";
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

// Base64-encoded minimal 200x200 gray PNG
// Developer: Generate this using `sharp` or `canvas` npm package, OR
// download a simple placeholder and place it at public/images/exercise-placeholder.png
// Minimum requirement: a real PNG file at that path, ~200x200px, gray background

console.log(
  "Create public/images/exercise-placeholder.png manually or via a design tool. 200x200px, gray background, exercise icon."
);
```

**Practical approach for the developer:** Use any image editor or online tool to create a 200x200px gray (#E5E7EB) PNG with a simple dumbbell silhouette centered. Save as `public/images/exercise-placeholder.png`. Alternatively, use the `canvas` package:

```typescript
// scripts/generate-placeholder.ts
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const SIZE = 200;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

// Gray background
ctx.fillStyle = "#E5E7EB";
ctx.fillRect(0, 0, SIZE, SIZE);

// Simple dumbbell icon in darker gray
ctx.fillStyle = "#9CA3AF";
ctx.strokeStyle = "#9CA3AF";
ctx.lineWidth = 8;

// Left weight
ctx.fillRect(55, 70, 20, 60);
// Right weight
ctx.fillRect(125, 70, 20, 60);
// Bar
ctx.beginPath();
ctx.moveTo(75, 100);
ctx.lineTo(125, 100);
ctx.stroke();

// Text
ctx.fillStyle = "#6B7280";
ctx.font = "12px sans-serif";
ctx.textAlign = "center";
ctx.fillText("No Image", SIZE / 2, 160);

const dir = "public/images";
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/exercise-placeholder.png`, canvas.toBuffer("image/png"));
console.log("Created exercise-placeholder.png");
```

**Note:** If the `canvas` npm package is not available, the developer should create this image manually or use any other approach. The key requirement is a real PNG file at `public/images/exercise-placeholder.png`.

---

#### Task 4.2: Create PDF Components

All PDF components use `@react-pdf/renderer` which is already in `package.json` at v4.3.2.

**File to create:** `d:\exercise-webapp\lib\pdf\components\pdf-header.tsx`

```typescript
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 15,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: "contain",
  },
  clinicInfo: {
    flexDirection: "column",
  },
  clinicName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  tagline: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  pageNumber: {
    fontSize: 9,
    color: "#9CA3AF",
  },
});

interface PdfHeaderProps {
  clinicName?: string;
  tagline?: string;
  logoBuffer?: Buffer | null;
  pageNumber: number;
}

export function PdfHeader({
  clinicName,
  tagline,
  logoBuffer,
  pageNumber,
}: PdfHeaderProps) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.leftSection}>
        {logoBuffer && (
          <Image
            style={styles.logo}
            src={{ data: logoBuffer, format: "png" }}
          />
        )}
        <View style={styles.clinicInfo}>
          {clinicName && <Text style={styles.clinicName}>{clinicName}</Text>}
          {tagline && <Text style={styles.tagline}>{tagline}</Text>}
        </View>
      </View>
      <Text style={styles.pageNumber}>Page {pageNumber}</Text>
    </View>
  );
}
```

**File to create:** `d:\exercise-webapp\lib\pdf\components\pdf-plan-info.tsx`

```typescript
import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 4,
  },
  item: {
    flexDirection: "column",
  },
  label: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    color: "#111827",
    fontWeight: "bold",
  },
});

interface PdfPlanInfoProps {
  title: string;
  clientName?: string;
  createdDate: string;
  daysPerWeek?: number | null;
  durationMinutes?: number | null;
}

export function PdfPlanInfo({
  title,
  clientName,
  createdDate,
  daysPerWeek,
  durationMinutes,
}: PdfPlanInfoProps) {
  return (
    <View style={styles.container}>
      <View style={styles.item}>
        <Text style={styles.label}>Program</Text>
        <Text style={styles.value}>{title}</Text>
      </View>
      {clientName && (
        <View style={styles.item}>
          <Text style={styles.label}>Client</Text>
          <Text style={styles.value}>{clientName}</Text>
        </View>
      )}
      <View style={styles.item}>
        <Text style={styles.label}>Created</Text>
        <Text style={styles.value}>{createdDate}</Text>
      </View>
      {daysPerWeek && (
        <View style={styles.item}>
          <Text style={styles.label}>Schedule</Text>
          <Text style={styles.value}>
            {daysPerWeek}x/week
            {durationMinutes ? ` | ~${durationMinutes} min/session` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}
```

**File to create:** `d:\exercise-webapp\lib\pdf\components\pdf-exercise-card.tsx`

```typescript
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  thumbnail: {
    width: 50,
    height: 50,
    objectFit: "cover",
    borderRadius: 4,
  },
  content: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
  },
  name: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#111827",
  },
  prescription: {
    fontSize: 9,
    color: "#374151",
  },
  cues: {
    fontSize: 8,
    color: "#6B7280",
    lineHeight: 1.3,
  },
});

interface PdfExerciseCardProps {
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  imageBuffer?: Buffer | null;
  placeholderBuffer: Buffer;
}

export function PdfExerciseCard({
  name,
  sets,
  reps,
  durationSeconds,
  notes,
  cuesThumbnail,
  imageBuffer,
  placeholderBuffer,
}: PdfExerciseCardProps) {
  const prescription = reps
    ? `${sets} sets x ${reps} reps`
    : durationSeconds
      ? `${sets} sets x ${durationSeconds}s hold`
      : `${sets} sets`;

  const displayCues = notes || cuesThumbnail;

  const imgSrc = imageBuffer
    ? { data: imageBuffer, format: "png" as const }
    : { data: placeholderBuffer, format: "png" as const };

  return (
    <View style={styles.card}>
      <Image style={styles.thumbnail} src={imgSrc} />
      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.prescription}>{prescription}</Text>
        {displayCues && (
          <Text style={styles.cues}>{displayCues}</Text>
        )}
      </View>
    </View>
  );
}
```

**File to create:** `d:\exercise-webapp\lib\pdf\components\pdf-day-column.tsx`

```typescript
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfExerciseCard } from "./pdf-exercise-card";

const styles = StyleSheet.create({
  column: {
    flex: 1,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    borderRadius: 4,
  },
  dayHeader: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#3B82F6",
  },
});

const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

interface ExerciseData {
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  imageBuffer?: Buffer | null;
}

interface PdfDayColumnProps {
  dayNumber: number;
  exercises: ExerciseData[];
  placeholderBuffer: Buffer;
}

export function PdfDayColumn({
  dayNumber,
  exercises,
  placeholderBuffer,
}: PdfDayColumnProps) {
  const dayName = DAY_NAMES[dayNumber] || `Day ${dayNumber}`;

  return (
    <View style={styles.column}>
      <Text style={styles.dayHeader}>
        DAY {dayNumber} -- {dayName.toUpperCase()}
      </Text>
      {exercises.map((exercise, idx) => (
        <PdfExerciseCard
          key={idx}
          {...exercise}
          placeholderBuffer={placeholderBuffer}
        />
      ))}
    </View>
  );
}
```

**File to create:** `d:\exercise-webapp\lib\pdf\components\pdf-footer.tsx`

```typescript
import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  safetyText: {
    fontSize: 8,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 4,
  },
  scheduleText: {
    fontSize: 8,
    color: "#9CA3AF",
    textAlign: "center",
  },
});

interface PdfFooterProps {
  description?: string | null;
}

export function PdfFooter({ description }: PdfFooterProps) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.safetyText}>
        Keep pain &lt;= 3/10 &bull; Move slow &amp; controlled &bull; Breathe
        &bull; Stop if sharp pain
      </Text>
      {description && (
        <Text style={styles.scheduleText}>{description}</Text>
      )}
    </View>
  );
}
```

**File to create:** `d:\exercise-webapp\lib\pdf\hep-document.tsx`

```typescript
import { Document, Page, View, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./components/pdf-header";
import { PdfPlanInfo } from "./components/pdf-plan-info";
import { PdfDayColumn } from "./components/pdf-day-column";
import { PdfFooter } from "./components/pdf-footer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  dayColumnWrapper: {
    // Will be set dynamically based on column count
  },
});

interface PlanExerciseData {
  exerciseId: string;
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  dayOfWeek: number;
}

interface HEPDocumentProps {
  planTitle: string;
  planDescription?: string | null;
  clientName?: string;
  createdDate: string;
  daysPerWeek?: number | null;
  durationMinutes?: number | null;
  clinicName?: string;
  clinicTagline?: string;
  clinicLogoBuffer?: Buffer | null;
  exercisesByDay: Map<number, PlanExerciseData[]>;
  imageMap: Map<string, Buffer>;
  placeholderBuffer: Buffer;
}

export function HEPDocument({
  planTitle,
  planDescription,
  clientName,
  createdDate,
  daysPerWeek,
  durationMinutes,
  clinicName,
  clinicTagline,
  clinicLogoBuffer,
  exercisesByDay,
  imageMap,
  placeholderBuffer,
}: HEPDocumentProps) {
  const days = Array.from(exercisesByDay.entries()).sort(
    ([a], [b]) => a - b
  );
  const numDays = days.length;

  // Calculate column width percentages
  // 1-2 days: 2 columns, 3 days: 3 columns, 4-7: 3 columns flowing to rows
  const columnsPerRow = numDays <= 2 ? 2 : 3;
  const columnWidthPercent = `${Math.floor(100 / columnsPerRow) - 2}%`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader
          clinicName={clinicName}
          tagline={clinicTagline}
          logoBuffer={clinicLogoBuffer}
          pageNumber={1}
        />
        <PdfPlanInfo
          title={planTitle}
          clientName={clientName}
          createdDate={createdDate}
          daysPerWeek={daysPerWeek}
          durationMinutes={durationMinutes}
        />
        <View style={styles.dayGrid}>
          {days.map(([dayNum, exercises]) => (
            <View
              key={dayNum}
              style={{ width: columnWidthPercent } as any}
            >
              <PdfDayColumn
                dayNumber={dayNum}
                exercises={exercises.map((ex) => ({
                  name: ex.name,
                  sets: ex.sets,
                  reps: ex.reps,
                  durationSeconds: ex.durationSeconds,
                  restSeconds: ex.restSeconds,
                  notes: ex.notes,
                  cuesThumbnail: ex.cuesThumbnail,
                  imageBuffer: imageMap.get(ex.exerciseId) ?? null,
                }))}
                placeholderBuffer={placeholderBuffer}
              />
            </View>
          ))}
        </View>
        <PdfFooter description={planDescription} />
      </Page>
    </Document>
  );
}
```

---

#### Task 4.3: Create PDF API Route

**File to create:** `d:\exercise-webapp\app\api\workout-plans\[id]\pdf\route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFile } from "fs/promises";
import { join } from "path";
import { HEPDocument } from "@/lib/pdf/hep-document";
import {
  isYouTubeUrl,
  extractYouTubeId,
  getYouTubeThumbnail,
} from "@/lib/utils/video";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch plan with all required data
  const plan = await prisma.workoutPlan.findUnique({
    where: { id },
    include: {
      exercises: {
        where: { isActive: true },
        include: {
          exercise: {
            include: { media: true },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
      patient: true,
      createdBy: true,
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Verify access
  if (
    dbUser.role === "PATIENT" &&
    plan.patientId !== dbUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    dbUser.role === "CLINICIAN" &&
    plan.createdById !== dbUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch clinic profile
  const clinicProfile = await prisma.clinicProfile.findUnique({
    where: { clinicianId: plan.createdById },
  });

  // Load placeholder image
  let placeholderBuffer: Buffer;
  try {
    placeholderBuffer = await readFile(
      join(process.cwd(), "public", "images", "exercise-placeholder.png")
    );
  } catch {
    // Fallback: create a minimal 1x1 gray pixel PNG
    placeholderBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPjCkFJ8QAAAABJRU5ErkJggg==",
      "base64"
    );
  }

  // Fetch clinic logo
  let clinicLogoBuffer: Buffer | null = null;
  if (clinicProfile?.logoUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const logoRes = await fetch(clinicProfile.logoUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (logoRes.ok) {
        clinicLogoBuffer = Buffer.from(await logoRes.arrayBuffer());
      }
    } catch {
      // Proceed without logo
    }
  }

  // Fetch exercise images in parallel
  const imageMap = new Map<string, Buffer>();
  const imagePromises = plan.exercises.map(async (pe) => {
    const exercise = pe.exercise;
    let imageUrl: string | null = null;

    // Priority: media[0].url > imageUrl > YouTube thumbnail
    if (exercise.media?.[0]?.url) {
      imageUrl = exercise.media[0].url;
    } else if (exercise.imageUrl) {
      imageUrl = exercise.imageUrl;
    } else if (exercise.videoUrl && isYouTubeUrl(exercise.videoUrl)) {
      const ytId = extractYouTubeId(exercise.videoUrl);
      if (ytId) {
        imageUrl = getYouTubeThumbnail(ytId);
      }
    }

    if (imageUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          imageMap.set(exercise.id, buffer);
        }
      } catch {
        // Fallback to placeholder -- imageMap will not have this exercise
      }
    }
  });

  await Promise.allSettled(imagePromises);

  // Group exercises by day
  const exercisesByDay = new Map<
    number,
    Array<{
      exerciseId: string;
      name: string;
      sets: number;
      reps: number | null;
      durationSeconds: number | null;
      restSeconds: number | null;
      notes: string | null;
      cuesThumbnail: string | null;
      dayOfWeek: number;
    }>
  >();

  for (const pe of plan.exercises) {
    const day = pe.dayOfWeek ?? 1;
    if (!exercisesByDay.has(day)) exercisesByDay.set(day, []);
    exercisesByDay.get(day)!.push({
      exerciseId: pe.exercise.id,
      name: pe.exercise.name,
      sets: pe.sets,
      reps: pe.reps,
      durationSeconds: pe.durationSeconds,
      restSeconds: pe.restSeconds,
      notes: pe.notes,
      cuesThumbnail: (pe.exercise as any).cuesThumbnail ?? null,
      dayOfWeek: day,
    });
  }

  const clientName = plan.patient
    ? `${plan.patient.firstName} ${plan.patient.lastName}`
    : undefined;

  const createdDate = plan.createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Render PDF
  const pdfBuffer = await renderToBuffer(
    HEPDocument({
      planTitle: plan.title,
      planDescription: plan.description,
      clientName,
      createdDate,
      daysPerWeek: plan.daysPerWeek,
      durationMinutes: plan.durationMinutes,
      clinicName: clinicProfile?.clinicName,
      clinicTagline: clinicProfile?.tagline ?? undefined,
      clinicLogoBuffer,
      exercisesByDay,
      imageMap,
      placeholderBuffer,
    }) as any
  );

  const sanitizedTitle = plan.title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizedTitle}-hep.pdf"`,
    },
  });
}
```

**Important note on `@react-pdf/renderer` and React 19:** The package v4.3.2 should work with React 19 but may emit peer dependency warnings. If `renderToBuffer` fails at runtime, the developer should check for compatibility issues and may need to use `renderToStream` instead. The `renderToBuffer` function takes a React element (JSX), so the `HEPDocument` call must return JSX. If the type system complains, cast with `as any`.

**Note on the `cuesThumbnail` access:** Since we added `cuesThumbnail` to the Exercise model but Prisma's TypeScript types will include it after `prisma generate`, the `(pe.exercise as any).cuesThumbnail` cast is a safety measure. After running `prisma generate`, you can remove the `as any` and access it directly.

---

#### Task 4.4: Create Print Preview Page

**File to create:** `d:\exercise-webapp\app\(platform)\workout-plans\[id]\print\page.tsx`

```typescript
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getPlanById } from "@/lib/services/workout-plan.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PrintPreviewPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const plan = await getPlanById(id);

  if (!plan) notFound();

  // Verify access
  if (user.role === "PATIENT" && plan.patientId !== user.id) notFound();
  if (user.role === "CLINICIAN" && plan.createdById !== user.id) notFound();

  const pdfUrl = `/api/workout-plans/${id}/pdf`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/workout-plans/${id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Plan
            </Link>
          </Button>
          <span className="text-sm font-medium text-slate-700">
            Print Preview: {plan.title}
          </span>
        </div>
        <Button size="sm" asChild>
          <a href={pdfUrl} download>
            <Download className="mr-1 h-4 w-4" />
            Download PDF
          </a>
        </Button>
      </div>
      <div className="flex-1">
        <iframe
          src={pdfUrl}
          className="h-full w-full border-0"
          title="PDF Preview"
        />
      </div>
    </div>
  );
}
```

---

#### Task 4.5: Add PDF Buttons to Plan Detail Page

**File to modify:** `d:\exercise-webapp\app\(platform)\workout-plans\[id]\page.tsx`

Add imports at top:

```typescript
import { Download, FileText } from "lucide-react";
```

(Note: `FileText` may already be available from lucide-react. `Download` needs to be added to the existing import.)

In the plan header section where the action buttons are rendered (around line 113-127), add the PDF buttons after the existing clinician buttons. Find this block:

```typescript
              {user.role === "CLINICIAN" && (
                <>
                  <PlanStatusActions
                    planId={plan.id}
                    currentStatus={plan.status}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/workout-plans/${plan.id}/edit`}>
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                </>
              )}
```

Replace with:

```typescript
              {user.role === "CLINICIAN" && (
                <>
                  <PlanStatusActions
                    planId={plan.id}
                    currentStatus={plan.status}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/workout-plans/${plan.id}/edit`}>
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/workout-plans/${plan.id}/print`}
                      target="_blank"
                    >
                      <FileText className="mr-1 h-4 w-4" />
                      Print Preview
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/workout-plans/${plan.id}/pdf`}
                      download
                    >
                      <Download className="mr-1 h-4 w-4" />
                      PDF
                    </a>
                  </Button>
                </>
              )}
```

Also update the lucide-react import to include the new icons:

```typescript
import { ArrowLeft, Edit, Play, FileText, Download } from "lucide-react";
```

---

## 4. Schema Migration Steps

Execute in order:

```bash
cd d:\exercise-webapp

# 1. After modifying prisma/schema.prisma (Task 1.1)
npx prisma validate

# 2. Push schema to MongoDB
npx prisma db push

# 3. Regenerate Prisma Client
npx prisma generate

# 4. After creating exercises-v2.ts and updating seed.ts (Tasks 1.3-1.4)
npx tsx lib/db/seed/seed.ts

# 5. Verify in Prisma Studio
npx prisma studio
```

No SQL migrations needed -- MongoDB with Prisma uses `db push` to sync the schema.

---

## 5. Testing Checklist

### Phase 1 Verification
- [ ] `npx prisma validate` passes
- [ ] `npx prisma db push` succeeds
- [ ] `npx prisma generate` succeeds
- [ ] TypeScript compilation succeeds (`npx tsc --noEmit`)
- [ ] `npx tsx lib/db/seed/seed.ts` runs without errors and reports created/updated counts
- [ ] Prisma Studio shows `exercisePhase`, `musclesTargeted`, `commonMistakes`, `defaultSets`, `defaultReps`, `defaultHoldSeconds`, `cuesThumbnail` fields on Exercise documents
- [ ] Prisma Studio shows `ClinicProfile` collection
- [ ] `/settings/clinic` page renders the clinic profile form
- [ ] Submitting the clinic profile form creates/updates a ClinicProfile document
- [ ] Uploadthing logo upload works on the clinic profile form
- [ ] `/api/uploadthing` route responds (GET and POST)

### Phase 2 Verification
- [ ] AI plan generation still works via the existing generate plan UI
- [ ] Generated exercises have phase ordering (WARMUP first, COOLDOWN last within each day)
- [ ] Generated exercises have clinical form cues in the `notes` field
- [ ] Console shows warning if cross-day duplicates are detected (but plan still saves)
- [ ] Pre-filtering works -- generating a "lower body" plan does not include UPPER_BODY exercises

### Phase 3 Verification
- [ ] `ExerciseVideoPlayer` renders YouTube URLs as iframes with `youtube-nocookie.com/embed/`
- [ ] `ExerciseVideoPlayer` renders direct video URLs as `<video>` elements
- [ ] `ExerciseVideoPlayer` renders nothing when no video is available (no broken state)
- [ ] Exercise form shows updated video URL placeholder text and upload button
- [ ] Video player appears on plan detail page for exercises with video URLs
- [ ] `next.config.ts` has `img.youtube.com` and `i.ytimg.com` in remotePatterns

### Phase 4 Verification
- [ ] `public/images/exercise-placeholder.png` exists and is a valid PNG
- [ ] `GET /api/workout-plans/[id]/pdf` returns a PDF with correct Content-Type header
- [ ] PDF contains clinic branding (if ClinicProfile exists for the clinician)
- [ ] PDF contains plan info section with title, client name, date, schedule
- [ ] PDF contains exercise cards grouped by day with correct phase ordering
- [ ] PDF contains safety footer on every page
- [ ] Print preview page renders with iframe showing the PDF
- [ ] "Download PDF" button triggers a file download
- [ ] "Print Preview" button on plan detail page opens the print preview in a new tab
- [ ] Unauthenticated requests to the PDF endpoint return 401
- [ ] Unauthorized requests (wrong clinician, wrong patient) return 403

### Cross-Feature Verification
- [ ] Full app builds without errors (`npm run build`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Existing features (plan creation, manual plan creation, feedback, sessions) still work
- [ ] No console errors in browser during normal navigation

---

## 6. Complete File Manifest

### Files to CREATE (16 total):

| # | Path | Phase | Purpose |
|---|------|-------|---------|
| 1 | `lib/db/seed/exercises-v2.ts` | 1 | 100-120 enriched exercise seed objects |
| 2 | `lib/services/clinic.service.ts` | 1 | ClinicProfile CRUD service |
| 3 | `lib/validators/clinic.ts` | 1 | Zod validation schema for clinic form |
| 4 | `actions/clinic-actions.ts` | 1 | Server actions for clinic profile |
| 5 | `app/(platform)/settings/clinic/page.tsx` | 1 | Clinic settings server component page |
| 6 | `components/settings/clinic-profile-form.tsx` | 1 | Client component form for clinic profile |
| 7 | `lib/uploadthing.ts` | 1 | Uploadthing file router config |
| 8 | `app/api/uploadthing/route.ts` | 1 | Uploadthing Next.js route handler |
| 9 | `lib/utils/video.ts` | 3 | YouTube URL utilities |
| 10 | `components/exercises/exercise-video-player.tsx` | 3 | Video player component |
| 11 | `lib/pdf/hep-document.tsx` | 4 | Main PDF document composition |
| 12 | `lib/pdf/components/pdf-header.tsx` | 4 | PDF clinic branding header |
| 13 | `lib/pdf/components/pdf-plan-info.tsx` | 4 | PDF plan metadata section |
| 14 | `lib/pdf/components/pdf-exercise-card.tsx` | 4 | PDF exercise card |
| 15 | `lib/pdf/components/pdf-day-column.tsx` | 4 | PDF day column with stacked cards |
| 16 | `lib/pdf/components/pdf-footer.tsx` | 4 | PDF safety footer |
| 17 | `app/api/workout-plans/[id]/pdf/route.ts` | 4 | PDF generation API endpoint |
| 18 | `app/(platform)/workout-plans/[id]/print/page.tsx` | 4 | Print preview page |
| 19 | `public/images/exercise-placeholder.png` | 4 | Placeholder image for exercises without images |

### Files to MODIFY (5 total):

| # | Path | Phase | Changes |
|---|------|-------|---------|
| 1 | `prisma/schema.prisma` | 1 | Add ExercisePhase enum, Exercise fields, ClinicProfile model, User relation |
| 2 | `lib/db/seed/seed.ts` | 1 | Replace with upsert logic importing exercises-v2.ts |
| 3 | `lib/services/ai.service.ts` | 2 | Full rewrite: pre-filtering, clinical prompts, post-processing |
| 4 | `components/exercises/exercise-form.tsx` | 3 | Add video upload button, update URL placeholder text |
| 5 | `app/(platform)/workout-plans/[id]/page.tsx` | 3+4 | Add ExerciseVideoPlayer, PDF/Print Preview buttons |
| 6 | `next.config.ts` | 3 | Add YouTube image hostnames to remotePatterns |

---

## 7. Implementation Order (Strict Numbered Sequence)

**Phase 1 -- execute sequentially:**
1. Modify `prisma/schema.prisma` (Task 1.1)
2. Run `npx prisma db push && npx prisma generate` (Task 1.2)
3. Create `lib/uploadthing.ts` (Task 1.8 -- needed for clinic form)
4. Create `app/api/uploadthing/route.ts` (Task 1.8)
5. Create `lib/db/seed/exercises-v2.ts` (Task 1.3)
6. Replace `lib/db/seed/seed.ts` (Task 1.4)
7. Run `npx tsx lib/db/seed/seed.ts` (Task 1.4 verification)
8. Create `lib/services/clinic.service.ts` (Task 1.5)
9. Create `lib/validators/clinic.ts` (Task 1.6)
10. Create `actions/clinic-actions.ts` (Task 1.7)
11. Create `components/settings/clinic-profile-form.tsx` (Task 1.9)
12. Create `app/(platform)/settings/clinic/page.tsx` (Task 1.9)
13. Verify: visit `/settings/clinic`, submit form, check Prisma Studio

**Phase 2 -- after Phase 1 completes:**
14. Replace `lib/services/ai.service.ts` (Task 2.1)
15. Verify: generate a plan via UI, check phase ordering in result

**Phase 3 -- can start in parallel with step 14:**
16. Create `lib/utils/video.ts` (Task 3.1)
17. Create `components/exercises/exercise-video-player.tsx` (Task 3.2)
18. Modify `components/exercises/exercise-form.tsx` (Task 3.3)
19. Modify `next.config.ts` (Task 3.5)
20. Modify `app/(platform)/workout-plans/[id]/page.tsx` -- add video player (Task 3.4)

**Phase 4 -- after Phase 1 and Phase 3 complete:**
21. Create `public/images/exercise-placeholder.png` (Task 4.1)
22. Create `lib/pdf/components/pdf-header.tsx` (Task 4.2)
23. Create `lib/pdf/components/pdf-plan-info.tsx` (Task 4.2)
24. Create `lib/pdf/components/pdf-exercise-card.tsx` (Task 4.2)
25. Create `lib/pdf/components/pdf-day-column.tsx` (Task 4.2)
26. Create `lib/pdf/components/pdf-footer.tsx` (Task 4.2)
27. Create `lib/pdf/hep-document.tsx` (Task 4.2)
28. Create `app/api/workout-plans/[id]/pdf/route.ts` (Task 4.3)
29. Create `app/(platform)/workout-plans/[id]/print/page.tsx` (Task 4.4)
30. Modify `app/(platform)/workout-plans/[id]/page.tsx` -- add PDF buttons (Task 4.5)
31. Verify: navigate to plan detail, click PDF button, verify download, verify print preview

**Final:**
32. Run `npm run build` -- verify no build errors
33. Run full testing checklist

---

## 8. Known Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `@react-pdf/renderer` v4.3.2 may have React 19 incompatibilities | Already in deps so presumably tested. If `renderToBuffer` fails, try `renderToStream` and pipe to buffer manually. |
| GPT-4o may not always follow phase ordering instructions | Post-processing sort in `ai.service.ts` corrects ordering after receiving the response. |
| Large exercise list (120) may cause long seed times against MongoDB | Seed runs sequentially per exercise. For production, batch with `prisma.$transaction` if needed. |
| Uploadthing file router not previously configured | Created both `lib/uploadthing.ts` and `app/api/uploadthing/route.ts` in Task 1.8. |
| Image fetch timeouts in PDF generation | 5s timeout per image with `AbortController`. `Promise.allSettled` ensures one failure does not block others. Fallback to placeholder. |
| `cuesThumbnail` field accessed on Exercise type before `prisma generate` | Use `(pe.exercise as any).cuesThumbnail` as safety cast. Remove after generate. |