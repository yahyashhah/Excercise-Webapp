import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeneratedWeek } from "@/lib/ai/schemas/generated-week";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamObject: vi.fn(), generateObject: vi.fn() };
});
vi.mock("@/lib/ai/models", () => ({
  getModel: vi.fn().mockReturnValue({ modelId: "mock-model" }),
}));
vi.mock("@/lib/services/ai.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ai.service")>();
  return {
    ...actual,
    buildClientContext: vi.fn().mockResolvedValue({
      context: "CLIENT PROFILE: test client",
      limitations: [],
      regimeSignals: { primaryDiagnosis: "ACL tear" },
    }),
    buildExercisePoolForWeek: vi.fn().mockResolvedValue([
      { id: "ex1", name: "Warmup March", bodyRegion: "FULL_BODY", difficultyLevel: "BEGINNER", equipmentRequired: [], contraindications: [], description: null, musclesTargeted: [], exercisePhases: ["WARMUP"], commonMistakes: null, defaultSets: 1, defaultReps: 10, defaultHoldSeconds: null, cuesThumbnail: null, videoUrl: null },
      { id: "ex2", name: "Sit to Stand", bodyRegion: "LOWER_BODY", difficultyLevel: "BEGINNER", equipmentRequired: [], contraindications: [], description: null, musclesTargeted: ["quads"], exercisePhases: ["STRENGTHENING"], commonMistakes: null, defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null, cuesThumbnail: null, videoUrl: null },
      { id: "ex3", name: "Hamstring Stretch", bodyRegion: "FLEXIBILITY", difficultyLevel: "BEGINNER", equipmentRequired: [], contraindications: [], description: null, musclesTargeted: [], exercisePhases: ["COOLDOWN"], commonMistakes: null, defaultSets: 1, defaultReps: null, defaultHoldSeconds: 30, cuesThumbnail: null, videoUrl: null },
    ]),
  };
});

import { streamObject, generateObject } from "ai";
import { buildExercisePoolForWeek, type ExercisePoolItem } from "@/lib/services/ai.service";
import { generateProgramEvents, type GenerationEvent } from "@/lib/services/program-generation.service";

const mockStreamObject = vi.mocked(streamObject);
const mockGenerateObject = vi.mocked(generateObject);
const mockBuildPool = vi.mocked(buildExercisePoolForWeek);

function poolItem(id: string, phase: string, region = "FULL_BODY"): ExercisePoolItem {
  return {
    id, name: id, bodyRegion: region, difficultyLevel: "BEGINNER",
    equipmentRequired: [], contraindications: [], description: null,
    musclesTargeted: [], exercisePhases: [phase], commonMistakes: null,
    defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null,
    cuesThumbnail: null, videoUrl: null,
  };
}

function validWeek(): GeneratedWeek {
  return {
    title: "Test Program",
    description: "A test program",
    sessions: [{ dayOfWeek: 0, name: "Knee Foundations" }],
    exercises: [
      { exerciseId: "ex1", exerciseName: "Warmup March", phase: "WARMUP", circuitIndex: null, sets: 1, reps: 10, durationSeconds: null, restSeconds: null, dayOfWeek: 0, orderIndex: 0, notes: null },
      { exerciseId: "ex2", exerciseName: "Sit to Stand", phase: "STRENGTHENING", circuitIndex: null, sets: 3, reps: 10, durationSeconds: null, restSeconds: 45, dayOfWeek: 0, orderIndex: 1, notes: null },
      { exerciseId: "ex3", exerciseName: "Hamstring Stretch", phase: "COOLDOWN", circuitIndex: null, sets: 1, reps: null, durationSeconds: 30, restSeconds: null, dayOfWeek: 0, orderIndex: 2, notes: null },
    ],
  };
}

function stubStreamObjectOnce(finalObject: GeneratedWeek) {
  // Minimal stand-in for the AI SDK's streamObject result
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockStreamObject.mockReturnValueOnce({
    partialObjectStream: (async function* () {
      yield { sessions: finalObject.sessions };
      yield finalObject;
    })(),
    object: Promise.resolve(finalObject),
  } as any);
}

const baseParams = {
  clientId: "client-1",
  durationMinutes: 30,
  daysPerWeek: 1,
  difficultyLevel: "BEGINNER",
  preferredWeekdays: ["monday"],
  exercisesPerSession: 3,
  weekPlan: [
    { week: 1, title: "Foundations", rehabStage: "EARLY_REHAB" as const, focusAreas: ["LOWER_BODY"], difficultyLevel: "BEGINNER" as const, clinicalGuidance: "Gentle activation", contraindicationsThisWeek: [], progressionGoal: "Tolerance", derivedIndicationTags: ["knee"] },
  ],
};

