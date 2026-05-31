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

  try {
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
  } catch (err) {
    console.error("Failed to complete clinician onboarding:", err);
    return { success: false as const, error: "Failed to set up clinic. Please try again." };
  }

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
