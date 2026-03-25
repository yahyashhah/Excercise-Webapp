"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function completeOnboarding(data: {
  role: "CLINICIAN" | "PATIENT";
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  limitations?: string;
  comorbidities?: string;
  functionalChallenges?: string;
  availableEquipment?: string[];
  fitnessGoals?: string[];
  preferredDurationMinutes?: number;
  preferredDaysPerWeek?: number;
  primaryDiagnosis?: string;
  painScore?: number;
  activityLevel?: string;
  injuryDate?: string;
  surgeryHistory?: string;
  occupation?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const clerkUser = await currentUser();
  if (!clerkUser) return { success: false as const, error: "User not found" };

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      phone: data.phone,
      dateOfBirth: data.dateOfBirth,
      onboarded: true,
    },
    create: {
      clerkId: userId,
      email: clerkUser.emailAddresses[0].emailAddress,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      phone: data.phone,
      dateOfBirth: data.dateOfBirth,
      imageUrl: clerkUser.imageUrl,
      onboarded: true,
    },
  });

  if (data.role === "PATIENT") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData: any = {
      limitations: data.limitations,
      comorbidities: data.comorbidities,
      functionalChallenges: data.functionalChallenges,
      availableEquipment: data.availableEquipment || [],
      fitnessGoals: data.fitnessGoals || [],
      preferredDurationMinutes: data.preferredDurationMinutes || 25,
      preferredDaysPerWeek: data.preferredDaysPerWeek || 3,
      primaryDiagnosis: data.primaryDiagnosis,
      secondaryDiagnoses: [],
      painScore: data.painScore,
      activityLevel: data.activityLevel,
      injuryDate: data.injuryDate ? new Date(data.injuryDate) : undefined,
      surgeryHistory: data.surgeryHistory,
      occupation: data.occupation,
      priorInjuries: [],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.patientProfile as any).upsert({
      where: { userId: user.id },
      update: profileData,
      create: { userId: user.id, ...profileData },
    });
  }

  redirect("/dashboard");
}
