# Clerk Organizations Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `PatientClinicianLink` + `ClinicProfile` DB models with Clerk Organizations — clinics are Clerk Orgs, patients join only via invitation, and all patient queries scope by `clerkOrgId` on the `User` record.

**Architecture:** Clinician onboarding creates a Clerk Organization (storing its ID in `User.clerkOrgId`). Invitations are sent via Clerk's org invitation API. The `organizationMembership.created` webhook upserts the patient's `User` record with `clerkOrgId`. All data queries use `clerkOrgId` in the DB instead of the old join table.

**Tech Stack:** Next.js 15 App Router, Clerk v7 (`@clerk/nextjs ^7.0.4`), Prisma 6 (MongoDB), TypeScript, Zod, UploadThing

---

## File Map

**Create:**
- `middleware.ts` — Clerk route protection (public routes allowlist)
- `app/onboarding/patient/page.tsx` — Patient clinical intake after invitation
- `components/onboarding/patient-onboarding-form.tsx` — Patient intake form component
- `actions/invite-patient-action.ts` — Clerk org invitation API call
- `actions/organization-actions.ts` — Clinic settings read/write via Clerk org API

**Modify:**
- `prisma/schema.prisma` — add `clerkOrgId` to User; remove `PatientClinicianLink` + `ClinicProfile`
- `lib/current-user.ts` — route new users to correct onboarding path by `orgId`
- `app/api/webhooks/clerk/route.ts` — add `organizationMembership.created/.deleted` handlers
- `actions/onboarding-actions.ts` — clinician action creates Clerk org; add patient onboarding action
- `components/onboarding/onboarding-form.tsx` — remove role picker; add clinic name field
- `lib/services/patient.service.ts` — replace join-table queries with `clerkOrgId` scoping
- `components/patients/add-patient-dialog.tsx` — rewrite as invite dialog
- `app/(platform)/patients/page.tsx` — update empty-state copy
- `app/(platform)/settings/clinic/page.tsx` — read from Clerk org instead of DB
- `components/settings/clinic-profile-form.tsx` — write to Clerk org instead of DB
- `app/api/workout-plans/[id]/pdf/route.ts` — fetch clinic info from Clerk org metadata
- `app/(platform)/layout.tsx` — remove redundant auth check (middleware handles it)

**Delete:**
- `actions/patient-actions.ts`
- `actions/clinic-actions.ts`
- `lib/services/clinic.service.ts`
- `lib/validators/clinic.ts`

---

## Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit schema — add `clerkOrgId`, remove `PatientClinicianLink` and `ClinicProfile` models**

In `prisma/schema.prisma`, make these changes to the `User` model — remove the three relation fields and add `clerkOrgId`:

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
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  patientProfile   PatientProfile?
  plansAsPatient   WorkoutPlan[]          @relation("PatientPlans")
  plansCreated     WorkoutPlan[]          @relation("CreatedPlans")
  feedbackGiven    ExerciseFeedback[]
  sessions         WorkoutSession[]
  sentMessages     Message[]              @relation("SentMessages")
  receivedMessages Message[]              @relation("ReceivedMessages")
  assessments      Assessment[]           @relation("PatientAssessments")
  assessedBy       Assessment[]           @relation("AssessedBy")
  exercisesCreated Exercise[]

  programsCreated    Program[]            @relation("ProgramsCreated")
  programsAssigned   Program[]            @relation("ProgramsAssigned")
  sessionsV2         WorkoutSessionV2[]   @relation("SessionsV2")
  checkInTemplates   CheckInTemplate[]    @relation("CheckInTemplatesCreated")
  checkInAssignments CheckInAssignment[]  @relation("CheckInAssignments")
  checkInResponses   CheckInResponse[]    @relation("CheckInResponses")
  bodyMetrics        BodyMetric[]         @relation("BodyMetrics")
  progressPhotos     ProgressPhoto[]      @relation("ProgressPhotos")
  habits             HabitDefinition[]    @relation("Habits")
  nutritionTarget    NutritionTarget?     @relation("NutritionTarget")
  nutritionLogs      NutritionLog[]       @relation("NutritionLogs")
  notifications      Notification[]       @relation("Notifications")
  packages           CoachPackage[]       @relation("Packages")
  subscriptions      ClientSubscription[] @relation("Subscriptions")
  branding           CoachBranding?       @relation("Branding")
  clinicalNotesAsPatient    ClinicalNote[] @relation("ClinicalNotesPatient")
  clinicalNotesAsClinicain  ClinicalNote[] @relation("ClinicalNotesClinician")
}
```

Also delete the `PatientClinicianLink` model block and the `ClinicProfile` model block entirely from the schema file.

- [ ] **Step 2: Push schema to MongoDB and regenerate client**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp
npx prisma db push
npx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.` and `Generated Prisma Client`.

