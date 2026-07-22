import { z } from "zod";

/** Which programming rulebook applies. Shared by prompts, validation and the pipeline. */
export type Regime = "rehab" | "performance" | "hybrid";

export const generatedWeekExerciseSchema = z.object({
  exerciseId: z
    .string()
    .describe("The exact ID of an exercise from the provided pool. Never invent IDs."),
  exerciseName: z.string().describe("The exercise's name, copied from the pool."),
  phase: z
    .enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"])
    .describe("The session phase this exercise belongs to."),
  circuitIndex: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe("0-based circuit number, or null when no circuit structure was requested."),
  sets: z.number().int().min(1).max(10),
  reps: z.number().int().min(1).max(100).nullable(),
  durationSeconds: z
    .number()
    .int()
    .min(5)
    .max(600)
    .nullable()
    .describe("For timed holds instead of reps; null when reps are used."),
  restSeconds: z.number().int().min(0).max(600).nullable(),
  dayOfWeek: z.number().int().min(0).max(6),
  orderIndex: z.number().int().min(0),
  notes: z.string().nullable().describe("1-2 specific technique cues, or null."),
});

export const generatedWeekSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe("Program title — set for week 1; null for later weeks."),
  description: z
    .string()
    .nullable()
    .describe("2-3 sentence program description — set for week 1; null for later weeks."),
  sessions: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      name: z.string().describe("Session name reflecting this session's actual focus."),
    })
  ),
  exercises: z.array(generatedWeekExerciseSchema),
});

export type GeneratedWeekExercise = z.infer<typeof generatedWeekExerciseSchema>;
export type GeneratedWeek = z.infer<typeof generatedWeekSchema>;
