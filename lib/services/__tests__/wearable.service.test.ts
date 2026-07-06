import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wearableConnection: { upsert: vi.fn(), findMany: vi.fn() },
    wearableDailySummary: { upsert: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    wearableWorkout: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  upsertConnection,
  upsertDailySummaryFields,
  upsertWorkout,
  getLatestDailySummary,
} from "@/lib/services/wearable.service";

const mockConnectionUpsert = vi.mocked(prisma.wearableConnection.upsert);
const mockSummaryUpsert = vi.mocked(prisma.wearableDailySummary.upsert);
const mockWorkoutUpsert = vi.mocked(prisma.wearableWorkout.upsert);
const mockSummaryFindFirst = vi.mocked(prisma.wearableDailySummary.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertConnection", () => {
  it("upserts on the [clientId, provider] composite key", async () => {
    await upsertConnection("client_1", "APPLE_HEALTH", "CONNECTED");

    expect(mockConnectionUpsert).toHaveBeenCalledWith({
      where: { clientId_provider: { clientId: "client_1", provider: "APPLE_HEALTH" } },
      create: { clientId: "client_1", provider: "APPLE_HEALTH", status: "CONNECTED" },
      update: { status: "CONNECTED" },
    });
  });
});

describe("upsertDailySummaryFields", () => {
  it("upserts only the passed fields on the [clientId, date, provider] key", async () => {
    const date = new Date("2026-07-01T00:00:00.000Z");

    await upsertDailySummaryFields("client_1", date, "OURA", {
      sleepDurationMin: 420,
      sleepScore: 85,
    });

    expect(mockSummaryUpsert).toHaveBeenCalledWith({
      where: {
        clientId_date_provider: { clientId: "client_1", date, provider: "OURA" },
      },
      create: {
        clientId: "client_1",
        date,
        provider: "OURA",
        sleepDurationMin: 420,
        sleepScore: 85,
      },
      update: { sleepDurationMin: 420, sleepScore: 85 },
    });
  });
});

describe("upsertWorkout", () => {
  it("upserts on the [provider, externalId] composite key", async () => {
    const startedAt = new Date("2026-07-01T08:00:00.000Z");
    const endedAt = new Date("2026-07-01T08:45:00.000Z");

    await upsertWorkout("client_1", "GARMIN", "ext_1", {
      activityType: "running",
      startedAt,
      endedAt,
      durationMinutes: 45,
    });

    expect(mockWorkoutUpsert).toHaveBeenCalledWith({
      where: { provider_externalId: { provider: "GARMIN", externalId: "ext_1" } },
      create: {
        clientId: "client_1",
        provider: "GARMIN",
        externalId: "ext_1",
        activityType: "running",
        startedAt,
        endedAt,
        durationMinutes: 45,
      },
      update: {
        activityType: "running",
        startedAt,
        endedAt,
        durationMinutes: 45,
      },
    });
  });
});

describe("getLatestDailySummary", () => {
  it("queries the most recent summary for a client ordered by date desc", async () => {
    mockSummaryFindFirst.mockResolvedValue(null);

    await getLatestDailySummary("client_1");

    expect(mockSummaryFindFirst).toHaveBeenCalledWith({
      where: { clientId: "client_1" },
      orderBy: { date: "desc" },
    });
  });
});