---

## Task 2: Create middleware.ts

**Files:**
- Create: `middleware.ts` (project root, next to `next.config.ts`)

- [ ] **Step 1: Create middleware**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 2: Verify build compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to middleware.

---

## Task 3: Update current-user.ts

**Files:**
- Modify: `lib/current-user.ts`

- [ ] **Step 1: Update `getCurrentUser` to route new users by orgId**

Replace the entire file content:

```ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

export async function getCurrentUser(): Promise<User> {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    // New Clerk user: orgId present = came via org invitation = patient path
    if (orgId) redirect("/onboarding/patient");
    redirect("/onboarding");
  }

  if (!user.onboarded) {
    if (user.role === "PATIENT") redirect("/onboarding/patient");
    redirect("/onboarding");
  }

  return user;
}

export async function getCurrentUserOrNull(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId } });
}

export async function requireRole(role: "CLINICIAN" | "PATIENT"): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect("/dashboard");
  return user;
}

export async function requireSuperAdmin(): Promise<User> {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/sign-in");

  const meta = sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
  const hasClerkFlag = meta?.superAdmin === true;

  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const hasEmailFlag = allowedEmails.includes(user.email.toLowerCase());

  if (!hasClerkFlag && !hasEmailFlag) redirect("/dashboard");
  return user;
}

export async function isSuperAdmin(): Promise<boolean> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  const meta = sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
  if (meta?.superAdmin === true) return true;

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return false;

  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(user.email.toLowerCase());
}
```

---

## Task 4: Update Clerk Webhook Handler

**Files:**
- Modify: `app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Add org membership event handlers**

Replace the entire file:

```ts
import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      await prisma.user.deleteMany({ where: { clerkId: id } });
    }
  }

  if (evt.type === "user.updated") {
    const { id, image_url, email_addresses } = evt.data;
    const primaryEmail = email_addresses?.[0]?.email_address;
    await prisma.user.updateMany({
      where: { clerkId: id },
      data: {
        imageUrl: image_url,
        ...(primaryEmail ? { email: primaryEmail } : {}),
      },
    });
  }

  if (evt.type === "organizationMembership.created") {
    const { organization, public_user_data } = evt.data as {
      organization: { id: string };
      public_user_data: { user_id: string };
    };

    const clerkUserId = public_user_data.user_id;
    const orgId = organization.id;

    // Fetch full user details from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const primaryEmail =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (primaryEmail) {
      await prisma.user.upsert({
        where: { clerkId: clerkUserId },
        update: {
          clerkOrgId: orgId,
          imageUrl: clerkUser.imageUrl,
          email: primaryEmail,
        },
        create: {
          clerkId: clerkUserId,
          email: primaryEmail,
          firstName: clerkUser.firstName ?? "",
          lastName: clerkUser.lastName ?? "",
          imageUrl: clerkUser.imageUrl,
          role: "PATIENT",
          clerkOrgId: orgId,
          onboarded: false,
        },
      });
    }
  }

  if (evt.type === "organizationMembership.deleted") {
    const { public_user_data } = evt.data as {
      public_user_data: { user_id: string };
    };
    await prisma.user.updateMany({
      where: { clerkId: public_user_data.user_id },
      data: { clerkOrgId: null },
    });
  }

  return new NextResponse("OK", { status: 200 });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "webhooks" | head -10
