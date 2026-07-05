import { prisma } from "@/lib/prisma";

/**
 * One-time backfill: reshapes every Exercise document's legacy scalar
 * `exercisePhase` field into the new `exercisePhases` array field.
 * MongoDB doesn't retroactively apply Prisma type changes to existing
 * documents, so this must run against the raw collection.
 */
async function backfillExercisePhases() {
  const wrapExisting = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { exercisePhase: { $exists: true, $ne: null } },
        u: [
          { $set: { exercisePhases: ["$exercisePhase"] } },
          { $unset: "exercisePhase" },
        ],
        multi: true,
      },
      {
        q: { exercisePhase: { $exists: true, $eq: null } },
        u: [
          { $set: { exercisePhases: [] } },
          { $unset: "exercisePhase" },
        ],
        multi: true,
      },
      {
        q: { exercisePhases: { $exists: false } },
        u: { $set: { exercisePhases: [] } },
        multi: true,
      },
    ],
  });

  console.log("Backfill result:", JSON.stringify(wrapExisting, null, 2));
}

backfillExercisePhases()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
