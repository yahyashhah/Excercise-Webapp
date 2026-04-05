
"use server";

import { prisma } from "@/lib/prisma";

export async function getPatientExerciseHistory(patientId: string, exerciseId: string, limit: number = 3) {
  try {
    const sessions = await prisma.workoutSessionV2.findMany({
      where: {
        patientId,
        status: { in: ["COMPLETED", "IN_PROGRESS", "SCHEDULED"] },
        workout: {
          blocks: {
            some: {
              exercises: {
                some: { exerciseId }
              }
            }
          }
        },
        scheduledDate: { lte: new Date() }
      },
      orderBy: { scheduledDate: "desc" },
      take: limit,
      include: {
        workout: {
          include: {
            blocks: {
              include: {
                exercises: {
                  where: { exerciseId },
                  include: { sets: { orderBy: { orderIndex: "asc" } } }
                }
              }
            }
          }
        },
        exerciseLogs: {
          include: { setLogs: { orderBy: { setIndex: "asc" } } }
        }
      }
    });

    const history = sessions.map(session => {
      // Find the specific block exercises for this exerciseId in the session
      const matchedBlockExercises = session.workout.blocks.flatMap(b => b.exercises);
      
      const exerciseRecords = matchedBlockExercises.map(blockEx => {
        // Find corresponding log if it exists
        const log = session.exerciseLogs.find(l => l.blockExerciseId === blockEx.id);
        return {
          blockExerciseId: blockEx.id,
          targetSets: blockEx.sets,
          actualSets: log?.setLogs || [],
          status: log?.status || "PENDING",
        };
      });

      return {
        sessionId: session.id,
        scheduledDate: session.scheduledDate,
        status: session.status,
        records: exerciseRecords
      };
    });

    return { success: true, data: history };
  } catch (error) {
    return { success: false, error: "Failed to fetch exercise history" };
  }
}

