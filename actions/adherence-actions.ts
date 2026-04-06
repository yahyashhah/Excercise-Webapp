"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as adherenceService from "@/lib/services/adherence.service";

export async function startSessionAction(planId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "PATIENT") return { success: false as const, error: "Forbidden" };

  try {
    const session = await adherenceService.startSession(planId, dbUser.id);
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to start session:", error);
    return { success: false as const, error: "Failed to start session" };
  }
}

export async function completeSessionExerciseAction(
  sessionId: string,
  planExerciseId: string,
  data: { status: string; actualSets?: number; actualReps?: number; actualWeight?: number; actualRPE?: number }
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  // Verify the session belongs to this user
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { patientId: true },
  });
  if (!session || session.patientId !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const item = await adherenceService.completeSessionExercise(sessionId, planExerciseId, data);
    return { success: true as const, data: item };
  } catch (error) {
    console.error("Failed to complete exercise:", error);
    return { success: false as const, error: "Failed to record exercise" };
  }
}

export async function completeSessionAction(
  sessionId: string,
  data: { overallPainLevel?: number; notes?: string }
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  // Verify the session belongs to this user
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { patientId: true },
  });
  if (!session || session.patientId !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await adherenceService.completeSession(sessionId, data);
    revalidatePath("/dashboard");
    revalidatePath("/workout-plans");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to complete session:", error);
    return { success: false as const, error: "Failed to complete session" };
  }
}

export async function abandonSessionAction(sessionId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  // Verify the session belongs to this user
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { patientId: true },
  });
  if (!session || session.patientId !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await adherenceService.abandonSession(sessionId);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to abandon session:", error);
    return { success: false as const, error: "Failed to abandon session" };
  }
}
