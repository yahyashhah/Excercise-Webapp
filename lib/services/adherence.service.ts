import { prisma } from "@/lib/prisma";

export async function startSession(planId: string, patientId: string) {
  return prisma.workoutSession.create({
    data: { planId, patientId },
    include: {
      plan: {
        include: {
          exercises: {
            where: { isActive: true },
            include: { exercise: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
  });
}

export async function completeSessionExercise(
  sessionId: string,
  planExerciseId: string,
  data: {
    status: string;
    actualSets?: number;
    actualReps?: number;
  }
) {
  return prisma.sessionExercise.create({
    data: {
      sessionId,
      planExerciseId,
      status: data.status,
      actualSets: data.actualSets,
      actualReps: data.actualReps,
      completedAt: data.status === "completed" ? new Date() : undefined,
    },
  });
}

export async function completeSession(
  sessionId: string,
  data: { overallPainLevel?: number; notes?: string }
) {
  return prisma.workoutSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      overallPainLevel: data.overallPainLevel,
      notes: data.notes,
    },
  });
}

export async function abandonSession(sessionId: string) {
  return prisma.workoutSession.update({
    where: { id: sessionId },
    data: { status: "ABANDONED" },
  });
}

export async function getSessionsForPatient(patientId: string) {
  return prisma.workoutSession.findMany({
    where: { patientId },
    include: {
      plan: true,
      exercises: {
        include: {
          planExercise: { include: { exercise: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function getSessionsForPlan(planId: string) {
  return prisma.workoutSession.findMany({
    where: { planId },
    include: {
      exercises: {
        include: {
          planExercise: { include: { exercise: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function getWeeklyCompliance(patientId: string) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const completedSessions = await prisma.workoutSession.count({
    where: {
      patientId,
      status: "COMPLETED",
      completedAt: { gte: weekAgo },
    },
  });

  // Get the target days per week from active plans
  const activePlans = await prisma.workoutPlan.findMany({
    where: { patientId, status: "ACTIVE" },
    select: { daysPerWeek: true },
  });

  const targetDays = activePlans.reduce((sum, p) => sum + (p.daysPerWeek || 3), 0);

  return {
    completedSessions,
    targetSessions: targetDays,
    complianceRate: targetDays > 0 ? Math.min(100, Math.round((completedSessions / targetDays) * 100)) : 0,
  };
}

export async function getAdherenceStats(patientId: string) {
  const totalSessions = await prisma.workoutSession.count({
    where: { patientId },
  });

  const completedSessions = await prisma.workoutSession.count({
    where: { patientId, status: "COMPLETED" },
  });

  const abandonedSessions = await prisma.workoutSession.count({
    where: { patientId, status: "ABANDONED" },
  });

  const sessionsWithPain = await prisma.workoutSession.findMany({
    where: {
      patientId,
      status: "COMPLETED",
      overallPainLevel: { not: null },
    },
    select: { overallPainLevel: true },
  });

  const avgPainLevel =
    sessionsWithPain.length > 0
      ? sessionsWithPain.reduce((sum, s) => sum + (s.overallPainLevel || 0), 0) / sessionsWithPain.length
      : 0;

  return {
    totalSessions,
    completedSessions,
    abandonedSessions,
    completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
    avgPainLevel: Math.round(avgPainLevel * 10) / 10,
  };
}