```

Expected: No errors for this file.

---

## Task 5: Rewrite Clinician Onboarding

**Files:**
- Modify: `actions/onboarding-actions.ts`
- Modify: `components/onboarding/onboarding-form.tsx`
- Modify: `app/onboarding/page.tsx`

- [ ] **Step 1: Rewrite `actions/onboarding-actions.ts`**

Replace entire file:

```ts
"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function completeClinicianOnboarding(data: {
  firstName: string;
  lastName: string;
  clinicName: string;
  phone?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const clerkUser = await currentUser();
  if (!clerkUser) return { success: false as const, error: "User not found" };

  // Create the Clerk organization for this clinic
  const client = await clerkClient();
  const org = await client.organizations.createOrganization({
    name: data.clinicName,
    createdBy: userId,
  });

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      role: "CLINICIAN",
      phone: data.phone ?? null,
      clerkOrgId: org.id,
      onboarded: true,
    },
    create: {
      clerkId: userId,
      email: clerkUser.emailAddresses[0].emailAddress,
      firstName: data.firstName,
      lastName: data.lastName,
      role: "CLINICIAN",
      phone: data.phone ?? null,
      imageUrl: clerkUser.imageUrl,
      clerkOrgId: org.id,
      onboarded: true,
    },
  });

  redirect("/dashboard");
}

export async function completePatientOnboarding(data: {
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  limitations?: string;
  comorbidities?: string;
  functionalChallenges?: string;
  availableEquipment?: string[];
  fitnessGoals?: string[];
  primaryDiagnosis?: string;
  painScore?: number;
  activityLevel?: string;
  injuryDate?: string;
  surgeryHistory?: string;
  occupation?: string;
}) {
  const { userId, orgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const clerkUser = await currentUser();
  if (!clerkUser) return { success: false as const, error: "User not found" };

  const profileData = {
    limitations: data.limitations ?? null,
    comorbidities: data.comorbidities ?? null,
    functionalChallenges: data.functionalChallenges ?? null,
    availableEquipment: data.availableEquipment ?? [],
    fitnessGoals: data.fitnessGoals ?? [],
    preferredDurationMinutes: 25,
    preferredDaysPerWeek: 3,
    primaryDiagnosis: data.primaryDiagnosis ?? null,
    secondaryDiagnoses: [] as string[],
    painScore: data.painScore ?? null,
    activityLevel: data.activityLevel ?? null,
    injuryDate: data.injuryDate ? new Date(data.injuryDate) : null,
    surgeryHistory: data.surgeryHistory ?? null,
    occupation: data.occupation ?? null,
    priorInjuries: [] as string[],
  };

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      clerkOrgId: orgId ?? null,
      onboarded: true,
    },
    create: {
      clerkId: userId,
      email: clerkUser.emailAddresses[0].emailAddress,
      firstName: data.firstName,
      lastName: data.lastName,
      role: "PATIENT",
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      imageUrl: clerkUser.imageUrl,
      clerkOrgId: orgId ?? null,
      onboarded: true,
    },
  });

  await prisma.patientProfile.upsert({
    where: { userId: user.id },
    update: profileData,
    create: { userId: user.id, ...profileData },
  });

  redirect("/dashboard");
}
```

- [ ] **Step 2: Rewrite clinician onboarding form**

Replace entire `components/onboarding/onboarding-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { completeClinicianOnboarding } from "@/actions/onboarding-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function OnboardingForm() {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName || !lastName || !clinicName) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    const result = await completeClinicianOnboarding({
      firstName,
      lastName,
      clinicName,
      phone: phone || undefined,
    });
    setLoading(false);

    if (result && !result.success) {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your clinic</CardTitle>
        <CardDescription>Tell us about yourself and your practice</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinicName">Clinic Name *</Label>
            <Input
              id="clinicName"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="e.g., Summit Physical Therapy"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !firstName || !lastName || !clinicName}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Clinic & Go to Dashboard
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Update clinician onboarding page header text**

In `app/onboarding/page.tsx`, update the heading to reflect the new flow. Replace the `<h1>` content inside the left panel:

```tsx
// Replace this line:
            AI-powered exercise programs for modern rehabilitation.
// With:
            Set up your clinic and start managing patients today.
```

And replace the `<OnboardingForm />` section wrapper — the page itself stays nearly identical, just the form changes internally. No route changes needed to `app/onboarding/page.tsx` beyond the heading tweak.

