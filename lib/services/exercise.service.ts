import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { BodyRegion, DifficultyLevel, ExercisePhase, ExerciseSource } from "@prisma/client";
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
  source?: ExerciseSource;
  organizationId?: string;
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
      // UNIVERSAL: explicit match only — run backfillExerciseSources() once to fix pre-migration docs
      ...(filters.source === "UNIVERSAL" && { source: "UNIVERSAL" as const }),
      // ORGANIZATION: always filter by source; use impossible sentinel when no orgId to return 0 results
      ...(filters.source === "ORGANIZATION" && {
        source: "ORGANIZATION" as const,
        ...(filters.organizationId ? { organizationId: filters.organizationId } : { organizationId: "__none__" }),
      }),
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      exercisePhase: true,
      equipmentRequired: true,
      description: true,
      imageUrl: true,
      videoUrl: true,
      isActive: true,
      source: true,
      isPublic: true,
      organizationId: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getExercisesForPicker(organizationId?: string) {
  const orClauses: Prisma.ExerciseWhereInput[] = [
    { source: "UNIVERSAL" },
    { source: "ORGANIZATION", isPublic: true },
  ];
  if (organizationId) {
    orClauses.push({ source: "ORGANIZATION", organizationId });
  }

  return prisma.exercise.findMany({
    where: {
      isActive: true,
      OR: orClauses,
    },
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
      source: true,
      organizationId: true,
      isPublic: true,
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
  source?: ExerciseSource;
  organizationId?: string;
  isPublic?: boolean;
  exercisePhase?: ExercisePhase;
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
      name: data.name,
      description: data.description,
      bodyRegion: data.bodyRegion,
      equipmentRequired: data.equipmentRequired,
      difficultyLevel: data.difficultyLevel,
      contraindications: data.contraindications,
      instructions: data.instructions,
      videoUrl,
      videoProvider: data.videoProvider,
      imageUrl,
      createdById: data.createdById,
      source: data.source ?? "UNIVERSAL",
      organizationId: data.organizationId ?? null,
      isPublic: data.isPublic ?? true,
      exercisePhase: data.exercisePhase,
    },
  });
}

/**
 * Flips isPublic for a ORGANIZATION exercise.
 * Callers MUST verify: exercise.source === 'ORGANIZATION' && exercise.organizationId === callerOrgId
 * before calling this — the service performs no ownership check.
 */
export async function toggleExercisePublic(exerciseId: string, isPublic: boolean) {
  return prisma.exercise.update({
    where: { id: exerciseId },
    data: { isPublic },
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
    isPublic: boolean;
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

/**
 * One-time backfill: sets source=UNIVERSAL and isPublic=true on all exercises
 * that were created before the ExerciseSource field was added to the schema.
 * MongoDB doesn't retroactively apply Prisma @default values to existing documents.
 */
export async function backfillExerciseSources() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { source: { $exists: false } },
        u: { $set: { source: "UNIVERSAL", isPublic: true } },
        multi: true,
      },
    ],
  });
  return result;
}
