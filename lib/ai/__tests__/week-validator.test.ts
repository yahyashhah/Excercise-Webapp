import { describe, it, expect } from "vitest";
import type { GeneratedWeek } from "@/lib/ai/schemas/generated-week";
import { validateWeek } from "@/lib/ai/validation/week-validator";

function makeWeek(overrides: Partial<GeneratedWeek> = {}): GeneratedWeek {
  return {
    title: null,
    description: null,
    sessions: [{ dayOfWeek: 0, name: "Knee Stability A" }],
    exercises: [
      { exerciseId: "ex1", exerciseName: "Warmup March", phase: "WARMUP", circuitIndex: null, sets: 1, reps: 10, durationSeconds: null, restSeconds: null, dayOfWeek: 0, orderIndex: 0, notes: null },
      { exerciseId: "ex2", exerciseName: "Sit to Stand", phase: "STRENGTHENING", circuitIndex: null, sets: 3, reps: 10, durationSeconds: null, restSeconds: 45, dayOfWeek: 0, orderIndex: 1, notes: null },
      { exerciseId: "ex3", exerciseName: "Hamstring Stretch", phase: "COOLDOWN", circuitIndex: null, sets: 1, reps: null, durationSeconds: 30, restSeconds: null, dayOfWeek: 0, orderIndex: 2, notes: null },
    ],
    ...overrides,
  };
}

const baseCtx = {
  poolIds: new Set(["ex1", "ex2", "ex3"]),
  usedIds: new Set<string>(),
  regime: "rehab" as const,
  allowedDays: [0, 2, 4],
  requireWarmupCooldown: true,
};

describe("validateWeek", () => {
  it("returns no violations for a valid rehab week", () => {
    expect(validateWeek(makeWeek(), baseCtx)).toEqual([]);
  });

  it("flags exercise IDs not in the pool", () => {
    const week = makeWeek();
    week.exercises[1].exerciseId = "not-in-pool";
    const violations = validateWeek(week, baseCtx);
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "unknown_exercise", exerciseIndex: 1 })
    );
  });

  it("flags exercises already used in earlier weeks", () => {
    const violations = validateWeek(makeWeek(), { ...baseCtx, usedIds: new Set(["ex2"]) });
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "duplicate_across_weeks", exerciseIndex: 1 })
    );
  });

  it("flags sets above the regime bound (rehab max 4)", () => {
    const week = makeWeek();
    week.exercises[1].sets = 5;
    const violations = validateWeek(week, baseCtx);
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "dosage_out_of_bounds", exerciseIndex: 1 })
    );
  });

  it("allows 5 sets under the performance regime", () => {
    const week = makeWeek();
    week.exercises[1].sets = 5;
    week.exercises[1].restSeconds = 90;
    expect(validateWeek(week, { ...baseCtx, regime: "performance" })).toEqual([]);
  });

  it("flags rest below the regime minimum (rehab min 30s)", () => {
    const week = makeWeek();
    week.exercises[1].restSeconds = 10;
    const violations = validateWeek(week, baseCtx);
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "dosage_out_of_bounds", exerciseIndex: 1 })
    );
  });

  it("flags a session missing a warm-up when required", () => {
    const week = makeWeek();
    week.exercises = week.exercises.filter((e) => e.phase !== "WARMUP");
    const violations = validateWeek(week, baseCtx);
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "missing_warmup", dayOfWeek: 0 })
    );
  });

  it("does not require warm-up/cool-down when requireWarmupCooldown is false", () => {
    const week = makeWeek();
    week.exercises = week.exercises.filter((e) => e.phase === "STRENGTHENING");
    expect(
      validateWeek(week, { ...baseCtx, requireWarmupCooldown: false })
    ).toEqual([]);
  });

  it("flags sessions and exercises on days outside allowedDays", () => {
    const week = makeWeek();
    week.exercises[1].dayOfWeek = 3;
    const violations = validateWeek(week, baseCtx);
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "invalid_day", exerciseIndex: 1 })
    );
  });

  it("flags a session scheduled on a day outside allowedDays", () => {
    const week = makeWeek();
    week.sessions = [{ dayOfWeek: 3, name: "Off-day Session" }];
    const violations = validateWeek(week, baseCtx);
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "invalid_day", dayOfWeek: 3 })
    );
  });

  it("applies hybrid bounds: 5 sets ok, 6 sets flagged; 15s rest ok, 10s flagged", () => {
    const okWeek = makeWeek();
    okWeek.exercises[1].sets = 5;
    okWeek.exercises[1].restSeconds = 15;
    expect(validateWeek(okWeek, { ...baseCtx, regime: "hybrid" })).toEqual([]);

    const badWeek = makeWeek();
    badWeek.exercises[1].sets = 6;
    badWeek.exercises[1].restSeconds = 10;
    const violations = validateWeek(badWeek, { ...baseCtx, regime: "hybrid" });
    expect(violations.filter((v) => v.code === "dosage_out_of_bounds")).toHaveLength(2);
  });
});
