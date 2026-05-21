import { prisma } from "@/lib/prisma";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

export async function getPlatformStats() {
  const [
    totalUsers,
    clinicians,
    patients,
    totalExercises,
    totalPrograms,
    totalSessions,
    activePrograms,
    newUsersThisMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "CLINICIAN" } }),
    prisma.user.count({ where: { role: "PATIENT" } }),
    prisma.exercise.count(),
    prisma.program.count(),
    prisma.workoutSessionV2.count({ where: { status: "COMPLETED" } }),
    prisma.program.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({
      where: {
        createdAt: { gte: startOfMonth(new Date()) },
      },
    }),
  ]);

  return {
    totalUsers,
    clinicians,
    patients,
    totalExercises,
    totalPrograms,
    totalSessions,
    activePrograms,
    newUsersThisMonth,
  };
}

export async function getUserGrowthData(months = 6) {
  const now = new Date();
  const monthRanges = Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });

  const counts = await Promise.all(
    monthRanges.map(({ start, end }) =>
      prisma.user.count({ where: { createdAt: { gte: start, lte: end } } })
    )
  );

  return monthRanges.map((m, i) => ({ month: m.label, users: counts[i] }));
}

export async function getProgramCreationData(months = 6) {
  const now = new Date();
  const monthRanges = Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });

  const counts = await Promise.all(
    monthRanges.map(({ start, end }) =>
      prisma.program.count({ where: { createdAt: { gte: start, lte: end } } })
    )
  );

  return monthRanges.map((m, i) => ({ month: m.label, programs: counts[i] }));
}

export async function getSessionActivityData(months = 6) {
  const now = new Date();
  const monthRanges = Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });

  const counts = await Promise.all(
    monthRanges.map(({ start, end }) =>
      prisma.workoutSessionV2.count({
        where: { status: "COMPLETED", createdAt: { gte: start, lte: end } },
      })
    )
  );

  return monthRanges.map((m, i) => ({ month: m.label, sessions: counts[i] }));
}

export async function getRecentUsers(limit = 10) {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      onboarded: true,
      imageUrl: true,
      createdAt: true,
    },
  });
}

export async function getTopClinicians(limit = 5) {
  const clinicians = await prisma.user.findMany({
    where: { role: "CLINICIAN" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      imageUrl: true,
      clinicianLinks: { where: { status: "active" }, select: { id: true } },
      programsCreated: { select: { id: true } },
    },
    take: 20,
  });

  return clinicians
    .map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      imageUrl: c.imageUrl,
      patientCount: c.clinicianLinks.length,
      programCount: c.programsCreated.length,
    }))
    .sort((a, b) => b.patientCount - a.patientCount)
    .slice(0, limit);
}

export async function getAllUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "CLINICIAN" | "PATIENT" | "ALL";
}) {
  const { page = 1, pageSize = 20, search, role = "ALL" } = params;

  const where = {
    ...(role !== "ALL" && { role }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        onboarded: true,
        imageUrl: true,
        createdAt: true,
        clinicianLinks: { where: { status: "active" }, select: { id: true } },
        patientLinks: { where: { status: "active" }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAllExercises(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  bodyRegion?: string;
}) {
  const { page = 1, pageSize = 25, search, bodyRegion } = params;

  const where = {
    ...(bodyRegion && bodyRegion !== "ALL" && { bodyRegion: bodyRegion as never }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.exercise.findMany({
      where,
      include: {
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exercise.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAllPrograms(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}) {
  const { page = 1, pageSize = 25, search, status } = params;

  const where = {
    ...(status && status !== "ALL" && { status: status as never }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      include: {
        clinician: { select: { firstName: true, lastName: true, email: true } },
        patient: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