---

## Task 6: Create Patient Onboarding Route

**Files:**
- Create: `app/onboarding/patient/page.tsx`
- Create: `components/onboarding/patient-onboarding-form.tsx`

- [ ] **Step 1: Create patient onboarding form component**

Create `components/onboarding/patient-onboarding-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { COMMON_EQUIPMENT, FITNESS_GOALS } from "@/lib/utils/constants";
import { completePatientOnboarding } from "@/actions/onboarding-actions";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";

export function PatientOnboardingForm() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("");
  const [painScore, setPainScore] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [injuryDate, setInjuryDate] = useState("");
  const [surgeryHistory, setSurgeryHistory] = useState("");
  const [occupation, setOccupation] = useState("");
  const [limitations, setLimitations] = useState("");
  const [comorbidities, setComorbidities] = useState("");
  const [functionalChallenges, setFunctionalChallenges] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  function toggleEquipment(item: string) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  }

  async function handleComplete() {
    if (!firstName || !lastName) {
      toast.error("Please fill in your name");
      return;
    }

    setLoading(true);
    const result = await completePatientOnboarding({
      firstName,
      lastName,
      phone: phone || undefined,
      dateOfBirth: dateOfBirth || undefined,
      limitations: limitations || undefined,
      comorbidities: comorbidities || undefined,
      functionalChallenges: functionalChallenges || undefined,
      availableEquipment: selectedEquipment,
      fitnessGoals: selectedGoals,
      primaryDiagnosis: primaryDiagnosis || undefined,
      painScore: painScore ? parseInt(painScore) : undefined,
      activityLevel: activityLevel || undefined,
      injuryDate: injuryDate || undefined,
      surgeryHistory: surgeryHistory || undefined,
      occupation: occupation || undefined,
    });
    setLoading(false);

    if (result && !result.success) {
      toast.error(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 flex justify-center gap-2">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-2 w-12 rounded-full transition-colors ${
              s <= step ? "bg-blue-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>Tell us a bit about yourself</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              disabled={!firstName || !lastName}
              onClick={() => setStep(2)}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Clinical Profile</CardTitle>
            <CardDescription>
              This helps your clinician personalize your exercise program
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primaryDiagnosis">Primary Diagnosis / Reason for Referral</Label>
              <Input
                id="primaryDiagnosis"
                value={primaryDiagnosis}
                onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                placeholder="e.g., ACL Tear Post-Op, Rotator Cuff Tendinopathy"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="painScore">Current Pain Score (0–10)</Label>
                <Input
                  id="painScore"
                  type="number"
                  min="0"
                  max="10"
                  value={painScore}
                  onChange={(e) => setPainScore(e.target.value)}
                  placeholder="0 = no pain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activityLevel">Activity Level</Label>
                <select
                  id="activityLevel"
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select level</option>
                  <option value="SEDENTARY">Sedentary</option>
                  <option value="LIGHT">Light</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="injuryDate">Date of Injury / Surgery</Label>
                <Input
                  id="injuryDate"
                  type="date"
                  value={injuryDate}
                  onChange={(e) => setInjuryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g., Nurse, Office worker"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="surgeryHistory">Surgery / Procedure History</Label>
              <Textarea
                id="surgeryHistory"
                value={surgeryHistory}
                onChange={(e) => setSurgeryHistory(e.target.value)}
                placeholder="e.g., Right ACL reconstruction Jan 2024"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="limitations">Physical Limitations</Label>
              <Textarea
                id="limitations"
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
                placeholder="e.g., Cannot fully straighten knee"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comorbidities">Medical Conditions</Label>
              <Textarea
                id="comorbidities"
                value={comorbidities}
                onChange={(e) => setComorbidities(e.target.value)}
                placeholder="e.g., Osteoarthritis, Type 2 diabetes"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="functional">Functional Challenges</Label>
              <Textarea
                id="functional"
                value={functionalChallenges}
                onChange={(e) => setFunctionalChallenges(e.target.value)}
                placeholder="e.g., Difficulty climbing stairs"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Available Equipment</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_EQUIPMENT.map((eq) => (
                  <Button
                    key={eq}
                    type="button"
                    variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleEquipment(eq)}
                  >
                    {eq}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rehabilitation Goals</Label>
              <div className="flex flex-wrap gap-2">
                {FITNESS_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={selectedGoals.includes(goal) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleGoal(goal)}
                  >
                    {goal}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={loading}
                onClick={handleComplete}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create patient onboarding page**

Create `app/onboarding/patient/page.tsx`:

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientOnboardingForm } from "@/components/onboarding/patient-onboarding-form";
import { Activity } from "lucide-react";

export default async function PatientOnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // If already onboarded, redirect to dashboard
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded) redirect("/dashboard");

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">INMOTUS RX</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Welcome to your rehabilitation program.
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-300">
            Complete your profile so your clinician can personalize your exercise program.
          </p>
        </div>
        <p className="text-sm text-slate-400">
          &copy; {new Date().getFullYear()} INMOTUS RX. All rights reserved.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-[oklch(0.97_0.005_247)] p-6 sm:p-12">
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">INMOTUS RX</span>
        </div>
        <div className="w-full max-w-lg">
          <PatientOnboardingForm />
        </div>
      </div>
    </div>
  );
}
```

