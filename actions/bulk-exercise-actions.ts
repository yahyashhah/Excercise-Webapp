"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";

export interface BulkExerciseInput {
  name: string;
  description?: string;
  instructions?: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhase?: string;
  musclesTargeted: string[];
  equipmentRequired: string[];
  contraindications: string[];
  commonMistakes?: string;
  defaultSets?: number;
  defaultReps?: number;
  videoUrl?: string;
  imageUrl?: string;
}

export async function bulkCreateExercisesAction(exercises: BulkExerciseInput[]) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  if (!exercises.length) return { success: false as const, error: "No exercises provided" };

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
            videoProvider: ex.videoUrl ? "uploadthing" : null,
            createdById: dbUser.id,
            isActive: true,
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
