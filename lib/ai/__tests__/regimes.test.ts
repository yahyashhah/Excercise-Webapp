import { describe, it, expect } from "vitest";
import { getRegimePrompt, inferRegime } from "@/lib/ai/prompts/regimes";
import { SAFETY_CORE } from "@/lib/ai/prompts/regimes/shared-core";

const ctx = {
  totalExercisesPerSession: 6,
  allowedDayIndices: [0, 2, 4],
  circuitStructure: null,
  weekNumber: 2,
  totalWeeks: 6,
};

describe("regime prompts", () => {
  it.each(["rehab", "performance", "hybrid"] as const)(
    "%s prompt includes the shared safety core and a version",
    (regime) => {
      const { version, buildSystemPrompt } = getRegimePrompt(regime);
      expect(version).toMatch(new RegExp(`^${regime}-v\\d+$`));
      expect(buildSystemPrompt(ctx)).toContain(SAFETY_CORE.slice(0, 40));
    }
  );

  it("rehab prompt contains pain-first and healing-stage rules", () => {
    const prompt = getRegimePrompt("rehab").buildSystemPrompt(ctx);
    expect(prompt).toMatch(/pain/i);
    expect(prompt).toMatch(/rehab stage|healing/i);
  });

  it("performance prompt contains periodization and rep-range rules", () => {
    const prompt = getRegimePrompt("performance").buildSystemPrompt(ctx);
    expect(prompt).toMatch(/progressive overload|periodiz/i);
    expect(prompt).toMatch(/8-12|3-6/);
  });

  it("hybrid prompt references the week position within the program", () => {
    const prompt = getRegimePrompt("hybrid").buildSystemPrompt(ctx);
    expect(prompt).toContain("week 2 of 6");
  });

  it("includes the circuit structure block when provided", () => {
    const prompt = getRegimePrompt("rehab").buildSystemPrompt({
      ...ctx,
      circuitStructure: 'Circuit 0 "Warmup" (WARMUP): EXACTLY 2 exercises',
    });
    expect(prompt).toContain('Circuit 0 "Warmup"');
  });
});

describe("inferRegime", () => {
  it("infers rehab when clinical signals are present without fitness goals", () => {
    expect(inferRegime({ primaryDiagnosis: "ACL reconstruction" })).toBe("rehab");
    expect(inferRegime({ painScore: 6 })).toBe("rehab");
    expect(inferRegime({ injuryDate: "2026-05-01" })).toBe("rehab");
    expect(inferRegime({ surgeryHistory: "Rotator cuff repair 2025" })).toBe("rehab");
  });

  it("infers performance when there are fitness goals and no clinical signals", () => {
    expect(inferRegime({ fitnessGoals: ["strength", "hypertrophy"] })).toBe("performance");
  });

  it("infers hybrid when clinical signals AND fitness goals are both present", () => {
    expect(
      inferRegime({ primaryDiagnosis: "ACL reconstruction", fitnessGoals: ["return to sport"] })
    ).toBe("hybrid");
  });

  it("defaults to performance when nothing is known", () => {
    expect(inferRegime({})).toBe("performance");
  });

  it("treats painScore 0 as no clinical signal", () => {
    expect(inferRegime({ painScore: 0, fitnessGoals: ["strength"] })).toBe("performance");
  });
});
