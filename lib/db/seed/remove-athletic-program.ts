import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

function getExerciseNamesFromSeed(): string[] {
  const text = fs.readFileSync("lib/db/seed/import-athletic-program.ts", "utf8");
  const exerciseSection = text.split("const workoutTemplates")[0];
  const names = [...exerciseSection.matchAll(/name: \"([^\"]+)\"/g)].map(
    (m) => m[1]
  );
  return [...new Set(names)];
}

async function deleteTemplateProgram(templateName: string) {
  const existing = await prisma.program.findFirst({
    where: { name: templateName, isTemplate: true },
    select: { id: true },
  });

  if (!existing) return;

  await prisma.workout.deleteMany({ where: { programId: existing.id } });
  await prisma.program.delete({ where: { id: existing.id } });
}

async function main() {
  const exerciseNames = getExerciseNamesFromSeed();
  const templateName = "Athletic Performance Template";

  console.log(`Removing template program: ${templateName}`);
  await deleteTemplateProgram(templateName);

  console.log(`Removing ${exerciseNames.length} exercises by name...`);

  const exercises = await prisma.exercise.findMany({
    where: { name: { in: exerciseNames } },
    select: { id: true, name: true },
  });

  const exerciseIds = exercises.map((e) => e.id);

  if (exerciseIds.length === 0) {
    console.log("No matching exercises found to remove.");
    return;
  }

  await prisma.blockExerciseV2.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
  await prisma.blockExercise.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
  await prisma.planExercise.deleteMany({ where: { exerciseId: { in: exerciseIds } } });

  const result = await prisma.exercise.deleteMany({
    where: { id: { in: exerciseIds } },
  });

  console.log(`Removed ${result.count} exercises.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
