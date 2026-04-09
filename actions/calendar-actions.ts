"use server";

import { prisma as db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { SessionStatus } from "@prisma/client";

export async function getPatientWorkoutSessions(patientId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    // Optional: add a check to make sure the user has access to this patient

    const sessions = await db.workoutSession.findMany({
      where: {
        patientId,
      },
      include: {
        plan: {
          select: {
            title: true,
          }
        }
      },
      orderBy: {
        scheduledDate: "asc",
      },
    });

    return { success: true, sessions };
  } catch (error) {
    console.error("Error fetching patient workout sessions:", error);
    return { success: false, error: "Failed to fetch workout sessions" };
  }
}

export async function updateSessionDate(sessionId: string, newDate: Date) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    // Verify session exists and user has permission
    const session = await db.workoutSession.findUnique({
      where: { id: sessionId },
      select: { patientId: true, plan: { select: { createdById: true } } }
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    if (user.role === "PATIENT" && session.patientId !== user.id) {
       return { success: false, error: "Unauthorized" };
    }
    
    // Clinician authorization would go here as well

    const updatedSession = await db.workoutSession.update({
      where: { id: sessionId },
      data: {
        scheduledDate: newDate,
      },
      include: {
        plan: {
          select: { title: true }
        }
      }
    });

    revalidatePath(`/dashboard`);
    revalidatePath(`/patients/${session.patientId}`);
    
    return { success: true, session: updatedSession };
  } catch (error) {
    console.error("Error updating session date:", error);
    return { success: false, error: "Failed to update session date" };
  }
}
export async function scheduleProgramForPatientAction({
  programId,
  patientId,
  startDate,
  preferredWeekdays,
  customWorkoutDates,
}: {
  programId: string;
  patientId: string;
  startDate: string;
  preferredWeekdays?: string[];
  customWorkoutDates?: Record<string, string>;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "CLINICIAN") {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    const sourceProgram = await db.program.findUnique({
      where: { id: programId },
      include: {
        workouts: {
          include: {
            blocks: {
              include: {
                exercises: {
                  include: {
                    sets: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!sourceProgram) {
      return { success: false, error: "Program not found" };
    }

    const sDate = new Date(startDate);
    const weekdayToIndex: Record<string, number> = {
      monday: 0,
      tuesday: 1,
      wednesday: 2,
      thursday: 3,
      friday: 4,
      saturday: 5,
      sunday: 6,
    };

    const selectedDayIndexes = Array.from(
      new Set(
        (preferredWeekdays ?? [])
          .map((d) => weekdayToIndex[d.toLowerCase().trim()])
          .filter((d): d is number => Number.isInteger(d))
      )
    ).sort((a, b) => a - b);

    const mondayStart = new Date(sDate);
    const day = mondayStart.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    mondayStart.setDate(mondayStart.getDate() + diff);

    const sortedWorkouts = [...sourceProgram.workouts].sort((a, b) => {
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.orderIndex - b.orderIndex;
    });

    const weekPositionMap = new Map<number, number>();

    const newProgram = await db.program.create({
      data: {
        name: sourceProgram.name,
        description: sourceProgram.description,
        isTemplate: false,
        sourceTemplateId: sourceProgram.id,
        clinicianId: user.id,
        patientId: patientId,
        status: "ACTIVE",
        durationWeeks: sourceProgram.durationWeeks,
        daysPerWeek: sourceProgram.daysPerWeek,
        tags: sourceProgram.tags,
        startDate: sDate,
        workouts: {
          create: sortedWorkouts.map((w) => {
            const workoutDate = new Date(sDate);
            if (customWorkoutDates && customWorkoutDates[w.id]) {
               workoutDate.setTime(new Date(customWorkoutDates[w.id]).getTime());
            } else if (selectedDayIndexes.length > 0) {
              const weekPosition = weekPositionMap.get(w.weekIndex) ?? 0;
              weekPositionMap.set(w.weekIndex, weekPosition + 1);
              const targetDayIndex =
                selectedDayIndexes[
                  weekPosition % selectedDayIndexes.length
                ];
              const weekBase = new Date(mondayStart);
              weekBase.setDate(weekBase.getDate() + w.weekIndex * 7 + targetDayIndex);
              workoutDate.setTime(weekBase.getTime());
            } else {
              workoutDate.setDate(
                workoutDate.getDate() + w.weekIndex * 7 + w.dayIndex
              );
            }

            return {
              name: w.name,
              description: w.description,
              dayIndex: w.dayIndex,
              weekIndex: w.weekIndex,
              orderIndex: w.orderIndex,
              estimatedMinutes: w.estimatedMinutes,
              blocks: {
                create: w.blocks.map((b) => ({
                  name: b.name,
                  type: b.type,
                  orderIndex: b.orderIndex,
                  rounds: b.rounds,
                  restBetweenRounds: b.restBetweenRounds,
                  timeCap: b.timeCap,
                  notes: b.notes,
                  exercises: {
                    create: b.exercises.map((e) => ({
                      exerciseId: e.exerciseId,
                      orderIndex: e.orderIndex,
                      restSeconds: e.restSeconds,
                      notes: e.notes,
                      supersetGroup: e.supersetGroup,
                      sets: {
                        create: e.sets.map((s: any) => ({
                          orderIndex: s.orderIndex,
                          setType: s.setType,
                          targetReps: s.targetReps,
                          targetWeight: s.targetWeight,
                          targetDuration: s.targetDuration,
                          targetDistance: s.targetDistance,
                          targetRPE: s.targetRPE,
                          targetPercentage1RM: s.targetPercentage1RM,
                          tempo: s.tempo,
                          restAfter: s.restAfter,
                        })),
                      },
                    })),
                  },
                })),
              },
              sessions: {
                create: [
                  {
                    patientId: patientId,
                    scheduledDate: workoutDate,
                    status: "SCHEDULED",
                  },
                ],
              },
            };
          }),
        },
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/programs");

    return { success: true, programId: newProgram.id };
  } catch (error) {
    console.error("Failed to schedule program:", error);
    return { success: false, error: "Failed to schedule program" };
  }
}