async function collect(gen: AsyncGenerator<GenerationEvent>): Promise<GenerationEvent[]> {
  const events: GenerationEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

beforeEach(() => {
  mockStreamObject.mockReset();
});

describe("generateProgramEvents", () => {
  it("emits start → week_start → partials → ready → done for a clean week", async () => {
    stubStreamObjectOnce(validWeek());
    const events = await collect(generateProgramEvents(baseParams));
    const types = events.map((e) => e.type);

    expect(types[0]).toBe("start");
    expect(types).toContain("week_start");
    expect(types).toContain("week_partial");
    expect(types).toContain("week_status");
    expect(types[types.length - 1]).toBe("done");

    const done = events[events.length - 1] as Extract<GenerationEvent, { type: "done" }>;
    expect(done.plan.title).toBe("Test Program");
    expect(done.plan.exercises).toHaveLength(3);
    expect(done.plan.exercises.every((e) => e.weekIndex === 0)).toBe(true);
    expect(done.unfilled).toEqual([]);
  });

  it("infers regime from the client profile when not provided", async () => {
    stubStreamObjectOnce(validWeek());
    await collect(generateProgramEvents(baseParams));
    // regimeSignals mock has a diagnosis and no goals → rehab prompt
    const call = mockStreamObject.mock.calls[0][0];
    expect(String(call.system)).toMatch(/Doctor of Physical Therapy/);
  });

  it("uses the explicit regime override when provided", async () => {
    stubStreamObjectOnce(validWeek());
    await collect(generateProgramEvents({ ...baseParams, regime: "performance" }));
    const call = mockStreamObject.mock.calls[0][0];
    expect(String(call.system)).toMatch(/strength & conditioning coach/);
  });

  it("emits an error event (not a throw) when the model call fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStreamObject.mockReturnValueOnce({
      partialObjectStream: (async function* () {})(),
      object: Promise.reject(new Error("boom")),
    } as any);

    const events = await collect(generateProgramEvents(baseParams));
    const last = events[events.length - 1];
    expect(last.type).toBe("error");
  });

  it("dedups across weeks and repairs a week-2 exercise reused from week 1", async () => {
    // Week 2's pool still surfaces ex2 (used in week 1) so the validator can
    // flag it as a cross-week duplicate; repair swaps it to an unused pool ID.
    mockBuildPool
      .mockResolvedValueOnce([
        poolItem("ex1", "WARMUP"),
        poolItem("ex2", "STRENGTHENING"),
        poolItem("ex3", "COOLDOWN"),
      ])
      .mockResolvedValueOnce([
        poolItem("ex2", "STRENGTHENING"),
        poolItem("ex4", "WARMUP"),
        poolItem("ex5", "STRENGTHENING"),
        poolItem("ex6", "COOLDOWN"),
      ]);

    // Week 2 reuses ex2 (a week-1 ID) alongside otherwise-valid ex4/ex6.
    const week2: GeneratedWeek = {
      title: null,
      description: null,
      sessions: [{ dayOfWeek: 0, name: "Progression" }],
      exercises: [
        { exerciseId: "ex4", exerciseName: "ex4", phase: "WARMUP", circuitIndex: null, sets: 1, reps: 10, durationSeconds: null, restSeconds: null, dayOfWeek: 0, orderIndex: 0, notes: null },
        { exerciseId: "ex2", exerciseName: "ex2", phase: "STRENGTHENING", circuitIndex: null, sets: 3, reps: 10, durationSeconds: null, restSeconds: 45, dayOfWeek: 0, orderIndex: 1, notes: null },
        { exerciseId: "ex6", exerciseName: "ex6", phase: "COOLDOWN", circuitIndex: null, sets: 1, reps: null, durationSeconds: 30, restSeconds: null, dayOfWeek: 0, orderIndex: 2, notes: null },
      ],
    };

    stubStreamObjectOnce(validWeek()); // week 1: ex1/ex2/ex3
    stubStreamObjectOnce(week2);

    // Repair call swaps the duplicate ex2 (exerciseIndex 1) to unused ex5.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        replacements: [
          { exerciseIndex: 1, exerciseId: "ex5", exerciseName: "ex5", sets: 3, reps: 10, durationSeconds: null, restSeconds: 45 },
        ],
      },
    } as any);

    const twoWeekParams = {
      ...baseParams,
      durationWeeks: 2,
      weekPlan: [
        baseParams.weekPlan[0],
        { week: 2, title: "Progression", rehabStage: "MID_REHAB" as const, focusAreas: ["LOWER_BODY"], difficultyLevel: "BEGINNER" as const, clinicalGuidance: "Progress load", contraindicationsThisWeek: [], progressionGoal: "Strength", derivedIndicationTags: ["knee"] },
      ],
    };

    const events = await collect(generateProgramEvents(twoWeekParams));

    // (a) week 2's pool build received week 1's IDs as usedIds.
    const secondPoolCall = mockBuildPool.mock.calls[1];
    const usedIdsArg = secondPoolCall[1] as Set<string>;
    expect(usedIdsArg.has("ex1")).toBe(true);
    expect(usedIdsArg.has("ex2")).toBe(true);
    expect(usedIdsArg.has("ex3")).toBe(true);

    // (b) a "repairing" status was emitted for week 2 (weekIndex 1).
    expect(events).toContainEqual(
      expect.objectContaining({ type: "week_status", weekIndex: 1, status: "repairing" })
    );

    // (c) the final plan has no exerciseId used in more than one week.
    const done = events[events.length - 1] as Extract<GenerationEvent, { type: "done" }>;
    expect(done.type).toBe("done");
    const ids = done.plan.exercises.map((e) => e.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("ex5");
    expect(ids.filter((id) => id === "ex2")).toHaveLength(1);
  });
});