---

## Task 7: Update patient.service.ts

**Files:**
- Modify: `lib/services/patient.service.ts`

- [ ] **Step 1: Replace entire file with clerkOrgId-scoped queries**

```ts
import { prisma } from "@/lib/prisma";

export async function getPatientsForClinician(clinicianId: string) {
  const clinician = await prisma.user.findUnique({
    where: { id: clinicianId },
    select: { clerkOrgId: true },
  });
  if (!clinician?.clerkOrgId) return [];

  return prisma.user.findMany({
    where: { clerkOrgId: clinician.clerkOrgId, role: "PATIENT" },
    include: { patientProfile: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPatientDetail(patientId: string) {
  return prisma.user.findUnique({
    where: { id: patientId },
    include: {
      patientProfile: true,
      plansAsPatient: {
        include: { _count: { select: { exercises: true, sessions: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function getCliniciansForPatient(patientId: string) {
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: { clerkOrgId: true },
  });
  if (!patient?.clerkOrgId) return [];

  const clinician = await prisma.user.findFirst({
    where: { clerkOrgId: patient.clerkOrgId, role: "CLINICIAN" },
  });
  return clinician ? [clinician] : [];
}
```

---

## Task 8: Create Invite Patient Action

**Files:**
- Create: `actions/invite-patient-action.ts`

- [ ] **Step 1: Create the invite action**

```ts
"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function invitePatientAction(patientEmail: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Clinic not set up" };

  const trimmedEmail = patientEmail.trim().toLowerCase();
  if (!trimmedEmail) return { success: false as const, error: "Email is required" };

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: dbUser.clerkOrgId,
      inviterUserId: userId,
      emailAddress: trimmedEmail,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/patient`,
    });

    revalidatePath("/patients");
    return { success: true as const };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send invitation";
    console.error("Failed to invite patient:", err);
    return { success: false as const, error: message };
  }
}
```

- [ ] **Step 2: Add `NEXT_PUBLIC_APP_URL` to your environment**

In `.env.local` (create if missing), add:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For production, set this to your deployed URL.

---

## Task 9: Rewrite AddPatientDialog as InvitePatientDialog

**Files:**
- Modify: `components/patients/add-patient-dialog.tsx`
- Modify: `app/(platform)/patients/page.tsx`

- [ ] **Step 1: Rewrite add-patient-dialog.tsx**

Replace entire file content:

```tsx
"use client";

