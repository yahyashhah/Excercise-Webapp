import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";

// A valid 12-byte ObjectId as a 24-char hex string, generated client-side so we
// can bulk-insert child rows referencing their parents without a round-trip to
// read back generated ids.
function newObjectId(): string {
  return randomBytes(12).toString("hex");
}
import type {
  CreateProgramInput,
  ProgramFilterInput,
  WorkoutInput,
} from "@/lib/validators/program";

// --- Include presets ---
const programListInclude = {
  trainer: { select: { id: true, firstName: true, lastName: true } },
  client: { select: { id: true, firstName: true, lastName: true } },
  workouts: { select: { id: true, name: true } },
  _count: { select: { workouts: true } },
} satisfies Prisma.ProgramInclude;

const programDetailInclude = {
  trainer: { select: { id: true, firstName: true, lastName: true } },
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clientProfile: true,
    },
  },
  workouts: {
    orderBy: { orderIndex: "asc" as const },
    include: {
      blocks: {
        orderBy: { orderIndex: "asc" as const },
        include: {
          exercises: {
            orderBy: { orderIndex: "asc" as const },
            include: {
              exercise: { include: { media: true } },
              sets: { orderBy: { orderIndex: "asc" as const } },
            },
          },
        },
      },
      _count: { select: { sessions: true } },
    },
  },
} satisfies Prisma.ProgramInclude;

// --- CRUD ---

export async function createProgram(
  trainerId: string,
  data: CreateProgramInput
) {
  const { workouts, startDate, organizationIds, ...rest } = data;
  void organizationIds;

  // Create the program shell, then bulk-insert the workout tree one LEVEL at a
  // time via createMany. A single deeply-nested `create` (workouts → blocks →
  // exercises → sets) inserts every descendant in its own round-trip — hundreds
  // of them for a real program, ~250ms each on a remote DB, minutes total (and
  // the wrapping transaction can abort). Pre-generating ObjectIds lets each
  // child row reference its parent, so the whole tree is 4 bulk inserts.
  const program = await prisma.program.create({
    data: {
      ...rest,
      trainerId,
      startDate: startDate ? new Date(startDate) : undefined,
    },
  });

  const workoutRows: Prisma.WorkoutCreateManyInput[] = [];
  const blockRows: Prisma.WorkoutBlockV2CreateManyInput[] = [];
  const exerciseRows: Prisma.BlockExerciseV2CreateManyInput[] = [];
  const setRows: Prisma.ExerciseSetCreateManyInput[] = [];

  for (const w of workouts) {
    const workoutId = newObjectId();
    workoutRows.push({
      id: workoutId,
      programId: program.id,
      name: w.name,
      description: w.description,
      dayIndex: w.dayIndex,
      weekIndex: w.weekIndex,
      orderIndex: w.orderIndex,
      estimatedMinutes: w.estimatedMinutes,
    });
    for (const b of w.blocks) {
      const blockId = newObjectId();
      blockRows.push({
        id: blockId,
        workoutId,
        name: b.name,
        type: b.type,
        orderIndex: b.orderIndex,
        rounds: b.rounds,
        restBetweenRounds: b.restBetweenRounds,
        timeCap: b.timeCap,
        notes: b.notes,
      });
      for (const e of b.exercises) {
        const blockExerciseId = newObjectId();
        exerciseRows.push({
          id: blockExerciseId,
          blockId,
          exerciseId: e.exerciseId,
          orderIndex: e.orderIndex,
          restSeconds: e.restSeconds,
          notes: e.notes,
          supersetGroup: e.supersetGroup,
        });
        for (const s of e.sets) {
          setRows.push({
            id: newObjectId(),
            blockExerciseId,
            orderIndex: s.orderIndex,
            setType: s.setType,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            targetDuration: s.targetDuration,
            targetDistance: s.targetDistance,
            targetRPE: s.targetRPE,
            restAfter: s.restAfter,
          });
        }
      }
    }
  }

  if (workoutRows.length) await prisma.workout.createMany({ data: workoutRows });
  if (blockRows.length) await prisma.workoutBlockV2.createMany({ data: blockRows });
  if (exerciseRows.length) await prisma.blockExerciseV2.createMany({ data: exerciseRows });
  if (setRows.length) await prisma.exerciseSet.createMany({ data: setRows });

  const full = await prisma.program.findUnique({
    where: { id: program.id },
    include: programDetailInclude,
  });
  if (!full) throw new Error("Program not found immediately after creation");
  return full;
}

