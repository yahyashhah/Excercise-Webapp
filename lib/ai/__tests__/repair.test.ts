import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});
vi.mock("@/lib/ai/models", () => ({
  getModel: vi.fn().mockReturnValue({ modelId: "mock-model" }),
}));

import { generateObject } from "ai";
import type { GeneratedWeek } from "@/lib/ai/schemas/generated-week";
import { validateWeek } from "@/lib/ai/validation/week-validator";
import { repairWeek, buildRepairPrompt } from "@/lib/ai/validation/repair";

const mockGenerateObject = vi.mocked(generateObject);

function makeWeek(): GeneratedWeek {
  return {
    title: null,
    description: null,
    sessions: [{ dayOfWeek: 0, name: "Session A" }],
    exercises: [
      { exerciseId: "ex1", exerciseName: "Warmup March", phase: "WARMUP", circuitIndex: null, sets: 1, reps: 10, durationSeconds: null, restSeconds: null, dayOfWeek: 0, orderIndex: 0, notes: null },
      { exerciseId: "BAD", exerciseName: "Invented Exercise", phase: "STRENGTHENING", circuitIndex: null, sets: 3, reps: 10, durationSeconds: null, restSeconds: 45, dayOfWeek: 0, orderIndex: 1, notes: null },
      { exerciseId: "ex3", exerciseName: "Stretch", phase: "COOLDOWN", circuitIndex: null, sets: 1, reps: null, durationSeconds: 30, restSeconds: null, dayOfWeek: 0, orderIndex: 2, notes: null },
    ],
  };
}

function makeCtx() {
  return {
    poolIds: new Set(["ex1", "ex2", "ex3"]),
    usedIds: new Set<string>(),
    regime: "rehab" as const,
    allowedDays: [0, 2, 4],
    requireWarmupCooldown: true,
    weekIndex: 0,
    poolSummary: "ID: ex1 | Warmup March\nID: ex2 | Sit to Stand\nID: ex3 | Stretch",
  };
}

beforeEach(() => {
  mockGenerateObject.mockReset();
});

describe("buildRepairPrompt", () => {
  it("names each invalid exercise with its index and reason", () => {
    const week = makeWeek();
    const violations = validateWeek(week, makeCtx());
    const prompt = buildRepairPrompt(week, violations, makeCtx().poolSummary);
    expect(prompt).toContain("exerciseIndex 1");
    expect(prompt).toContain("not in this week's exercise pool");
    expect(prompt).toContain("ID: ex2 | Sit to Stand");
  });
});

describe("repairWeek", () => {
  it("splices a valid replacement in place and returns no unfilled slots", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        replacements: [
          { exerciseIndex: 1, exerciseId: "ex2", exerciseName: "Sit to Stand", sets: 3, reps: 10, durationSeconds: null, restSeconds: 45 },
        ],
      },
    } as any);

    const week = makeWeek();
    const ctx = makeCtx();
    const violations = validateWeek(week, ctx);
    const result = await repairWeek(week, violations, ctx);

    expect(result.week.exercises[1].exerciseId).toBe("ex2");
    expect(result.unfilled).toEqual([]);
  });

  it("removes an exercise and records an unfilled slot when the repair is still invalid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        replacements: [
          { exerciseIndex: 1, exerciseId: "STILL_BAD", exerciseName: "Nope", sets: 3, reps: 10, durationSeconds: null, restSeconds: 45 },
        ],
      },
    } as any);

    const week = makeWeek();
    const ctx = makeCtx();
    const violations = validateWeek(week, ctx);
    const result = await repairWeek(week, violations, ctx);

    expect(result.week.exercises).toHaveLength(2);
    expect(result.unfilled).toEqual([
      expect.objectContaining({ weekIndex: 0, dayOfWeek: 0, phase: "STRENGTHENING" }),
    ]);
  });

  it("records unfilled slots without an AI call when the repair call itself fails", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("provider down"));

    const week = makeWeek();
    const ctx = makeCtx();
    const violations = validateWeek(week, ctx);
    const result = await repairWeek(week, violations, ctx);

    expect(result.week.exercises).toHaveLength(2);
    expect(result.unfilled).toHaveLength(1);
  });

  it("makes no AI call when the only violations are missing warmup/cooldown", async () => {
    const week = makeWeek();
    week.exercises = week.exercises.filter((e) => e.phase !== "COOLDOWN");
    const ctx = makeCtx();
    const violations = validateWeek(week, ctx); // missing_cooldown only? warmup present, ex "BAD" removed:
    // strip the BAD exercise so only missing_cooldown remains
    week.exercises = week.exercises.filter((e) => e.exerciseId !== "BAD");
    const cleanViolations = validateWeek(week, ctx);
    const result = await repairWeek(week, cleanViolations, ctx);

    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(result.unfilled).toEqual([
      expect.objectContaining({ phase: "COOLDOWN", dayOfWeek: 0 }),
    ]);
    void violations;
  });
});
