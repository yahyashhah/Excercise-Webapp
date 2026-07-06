import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUserCreate = vi.fn();
const mockLinkToken = vi.fn();

vi.mock("@junction-api/sdk", () => ({
  JunctionClient: vi.fn().mockImplementation(function() {
    return {
      user: { create: mockUserCreate },
      link: { token: mockLinkToken },
    };
  }),
  JunctionEnvironment: { Sandbox: "sandbox", Production: "production" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wearableAccount: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getOrCreateVitalUserId,
  createLinkToken,
  mapJunctionSlugToProvider,
} from "@/lib/vital";

const mockAccountFind = vi.mocked(prisma.wearableAccount.findUnique);
const mockAccountCreate = vi.mocked(prisma.wearableAccount.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateVitalUserId", () => {
  it("returns the cached vitalUserId if a WearableAccount already exists", async () => {
    mockAccountFind.mockResolvedValue({
      id: "acct_1",
      clientId: "client_1",
      vitalUserId: "vital_user_1",
      createdAt: new Date(),
    });

    const result = await getOrCreateVitalUserId("client_1");

    expect(result).toBe("vital_user_1");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("creates a Junction user and WearableAccount when none exists", async () => {
    mockAccountFind.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ userId: "vital_user_2" });
    mockAccountCreate.mockResolvedValue({
      id: "acct_2",
      clientId: "client_2",
      vitalUserId: "vital_user_2",
      createdAt: new Date(),
    });

    const result = await getOrCreateVitalUserId("client_2");

    expect(mockUserCreate).toHaveBeenCalledWith({ clientUserId: "client_2" });
    expect(mockAccountCreate).toHaveBeenCalledWith({
      data: { clientId: "client_2", vitalUserId: "vital_user_2" },
    });
    expect(result).toBe("vital_user_2");
  });
});

describe("createLinkToken", () => {
  it("returns the link token for a given vitalUserId", async () => {
    mockLinkToken.mockResolvedValue({ linkToken: "token_abc" });

    const result = await createLinkToken("vital_user_1");

    expect(mockLinkToken).toHaveBeenCalledWith({ userId: "vital_user_1" });
    expect(result).toBe("token_abc");
  });
});

describe("mapJunctionSlugToProvider", () => {
  it("maps known slugs to the WearableProvider enum", () => {
    expect(mapJunctionSlugToProvider("apple_health_kit")).toBe("APPLE_HEALTH");
    expect(mapJunctionSlugToProvider("fitbit")).toBe("FITBIT");
    expect(mapJunctionSlugToProvider("garmin")).toBe("GARMIN");
    expect(mapJunctionSlugToProvider("oura")).toBe("OURA");
    expect(mapJunctionSlugToProvider("whoop_v2")).toBe("WHOOP");
  });

  it("falls back to OTHER for unrecognized slugs", () => {
    expect(mapJunctionSlugToProvider("freestyle_libre_ble")).toBe("OTHER");
  });
});