export async function getProgramById(id: string) {
  return prisma.program.findUnique({
    where: { id },
    include: programDetailInclude,
  });
}

export async function getPrograms(
  trainerId: string,
  filters: ProgramFilterInput = {}
) {
  const where: Prisma.ProgramWhereInput = {
    trainerId,
    isGlobal: false,
    ...(filters.status && { status: filters.status as PlanStatus }),
    ...(filters.isTemplate !== undefined && { isTemplate: filters.isTemplate }),
    ...(filters.clientId && { clientId: filters.clientId }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" as const } },
        {
          workouts: {
            some: { name: { contains: filters.search, mode: "insensitive" as const } },
          },
        },
      ],
    }),
  };

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Replace a program's workout tree in place, matching incoming items to
 * existing rows by id instead of deleting everything and recreating it.
 *
 * Workout is the one level in this tree that other user-generated data
 * (WorkoutSessionV2 — scheduled/completed sessions, their logs and
 * feedback — plus VoiceMemo) points at via onDelete: Cascade. Deleting a
 * Workout row therefore destroys that history; deleting a
 * WorkoutBlockV2/BlockExerciseV2/ExerciseSet does not, since nothing
 * outside their own subtree references them. So: workouts matched by id
 * are updated in place (id survives, sessions survive) and only their
 * block/exercise/set subtree is replaced wholesale; workouts the trainer
 * removed are deleted only if they have zero sessions attached — one with
 * session history is left in place rather than silently destroying it.
 *
 * Deliberately NOT wrapped in a single prisma.$transaction: on this
 * deployment's MongoDB cluster, an interactive transaction binds every
 * statement to one server-side session, which serializes them — a
 * multi-week program's worth of round-trips inside one transaction was
 * measured to exceed even a 30s timeout, and Promise.all doesn't help
 * because the session still processes them one at a time. Running as
 * plain (non-transactional) calls lets the connection pool actually
 * parallelize independent writes, and is safe here regardless: the one
 * operation that can destroy user data (deleting a Workout row) is
 * already scoped to an explicit, pre-computed id allowlist that excludes
 * every session-bearing workout — that safety property doesn't depend on
 * transactional atomicity. A mid-failure can leave a workout's blocks
 * temporarily empty until the next save; it can never delete a session.
 */
