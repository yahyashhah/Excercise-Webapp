import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";
import type {
  CreateProgramInput,
  ProgramFilterInput,
} from "@/lib/validators/program";

// --- Include presets ---
const programListInclude = {
  trainer: { select: { id: true, firstName: true, lastName: true } },
  client: { select: { id: true, firstName: true, lastName: true } },
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

  return prisma.program.create({
    data: {
      ...rest,
      trainerId,
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
      name: { contains: filters.search, mode: "insensitive" as const },
    }),
  };

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  if (workouts) {
    // Delete all existing workouts (cascades to blocks -> exercises -> sets)
    await prisma.workout.deleteMany({ where: { programId: id } });

    return prisma.program.update({
      where: { id },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
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
    // Assert target is actually a global program before destructively deleting workouts
    const target = await prisma.program.findFirst({ where: { id, isGlobal: true }, select: { id: true } });
    if (!target) throw new Error("Global program not found");

    await prisma.workout.deleteMany({ where: { programId: id } });

    return prisma.program.update({
      where: { id, isGlobal: true },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
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
