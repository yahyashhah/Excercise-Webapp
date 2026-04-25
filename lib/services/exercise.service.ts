import { prisma } from "@/lib/prisma";
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";
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
    },
    include: { media: true },
    orderBy: { name: "asc" },
  });
}

export async function getExercisesForPicker() {
  return prisma.exercise.findMany({
    where: { isActive: true },
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
      },
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
