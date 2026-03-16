import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";

export async function createPlan(data: {
  patientId: string;
  createdById: string;
  title: string;
  description?: string;
  durationMinutes?: number;
  daysPerWeek?: number;
  aiGenerationParams?: Record<string, unknown>;
  exercises: {
    exerciseId: string;
    dayOfWeek?: number;
    orderIndex: number;
    sets: number;
    reps?: number;
    durationSeconds?: number;
    restSeconds?: number;
    notes?: string;
  }[];
}) {
  const { exercises, aiGenerationParams, ...planData } = data;

  return prisma.workoutPlan.create({
    data: {
      ...planData,
      aiGenerationParams: aiGenerationParams
        ? (aiGenerationParams as Prisma.InputJsonValue)
        : undefined,
      exercises: {
        create: exercises,
      },
    },
    include: {
      exercises: {
        include: { exercise: true },
        orderBy: { orderIndex: "asc" },
      },
      patient: true,
    },
  });
}

export async function getPlanById(id: string) {
  return prisma.workoutPlan.findUnique({
    where: { id },
    include: {
      exercises: {
        where: { isActive: true },
        include: {
          exercise: { include: { media: true } },
          feedback: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
        orderBy: { orderIndex: "asc" },
      },
      patient: { include: { patientProfile: true } },
      createdBy: true,
      _count: { select: { sessions: true } },
    },
  });
}

export async function getPlansForPatient(patientId: string) {
  return prisma.workoutPlan.findMany({
    where: { patientId },
    include: {
      createdBy: true,
      _count: { select: { exercises: true, sessions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPlansCreatedBy(clinicianId: string) {
  return prisma.workoutPlan.findMany({
    where: { createdById: clinicianId },
    include: {
      patient: true,
      _count: { select: { exercises: true, sessions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updatePlanExercise(
  id: string,
  data: Partial<{
    sets: number;
    reps: number;
    durationSeconds: number;
    restSeconds: number;
    notes: string;
    isActive: boolean;
    orderIndex: number;
  }>
) {
  return prisma.planExercise.update({ where: { id }, data });
}

export async function swapExercise(planExerciseId: string, newExerciseId: string) {
  const planExercise = await prisma.planExercise.findUnique({
    where: { id: planExerciseId },
    select: { planId: true },
  });

  if (!planExercise) throw new Error("Plan exercise not found");

  await prisma.planExercise.update({
    where: { id: planExerciseId },
    data: { exerciseId: newExerciseId },
  });

  await prisma.workoutPlan.update({
    where: { id: planExercise.planId },
    data: { version: { increment: 1 } },
  });
}

export async function updatePlanStatus(planId: string, status: PlanStatus) {
  return prisma.workoutPlan.update({
    where: { id: planId },
    data: { status },
  });
}

export async function deletePlan(planId: string) {
  return prisma.workoutPlan.update({
    where: { id: planId },
    data: { status: "ARCHIVED" },
  });
}