async function replaceWorkoutTree(
  tx: typeof prisma,
  programId: string,
  workouts: WorkoutInput[]
): Promise<void> {
  const existing = await tx.workout.findMany({
    where: { programId },
    select: { id: true, _count: { select: { sessions: true } } },
  });
  const existingById = new Map(existing.map((w) => [w.id, w] as const));

  const matchedIds = new Set<string>();
  for (const w of workouts) {
    if (w.id && existingById.has(w.id)) matchedIds.add(w.id);
  }

  const removed = existing.filter((w) => !matchedIds.has(w.id));
  const removableIds = removed
    .filter((w) => w._count.sessions === 0)
    .map((w) => w.id);

  if (removableIds.length) {
    await tx.workout.deleteMany({ where: { id: { in: removableIds } } });
  }
  if (matchedIds.size) {
    await tx.workoutBlockV2.deleteMany({
      where: { workoutId: { in: [...matchedIds] } },
    });
  }

  const newWorkoutRows: Prisma.WorkoutCreateManyInput[] = [];
  const workoutUpdates: Promise<unknown>[] = [];
  const blockRows: Prisma.WorkoutBlockV2CreateManyInput[] = [];
  const exerciseRows: Prisma.BlockExerciseV2CreateManyInput[] = [];
  const setRows: Prisma.ExerciseSetCreateManyInput[] = [];

  for (const w of workouts) {
    const isExisting = Boolean(w.id && matchedIds.has(w.id));
    const workoutId = isExisting ? w.id! : newObjectId();

    if (isExisting) {
      // Independent rows — fire concurrently rather than one round-trip per
      // workout in sequence. On a remote cluster a sequential loop over a
      // multi-week program can take longer than the surrounding
      // transaction's timeout.
      workoutUpdates.push(
        tx.workout.update({
          where: { id: workoutId },
          data: {
            name: w.name,
            description: w.description,
            dayIndex: w.dayIndex,
            weekIndex: w.weekIndex,
            orderIndex: w.orderIndex,
            estimatedMinutes: w.estimatedMinutes,
          },
        })
      );
    } else {
      newWorkoutRows.push({
        id: workoutId,
        programId,
        name: w.name,
        description: w.description,
        dayIndex: w.dayIndex,
        weekIndex: w.weekIndex,
        orderIndex: w.orderIndex,
        estimatedMinutes: w.estimatedMinutes,
      });
    }

    for (const b of w.blocks) {
      const blockId = newObjectId();
      blockRows.push({
        id: blockId,
        workoutId,
        name: b.name,
        type: b.type,
        orderIndex: b.orderIndex,
        rounds: b.rounds,
        restBetweenRounds: b.restBetweenRounds,
        timeCap: b.timeCap,
        notes: b.notes,
      });
      for (const e of b.exercises) {
        const blockExerciseId = newObjectId();
        exerciseRows.push({
          id: blockExerciseId,
          blockId,
          exerciseId: e.exerciseId,
          orderIndex: e.orderIndex,
          restSeconds: e.restSeconds,
          notes: e.notes,
          supersetGroup: e.supersetGroup,
        });
        for (const s of e.sets) {
          setRows.push({
            id: newObjectId(),
            blockExerciseId,
            orderIndex: s.orderIndex,
            setType: s.setType,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            targetDuration: s.targetDuration,
            targetDistance: s.targetDistance,
            targetRPE: s.targetRPE,
            restAfter: s.restAfter,
          });
        }
      }
    }
  }

  if (workoutUpdates.length) await Promise.all(workoutUpdates);
  if (newWorkoutRows.length) await tx.workout.createMany({ data: newWorkoutRows });
  if (blockRows.length) await tx.workoutBlockV2.createMany({ data: blockRows });
  if (exerciseRows.length) await tx.blockExerciseV2.createMany({ data: exerciseRows });
  if (setRows.length) await tx.exerciseSet.createMany({ data: setRows });
}

export async function updateProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  if (workouts) {
    await replaceWorkoutTree(prisma, id, workouts);
    return prisma.program.update({
      where: { id },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
        startDate: startDate ? new Date(startDate) : undefined,
      },
      include: programDetailInclude,
    });
  }

  return prisma.program.update({
    where: { id },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
    },
    include: programDetailInclude,
  });
}

