import { prisma } from "@/lib/prisma";
import type { FeedbackRating } from "@prisma/client";

export async function submitFeedback(data: {
  planExerciseId: string;
  patientId: string;
  rating: FeedbackRating;
  comment?: string;
}) {
  return prisma.exerciseFeedback.create({ data });
}

export async function getFeedbackForPlan(planId: string) {
  return prisma.exerciseFeedback.findMany({
    where: {
      planExercise: { planId },
    },
    include: {
      planExercise: { include: { exercise: true } },
      patient: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFeedbackForPatient(patientId: string) {
  return prisma.exerciseFeedback.findMany({
    where: { patientId },
    include: {
      planExercise: {
        include: {
          exercise: true,
          plan: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingFeedbackForClinician(clinicianId: string) {
  return prisma.exerciseFeedback.findMany({
    where: {
      clinicianResponse: null,
      planExercise: {
        plan: { createdById: clinicianId },
      },
    },
    include: {
      planExercise: { include: { exercise: true } },
      patient: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function respondToFeedback(id: string, clinicianResponse: string) {
  return prisma.exerciseFeedback.update({
    where: { id },
    data: {
      clinicianResponse,
      respondedAt: new Date(),
    },
  });
}
