import { PrismaClient } from "@prisma/client";
import { exercisesV2 } from "./exercises-v2";

const prisma = new PrismaClient();

const CONCURRENCY = 10;

async function upsertExercise(exercise: (typeof exercisesV2)[0]): Promise<"created" | "updated"> {
  const existing = await prisma.exercise.findFirst({ where: { name: exercise.name }, select: { id: true } });
  if (existing) {
    await prisma.exercise.update({
      where: { id: existing.id },
      data: {
        description: exercise.description,
        bodyRegion: exercise.bodyRegion,
        difficultyLevel: exercise.difficultyLevel,
        exercisePhase: exercise.exercisePhase,
        musclesTargeted: exercise.musclesTargeted,
        equipmentRequired: exercise.equipmentRequired,
        contraindications: exercise.contraindications,
        instructions: exercise.instructions,
        commonMistakes: exercise.commonMistakes,
        defaultSets: exercise.defaultSets,
        defaultReps: exercise.defaultReps,
        defaultHoldSeconds: exercise.defaultHoldSeconds,
        cuesThumbnail: exercise.cuesThumbnail,
      },
    });
    return "updated";
  } else {
    await prisma.exercise.create({ data: exercise });
    return "created";
  }
}

async function main() {
  console.log(`Seeding exercise library with ${exercisesV2.length} exercises (${CONCURRENCY} at a time)...`);

  let created = 0;
  let updated = 0;

  // Process in batches of CONCURRENCY to avoid overwhelming the connection pool
  for (let i = 0; i < exercisesV2.length; i += CONCURRENCY) {
    const batch = exercisesV2.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(upsertExercise));
    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value === "created") created++;
        else updated++;
      } else {
        console.error("Failed to seed exercise:", result.reason);
      }
    }
    console.log(`  Progress: ${Math.min(i + CONCURRENCY, exercisesV2.length)}/${exercisesV2.length}`);
  }

  console.log(`\nDone: ${created} created, ${updated} updated. Total: ${exercisesV2.length}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
