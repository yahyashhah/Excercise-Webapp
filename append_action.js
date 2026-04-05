const fs = require('fs');
const content = \
export async function scheduleProgramForPatientAction({
  programId,
  patientId,
  startDate,
}: {
  programId: string;
  patientId: string;
  startDate: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'CLINICIAN') {
      return { success: false, error: 'Unauthorized or Forbidden' };
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
      return { success: false, error: 'Program not found' };
    }

    const sDate = new Date(startDate);

    const newProgram = await db.program.create({
      data: {
        name: sourceProgram.name,
        description: sourceProgram.description,
        isTemplate: false,
        sourceTemplateId: sourceProgram.id,
        clinicianId: user.id,
        patientId: patientId,
        status: 'ACTIVE',
        durationWeeks: sourceProgram.durationWeeks,
        daysPerWeek: sourceProgram.daysPerWeek,
        tags: sourceProgram.tags,
        startDate: sDate,
        workouts: {
          create: sourceProgram.workouts.map((w) => {
            const workoutDate = new Date(sDate);
            workoutDate.setDate(
              workoutDate.getDate() + w.weekIndex * 7 + w.dayIndex
            );

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
                        create: e.sets.map((s) => ({
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
                    status: 'SCHEDULED',
                  },
                ],
              },
            };
          }),
        },
      },
    });

    revalidatePath('/dashboard');
    revalidatePath(\/patients/\\);
    revalidatePath('/programs');

    return { success: true, programId: newProgram.id };
  } catch (error) {
    console.error('Failed to schedule program:', error);
    return { success: false, error: 'Failed to schedule program' };
  }
}
\;
fs.appendFileSync('actions/calendar-actions.ts', content);

