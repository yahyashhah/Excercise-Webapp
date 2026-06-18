import { prisma } from "@/lib/prisma";
import type { FeedbackRating } from "@prisma/client";

export async function submitFeedback(data: {
  planExerciseId: string;
  clientId: string;
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
      client: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFeedbackForClient(clientId: string) {
  return prisma.exerciseFeedback.findMany({
    where: { clientId },
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

export async function getPendingFeedbackForTrainer(trainerId: string) {
  return prisma.exerciseFeedback.findMany({
    where: {
      trainerResponse: null,
      planExercise: {
        plan: { createdById: trainerId },
      },
    },
    include: {
      planExercise: { include: { exercise: true } },
      client: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function respondToFeedback(id: string, trainerResponse: string) {
  return prisma.exerciseFeedback.update({
    where: { id },
    data: {
      trainerResponse,
      respondedAt: new Date(),
    },
  });
}
