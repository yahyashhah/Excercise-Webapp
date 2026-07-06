import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerify = vi.fn();
vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(function () {
    return { verify: mockVerify };
  }),
}));
vi.mock("@/lib/services/wearable.service", () => ({
  upsertConnection: vi.fn(),
  upsertDailySummaryFields: vi.fn(),
  upsertWorkout: vi.fn(),
}));
vi.mock("@/lib/services/wearable-alert.service", () => ({
  evaluateWearableAlerts: vi.fn(),
}));
vi.mock("@/lib/vital", () => ({
  mapJunctionSlugToProvider: vi.fn(() => "OURA"),
}));

import {
  upsertConnection,
  upsertDailySummaryFields,
} from "@/lib/services/wearable.service";
import { evaluateWearableAlerts } from "@/lib/services/wearable-alert.service";
import { POST } from "../route";

const mockUpsertConnection = vi.mocked(upsertConnection);
const mockUpsertDailySummaryFields = vi.mocked(upsertDailySummaryFields);
const mockEvaluateAlerts = vi.mocked(evaluateWearableAlerts);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/webhooks/vital", {
    method: "POST",
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1234567890",
      "svix-signature": "v1,fake",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITAL_WEBHOOK_SECRET = "whsec_test";
});

describe("POST /api/webhooks/vital", () => {
  it("returns 400 when signature verification fails", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
  });

  it("upserts a connection on provider.connection.created", async () => {
    const payload = {
      event_type: "provider.connection.created",
      client_user_id: "client_1",
      data: { source: { slug: "oura" } },
    };
    mockVerify.mockReturnValue(payload);

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(mockUpsertConnection).toHaveBeenCalledWith("client_1", "OURA", "CONNECTED");
  });

  it("upserts activity data and runs alert evaluation on daily.data.activity.updated", async () => {
    const payload = {
      event_type: "daily.data.activity.updated",
      client_user_id: "client_1",
      data: {
        calendar_date: "2026-07-01",
        steps: 8000,
        calories_active: 300,
        source: { slug: "oura" },
      },
    };
    mockVerify.mockReturnValue(payload);

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(mockUpsertDailySummaryFields).toHaveBeenCalledWith(
      "client_1",
      new Date("2026-07-01T00:00:00.000Z"),
      "OURA",
      { steps: 8000, activeMinutes: undefined, caloriesBurned: 300 }
    );
    expect(mockEvaluateAlerts).toHaveBeenCalledWith("client_1");
  });
});
