import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a Date with time zeroed out in UTC so @@unique([habitId, date]) stays consistent. */
function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Returns the Mon–Sun boundaries (UTC) of the week that contains `d`. */
function getCurrentWeekRange(d: Date): { weekStart: Date; weekEnd: Date } {
  const day = d.getUTCDay(); // 0 = Sun
  const diffToMonday = (day + 6) % 7; // days since Monday
  const weekStart = toDateOnly(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday)));
  const weekEnd   = toDateOnly(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (6 - diffToMonday))));
  return { weekStart, weekEnd };
}

// ─── Public Service Functions ─────────────────────────────────────────────────

/**
 * Returns all active habits for a client, each decorated with today's log
 * (if the client has already logged it today).
 */
export async function getHabitsForClient(clientId: string) {
  const today = toDateOnly(new Date());

  return prisma.habitDefinition.findMany({
    where: { clientId, isActive: true },
    include: {
      logs: {
        where: { date: today },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Returns a single habit together with up to `days` most-recent logs.
 * Default window is 30 days.
 */
export async function getHabitWithLogs(habitId: string, days = 30) {
  const since = toDateOnly(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  return prisma.habitDefinition.findUnique({
    where: { id: habitId },
    include: {
      logs: {
        where: { date: { gte: since } },
        orderBy: { date: "asc" },
      },
    },
  });
}

/**
 * Creates a new HabitDefinition. Both trainers and clients may call this.
 */
export async function createHabit(data: {
  clientId: string;
  trainerId?: string;
  name: string;
  icon?: string;
  targetValue?: number;
  unit?: string;
  frequency?: string;
}) {
  return prisma.habitDefinition.create({
    data: {
      clientId: data.clientId,
      trainerId: data.trainerId ?? null,
      name: data.name.trim(),
      icon: data.icon ?? null,
      targetValue: data.targetValue ?? null,
      unit: data.unit ?? null,
      frequency: data.frequency ?? "DAILY",
      isActive: true,
    },
  });
}

/**
 * Upserts a HabitLog for the given habit + date. The @@unique([habitId, date])
 * constraint in the schema guarantees at most one log per calendar day.
 */
export async function logHabit(
  habitId: string,
  date: Date,
  completed: boolean,
  value?: number,
  notes?: string
) {
  const dateOnly = toDateOnly(date);

  return prisma.habitLog.upsert({
    where: { habitId_date: { habitId, date: dateOnly } },
    create: {
      habitId,
      date: dateOnly,
      completed,
      value: value ?? 1,
      notes: notes ?? null,
    },
    update: {
      completed,
      ...(value !== undefined && { value }),
      ...(notes !== undefined && { notes }),
    },
  });
}

/**
 * Soft-deletes a habit by marking it inactive instead of hard-deleting it,
 * which preserves historical log data.
 */
export async function deleteHabit(habitId: string) {
  return prisma.habitDefinition.update({
    where: { id: habitId },
    data: { isActive: false },
  });
}

/**
 * Calculates the current consecutive-day streak, total completions, and
 * how many times the habit was completed this week.
 */
export async function getHabitStreakAndStats(habitId: string) {
  const today = toDateOnly(new Date());
  const { weekStart, weekEnd } = getCurrentWeekRange(today);

  // Fetch all logs ordered newest-first to walk backward for the streak
  const allLogs = await prisma.habitLog.findMany({
    where: { habitId, completed: true },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  // This-week completions (single DB query slice)
  const weekLogs = await prisma.habitLog.count({
    where: {
      habitId,
      completed: true,
      date: { gte: weekStart, lte: weekEnd },
    },
  });

  // Walk backward from today counting consecutive completed days
  let streak = 0;
  let cursor = today.getTime();

  const completedSet = new Set(allLogs.map((l) => toDateOnly(l.date).getTime()));

  // Allow streak to include today if logged, or start from yesterday if not
  if (!completedSet.has(cursor)) {
    // Today not done yet — streak can still be counted from yesterday
    cursor -= 24 * 60 * 60 * 1000;
  }

  while (completedSet.has(cursor)) {
    streak++;
    cursor -= 24 * 60 * 60 * 1000;
  }

  return {
    currentStreak: streak,
    totalCompletions: allLogs.length,
    thisWeekCompletions: weekLogs,
  };
}

/**
 * Returns all active habits for a client with their today status and current
 * streak — used by the habits overview page.
 */
export async function getHabitsOverview(clientId: string) {
  const today = toDateOnly(new Date());

  const habits = await prisma.habitDefinition.findMany({
    where: { clientId, isActive: true },
    include: {
      logs: {
        where: { date: today },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Attach streak to each habit (sequential is fine — habit counts are small)
  const habitsWithStats = await Promise.all(
    habits.map(async (habit) => {
      const stats = await getHabitStreakAndStats(habit.id);
      return { ...habit, stats };
    })
  );

  return habitsWithStats;
}

/**
 * Returns habits assigned by a trainer across all their clients,
 * grouped by clientId with client name attached.
 */
export async function getHabitsForTrainer(trainerId: string) {
  const habits = await prisma.habitDefinition.findMany({
    where: { trainerId, isActive: true },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      logs: {
        where: { date: toDateOnly(new Date()) },
        take: 1,
      },
    },
    orderBy: [{ client: { firstName: "asc" } }, { createdAt: "asc" }],
  });

  // Group by client for the trainer view
  const grouped = new Map<
    string,
    { client: { id: string; firstName: string | null; lastName: string | null }; habits: typeof habits }
  >();

  for (const habit of habits) {
    const existing = grouped.get(habit.clientId);
    if (existing) {
      existing.habits.push(habit);
    } else {
      grouped.set(habit.clientId, {
        client: habit.client,
        habits: [habit],
      });
    }
  }

  return Array.from(grouped.values());
}
