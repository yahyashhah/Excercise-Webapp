import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getClientDetail } from "../client.service";

const mockFindUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getClientDetail", () => {
  it("returns the client when they share the trainer's org", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: "trainer_1", clerkOrgId: "org_1" } as never)
      .mockResolvedValueOnce({ id: "client_1", clerkOrgId: "org_1" } as never);

    const result = await getClientDetail("client_1", "trainer_1");

    expect(result).toEqual({ id: "client_1", clerkOrgId: "org_1" });
  });

  it("returns null when the client belongs to a different org", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: "trainer_1", clerkOrgId: "org_1" } as never)
      .mockResolvedValueOnce({ id: "client_2", clerkOrgId: "org_2" } as never);

    const result = await getClientDetail("client_2", "trainer_1");

    expect(result).toBeNull();
  });

  it("returns null when the trainer has no clerkOrgId", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "trainer_1", clerkOrgId: null } as never);

    const result = await getClientDetail("client_1", "trainer_1");

    expect(result).toBeNull();
  });

  it("returns null when the client does not exist", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: "trainer_1", clerkOrgId: "org_1" } as never)
      .mockResolvedValueOnce(null);

    const result = await getClientDetail("nonexistent", "trainer_1");

    expect(result).toBeNull();
  });
});
