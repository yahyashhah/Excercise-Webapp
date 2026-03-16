import { prisma } from "@/lib/prisma";

export interface ProgressionSuggestion {
  planExerciseId: string;
  currentExerciseName: string;
  suggestedExerciseName: string;
  suggestedExerciseId: string;
  direction: "PROGRESSION" | "REGRESSION";
  reason: string;
}

export async function evaluatePatient(
  patientId: string,
  planId: string
): Promise<ProgressionSuggestion[]> {
  const suggestions: ProgressionSuggestion[] = [];

  const planExercises = await prisma.planExercise.findMany({
    where: { planId, isActive: true },
    include: {
      exercise: {
        include: {
          progressionsFrom: {
            include: { nextExercise: true },
          },
        },
      },
      feedback: {
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      sessionItems: {
        where: { session: { patientId, status: "COMPLETED" } },
        orderBy: { completedAt: "desc" },
        take: 5,
      },
    },
  });

  for (const pe of planExercises) {
    const recentFeedback = pe.feedback;
    if (recentFeedback.length === 0) continue;

    // Check for regression triggers: multiple "PAINFUL" ratings
    const painfulCount = recentFeedback.filter((f) => f.rating === "PAINFUL").length;
    if (painfulCount >= 2) {
      const regression = pe.exercise.progressionsFrom.find(
        (p) => p.direction === "REGRESSION"
      );
      if (regression) {
        suggestions.push({
          planExerciseId: pe.id,
          currentExerciseName: pe.exercise.name,
          suggestedExerciseName: regression.nextExercise.name,
          suggestedExerciseId: regression.nextExerciseId,
          direction: "REGRESSION",
          reason: `Patient reported pain ${painfulCount} times in recent sessions`,
        });
      }
      continue;
    }

    // Check for progression triggers: consistent "FELT_GOOD" with good completion
    const feltGoodCount = recentFeedback.filter((f) => f.rating === "FELT_GOOD").length;
    const completedItems = pe.sessionItems.filter((s) => s.status === "completed");

    if (feltGoodCount >= 3 && completedItems.length >= 3) {
      const progression = pe.exercise.progressionsFrom.find(
        (p) => p.direction === "PROGRESSION"
      );
      if (progression) {
        suggestions.push({
          planExerciseId: pe.id,
          currentExerciseName: pe.exercise.name,
          suggestedExerciseName: progression.nextExercise.name,
          suggestedExerciseId: progression.nextExerciseId,
          direction: "PROGRESSION",
          reason: `Patient consistently reporting exercises feel good with full completion`,
        });
      }
    }
  }

  return suggestions;
}
