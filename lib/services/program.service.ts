import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";
import type {
  CreateProgramInput,
  ProgramFilterInput,
} from "@/lib/validators/program";

// --- Include presets ---
const programListInclude = {
  clinician: { select: { id: true, firstName: true, lastName: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { workouts: true } },
} satisfies Prisma.ProgramInclude;

const programDetailInclude = {
  clinician: { select: { id: true, firstName: true, lastName: true } },
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      patientProfile: true,
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
  clinicianId: string,
  data: CreateProgramInput
) {
  const { workouts, startDate, ...rest } = data;

  return prisma.program.create({
    data: {
      ...rest,
      clinicianId,
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
  clinicianId: string,
  filters: ProgramFilterInput = {}
) {
  const where: Prisma.ProgramWhereInput = {
    clinicianId,
    ...(filters.status && { status: filters.status as PlanStatus }),
    ...(filters.isTemplate !== undefined && { isTemplate: filters.isTemplate }),
    ...(filters.patientId && { patientId: filters.patientId }),
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
  clinicianId: string,
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

  return createProgram(clinicianId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    isTemplate: asTemplate,
    sourceTemplateId: source.id,
    durationWeeks: source.durationWeeks,
    daysPerWeek: source.daysPerWeek,
    tags: source.tags,
    workouts,
  });
}

export async function assignProgram(
  programId: string,
  patientId: string,
  startDate: Date
) {
  const program = await prisma.program.update({
    where: { id: programId },
    data: {
      patientId,
      startDate,
      status: "ACTIVE",
    },
    include: programDetailInclude,
  });

  // Create WorkoutSessionV2 records for each workout
  const sessions: { workoutId: string; scheduledDate: Date }[] = [];

  for (const workout of program.workouts) {
    const scheduledDate = new Date(startDate);
    scheduledDate.setDate(
      scheduledDate.getDate() + workout.weekIndex * 7 + workout.dayIndex
    );
    sessions.push({ workoutId: workout.id, scheduledDate });
  }

  if (sessions.length > 0) {
    await prisma.workoutSessionV2.createMany({
      data: sessions.map((s) => ({
        workoutId: s.workoutId,
        patientId,
        scheduledDate: s.scheduledDate,
        status: "SCHEDULED",
      })),
    });
  }

  return program;
}

export async function getProgramsForPatient(patientId: string) {
  return prisma.program.findMany({
    where: { patientId, status: { in: ["ACTIVE", "PAUSED"] } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplates(clinicianId: string) {
  return prisma.program.findMany({
    where: { clinicianId, isTemplate: true, status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}
