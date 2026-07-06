import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/vital", () => ({
  getOrCreateVitalUserId: vi.fn(),
  createLinkToken: vi.fn(),
}));
vi.mock("@/lib/services/wearable.service", () => ({
  upsertConnection: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from "@/lib/current-user";
import { getOrCreateVitalUserId, createLinkToken } from "@/lib/vital";
import { upsertConnection } from "@/lib/services/wearable.service";
import {
  createWearableLinkTokenAction,
  disconnectWearableAction,
} from "../wearable-actions";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetOrCreateVitalUserId = vi.mocked(getOrCreateVitalUserId);
const mockCreateLinkToken = vi.mocked(createLinkToken);
const mockUpsertConnection = vi.mocked(upsertConnection);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createWearableLinkTokenAction", () => {
  it("rejects non-client users", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "trainer_1", role: "TRAINER" } as never);

    const result = await createWearableLinkTokenAction();

    expect(result).toEqual({ success: false, error: "Only clients can connect a wearable" });
  });

  it("returns a link token for a client", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "client_1", role: "CLIENT" } as never);
    mockGetOrCreateVitalUserId.mockResolvedValue("vital_user_1");
    mockCreateLinkToken.mockResolvedValue("token_abc");

    const result = await createWearableLinkTokenAction();

    expect(mockGetOrCreateVitalUserId).toHaveBeenCalledWith("client_1");
    expect(mockCreateLinkToken).toHaveBeenCalledWith("vital_user_1");
    expect(result).toEqual({ success: true, data: { linkToken: "token_abc" } });
  });
});

describe("disconnectWearableAction", () => {
  it("marks the connection DISCONNECTED for the current client", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "client_1", role: "CLIENT" } as never);

    const result = await disconnectWearableAction("OURA");

    expect(mockUpsertConnection).toHaveBeenCalledWith("client_1", "OURA", "DISCONNECTED");
    expect(result).toEqual({ success: true });
  });
});
