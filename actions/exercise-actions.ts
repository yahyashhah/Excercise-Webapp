"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createExerciseSchema, updateExerciseSchema } from "@/lib/validators/exercise";
import * as exerciseService from "@/lib/services/exercise.service";
import type { BodyRegion, DifficultyLevel } from "@prisma/client";

export async function createExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  equipmentRequired: string[];
  difficultyLevel: string;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  imageUrl?: string;
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
      imageUrl: parsed.data.imageUrl || undefined,
      createdById: dbUser.id,
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}

export async function updateExerciseAction(
  exerciseId: string,
  input: Record<string, unknown>
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const parsed = updateExerciseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const exercise = await exerciseService.updateExercise(exerciseId, parsed.data as Parameters<typeof exerciseService.updateExercise>[1]);
    revalidatePath("/exercises");
    revalidatePath(`/exercises/${exerciseId}`);
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to update exercise:", error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}

export async function deleteExerciseAction(exerciseId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  try {
    await exerciseService.deleteExercise(exerciseId);
    revalidatePath("/exercises");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete exercise:", error);
    return { success: false as const, error: "Failed to delete exercise" };
  }
}
