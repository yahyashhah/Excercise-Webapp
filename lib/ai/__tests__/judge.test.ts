import { describe, it, expect, vi } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});
vi.mock("@/lib/ai/models", () => ({
  getModel: vi.fn().mockReturnValue({ modelId: "mock-judge" }),
  getModelId: vi.fn().mockReturnValue("anthropic:claude-opus-4-8"),
}));

import { buildJudgePrompt } from "@/lib/ai/evals/judge";
import { EVAL_PROFILES } from "@/lib/ai/evals/fixtures/profiles";

describe("buildJudgePrompt", () => {
  it("includes the profile context, the program, and every rubric dimension", () => {
    const profile = EVAL_PROFILES[0];
    const plan = {
      title: "Test",
      description: "",
      sessions: [{ dayOfWeek: 0, weekIndex: 0, name: "S1" }],
      exercises: [
        { exerciseId: "ex1", exerciseName: "Quad Set", phase: "STRENGTHENING", sets: 3, reps: 10, weekIndex: 0, dayOfWeek: 0, orderIndex: 0, notes: "gentle" },
      ],
    };
    const prompt = buildJudgePrompt(profile, plan);
    expect(prompt).toContain("ACL reconstruction");
    expect(prompt).toContain("Quad Set");
    for (const dim of ["Progression", "Balance", "Dosage", "Schedule fit", "Rationale"]) {
      expect(prompt).toContain(dim);
    }
  });
});
