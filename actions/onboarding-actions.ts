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
    await prisma.patientProfile.upsert({
      where: { userId: user.id },
      update: {
        limitations: data.limitations,
        comorbidities: data.comorbidities,
        functionalChallenges: data.functionalChallenges,
        availableEquipment: data.availableEquipment || [],
        fitnessGoals: data.fitnessGoals || [],
        preferredDurationMinutes: data.preferredDurationMinutes || 25,
        preferredDaysPerWeek: data.preferredDaysPerWeek || 3,
      },
      create: {
        userId: user.id,
        limitations: data.limitations,
        comorbidities: data.comorbidities,
        functionalChallenges: data.functionalChallenges,
        availableEquipment: data.availableEquipment || [],
        fitnessGoals: data.fitnessGoals || [],
        preferredDurationMinutes: data.preferredDurationMinutes || 25,
        preferredDaysPerWeek: data.preferredDaysPerWeek || 3,
      },
    });
  }

  redirect("/dashboard");
}
