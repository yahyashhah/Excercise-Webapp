import { prisma } from "@/lib/prisma";

export async function getSessionsForPatient(
  patientId: string,
  options?: { from?: Date; to?: Date }
) {
  return prisma.workoutSessionV2.findMany({
    where: {
      patientId,
      ...(options?.from || options?.to
        ? {
            scheduledDate: {
              ...(options?.from && { gte: options.from }),
              ...(options?.to && { lte: options.to }),
            },
          }
        : {}),
    },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
          blocks: {
            include: {
              exercises: {
                include: {
                  exercise: true,
                  sets: { orderBy: { orderIndex: "asc" } },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: { orderBy: { setIndex: "asc" } } },
        orderBy: { orderIndex: "asc" },
      },
      feedback: true,
    },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function getSessionById(sessionId: string) {
  return prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
          blocks: {
            include: {
              exercises: {
                include: {
                  exercise: { include: { media: true } },
                  sets: { orderBy: { orderIndex: "asc" } },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: { orderBy: { setIndex: "asc" } } },
        orderBy: { orderIndex: "asc" },
      },
      feedback: true,
    },
  });
}

export async function rescheduleSession(sessionId: string, newDate: Date) {
  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: { scheduledDate: newDate },
  });
}

export async function updateSessionStatus(
  sessionId: string,
  status: string,
  data?: {
    startedAt?: Date;
    completedAt?: Date;
    overallRPE?: number;
    overallNotes?: string;
    durationMinutes?: number;
  }
) {
  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: { status, ...data },
  });
}

export async function logExercise(
  sessionId: string,
  blockExerciseId: string,
  orderIndex: number,
  setLogs: {
    setIndex: number;
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    actualRPE?: number;
    notes?: string;
  }[]
) {
  return prisma.sessionExerciseLog.create({
    data: {
      sessionId,
      blockExerciseId,
      orderIndex,
      status: "COMPLETED",
      completedAt: new Date(),
      setLogs: {
        create: setLogs.map((sl) => ({
          ...sl,
          completedAt: new Date(),
        })),
      },
    },
    include: { setLogs: true },
  });
}

export async function submitSessionFeedback(
  sessionId: string,
  patientId: string,
  rating: string,
  comment?: string
) {
  return prisma.sessionFeedback.create({
    data: {
      sessionId,
      patientId,
      rating: rating as "FELT_GOOD" | "MILD_DISCOMFORT" | "PAINFUL" | "UNSURE_HOW_TO_PERFORM",
      comment,
    },
  });
}

export async function getSessionsForClinician(
  clinicianId: string,
  options?: { from?: Date; to?: Date; patientId?: string }
) {
  return prisma.workoutSessionV2.findMany({
    where: {
      workout: {
        program: { clinicianId },
      },
      ...(options?.patientId && { patientId: options.patientId }),
      ...(options?.from || options?.to
        ? {
            scheduledDate: {
              ...(options?.from && { gte: options.from }),
              ...(options?.to && { lte: options.to }),
            },
          }
        : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      workout: {
        include: {
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function getUpcomingSessions(patientId: string, limit = 5) {
  return prisma.workoutSessionV2.findMany({
    where: {
      patientId,
      status: "SCHEDULED",
      scheduledDate: { gte: new Date() },
    },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
    take: limit,
  });
}