export async function deleteProgram(id: string) {
  return prisma.program.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

export async function duplicateProgram(
  id: string,
  trainerId: string,
  asTemplate = false
) {
  const source = await getProgramById(id);
  if (!source) throw new Error("Program not found");

  const workouts = source.workouts.map((w, wi) => ({
    name: w.name,
    description: w.description,
    dayIndex: w.dayIndex,
    weekIndex: w.weekIndex,
    orderIndex: wi,
    estimatedMinutes: w.estimatedMinutes,
    blocks: w.blocks.map((b, bi) => ({
      name: b.name,
      type: b.type as "NORMAL" | "WARMUP" | "COOLDOWN" | "SUPERSET" | "CIRCUIT" | "AMRAP" | "EMOM",
      orderIndex: bi,
      rounds: b.rounds,
      restBetweenRounds: b.restBetweenRounds,
      timeCap: b.timeCap,
      notes: b.notes,
      exercises: b.exercises.map((e, ei) => ({
        exerciseId: e.exerciseId,
        orderIndex: ei,
        restSeconds: e.restSeconds,
        notes: e.notes,
        supersetGroup: e.supersetGroup,
        sets: e.sets.map((s, si) => ({
          orderIndex: si,
          setType: s.setType as
            | "NORMAL"
            | "WARMUP"
            | "DROP_SET"
            | "FAILURE",
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetDistance: s.targetDistance,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      })),
    })),
  }));

  return createProgram(trainerId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    isTemplate: asTemplate,
    sourceTemplateId: source.id,
    durationWeeks: source.durationWeeks,
    daysPerWeek: source.daysPerWeek,
    tags: source.tags,
    equipmentRequired: source.equipmentRequired ?? [],
    organizationIds: [],
    workouts,
  });
}

export async function assignProgram(
  programId: string,
  clientId: string,
  startDate: Date
) {
  // Narrow select: only pull the workout fields needed to compute session dates
  const program = await prisma.program.update({
    where: { id: programId },
    data: { clientId, startDate, status: "ACTIVE" },
    select: {
      id: true,
      workouts: { select: { id: true, dayIndex: true, weekIndex: true } },
    },
  });

  if (program.workouts.length > 0) {
    await prisma.workoutSessionV2.createMany({
      data: program.workouts.map((w) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + w.weekIndex * 7 + w.dayIndex);
        return { workoutId: w.id, clientId, scheduledDate: d, status: "SCHEDULED" as const };
      }),
    });
  }

  return program;
}

export async function getProgramsForClient(clientId: string) {
  return prisma.program.findMany({
    where: { clientId, status: { in: ["ACTIVE", "PAUSED"] } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplates(trainerId: string) {
  return prisma.program.findMany({
    where: { trainerId, isTemplate: true, status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

// --- Global Programs (super admin) ---

export async function getGlobalPrograms(clerkOrgId?: string) {
  const where: Prisma.ProgramWhereInput = {
    isGlobal: true,
    status: { not: "ARCHIVED" },
  };
  if (clerkOrgId) {
    where.OR = [
      { organizationIds: { isEmpty: true } },
      { organizationIds: { has: clerkOrgId } },
    ];
  }

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function createGlobalProgram(data: CreateProgramInput) {
  const { workouts, startDate, ...rest } = data;

  return prisma.program.create({
    data: {
      ...rest,
      isGlobal: true,
      trainerId: null,
      startDate: startDate ? new Date(startDate) : undefined,
      workouts: {
        create: workouts.map((w) => ({
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
                      restAfter: s.restAfter,
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
    include: programDetailInclude,
  });
}

export async function updateGlobalProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  if (workouts) {
    // Assert target is actually a global program before touching its workouts
    const target = await prisma.program.findFirst({ where: { id, isGlobal: true }, select: { id: true } });
    if (!target) throw new Error("Global program not found");

    await replaceWorkoutTree(prisma, id, workouts);
    return prisma.program.update({
      where: { id, isGlobal: true },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
        startDate: startDate ? new Date(startDate) : undefined,
      },
      include: programDetailInclude,
    });
  }

  return prisma.program.update({
    where: { id, isGlobal: true },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
    },
    include: programDetailInclude,
  });
}

export async function pushGlobalProgramUpdate(id: string) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { globalUpdatedAt: new Date() },
    select: { id: true, globalUpdatedAt: true },
  });
}

export async function assignGlobalProgramOrganizations(
  id: string,
  organizationIds: string[]
) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { organizationIds },
  });
}

export async function deleteGlobalProgram(id: string) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { status: "ARCHIVED" },
  });
}

export async function copyGlobalProgramToOrganization(
  globalProgramId: string,
  trainerId: string
) {
  const source = await getProgramById(globalProgramId);
  if (!source) throw new Error("Program not found");
  if (!source.isGlobal) throw new Error("Program is not a global program");
  return duplicateProgram(globalProgramId, trainerId, false);
}