import { useState, useTransition } from "react";
import { invitePatientAction } from "@/actions/invite-patient-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export function AddPatientDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Please enter a patient email address");
      return;
    }

    startTransition(async () => {
      const result = await invitePatientAction(trimmed);

      if (result.success) {
        toast.success("Invitation sent! The patient will receive an email to join your clinic.");
        setEmail("");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to send invitation");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none select-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-8">
        <UserPlus className="h-4 w-4" />
        Invite Patient
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite a Patient</DialogTitle>
            <DialogDescription>
              Enter the patient&apos;s email address. They will receive an invitation
              to create an account and join your clinic.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="patient-email">Patient Email</Label>
              <Input
                id="patient-email"
                type="email"
                placeholder="patient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={isPending}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update patients page empty-state copy**

In `app/(platform)/patients/page.tsx`, update the empty state description text (line ~74) from:
```tsx
: "Click \"Add Client\" above to link a patient by their email address. They must have already signed up."}
```
To:
```tsx
: "Click \"Invite Patient\" above to send an invitation. The patient will receive an email to join your clinic."}
```

Also update the subtitle from:
```tsx
{allPatients.length} client{allPatients.length !== 1 ? "s" : ""} linked to your practice
```
To:
```tsx
{allPatients.length} client{allPatients.length !== 1 ? "s" : ""} in your clinic
```

---

## Task 10: Create Organization Settings Action

**Files:**
- Create: `actions/organization-actions.ts`
- Modify: `components/settings/clinic-profile-form.tsx`
- Modify: `app/(platform)/settings/clinic/page.tsx`

- [ ] **Step 1: Create `actions/organization-actions.ts`**

```ts
"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface ClinicMetadata {
  clinicName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

export async function getOrganizationProfile(): Promise<ClinicMetadata | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser?.clerkOrgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: dbUser.clerkOrgId });

  const meta = (org.publicMetadata ?? {}) as Record<string, string>;
  return {
    clinicName: org.name,
    tagline: meta.tagline ?? "",
    logoUrl: meta.logoUrl ?? "",
    phone: meta.phone ?? "",
    email: meta.email ?? "",
    website: meta.website ?? "",
    address: meta.address ?? "",
  };
}

export async function saveOrganizationProfile(input: ClinicMetadata) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Clinic not set up" };

  if (!input.clinicName?.trim()) {
    return { success: false as const, error: "Clinic name is required" };
  }

  try {
    const client = await clerkClient();
    await client.organizations.updateOrganization(dbUser.clerkOrgId, {
      name: input.clinicName.trim(),
      publicMetadata: {
        tagline: input.tagline ?? "",
        logoUrl: input.logoUrl ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        website: input.website ?? "",
        address: input.address ?? "",
      },
    });

    revalidatePath("/settings/clinic");
    return { success: true as const };
  } catch (err) {
    console.error("Failed to save clinic profile:", err);
    return { success: false as const, error: "Failed to save clinic profile" };
  }
}
```

- [ ] **Step 2: Rewrite `components/settings/clinic-profile-form.tsx`**

Replace entire file:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveOrganizationProfile, type ClinicMetadata } from "@/actions/organization-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";
import Image from "next/image";

interface ClinicProfileFormProps {
  initialData?: ClinicMetadata;
}

export function ClinicProfileForm({ initialData }: ClinicProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await saveOrganizationProfile({
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

- [ ] **Step 3: Update `app/(platform)/settings/clinic/page.tsx`**

Replace entire file:

```tsx
import { requireRole } from "@/lib/current-user";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";

export default async function ClinicSettingsPage() {
  await requireRole("CLINICIAN");
  const profile = await getOrganizationProfile();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Clinic Profile</h2>
        <p className="text-slate-600">Customize your clinic branding for PDF exports</p>
      </div>
      <ClinicProfileForm initialData={profile ?? undefined} />
    </div>
  );
}
```

---

## Task 11: Update PDF Route

**Files:**
- Modify: `app/api/workout-plans/[id]/pdf/route.ts`

- [ ] **Step 1: Replace clinicProfile DB lookup with Clerk org lookup**

In `app/api/workout-plans/[id]/pdf/route.ts`, find the block that starts with:
```ts
  // Fetch clinic profile
  const clinicProfile = await prisma.clinicProfile.findUnique({
    where: { clinicianId: plan.createdById },
  });
```

Replace it with:

```ts
  // Fetch clinic profile from Clerk org metadata
  const creator = await prisma.user.findUnique({
    where: { id: plan.createdById },
    select: { clerkOrgId: true },
  });

  let clinicProfile: { clinicName?: string; tagline?: string; logoUrl?: string } = {};
  if (creator?.clerkOrgId) {
    try {
      const client = await clerkClient();
      const org = await client.organizations.getOrganization({
        organizationId: creator.clerkOrgId,
      });
      const meta = (org.publicMetadata ?? {}) as Record<string, string>;
      clinicProfile = {
        clinicName: org.name,
        tagline: meta.tagline || undefined,
        logoUrl: meta.logoUrl || undefined,
      };
    } catch {
      // Proceed without clinic profile
    }
  }
```

Also add the import at the top of the file (after the existing imports):
```ts
import { clerkClient } from "@clerk/nextjs/server";
```

Then update the three references below to use the same property names:
- `clinicProfile?.logoUrl` → stays the same (property exists on new object)
- `clinicProfile.logoUrl` → stays the same
- `clinicName: clinicProfile?.clinicName` → stays the same
- `clinicTagline: clinicProfile?.tagline ?? undefined` → stays the same

---

## Task 12: Simplify Platform Layout

**Files:**
- Modify: `app/(platform)/layout.tsx`

- [ ] **Step 1: Remove redundant auth redirect (middleware already handles unauthenticated users)**

Replace the top of `app/(platform)/layout.tsx`. Change:

```ts
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/onboarding");
  if (!user.onboarded) redirect("/onboarding");
```

To:

```ts
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { orgId } = await auth();
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    if (orgId) redirect("/onboarding/patient");
    redirect("/onboarding");
  }
  if (!user.onboarded) {
    if (user.role === "PATIENT") redirect("/onboarding/patient");
    redirect("/onboarding");
  }
```

Wait — `auth()` returns both at once, so use a single destructure:

```ts
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    if (orgId) redirect("/onboarding/patient");
    redirect("/onboarding");
  }
  if (!user.onboarded) {
    if (user.role === "PATIENT") redirect("/onboarding/patient");
    redirect("/onboarding");
  }
```

Remove the `redirect` import from `next/navigation` only if it's no longer used — but it IS still used here, so keep it.

---

## Task 13: Delete Obsolete Files

**Files to delete:**
- `actions/patient-actions.ts`
- `actions/clinic-actions.ts`
- `lib/services/clinic.service.ts`
- `lib/validators/clinic.ts`

- [ ] **Step 1: Delete the files**

```bash
rm /Users/yahyashah/Dev/Excercise-Webapp/actions/patient-actions.ts
rm /Users/yahyashah/Dev/Excercise-Webapp/actions/clinic-actions.ts
rm /Users/yahyashah/Dev/Excercise-Webapp/lib/services/clinic.service.ts
rm /Users/yahyashah/Dev/Excercise-Webapp/lib/validators/clinic.ts
```

- [ ] **Step 2: Fix any remaining imports**

Run:
```bash
grep -r "patient-actions\|clinic-actions\|clinic\.service\|validators/clinic" /Users/yahyashah/Dev/Excercise-Webapp --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

Expected: No output. If any files appear, remove or update those imports.

---

## Task 14: TypeScript Verification and Final Check

- [ ] **Step 1: Run TypeScript compiler**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp
npx tsc --noEmit 2>&1 | head -60
```

Fix any type errors that appear before proceeding.

- [ ] **Step 2: Start dev server and verify full flow**

```bash
npm run dev
```

Open `http://localhost:3000`.

**Clinician flow checklist:**
1. Go to `/sign-up` → create account → redirected to `/onboarding`
2. Fill in name + clinic name → submit → redirected to `/dashboard`
3. Go to `/patients` → click "Invite Patient" → enter email → confirm toast "Invitation sent"
4. Go to `/settings/clinic` → verify form loads with clinic name → save → confirm "Clinic profile saved"

**Patient flow checklist:**
1. Check email for invitation → click link → Clerk sign-up hosted page
2. Create account → redirected to `/onboarding/patient`
3. Fill in profile → submit → redirected to `/dashboard`
4. Confirm patient appears in clinician's `/patients` list

- [ ] **Step 3: Verify Clerk webhooks are registered**

In Clerk Dashboard → Webhooks, ensure the endpoint `/api/webhooks/clerk` is registered with these events:
- `user.created`
- `user.updated`
- `user.deleted`
- `organizationMembership.created`
- `organizationMembership.deleted`

For local development, use the Clerk CLI or ngrok to expose the webhook endpoint.
