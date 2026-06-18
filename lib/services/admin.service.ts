import { prisma } from "@/lib/prisma";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

export async function getPlatformStats() {
  const [
    totalUsers,
    trainers,
    clients,
    totalExercises,
    totalPrograms,
    totalSessions,
    activePrograms,
    newUsersThisMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "TRAINER" } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
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
    trainers,
    clients,
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

export async function getTopTrainers(limit = 5) {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      imageUrl: true,
      clerkOrgId: true,
      programsCreated: { select: { id: true } },
    },
    take: 20,
  });

  const withCounts = await Promise.all(
    trainers.map(async (c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      imageUrl: c.imageUrl,
      clientCount: c.clerkOrgId
        ? await prisma.user.count({
            where: { clerkOrgId: c.clerkOrgId, role: "CLIENT" },
          })
        : 0,
      programCount: c.programsCreated.length,
    }))
  );

  return withCounts
    .sort((a, b) => b.clientCount - a.clientCount)
    .slice(0, limit);
}

export async function getAllUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "TRAINER" | "CLIENT" | "ALL";
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

  const [rawItems, total] = await Promise.all([
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
        clerkOrgId: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  // Compute connection counts per user based on their organization.
  // Trainers: number of clients in the org. Clients: number of trainers in the org.
  const items = await Promise.all(
    rawItems.map(async (u) => {
      let connectionCount = 0;
      if (u.clerkOrgId) {
        connectionCount = await prisma.user.count({
          where: {
            clerkOrgId: u.clerkOrgId,
            role: u.role === "TRAINER" ? "CLIENT" : "TRAINER",
          },
        });
      }
      return { ...u, connectionCount };
    })
  );

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
        trainer: { select: { firstName: true, lastName: true, email: true } },
        client: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAdminGlobalPrograms(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const search = params.search ?? "";

  const where = {
    isGlobal: true,
    status: { not: "ARCHIVED" as const },
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      include: {
        _count: { select: { workouts: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / pageSize) };
}
