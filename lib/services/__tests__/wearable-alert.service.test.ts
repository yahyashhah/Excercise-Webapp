import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/services/wearable.service", () => ({
  getDailySummariesForClient: vi.fn(),
}));
vi.mock("@/lib/services/notification.service", () => ({
  createNotification: vi.fn(),
  NOTIFICATION_TYPES: { WEARABLE_ALERT: "WEARABLE_ALERT" },
}));

import { prisma } from "@/lib/prisma";
import { getDailySummariesForClient } from "@/lib/services/wearable.service";
import { createNotification } from "@/lib/services/notification.service";
import {
  checkRestingHeartRateAlert,
  checkHrvAlert,
  checkSleepAlert,
  evaluateWearableAlerts,
} from "@/lib/services/wearable-alert.service";

const mockGetSummaries = vi.mocked(getDailySummariesForClient);
const mockCreateNotification = vi.mocked(createNotification);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockNotificationFindMany = vi.mocked(prisma.notification.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRestingHeartRateAlert", () => {
  it("fires when today's value exceeds baseline by more than 10%", () => {
    expect(checkRestingHeartRateAlert(60, 67)).toBe(true);
  });
  it("does not fire within 10% of baseline", () => {
    expect(checkRestingHeartRateAlert(60, 65)).toBe(false);
  });
});

describe("checkHrvAlert", () => {
  it("fires when today's value drops more than 15% below baseline", () => {
    expect(checkHrvAlert(50, 40)).toBe(true);
  });
  it("does not fire within 15% of baseline", () => {
    expect(checkHrvAlert(50, 45)).toBe(false);
  });
});

describe("checkSleepAlert", () => {
  it("fires when the last 3 nights are all under 5 hours", () => {
    expect(checkSleepAlert([250, 280, 260])).toBe(true);
  });
  it("does not fire if any of the last 3 nights is 5+ hours", () => {
    expect(checkSleepAlert([250, 310, 260])).toBe(false);
  });
  it("does not fire with fewer than 3 nights of data", () => {
    expect(checkSleepAlert([250, 260])).toBe(false);
  });
});

describe("evaluateWearableAlerts", () => {
  it("does nothing with fewer than 5 days of prior history", async () => {
    mockGetSummaries.mockResolvedValue([
      { date: new Date(), restingHeartRate: 60, hrvMs: 50, sleepDurationMin: 400 },
    ] as never);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("creates one WEARABLE_ALERT notification per trainer in the client's org when resting HR spikes", async () => {
    const days = Array.from({ length: 8 }, (_, i) => ({
      date: new Date(Date.now() - (7 - i) * 86_400_000),
      restingHeartRate: i === 7 ? 70 : 60,
      hrvMs: 50,
      sleepDurationMin: 450,
    }));
    mockGetSummaries.mockResolvedValue(days as never);
    mockUserFindUnique.mockResolvedValue({ clerkOrgId: "org_1" } as never);
    mockUserFindMany.mockResolvedValue([
      { id: "trainer_1" },
      { id: "trainer_2" },
    ] as never);
    mockNotificationFindMany.mockResolvedValue([]);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "trainer_1", type: "WEARABLE_ALERT" })
    );
  });

  it("does not create a duplicate alert if one already exists in the last 24h", async () => {
    const days = Array.from({ length: 8 }, (_, i) => ({
      date: new Date(Date.now() - (7 - i) * 86_400_000),
      restingHeartRate: i === 7 ? 70 : 60,
      hrvMs: 50,
      sleepDurationMin: 450,
    }));
    mockGetSummaries.mockResolvedValue(days as never);
    mockUserFindUnique.mockResolvedValue({ clerkOrgId: "org_1" } as never);
    mockUserFindMany.mockResolvedValue([{ id: "trainer_1" }] as never);
    mockNotificationFindMany.mockResolvedValue([
      { id: "existing_notif", metadata: { clientId: "client_1", metric: "restingHeartRate" } },
    ] as never);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("creates alert at the exact boundary: 6 total summaries (5 prior days + today)", async () => {
    const days = Array.from({ length: 6 }, (_, i) => ({
      date: new Date(Date.now() - (5 - i) * 86_400_000),
      restingHeartRate: i === 5 ? 70 : 60,
      hrvMs: 50,
      sleepDurationMin: 450,
    }));
    mockGetSummaries.mockResolvedValue(days as never);
    mockUserFindUnique.mockResolvedValue({ clerkOrgId: "org_1" } as never);
    mockUserFindMany.mockResolvedValue([{ id: "trainer_1" }] as never);
    mockNotificationFindMany.mockResolvedValue([]);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "trainer_1", type: "WEARABLE_ALERT" })
    );
  });

  it("does not create alert below the boundary: 5 total summaries (4 prior days + today)", async () => {
    const days = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(Date.now() - (4 - i) * 86_400_000),
      restingHeartRate: i === 4 ? 70 : 60,
      hrvMs: 50,
      sleepDurationMin: 450,
    }));
    mockGetSummaries.mockResolvedValue(days as never);
    mockUserFindUnique.mockResolvedValue({ clerkOrgId: "org_1" } as never);
    mockUserFindMany.mockResolvedValue([{ id: "trainer_1" }] as never);
    mockNotificationFindMany.mockResolvedValue([]);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
