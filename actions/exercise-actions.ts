"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createExerciseSchema, updateExerciseSchema } from "@/lib/validators/exercise";
import * as exerciseService from "@/lib/services/exercise.service";
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";

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
    // Use live session orgId first — more reliable than the DB field when user's org was added after onboarding
    const { userId, orgId: sessionOrgId } = await auth();
    if (!userId) return { success: false as const, error: "Unauthorized" };

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false as const, error: "User not found" };
    if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

    const clinicOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

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
        source: clinicOrgId ? "CLINIC" : "UNIVERSAL",
        organizationId: clinicOrgId ?? undefined,
        isPublic: parsed.data.isPublic ?? true,
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

export async function addExerciseMediaAction(
  exerciseId: string,
  media: { mediaType: "image" | "video"; url: string; altText?: string }
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  try {
    const item = await prisma.exerciseMedia.create({
      data: {
        exerciseId,
        mediaType: media.mediaType,
        url: media.url,
        altText: media.altText ?? null,
      },
    });
    revalidatePath(`/exercises/${exerciseId}`);
    revalidatePath(`/exercises/${exerciseId}/edit`);
    return { success: true as const, data: item };
  } catch (error) {
    console.error("Failed to add media:", error);
    return { success: false as const, error: "Failed to add media" };
  }
}

export async function deleteExerciseMediaAction(
  exerciseId: string,
  mediaId: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  try {
    await prisma.exerciseMedia.delete({ where: { id: mediaId } });
    revalidatePath(`/exercises/${exerciseId}`);
    revalidatePath(`/exercises/${exerciseId}/edit`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete media:", error);
    return { success: false as const, error: "Failed to delete media" };
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

export async function createClinicExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  difficultyLevel: string;
  videoUrl?: string;
  isPublic: boolean;
  exercisePhase?: string;
}) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const clinicOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  try {
    const exercise = await exerciseService.createExercise({
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      bodyRegion: input.bodyRegion as BodyRegion,
      difficultyLevel: input.difficultyLevel as DifficultyLevel,
      equipmentRequired: [],
      contraindications: [],
      videoUrl: input.videoUrl?.trim() || undefined,
      createdById: dbUser.id,
      source: clinicOrgId ? "CLINIC" : "UNIVERSAL",
      organizationId: clinicOrgId ?? undefined,
      isPublic: input.isPublic,
      exercisePhase: input.exercisePhase as ExercisePhase | undefined,
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create clinic exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}

export async function toggleExercisePublicAction(exerciseId: string, isPublic: boolean) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const clinicOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) return { success: false as const, error: "Exercise not found" };
  if (exercise.source !== "CLINIC") {
    return { success: false as const, error: "Cannot modify a universal exercise" };
  }
  if (exercise.organizationId !== clinicOrgId) {
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
