import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.workoutPlan.findMany({
    include: {
      blocks: {
        include: { exercises: true },
        orderBy: { orderIndex: "asc" },
      },
      exercises: { orderBy: { orderIndex: "asc" } },
    },
  });

  console.log(`Found ${plans.length} plans to migrate`);

  for (const plan of plans) {
    const program = await prisma.program.create({
      data: {
        name: plan.title,
        description: plan.description,
        isTemplate: plan.isTemplate,
        clinicianId: plan.createdById,
        patientId: plan.patientId,
        status: plan.status,
        daysPerWeek: plan.daysPerWeek,
        tags: plan.tags,
        aiGenerationParams: plan.aiGenerationParams ?? undefined,
        createdAt: plan.createdAt,
      },
    });

    if (plan.blocks.length > 0) {
      const workout = await prisma.workout.create({
        data: {
          programId: program.id,
          name: plan.title,
          dayIndex: 0,
          weekIndex: 0,
          orderIndex: 0,
        },
      });

      for (const block of plan.blocks) {
        const newBlock = await prisma.workoutBlockV2.create({
          data: {
            workoutId: workout.id,
            name: block.name,
            type: "NORMAL",
            orderIndex: block.orderIndex,
          },
        });

        for (const ex of block.exercises) {
          await prisma.blockExerciseV2.create({
            data: {
              blockId: newBlock.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              sets: {
                create: Array.from({ length: ex.sets || 1 }, (_, i) => ({
                  orderIndex: i,
                  setType: "NORMAL",
                  targetReps: ex.reps,
                  targetDuration: ex.durationSeconds,
                })),
              },
            },
          });
        }
      }
    } else if (plan.exercises.length > 0) {
      const byDay = new Map<number, typeof plan.exercises>();
      for (const ex of plan.exercises) {
        const day = ex.dayOfWeek ?? 0;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(ex);
      }

      let workoutIdx = 0;
      for (const [dayIdx, exercises] of byDay) {
        const workout = await prisma.workout.create({
          data: {
            programId: program.id,
            name: `Day ${dayIdx + 1}`,
            dayIndex: dayIdx,
            weekIndex: 0,
            orderIndex: workoutIdx++,
          },
        });

        const block = await prisma.workoutBlockV2.create({
          data: {
            workoutId: workout.id,
            name: "Main",
            type: "NORMAL",
            orderIndex: 0,
          },
        });

        for (const ex of exercises) {
          await prisma.blockExerciseV2.create({
            data: {
              blockId: block.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              sets: {
                create: Array.from({ length: ex.sets || 1 }, (_, i) => ({
                  orderIndex: i,
                  setType: "NORMAL",
                  targetReps: ex.reps,
                  targetDuration: ex.durationSeconds,
                })),
              },
            },
          });
        }
      }
    }

    console.log(`Migrated plan "${plan.title}" -> program "${program.name}"`);
  }

  console.log("Migration complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
