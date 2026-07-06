import { prisma } from "@/lib/prisma";
import type { WearableProvider, WearableConnectionStatus, Prisma } from "@prisma/client";

// ─── Connections ─────────────────────────────────────────────────────────────

export async function upsertConnection(
  clientId: string,
  provider: WearableProvider,
  status: WearableConnectionStatus
) {
  return prisma.wearableConnection.upsert({
    where: { clientId_provider: { clientId, provider } },
    create: { clientId, provider, status },
    update: { status },
  });
}

export async function getConnectionsForClient(clientId: string) {
  return prisma.wearableConnection.findMany({
    where: { clientId },
    orderBy: { connectedAt: "desc" },
  });
}

// ─── Daily summaries ─────────────────────────────────────────────────────────

export interface WearableDailySummaryFields {
  sleepDurationMin?: number;
  sleepScore?: number;
  restingHeartRate?: number;
  hrvMs?: number;
  steps?: number;
  activeMinutes?: number;
  caloriesBurned?: number;
  raw?: Prisma.InputJsonValue;
}

export async function upsertDailySummaryFields(
  clientId: string,
  date: Date,
  provider: WearableProvider,
  fields: WearableDailySummaryFields
) {
  return prisma.wearableDailySummary.upsert({
    where: { clientId_date_provider: { clientId, date, provider } },
    create: { clientId, date, provider, ...fields },
    update: { ...fields },
  });
}

export async function getLatestDailySummary(clientId: string) {
  return prisma.wearableDailySummary.findFirst({
    where: { clientId },
    orderBy: { date: "desc" },
  });
}

export async function getDailySummariesForClient(clientId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return prisma.wearableDailySummary.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export interface WearableWorkoutFields {
  activityType: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  avgHeartRate?: number;
  caloriesBurned?: number;
  raw?: Prisma.InputJsonValue;
}

export async function upsertWorkout(
  clientId: string,
  provider: WearableProvider,
  externalId: string,
  fields: WearableWorkoutFields
) {
  return prisma.wearableWorkout.upsert({
    where: { provider_externalId: { provider, externalId } },
    create: { clientId, provider, externalId, ...fields },
    update: { ...fields },
  });
}

export async function getWorkoutsForClient(clientId: string, limit = 20) {
  return prisma.wearableWorkout.findMany({
    where: { clientId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
